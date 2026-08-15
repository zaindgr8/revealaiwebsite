/**
 * I-5, checked two ways.
 *
 *   npm run test:intent          the guards, offline, no model call
 *   npm run test:intent -- --live   plus one real analysis of a fixture
 *
 * WHY THE OFFLINE HALF EXISTS
 *
 * anchorMoments is the only thing standing between a model's answer and a
 * sentence on screen accusing a named person of manipulating someone. Its
 * failure mode is silent and flattering: a hallucinated quote that gets
 * displayed looks exactly like a good finding, and nobody notices until a user
 * searches their own transcript for words that were never in it.
 *
 * So the four ways a moment can be wrong are pinned here rather than trusted.
 *
 * WHY THE LIVE HALF EXISTS
 *
 * The guards say the output is well formed. They cannot say it is any good —
 * whether the readings are hedged, whether it finds warmth as readily as it
 * finds evasion, or whether it will still say "nothing stood out" when nothing
 * did. That needs a human to read it, and this makes that a thirty-second job
 * instead of a recording session.
 *
 * The fixture is deliberately mixed: one speaker who is warm in places and
 * evasive in others. A run that comes back uniformly suspicious is a prompt
 * problem, and this is where it shows.
 */

import { readFileSync } from 'node:fs';
import {
  anchorMoments,
  analyseConversation,
  formatTranscriptForAnalysis,
  signalTone,
} from '../lib/intentAnalysis';
import type { Segment } from '../lib/transcription';

function seg(i: number, text: string, isEnrolled: boolean, start: number): Segment {
  return { id: `s${i}`, text, speaker: isEnrolled ? 'me' : 'them', start, end: start + 5, isEnrolled };
}

/** A date. He is genuinely warm early on and closes down around one subject. */
const FIXTURE: Segment[] = [
  seg(0, 'So how was your week? You said it was going to be a heavy one.', true, 0),
  seg(1, 'It was honestly fine. Nothing worth boring you with. How was yours?', false, 6),
  seg(2, 'Busy. I finally finished that course I kept talking about.', true, 14),
  seg(3, 'Wait, you actually finished it? That is brilliant, I remember you saying you were going to drop it in week two.', false, 22),
  seg(4, 'I nearly did. Twice.', true, 33),
  seg(5, 'I love that you stuck with it. Tell me what the last project was, I want to hear the whole thing.', false, 37),
  seg(6, 'It was a small app for tracking reading. Anyway, you mentioned you were between jobs?', true, 47),
  seg(7, 'Something like that. It is complicated. Anyway, that app sounds great, does it sync across devices?', false, 56),
  seg(8, 'It does. So what happened with the job?', true, 66),
  seg(9, 'Ah, you know how these things go. Restructures and so on. Let us not do the depressing bit on a first date.', false, 72),
  seg(10, 'Fair enough.', true, 82),
  seg(11, 'I will tell you the whole thing another time, I promise. I would like there to be another time.', false, 85),
  seg(12, 'I would like that too.', true, 94),
];

