/**
 * T-2 / T-3 harness, and the side-by-side shown at Demo 2.
 *
 *   npx tsx scripts/runMemoryTests.ts              A/B: every fixture, with and without memory
 *   npx tsx scripts/runMemoryTests.ts --windows    one message at 3, 5 and 10 sessions of history
 *   npx tsx scripts/runMemoryTests.ts --prompt     print the assembled blocks, no API calls
 *   npx tsx scripts/runMemoryTests.ts --only=topic_recurrence
 *   npx tsx scripts/runMemoryTests.ts --stacked --width=100
 *
 * T-3's acceptance criterion is "a user whose mood has declined for three
 * sessions receives a response that references the trend, not a generic reply".
 * That is a judgement about generated text, so this cannot be a pure unit test
 * — it needs a model in the loop and a human reading the output.
 *
 * What it automates is the part that IS mechanical: the failure modes.
 *
 *   RECITATION — reading the memory block back, numbers and all. Reliably
 *   detectable, because any digit from the block appearing in the reply means
 *   the model is quoting data rather than remembering.
 *
 *   REPORT LANGUAGE — the same failure without digits. "Your mood is showing a
 *   steady decline." Narrating the record instead of speaking to the person.
 *
 *   GENERIC — a reply that would be identical with no history at all. Detected
 *   by looking for any reference to continuity or pattern.
 *
 * WHY THE A/B RUN EXISTS
 *
 * The GENERIC check asserts that a reply *would* have been worse without
 * history. The A/B mode stops asserting it and shows it: the identical message
 * goes to the identical model, at the identical temperature, under the
 * identical persona, and the ONLY difference between the two columns is
 * whether buildMemoryBlock() output was appended to the system prompt. Nothing
 * is done to weaken the control — it is exactly what the product did before
 * this work, which is what the demo plan promised to put on screen.
 *
 * Provider: uses GEMINI_API_KEY when present, which is what production runs on.
 * Falls back to OPENAI_API_KEY as a proxy — useful for catching prompt
 * problems, but NOT a substitute for a production run before sign-off.
 */

import { readFileSync } from 'node:fs';
import { geminiGenerateContentUrl } from '../lib/geminiModel';
import { buildMemoryBlock, type MoodPoint, type PastSession } from '../lib/chatMemory';
// The same constant the route uses. Duplicating it here once meant the A/B
// could pass against a persona that was never shipped.
import { ELENA_PERSONA as BASE_SYSTEM_PROMPT } from '../prompts/elena';

const NOW = Date.now();
const day = (n: number) => new Date(NOW - n * 86400000).toISOString();

function env(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  try {
    const file = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    return new RegExp(`^${name}=(.*)$`, 'm')
      .exec(file)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, '');
  } catch {
    return undefined;
  }
}


type Fixture = {
  name: string;
  what: string;
  moodPoints: MoodPoint[];
  recentSessions: PastSession[];
  message: string;
  expectContinuity: boolean;
};

