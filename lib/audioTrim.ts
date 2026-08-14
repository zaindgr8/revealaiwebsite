'use client';

/**
 * Derives the speaker reference clip from a stored enrollment sample.
 *
 * THE MISMATCH THIS EXISTS TO FIX
 *
 * I-1 requires the enrollment sample to be at least 10 seconds. OpenAI's
 * known_speaker_references[] requires each reference to be 2-10 seconds. Those
 * two constraints only overlap in a narrow band, and a 25-second sample — which
 * the recorder happily allows — is outside it.
 *
 * WHY THIS RUNS IN THE BROWSER
 *
 * Trimming has to happen somewhere. The server is the wrong place: Vercel's
 * serverless runtime has no ffmpeg, and decoding webm/opus in pure JS to trim
 * it there would be a lot of machinery for something the browser does natively.
 * decodeAudioData already handles webm, opus, mp4 and wav.
 *
 * It also only needs doing once per enrollment, rather than on every single
 * transcription request.
 *
 * WHY WAV OUT
 *
 * The reference is re-encoded as 16-bit PCM WAV. It is small at these lengths,
 * every provider accepts it, and it sidesteps the question of whether a
 * mid-stream slice of a compressed container is still decodable.
 */

/** Target length for the derived clip. Comfortably inside OpenAI's 2-10s window. */
export const REFERENCE_SECONDS = 8;

/**
 * Skipped at the start when searching for the best window.
 *
 * The first moment of a recording is reliably the worst: the click of the
 * button, a breath, the pause before someone starts talking. Using it as a
 * voiceprint means matching against near-silence.
 */
const LEAD_IN_SKIP_SECONDS = 0.5;

/** Mono, and low enough to keep the clip small while preserving voice detail. */
export const OUTPUT_SAMPLE_RATE = 16000;

export function decodeContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  return new Ctor();
}

/**
 * Finds the most energetic window of the target length.
 *
 * Loudest is a proxy for "actually speaking". A fixed slice from the start or
 * middle can easily land on a pause, and a reference clip that is half silence
 * matches poorly against a conversation — which shows up later as the wrong
 * speaker being labelled, with nothing on screen explaining why.
 */
function findBestWindow(
  samples: Float32Array,
  sampleRate: number,
  windowSeconds: number
): { startSample: number; endSample: number } {
  const windowLength = Math.floor(windowSeconds * sampleRate);
  if (samples.length <= windowLength) {
    return { startSample: 0, endSample: samples.length };
  }

  const skip = Math.min(Math.floor(LEAD_IN_SKIP_SECONDS * sampleRate), samples.length - windowLength);

  // Energy over 100ms buckets, then a rolling sum across the window. Cheap
  // enough to run on a 30-second buffer without blocking the UI.
  const bucketLength = Math.max(1, Math.floor(sampleRate * 0.1));
  const bucketCount = Math.floor(samples.length / bucketLength);
  const energy = new Float64Array(bucketCount);
  for (let b = 0; b < bucketCount; b++) {
    let sum = 0;
    const start = b * bucketLength;
    for (let i = start; i < start + bucketLength; i++) sum += samples[i] * samples[i];
    energy[b] = sum / bucketLength;
  }

  const bucketsPerWindow = Math.max(1, Math.floor(windowLength / bucketLength));
  const firstBucket = Math.floor(skip / bucketLength);

  let running = 0;
  for (let b = firstBucket; b < Math.min(firstBucket + bucketsPerWindow, bucketCount); b++) {
    running += energy[b];
  }

  let bestScore = running;
  let bestBucket = firstBucket;
  for (let b = firstBucket + 1; b + bucketsPerWindow <= bucketCount; b++) {
    running += energy[b + bucketsPerWindow - 1] - energy[b - 1];
    if (running > bestScore) {
      bestScore = running;
      bestBucket = b;
    }
  }

  const startSample = Math.min(bestBucket * bucketLength, samples.length - windowLength);
  return { startSample, endSample: startSample + windowLength };
}

/** Averages channels to mono. Reference matching does not benefit from stereo. */
export function toMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < buffer.length; i++) out[i] += data[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= buffer.numberOfChannels;
  return out;
}

/** Nearest-neighbour resample. Adequate for a voiceprint reference. */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = samples[Math.floor(i * ratio)];
  return out;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export type ReferenceClip = {
  blob: Blob;
  durationSeconds: number;
  /** Where in the original sample the clip was taken from, for debugging. */
  offsetSeconds: number;
};

/**
 * Produces a 2-10 second WAV reference clip from a full enrollment recording.
 *
 * Throws rather than returning a too-short clip: silently sending a 1-second
 * reference would degrade attribution with no error anywhere, which is exactly
 * the failure mode this whole module exists to prevent.
 */
export async function buildReferenceClip(
  source: Blob,
  targetSeconds = REFERENCE_SECONDS
): Promise<ReferenceClip> {
  const ctx = decodeContext();
  try {
    const decoded = await ctx.decodeAudioData(await source.arrayBuffer());
    const mono = toMono(decoded);
    const { startSample, endSample } = findBestWindow(
      mono,
      decoded.sampleRate,
      targetSeconds
    );

    const slice = mono.slice(startSample, endSample);
    const resampled = resample(slice, decoded.sampleRate, OUTPUT_SAMPLE_RATE);
    const durationSeconds = resampled.length / OUTPUT_SAMPLE_RATE;

    if (durationSeconds < 2) {
      throw new Error(
        `Reference clip would be ${durationSeconds.toFixed(1)}s, below the 2 second minimum. ` +
          'The recording may be too short or mostly silent.'
      );
    }

    return {
      blob: encodeWav(resampled, OUTPUT_SAMPLE_RATE),
      durationSeconds,
      offsetSeconds: startSample / decoded.sampleRate,
    };
  } finally {
    void ctx.close();
  }
}
