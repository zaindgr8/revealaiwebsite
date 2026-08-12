/**
 * Memory assembly for the chat therapist (PRD T-2).
 *
 * No 'use client' directive: lib/ai.ts is client-only, and this has to be
 * importable from app/api/chat-therapy/route.ts, which runs on the server.
 *
 * The memory is assembled server-side rather than sent up from the browser.
 * The route already verifies the JWT, so it can read the user's own rows
 * directly — and T-2's acceptance ("verified by inspecting the request payload
 * sent to the model") is much easier to satisfy when the block is built in one
 * place instead of stitched together across the client.
 *
 * Output is prose rather than JSON on purpose. The model uses "mood has fallen
 * from 62 to 44 across five check-ins" far more reliably than it uses a nested
 * object, and T-3 asks for replies that reference the trend naturally.
 */

import { MEMORY_USAGE_RULES } from '@/prompts/memory';

export type MoodPoint = {
  created_at: string;
  mood_score: number | null;
  energy: number | null;
  stress: number | null;
  /**
   * The mood word from the check-in — "anxious", "hopeful", and so on.
   *
   * Optional because rows written before the column existed have none, and the
   * route casts query results straight to this type. A missing mode drops the
   * line rather than printing "unknown", for the same reason the whole block is
   * empty for a new user: absent data the model can see invites it to remark on
   * the absence.
   */
  detected_mode?: string | null;
  /** One sentence on what they talked about, written by analyze-mood. */
  transcript_summary?: string | null;
};

/**
 * How many check-in summaries reach the prompt.
 *
 * Deliberately smaller than the five conversations, because the two records are
 * not comparable. Conversations are occasional and substantive, so five of them
 * span weeks of distinct events. Check-ins are daily, so five of those can be
 * five consecutive mornings of "talked about work stress" — paraphrases of each
 * other that cost prompt length and add nothing.
 *
 * The long view is already covered numerically: all 14 check-ins still feed the
 * mood sequence, the weekly averages and the trend. These lines add topic, and
 * topic goes stale quickly. Something raised twelve days ago is either still
 * live, in which case it appears in the recent ones too, or it is finished and
 * bringing it up is the intrusiveness problem rather than memory.
 */
export const CHECKIN_SUMMARY_COUNT = 3;

export type PastSession = {
  created_at: string;
  summary: string | null;
  mood_score: number | null;
  topics: string[] | null;
};

