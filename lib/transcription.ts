/**
 * Chunked speaker-attributed transcription.
 *
 * No 'use client': runs server-side from the processing route.
 *
 * MEASURED, NOT ASSUMED
 *
 * 6 August 2026, a 15-minute two-person podcast:
 *
 *   single request, 898.6s audio  ->  301.1s   (0.335x realtime)
 *   4 chunks in parallel          ->   85.2s   (0.095x realtime)
 *
 * 3.5x faster, with 98.6% timeline agreement against the single-pass result.
 * Chunking is not an optimisation here — it is the only way N-4's three minutes
 * is reachable at all.
 *
 * That 85.2s did not reproduce, and reading it as typical was the mistake.
 * 12 August 2026, a real 19.5-minute recording, three runs at the then-current
 * 300s chunks and concurrency 4:
 *
 *   163s, 180s, 213s   against N-4's 180s limit
 *
 * One pass, one exactly on the line, one failure — and that is transcription
 * alone, before the analysis in /api/intent/analyse, whose time lands on top.
 * Same audio, same settings, a 1.3x spread between runs, so any single
 * measurement of this API is a sample and not a number.
 *
 * CHUNK_SECONDS and MAX_CONCURRENCY were resized against those figures rather
 * than the flattering one. Re-measure with scripts/measureStability.ts before
 * trusting any of it again; that script exists because these numbers move.
 *
 * WHAT CHUNKING DOES TO SPEAKER LABELS
 *
 * Splitting audio normally ruins diarization, because each chunk clusters
 * voices independently and "Speaker A" in chunk 1 is unrelated to "Speaker A"
 * in chunk 2. Sending every chunk with the same enrollment reference fixes
 * exactly half of that: the ENROLLED speaker is matched against a fixed
 * voiceprint in each request, so 'me' is anchored outside the audio and is
 * consistent throughout.
 *
 * The other party is not anchored by anything. Their label is invented afresh
 * per request, so a clean two-person recording in four chunks can legitimately
 * return five distinct labels — one 'me' plus four independent names for the
 * same second person. OpenAI's own guidance is blunt about this: diarization
 * works intra-chunk only. An earlier version of this comment claimed chunking
 * did not break labels at all, which was wrong and made the output look broken
 * when it was behaving as designed.
 *
 * Two consequences, both handled below:
 *   - Non-enrolled labels are collapsed to a single 'them' before anything
 *     downstream sees them, which makes cross-chunk relabelling a non-issue.
 *   - Separation quality is judged PER CHUNK (worstChunkSpeakers, strayShare).
 *     Counting labels globally measures how long the recording is, not how well
 *     anyone was separated.
 *
 * Boundaries were also measured. Splitting at fixed intervals, two of three
 * seams produced zero disagreements within 10 seconds and the third produced
 * two. Silence-aware splitting is an available refinement, not a prerequisite.
 */

const TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'gpt-4o-transcribe-diarize';

/** The label given to the enrolled speaker. Everything else is the other party. */
export const ENROLLED_LABEL = 'me';

/**
 * Target chunk length.
 *
 * Was 300s, which failed N-4. Measured 12 August 2026 on a real 19.5-minute
 * two-person recording, three runs at 300s chunks and concurrency 4:
 *
 *   163s, 180s, 213s   against a 180s limit
 *
 * One pass, one exactly on the line, one failure. The requirement is "a
 * 20-minute recording completes analysis within 3 minutes", and that was
 * transcription alone — the I-5 analysis runs afterwards in
 * /api/intent/analyse and its time lands on top.
 *
 * Wall time is roughly ceil(chunks / concurrency) waves, each costing about one
 * chunk's processing time. Per-chunk cost measured at 0.55-0.71x of chunk
 * length, so a single wave needs chunk_seconds * 0.71 < 180, i.e. chunks under
 * about 250s.
 *
 * Re-measured on the same recording at 180s and concurrency 8 — 7 chunks, one
 * wave:
 *
 *   99s, 103s, 126s   against the same 180s limit
 *
 * N-4 now passes with roughly 54 seconds spare for the analysis layer.
 *
 * Measured end to end on 15 August, once I-5 existed to measure — the same
 * 19.5-minute recording, two runs, transcription and analysis together:
 *
 *   transcribe  81s, 90s      analyse  17s, 19s      total  98s, 109s
 *
 * 110s projected for a full 20 minutes against the 180s limit, so 70s spare
 * rather than 54. Analysis is one model call over the whole transcript, not one
 * per chunk, so it is added flat rather than projected: a longer recording
 * makes the prompt longer, not the number of calls larger.
 *
 * Re-measure with `measureStability <runs> --file <audio> --analyse`.
 *
 * THIS WAS NOT FREE. The same three runs also moved separation quality:
 *
 *   300s chunks (4)  ->  2-3 voices per chunk, 0% stray
 *   180s chunks (7)  ->  4-5 voices per chunk, 3% stray
 *
 * Every boundary is another independent diarization pass, so shorter chunks buy
 * speed with fragmentation. 3% still leaves 97% of segments in the two main
 * voices, comfortably inside I-4's 90% bar, and both requirements now pass where
 * before one did not. But the I-4 margin is thinner than it was, and this was
 * measured on a clean podcast — a date in a restaurant will be worse on both
 * axes.
 *
 * Do not shrink this further without measuring both numbers. Per-request
 * overhead also grows as chunks shrink: recorded ratios were 0.29-0.38x at 225s,
 * 0.36x at 40s and 0.49x at 20s. Speed has a floor; accuracy does not.
 */
