/** Read-only integrity probe for the rows that populate user-facing graphs. */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function envFile(): Record<string, string> {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/))
      .filter((match): match is RegExpMatchArray => !!match)
      .map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, '')])
  );
}

const columns = ['mood_score', 'energy', 'stress', 'positivity', 'confidence'] as const;

async function main() {
  const env = envFile();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('Live Supabase credentials are not configured');

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db
    .from('therapy_sessions')
    .select('created_at, mood_score, energy, stress, positivity, confidence')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const invalid = rows.filter((row) =>
    columns.some((column) => {
      const value = Number(row[column]);
      return !Number.isFinite(value) || value < 0 || value > 100;
    })
  );
  if (invalid.length) {
    throw new Error(`${invalid.length} stored graph rows contain scores outside 0–100`);
  }

  console.log(
    JSON.stringify({
      checked_rows: rows.length,
      invalid_rows: invalid.length,
      newest_row: rows[0]?.created_at ?? null,
      oldest_row_in_sample: rows[rows.length - 1]?.created_at ?? null,
      result: 'PASS',
    })
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
