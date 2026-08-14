/**
 * Runs the T-8 test set against the crisis screening in lib/crisis.ts.
 *
 *   npx tsx scripts/runCrisisTests.ts
 *
 * Without GEMINI_API_KEY only the deterministic fallback is exercised, which
 * is a partial run — the cases marked `deterministic` are the only ones it can
 * be expected to catch. With the key set, the full two-layer path runs and the
 * result is what T-8 is signed off against.
 *
 * Re-run this whenever the classifier prompt or the model version changes.
 * Prompt edits are silent regressions otherwise.
 */

import { readFileSync } from 'node:fs';
import { screenMessage, deterministicCrisisCheck } from '../lib/crisis';
import { CRISIS_TEST_SET, type CrisisTestCase } from '../lib/crisisTestSet';

function loadApiKey(): string | undefined {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    return /^GEMINI_API_KEY=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}

type Result = {
  case: CrisisTestCase;
  actual: string;
  escalated: boolean;
  ok: boolean;
  kind: 'ok' | 'MISS' | 'FALSE_POSITIVE' | 'level_mismatch';
  /** Which layer decided. See the degraded-run check below. */
  source: string;
};

async function main() {
  const apiKey = loadApiKey();
  const full = Boolean(apiKey);

  console.log(
    full
      ? 'Running FULL two-layer screening (classifier + fallback)\n'
      : 'No GEMINI_API_KEY found — running DETERMINISTIC LAYER ONLY.\n' +
          'This is a partial run. Only cases marked `deterministic` can pass.\n'
  );

  const results: Result[] = [];

  for (const c of CRISIS_TEST_SET) {
    const verdict = full
      ? await screenMessage(c.text, apiKey)
      : deterministicCrisisCheck(c.text);

    const shouldEscalate = c.expected === 'crisis';
    let kind: Result['kind'] = 'ok';

    if (shouldEscalate && !verdict.escalate) kind = 'MISS';
    else if (!shouldEscalate && verdict.escalate) kind = 'FALSE_POSITIVE';
    else if (full && verdict.level !== c.expected) kind = 'level_mismatch';

    results.push({
      case: c,
      actual: verdict.level,
      escalated: verdict.escalate,
      ok: kind === 'ok',
      kind,
      source: verdict.source,
    });
  }

  // Grouped by category so a systematic weakness is visible rather than
  // scattered through a flat list.
  const byCategory = new Map<string, Result[]>();
  for (const r of results) {
    const list = byCategory.get(r.case.category) ?? [];
    list.push(r);
    byCategory.set(r.case.category, list);
  }

  for (const [category, list] of byCategory) {
    console.log(`\n${category}`);
    for (const r of list) {
      const expectedOnlyWithClassifier =
        !full && r.case.expected === 'crisis' && !r.case.deterministic;
      const mark = r.ok
        ? '  ok  '
        : expectedOnlyWithClassifier
          ? ' skip '
          : ` ${r.kind} `;
      console.log(
        `  ${mark.padEnd(16)} [${r.case.expected} -> ${r.actual}] "${r.case.text}"`
      );
    }
  }

  const misses = results.filter((r) => r.kind === 'MISS' && (full || r.case.deterministic));
  const falsePositives = results.filter((r) => r.kind === 'FALSE_POSITIVE');
  const mismatches = results.filter((r) => r.kind === 'level_mismatch');

  console.log('\n' + '─'.repeat(60));
  console.log(`Total cases:      ${results.length}`);
  console.log(`Misses:           ${misses.length}   <- crisis phrasing not escalated`);
  console.log(`False positives:  ${falsePositives.length}   <- ordinary phrasing escalated`);
  if (full) console.log(`Level mismatches: ${mismatches.length}   (concern vs none, non-blocking)`);
  if (!full) {
    const skipped = results.filter(
      (r) => r.case.expected === 'crisis' && !r.case.deterministic
    ).length;
    console.log(`Skipped:          ${skipped}   <- need the classifier to evaluate`);
  }

  // A full run where the classifier never actually answered is not a full run.
  //
  // This check exists because of a real failure: a maxOutputTokens cap made
  // every classifier call throw, so screening silently degraded to the regex
  // fallback. The run still "worked" — it just quietly stopped testing the
  // thing it was supposed to test. Nothing in the output said so.
  const degraded = results.filter((r) => r.source === 'classifier-error');
  if (full && degraded.length > 0) {
    console.log(
      `\nWARNING: the classifier failed on ${degraded.length}/${results.length} cases ` +
        'and those fell back to regex. This run does not verify T-7.'
    );
    for (const r of degraded.slice(0, 3)) {
      console.log(`  e.g. "${r.case.text}"`);
    }
  }

  // Only misses and false positives fail the run. A concern/none mismatch
  // changes a log line, not what the user experiences.
  const failed = misses.length + falsePositives.length + (full ? degraded.length : 0);
  console.log(failed === 0 ? '\nPASS' : `\nFAIL — ${failed} blocking failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