export type ChatMemoryInput = {
  /** Finished chat sessions, newest first. T-2 asks for the five most recent. */
  recentSessions: PastSession[];
  /** Voice check-ins, newest first. Supplies the mood trend. */
  moodPoints: MoodPoint[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** "today" / "yesterday" / "3 days ago" — the model reasons about these better than dates. */
export function relativeDay(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThen = new Date(then);
  startOfThen.setHours(0, 0, 0, 0);

  const days = Math.round((startOfToday.getTime() - startOfThen.getTime()) / DAY_MS);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'about a week ago';
  if (days < 31) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function avg(values: number[]): number | null {
  const clean = values.filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  if (clean.length === 0) return null;
  return Math.round(clean.reduce((s, n) => s + n, 0) / clean.length);
}

export type TrendDirection = 'declining' | 'improving' | 'steady' | 'unknown';

/**
 * Compares the older half of the window against the newer half.
 *
 * The 8-point threshold matches the burnout rules already in lib/ai.ts, so the
 * chat and the early-warning system do not disagree with each other about
 * whether someone is declining.
 */
export function moodTrendDirection(points: MoodPoint[]): TrendDirection {
  const scores = points
    .map((p) => p.mood_score)
    .filter((n): n is number => typeof n === 'number');
  if (scores.length < 3) return 'unknown';

  // points arrive newest-first; flip so the halves read chronologically
  const chronological = [...scores].reverse();
  const half = Math.floor(chronological.length / 2);
  const older = avg(chronological.slice(0, half));
  const newer = avg(chronological.slice(chronological.length - half));
  if (older === null || newer === null) return 'unknown';

  if (newer <= older - 8) return 'declining';
  if (newer >= older + 8) return 'improving';
  return 'steady';
}

/**
 * Builds the block injected into the system prompt.
 *
 * Returns an empty string for a genuinely new user. That matters: an empty
 * block is better than a block full of "unknown", which reads to the model as
 * something worth remarking on and produces replies about the absence of data.
 */
export function buildMemoryBlock(
  { recentSessions, moodPoints }: ChatMemoryInput,
  now = Date.now()
): string {
  const lines: string[] = [];

  const scores = moodPoints
    .map((p) => p.mood_score)
    .filter((n): n is number => typeof n === 'number');

  if (scores.length > 0) {
    const direction = moodTrendDirection(moodPoints);
    const chronological = [...scores].reverse().slice(-7);

    lines.push('Their recent check-ins:');
    lines.push(`- Mood, oldest to newest: ${chronological.join(', ')}`);

    const week = moodPoints.slice(0, 7);
    const avgMood = avg(week.map((p) => p.mood_score ?? NaN));
    const avgEnergy = avg(week.map((p) => p.energy ?? NaN));
    const avgStress = avg(week.map((p) => p.stress ?? NaN));
    const parts: string[] = [];
    if (avgMood !== null) parts.push(`mood ${avgMood}`);
    if (avgEnergy !== null) parts.push(`energy ${avgEnergy}`);
    if (avgStress !== null) parts.push(`stress ${avgStress}`);
    if (parts.length > 0) lines.push(`- Averages this week: ${parts.join(', ')}`);

    // The mood word from the newest check-in. This used to reach the prompt as
    // a client-supplied `context` payload, captured once when the chat page
    // mounted and then repeated unchanged on every message — so the model was
    // told "anxious" for a whole conversation in which the person had visibly
    // moved on. Read here it is server-side, RLS-scoped, and refreshed on each
    // message, which is the point of assembling this block in one place.
    //
    // Phrased about the person, not about the record, and that wording is load
    // bearing. The first version read "Their most recent check-in sounded
    // anxious, today" and the model handed the noun straight back: "today's
    // check-in felt particularly anxious" — a sentence about a database row,
    // which is the exact failure the rules below spend twenty lines banning.
    //
    // A model cannot quote a word that is not in front of it, so the fix is to
    // remove the word rather than add a fourth prohibition. Deletion is
    // reliable; prohibitions are probabilistic, cost prompt length, and compete
    // for attention with the three worked examples already there. Worded this
    // way the worst case echo is "you sounded anxious today", which is fine.
    const latest = moodPoints[0];
    if (latest?.detected_mode) {
      const when = relativeDay(latest.created_at, now);
      lines.push(
        `- ${when.charAt(0).toUpperCase()}${when.slice(1)} they sounded ${latest.detected_mode}.`
      );
    }

    if (direction !== 'unknown' && direction !== 'steady') {
      lines.push(`- Their mood is ${direction}.`);
    }
  }

  // What they actually said in recent check-ins.
  //
  // Without this the memory was lopsided: full written summaries of every past
  // conversation, but from the check-ins — the place a person speaks freely for
  // sixty seconds — nothing but a score and a mood word. The therapist could
  // say someone had sounded heavier all week while having no idea they had
  // mentioned their father was ill.
  //
  // The heading is doing real work. A check-in is recorded alone; a
  // conversation is a dialogue with Elena. Under one heading the model will say
  // "we talked about your sister" about a solo recording, which is a factual
  // error the person catches immediately — and it is exactly the failure this
  // whole block exists to prevent: sounding like it remembers while not
  // actually knowing what happened.
  const spoken = moodPoints
    .filter((p) => p.transcript_summary && p.transcript_summary.trim().length > 0)
    .slice(0, CHECKIN_SUMMARY_COUNT);

  if (spoken.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('What they said in their recent check-ins, recorded on their own:');
    for (const p of spoken) {
      lines.push(`- ${relativeDay(p.created_at, now)}: ${p.transcript_summary!.trim()}`);
    }
  }

  const usable = recentSessions.filter((s) => s.summary && s.summary.trim().length > 0);
  if (usable.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('What you have talked about before:');
    for (const s of usable) {
      const when = relativeDay(s.created_at, now);
      const mood = typeof s.mood_score === 'number' ? `, mood ${s.mood_score}` : '';
      const topics =
        s.topics && s.topics.length > 0 ? ` [${s.topics.join(', ')}]` : '';
      lines.push(`- ${when}${mood}: ${s.summary!.trim()}${topics}`);
    }
  }

  if (lines.length === 0) return '';

  return [
    '',
    '━━ WHAT YOU ALREADY KNOW ABOUT THIS PERSON ━━',
    ...lines,
    '━━ END ━━',
    '',
    MEMORY_USAGE_RULES,
  ].join('\n');
}
