/**
 * Intent Detector analysis (PRD I-5) — the layer that reads a finished
 * transcript and says what it noticed about the other person.
 *
 * Unblocked 14 August 2026 when the client answered D-1: observations, not
 * percentages, and pinned to specific moments rather than written as a general
 * character sketch. See prompts/intent.ts for the wording and the reasoning.
 *
 * WHAT THIS FILE IS ACTUALLY FOR
 *
 * The model call is four lines. Everything else here exists to check the
 * model's answer against the transcript before any of it reaches a screen,
 * because this is the one feature in the product that makes claims about a
 * third party who is not present to correct them.
 *
 * Three things are verified, and a moment that fails any of them is discarded
 * rather than repaired into something plausible:
 *
 *   1. The line it points at exists.
 *   2. That line belongs to the other person, not the user. A finding about the
 *      user's own words is off-brief at best, and at worst it is what a
 *      misattributed segment looks like from the inside.
 *   3. The quote is really in that line. A model that half-remembers a sentence
 *      and tidies it up produces a quote the user cannot find in their own
 *      transcript, which destroys the one property that makes the whole feature
 *      defensible.
 *
 * Losing a finding costs the user one observation. Keeping a bad one costs them
 * their trust in all of the others, so the trade is not close.
 *
 * Nothing here is stored as a score, a percentage, or a rating. That is D-1,
 * and the schema is the part of D-1 that cannot be changed later without
 * rebuilding.
 */

import type { Segment } from '@/lib/transcription';
import { GEMINI_TEXT_MODEL, geminiGenerateContentUrl } from '@/lib/geminiModel';
import type { IntentScenario } from '@/lib/audioStorage';
import { INTENT_SIGNALS, intentAnalysisPrompt, type IntentSignal } from '@/prompts/intent';

export { INTENT_SIGNALS, type IntentSignal };

const GEMINI_URL =
  geminiGenerateContentUrl();
const MODEL = GEMINI_TEXT_MODEL;

/** Bumped if the stored shape changes, so old rows stay readable. */
export const ANALYSIS_VERSION = 1;

/** Below this there is not enough of the other person to say anything about. */
const MIN_OTHER_SEGMENTS = 3;

const MAX_MOMENTS = 8;

/**
 * Gemini 2.5 Flash takes far more than this, but a transcript long enough to
 * approach it is a recording far longer than the 20-minute ceiling and is
 * better refused than silently half-read.
 */
const MAX_TRANSCRIPT_CHARS = 120_000;

/** How alarming a signal looks. Derived here, never asked of the model. */
const SIGNAL_TONE: Record<IntentSignal, 'concern' | 'positive'> = {
  evasive: 'concern',
  guarded: 'concern',
  pressure: 'concern',
  inconsistent: 'concern',
  performing: 'concern',
  engaged: 'positive',
  open: 'positive',
  warm: 'positive',
};

export function signalTone(signal: string): 'concern' | 'positive' | 'neutral' {
  return SIGNAL_TONE[signal as IntentSignal] ?? 'neutral';
}

export type IntentMoment = {
  /** Seconds into the conversation. Taken from the transcript, not the model. */
  at: number;
  /** Verbatim, and verified to exist in the referenced line. */
  quote: string;
  signal: string;
  /** What happened. Descriptive. */
  observation: string;
  /** What it might mean. Hedged. */
  reading: string;
};

export type IntentAnalysis = {
  version: number;
  scenario: IntentScenario;
  overall: string;
  moments: IntentMoment[];
  model: string;
  generated_at: string;
  /**
   * What the checks above threw away. Kept because a run that discards most of
   * the model's answer is a quality signal worth seeing, and without this it
   * looks identical to a quiet conversation.
   */
  diagnostics: {
    returned: number;
    kept: number;
    dropped_unknown_ref: number;
    dropped_own_line: number;
    dropped_quote_not_found: number;
    dropped_duplicate: number;
  };
};

export class IntentAnalysisError extends Error {
  /** True when the transcript itself cannot support an analysis (I-7 territory). */
  readonly insufficient: boolean;
  constructor(message: string, insufficient = false) {
    super(message);
    this.name = 'IntentAnalysisError';
    this.insufficient = insufficient;
  }
}

/**
 * Loose enough to survive the ways ASR output and a model's memory of it drift
 * apart — casing, smart quotes, trailing commas, doubled spaces — and strict
 * enough that an invented sentence still fails to match.
 */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Numbers every line so the model can point at one exactly, instead of
 * reproducing a timestamp it has to get right by arithmetic.
 *
 * Both speakers are included. The rubric only comments on one of them, but a
 * transcript with the user's half removed reads as a monologue, and half of
 * what is worth noticing about an answer is the question that preceded it.
 */
export function formatTranscriptForAnalysis(
  segments: Segment[],
  themLabel: string
): { text: string; refs: Map<number, Segment> } {
  const refs = new Map<number, Segment>();
  const lines: string[] = [];
  let chars = 0;

  segments.forEach((segment, i) => {
    const who = segment.isEnrolled ? 'YOU' : themLabel.toUpperCase();
    const line = `[${i}] ${formatClock(segment.start)} ${who}: ${segment.text.trim()}`;
    chars += line.length + 1;
    if (chars > MAX_TRANSCRIPT_CHARS) return;
    refs.set(i, segment);
    lines.push(line);
  });

  return { text: lines.join('\n'), refs };
}

