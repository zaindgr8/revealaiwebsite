import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DEEP_QUESTION_PROMPT } from '@/prompts/deepQuestion';

export const maxDuration = 60;

const GEMINI_API_URL =
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

  const { audio_base64, mime_type, user_context } = body as {
    audio_base64: string;
    mime_type: string;
    user_context?: Record<string, unknown>;
  };

  if (!audio_base64 || !mime_type) {
    return NextResponse.json(
      { error: 'audio_base64 and mime_type are required' },
      { status: 400 }
    );
  }

  // Authenticate via Supabase JWT
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
    const promptText = `${DEEP_QUESTION_PROMPT}\n${user_context ? `User context: ${JSON.stringify(user_context)}` : ''}`;

    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: mime_type, data: audio_base64 } },
              { text: promptText },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
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
    const parsed = JSON.parse(match[0]);

    return NextResponse.json({
      question: String(parsed.question || 'What is the one thing about this situation you haven’t said out loud yet?'),
    });
  } catch (err) {
    console.error('[deep-question] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Failed to generate deep question' },
      { status: 500 }
    );
  }
}