const FIXTURES: Fixture[] = [
  {
    name: 'declining_three_sessions',
    what: 'THE T-3 acceptance case. Mood down across five check-ins.',
    moodPoints: [
      { created_at: day(0), mood_score: 41, energy: 35, stress: 74, detected_mode: 'anxious', transcript_summary: 'Said work has been relentless and they barely slept.' },
      { created_at: day(2), mood_score: 47, energy: 40, stress: 70, detected_mode: 'sad', transcript_summary: 'Talked about falling behind and feeling unable to catch up.' },
      { created_at: day(4), mood_score: 54, energy: 49, stress: 63, detected_mode: 'anxious', transcript_summary: 'Mentioned a deadline moving and skipping lunch to keep up.' },
      { created_at: day(6), mood_score: 60, energy: 57, stress: 58, detected_mode: 'calm' },
      { created_at: day(8), mood_score: 66, energy: 62, stress: 52, detected_mode: 'calm' },
    ],
    recentSessions: [
      { created_at: day(2), summary: 'Talked about pressure at work and struggling to sleep.', mood_score: 47, topics: ['work', 'sleep'] },
      { created_at: day(6), summary: 'Mentioned feeling behind on a project and skipping meals.', mood_score: 60, topics: ['work'] },
    ],
    message: "I'm okay. Just tired I guess.",
    expectContinuity: true,
  },
  {
    name: 'first_time_user',
    what: 'No history at all. Must not invent any.',
    moodPoints: [],
    recentSessions: [],
    message: "I'm okay. Just tired I guess.",
    expectContinuity: false,
  },
  {
    name: 'topic_recurrence',
    what: 'Same topic three times. Should connect it.',
    moodPoints: [
      { created_at: day(1), mood_score: 55, energy: 48, stress: 66, detected_mode: 'frustrated', transcript_summary: 'Went over a review meeting that did not go the way she hoped.' },
      { created_at: day(4), mood_score: 57, energy: 50, stress: 64, detected_mode: 'frustrated', transcript_summary: 'Talked about her manager presenting her work as his own.' },
      { created_at: day(7), mood_score: 56, energy: 49, stress: 65, detected_mode: 'anxious' },
    ],
    recentSessions: [
      { created_at: day(1), summary: 'Frustrated with her manager again after a review meeting.', mood_score: 55, topics: ['work'] },
      { created_at: day(4), summary: 'Said her manager took credit for her work.', mood_score: 57, topics: ['work'] },
      { created_at: day(7), summary: 'Considering whether to look for another job.', mood_score: 56, topics: ['work'] },
    ],
    message: 'Had another weird conversation with my boss today.',
    expectContinuity: true,
  },
  {
    name: 'irrelevant_history',
    what: 'History exists but is unrelated. Should NOT force a connection.',
    moodPoints: [
      { created_at: day(1), mood_score: 68, energy: 70, stress: 40, detected_mode: 'hopeful', transcript_summary: 'Talked about a trip she is planning and how much she needs it.' },
      { created_at: day(5), mood_score: 71, energy: 72, stress: 38, detected_mode: 'hopeful' },
    ],
    recentSessions: [
      { created_at: day(5), summary: 'Excited about a trip she was planning with friends.', mood_score: 71, topics: ['travel'] },
    ],
    message: 'My laptop broke this morning and I lost a document.',
    expectContinuity: false,
  },
];

// ─────────────────────────────────────────────────────────────
// The window fixture (--windows)
//
// Demo 2 asks the client to decide how much history is the right amount. Five
// sessions is the current setting, in app/api/chat-therapy/route.ts.
//
// This fixture is built so the trade-off is visible rather than argued. Ten
// sessions of history, and they are not uniform:
//
//   sessions 1-4  the last two weeks. Work, a new manager, sleep.
//   session  5    a good weekend. Still recent.
//   sessions 6-10 a breakup, three weeks to two months old, worked through
//                 and no longer raised by her.
//
// The message she sends is about work. So:
//
//   window 3   only the surface. Connects, but does not know the manager
//              change is where this started.
//   window 5   reaches the cause without reaching the breakup.
//   window 10  the breakup is in the prompt. Watch whether it comes back out.
//
// There is no correct answer here — it is the client's call, which is why the
// script shows all three rather than picking one.
// ─────────────────────────────────────────────────────────────

const WINDOW_SIZES = [3, 5, 10];

