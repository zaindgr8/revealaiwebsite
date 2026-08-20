import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { CRISIS_RESOURCES, screenMessage } from '@/lib/crisis';

/**
 * T-8 for the live call: screens one spoken user turn for crisis language.
 *
 * WHY A SEPARATE ROUTE FROM /api/chat-therapy
 *
 * /chat screens and replies in the same request, because the server is the
 * thing that produces the reply — it can withhold one. A live call has no such
 * chokepoint: the browser holds the socket and Google produces the audio, so
 * there is no request to intercept. The screening therefore runs beside the
 * conversation rather than in front of it, on the input transcription Gemini
 * sends back.
 *
 * WHAT THIS CAN AND CANNOT DO
 *
 * It cannot stop Elena from starting to answer. By the time a turn has been
 * transcribed, the model is already speaking. What it does is cut the call
 * short — the caller stops the audio, closes the socket and shows the support
 * resources — usually within a second or two of the sentence that triggered
 * it. That is a real difference from /chat and it is the honest limit of
 * screening a stream you do not control.
 *
 * The classifier itself is shared with /chat, deliberately. Two crisis
 * classifiers would be two sets of thresholds to keep in step, and
 * scripts/runCrisisTests.ts only measures one of them.
 */
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: 'text is too long' }, { status: 413 });
  }

  const verdict = await screenMessage(text, process.env.GEMINI_API_KEY);

  if (verdict.level === 'concern') {
    console.log(`[live-screen] elevated distress for user ${user.id}: ${verdict.reason}`);
  }
  if (verdict.level === 'crisis') {
    console.log(`[live-screen] escalating for user ${user.id}: ${verdict.reason}`);
  }

  return NextResponse.json(
    {
      level: verdict.level,
      // Sent on every verdict so the caller never has to make a second request
      // at the moment it most needs to show them.
      resources: CRISIS_RESOURCES,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