let failures = 0;

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function guards() {
  console.log('\nanchorMoments');
  const { refs } = formatTranscriptForAnalysis(FIXTURE, 'them');

  const base = { signal: 'guarded', observation: 'They moved off the subject.', reading: 'May be uncomfortable.' };

  // A quote that is really there, on a line that is really theirs.
  {
    const { moments, diagnostics } = anchorMoments(
      [{ ...base, ref: 9, quote: 'Let us not do the depressing bit' }],
      refs
    );
    check('keeps a verified quote', moments.length === 1);
    check('takes the timestamp from the transcript, not the model', moments[0]?.at === 72);
    check('counts what it kept', diagnostics.kept === 1 && diagnostics.returned === 1);
  }

  // The failure that matters most: plausible sentence, never said.
  {
    const { moments, diagnostics } = anchorMoments(
      [{ ...base, ref: 9, quote: 'I do not want to talk about my job with you' }],
      refs
    );
    check('drops an invented quote', moments.length === 0);
    check('records why', diagnostics.dropped_quote_not_found === 1);
  }

  // Off-brief, and also what a misattributed segment looks like from inside.
  {
    const { moments, diagnostics } = anchorMoments(
      [{ ...base, ref: 2, quote: 'I finally finished that course' }],
      refs
    );
    check("drops a finding about the user's own line", moments.length === 0);
    check('records why', diagnostics.dropped_own_line === 1);
  }

  {
    const { moments, diagnostics } = anchorMoments([{ ...base, ref: 999, quote: 'anything' }], refs);
    check('drops an out-of-range line number', moments.length === 0);
    check('records why', diagnostics.dropped_unknown_ref === 1);
  }

  // Punctuation and casing drift between ASR output and the model's copy of it.
  {
    const { moments } = anchorMoments(
      [{ ...base, ref: 7, quote: 'something like that   IT IS, complicated' }],
      refs
    );
    check('matches through casing and punctuation drift', moments.length === 1);
  }

  {
    const { moments, diagnostics } = anchorMoments(
      [
        { ...base, ref: 9, quote: 'Restructures and so on' },
        { ...base, ref: 9, quote: 'you know how these things go' },
      ],
      refs
    );
    check('keeps one finding per line', moments.length === 1);
    check('records why', diagnostics.dropped_duplicate === 1);
  }

  // Chronological, because "at this point" is how these get read.
  {
    const { moments } = anchorMoments(
      [
        { ...base, ref: 11, quote: 'I would like there to be another time' },
        { ...base, ref: 1, quote: 'Nothing worth boring you with' },
      ],
      refs
    );
    check('orders by time', moments[0]?.at === 6 && moments[1]?.at === 85);
  }

  // An unfamiliar signal keeps its finding but loses its colour, rather than
  // being quietly filed under one of the real rubric entries.
  {
    const { moments } = anchorMoments(
      [{ ...base, ref: 9, quote: 'Restructures and so on', signal: 'suspicious' }],
      refs
    );
    check('keeps a finding with an unknown signal', moments.length === 1);
    check('leaves it untinted', signalTone(moments[0]?.signal ?? '') === 'neutral');
  }

  console.log('\nD-1 — no scores anywhere in the stored shape');
  {
    const { moments } = anchorMoments(
      [{ ...base, ref: 9, quote: 'Restructures and so on', score: 87, confidence: 0.9 } as never],
      refs
    );
    const keys = Object.keys(moments[0] ?? {});
    check('extra numeric fields are not carried through', !keys.includes('score') && !keys.includes('confidence'));
  }
}

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const v = new RegExp(`^${name}=(.*)$`, 'm').exec(file)?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!v) {
    console.error(`\n${name} not found in environment or .env`);
    process.exit(1);
  }
  return v;
}

async function live() {
  console.log('\nlive run against the fixture (one Gemini call)\n');
  const analysis = await analyseConversation({
    apiKey: env('GEMINI_API_KEY'),
    segments: FIXTURE,
    scenario: 'date',
    themLabel: 'Sam',
  });

  console.log(`overall  ${analysis.overall}\n`);
  for (const m of analysis.moments) {
    const clock = `${Math.floor(m.at / 60)}:${String(Math.floor(m.at % 60)).padStart(2, '0')}`;
    console.log(`${clock}  [${m.signal}]`);
    console.log(`  "${m.quote}"`);
    console.log(`  ${m.observation}`);
    console.log(`  ${m.reading}\n`);
  }

  const d = analysis.diagnostics;
  console.log(
    `kept ${d.kept} of ${d.returned}` +
      `  (bad ref ${d.dropped_unknown_ref}, own line ${d.dropped_own_line},` +
      ` quote not found ${d.dropped_quote_not_found}, duplicate ${d.dropped_duplicate})`
  );

  // These are judgements about the run, not pass/fail gates — but they are the
  // three things worth glancing at every time.
  const positives = analysis.moments.filter((m) => signalTone(m.signal) === 'positive').length;
  console.log(`\nRead the above and check three things:`);
  console.log(`  1. Every quote is genuinely in the fixture.`);
  console.log(`  2. Readings are hedged, and describe behaviour rather than character.`);
  console.log(
    `  3. It found something positive. This run: ${positives} of ${analysis.moments.length}.` +
      (positives === 0 ? '  <- none, which is worth looking into.' : '')
  );
  if (d.returned > 0 && d.kept / d.returned < 0.6) {
    console.log(
      `\nMost of the model's answer was discarded. That is the guards working, but a` +
        `\nprompt the model keeps failing is a prompt worth rereading.`
    );
  }
}

async function main() {
  guards();
  if (process.argv.includes('--live')) await live();

  console.log(`\n${'─'.repeat(60)}`);
  if (failures > 0) {
    console.log(`${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log('All checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