const WINDOW_FIXTURE = {
  name: 'how_much_history',
  message: 'Work has been relentless this week. I barely slept.',

  moodPoints: [
    { created_at: day(0), mood_score: 44, energy: 38, stress: 72, detected_mode: 'drained' },
    { created_at: day(2), mood_score: 45, energy: 40, stress: 70, detected_mode: 'anxious' },
    { created_at: day(4), mood_score: 47, energy: 42, stress: 68, detected_mode: 'anxious' },
    { created_at: day(6), mood_score: 49, energy: 45, stress: 65, detected_mode: 'anxious' },
    { created_at: day(8), mood_score: 52, energy: 50, stress: 60, detected_mode: 'calm' },
    { created_at: day(10), mood_score: 55, energy: 54, stress: 56, detected_mode: 'calm' },
    { created_at: day(12), mood_score: 57, energy: 57, stress: 53, detected_mode: 'hopeful' },
    { created_at: day(14), mood_score: 58, energy: 58, stress: 52, detected_mode: 'hopeful' },
  ] as MoodPoint[],

  // Newest first, the same order the database returns.
  recentSessions: [
    { created_at: day(1), summary: 'Her manager moved the deadline forward again. She stayed late three nights.', mood_score: 44, topics: ['work'] },
    { created_at: day(3), summary: 'Waking at four in the morning thinking about the project.', mood_score: 45, topics: ['work', 'sleep'] },
    { created_at: day(6), summary: 'Second week under the new manager. Feels like nothing she does lands.', mood_score: 49, topics: ['work'] },
    { created_at: day(9), summary: 'The team restructure was announced and her manager changed.', mood_score: 52, topics: ['work'] },
    { created_at: day(12), summary: 'A good weekend with friends. First time she had felt light in a while.', mood_score: 58, topics: ['friends'] },
    { created_at: day(20), summary: 'Still adjusting to living alone after the breakup.', mood_score: 55, topics: ['relationship'] },
    { created_at: day(28), summary: 'Ran into her ex at a birthday party and it knocked her sideways.', mood_score: 48, topics: ['relationship'] },
    { created_at: day(38), summary: 'Talked the breakup through in detail. Said she felt blindsided by it.', mood_score: 42, topics: ['relationship'] },
    { created_at: day(45), summary: 'Not sleeping, replaying conversations from the relationship.', mood_score: 40, topics: ['relationship', 'sleep'] },
    { created_at: day(52), summary: 'First session after the breakup. Mostly needed to say it out loud.', mood_score: 38, topics: ['relationship'] },
  ] as PastSession[],

  /**
   * Material she has moved on from. If any of this comes back out in a reply
   * to a message about work, that is the intrusiveness the demo plan warns
   * about — "things the user has moved on from, which reads as intrusive
   * rather than caring". Reported, not scored: it is the client's decision.
   */
  staleMarkers: /\b(break[- ]?up|broke up|ex|ex-|relationship|living alone|blindsided|split)\b/i,

  /** Index at which the moved-on material starts, for labelling the columns. */
  staleFrom: 5,
};

// ─────────────────────────────────────────────────────────────
// Providers
// ─────────────────────────────────────────────────────────────

/**
 * Mirrors the route's repair at app/api/chat-therapy/route.ts. A reply cut off
 * mid-sentence is trimmed back to the last complete one before the user sees
 * it, so the harness has to do the same or the columns show something the
 * product never shows.
 */
function repairTruncation(reply: string): string {
  if (!reply || /[.?!]"?$/.test(reply)) return reply;
  const lastPunct = Math.max(reply.lastIndexOf('.'), reply.lastIndexOf('?'), reply.lastIndexOf('!'));
  return lastPunct > 20 ? reply.slice(0, lastPunct + 1) : `${reply}.`;
}

/**
 * Kept as a regression guard, though it should now never fire.
 *
 * Gemini 2.5 Flash counts thinking tokens against maxOutputTokens. The route
 * used to cap at 1024, and measured on 11 Aug 2026 the reasoning alone reached
 * 979 tokens against a 41-token reply — so replies were being cut mid-sentence
 * and then chopped back to the last full stop by the route's repair. It was
 * intermittent, because thought length varies, which is why it read as the
 * model being occasionally terse rather than as a config bug.
 *
 * Both caps are gone. This check stays so that reintroducing one anywhere shows
 * up in a test run instead of as mysteriously blunt replies weeks later.
 */
let truncatedCount = 0;

async function callGemini(system: string, user: string, key: string) {
  const res = await fetch(
    `${geminiGenerateContentUrl()}?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${system}\n\n---\nNow begin the conversation.` }] },
          { role: 'model', parts: [{ text: "I'm here. What's on your mind?" }] },
          { role: 'user', parts: [{ text: user }] },
        ],
        // Identical to the route, including the absence of maxOutputTokens. Do
        // not "improve" it here — the whole point of the A/B is that everything
        // except the memory block is production.
        generationConfig: {},
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const j = await res.json();
  if (j?.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
    truncatedCount++;
    console.log(
      `  [!] hit MAX_TOKENS (thoughts ${j?.usageMetadata?.thoughtsTokenCount ?? '?'}, ` +
        `reply ${j?.usageMetadata?.candidatesTokenCount ?? '?'}, cap 1024) — reply was cut short`
    );
  }
  return repairTruncation(j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '');
}

