/**
 * How stable is speaker separation between runs on identical audio?
 *
 *   npx tsx scripts/measureStability.ts [runs] [sessionId]
 *   npx tsx scripts/measureStability.ts [runs] --file <audio>   local file
 *
 * Demo 5 promises the client this exact experiment: "I will run the same
 * recording through twice in front of you. That is not padding. It shows how
 * stable the output actually is between runs." This automates it, and it
 * answers I-4 (90% attribution) and N-4 (20 minutes inside 3) at the same time,
 * because both are claims about behaviour that varies run to run.
 *
 * It pulls the audio the session already has in storage rather than taking a
 * local file, so what is measured is the exact bytes the product processed —
 * no re-encoding, no "worked on my copy".
 *
 * Runs against the transcription module directly, not through the route, so no
 * user JWT is needed and no session rows are mutated. The route adds auth,
 * consent checks and status writes; none of those affect what the API returns.
 *
 * Three things to read in the output:
 *
 *   WORST CHUNK  The most speaker labels any single chunk needed. Two people in
 *                one five-minute window should produce two. Judge separation on
 *                THIS, never on the raw total — diarization works intra-chunk
 *                only, so the other party is renamed in every chunk and a clean
 *                four-chunk recording legitimately shows five raw labels.
 *
 *   STRAY        Share of segments in labels beyond the two largest, per chunk.
 *                This is the material the model could not confidently place.
 *
 *   ELAPSED      Wall clock, checked against N-4's 3-minute promise directly.
 *                Do not judge this by realtime ratio: elapsed/total-audio falls
 *                automatically as chunks parallelise, so a 20-minute recording
 *                sitting right on the limit still reports a flattering 0.15x.
 */

import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  transcribeChunks,
  suppressFragments,
  sliceWav,
  CHUNK_SECONDS,
  MAX_CONCURRENCY,
} from '../lib/transcription';

