/**
 * Live regression probe for the Reflect result contract.
 *
 * This intentionally uses synthetic text and the real configured Gemini model.
 * It does not create a Supabase row or consume a user's recording.
 */

import { readFileSync } from 'node:fs';
import {
  REFLECT_GEMINI_MODEL,
  SYSTEM_PROMPT,
  ANALYSIS_SCHEMA,
} from '../prompts/checkIn';

function loadApiKey(): string {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const key = /^GEMINI_API_KEY=(.*)$/m
    .exec(env)?.[1]
    ?.trim()
    .replace(/^["']|["']$/g, '');
  if (!key) throw new Error('GEMINI_API_KEY is not configured');
  return key;
}

const QA_TRANSCRIPT = `
Synthetic QA transcript — no real person is speaking:
"I've been trying to act normal all week, but I feel completely exhausted and
confused. Work keeps piling up, I have messages I cannot bring myself to answer,
and every small task feels much heavier than it should. I keep telling people
that I'm only tired, but that is not really the whole truth. When I get home and
everything goes quiet, my thoughts become harder to manage. I have been thinking
about suicide, and tonight I do not feel safe being alone. Part of me wants to
hide this because I do not want anyone to worry or think I am being dramatic.
But another part of me knows I need to say it clearly. I am overwhelmed, I
cannot see a way through this by myself, and I need someone to stay with me
while I work out what to do next."
`;

const QA_ACOUSTICS = `
SYNTHETIC QA ACOUSTIC CONTEXT (treat as measured input):
- Signal quality: good
- Duration: 60 seconds
- Average pitch: 166 Hz
- Pitch variability: 28/100
- Speech rate: 144 WPM
- Pause count: 9
- Pause frequency: high
- Volume consistency: 38/100
- Jitter-shimmer index: 64/100

Copy those values into vocal_metrics. This is a text-only contract probe, so
base the transcript-dependent fields on the synthetic transcript below.
`;

type ReflectProbe = {
  mood_score?: unknown;
  energy_level?: unknown;
  stress_level?: unknown;
  positivity?: unknown;
  confidence?: unknown;
  detected_mode?: unknown;
  recommendations?: unknown;
  todays_action?: unknown;
  ai_insight?: unknown;
};

function parseModelJson(payload: unknown): ReflectProbe {
  const body = payload as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text ?? '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(
      `Gemini returned no JSON (finish=${candidate?.finishReason ?? 'none'}, ` +
        `promptBlock=${body.promptFeedback?.blockReason ?? 'none'})`
    );
  }
  return JSON.parse(match[0]) as ReflectProbe;
}

function assertScore(name: string, value: unknown): number {
  const score = Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error(`${name} is not a valid 0–100 score: ${String(value)}`);
  }
  return score;
}

async function main() {
  const apiKey = loadApiKey();
  const prompt = [
    SYSTEM_PROMPT,
    QA_ACOUSTICS,
    QA_TRANSCRIPT,
  ].join('\n');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${REFLECT_GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: ANALYSIS_SCHEMA,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API ${response.status}: ${await response.text()}`);
  }

  const analysis = parseModelJson(await response.json());
  const scores = {
    mood: assertScore('mood_score', analysis.mood_score),
    energy: assertScore('energy_level', analysis.energy_level),
    stress: assertScore('stress_level', analysis.stress_level),
    positivity: assertScore('positivity', analysis.positivity),
    confidence: assertScore('confidence', analysis.confidence),
  };
  const recommendations = Array.isArray(analysis.recommendations)
    ? analysis.recommendations.filter((item): item is string => typeof item === 'string' && !!item.trim())
    : [];

  if (Object.values(scores).every((score) => score === 50)) {
    throw new Error('Reflect incorrectly returned the all-50 neutral fallback');
  }
  if (String(analysis.detected_mode).toLowerCase() === 'neutral') {
    throw new Error('Reflect incorrectly labelled the synthetic distress transcript neutral');
  }
  if (recommendations.length !== 3) {
    throw new Error(`Expected 3 recommendations, received ${recommendations.length}`);
  }
  if (!String(analysis.todays_action ?? '').trim()) {
    throw new Error('todays_action is empty');
  }
  if (!String(analysis.ai_insight ?? '').trim()) {
    throw new Error('ai_insight is empty');
  }

  console.log(
    JSON.stringify(
      {
        model: REFLECT_GEMINI_MODEL,
        scores,
        detected_mode: analysis.detected_mode,
        recommendation_count: recommendations.length,
        recommendations,
        todays_action: analysis.todays_action,
        result: 'PASS',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
