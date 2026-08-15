/**
 * Cut a voice-enrolment clip for each speaker in a recording.
 *
 *   npx tsx scripts/extractSpeakerClip.ts <audio-file> [--at 120] [--seconds 10] [--out ./clips]
 *
 * WHY THIS EXISTS
 *
 * Testing the Intent Detector end to end needs a recording with two people in
 * it AND an enrolment clip of one of them, because the whole pipeline hangs off
 * matching a stored voiceprint. Real test recordings almost never come with
 * one: a podcast, an interview, anything downloaded, has two strangers and no
 * enrolment.
 *
 * So take the enrolment out of the recording itself. Pick a speaker, cut ten
 * seconds of them talking uninterrupted, and that clip becomes "me". The
 * recording is then a two-party conversation with a known enrolled speaker,
 * which is exactly the shape the product expects.
 *
 * It writes a clip for BOTH speakers rather than guessing which one you want,
 * and prints what each of them says so you can tell them apart without
 * listening.
 *
 * WHAT IT IS NOT
 *
 * This does not make a recording suitable for judging analysis quality. The
 * enrolled speaker is a stranger, so the read of "the other person" is a read
 * of a stranger by a stranger — fine for measuring separation and attribution,
 * meaningless as a demo of what the feature is for.
 *
 * The clip must also be 2 to 10 seconds to be usable as a reference; see
 * REF_MIN_SECONDS / REF_MAX_SECONDS in lib/transcription.ts. Ten is the ceiling
 * and the default, because more of a voice is strictly better for matching.
 */

import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  transcribeChunk,
  groupBySpeaker,
  sliceWav,
  ENROLLED_LABEL,
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

function arg(flag: string, fallback: string): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : fallback;
}

function clock(t: number): string {
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

async function main() {
  const file = process.argv[2];
  if (!file || file.startsWith('--')) {
    console.error('Usage: npx tsx scripts/extractSpeakerClip.ts <audio-file> [--at 120] [--seconds 10] [--out ./clips]');
    process.exit(1);
  }

  const at = Number(arg('--at', '120'));
  const want = Math.min(10, Math.max(2, Number(arg('--seconds', '10'))));
  const outDir = arg('--out', 'clips');

  // A three-minute window is enough to find ten uninterrupted seconds of each
  // person and costs about two cents to transcribe. Starting at --at skips
  // intros, music and cold opens, which is where a clip would pick up a jingle
  // underneath the voice.
  const dir = mkdtempSync(join(tmpdir(), 'clip-'));
  let wav: ArrayBuffer;
  try {
    const tmp = join(dir, 'window.wav');
    execFileSync('ffmpeg', [
      '-v', 'error', '-ss', String(at), '-t', '180', '-i', file,
      '-ar', '16000', '-ac', '1', tmp,
    ]);
    const buf = readFileSync(tmp);
    wav = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log(`window    ${clock(at)} to ${clock(at + 180)} of ${file}\n`);

  // A silence reference so nothing is anchored: it matches nobody, every voice
  // comes back under an invented label, and the view of who is in the recording
  // is unbiased. Feeding a real reference here would pre-decide the answer.
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

  process.stdout.write('finding the speakers ... ');
  const result = await transcribeChunk({
    apiKey: env('OPENAI_API_KEY'),
    audio: wav,
    filename: 'window.wav',
    mimeType: 'audio/wav',
    references: [{ name: ENROLLED_LABEL, data: silence, mimeType: 'audio/wav' }],
  });

  // Merge consecutive turns first. A ten-second clip has to be ten seconds of
  // ONE person talking without interruption, and raw segments split on pauses —
  // so the longest raw segment is usually a fragment of a much longer turn.
  const turns = groupBySpeaker(result.segments);
  const labels = [...new Set(turns.map((t) => t.speaker))].filter((l) => l !== ENROLLED_LABEL);
  console.log(`${labels.length} voice(s) [${labels.join(', ')}]\n`);

  if (labels.length < 2) {
    console.error('Fewer than two voices in this window. Try a different --at.');
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  for (const label of labels) {
    const best = turns
      .filter((t) => t.speaker === label)
      .reduce((a, b) => (b.end - b.start > a.end - a.start ? b : a));
    const span = best.end - best.start;

    if (span < 2) {
      console.log(`${label}: longest uninterrupted turn is ${span.toFixed(1)}s — too short for a reference.\n`);
      continue;
    }

    // From the START of the turn, not the middle: the model's end boundary is
    // the less reliable of the two, and drifting past it picks up the next
    // person's first word, which is the one thing a reference clip must not
    // contain.
    const from = best.start;
    const to = Math.min(best.end, from + want);
    const clip = sliceWav(wav, from, to);
    if (!clip) {
      console.log(`${label}: could not cut a clip.\n`);
      continue;
    }

    const path = join(outDir, `speaker-${label}.wav`);
    writeFileSync(path, Buffer.from(clip));
    console.log(`${label}  ${(to - from).toFixed(1)}s  at ${clock(at + from)} of the original`);
    console.log(`  ${path}`);
    console.log(`  "${best.text.trim().slice(0, 160)}${best.text.trim().length > 160 ? '…' : ''}"\n`);
  }

  console.log(
    'Listen to both, pick the one you want to be "me", and upload it as your\n' +
      'voice sample in Settings. The full recording then becomes a two-party\n' +
      'conversation with a known enrolled speaker.'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
