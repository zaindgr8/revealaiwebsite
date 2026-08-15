'use client';
import {
  OUTPUT_SAMPLE_RATE,
  decodeContext,
  encodeWav,
  resample,
  toMono,
} from './audioTrim';

/**
 * Splits an uploaded conversation into chunks for parallel transcription.
 *
 * The conversation is supplied by the user as a file, not recorded in the app.
 * It still has to be split, because N-4 allows 3 minutes for a 20-minute
 * recording and a single request measured at 0.335x realtime — roughly 6.7
 * minutes. Four chunks in parallel measured at ~2 minutes.
 *
 * WHY THE BROWSER DOES THIS
 *
 * Vercel's serverless runtime has no ffmpeg, so the server cannot split an
 * arbitrary upload. The browser can: decodeAudioData handles mp3, m4a, wav,
 * webm and ogg natively, whatever the user happens to have.
 *
 * WHY IT RE-ENCODES TO WAV
 *
 * A compressed file cannot be cut at an arbitrary point and still decode.
 * Re-encoding to 16 kHz mono PCM produces chunks that are independently valid
 * and is also exactly what speech recognition wants — stereo and high sample
 * rates carry nothing useful here.
 *
 * The cost is size: 20 minutes lands around 38MB against maybe 8MB for the
 * original mp3. That was a real objection when the audio was captured live on
 * a phone at the end of a date. It matters much less for a deliberate upload,
 * which is typically from a desk on wifi.
 */

/**
 * Chunk length for uploads. Imported, not copied.
 *
 * This was a hardcoded 300 with a comment claiming it matched CHUNK_SECONDS.
 * It did when it was written. CHUNK_SECONDS then moved to 180 to pass N-4, and
 * this did not, so from that point every upload was split at 300s while every
 * measurement script split at 180s — the scripts were measuring a chunk length
 * no upload ever used, and reporting it as the product's behaviour.
 *
 * Measured 15 August 2026 on the six-minute recording that failed, same audio
 * and same enrolment reference, chunk length the only variable:
 *
 *   180s chunks ->  7% stray, 60% attributed to the user, 62s   accepted
 *   300s chunks -> 25% stray, 21% attributed to the user, 108s  rejected
 *
 * The user saw 27% and a refusal to analyse. There was nothing wrong with
 * their recording.
 *
 * Longer windows give diarization more room to drift: the same voice heard
 * five minutes apart under a shifting noise floor stops looking like one
 * person, and the invented labels are what stray share counts. The 108s also
 * shows the second cost — fewer, longer chunks parallelise worse, so the N-4
 * fix was not reaching uploads either.
 *
 * Bound to the source of truth so it cannot drift a second time.
 */
export { CHUNK_SECONDS as SPLIT_SECONDS } from './transcription';
import { CHUNK_SECONDS as SPLIT_SECONDS } from './transcription';

/**
 * Upper bound on input length.
 *
 * At 0.335x realtime an hour of audio is ~20 minutes of transcription even
 * chunked, and the cost scales with it. A limit the user is told about beats
 * an upload that appears to work and then stalls.
 */
export const MAX_INPUT_SECONDS = 90 * 60;

/** Anything shorter has too little of each speaker to separate reliably. */
export const MIN_INPUT_SECONDS = 20;

export const ACCEPTED_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'video/mp4',
];

export type AudioChunk = {
  blob: Blob;
  mimeType: 'audio/wav';
  durationSeconds: number;
  offsetSeconds: number;
};

export type SplitResult = {
  chunks: AudioChunk[];
  totalSeconds: number;
  /** Total upload size, so the UI can warn before starting. */
  totalBytes: number;
};

export class AudioSplitError extends Error {}

/**
 * Decodes an uploaded file and cuts it into contiguous WAV chunks.
 *
 * `onProgress` fires per chunk. Encoding 20 minutes takes a few seconds of
 * main-thread work, and a frozen page with no feedback reads as a crash.
 */
export async function splitConversation(
  file: File,
  {
    chunkSeconds = SPLIT_SECONDS,
    onProgress,
  }: { chunkSeconds?: number; onProgress?: (done: number, total: number) => void } = {}
): Promise<SplitResult> {
  const ctx = decodeContext();
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new AudioSplitError(
        'That file could not be read as audio. Try an mp3, m4a, wav or webm file.'
      );
    }

    if (decoded.duration < MIN_INPUT_SECONDS) {
      throw new AudioSplitError(
        `That recording is ${Math.round(decoded.duration)} seconds long. ` +
          `We need at least ${MIN_INPUT_SECONDS} seconds to tell two voices apart.`
      );
    }
    if (decoded.duration > MAX_INPUT_SECONDS) {
      throw new AudioSplitError(
        `That recording is ${Math.round(decoded.duration / 60)} minutes long. ` +
          `The current limit is ${MAX_INPUT_SECONDS / 60} minutes.`
      );
    }

    const mono = resample(toMono(decoded), decoded.sampleRate, OUTPUT_SAMPLE_RATE);
    const samplesPerChunk = Math.floor(chunkSeconds * OUTPUT_SAMPLE_RATE);
    const chunkCount = Math.max(1, Math.ceil(mono.length / samplesPerChunk));

    const chunks: AudioChunk[] = [];
    let totalBytes = 0;

    for (let i = 0; i < chunkCount; i++) {
      const start = i * samplesPerChunk;
      const slice = mono.slice(start, Math.min(start + samplesPerChunk, mono.length));
      const blob = encodeWav(slice, OUTPUT_SAMPLE_RATE);
      totalBytes += blob.size;

      chunks.push({
        blob,
        mimeType: 'audio/wav',
        durationSeconds: slice.length / OUTPUT_SAMPLE_RATE,
        offsetSeconds: start / OUTPUT_SAMPLE_RATE,
      });

      onProgress?.(i + 1, chunkCount);
      // Yields to the event loop so the progress indicator actually paints
      // between chunks rather than all at once when the loop finishes.
      await new Promise((r) => setTimeout(r, 0));
    }

    return { chunks, totalSeconds: decoded.duration, totalBytes };
  } finally {
    void ctx.close();
  }
}

export function looksLikeAudio(file: File): boolean {
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  // Some browsers report an empty or odd type for m4a and ogg; fall back to
  // the extension rather than rejecting a file that would decode fine.
  return /\.(mp3|m4a|mp4|wav|webm|ogg|aac)$/i.test(file.name);
}