export const CHUNK_SECONDS = 180;

/**
 * Cap on simultaneous requests.
 *
 * Raised from 4 to 8 so a 20-minute recording clears in a single wave; at 180s
 * chunks that is 7 requests, and 8 covers up to 24 minutes before a second wave
 * doubles the wall time.
 *
 * Four was the last figure measured without degradation, so 8 is a deliberate
 * step past what has been proven. That is only defensible because retries now
 * exist: more simultaneous requests is precisely how a rate limit is found, and
 * before transcribeChunkWithRetry a single 429 failed the entire recording.
 * If 429s start appearing in logs, lower this before raising MAX_ATTEMPTS —
 * retries are paid for out of the same three minutes.
 */
export const MAX_CONCURRENCY = 8;

export type Segment = {
  id: string;
  text: string;
  speaker: string;
  start: number;
  end: number;
  /** True when this segment belongs to the enrolled user. */
  isEnrolled: boolean;
};

export type TranscriptionResult = {
  segments: Segment[];
  durationSeconds: number;
  chunkCount: number;
  elapsedSeconds: number;
  /** Share of segments attributed to the enrolled speaker, 0-1. */
  enrolledShare: number;
  /**
   * Distinct speaker labels after collapsing: 'me' and 'them', nothing else.
   * The product is two-party, so this is what the rest of the app consumes.
   */
  speakers: string[];
  /**
   * What the API actually returned, before collapsing — 'me', 'A', 'B', ...
   *
   * Kept because collapsing must not destroy the evidence. Measured on one
   * six-minute two-person recording, four runs on 12 August 2026, the API
   * returned 3, 3, 4 and 5 speakers. It never returned 2. Without this field
   * the app sees a tidy two-party transcript every time and cannot tell the
   * difference between clean separation and a voice split four ways.
   *
   * Read it alongside worstChunkSpeakers, not on its own — a count above two
   * here is expected on any multi-chunk recording and is not itself a fault.
   */
  rawSpeakers: string[];
  /**
   * The most speaker labels any single chunk needed.
   *
   * This is the one to judge separation by. Labels do not carry across chunks,
   * so the global count grows with recording length no matter how clean the
   * audio is; within a chunk, two people should produce two labels.
   */
  worstChunkSpeakers: number;
  /**
   * Share of segments belonging to labels beyond the two largest, 0-1.
   *
   * The direct measure of how much of the conversation is attributed to people
   * who are not in the room. Zero when the API found two speakers.
   */
  strayShare: number;
};

/** The label every non-enrolled speaker collapses to. */
export const OTHER_LABEL = 'them';

export type SpeakerReference = { name: string; data: ArrayBuffer; mimeType: string };

/** The API accepts at most four known-speaker references per request. */
const MAX_REFERENCES = 4;
/** Documented bounds for a reference clip. Outside these the request is rejected. */
const REF_MIN_SECONDS = 2;
const REF_MAX_SECONDS = 10;


/** Bytes in a canonical WAV header — what this module writes, not what it reads. */
const WAV_HEADER_BYTES = 44;

