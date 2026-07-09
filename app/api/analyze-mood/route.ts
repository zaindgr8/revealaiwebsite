import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const ANALYSIS_PROMPT = `You are RevealAI's expert voice emotion analyst. Analyze this audio recording carefully.

Listen for:
- What the person says (content)
- How they say it (tone, energy, pace, stress markers, pauses, vocal quality)
- Underlying emotional state beyond the words

Return ONLY a single valid JSON object — no markdown fences, no explanation, no extra text:
{
  "transcript": "<verbatim transcription of what was said, or empty string if silent/unclear>",
  "emotional_mirror": "<2-3 sentences empathetically describing how their voice sounded — tone, energy, pace — like holding up a gentle mirror to them>",
  "mood_score": <integer 0-100, overall emotional wellbeing>,
  "energy": <integer 0-100, physical/mental energy level heard in voice>,
  "stress": <integer 0-100, stress and tension level>,
  "positivity": <integer 0-100, positive outlook and optimism>,
  "confidence": <integer 0-100, vocal confidence and self-assurance>,
  "pace": "<Slow | Normal | Fast>",
  "detected_mode": "<exactly one of: calm | happy | anxious | sad | angry | venting | reflective | neutral | motivated>",
  "insight": "<3-4 sentences of personalized insight about their emotional state, grounded specifically in what you heard — avoid generic advice>",
  "tips": ["<specific actionable tip 1>", "<specific actionable tip 2>", "<specific actionable tip 3>"],
  "daily_prompt": "<one specific, concrete action for today that directly addresses what you heard>"
}`;

async function callGemini(
  apiKey: string,
  audioBase64: string,
  mimeType: string,
  durationSeconds: number,
  userContext?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const contextNote = userContext
    ? `\n\nUser context (use to personalise, not to be verbose): ${JSON.stringify(userContext)}`
    : '';

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: `${ANALYSIS_PROMPT}${contextNote}\n\nAudio duration: ~${durationSeconds}s` },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const text: string =
    json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Gemini with responseMimeType=application/json should return clean JSON,
  // but fall back to regex extraction just in case.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned no parseable JSON');
  return JSON.parse(match[0]);
}

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

  const { audio_base64, mime_type, duration_seconds, user_context } = body as {
    audio_base64: string;
    mime_type: string;
    duration_seconds: number;
    user_context?: Record<string, unknown>;
  };

  if (!audio_base64 || !mime_type) {
    return NextResponse.json(
      { error: 'audio_base64 and mime_type are required' },
      { status: 400 }
    );
  }

  // Authenticate the user via the Authorization header (Supabase JWT)
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
    const analysis = await callGemini(
      apiKey,
      audio_base64,
      mime_type,
      duration_seconds ?? 0,
      user_context
    );

    const sessionData = {
      user_id: user.id,
      mood_score: Number(analysis.mood_score) || 50,
      energy: Number(analysis.energy) || 50,
      stress: Number(analysis.stress) || 50,
      positivity: Number(analysis.positivity) || 50,
      confidence: Number(analysis.confidence) || 50,
      pace: String(analysis.pace || 'Normal'),
      detected_mode: String(analysis.detected_mode || 'neutral'),
      insight: String(analysis.insight || ''),
      tips: Array.isArray(analysis.tips) ? analysis.tips : [],
      daily_prompt: analysis.daily_prompt ? String(analysis.daily_prompt) : null,
      transcript: analysis.transcript ? String(analysis.transcript) : null,
      emotional_mirror: analysis.emotional_mirror
        ? String(analysis.emotional_mirror)
        : null,
      duration_seconds: duration_seconds ?? 0,
    };

    // Save to Supabase using the user's JWT so RLS works correctly
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { error: dbError } = await supabaseAuth
      .from('therapy_sessions')
      .insert(sessionData);

    if (dbError) {
      console.error('[analyze-mood] DB save error:', dbError.message);
      // Don't fail the whole request — still return analysis results
    }

    // Return the AnalysisResult (without user_id / created_at)
    const { user_id, ...result } = sessionData;
    void user_id; // suppress unused warning
    return NextResponse.json(result);
  } catch (err) {
    console.error('[analyze-mood] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Analysis failed' },
      { status: 500 }
    );
  }
}
