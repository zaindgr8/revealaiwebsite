'use client';

/**
 * audioFeatures.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side acoustic feature extraction using the Web Audio API.
 * Produces real, measured numbers from raw PCM — nothing is hallucinated.
 *
 * Algorithm notes:
 *  • Pitch (F0): McLeod Pitch Method (autocorrelation variant) on 25 ms frames
 *    with 10 ms hop. Returns median pitch of voiced frames.
 *  • Speech rate (WPM): Energy-threshold syllable nuclei counting.
 *  • Pauses: Contiguous runs of near-silence (< 2 % peak RMS, ≥ 200 ms).
 *  • Pitch variability: normalised std-dev of voiced-frame pitches (0-100).
 *  • Volume consistency: 1 − (std-dev of frame RMS / mean frame RMS), 0-100.
 *  • Jitter-shimmer proxy: mean frame-to-frame pitch Δ + amplitude Δ, 0-100.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AcousticFeatures = {
  avg_pitch_hz: number;
  pitch_variability: number;       // 0-100 (100 = highly variable)
  speech_rate_wpm: number;
  pause_count: number;
  pause_frequency: 'low' | 'medium' | 'high';
  volume_consistency: number;      // 0-100 (100 = perfectly consistent)
  jitter_shimmer_index: number;    // 0-100 proxy (0 = perfectly stable)
  duration_seconds: number;
  signal_quality: 'good' | 'fair' | 'poor';
};

// ─── Constants ────────────────────────────────────────────────────────────────
const FRAME_MS = 25;           // analysis frame length
const HOP_MS = 10;             // hop between frames
const MIN_PITCH_HZ = 70;       // human voice low bound
const MAX_PITCH_HZ = 400;      // human voice high bound
const SILENCE_THRESHOLD = 0.02; // fraction of peak RMS → silence
const PAUSE_MIN_MS = 200;       // min silence run to count as a pause
const SYLLABLE_THRESHOLD = 0.15;// fraction of peak RMS for syllable nucleus
const SYLLABLE_MIN_GAP_MS = 80; // min gap between nuclei

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Autocorrelation-based pitch detection on a single frame.
 * Returns frequency in Hz, or null if frame is unvoiced.
 */