async function callOpenAI(system: string, user: string, key: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.6,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j?.choices?.[0]?.message?.content?.trim() ?? '';
}

type Caller = (system: string, user: string) => Promise<string>;

// ─────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────

/** Any number from the memory block appearing in the reply means recitation. */
function recitedNumbers(memoryBlock: string, reply: string): string[] {
  const fromBlock = new Set((memoryBlock.match(/\b\d{1,3}\b/g) ?? []).filter((n) => Number(n) > 9));
  const inReply = new Set(reply.match(/\b\d{1,3}\b/g) ?? []);
  return [...inReply].filter((n) => fromBlock.has(n));
}

/**
 * Phrases that assert prior contact, as opposed to merely sounding continuous.
 *
 * Deliberately much stricter than CONTINUITY_MARKERS below, because the two
 * are asked opposite questions and one word list cannot answer both. GENERIC
 * asks "is there ANY sign of continuity here" and wants a loose net — a false
 * positive there only costs a missed warning. INVENTED asks "did it claim to
 * know someone it has never met", and a loose net there accuses the model of
 * fabricating history on the strength of the word "lately".
 *
 * That happened on 11 Aug 2026: a perfectly clean reply to a brand-new user —
 * "anything else that feels like it's been asking for your energy lately?" —
 * was reported as INVENTED. Ordinary English, no claim of shared history, and
 * the harness called it a failure in front of a demo run. A detector that
 * cries wolf discredits the flags that are real.
 */