/**
 * Guards the fragment suppression before any audio is fetched or paid for.
 *
 * suppressFragments decides which segments get their speaker rewritten, so a
 * bug in it silently changes who said what — the one error this product cannot
 * afford and the one a reader would never spot, because the output looks
 * cleaner precisely when it is wrong.
 *
 * The fixture is the real thing: chunk 0 of the 12 August recording came back
 * as {me:6, C:5, A:1, B:1, D:1}, two genuine voices and three stray fragments.
 */
{
  const seg = (speaker: string) => ({ speaker });
  const measured = ['me', 'C', 'me', 'A', 'C', 'me', 'C', 'B', 'me', 'C', 'me', 'D', 'C', 'me'];
  const { cleaned, strayCount } = suppressFragments(measured.map(seg));
  const labels = [...new Set(cleaned.map((s) => s.speaker))];

  if (strayCount !== 3) {
    throw new Error(`suppressFragments: expected 3 stray segments, counted ${strayCount}`);
  }
  if (labels.length !== 2 || !labels.includes('me') || !labels.includes('C')) {
    throw new Error(`suppressFragments: expected [me, C] after cleanup, got [${labels}]`);
  }

  // A genuinely two-speaker chunk must come back untouched — suppression that
  // fires on clean input would be rewriting correct attributions.
  const clean = ['me', 'A', 'me', 'A', 'me'].map(seg);
  const untouched = suppressFragments(clean);
  if (untouched.strayCount !== 0) {
    throw new Error('suppressFragments: altered a clean two-speaker chunk');
  }

  // A quiet enrolled speaker must survive. 'me' is anchored to a voiceprint,
  // so it is kept however little it says, and only the third label goes.
  const quiet = ['A', 'A', 'A', 'A', 'me', 'B', 'A'].map(seg);
  const quietOut = suppressFragments(quiet);
  if (!quietOut.cleaned.some((s) => s.speaker === 'me')) {
    throw new Error('suppressFragments: reassigned the enrolled speaker away');
  }

  // sliceWav, against the header shape that already broke it once.
  //
  // The first version assumed a 44-byte header. audioSplit.ts writes exactly
  // that, so it passed every test against product audio — while ffmpeg writes a
  // LIST chunk and starts the samples at byte 78. The magic bytes matched, the
  // guard let it through, and it sliced 34 bytes of header as if it were audio.
  // A refusal would have been fine; a wrong clip fed to a voiceprint matcher is
  // not.
  const makeWav = (seconds: number, extraChunk: boolean) => {
    const rate = 16000;
    const bytes = seconds * rate * 2;
    const list = extraChunk ? 8 + 26 : 0;
    const buf = new ArrayBuffer(12 + 24 + list + 8 + bytes);
    const v = new DataView(buf);
    const ascii = (o: number, t: string) => {
      for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i));
    };
    ascii(0, 'RIFF');
    v.setUint32(4, buf.byteLength - 8, true);
    ascii(8, 'WAVEfmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    let off = 36;
    if (extraChunk) {
      ascii(off, 'LIST');
      v.setUint32(off + 4, 26, true);
      off += 8 + 26;
    }
    ascii(off, 'data');
    v.setUint32(off + 4, bytes, true);
    // Mark the first sample so a wrong offset is detectable.
    v.setInt16(off + 8, 0x4321, true);
    return buf;
  };

  for (const withList of [false, true]) {
    const wav = makeWav(20, withList);
    const clip = sliceWav(wav, 0, 5);
    if (!clip) throw new Error(`sliceWav: refused a valid WAV (LIST chunk: ${withList})`);
    // 44-byte canonical header + 5s of 16kHz 16-bit mono.
    const expected = 44 + 5 * 16000 * 2;
    if (clip.byteLength !== expected) {
      throw new Error(`sliceWav: expected ${expected} bytes, got ${clip.byteLength}`);
    }
    // The marked first sample must be the first sample of the clip, which it
    // only is if the data offset was found rather than assumed.
    if (new DataView(clip).getInt16(44, true) !== 0x4321) {
      throw new Error(`sliceWav: sliced from the wrong offset (LIST chunk: ${withList})`);
    }
  }

  // An mp3 must be refused, not sliced into something plausible.
  const notWav = new ArrayBuffer(2048);
  new DataView(notWav).setUint32(0, 0x49443303, false); // "ID3"
  if (sliceWav(notWav, 0, 5)) throw new Error('sliceWav: accepted non-WAV audio');
}

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

