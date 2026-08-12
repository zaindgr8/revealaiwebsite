import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SUMMARY_PROMPT } from '@/prompts/summarise';

/**
 * T-4: when a session ends, generate and store a structured record containing
 * a summary, a mood value, and topics discussed.
 *
 * Acceptance: a new row appears in the session table within 30 seconds of
 * session end. maxDuration is set well inside that so a hung model call fails
 * rather than silently blowing the criterion.
 *
 * This is what feeds T-2's memory and T-5's Profile History. If it does not
 * run, the therapist has nothing to remember and history shows blank rows.
 */
export const maxDuration = 20;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';


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

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Every read and write below runs under the caller's JWT, so RLS enforces
  // that they can only summarise a session they own.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  try {
    const { data: session, error: sessionErr } = await db
      .from('coach_sessions')
      .select('id, ended_at')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Idempotent by design. The client may fire this on an explicit end and
    // again when a stale session is swept up later; summarising twice would
    // burn tokens and could overwrite a good summary with a worse one.
    if (session.ended_at) {
      return NextResponse.json({ ok: true, already_ended: true });
    }

    const { data: messages, error: msgErr } = await db
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (msgErr) throw new Error(msgErr.message);

    const userTurns = (messages ?? []).filter((m) => m.role === 'user');

    // A session where the user never spoke has nothing to summarise. Close it
    // so it stops being resumable, but do not spend a model call on it and do
    // not write a summary that would then appear in history as a real session.
    if (userTurns.length === 0) {
      const { error } = await db
        .from('coach_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId);
      if (error) throw new Error(error.message);
      return NextResponse.json({ ok: true, empty: true });
    }

    const transcript = (messages ?? [])
      .map((m) => `${m.role === 'user' ? 'User' : 'Elena'}: ${m.content}`)
      .join('\n');

    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${SUMMARY_PROMPT}\n\n---\n${transcript}` }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const json = await res.json();
    const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini returned no parseable JSON');
    const parsed = JSON.parse(match[0]) as {
      summary?: unknown;
      mood_score?: unknown;
      topics?: unknown;
    };

    const moodRaw = Number(parsed.mood_score);
    const record = {
      summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : null,
      mood_score: Number.isFinite(moodRaw)
        ? Math.min(100, Math.max(0, Math.round(moodRaw)))
        : null,
      topics: Array.isArray(parsed.topics)
        ? parsed.topics
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      ended_at: new Date().toISOString(),
    };

    const { error: updateErr } = await db
      .from('coach_sessions')
      .update(record)
      .eq('id', sessionId);

    // Not swallowed. A failure here is exactly the class of bug that made
    // check-ins vanish: the conversation would look finished while nothing was
    // recorded, and the therapist would have no memory of it next time.
    if (updateErr) {
      console.error(
        `[summarise-session] write FAILED for session ${sessionId}: ` +
          `${updateErr.code ?? 'no-code'} ${updateErr.message}`
      );
      return NextResponse.json(
        { error: `Could not save session summary: ${updateErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ...record });
  } catch (err) {
    console.error('[summarise-session] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Summarisation failed' },
      { status: 500 }
    );
  }
}
