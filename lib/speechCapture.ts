'use client';

/**
 * Keeps the user's own speech from a live call, for the post-call analysis.
 *
 * The call streams 16 kHz PCM to Gemini and keeps nothing. To read tone as
 * well as words, the analysis needs some of that audio back — but only the
 * user's, and not hours of it:
 *
 *  - Frames captured while Freya's audio is playing are dropped. Echo
 *    cancellation is good, not perfect, and her voice in the clip would be
 *    scored as the user's.
 *  - Silence is dropped, keeping a short hangover after speech so words are
 *    not clipped and natural pauses survive.
 *  - Only the most recent MAX_SECONDS are kept. How someone sounds by the end
 *    of a call is what the before → after shift compares with the sample.
 *
 * The result is a WAV, because the samples are already raw PCM and encoding
 * WAV needs no codec. At 16 kHz mono 16-bit, 60 s is ~1.9 MB.
 */

const SAMPLE_RATE = 16000;
const MAX_SECONDS = 60;
const MAX_SAMPLES = SAMPLE_RATE * MAX_SECONDS;
/** RMS above which a 32 ms frame counts as speech. Mic input is gain-controlled. */
const SPEECH_RMS = 0.015;
/** Frames kept after speech stops, ~320 ms, so word endings and short pauses survive. */
const HANGOVER_FRAMES = 10;

export type CapturedSpeech = {
  blob: Blob;
  mimeType: 'audio/wav';
  durationSeconds: number;
};

export class SpeechCapture {
  private frames: Int16Array[] = [];
  private total = 0;
  private hangover = 0;

  reset() {
    this.frames = [];
    this.total = 0;
    this.hangover = 0;
  }

  /** Call once per mic frame with the PCM already converted for the socket. */
  push(pcm16: Int16Array, otherPartySpeaking: boolean) {
    if (otherPartySpeaking) {
      this.hangover = 0;
      return;
    }

    let sum = 0;
    for (let i = 0; i < pcm16.length; i++) {
      const v = pcm16[i] / 0x7fff;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / Math.max(1, pcm16.length));

    if (rms >= SPEECH_RMS) this.hangover = HANGOVER_FRAMES;
    else if (this.hangover > 0) this.hangover -= 1;
    else return;

    // Copy: the caller reuses nothing today, but the buffer is not ours.
    this.frames.push(pcm16.slice());
    this.total += pcm16.length;

    while (this.total > MAX_SAMPLES && this.frames.length > 1) {
      this.total -= this.frames.shift()!.length;
    }
  }

  get seconds() {
    return this.total / SAMPLE_RATE;
  }

  /** Null when there is too little speech to be worth sending. */
  toWav(minSeconds = 4): CapturedSpeech | null {
    if (this.seconds < minSeconds) return null;

    const dataBytes = this.total * 2;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    const writeString = (offset: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataBytes, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataBytes, true);

    let offset = 44;
    for (const frame of this.frames) {
      for (let i = 0; i < frame.length; i++, offset += 2) view.setInt16(offset, frame[i], true);
    }

    return {
      blob: new Blob([buffer], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      durationSeconds: Math.round(this.seconds),
    };
  }
}
