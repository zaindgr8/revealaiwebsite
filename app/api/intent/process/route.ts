import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  assessConfidence,
  groupBySpeaker,
  transcribeChunks,
  TranscriptionError,
} from '@/lib/transcription';

/**
 * Drives an intent session from uploaded audio to a stored transcript.
 *
 *   uploaded -> transcribing -> analysing -> complete
 *                            \-> insufficient_quality   (I-7)
 *                            \-> failed                 (N-3, retryable)
 *
 * N-8 asks for processing to run as a background job with visible status, so
 * this returns as soon as the work is dispatched and the client polls the row.
 *
 * The analysis step is not built. It is blocked on decision D-1, which decides
 * whether the output carries scores or observations — and that changes the
 * schema, not just the wording. The session therefore stops at 'analysing'
 * with a stored transcript, which is genuinely useful on its own and is what
 * Demo 4 shows.
 */

export const maxDuration = 300;

async function fail(
  db: SupabaseClient,
  sessionId: string,
  status: 'failed' | 'insufficient_quality',
  message: string,
  extra: Record<string, unknown> = {}
) {
  await db
    .from('intent_sessions')
    .update({ status, error: message, ...extra })
    .eq('id', sessionId);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sessionId = body.session_id;
  if (typeof sessionId !== 'string' || !sessionId) {
    return NextResponse.json({ error: 'session_id is required' }, { status: 400 });
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Everything runs under the caller's JWT so RLS confines it to their own
  // session and their own audio.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  try {
    const { data: session, error: sessionErr } = await db
      .from('intent_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // I-3: a session that never had consent confirmed must not be processed,
    // whatever its status says. This is the last point at which that can be
    // enforced before audio is sent to a third party.
    if (!session.consent_confirmed_at) {
      return NextResponse.json(
        { error: 'Consent was not confirmed for this session.' },
        { status: 403 }
      );
    }

    // Idempotent. Re-entry from a retry or a double-click must not start a
    // second transcription of the same audio.
    if (['transcribing', 'analysing', 'complete'].includes(session.status)) {
      return NextResponse.json({ ok: true, status: session.status, already_running: true });
    }
    if (!['uploaded', 'failed'].includes(session.status)) {
      return NextResponse.json(
        { error: `Session is ${session.status}; nothing to process.` },
        { status: 409 }
      );
    }

    const { data: enrollment } = await db
      .from('voice_enrollments')
      .select('reference_path')
      .maybeSingle();

    if (!enrollment?.reference_path) {
      await fail(
        db,
        sessionId,
        'failed',
        'No usable voice sample found. Please record your voice again in Settings.'
      );
      return NextResponse.json(
        { error: 'No voice enrollment reference available.' },
        { status: 400 }
      );
    }

    // Segments from migration 0006, falling back to the single-file column for
    // sessions recorded before segmented recording existed.
    const paths: string[] =
      session.segment_paths ?? (session.storage_path ? [session.storage_path] : []);
    const durations: number[] =
      session.segment_durations ?? [session.duration_seconds ?? 0];

    if (paths.length === 0) {
      await fail(db, sessionId, 'failed', 'No audio is attached to this session.');
      return NextResponse.json({ error: 'No audio to process.' }, { status: 400 });
    }

    await db.from('intent_sessions').update({ status: 'transcribing', error: null }).eq('id', sessionId);

    const [refDownload, ...segmentDownloads] = await Promise.all([
      db.storage.from('voice-enrollments').download(enrollment.reference_path),
      ...paths.map((p) => db.storage.from('intent-recordings').download(p)),
    ]);

    if (refDownload.error || !refDownload.data) {
      await fail(db, sessionId, 'failed', 'Could not read your voice sample.');
      return NextResponse.json({ error: 'Reference download failed' }, { status: 500 });
    }

    const missing = segmentDownloads.findIndex((d) => d.error || !d.data);
    if (missing !== -1) {
      await fail(db, sessionId, 'failed', `Could not read audio segment ${missing + 1}.`);
      return NextResponse.json({ error: 'Audio download failed' }, { status: 500 });
    }

    // Offsets are cumulative durations, which is what shifts each segment's
    // timestamps back onto the real conversation timeline.
    let running = 0;
    const chunks = [];
    for (let i = 0; i < segmentDownloads.length; i++) {
      chunks.push({
        data: await segmentDownloads[i].data!.arrayBuffer(),
        offsetSeconds: running,
      });
      running += durations[i] ?? 0;
    }

    const result = await transcribeChunks({
      apiKey,
      chunks,
      reference: { data: await refDownload.data.arrayBuffer(), mimeType: 'audio/wav' },
      mimeType: session.mime_type ?? 'audio/webm',
    });

    // I-7: withhold rather than present a confident read of the wrong person.
    const confidence = assessConfidence(result);
    if (!confidence.usable) {
      await fail(db, sessionId, 'insufficient_quality', confidence.reason, {
        attribution_confidence: confidence.confidence,
      });
      return NextResponse.json({
        ok: true,
        status: 'insufficient_quality',
        reason: confidence.reason,
      });
    }

    const grouped = groupBySpeaker(result.segments);

    const { error: writeErr } = await db
      .from('intent_sessions')
      .update({
        status: 'analysing',
        attribution_confidence: confidence.confidence,
        transcript: {
          segments: grouped,
          speakers: result.speakers,
          enrolled_share: result.enrolledShare,
          chunk_count: result.chunkCount,
          transcribed_in_seconds: result.elapsedSeconds,
        },
      })
      .eq('id', sessionId);

    if (writeErr) {
      // Not swallowed. The audio is still in storage, so 'failed' is accurate
      // and the session stays retryable rather than looking done but empty.
      console.error(`[intent/process] transcript write failed for ${sessionId}:`, writeErr.message);
      await fail(db, sessionId, 'failed', `Could not save the transcript: ${writeErr.message}`);
      return NextResponse.json({ error: writeErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      status: 'analysing',
      segments: grouped.length,
      speakers: result.speakers,
      confidence: confidence.confidence,
      transcribed_in_seconds: Number(result.elapsedSeconds.toFixed(1)),
    });
  } catch (err) {
    const retryable = err instanceof TranscriptionError ? err.retryable : true;
    const message = (err as Error).message || 'Processing failed';
    console.error('[intent/process] Error:', err);
    await fail(
      db,
      sessionId,
      'failed',
      retryable ? `${message} You can try again.` : message
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
