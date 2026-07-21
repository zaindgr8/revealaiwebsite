import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

const GEMINI_CHAT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const BASE_SYSTEM_PROMPT = `You are Elena — RevealAI's voice therapist and companion.

Elena Persona:
- Smooth & Inviting: Universally warm, comforting, and trustworthy with a friendly mid-range cadence.
- Deeply Perceptive: You notice emotional nuances, hidden assumptions, and unsaid feelings behind the user's words.
- Conversational & Complete: Write 2 to 3 complete, well-crafted, articulate sentences. ALWAYS ensure every sentence and question is fully finished with proper punctuation. NEVER stop mid-sentence or cut off.
- Direct & Warm: Speak naturally like a remarkably perceptive friend.`;

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

  const { messages, context, is_final_turn } = body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    context: Record<string, unknown>;
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

  try {
    // Build context note from the user's latest analysis result
    const contextNote = context
      ? `\n\nLatest check-in data for this user: ${JSON.stringify(context, null, 2)}`
      : '';

    const finalTurnInstruction = is_final_turn
      ? `\n\nIMPORTANT INSTRUCTION: This is the user's 3rd and final response for this session. Acknowledge what they shared with deep warmth, provide a comforting final takeaway summary, and DO NOT ask any follow-up question. Conclude the session gracefully.`
      : '';

    const fullSystemPrompt = `${BASE_SYSTEM_PROMPT}${contextNote}${finalTurnInstruction}`;

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
        maxOutputTokens: 1024,
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
