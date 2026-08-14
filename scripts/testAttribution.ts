/**
 * How often does speaker attribution get it wrong? (PRD I-4, the 90% bar.)
 *
 *   npx tsx scripts/testAttribution.ts <audio-file>
 *
 * THE PROBLEM THIS SOLVES
 *
 * I-4 requires "correct attribution on at least 90 percent of segments", and
 * measuring that normally needs a human to mark up who really said each line.
 * Nobody has done that, so the requirement has never actually been checked —
 * strayShare measures what the model could not place, not what it placed
 * wrongly, and a confidently misattributed segment is invisible to every metric
 * the pipeline currently has.
 *
 * THE TRICK
 *
 * Run the same recording twice, anchored to each speaker in turn.
 *
 *   pass A:  reference = a clip of speaker A  ->  A should be 'me'
 *   pass B:  reference = a clip of speaker B  ->  B should be 'me'
 *
 * If attribution is perfect the two passes are exact mirror images: every
 * moment pass A calls 'me', pass B must call 'them'. Anywhere they AGREE, one
 * of them is wrong — the same instant cannot belong to both speakers or
 * neither.
 *
 * So disagreement between the passes is correctness, and agreement is error.
 * No transcript markup, no ground-truth file, and it works on any two-person
 * recording including ones nobody involved is available to check.
 *
 * WHAT IT CANNOT TELL YOU
 *
 * A systematic error that flips both passes identically would cancel out and
 * read as perfect. In practice that means it measures whether the voiceprint
 * matching is self-consistent, which is necessary for I-4 but not sufficient.
 * A recording a human has marked up is still the gold standard; this is the
 * measurement available today.
 */

import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  transcribeChunks,
  transcribeChunk,
  sliceWav,
  CHUNK_SECONDS,
  ENROLLED_LABEL,
  type Segment,
} from '../lib/transcription';

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const file = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const v = new RegExp(`^${name}=(.*)$`, 'm').exec(file)?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!v) {
    console.error(`${name} not found in environment or .env`);
    process.exit(1);
  }
  return v;
}

const OPENAI_KEY = env('OPENAI_API_KEY');

