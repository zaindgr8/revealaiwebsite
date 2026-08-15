import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { Segment } from '@/lib/transcription';
import type { IntentScenario } from '@/lib/audioStorage';
import { analyseConversation, IntentAnalysisError } from '@/lib/intentAnalysis';

/**
 * I-5: read a stored transcript and produce the analysis.
 *
 *   analysing -> complete
 *             \-> insufficient_quality   (I-7, when there is too little to read)
 *             \-> analysing              (a plain failure stays here, retryable)
 *
 * Separate from /api/intent/process rather than tacked onto the end of it, for
 * two reasons.
 *
 * Transcription of a 20-minute recording already runs to around two minutes
 * against a 300-second ceiling. Adding a second model call to the same request
 * spends the remaining headroom on work that does not need to be there.
 *
 * And it makes failure granular. If analysis fails, the transcript is still
 * stored and still worth reading; the session stays at 'analysing' and the user
 * can try the analysis again without re-transcribing an hour of audio and
 * paying for it twice.
 */

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
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

  // Under the caller's JWT, so RLS confines this to their own session.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  try {
    const { data: session, error: sessionErr } = await db
      .from('intent_sessions')
      .select('id, status, scenario, transcript, analysis, other_speaker_name, consent_confirmed_at')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // I-3 again. The transcript already exists, but consent can be withdrawn
    // between transcription and analysis, and this is a second send to a third
    // party — it gets checked on its own terms rather than inheriting the
    // decision made upstream.
    if (!session.consent_confirmed_at) {
      return NextResponse.json(
        { error: 'Consent was not confirmed for this session.' },
        { status: 403 }
      );
    }

    // Idempotent. The result page fires this the moment it sees 'analysing',
    // and polling means it can see that state more than once.
    if (session.status === 'complete' && session.analysis) {
      return NextResponse.json({ ok: true, status: 'complete', already_analysed: true });
    }
    if (session.status !== 'analysing') {
      return NextResponse.json(
        { error: `Session is ${session.status}; there is nothing to analyse.` },
        { status: 409 }
      );
    }

    const transcript = session.transcript as { segments?: Segment[] } | null;
    const segments = transcript?.segments ?? [];
    if (segments.length === 0) {
      return NextResponse.json({ error: 'This session has no transcript.' }, { status: 409 });
    }

    const analysis = await analyseConversation({
      apiKey,
      segments,
      scenario: (session.scenario as IntentScenario) ?? 'general',
      themLabel: session.other_speaker_name?.trim() || 'them',
    });

    const { error: writeErr } = await db
      .from('intent_sessions')
      .update({
        status: 'complete',
        error: null,
        analysis,
        // Mirrored into the plain column so Profile History can show what the
        // conversation was without loading and parsing the whole analysis blob
        // for every row on the page.
        summary: analysis.overall || null,
      })
      .eq('id', sessionId);

    if (writeErr) {
      // Left at 'analysing' on purpose. The work is redoable and the transcript
      // is intact, so this is a retry rather than a dead session.
      console.error(`[intent/analyse] write failed for ${sessionId}:`, writeErr.message);
      return NextResponse.json(
        { error: `Could not save the analysis: ${writeErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      status: 'complete',
      moments: analysis.moments.length,
      diagnostics: analysis.diagnostics,
    });
  } catch (err) {
    const message = (err as Error).message || 'Analysis failed';

    // Not enough of the other person to read is I-7's outcome, not a fault:
    // terminal, and phrased as a finding rather than an apology.
    if (err instanceof IntentAnalysisError && err.insufficient) {
      await db
        .from('intent_sessions')
        .update({ status: 'insufficient_quality', error: message })
        .eq('id', sessionId);
      return NextResponse.json({ ok: true, status: 'insufficient_quality', reason: message });
    }

    console.error('[intent/analyse] Error:', err);
    // Status untouched — see the write failure above. Recording the message
    // still lets the page explain itself.
    await db.from('intent_sessions').update({ error: message }).eq('id', sessionId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
