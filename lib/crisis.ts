/**
 * Crisis screening for the chat therapist (PRD T-7, T-8).
 *
 * No 'use client': imported by app/api/chat-therapy/route.ts on the server.
 *
 * T-7 requires every user message to be screened BEFORE a response is
 * generated, so this runs ahead of the therapist call, not alongside it.
 *
 * Design is two-layer on purpose:
 *
 *   1. A model classifier, which is the primary check. It handles context —
 *      the difference between "this job is killing me" and "I want to die".
 *   2. A deterministic net for unambiguous phrasing, which runs when the
 *      classifier fails or times out.
 *
 * Failure behaviour: if the classifier errors, fall back to layer 2 rather
 * than failing closed. Escalating on every API blip would show a crisis screen
 * to people who are fine, which trains them to dismiss it — and a screen users
 * have learned to dismiss protects nobody.
 */

import { CLASSIFIER_PROMPT } from '@/prompts/crisis';

export type CrisisLevel = 'none' | 'concern' | 'crisis';

export type CrisisVerdict = {
  level: CrisisLevel;
  /** True only for 'crisis'. This is what interrupts the conversation. */
  escalate: boolean;
  /** Short rationale, for logs and for verifying against the T-8 test set. */
  reason: string;
  /** Which layer decided, so test runs can tell them apart. */
  source: 'classifier' | 'fallback' | 'classifier-error';
};

/**
 * Support resources shown on escalation.
 *
 * DELIBERATELY EMPTY. Populating this needs real, verified helpline numbers
 * for the user's region, which is PRD decision D-7 and is not answered yet.
 *
 * Guessing a crisis line is worse than showing none: a wrong number reaches
 * someone at the worst possible moment and fails. So this stays empty until
 * the client supplies verified numbers, and the UI is built to handle empty.
 *
 * When D-7 is answered, add entries here. Nothing else needs to change.
 */
export type CrisisResource = {
  region: string;
  name: string;
  contact: string;
  note?: string;
};

export const CRISIS_RESOURCES: CrisisResource[] = [
  // TODO(D-7): awaiting verified UAE crisis line details from the client.
  // Do not populate from memory — these must be confirmed before shipping.
];

export const CRISIS_RESOURCES_PENDING = CRISIS_RESOURCES.length === 0;

/**
 * Message shown alongside the resources. Written to be useful even when the
 * resource list is still empty, so the escalation path is never a dead end.
 */
export const CRISIS_MESSAGE =
  "I'm going to stop here, because what you've said matters more than " +
  'anything else we were talking about.\n\n' +
  "I'm an AI, and I'm not able to give you the kind of help you deserve " +
  'right now. Please reach out to someone who can — your local emergency ' +
  'services, a crisis line, or someone you trust who can be with you.\n\n' +
  "You don't have to explain it well. You just have to tell someone.";

// ─────────────────────────────────────────────────────────────
// Layer 2: deterministic fallback
//
// Only unambiguous first-person statements. Kept deliberately narrow — this
// runs when the classifier is unavailable, and a broad keyword list would fire
// on "this job is killing me" and "I'm dying to see it", which is exactly the
// false-positive class the T-8 test set exists to catch.
// ─────────────────────────────────────────────────────────────

/**
 * Up to two filler words between the pronoun and the verb.
 *
 * People do not write "I don't want to wake up anymore" — they write "I just
 * don't", "I honestly don't", "I really don't". Requiring adjacency made the
 * T-8 test set miss "I just don't want to wake up anymore", which is exactly
 * the passive-ideation phrasing this layer exists to catch.
 */
const FILLER = String.raw`(?:\w+\s+){0,2}`;

