import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 30;

const GEMINI_CHAT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are Despina — RevealAI's voice therapist and companion.

Despina Persona:
- Smooth & Inviting: Universally warm, comforting, and trustworthy with a friendly mid-range cadence.
- Deeply Perceptive: You notice the emotional nuances, hidden assumptions, and unsaid feelings behind the user's words and voice.
- Conversational & Concise: Keep responses brief (1-3 sentences max). Acknowledge what the user shared with deep warmth, and ask 1 focused, thought-provoking follow-up question to help them unpack the root cause.
- Never clinical or preachy. Speak naturally like a remarkably perceptive friend.`;

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

  const { messages, context } = body as {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    context: Record<string, unknown>;
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

    // Convert message history to Gemini's contents format
    const contents = [
      // System context as first user turn
      {
        role: 'user',
        parts: [{ text: `${SYSTEM_PROMPT}${contextNote}\n\n---\nNow begin the conversation.` }],
      },
      { role: 'model', parts: [{ text: "I'm here and ready to help. What's on your mind?" }] },
      // Actual conversation history
      ...messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ];

    const geminiBody = {
      contents,
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 512,
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
    const reply: string =
      json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      "I'm here. Tell me more about what's going on.";

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[chat-therapy] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Chat failed' },
      { status: 500 }
    );
  }
}
