import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side helpers shared by every route that writes a therapy_sessions
 * row: the voice check-in (/api/analyze-mood), the live-call analysis
 * (/api/analyze-call) and the save retry (/api/analyze-mood/save).
 *
 * They live in one place because the routes drifted once already — the model
 * was told to return modes the database rejected, and every check-in that
 * produced one was silently lost.
 */

/**
 * therapy_sessions has a CHECK constraint accepting only 'Slow' | 'Normal' |
 * 'Fast'. Anything else fails the insert outright, so this normalises whatever
 * arrives rather than trusting it.
 */
export function normalisePace(value: unknown): 'Slow' | 'Normal' | 'Fast' {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'slow') return 'Slow';
  if (v === 'fast') return 'Fast';
  return 'Normal';
}

/**
 * Values therapy_sessions.detected_mode will accept (migration 0008).
 * Kept in sync with MODES in lib/mood-analysis.ts.
 */
const ALLOWED_MODES = [
  'calm', 'happy', 'hopeful', 'anxious', 'sad',
  'angry', 'venting', 'reflective', 'neutral', 'motivated',
] as const;

/**
 * Guarantees a storable value. A model returning something outside the enum
 * should cost the user a slightly less precise label, not their whole session.
 */
export function normaliseMode(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if ((ALLOWED_MODES as readonly string[]).includes(v)) return v;
  console.warn(
    `[therapy-session-row] model returned detected_mode "${v}", which the database ` +
      'does not accept. Storing "neutral". Update the prompt schema and the ' +
      'therapy_sessions_detected_mode_check constraint together.'
  );
  return 'neutral';
}

export function normaliseRecommendations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * The product is available outside the US, so a model must not silently insert
 * a US-only crisis number. The escalation UI has the client's verified
 * regional resources; generated prose stays location-neutral.
 */
export function makeCrisisContactLocationSafe(value: string): string {
  return value
    .replace(/\b(?:call|dial|text)\s+(?:the\s+)?988\b/gi, 'contact your local crisis line or emergency services')
    .replace(/\b988\s+(?:Suicide\s*&\s*Crisis\s+)?Lifeline\b/gi, 'your local crisis line or emergency services')
    .replace(/\b(?:National\s+Suicide\s+Prevention|Suicide\s*&\s*Crisis)\s+Lifeline\b/gi, 'your local crisis line or emergency services');
}

/**
 * Columns newer than the table's original shape, with the migration that adds
 * each. Code writes them before every environment has applied the migration.
 */
const OPTIONAL_COLUMNS: Record<string, string> = {
  coach_session_id: '0015_link_call_analysis.sql',
  call_shift: '0016_call_shift.sql',
};

/**
 * Inserts a therapy_sessions row.
 *
 * A missing column makes PostgREST reject the whole row. For the optional
 * columns above that would turn a missing migration into a lost session, so
 * the column is dropped and the insert retried: losing the link or the shift
 * costs a detail, losing the insert costs the user's result.
 */
export async function insertTherapySession(
  db: SupabaseClient,
  row: Record<string, unknown>
): Promise<{ message: string; code?: string } | null> {
  let current = { ...row };
  for (let attempt = 0; attempt <= Object.keys(OPTIONAL_COLUMNS).length; attempt++) {
    const { error } = await db.from('therapy_sessions').insert(current);
    if (!error) return null;

    const missing =
      (error.code === 'PGRST204' || error.code === '42703') &&
      Object.keys(OPTIONAL_COLUMNS).find(
        (column) => column in current && error.message.includes(column)
      );
    if (!missing) return error;

    console.warn(
      `[therapy-session-row] therapy_sessions.${missing} is missing — apply ` +
        `migrations/${OPTIONAL_COLUMNS[missing]}. Saving without it.`
    );
    const { [missing]: dropped, ...rest } = current;
    void dropped;
    current = rest;
  }
  return { message: 'Could not save the session.' };
}
