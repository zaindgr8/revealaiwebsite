'use client';

/**
 * audioFeatures.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side acoustic feature extraction using the Web Audio API.
 * Produces real, measured numbers from raw PCM — nothing is hallucinated.
 *
 * Phase 2 additions:
 *  • waveform_envelope: ~500 normalized amplitude samples for canvas rendering
 *  • segment_emotions: per-2s window with energy/pitch/tension + precomputed color
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type SegmentEmotion = {
  t_start: number;   // seconds
  t_end: number;     // seconds
  energy: number;    // 0-100
  pitch_hz: number;  // 0 if unvoiced
  tension: number;   // 0-100 jitter proxy for this window
  color: string;     // precomputed hex
  label: string;     // 'calm' | 'neutral' | 'energised' | 'tense'
};

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
  // Phase 2
  waveform_envelope: number[];     // ~500 values, 0-1 normalized amplitude
  segment_emotions: SegmentEmotion[]; // one per 2s window
};

// ─── Constants ────────────────────────────────────────────────────────────────
const FRAME_MS = 25;
const HOP_MS = 10;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;
const SILENCE_THRESHOLD = 0.02;
const PAUSE_MIN_MS = 200;
const SYLLABLE_THRESHOLD = 0.15;
const SYLLABLE_MIN_GAP_MS = 80;
const ENVELOPE_SAMPLES = 500;     // target resolution for waveform display
const SEGMENT_WINDOW_S = 2;       // seconds per emotion segment

// ─── Emotion color palette ────────────────────────────────────────────────────
const EMOTION_COLORS: Record<string, string> = {
  calm:      '#3B82F6',  // blue
  neutral:   '#8B5CF6',  // purple
  energised: '#F59E0B',  // gold
  tense:     '#EF4444',  // red
};

function classifySegment(energy: number, pitch: number, tension: number): string {
  if (tension > 55) return 'tense';
  if (energy > 65 && pitch > 170) return 'energised';
  if (energy < 35 || pitch === 0) return 'calm';
  return 'neutral';
}

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

function detectPitch(samples: Float32Array, sampleRate: number): number | null {
  const n = samples.length;
  if (rms(samples) < 0.01) return null;

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
    if (ac[lag] > bestVal) { bestVal = ac[lag]; bestLag = lag; }
  }

  if (bestLag < 1 || bestVal / ac[0] < 0.25) return null;
  return sampleRate / bestLag;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function extractAcousticFeatures(
  blob: Blob
): Promise<AcousticFeatures> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

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
  const hopSamples   = Math.floor((HOP_MS / 1000) * sampleRate);
  const pauseMinSamples    = Math.floor((PAUSE_MIN_MS / 1000) * sampleRate);
  const syllableGapSamples = Math.floor((SYLLABLE_MIN_GAP_MS / 1000) * sampleRate);

  // ── Per-frame analysis ───────────────────────────────────────────────────
  const frameRmsList: number[] = [];
  const framePitches: (number | null)[] = [];

  for (let start = 0; start + frameSamples <= mono.length; start += hopSamples) {
    const frame = mono.subarray(start, start + frameSamples);
    frameRmsList.push(rms(frame));
    framePitches.push(detectPitch(frame, sampleRate));
  }

  const peakRms = frameRmsList.length ? Math.max(...frameRmsList) : 1;
  const silenceLevel  = peakRms * SILENCE_THRESHOLD;
  const syllableLevel = peakRms * SYLLABLE_THRESHOLD;

  // ── Pause detection ──────────────────────────────────────────────────────
  let pauseCount = 0;
  let silenceRun = 0;
  let inPause = false;
  for (const r of frameRmsList) {
    if (r < silenceLevel) {
      silenceRun += hopSamples;
      if (!inPause && silenceRun >= pauseMinSamples) { pauseCount++; inPause = true; }
    } else { silenceRun = 0; inPause = false; }
  }

  // ── Syllable / speech rate ───────────────────────────────────────────────
  let syllableCount = 0;
  let lastNucleusEnd = -syllableGapSamples;
  for (let i = 0; i < frameRmsList.length; i++) {
    const samplePos = i * hopSamples;
    if (frameRmsList[i] >= syllableLevel && samplePos - lastNucleusEnd >= syllableGapSamples) {
      syllableCount++;
      lastNucleusEnd = samplePos;
    }
  }

  const speechSeconds = Math.max(duration - pauseCount * (PAUSE_MIN_MS / 1000), 1);
  const speech_rate_wpm = Math.round((syllableCount / 1.5) / (speechSeconds / 60));

  // ── Global pitch metrics ─────────────────────────────────────────────────
  const validPitches = (framePitches.filter(p => p !== null) as number[])
    .filter(p => p >= MIN_PITCH_HZ && p <= MAX_PITCH_HZ);

  const avg_pitch_hz = validPitches.length
    ? Math.round(validPitches.reduce((a, b) => a + b, 0) / validPitches.length)
    : 0;
  const pitchStd = validPitches.length > 1 ? stdDev(validPitches) : 0;
  const pitch_variability = clamp(Math.round((pitchStd / 100) * 100), 0, 100);

  // ── Volume consistency ───────────────────────────────────────────────────
  const voicedRms = frameRmsList.filter(r => r > silenceLevel);
  let volume_consistency = 100;
  if (voicedRms.length > 1) {
    const meanRms = voicedRms.reduce((a, b) => a + b, 0) / voicedRms.length;
    const cv = meanRms > 0 ? stdDev(voicedRms) / meanRms : 1;
    volume_consistency = clamp(Math.round((1 - clamp(cv, 0, 1)) * 100), 0, 100);
  }

  // ── Jitter-shimmer proxy ─────────────────────────────────────────────────
  let pitchDeltaSum = 0;
  for (let i = 1; i < validPitches.length; i++)
    pitchDeltaSum += Math.abs(validPitches[i] - validPitches[i - 1]);
  const meanPitchDelta = validPitches.length > 1 ? pitchDeltaSum / (validPitches.length - 1) : 0;

  let rmsDeltaSum = 0;
  for (let i = 1; i < voicedRms.length; i++)
    rmsDeltaSum += Math.abs(voicedRms[i] - voicedRms[i - 1]);
  const meanRmsDelta = voicedRms.length > 1 ? rmsDeltaSum / (voicedRms.length - 1) : 0;

  const jitter_shimmer_index = clamp(
    Math.round(((meanPitchDelta / 20) * 50 + (meanRmsDelta / 0.05) * 50) / 2),
    0, 100
  );

  // ── Pause frequency label ────────────────────────────────────────────────
  const pauseRate = duration > 0 ? pauseCount / duration : 0;
  const pause_frequency: 'low' | 'medium' | 'high' =
    pauseRate < 0.05 ? 'low' : pauseRate < 0.12 ? 'medium' : 'high';

  // ── Signal quality ────────────────────────────────────────────────────────
  const signal_quality: 'good' | 'fair' | 'poor' =
    validPitches.length > frameRmsList.length * 0.3 ? 'good'
    : validPitches.length > frameRmsList.length * 0.1 ? 'fair'
    : 'poor';

  // ── Phase 2: Waveform envelope ────────────────────────────────────────────
  // Downsample RMS list to ENVELOPE_SAMPLES points, normalised 0-1
  const waveform_envelope: number[] = [];
  const step = frameRmsList.length / ENVELOPE_SAMPLES;
  for (let i = 0; i < ENVELOPE_SAMPLES; i++) {
    const idx = Math.min(frameRmsList.length - 1, Math.floor(i * step));
    waveform_envelope.push(peakRms > 0 ? clamp(frameRmsList[idx] / peakRms, 0, 1) : 0);
  }

  // ── Phase 2: Per-segment emotion ──────────────────────────────────────────
  const segmentWindowFrames = Math.floor((SEGMENT_WINDOW_S * 1000 / HOP_MS));
  const segment_emotions: SegmentEmotion[] = [];
  const totalFrames = frameRmsList.length;

  for (let seg = 0; seg * segmentWindowFrames < totalFrames; seg++) {
    const fStart = seg * segmentWindowFrames;
    const fEnd   = Math.min(totalFrames, fStart + segmentWindowFrames);

    // Energy: mean RMS in window normalised to 0-100
    const segRms = frameRmsList.slice(fStart, fEnd);
    const segMeanRms = segRms.reduce((a, b) => a + b, 0) / segRms.length;
    const energy = clamp(Math.round((segMeanRms / peakRms) * 100), 0, 100);

    // Pitch: mean of voiced frames in window
    const segPitches = framePitches.slice(fStart, fEnd)
      .filter((p): p is number => p !== null && p >= MIN_PITCH_HZ && p <= MAX_PITCH_HZ);
    const pitch_hz = segPitches.length
      ? Math.round(segPitches.reduce((a, b) => a + b, 0) / segPitches.length)
      : 0;

    // Tension: frame-to-frame RMS delta in window, normalised
    let segRmsDelta = 0;
    for (let i = fStart + 1; i < fEnd; i++)
      segRmsDelta += Math.abs(frameRmsList[i] - frameRmsList[i - 1]);
    const segMeanRmsDelta = fEnd > fStart + 1 ? segRmsDelta / (fEnd - fStart - 1) : 0;
    const tension = clamp(Math.round((segMeanRmsDelta / 0.05) * 100), 0, 100);

    const label = classifySegment(energy, pitch_hz, tension);

    segment_emotions.push({
      t_start: seg * SEGMENT_WINDOW_S,
      t_end:   Math.min(duration, (seg + 1) * SEGMENT_WINDOW_S),
      energy,
      pitch_hz,
      tension,
      color: EMOTION_COLORS[label],
      label,
    });
  }

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
    waveform_envelope,
    segment_emotions,
  };
}