const EXPLICIT_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\bi\s+${FILLER}(want|wanna|need)\s+to\s+(die|kill\s+myself|end\s+(it|my\s+life))\b`, 'i'),
  new RegExp(String.raw`\bi(?:'m|\s+am)\s+${FILLER}going\s+to\s+(kill\s+myself|end\s+(it|my\s+life))\b`, 'i'),
  new RegExp(String.raw`\bi(?:'ve|\s+have)\s+been\s+thinking\s+about\s+(killing\s+myself|suicide|ending\s+(it|my\s+life))\b`, 'i'),
  // "anymore" stays required here so "I don't want to live HERE anymore" and
  // "I don't want to be here for this meeting" do not match.
  new RegExp(String.raw`\bi\s+${FILLER}don'?t\s+want\s+to\s+(be\s+here|live|wake\s+up)\s+(any\s?more|anymore)\b`, 'i'),
  new RegExp(String.raw`\bi\s+${FILLER}(want|plan)\s+to\s+hurt\s+myself\b`, 'i'),
  /\b(kill\s+myself|end\s+my\s+life|take\s+my\s+own\s+life)\b/i,
];

export function deterministicCrisisCheck(text: string): CrisisVerdict {
  const hit = EXPLICIT_PATTERNS.find((re) => re.test(text));
  if (hit) {
    return {
      level: 'crisis',
      escalate: true,
      reason: `Matched explicit self-harm phrasing: ${hit.source}`,
      source: 'fallback',
    };
  }
  return {
    level: 'none',
    escalate: false,
    reason: 'No explicit self-harm phrasing detected',
    source: 'fallback',
  };
}

// ─────────────────────────────────────────────────────────────
// Layer 1: model classifier
// ─────────────────────────────────────────────────────────────

const CLASSIFIER_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';


export async function classifyCrisis(
  text: string,
  apiKey: string,
  timeoutMs = 4000
): Promise<CrisisVerdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${CLASSIFIER_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${CLASSIFIER_PROMPT}\n\nMessage:\n${text}` }] }],
        generationConfig: {
          temperature: 0,

          // NO maxOutputTokens. There was a 100-token cap here and it broke the
          // classifier completely: the model preambles ("Here is the JSON…")
          // before emitting anything, hit the ceiling mid-preamble, and
          // returned finishReason MAX_TOKENS with text like "Here is the". The
          // parser found no JSON, threw, and fell back to the regex layer —
          // which by design only catches explicit phrasing.
          //
          // Every subtle case therefore failed silently: passive ideation,
          // stated plans, goodbyes. The full test set went from 0 misses to 6,
          // and the same input could pass or fail between runs depending on how
          // much preamble the model happened to produce.
          //
          // The response schema below bounds the output far more reliably than
          // a token cap ever did. Do not reintroduce one.
          responseSchema: {
            type: 'OBJECT',
            properties: {
              level: { type: 'STRING', enum: ['none', 'concern', 'crisis'] },
              reason: { type: 'STRING' },
            },
            required: ['level', 'reason'],
          },
          responseMimeType: 'application/json',

          // This runs before every single reply, so it sits directly in the
          // latency budget of the conversation. Measured identical accuracy
          // across the whole test set with thinking disabled.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!res.ok) throw new Error(`Classifier HTTP ${res.status}`);

    const json = await res.json();
    const raw: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Classifier returned no parseable JSON');

    const parsed = JSON.parse(match[0]) as { level?: string; reason?: string };
    const level: CrisisLevel =
      parsed.level === 'crisis' ? 'crisis' : parsed.level === 'concern' ? 'concern' : 'none';

    return {
      level,
      escalate: level === 'crisis',
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'no reason given',
      source: 'classifier',
    };
  } catch (err) {
    // Fall back rather than fail closed. The deterministic layer still catches
    // the unambiguous cases, so an outage degrades coverage instead of either
    // blocking everyone or protecting nobody.
    const fallback = deterministicCrisisCheck(text);
    return {
      ...fallback,
      source: 'classifier-error',
      reason: `Classifier unavailable (${(err as Error).message}); fallback: ${fallback.reason}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Runs the deterministic net first so unambiguous phrasing never waits on the network. */
export async function screenMessage(
  text: string,
  apiKey: string | undefined
): Promise<CrisisVerdict> {
  const explicit = deterministicCrisisCheck(text);
  if (explicit.escalate) return explicit;

  if (!apiKey) {
    return {
      ...explicit,
      source: 'classifier-error',
      reason: 'GEMINI_API_KEY not configured; deterministic screening only',
    };
  }

  return classifyCrisis(text, apiKey);
}
