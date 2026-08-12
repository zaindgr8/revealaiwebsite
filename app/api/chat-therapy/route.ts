import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildMemoryBlock,
  type MoodPoint,
  type PastSession,
} from '@/lib/chatMemory';
import {
  CRISIS_MESSAGE,
  CRISIS_RESOURCES,
  screenMessage,
} from '@/lib/crisis';
import { ELENA_PERSONA, FINAL_TURN_INSTRUCTION } from '@/prompts/elena';

export const maxDuration = 30;

const GEMINI_CHAT_URL =
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

  // No `context` field is read from the body, deliberately.
  //
  // The client used to send the latest check-in here and it was stringified
  // straight into the system prompt — unvalidated, and therefore a
  // client-controlled instruction channel sitting directly beside the block
  // that lib/chatMemory.ts assembles server-side specifically to avoid one.
  // Everything it carried is now read from the database below.
  const { messages, is_final_turn } = body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    is_final_turn?: boolean;
  };

  // Authenticate user
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

  // ── T-7: screen BEFORE generating anything ───────────────────────────────
  //
  // Deliberately ahead of the memory load and the therapist call. T-7 says
  // "before a response is generated", so nothing else may run first — the
  // point is that a person at risk never receives a conversational reply.
  const latestUserMessage = [...(messages ?? [])]
    .reverse()
    .find((m) => m.role === 'user');

  if (latestUserMessage?.content) {
    const verdict = await screenMessage(latestUserMessage.content, apiKey);

    // Only 'classifier-error' is degraded. 'fallback' is the intended fast
    // path: screenMessage() short-circuits on an unambiguous regex match and
    // never calls the model, which is correct and happens on every genuine
    // crisis message.
    //
    // Warning on both meant this fired precisely when the system was working,
    // which is how a log line stops being read.
    if (verdict.source === 'classifier-error') {
      console.warn(
        `[chat-therapy] crisis classifier unavailable for user ${user.id}, ` +
          `regex fallback only: ${verdict.reason}`
      );
    }

    if (verdict.escalate) {
      console.error(
        `[chat-therapy] CRISIS escalation for user ${user.id} ` +
          `(via ${verdict.source}): ${verdict.reason}`
      );
      // T-8: the standard conversational flow is interrupted. No model call is
      // made, so there is no path by which a therapist reply can be returned.
      return NextResponse.json({
        crisis: true,
        reply: CRISIS_MESSAGE,
        resources: CRISIS_RESOURCES,
        level: verdict.level,
      });
    }

    if (verdict.level === 'concern') {
      console.log(`[chat-therapy] elevated distress for user ${user.id}: ${verdict.reason}`);
    }
  }

  try {
    // ── T-2: load history server-side ──────────────────────────────────────
    //
    // Read with the caller's JWT so RLS scopes every query to their own rows.
    // Assembling here rather than trusting a client-supplied payload keeps the
    // prompt inspectable in one place, which is what T-2 is verified against.
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    // T-2 asks for the five most recent session summaries and the mood trend.
    // 14 check-ins is enough for a fortnight's trend without bloating the prompt.
    const [sessionsRes, moodRes] = await Promise.all([
      supabaseAuth
        .from('coach_sessions')
        .select('created_at, summary, mood_score, topics')
        .not('ended_at', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5),
      supabaseAuth
        .from('therapy_sessions')
        .select('created_at, mood_score, energy, stress, detected_mode, transcript_summary')
        .order('created_at', { ascending: false })
        .limit(14),
    ]);

    // Memory is an enhancement, not a precondition. If either read fails the
    // user still gets a therapist — just one without history — rather than an
    // error screen. Logged loudly so it does not become another silent gap.
    if (sessionsRes.error) {
      console.error('[chat-therapy] session history unavailable:', sessionsRes.error.message);
    }
    if (moodRes.error) {
      console.error('[chat-therapy] mood history unavailable:', moodRes.error.message);
    }

    const memoryBlock = buildMemoryBlock({
      recentSessions: (sessionsRes.data ?? []) as PastSession[],
      moodPoints: (moodRes.data ?? []) as MoodPoint[],
    });

    const finalTurnInstruction = is_final_turn ? FINAL_TURN_INSTRUCTION : '';

    const fullSystemPrompt = `${ELENA_PERSONA}${memoryBlock}${finalTurnInstruction}`;

    // T-2 is verified by inspecting what actually reaches the model. Set
    // CHAT_DEBUG_PROMPT=1 to print the assembled prompt rather than having to
    // reconstruct it from the code.
    if (process.env.CHAT_DEBUG_PROMPT === '1') {
      console.log('[chat-therapy] system prompt sent to model:\n' + fullSystemPrompt);
    }

    // Convert message history to Gemini's contents format
    const contents = [
      {
        role: 'user',
        parts: [{ text: `${fullSystemPrompt}\n\n---\nNow begin the conversation.` }],
      },
      { role: 'model', parts: [{ text: "I'm here and ready to help. What's on your mind?" }] },
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    const geminiBody = {
      contents,
      generationConfig: {
        temperature: 0.6,
        topP: 0.9,

        // NO maxOutputTokens. There was a 1024 cap here and it was silently
        // truncating replies.
        //
        // Gemini 2.5 Flash counts its internal reasoning against the same
        // ceiling as the visible answer. Measured 11 Aug 2026 on this exact
        // prompt: thoughts 979, reply 41, cap 1024. The reasoning alone
        // consumed 96% of the budget, the reply was cut mid-sentence, and the
        // repair below then chopped it back to the last full stop — which is
        // where the closing question the persona is told to end on went.
        //
        // It was intermittent, because thought length varies run to run, so it
        // looked like the model occasionally being terse rather than a config
        // bug. The memory block made it worse: a longer prompt means longer
        // reasoning, so the feature that was supposed to improve replies was
        // quietly truncating them.
        //
        // This is the second time a token cap has broken a feature here — see
        // the same note in lib/crisis.ts, where a 100-token cap disabled the
        // crisis classifier entirely. Do not reintroduce one. The persona
        // prompt bounds the length ("2 to 3 complete sentences") far more
        // reliably than a token ceiling that reasoning is also spending from.
      },
    };

    const res = await fetch(`${GEMINI_CHAT_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`Gemini API error ${res.status}: ${errText}`);
    }

    const json = await res.json();
    let reply: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      "I hear you deeply. Thank you for sharing that with me.";

    // Ensure reply is never truncated mid-sentence
    if (reply && !/[.?!]"?$/.test(reply)) {
      const lastPunct = Math.max(reply.lastIndexOf('.'), reply.lastIndexOf('?'), reply.lastIndexOf('!'));
      if (lastPunct > 20) {
        reply = reply.substring(0, lastPunct + 1);
      } else {
        reply = reply + '.';
      }
    }

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[chat-therapy] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Chat failed' },
      { status: 500 }
    );
  }
}
