/**
 * I-5 harness: how accurately does speaker attribution work on real audio?
 *
 *   npx tsx scripts/testDiarization.ts <enrollment.wav> <conversation.wav> [truth.json]
 *
 * I-5's acceptance criterion is "on a two-person recording in a quiet room,
 * correct attribution on at least 90 percent of segments". That number cannot
 * be established from documentation — it has to be measured on recordings made
 * in the conditions the product will actually be used in.
 *
 * Run this against at least three recordings before committing to Feature 2
 * dates: one quiet room, one noisy environment (a cafe is the realistic worst
 * case for a date), and one over 15 minutes to check behaviour at length.
 *
 * `truth.json` is optional and is an array of "me" | "them" covering the
 * conversation's turns in order. Without it the script prints the attribution
 * for manual review but cannot score it.
 *
 * Verified working 5 Aug 2026 against gpt-4o-transcribe-diarize.
 */

import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const ENROLLED_NAME = 'me';

function apiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const k = /^OPENAI_API_KEY=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (k) return k;
  } catch {
    /* fall through */
  }
  console.error('OPENAI_API_KEY not found in environment or .env');
  process.exit(1);
}

type Segment = {
  id: string;
  type: string;
  text: string;
  speaker: string;
  start: number;
  end: number;
};

function mimeFor(path: string): string {
  const ext = path.toLowerCase().split('.').pop();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'webm') return 'audio/webm';
  if (ext === 'ogg') return 'audio/ogg';
  return 'audio/wav';
}

async function diarize(enrollmentPath: string, conversationPath: string) {
  const enrollment = readFileSync(enrollmentPath);
  const conversation = readFileSync(conversationPath);

  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(conversation)], { type: mimeFor(conversationPath) }),
    basename(conversationPath)
  );
  form.append('model', 'gpt-4o-transcribe-diarize');
  form.append('response_format', 'diarized_json');
  // Required for diarization models, and not obvious from the model docs —
  // omitting it returns 400 invalid_value rather than defaulting.
  form.append('chunking_strategy', 'auto');
  form.append('known_speaker_names[]', ENROLLED_NAME);
  form.append(
    'known_speaker_references[]',
    `data:${mimeFor(enrollmentPath)};base64,${enrollment.toString('base64')}`
  );

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey()}` },
    body: form,
  });

  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<{
    duration: number;
    segments: Segment[];
    usage?: { total_tokens?: number };
  }>;
}

async function main() {
  const [enrollmentPath, conversationPath, truthPath] = process.argv.slice(2);

  if (!enrollmentPath || !conversationPath) {
    console.error(
      'Usage: npx tsx scripts/testDiarization.ts <enrollment> <conversation> [truth.json]'
    );
    process.exit(1);
  }
  for (const p of [enrollmentPath, conversationPath]) {
    if (!existsSync(p)) {
      console.error(`Not found: ${p}`);
      process.exit(1);
    }
  }

  console.log(`enrollment:   ${enrollmentPath}`);
  console.log(`conversation: ${conversationPath}\n`);

  const started = Date.now();
  const out = await diarize(enrollmentPath, conversationPath);
  const elapsed = (Date.now() - started) / 1000;

  const segments = out.segments ?? [];
  const speakers = [...new Set(segments.map((s) => s.speaker))];

  for (const s of segments) {
    const mine = s.speaker === ENROLLED_NAME;
    console.log(
      `  ${(mine ? 'ME  ' : 'THEM').padEnd(5)} ` +
        `${s.start.toFixed(1).padStart(6)}-${s.end.toFixed(1).padEnd(6)} ` +
        `[${s.speaker}] ${s.text.trim().slice(0, 60)}`
    );
  }

  console.log('\n' + '─'.repeat(64));
  console.log(`Audio duration:   ${out.duration?.toFixed(1)}s`);
  console.log(`Processing time:  ${elapsed.toFixed(1)}s`);
  console.log(`Segments:         ${segments.length}`);
  console.log(`Speakers found:   ${speakers.join(', ')}`);

  // N-6 requires a 20-minute recording to analyse within 3 minutes, and
  // transcription is only the first half of that budget.
  if (out.duration) {
    const ratio = elapsed / out.duration;
    const projected20min = ratio * 20 * 60;
    console.log(
      `Speed:            ${ratio.toFixed(2)}x realtime ` +
        `(20 min -> ~${(projected20min / 60).toFixed(1)} min for transcription alone)`
    );
  }

  const enrolledCount = segments.filter((s) => s.speaker === ENROLLED_NAME).length;
  console.log(
    `Attributed to enrolled speaker: ${enrolledCount}/${segments.length}` +
      ` (${((enrolledCount / segments.length) * 100).toFixed(0)}%)`
  );

  if (speakers.length === 1) {
    console.log(
      '\nWARNING: only one speaker detected. Either the recording genuinely has' +
        '\none voice, or separation failed — which is the I-8 case.'
    );
  }
  if (!speakers.includes(ENROLLED_NAME)) {
    console.log(
      '\nWARNING: the enrolled speaker was not matched anywhere. Check the' +
        '\nenrollment clip is 2-10s, clear, and actually the same person.'
    );
  }

  if (truthPath && existsSync(truthPath)) {
    const truth: string[] = JSON.parse(readFileSync(truthPath, 'utf8'));
    if (truth.length !== segments.length) {
      console.log(
        `\nGround truth has ${truth.length} entries but there are ${segments.length}` +
          '\nsegments. Segments are split on pauses, not turns, so these rarely' +
          '\nmatch one to one — align them by hand and score manually.'
      );
    } else {
      const correct = segments.filter(
        (s, i) => (s.speaker === ENROLLED_NAME ? 'me' : 'them') === truth[i]
      ).length;
      const pct = (correct / segments.length) * 100;
      console.log(`\nAccuracy: ${correct}/${segments.length} = ${pct.toFixed(1)}%`);
      console.log(pct >= 90 ? 'PASS — meets I-5' : 'FAIL — below the 90% I-5 threshold');
    }
  } else {
    console.log('\nNo ground truth supplied — review the attribution above by hand.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
