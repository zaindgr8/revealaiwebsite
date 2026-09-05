import assert from 'node:assert/strict';
import { test } from 'node:test';
import { score, transcriptSpeechRate, validateAnalysis } from '../lib/mood-analysis.ts';

const valid = () => ({
  analysis_status: 'ok', transcript: 'I feel calm and relaxed today.',
  mood_score: 75, energy_level: 60, stress_level: 0, positivity: 75, confidence: 70,
  detected_mode: 'calm', narrative_type: 'present', vocal_summary: 'Your delivery sounds even.',
  transcript_summary: 'You described feeling relaxed.', ai_insight: 'You described a calm day.',
  todays_action: 'Make time for the activity you enjoyed.', recommendations: ['Repeat the activity you enjoyed.'],
  readiness_score: null, readiness_note: null,
});

test('zero scores stay zero; finite valid scores are rounded', () => {
  assert.equal(validateAnalysis(valid()).stress_level, 0);
  assert.equal(score(74.7, 'mood'), 75);
  for (const input of [null, undefined, '', '50', NaN, Infinity, -1, 101]) {
    assert.throws(() => score(input, 'mood'));
  }
});

test('unscorable recordings never produce chartable scores', () => {
  for (const analysis_status of ['insufficient_audio', 'unknown']) {
    assert.throws(() => validateAnalysis({ ...valid(), analysis_status }));
  }
  assert.throws(() => validateAnalysis({ ...valid(), transcript: '' }));
  assert.throws(() => validateAnalysis({ ...valid(), positivity: null }));
  assert.throws(() => validateAnalysis({ ...valid(), recommendations: [42] }));
});

test('readiness only applies to future plans with a valid score', () => {
  assert.equal(validateAnalysis({ ...valid(), readiness_score: 90 }).readiness_score, null);
  assert.equal(validateAnalysis({ ...valid(), narrative_type: 'future', readiness_score: 0 }).readiness_score, 0);
  assert.throws(() => validateAnalysis({ ...valid(), narrative_type: 'future', readiness_score: 150 }));
});

test('speech rate uses spoken words and actual duration, not volume peaks', () => {
  assert.equal(transcriptSpeechRate('one two three four five six', 3), 120);
  assert.equal(transcriptSpeechRate('one two three four five six', 60), 6);
  assert.equal(transcriptSpeechRate('... !!!', 60), 0);
  assert.equal(transcriptSpeechRate('Hello world', 0), 0);
});