/**
 * Locates the audio inside a WAV, and confirms it is the format we can slice.
 *
 * The header is NOT a fixed 44 bytes. That assumption is the reason the first
 * version of this silently produced garbage: audioSplit.ts writes a canonical
 * 44-byte header, but ffmpeg inserts a LIST chunk and starts the audio at byte
 * 78. The magic bytes matched, so the guard passed and the slice began 34 bytes
 * inside the header — a wrong answer rather than a refusal, which is the worse
 * failure.
 *
 * So the chunk table is walked properly. Returns undefined for anything that is
 * not 16-bit PCM, which is the only format the byte arithmetic below is valid
 * for.
 */
function readWavLayout(
  data: ArrayBuffer
): { dataStart: number; dataLength: number; bytesPerSecond: number; channels: number; sampleRate: number } | undefined {
  if (data.byteLength < 44) return undefined;
  const view = new DataView(data);
  const tag = (off: number) =>
    String.fromCharCode(view.getUint8(off), view.getUint8(off + 1), view.getUint8(off + 2), view.getUint8(off + 3));

  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return undefined;

  let offset = 12;
  let bytesPerSecond: number | undefined;
  let channels = 1;
  let sampleRate = 16000;

  while (offset + 8 <= data.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ' && size >= 16) {
      const format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      const bitsPerSample = view.getUint16(body + 14, true);
      // 1 = PCM. Anything else and the offsets below mean nothing.
      if (format !== 1 || bitsPerSample !== 16) return undefined;
      bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
    }

    if (id === 'data') {
      if (!bytesPerSecond) return undefined;
      return {
        dataStart: body,
        dataLength: Math.min(size, data.byteLength - body),
        bytesPerSecond,
        channels,
        sampleRate,
      };
    }

    offset = body + size + (size % 2); // chunks are word-aligned
  }
  return undefined;
}

/**
 * Cuts a span out of a 16kHz mono 16-bit WAV by byte arithmetic.
 *
 * Deliberately not a decode. This runs server-side where there is no Web Audio
 * API, and pulling in a codec to extract a few seconds would be a dependency
 * for one small job. The format is fixed and known — audioSplit.ts encodes
 * every chunk this way — so the offsets are just arithmetic, and the header is
 * copied verbatim with the sizes rewritten.
 *
 * Returns undefined for anything that is not that exact format rather than
 * producing a plausible-looking but wrong slice.
 */