type RawMoment = {
  ref?: unknown;
  quote?: unknown;
  signal?: unknown;
  observation?: unknown;
  reading?: unknown;
};

function cleanSentence(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : '';
}

/**
 * Turns the model's answer into stored moments, dropping anything it cannot
 * stand behind. Exported so scripts/testIntentAnalysis.ts can exercise it
 * without spending a model call.
 */
export function anchorMoments(
  raw: unknown,
  refs: Map<number, Segment>
): { moments: IntentMoment[]; diagnostics: IntentAnalysis['diagnostics'] } {
  const list = Array.isArray(raw) ? (raw as RawMoment[]) : [];
  const diagnostics = {
    returned: list.length,
    kept: 0,
    dropped_unknown_ref: 0,
    dropped_own_line: 0,
    dropped_quote_not_found: 0,
    dropped_duplicate: 0,
  };

  // One finding per line. Two readings of the same sentence are almost always
  // the same reading twice, and the second one reads as padding.
  const usedRefs = new Set<number>();
  const moments: IntentMoment[] = [];

  for (const item of list) {
    const ref = Number(item?.ref);
    const segment = Number.isInteger(ref) ? refs.get(ref) : undefined;
    if (!segment) {
      diagnostics.dropped_unknown_ref++;
      continue;
    }
    if (segment.isEnrolled) {
      diagnostics.dropped_own_line++;
      continue;
    }
    if (usedRefs.has(ref)) {
      diagnostics.dropped_duplicate++;
      continue;
    }

    const quote = cleanSentence(item?.quote, 240);
    const needle = normalise(quote);
    if (!needle || !normalise(segment.text).includes(needle)) {
      diagnostics.dropped_quote_not_found++;
      continue;
    }

    const observation = cleanSentence(item?.observation, 400);
    const reading = cleanSentence(item?.reading, 400);
    if (!observation && !reading) {
      diagnostics.dropped_quote_not_found++;
      continue;
    }

    const signalRaw = typeof item?.signal === 'string' ? item.signal.trim().toLowerCase() : '';
    // An unrecognised signal is kept but renders untinted, because the finding
    // underneath it has already passed every check that matters. Inventing a
    // rubric entry to hold it would be worse than showing it plainly.
    const signal = (INTENT_SIGNALS as readonly string[]).includes(signalRaw) ? signalRaw : 'noted';

    usedRefs.add(ref);
    moments.push({
      at: segment.start,
      quote,
      signal,
      observation,
      reading,
    });
  }

  // Chronological, because "at this point" is how the client described reading
  // these and how anyone scanning against a recording will use them.
  moments.sort((a, b) => a.at - b.at);
  const kept = moments.slice(0, MAX_MOMENTS);
  diagnostics.kept = kept.length;

  return { moments: kept, diagnostics };
}

export async function analyseConversation({
  apiKey,
  segments,
  scenario,
  themLabel,
}: {
  apiKey: string;
  segments: Segment[];
  scenario: IntentScenario;
  themLabel: string;
}): Promise<IntentAnalysis> {
  const other = segments.filter((s) => !s.isEnrolled);
  if (other.length < MIN_OTHER_SEGMENTS) {
    throw new IntentAnalysisError(
      'There is too little of the other person in this recording to say anything useful about them.',
      true
    );
  }

  const { text, refs } = formatTranscriptForAnalysis(segments, themLabel);
  const prompt = intentAnalysisPrompt(scenario, themLabel);

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\n---\n${text}` }] }],
      // Low, deliberately. The argument for observations over percentages was
      // that the pipeline disagrees with itself between runs; answering that
      // with a high-variance analysis layer would be an odd way to keep the
      // promise. No maxOutputTokens — see prompts/README.md.
      // temperature was 0.2 here. Gemini 3.x ignores it, so the low variance
      // the note above asks for now rests on the prompt and the schema alone.
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new IntentAnalysisError(`Gemini API error ${res.status}: ${detail}`);
  }

  const json = await res.json();
  const body: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const match = body.match(/\{[\s\S]*\}/);
  if (!match) throw new IntentAnalysisError('The analysis came back in a form we could not read.');

  let parsed: { overall?: unknown; moments?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new IntentAnalysisError('The analysis came back in a form we could not read.');
  }

  const { moments, diagnostics } = anchorMoments(parsed.moments, refs);
  const overall = cleanSentence(parsed.overall, 1200);

  // An empty moments list is legitimate — most conversations are unremarkable,
  // and a rubric that always finds something is a rubric that finds things that
  // are not there. An empty analysis with nothing said at all is not.
  if (!overall && moments.length === 0) {
    throw new IntentAnalysisError('The analysis came back empty.');
  }

  return {
    version: ANALYSIS_VERSION,
    scenario,
    overall,
    moments,
    model: MODEL,
    generated_at: new Date().toISOString(),
    diagnostics,
  };
}
