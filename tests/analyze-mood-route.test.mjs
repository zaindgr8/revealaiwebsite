import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import * as validation from '../lib/mood-analysis.ts';
const require = createRequire(import.meta.url);
const promptSource = ts.transpileModule(readFileSync(new URL('../prompts/checkIn.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const promptExports = {};
vm.runInNewContext(promptSource, { exports: promptExports, require: (id) => id === '@/prompts/checkIn' ? promptExports : id === '@/lib/mood-analysis' ? validation : { GEMINI_TEXT_MODEL: 'configured-model' } });
const source = ts.transpileModule(readFileSync(new URL('../app/api/analyze-mood/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ status = 'ok', dbError = null, authorized = true } = {}) {
  const inserted = [];
  let modelCalls = 0;
  const analysis = {
    analysis_status: status, transcript: 'I am feeling calm and relaxed today.',
    mood_score: 80, energy_level: 60, stress_level: 0, positivity: 80, confidence: 70,
    detected_mode: 'calm', narrative_type: 'present', vocal_summary: 'Your delivery sounds even.',
    transcript_summary: 'You described feeling relaxed.', ai_insight: 'You described a calm day.',
    todays_action: 'Make time for the activity you enjoyed.', recommendations: ['Repeat the activity you enjoyed.'],
    readiness_score: null, readiness_note: null,
  };
  const exports = {};
  vm.runInNewContext(source, {
    exports, process: { env: { GEMINI_API_KEY: 'test', NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
    console: { error() {} },
    require: (id) => id === '@/prompts/checkIn' ? promptExports : id === '@/lib/mood-analysis' ? validation : id === '@supabase/supabase-js' ? {
      createClient: () => ({
        auth: { getUser: async () => ({ data: { user: authorized ? { id: 'user-1' } : null }, error: null }) },
        from: () => ({ insert: async (row) => { inserted.push(row); return { error: dbError }; } }),
      }),
    } : require(id),
    fetch: async () => { modelCalls++; return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] }) }; },
  });
  return { inserted, modelCalls: () => modelCalls, post: () => exports.POST(new Request('http://localhost/api/analyze-mood', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test' },
    body: JSON.stringify({ audio_base64: 'dGVzdA==', mime_type: 'audio/wav', duration_seconds: 60 }),
  })) };
}

test('saved dashboard values equal the returned Reflect result, including zero', async () => {
  const f = fixture(); const response = await f.post(); const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.stress, 0);
  assert.equal(result.saved, true);
  assert.equal(result.ai_model, 'configured-model');
  assert.equal(result.ai_provider, 'gemini');
  assert.equal(result.pace, 'Slow');
  assert.equal(result.vocal_metrics, null);
  assert.equal(f.inserted.length, 1);
  for (const field of ['mood_score', 'energy', 'stress', 'positivity', 'confidence', 'transcript']) {
    assert.equal(f.inserted[0][field], result[field]);
  }
});
test('save errors are not reported as a successful check-in', async () => {
  const f = fixture({ dbError: { message: 'unavailable' } });
  const response = await f.post();
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.saved, false);
  assert.equal(result.save_error, 'unavailable');
  assert.equal(result.mood_score, 80, 'retain the analysis so the existing retry button can save it');
});
test('silent recordings never reach persistence', async () => {
  const f = fixture({ status: 'insufficient_audio' });
  assert.equal((await f.post()).status, 422);
  assert.equal(f.inserted.length, 0);
});
test('authentication is required before inference or storage', async () => {
  const f = fixture({ authorized: false });
  assert.equal((await f.post()).status, 401);
  assert.equal(f.modelCalls(), 0);
  assert.equal(f.inserted.length, 0);
});
