// Shared, pure validation for model output before it reaches charts or storage.
export class AnalysisValidationError extends Error {}

export function score(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new AnalysisValidationError(`The analysis returned an invalid ${field}. Please try again.`);
  }
  return Math.round(value);
}

export function transcriptSpeechRate(transcript: string, duration: number): number {
  // Segmenter also handles languages that do not put spaces between words.
  const words = [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(transcript)]
    .filter((part) => part.isWordLike).length;
  return duration > 0 ? Math.round(words * 60 / duration) : 0;
}

export const MODES = ['calm', 'happy', 'hopeful', 'anxious', 'sad', 'angry', 'venting', 'reflective', 'neutral', 'motivated'];
export const NARRATIVES = ['past', 'present', 'future', 'mixed'];

export function validateAnalysis(analysis: Record<string, unknown>) {
  if (analysis.analysis_status === 'insufficient_audio') {
    throw new AnalysisValidationError('There wasn’t enough clear speech to analyze. Please record again in a quieter place, with the microphone nearby.');
  }
  if (analysis.analysis_status !== 'ok' || typeof analysis.transcript !== 'string' || !analysis.transcript.trim()) {
    throw new AnalysisValidationError('The recording could not be transcribed reliably. Please try again.');
  }
  for (const field of ['mood_score', 'energy_level', 'stress_level', 'positivity', 'confidence']) {
    analysis[field] = score(analysis[field], field);
  }
  if (!MODES.includes(String(analysis.detected_mode)) || !NARRATIVES.includes(String(analysis.narrative_type))) {
    throw new AnalysisValidationError('The analysis returned an incomplete breakdown. Please try again.');
  }
  for (const field of ['vocal_summary', 'transcript_summary', 'ai_insight', 'todays_action']) {
    if (typeof analysis[field] !== 'string' || !analysis[field].trim()) {
      throw new AnalysisValidationError('The analysis returned an incomplete explanation. Please try again.');
    }
  }
  if (!Array.isArray(analysis.recommendations) || !analysis.recommendations.length ||
      !analysis.recommendations.every((item) => typeof item === 'string' && item.trim())) {
    throw new AnalysisValidationError('The analysis returned incomplete recommendations. Please try again.');
  }
  if (['future', 'mixed'].includes(String(analysis.narrative_type)) && analysis.readiness_score != null) {
    analysis.readiness_score = score(analysis.readiness_score, 'readiness_score');
  } else {
    analysis.readiness_score = null;
    analysis.readiness_note = null;
  }
  return analysis;
}