const SUPABASE_URL = env('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = env('SUPABASE_SECRET_KEY');
const OPENAI_KEY = env('OPENAI_API_KEY');

const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rest<T>(path: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!res.ok) throw new Error(`REST ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function download(bucket: string, path: string): Promise<ArrayBuffer> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, { headers });
  if (!res.ok) throw new Error(`storage ${bucket}/${path}: ${res.status}`);
  return res.arrayBuffer();
}

type SessionRow = {
  id: string;
  user_id: string;
  mime_type: string | null;
  duration_seconds: number | null;
  segment_paths: string[] | null;
  segment_durations: number[] | null;
  storage_path: string | null;
};

/**
 * Splits a local file the same way the recorder splits during capture, so a
 * file that never went through the product can still be measured. N-4 is a
 * claim about 20-minute recordings and the app has only ever stored short
 * ones, so without this the requirement cannot be tested at all.
 */
function splitLocal(path: string): { chunks: { data: ArrayBuffer; offsetSeconds: number }[]; seconds: number } {
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
    { encoding: 'utf8' }
  );
  const seconds = parseFloat(probe.trim());
  const dir = mkdtempSync(join(tmpdir(), 'stability-'));
  try {
    execFileSync('ffmpeg', [
      '-v', 'error', '-i', path,
      // 16kHz mono WAV, matching what audioSplit.ts produces in the browser.
      // The probe slices WAV by byte offset and skips anything else, so an mp3
      // here would silently measure the pre-probe pipeline.
      '-ar', '16000', '-ac', '1',
      '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
      join(dir, 'part-%03d.wav'),
    ]);
    const parts = readdirSync(dir).filter((f) => f.startsWith('part-')).sort();
    const chunks = parts.map((f, i) => {
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

async function main() {
  const runs = Number(process.argv[2] ?? 2);
  const fileFlag = process.argv.indexOf('--file');
  const localFile = fileFlag !== -1 ? process.argv[fileFlag + 1] : undefined;
  const wanted = fileFlag === -1 ? process.argv[3] : undefined;

  const sessions = await rest<SessionRow[]>(
    'intent_sessions?select=id,user_id,mime_type,duration_seconds,segment_paths,segment_durations,storage_path' +
      (wanted ? `&id=eq.${wanted}` : '&status=eq.analysing') +
      '&order=created_at.desc&limit=1'
  );
  if (sessions.length === 0) {
    console.error('No processed session found. Upload one first, or pass a session id.');
    process.exit(1);
  }
  const s = sessions[0];

  const enrolments = await rest<{ reference_path: string | null }[]>(
    `voice_enrollments?select=reference_path&user_id=eq.${s.user_id}&limit=1`
  );
  const referencePath = enrolments[0]?.reference_path;
  if (!referencePath) {
    console.error('That user has no enrolment reference clip.');
    process.exit(1);
  }

  // The enrolment reference always comes from the database, even for a local
  // file. It is the voiceprint the product actually ships with, so measuring
  // against anything else would measure a system nobody runs.
  const reference = { data: await download('voice-enrollments', referencePath), mimeType: 'audio/wav' };

  let chunks: { data: ArrayBuffer; offsetSeconds: number }[];
  let audioSeconds: number;
  let mimeType: string;

  if (localFile) {
    const split = splitLocal(localFile);
    chunks = split.chunks;
    audioSeconds = split.seconds;
    mimeType = 'audio/wav';
    console.log(`file      ${localFile}`);
  } else {
    const paths = s.segment_paths ?? (s.storage_path ? [s.storage_path] : []);
    const durations = s.segment_durations ?? [s.duration_seconds ?? 0];
    audioSeconds = s.duration_seconds ?? 0;
    mimeType = s.mime_type ?? 'audio/webm';
    let running = 0;
    chunks = [];
    for (let i = 0; i < paths.length; i++) {
      chunks.push({ data: await download('intent-recordings', paths[i]), offsetSeconds: running });
      running += durations[i] ?? 0;
    }
    console.log(`session   ${s.id}`);
  }

  console.log(`audio     ${audioSeconds.toFixed(1)}s across ${chunks.length} chunk(s)`);
  console.log(`runs      ${runs}\n`);

  // Measure rawSpeakers/worstChunkSpeakers, NOT `speakers`. Since collapsing
  // landed, `speakers` is always ['me','them'] by construction — reporting it
  // would print "2-2 stable" on every recording including a catastrophic one.
  const results: {
    raw: string[];
    worstChunk: number;
    stray: number;
    segments: number;
    share: number;
    elapsed: number;
  }[] = [];

  for (let r = 1; r <= runs; r++) {
    process.stdout.write(`run ${r} ... `);
    const out = await transcribeChunks({
      apiKey: OPENAI_KEY,
      chunks,
      reference,
      mimeType,
    });
    results.push({
      raw: out.rawSpeakers,
      worstChunk: out.worstChunkSpeakers,
      stray: out.strayShare,
      segments: out.segments.length,
      share: out.enrolledShare,
      elapsed: out.elapsedSeconds,
    });
    const ratio = (out.elapsedSeconds / (audioSeconds || 1)).toFixed(2);
    console.log(
      `worst chunk ${out.worstChunkSpeakers} voices, ` +
        `${(out.strayShare * 100).toFixed(0)}% stray, ` +
        `raw [${out.rawSpeakers.join(',')}], ` +
        `${out.segments.length} segments, ` +
        `${(out.enrolledShare * 100).toFixed(0)}% enrolled, ` +
        `${out.elapsedSeconds.toFixed(0)}s (${ratio}x realtime)`
    );
  }

  const spread = (xs: number[]) => ({
    min: Math.min(...xs),
    max: Math.max(...xs),
    same: new Set(xs).size === 1,
  });

  const speakerCounts = results.map((r) => r.worstChunk);
  const segmentCounts = results.map((r) => r.segments);
  const times = results.map((r) => r.elapsed);

  const sp = spread(speakerCounts);
  const sg = spread(segmentCounts);
  const tm = spread(times);

  console.log(`\n${'─'.repeat(64)}`);
  const strays = results.map((r) => r.stray);
  console.log(
    `worst chunk  ${sp.min}-${sp.max} voices   ${sp.same ? 'stable' : 'VARIES between runs'}`
  );
  console.log(
    `stray        ${(Math.min(...strays) * 100).toFixed(0)}-${(Math.max(...strays) * 100).toFixed(0)}%` +
      '   of segments the model could not place'
  );
  console.log(`segments     ${sg.min}-${sg.max}   ${sg.same ? 'stable' : 'VARIES between runs'}`);
  console.log(
    `elapsed      ${tm.min.toFixed(0)}-${tm.max.toFixed(0)}s   ` +
      `${(tm.max / Math.max(tm.min, 0.001)).toFixed(1)}x spread`
  );

  if (sp.max > 2) {
    console.log(
      `\nI-4: a single chunk needed ${sp.max} voices for a two-person recording.\n` +
        '     Measured per chunk, so this is genuine over-splitting, not the\n' +
        '     expected cross-chunk relabelling. Compare against the stray share:\n' +
        '     a high voice count made up of one-segment fragments is far less\n' +
        '     serious than one that splits the conversation down the middle.'
    );
  }
  // N-4 is a wall-clock promise — "a 20-minute recording completes analysis
  // within 3 minutes" — so it is checked against the clock, not against a
  // realtime ratio.
  //
  // A ratio is actively misleading here. Elapsed divided by total audio
  // improves automatically as chunks run in parallel: the 20-minute podcast
  // reported 0.15x while three of its runs sat around the 3-minute limit,
  // because 4 chunks at concurrency 4 divide the ratio by four without making
  // anything faster. The earlier 0.6x threshold could never fire on a
  // four-chunk recording, which is exactly the case N-4 is about.
  //
  // What matters is the slowest wave: with N chunks at concurrency C there are
  // ceil(N/C) waves, and each takes about one chunk's processing time.
  const N4_LIMIT_SECONDS = 180;
  const waves = Math.ceil(chunks.length / MAX_CONCURRENCY);
  const perWave = tm.max / waves;
  // What a full 20 minutes would cost at this speed, in the same wave shape.
  const projected = perWave * Math.ceil(1200 / CHUNK_SECONDS / MAX_CONCURRENCY);

  if (projected > N4_LIMIT_SECONDS) {
    console.log(
      `\nN-4 FAILS: slowest run projects to ${(projected / 60).toFixed(1)} minutes for a\n` +
        `     20-minute recording, against a ${N4_LIMIT_SECONDS / 60}-minute limit.\n` +
        '     This is transcription only — analysis (I-5) is not built and its\n' +
        '     time lands on top of this.'
    );
  } else if (projected > N4_LIMIT_SECONDS * 0.85) {
    console.log(
      `\nN-4 MARGINAL: ${(projected / 60).toFixed(1)} minutes projected against a ` +
        `${N4_LIMIT_SECONDS / 60}-minute limit,\n` +
        '     and analysis time is not included. Re-measure before relying on it.'
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