/** Same 16kHz mono WAV the browser produces, so sliceWav can cut clips from it. */
function splitLocal(path: string) {
  const seconds = parseFloat(
    execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { encoding: 'utf8' }
    ).trim()
  );
  const dir = mkdtempSync(join(tmpdir(), 'attribution-'));
  try {
    execFileSync('ffmpeg', [
      '-v', 'error', '-i', path,
      '-ar', '16000', '-ac', '1',
      '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
      join(dir, 'part-%03d.wav'),
    ]);
    const chunks = readdirSync(dir)
      .filter((f) => f.startsWith('part-'))
      .sort()
      .map((f, i) => {
        const buf = readFileSync(join(dir, f));
        return {
          data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
          offsetSeconds: i * CHUNK_SECONDS,
        };
      });
    return { chunks, seconds };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Who is speaking at time t, or null in silence between segments. */
function labelAt(segments: Segment[], t: number): string | null {
  for (const s of segments) {
    if (t >= s.start && t < s.end) return s.speaker;
  }
  return null;
}

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: npx tsx scripts/testAttribution.ts <audio-file>');
    process.exit(1);
  }

  const { chunks, seconds } = splitLocal(file);
  console.log(`audio     ${seconds.toFixed(1)}s across ${chunks.length} chunk(s)\n`);

  // A throwaway reference so the first pass runs at all. It matches nobody, so
  // every speaker comes back as an invented label — which is exactly what we
  // want: an unbiased view of who is in the recording.
  const silence = new ArrayBuffer(44 + 3 * 16000 * 2);
  {
    const v = new DataView(silence);
    const ascii = (o: number, t: string) => {
      for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
    };
    ascii(0, 'RIFF');
    v.setUint32(4, silence.byteLength - 8, true);
    ascii(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true);
    v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    ascii(36, 'data');
    v.setUint32(40, 3 * 16000 * 2, true);
  }

  // Deliberately transcribeChunk, not transcribeChunks.
  //
  // transcribeChunks collapses every non-enrolled label to 'them', which is
  // correct for the product and fatal here: with both speakers merged there is
  // no way to cut one clip per voice, and the first version of this test did
  // exactly that — it anchored both passes to the same person and reported 98.9%
  // agreement as if the model were catastrophically broken. The passes agreed
  // because they were asking the same question twice.
  //
  // Only the first chunk is needed, since that is where the clips come from.
  process.stdout.write('baseline pass (finding the two speakers) ... ');
  const baseline = await transcribeChunk({
    apiKey: OPENAI_KEY,
    audio: chunks[0].data,
    filename: 'baseline.wav',
    mimeType: 'audio/wav',
    references: [{ name: ENROLLED_LABEL, data: silence, mimeType: 'audio/wav' }],
  });
  const rawLabels = [...new Set(baseline.segments.map((s) => s.speaker))];
  console.log(`${rawLabels.length} raw voices [${rawLabels.join(',')}], ${baseline.segments.length} segments in chunk 0`);

  const byLabel = new Map<string, typeof baseline.segments>();
  for (const s of baseline.segments) {
    if (!byLabel.has(s.speaker)) byLabel.set(s.speaker, []);
    byLabel.get(s.speaker)!.push(s);
  }

  const picks = [...byLabel.entries()]
    .filter(([label]) => label !== ENROLLED_LABEL) // the silence reference matched nobody
    .map(([label, segs]) => ({
      label,
      best: segs.reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a)),
      total: segs.length,
    }))
    .filter((p) => p.best.end - p.best.start >= 2)
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);

  if (picks.length < 2) {
    console.error('\nCould not find two speakers with a usable clip in the first chunk.');
    process.exit(1);
  }

  const passes: { label: string; segments: Segment[] }[] = [];
  for (const pick of picks) {
    const clip = sliceWav(
      chunks[0].data,
      pick.best.start,
      Math.min(pick.best.end, pick.best.start + 10)
    );
    if (!clip) {
      console.error(`Could not cut a reference clip for speaker ${pick.label}.`);
      process.exit(1);
    }
    const span = (Math.min(pick.best.end, pick.best.start + 10) - pick.best.start).toFixed(1);
    process.stdout.write(`pass anchored to "${pick.label}" (${span}s clip) ... `);
    const out = await transcribeChunks({
      apiKey: OPENAI_KEY,
      chunks,
      reference: { data: clip, mimeType: 'audio/wav' },
      mimeType: 'audio/wav',
    });
    const mine = out.segments.filter((s) => s.speaker === ENROLLED_LABEL).length;
    console.log(`${(out.enrolledShare * 100).toFixed(0)}% matched as "me" (${mine} segments)`);
    passes.push({ label: pick.label, segments: out.segments });
  }

  // Compare on a time grid rather than segment-by-segment: the two passes split
  // the audio differently, so segment indices do not line up between them.
  const STEP = 0.5;
  let compared = 0;
  let agreed = 0;
  const disputed: number[] = [];

  for (let t = 0; t < seconds; t += STEP) {
    const a = labelAt(passes[0].segments, t);
    const b = labelAt(passes[1].segments, t);
    if (a === null || b === null) continue; // silence in either pass
    compared++;
    // Mirror images is correct: 'me' in one pass means 'them' in the other.
    if (a === b) {
      agreed++;
      if (disputed.length < 12) disputed.push(t);
    }
  }

  const errorRate = compared > 0 ? agreed / compared : 0;
  const correct = (1 - errorRate) * 100;

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`compared     ${compared} sampled moments (${STEP}s apart, silence skipped)`);
  console.log(`mirrored     ${correct.toFixed(1)}%  <- passes disagree, which is CORRECT`);
  console.log(`same side    ${(errorRate * 100).toFixed(1)}%  <- both called it the same speaker: an error`);

  if (disputed.length > 0) {
    const stamps = disputed
      .map((t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`)
      .join(', ');
    console.log(`\nfirst contradictions at: ${stamps}`);
    console.log('Listen to a couple of these — they are where the model is confused.');
  }

  console.log(
    `\nI-4 requires 90% correct attribution. This run: ${correct.toFixed(1)}% self-consistent.`
  );
  if (correct < 90) {
    console.log('BELOW THE BAR on this recording.');
  }
  console.log(
    'Self-consistency is necessary but not sufficient — an error that flips both\n' +
      'passes the same way cancels out. A human-marked recording remains the\n' +
      'gold standard; this is what can be measured without one.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
