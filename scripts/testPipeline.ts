/**
 * Exercises the real transcription pipeline (lib/transcription.ts) end to end
 * on a local audio file.
 *
 *   npx tsx scripts/testPipeline.ts <reference.wav> <conversation.(mp3|wav|m4a)>
 *
 * Unlike scripts/testDiarization.ts, which calls the API directly, this runs
 * the module the app actually uses — chunking, parallel dispatch, timestamp
 * stitching, speaker grouping and the I-7 confidence assessment. If the port
 * from the original spike broke something, this is what catches it.
 *
 * Requires ffmpeg on PATH for splitting, and OPENAI_API_KEY in .env.
 *
 * This is the script to run for Demo 4 on a real recording.
 */

import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import {
  transcribeChunks,
  groupBySpeaker,
  assessConfidence,
  CHUNK_SECONDS,
} from '../lib/transcription';

function apiKey(): string {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const k = /^OPENAI_API_KEY=(.*)$/m.exec(env)?.[1]?.trim().replace(/^["']|["']$/g, '');
  if (!k) {
    console.error('OPENAI_API_KEY not found');
    process.exit(1);
  }
  return k;
}

function probeDuration(path: string): number {
  const out = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' }
  );
  return parseFloat(out.trim());
}

function toArrayBuffer(b: Buffer): ArrayBuffer {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function main() {
  const [refPath, audioPath] = process.argv.slice(2);
  if (!refPath || !audioPath) {
    console.error('Usage: npx tsx scripts/testPipeline.ts <reference.wav> <conversation.mp3>');
    process.exit(1);
  }
  for (const p of [refPath, audioPath]) {
    if (!existsSync(p)) {
      console.error(`Not found: ${p}`);
      process.exit(1);
    }
  }

  const duration = probeDuration(audioPath);
  const chunkCount = Math.max(1, Math.ceil(duration / CHUNK_SECONDS));
  const chunkLength = duration / chunkCount;

  console.log(`audio      ${audioPath}`);
  console.log(`duration   ${duration.toFixed(1)}s (${(duration / 60).toFixed(1)} min)`);
  console.log(`chunks     ${chunkCount} x ~${chunkLength.toFixed(0)}s\n`);

  const work = mkdtempSync(join(tmpdir(), 'revealai-pipeline-'));
  try {
    const ext = extname(audioPath) || '.wav';
    const chunks = [];
    for (let i = 0; i < chunkCount; i++) {
      const out = join(work, `chunk${i}${ext}`);
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error',
        '-i', audioPath,
        '-ss', String(i * chunkLength),
        '-t', String(chunkLength),
        '-c', 'copy',
        out,
      ]);
      chunks.push({
        data: toArrayBuffer(readFileSync(out)),
        offsetSeconds: i * chunkLength,
      });
    }

    const mimeType = ext === '.mp3' ? 'audio/mpeg' : ext === '.m4a' ? 'audio/mp4' : 'audio/wav';

    const result = await transcribeChunks({
      apiKey: apiKey(),
      chunks,
      reference: { data: toArrayBuffer(readFileSync(refPath)), mimeType: 'audio/wav' },
      mimeType,
    });

    console.log('── transcription ─────────────────────────────────');
    console.log(`  elapsed        ${result.elapsedSeconds.toFixed(1)}s`);
    console.log(`  ratio          ${(result.elapsedSeconds / duration).toFixed(3)}x realtime`);
    console.log(`  segments       ${result.segments.length}`);
    console.log(`  speakers       ${JSON.stringify(result.speakers)}`);
    console.log(`  yours          ${(result.enrolledShare * 100).toFixed(1)}% of segments`);

    // N-4 is written against 20 minutes.
    const projected = (result.elapsedSeconds / duration) * 20 * 60;
    console.log(
      `  N-4 projection ${(projected / 60).toFixed(1)} min for a 20-minute recording ` +
        `${projected <= 180 ? '(within the 3 min limit)' : '(OVER the 3 min limit)'}`
    );

    const conf = assessConfidence(result);
    console.log('\n── I-7 confidence ────────────────────────────────');
    console.log(`  usable         ${conf.usable}`);
    console.log(`  score          ${conf.confidence}`);
    console.log(`  reason         ${conf.reason}`);

    const grouped = groupBySpeaker(result.segments);
    console.log('\n── grouping ──────────────────────────────────────');
    console.log(`  ${result.segments.length} raw segments -> ${grouped.length} merged turns`);
    for (const s of grouped.slice(0, 4)) {
      console.log(
        `    [${s.isEnrolled ? 'YOU ' : 'THEM'}] ${s.start.toFixed(1)}-${s.end.toFixed(1)}s  ` +
          `${s.text.trim().slice(0, 62)}...`
      );
    }

    const outOfOrder = result.segments.filter(
      (s, i, a) => s.start < 0 || s.end > duration + 5 || (i > 0 && s.start < a[i - 1].start)
    );
    console.log('\n── timestamp sanity ──────────────────────────────');
    console.log(
      outOfOrder.length === 0
        ? '  OK — monotonic and within the source duration'
        : `  ${outOfOrder.length} segments out of order or outside the duration`
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