export function sliceWav(data: ArrayBuffer, startSeconds: number, endSeconds: number): ArrayBuffer | undefined {
  const layout = readWavLayout(data);
  if (!layout) return undefined;
  const { dataStart, dataLength, bytesPerSecond, channels, sampleRate } = layout;

  const align = (n: number) => Math.floor(n / 2) * 2; // never split a sample
  const from = dataStart + align(Math.max(0, startSeconds) * bytesPerSecond);
  const to = Math.min(dataStart + dataLength, dataStart + align(endSeconds * bytesPerSecond));
  if (to - from < REF_MIN_SECONDS * bytesPerSecond) return undefined;

  const body = new Uint8Array(data, from, to - from);

  // A canonical 44-byte header is written rather than the source's copied,
  // because the source may carry LIST or other chunks whose offsets would no
  // longer describe the sliced audio. The format fields are taken from the
  // original so the clip declares the rate and channels it actually has.
  const out = new Uint8Array(WAV_HEADER_BYTES + body.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (off: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(off + i, text.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  view.setUint32(4, 36 + body.byteLength, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, bytesPerSecond, true);
  view.setUint16(32, channels * 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, body.byteLength, true);
  out.set(body, WAV_HEADER_BYTES);
  return out.buffer;
}


export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** From the API's Retry-After header, in ms, when it supplied one. */
    readonly retryAfterMs?: number
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

/**
 * Attempts per chunk, including the first.
 *
 * Three, not more. Retries are spent from the same budget as N-4's three
 * minutes, so a generous policy trades a rare failure for a common timeout —
 * which is the worse of the two. `retryable` had been set on the error since
 * this module was written and nothing ever read it; raising MAX_CONCURRENCY is
 * what made that matter, because more simultaneous requests is exactly how you
 * find a rate limit.
 */
const MAX_ATTEMPTS = 3;
/** Base for exponential backoff. Overridden by Retry-After when present. */
const RETRY_BASE_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs one chunk, retrying only what is worth retrying.
 *
 * Jitter matters more than usual here: every chunk is dispatched at the same
 * instant, so a rate limit hits all of them together and an unjittered backoff
 * would march them back into the wall in lockstep.
 */
async function transcribeChunkWithRetry(
  args: Parameters<typeof transcribeChunk>[0],
  onRetry?: (attempt: number, waitMs: number, reason: string) => void
): Promise<{ segments: Omit<Segment, 'isEnrolled'>[] }> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await transcribeChunk(args);
    } catch (err) {
      lastError = err;
      const retryable = err instanceof TranscriptionError && err.retryable;
      if (!retryable || attempt === MAX_ATTEMPTS) break;

      const hinted = err instanceof TranscriptionError ? err.retryAfterMs : undefined;
      const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
      const waitMs = hinted ?? backoff + Math.random() * backoff;
      onRetry?.(attempt, Math.round(waitMs), (err as Error).message);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

/**
 * One chunk, raw. Exported for scripts/testAttribution.ts, which needs the
 * speaker labels the API actually returned — transcribeChunks collapses them to
 * me/them, which is right for the product and useless for measuring whether the
 * separation was correct in the first place.
 */
export async function transcribeChunk({
  apiKey,
  audio,
  filename,
  mimeType,
  references,
}: {
  apiKey: string;
  audio: ArrayBuffer;
  filename: string;
  mimeType: string;
  /**
   * Voiceprints to anchor labels against. The API accepts up to four, each
   * 2-10 seconds; anything outside that window is rejected.
   */
  references: SpeakerReference[];
}): Promise<{ segments: Omit<Segment, 'isEnrolled'>[] }> {
  const form = new FormData();
  form.append('file', new Blob([audio], { type: mimeType }), filename);
  form.append('model', MODEL);
  form.append('response_format', 'diarized_json');
  // Required for diarization models. Omitting it returns a 400 rather than
  // defaulting to anything, and it is not mentioned on the model page.
  form.append('chunking_strategy', 'auto');
  for (const ref of references.slice(0, MAX_REFERENCES)) {
    form.append('known_speaker_names[]', ref.name);
    form.append(
      'known_speaker_references[]',
      `data:${ref.mimeType};base64,${Buffer.from(ref.data).toString('base64')}`
    );
  }

  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    // 429 and 5xx are worth another attempt; a 400 means the request itself is
    // wrong and retrying it just burns time before failing the same way.
    const retryable = res.status === 429 || res.status >= 500;
    // The API's own backoff hint, when it gives one. Preferred over guessing.
    const retryAfter = Number(res.headers.get('retry-after'));
    throw new TranscriptionError(
      `Transcription failed (${res.status}): ${body}`,
      retryable,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined
    );
  }

  const json = (await res.json()) as {
    segments?: { id?: string; text?: string; speaker?: string; start?: number; end?: number }[];
  };

  return {
    segments: (json.segments ?? []).map((s, i) => ({
      id: s.id ?? `seg-${i}`,
      text: s.text ?? '',
      speaker: s.speaker ?? 'unknown',
      start: s.start ?? 0,
      end: s.end ?? 0,
    })),
  };
}

/**
 * Reassigns segments belonging to labels that barely exist in their chunk.
 *
 * The documented remedy for what the research calls rapid label flipping:
 * "merge short segments and remove spurious labels". Measured here as chunks
 * returning {me:6, C:5, A:1, B:1, D:1} — two real voices and three one-segment
 * fragments — and as single words ping-ponging between labels inside one
 * second.
 *
 * Frequency, not duration, decides what is spurious. A short segment is not
 * suspicious on its own; "Mm." and "Right." are real turns and dropping them by
 * length would delete the listening half of a conversation. What marks a
 * fragment is belonging to a label with almost no presence in the chunk, which
 * means the model reached for a new speaker rather than committing to an
 * existing one.
 *
 * Reassignment follows the neighbours, because a fragment sits inside somebody
 * else's turn — that is how it came to be a fragment. The enrolled label is
 * never reassigned away: it is the only label anchored to a voiceprint rather
 * than invented per request, so it is the one piece of evidence worth trusting.
 *
 * Operates per chunk, since labels mean nothing across chunk boundaries.
 * Returns the count it changed so the caller can still report how much needed
 * fixing — cleaning the transcript must not erase the fact that it was dirty.
 */
export function suppressFragments<T extends { speaker: string }>(
  chunkSegments: T[]
): { cleaned: T[]; strayCount: number } {
  if (chunkSegments.length === 0) return { cleaned: chunkSegments, strayCount: 0 };

  const counts = new Map<string, number>();
  for (const s of chunkSegments) counts.set(s.speaker, (counts.get(s.speaker) ?? 0) + 1);

  // The two labels this chunk is actually about. 'me' is always one of them
  // when present, however little it says — a quiet participant is still a
  // participant, and the voiceprint match is stronger evidence than volume.
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  const keep = new Set<string>();
  if (counts.has(ENROLLED_LABEL)) keep.add(ENROLLED_LABEL);
  for (const label of ranked) {
    if (keep.size >= 2) break;
    keep.add(label);
  }

  let strayCount = 0;
  const cleaned = chunkSegments.map((s, i) => {
    if (keep.has(s.speaker)) return s;
    strayCount++;

    // Prefer the label on both sides when they agree; otherwise take whichever
    // neighbour is a kept label. A fragment with no kept neighbour at all is
    // left alone rather than guessed at.
    const before = chunkSegments[i - 1]?.speaker;
    const after = chunkSegments[i + 1]?.speaker;
    const resolved =
      before && before === after && keep.has(before)
        ? before
        : before && keep.has(before)
          ? before
          : after && keep.has(after)
            ? after
            : undefined;

    return resolved ? { ...s, speaker: resolved } : s;
  });

  return { cleaned, strayCount };
}

/** Runs tasks with a fixed ceiling on how many are in flight at once. */
async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Transcribes pre-split audio chunks in parallel and stitches the result.
 *
 * Splitting itself is the caller's job — it needs a media tool this module
 * deliberately does not depend on, so the same logic works whether chunks come
 * from ffmpeg, from the browser during recording, or from a single-element
 * array when the recording is short.
 */
export async function transcribeChunks({
  apiKey,
  chunks,
  reference,
  mimeType,
}: {
  apiKey: string;
  /** Ordered, contiguous. offsetSeconds is where each starts in the original. */
  chunks: { data: ArrayBuffer; offsetSeconds: number }[];
  reference: { data: ArrayBuffer; mimeType: string };
  mimeType: string;
}): Promise<TranscriptionResult> {
  if (chunks.length === 0) {
    throw new TranscriptionError('No audio chunks supplied', false);
  }

  const started = Date.now();

  // One reference: the enrolled speaker.
  //
  // A second reference for the other party was built and measured on 12 August
  // 2026 — probe the opening 45 seconds, find a stretch where they speak alone,
  // use it as their voiceprint for every chunk. It worked, and it was not worth
  // it: 141-143s against 93-107s without, for a stray share of 1-3% against
  // 2-3%, which is inside the run-to-run noise. Forty seconds of N-4's budget
  // for no measurable gain.
  //
  // It is removed rather than disabled because the pieces that made it possible
  // are still here — transcribeChunk takes an array, and sliceWav is correct and
  // tested — so restoring it is small. Worth retrying when there is a recording
  // the enrolled user is actually in: the podcast used for that measurement had
  // no 'me' in it, so the two-anchor case the feature exists for never ran.
  const references: SpeakerReference[] = [{ name: ENROLLED_LABEL, ...reference }];

  const perChunk = await mapWithLimit(chunks, MAX_CONCURRENCY, (chunk, i) =>
    transcribeChunkWithRetry(
      {
        apiKey,
        audio: chunk.data,
        filename: `chunk-${i}.${mimeType.includes('mpeg') ? 'mp3' : 'wav'}`,
        mimeType,
        references,
      },
      (attempt, waitMs, reason) => {
        // Logged, not swallowed. A recording that quietly took two extra
        // attempts still ate its N-4 budget, and that has to be visible.
        console.warn(
          `[transcription] chunk ${i} attempt ${attempt} failed, retrying in ${waitMs}ms: ${reason}`
        );
      }
    )
  );

  // Timestamps come back relative to each chunk, so they are shifted into the
  // original timeline before merging. Without this every chunk would appear to
  // start at zero and the transcript would be unreadable.
  const segments: Segment[] = [];
  // Counted before suppression runs, so strayShare keeps reporting how much
  // needed fixing rather than how much survived it.
  let stray = 0;
  for (let i = 0; i < perChunk.length; i++) {
    const offset = chunks[i].offsetSeconds;
    const { cleaned, strayCount } = suppressFragments(perChunk[i].segments);
    stray += strayCount;
    for (const s of cleaned) {
      segments.push({
        ...s,
        // Namespaced by chunk. The API numbers segments from seg_1 within each
        // response, so a two-chunk recording comes back with two seg_1, two
        // seg_5, and so on. Offsetting the timestamps put them in the right
        // order but left the ids colliding, and React renders these as a keyed
        // list — duplicate keys mean rows can be dropped or duplicated on
        // re-render, which on a transcript means a line of the conversation
        // silently going missing.
        id: `c${i}-${s.id}`,
        start: s.start + offset,
        end: s.end + offset,
        isEnrolled: s.speaker === ENROLLED_LABEL,
      });
    }
  }
  segments.sort((a, b) => a.start - b.start);

  // Read from perChunk, NOT from segments. `segments` has been through
  // suppressFragments by this point, so taking labels from it would report the
  // tidied result and quietly claim the model did better than it did. perChunk
  // is untouched — suppressFragments returns new objects rather than mutating.
  const rawSpeakers = [...new Set(perChunk.flatMap((c) => c.segments.map((s) => s.speaker)))];

  // How much of the conversation sat outside the two main voices — measured
  // WITHIN each chunk, never across them, and counted before suppression.
  //
  // This distinction is the whole point. Diarization only works intra-chunk:
  // each request labels speakers independently, so chunk 1's other speaker is
  // "A" and chunk 2's other speaker may be "B" while being the same human. A
  // clean two-person recording split into four chunks can legitimately come
  // back with five distinct labels. Counting labels globally therefore measures
  // how many chunks there are, not how well anyone was separated, and would
  // condemn every long recording for the crime of being long.
  //
  // Counting within a chunk asks the question that actually has a right answer:
  // two people in this five-minute window should produce two labels. Anything
  // past the two largest is material the model could not confidently place.
  //
  // Measured on a six-minute two-person recording, 12 August 2026: chunk 1
  // returned {me:8, A:8} — clean. Chunk 0 returned {me:6, C:5, A:1, B:1, D:1} —
  // two real voices plus three one-segment fragments. Globally that reads as
  // five speakers and looks catastrophic; per chunk it is 3 stray segments out
  // of 30, which is the honest description.
  //
  // Reported even though suppressFragments has since reassigned those segments:
  // this is the quality signal assessConfidence judges on, and a transcript that
  // needed cleaning is not the same as one that was clean.
  const strayShare = segments.length > 0 ? stray / segments.length : 0;

  /** Most labels any single chunk needed. Two is clean; more is over-splitting. */
  const worstChunkSpeakers = Math.max(
    ...perChunk.map((c) => new Set(c.segments.map((s) => s.speaker)).size)
  );

  // Collapse here, in the data, rather than at render time.
  //
  // app/intent/[id]/page.tsx used to do this implicitly — `isEnrolled ? 'You' :
  // 'Them'` — which meant a recording split five ways displayed as a clean
  // two-party conversation with a high confidence score beside it. The split
  // was real and invisible. Collapsing at the source keeps the transcript
  // two-party AND keeps rawSpeakers, so the quality check below can see what
  // the display cannot.
  for (const s of segments) {
    if (!s.isEnrolled) s.speaker = OTHER_LABEL;
  }

  const enrolled = segments.filter((s) => s.isEnrolled).length;
  const last = segments[segments.length - 1];

  return {
    segments,
    durationSeconds: last ? last.end : 0,
    chunkCount: chunks.length,
    elapsedSeconds: (Date.now() - started) / 1000,
    enrolledShare: segments.length > 0 ? enrolled / segments.length : 0,
    speakers: [...new Set(segments.map((s) => s.speaker))],
    rawSpeakers,
    worstChunkSpeakers,
    strayShare,
  };
}

/**
 * Merges consecutive segments from the same speaker.
 *
 * Measured on real audio, 8 conversational turns came back as 19 segments —
 * the model splits on natural pauses, so a single answer arrives as
 * "Right," / "um," / "I'd rather hear the band first,". Handing those to the
 * analysis rubric as separate items reads as clipped, evasive speech when the
 * person actually spoke a full sentence.
 */
export function groupBySpeaker(segments: Segment[]): Segment[] {
  const grouped: Segment[] = [];
  for (const s of segments) {
    const prev = grouped[grouped.length - 1];
    if (prev && prev.speaker === s.speaker) {
      prev.text = `${prev.text.trim()} ${s.text.trim()}`.trim();
      prev.end = s.end;
    } else {
      grouped.push({ ...s });
    }
  }
  return grouped;
}

export type ConfidenceAssessment = {
  usable: boolean;
  confidence: number;
  reason: string;
};

/**
 * I-7: decide whether the separation is good enough to show a result.
 *
 * There is no confidence score in the API response, so this infers usability
 * from the shape of the output. Every rule below describes a failure that was
 * either observed during testing or is structurally obvious.
 *
 * The bar is deliberately conservative. Declining to answer is a stated
 * product position: better to say the recording could not be read than to
 * present a confident analysis of the wrong person.
 */
export function assessConfidence(result: TranscriptionResult): ConfidenceAssessment {
  const { segments, speakers, enrolledShare, strayShare = 0 } = result;
  // Judge separation per chunk, never on the global label count — see the note
  // beside worstChunkSpeakers. Falls back for transcripts stored before this
  // field existed.
  const worstChunk = result.worstChunkSpeakers ?? speakers.length;

  if (segments.length === 0) {
    return { usable: false, confidence: 0, reason: 'No speech was detected in the recording.' };
  }

  // Observed for real during testing: feeding a mismatched reference collapsed
  // a two-person conversation into a single speaker across all 17 segments.
  if (speakers.length < 2) {
    return {
      usable: false,
      confidence: 0.1,
      reason:
        'Only one voice could be separated out. The recording may be too quiet, ' +
        'too noisy, or the two people may sound too similar.',
    };
  }

  if (!speakers.includes(ENROLLED_LABEL)) {
    return {
      usable: false,
      confidence: 0.2,
      reason:
        'We could not find your voice in this recording. Check that your voice ' +
        'sample is up to date and that you were audible.',
    };
  }

  // A two-person conversation where one side holds 95%+ of segments is either
  // a monologue or a failed split. Neither produces a meaningful read of the
  // other person, which is the entire output.
  if (enrolledShare > 0.95 || enrolledShare < 0.05) {
    return {
      usable: false,
      confidence: 0.3,
      reason:
        'Almost all of the recording was attributed to one person, so there is ' +
        'not enough of the other side to analyse.',
    };
  }

  // Balance alone said 0.96 about a five-way split.
  //
  // The old score measured one thing: how evenly the audio divided between the
  // enrolled speaker and everyone else. That is necessary and nowhere near
  // sufficient. A recording where one person is split into four labels still
  // divides ~50/50 once those labels are collapsed, so it scored as excellent
  // while being exactly the failure I-7 exists to catch — a confident answer
  // about audio the system could not actually separate.
  //
  // strayShare is the missing signal: the share of the conversation attributed
  // to labels beyond the two main voices, i.e. to people who were not there.
  //
  // The 0.15 threshold is a FIRST CALIBRATION, not a measured value. It comes
  // from four runs of one six-minute two-person recording on 12 August 2026,
  // which produced 3, 3, 4 and 5 speakers and stray shares of roughly 0.18 to
  // 0.23 — all of which should decline, and do. It needs re-tuning against
  // recordings that separate cleanly, which this project does not yet have one
  // of. Widen it only with measurements, not with a demo deadline as the
  // argument.
  const STRAY_LIMIT = 0.15;

  if (strayShare > STRAY_LIMIT) {
    return {
      usable: false,
      confidence: Number(Math.max(0, 0.5 - strayShare).toFixed(2)),
      reason:
        `Parts of the recording separated into ${worstChunk} voices rather than two, and ` +
        `${Math.round(strayShare * 100)}% of it could not be reliably assigned to either ` +
        'person. Analysing it would mean describing someone who may not be there.',
    };
  }

  // Real two-person conversations measured at 0.42-0.56 enrolled share. The
  // further from balanced, the more likely part of one voice leaked into the
  // other, so confidence tapers rather than passing or failing outright.
  const balance = 1 - Math.abs(0.5 - enrolledShare) * 2;
  // Extra labels below the decline threshold still cost confidence. They are
  // evidence the voiceprint wobbled, even when little material landed there.
  const strayPenalty = strayShare / STRAY_LIMIT;
  const confidence = Math.min(1, 0.5 + balance * 0.5) * (1 - strayPenalty * 0.3);

  return {
    usable: true,
    confidence: Number(confidence.toFixed(2)),
    reason:
      worstChunk > 2
        ? `Separated into two speakers, though parts of the audio produced ${worstChunk} voices; ` +
          `${Math.round(enrolledShare * 100)}% attributed to you.`
        : `Two speakers separated, ${Math.round(enrolledShare * 100)}% attributed to you.`,
  };
}