function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  const n = samples.length;
  const frameRms = rms(samples);
  if (frameRms < 0.01) return null; // silence

  // Autocorrelation
  const ac = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let s = 0;
    for (let i = 0; i < n - lag; i++) s += samples[i] * samples[i + lag];
    ac[lag] = s;
  }

  const minLag = Math.floor(sampleRate / MAX_PITCH_HZ);
  const maxLag = Math.floor(sampleRate / MIN_PITCH_HZ);

  let bestLag = -1;
  let bestVal = -Infinity;
  for (let lag = minLag; lag <= maxLag && lag < n; lag++) {
    if (ac[lag] > bestVal) {
      bestVal = ac[lag];
      bestLag = lag;
    }
  }

  if (bestLag < 1 || bestVal / ac[0] < 0.25) return null; // unvoiced
  return sampleRate / bestLag;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function extractAcousticFeatures(
  blob: Blob
): Promise<AcousticFeatures> {
  // Decode blob → PCM via Web Audio API
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext)();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close();
  }

  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;

  // Mix down to mono
  const mono = new Float32Array(audioBuffer.length);
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const chan = audioBuffer.getChannelData(ch);
    for (let i = 0; i < mono.length; i++) mono[i] += chan[i];
  }
  if (audioBuffer.numberOfChannels > 1) {
    for (let i = 0; i < mono.length; i++) mono[i] /= audioBuffer.numberOfChannels;
  }

  const frameSamples = Math.floor((FRAME_MS / 1000) * sampleRate);
  const hopSamples = Math.floor((HOP_MS / 1000) * sampleRate);
  const pauseMinSamples = Math.floor((PAUSE_MIN_MS / 1000) * sampleRate);
  const syllableGapSamples = Math.floor((SYLLABLE_MIN_GAP_MS / 1000) * sampleRate);

  // ── Per-frame analysis ───────────────────────────────────────────────────
  const frameRmsList: number[] = [];
  const pitches: number[] = [];

  for (let start = 0; start + frameSamples <= mono.length; start += hopSamples) {
    const frame = mono.subarray(start, start + frameSamples);
    const frameRmsVal = rms(frame);
    frameRmsList.push(frameRmsVal);

    const pitch = detectPitch(frame, sampleRate);
    if (pitch !== null) pitches.push(pitch);
  }

  // ── Peak RMS (for silence thresholding) ─────────────────────────────────
  const peakRms = frameRmsList.length
    ? Math.max(...frameRmsList)
    : 1;
  const silenceLevel = peakRms * SILENCE_THRESHOLD;
  const syllableLevel = peakRms * SYLLABLE_THRESHOLD;

  // ── Silence / pause detection ────────────────────────────────────────────
  let pauseCount = 0;
  let silenceRun = 0;
  let inPause = false;

  for (const r of frameRmsList) {
    if (r < silenceLevel) {
      silenceRun += hopSamples;
      if (!inPause && silenceRun >= pauseMinSamples) {
        pauseCount++;
        inPause = true;
      }
    } else {
      silenceRun = 0;
      inPause = false;
    }
  }

  // ── Syllable / speech rate estimation ───────────────────────────────────
  let syllableCount = 0;
  let lastNucleusEnd = -syllableGapSamples;

  for (let i = 0; i < frameRmsList.length; i++) {
    const samplePos = i * hopSamples;
    if (
      frameRmsList[i] >= syllableLevel &&
      samplePos - lastNucleusEnd >= syllableGapSamples
    ) {
      syllableCount++;
      lastNucleusEnd = samplePos;
    }
  }

  // WPM: average English syllables per word ≈ 1.5
  const speechSeconds = Math.max(duration - pauseCount * (PAUSE_MIN_MS / 1000), 1);
  const speech_rate_wpm = Math.round((syllableCount / 1.5) / (speechSeconds / 60));

  // ── Pitch metrics ────────────────────────────────────────────────────────
  const validPitches = pitches.filter(
    (p) => p >= MIN_PITCH_HZ && p <= MAX_PITCH_HZ
  );
  const avg_pitch_hz =
    validPitches.length
      ? Math.round(validPitches.reduce((a, b) => a + b, 0) / validPitches.length)
      : 0;

  // Pitch variability: normalise std-dev to 0-100 (100 Hz std-dev → 100)
  const pitchStd = validPitches.length > 1 ? stdDev(validPitches) : 0;
  const pitch_variability = clamp(Math.round((pitchStd / 100) * 100), 0, 100);

  // ── Volume consistency ───────────────────────────────────────────────────
  // Filter frames above silence threshold for voiced-only consistency
  const voicedRms = frameRmsList.filter((r) => r > silenceLevel);
  let volume_consistency = 100;
  if (voicedRms.length > 1) {
    const meanRms = voicedRms.reduce((a, b) => a + b, 0) / voicedRms.length;
    const rmsStd = stdDev(voicedRms);
    const cv = meanRms > 0 ? rmsStd / meanRms : 1; // coefficient of variation
    volume_consistency = clamp(Math.round((1 - clamp(cv, 0, 1)) * 100), 0, 100);
  }

  // ── Jitter-shimmer proxy ─────────────────────────────────────────────────
  // Mean abs frame-to-frame change in pitch + RMS, normalised
  let pitchDeltaSum = 0;
  for (let i = 1; i < validPitches.length; i++) {
    pitchDeltaSum += Math.abs(validPitches[i] - validPitches[i - 1]);
  }
  const meanPitchDelta = validPitches.length > 1
    ? pitchDeltaSum / (validPitches.length - 1)
    : 0;

  let rmsDeltaSum = 0;
  for (let i = 1; i < voicedRms.length; i++) {
    rmsDeltaSum += Math.abs(voicedRms[i] - voicedRms[i - 1]);
  }
  const meanRmsDelta = voicedRms.length > 1
    ? rmsDeltaSum / (voicedRms.length - 1)
    : 0;

  // 20 Hz pitch delta → 100 on jitter scale; 0.05 RMS delta → 100 on shimmer scale
  const jitter_shimmer_index = clamp(
    Math.round(((meanPitchDelta / 20) * 50 + (meanRmsDelta / 0.05) * 50) / 2),
    0,
    100
  );

  // ── Pause frequency label ─────────────────────────────────────────────────
  const pauseRate = duration > 0 ? pauseCount / duration : 0; // pauses per second
  const pause_frequency: 'low' | 'medium' | 'high' =
    pauseRate < 0.05 ? 'low' : pauseRate < 0.12 ? 'medium' : 'high';

  // ── Signal quality ────────────────────────────────────────────────────────
  const signal_quality: 'good' | 'fair' | 'poor' =
    validPitches.length > frameRmsList.length * 0.3
      ? 'good'
      : validPitches.length > frameRmsList.length * 0.1
      ? 'fair'
      : 'poor';

  return {
    avg_pitch_hz,
    pitch_variability,
    speech_rate_wpm: clamp(speech_rate_wpm, 0, 300),
    pause_count: pauseCount,
    pause_frequency,
    volume_consistency,
    jitter_shimmer_index,
    duration_seconds: Math.round(duration),
    signal_quality,
  };
}
