import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildMemoryBlock, type MoodPoint, type PastSession } from '@/lib/chatMemory';
import { ELENA_LIVE_PERSONA } from '@/prompts/elena';

/**
 * The system instruction for a live call, assembled server-side.
 *
 * Elena knew nothing about the person on a call. /chat has had memory since
 * T-2, but a live call never touched the server: the browser opened a socket
 * to Google with a hard-coded persona, so the same user met a therapist with
 * history in one place and a stranger in the other.
 *
 * WHY THE WHOLE PROMPT AND NOT JUST THE MEMORY
 *
 * The client sends this string straight to Google as the system instruction.
 * If this route returned only the memory block and let the page concatenate
 * it, the page would be assembling a prompt — and /api/chat-therapy carries a
 * note about exactly that being how a client-controlled instruction channel
 * gets built by accident. The page here is a courier: it does not read this
 * string, edit it, or add to it.
 *
 * Memory is an enhancement, not a precondition. A failed read costs the user
 * history, never the call.
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

  // Read under the caller's JWT so RLS scopes every row to them.
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  // The same two reads /api/chat-therapy makes, with the same limits. They are
  // deliberately identical: two different memory windows would give the user
  // two Elenas who remember different amounts, and the difference would show
  // up as her forgetting something between a chat and a call.
  //
  // coach_sessions is not filtered by source, so a finished live call feeds
  // this on the next call and feeds /chat too. That is the second direction.
  const [sessionsRes, moodRes] = await Promise.all([
    db
      .from('coach_sessions')
      .select('created_at, summary, mood_score, topics')
      .not('ended_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('therapy_sessions')
      .select('created_at, mood_score, energy, stress, detected_mode, transcript_summary')
      .order('created_at', { ascending: false })
      .limit(14),
  ]);

  if (sessionsRes.error) {
    console.error('[live-context] session history unavailable:', sessionsRes.error.message);
  }
  if (moodRes.error) {
    console.error('[live-context] mood history unavailable:', moodRes.error.message);
  }

  const memoryBlock = buildMemoryBlock({
    recentSessions: (sessionsRes.data ?? []) as PastSession[],
    moodPoints: (moodRes.data ?? []) as MoodPoint[],
  });

  return NextResponse.json(
    {
      systemInstruction: `${ELENA_LIVE_PERSONA}${memoryBlock}`,
      // Lets the page tell the user whether Elena has anything to remember,
      // rather than promising memory it may not have.
      hasMemory: memoryBlock.length > 0,
      contextPartial: Boolean(sessionsRes.error || moodRes.error),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