const SHARED_HISTORY_CLAIMS =
  /\b(last time|each time we|every time we|we (?:talked|spoke|discussed)|you (?:told|mentioned to) me|since we (?:last )?(?:talked|spoke|met)|as (?:always|usual)|the (?:second|third|fourth) time|you(?:'ve| have) (?:told|mentioned to) me)\b/i;

const CONTINUITY_MARKERS =
  /\b(again|still|last time|each time|third time|second time|lately|recently|the past few|these past|keeps? coming up|every time|since we|you(?:'ve| have) been|used to|before|pattern|weeks?|ongoing|continu(?:es|ing)|this dynamic|as (?:always|usual)|the same)\b/i;

/**
 * Recitation without numbers.
 *
 * Caught by reading the first run's output: "Your mood is showing a steady
 * decline. I remember you mentioned struggling with sleep." No digits, so the
 * numeric check passed it — but it is the same failure. The model is narrating
 * the record back rather than speaking to the person.
 */
const REPORT_LANGUAGE =
  new RegExp(
    [
      String.raw`your mood (?:is|has been|shows|seems to)`,
      String.raw`mood (?:score|level|rating)`,
      String.raw`showing a (?:steady )?(?:decline|increase|drop)`,
      String.raw`i (?:can )?(?:see|notice) (?:that )?your`,
      String.raw`i remember (?:you|that|when|how)`,
      String.raw`according to`,
      String.raw`based on (?:your|what)`,
      String.raw`your (?:energy|stress) (?:is|has been|levels?)`,

      // Added 11 Aug 2026. Both of these passed the version above while being
      // the same failure it exists to catch, which is how they reached a demo
      // run. "Today's check-in felt particularly anxious" describes a stored
      // record; "I have noticed a pattern" describes a trend as a trend, which
      // the instructions explicitly forbid.
      String.raw`check[- ]?in (?:felt|sounded|was|showed|came)`,
      String.raw`(?:i(?:'ve| have) )?notic(?:ed|e) a pattern`,
      String.raw`a pattern (?:of|in) (?:you|your)`,
    ].join('|'),
    'i'
  );

// Guards the regex above against both directions of mistake: the phrasings it
// must catch, and the ordinary warmth it must not fire on. A detector that
// flags every reply is as useless as one that flags none, and this one is the
// only thing standing between a prompt regression and a client seeing it.
if (process.env.NODE_ENV !== 'production') {
  const MUST_FLAG = [
    "today's check-in felt particularly anxious",
    "I've noticed a pattern of you feeling more weighed down",
    'Your mood is showing a steady decline',
    'I remember you mentioned struggling with sleep',
  ];
  const MUST_PASS = [
    'You have sounded a little heavier each time we have talked',
    'This is the third time work has come up',
    'You sounded anxious today, and that makes sense',
    'What has been settling in for you that you are calling just tired?',
  ];
  for (const s of MUST_FLAG) {
    if (!REPORT_LANGUAGE.test(s)) throw new Error(`REPORT_LANGUAGE missed: "${s}"`);
  }
  for (const s of MUST_PASS) {
    const hit = REPORT_LANGUAGE.exec(s);
    if (hit) throw new Error(`REPORT_LANGUAGE false positive on "${s}" via "${hit[0]}"`);
  }

  // The strict set. Its whole value is precision, so the false-positive half
  // matters more here than the coverage half: every phrase below is something
  // a therapist could say to a total stranger.
  const CLAIMS_HISTORY = [
    'You mentioned this last time we talked',
    'Each time we talk you sound a little flatter',
    'We talked about your sleep a few days ago',
    'You told me your manager took credit for it',
  ];
  const CLAIMS_NOTHING = [
    'anything else that feels like it has been asking for your energy lately?',
    'That kind of tired can settle in over weeks',
    'Have you been feeling this way for a while?',
    'It sounds like something has been weighing on you recently',
    'What kind of tired is this for you today?',
  ];
  for (const s of CLAIMS_HISTORY) {
    if (!SHARED_HISTORY_CLAIMS.test(s)) throw new Error(`SHARED_HISTORY_CLAIMS missed: "${s}"`);
  }
  for (const s of CLAIMS_NOTHING) {
    const hit = SHARED_HISTORY_CLAIMS.exec(s);
    if (hit) throw new Error(`SHARED_HISTORY_CLAIMS false positive on "${s}" via "${hit[0]}"`);
  }
}

function scoreWithMemory(f: Fixture, memoryBlock: string, reply: string): string[] {
  const problems: string[] = [];

  const recited = recitedNumbers(memoryBlock, reply);
  if (recited.length > 0) problems.push(`RECITATION — leaked numbers: ${recited.join(', ')}`);

  const reportPhrase = REPORT_LANGUAGE.exec(reply)?.[0];
  if (reportPhrase) problems.push(`REPORT LANGUAGE — narrating the record: "${reportPhrase}"`);

  const hasContinuity = CONTINUITY_MARKERS.test(reply);
  if (f.expectContinuity && !hasContinuity) {
    problems.push('GENERIC — no reference to continuity or pattern');
  }
  // Strict set: only an actual claim of prior contact counts as invention.
  if (!f.expectContinuity && f.recentSessions.length === 0) {
    const claim = SHARED_HISTORY_CLAIMS.exec(reply)?.[0];
    if (claim) problems.push(`INVENTED — claims shared history that does not exist: "${claim}"`);
  }

  return problems;
}

/**
 * The control column has no history in its prompt, so it cannot legitimately
 * refer to any. If it does, the marker regex is matching ordinary conversational
 * filler — "still", "lately", "weeks" — and the contrast on screen is weaker
 * than the pass/fail suggests. Better to find that here than on the call.
 */
function scoreControl(reply: string): string[] {
  const claim = SHARED_HISTORY_CLAIMS.exec(reply)?.[0];
  return claim
    ? [`WEAK CONTROL — no-memory reply claims shared history: "${claim}"`]
    : [];
}

// ─────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────

type Panel = { title: string; body: string; notes?: string[] };

function wrap(text: string, width: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      out.push('');
      continue;
    }
    let line = '';
    for (let word of paragraph.trim().split(/\s+/)) {
      while (word.length > width) {
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (line === '') line = word;
      else if (line.length + 1 + word.length <= width) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

function panelLines(p: Panel, width: number): string[] {
  const title = p.title.length > width ? `${p.title.slice(0, width - 1)}…` : p.title;
  return [
    title,
    '─'.repeat(width),
    ...wrap(p.body, width),
    ...(p.notes?.length ? ['', ...p.notes.flatMap((n) => wrap(`-> ${n}`, width))] : []),
  ];
}

const GUTTER = 3;

function renderColumns(panels: Panel[], total: number): string {
  const width = Math.floor((total - GUTTER * (panels.length - 1)) / panels.length);
  const cols = panels.map((p) => panelLines(p, width));
  const height = Math.max(...cols.map((c) => c.length));
  const lines: string[] = [];
  for (let i = 0; i < height; i++) {
    lines.push(
      cols.map((c) => (c[i] ?? '').padEnd(width)).join(' '.repeat(GUTTER)).trimEnd()
    );
  }
  return lines.join('\n');
}

function renderStacked(panels: Panel[], total: number): string {
  return panels.map((p) => panelLines(p, total).join('\n')).join('\n\n');
}

/** Columns unless they would be too narrow to read, which is worse than stacking. */
function render(panels: Panel[], total: number, forceStacked: boolean): string {
  const perColumn = Math.floor((total - GUTTER * (panels.length - 1)) / panels.length);
  if (forceStacked || perColumn < 28) return renderStacked(panels, total);
  return renderColumns(panels, total);
}

// ─────────────────────────────────────────────────────────────
// Modes
// ─────────────────────────────────────────────────────────────

/**
 * --prompt. No API calls, so it costs nothing and cannot fail on the call.
 * This is the T-2 evidence: "confirmed by inspecting the payload sent to the
 * model". Same function, same output, as the running route.
 */
function printPrompts(fixtures: Fixture[]) {
  for (const f of fixtures) {
    const block = buildMemoryBlock(
      { recentSessions: f.recentSessions, moodPoints: f.moodPoints },
      NOW
    );
    console.log(`\n${'═'.repeat(64)}`);
    console.log(`### ${f.name}`);
    console.log(`    ${f.what}`);
    console.log('═'.repeat(64));
    console.log(block === '' ? '\n(empty — new user, nothing is injected)\n' : block);
  }
  console.log(`\n${'─'.repeat(64)}`);
  console.log('This is exactly what app/api/chat-therapy/route.ts appends to the');
  console.log('system prompt. Set CHAT_DEBUG_PROMPT=1 to print it from the running app.');
}

async function runAB(fixtures: Fixture[], call: Caller, total: number, stacked: boolean) {
  let failures = 0;

  for (const f of fixtures) {
    const memoryBlock = buildMemoryBlock(
      { recentSessions: f.recentSessions, moodPoints: f.moodPoints },
      NOW
    );

    console.log(`\n${'═'.repeat(Math.min(total, 78))}`);
    console.log(`### ${f.name}`);
    console.log(`    ${f.what}`);
    console.log(`    user: "${f.message}"`);
    console.log('═'.repeat(Math.min(total, 78)));

    let control: string;
    let withMemory: string;
    try {
      // Fired together so the pair lands at once and the only variable between
      // the two columns stays the memory block.
      [control, withMemory] = await Promise.all([
        call(BASE_SYSTEM_PROMPT, f.message),
        call(`${BASE_SYSTEM_PROMPT}${memoryBlock}`, f.message),
      ]);
    } catch (err) {
      console.log(`  ERROR: ${(err as Error).message}`);
      failures++;
      continue;
    }

    const controlNotes = scoreControl(control);
    const memoryProblems = scoreWithMemory(f, memoryBlock, withMemory);
    failures += memoryProblems.length;

    const sessionCount = f.recentSessions.length;
    console.log(
      render(
        [
          {
            title: 'WITHOUT MEMORY  (behaviour before this work)',
            body: control,
            notes: controlNotes,
          },
          {
            title:
              sessionCount === 0
                ? 'WITH MEMORY  (nothing to load — new user)'
                : `WITH MEMORY  (${sessionCount} session${sessionCount === 1 ? '' : 's'} + mood trend)`,
            body: withMemory,
            notes: memoryProblems.length ? memoryProblems : ['ok'],
          },
        ],
        total,
        stacked
      )
    );
  }

  console.log(`\n${'─'.repeat(64)}`);
  console.log(
    failures === 0
      ? 'No automated failures. Read the replies above — T-3 is a judgement call.'
      : `${failures} automated failure(s). Read the replies above.`
  );
}

async function runWindows(call: Caller, total: number, stacked: boolean) {
  const f = WINDOW_FIXTURE;

  console.log(`\n${'═'.repeat(Math.min(total, 78))}`);
  console.log('### how much history is the right amount');
  console.log('    Same person, same message, same model. Only the number of past');
  console.log(`    sessions loaded changes. Sessions ${f.staleFrom + 1}-10 are the breakup,`);
  console.log('    three weeks to two months old, which she has stopped raising.');
  console.log(`    user: "${f.message}"`);
  console.log('═'.repeat(Math.min(total, 78)));

  const blocks = WINDOW_SIZES.map((n) =>
    buildMemoryBlock(
      { recentSessions: f.recentSessions.slice(0, n), moodPoints: f.moodPoints },
      NOW
    )
  );

  let replies: string[];
  try {
    replies = await Promise.all(
      blocks.map((b) => call(`${BASE_SYSTEM_PROMPT}${b}`, f.message))
    );
  } catch (err) {
    console.log(`  ERROR: ${(err as Error).message}`);
    return;
  }

  const panels: Panel[] = WINDOW_SIZES.map((n, i) => {
    const notes: string[] = [`block: ${blocks[i].length} chars`];

    const stale = f.staleMarkers.exec(replies[i])?.[0];
    if (stale) notes.push(`REACHED BACK — surfaced "${stale}" from the breakup`);

    const reportPhrase = REPORT_LANGUAGE.exec(replies[i])?.[0];
    if (reportPhrase) notes.push(`REPORT LANGUAGE — "${reportPhrase}"`);

    if (n > f.staleFrom) notes.push(`${n - f.staleFrom} moved-on session(s) in the prompt`);
    if (!CONTINUITY_MARKERS.test(replies[i])) notes.push('no continuity — reads as a cold open');

    return { title: `${n} SESSIONS`, body: replies[i], notes };
  });

  console.log(render(panels, total, stacked));

  console.log(`\n${'─'.repeat(64)}`);
  console.log('Current setting is 5, at app/api/chat-therapy/route.ts (.limit(5)).');
  console.log('The mood window is separate and unchanged at 14 check-ins.');
  console.log('Replies vary between runs. Run this two or three times before deciding.');
}

// ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.includes(`--${n}`);
  const opt = (n: string) =>
    args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);

  const requested = Number(opt('width') ?? process.stdout.columns ?? 100);
  const total = Math.max(72, Math.min(Number.isFinite(requested) ? requested : 100, 150));
  const stacked = flag('stacked');

  const only = opt('only');
  const fixtures = only ? FIXTURES.filter((f) => f.name === only) : FIXTURES;
  if (only && fixtures.length === 0) {
    console.error(`No fixture named "${only}". Available: ${FIXTURES.map((f) => f.name).join(', ')}`);
    process.exit(1);
  }

  if (flag('prompt')) {
    printPrompts(fixtures);
    return;
  }

  const geminiKey = env('GEMINI_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');

  if (!geminiKey && !openaiKey) {
    console.error('No GEMINI_API_KEY or OPENAI_API_KEY found. Cannot run.');
    process.exit(1);
  }

  const usingProxy = !geminiKey;
  console.log(
    usingProxy
      ? 'PROXY RUN — using OpenAI gpt-4o-mini because GEMINI_API_KEY is absent.\n' +
          'Production runs on Gemini. Re-run before sign-off.\n'
      : 'Running against Gemini (production model).\n'
  );

  const call: Caller = usingProxy
    ? (s, u) => callOpenAI(s, u, openaiKey!)
    : (s, u) => callGemini(s, u, geminiKey!);

  if (flag('windows')) {
    await runWindows(call, total, stacked);
  } else {
    await runAB(fixtures, call, total, stacked);
  }

  if (truncatedCount > 0) {
    console.log(
      `\nREGRESSION: ${truncatedCount} repl${truncatedCount === 1 ? 'y' : 'ies'} hit an output ` +
        'ceiling and were trimmed back to the last full sentence.\n' +
        'The caps were removed on 11 Aug 2026. Something has reintroduced one —\n' +
        'check generationConfig in callGemini() here and in app/api/chat-therapy/route.ts.'
    );
  }

  if (usingProxy) console.log('Reminder: proxy run. Re-run against Gemini before sign-off.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
