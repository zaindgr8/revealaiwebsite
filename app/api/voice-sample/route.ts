import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { candidateText, generateWithFallback } from '@/lib/geminiRetry';
import { VOICE_SAMPLE_MODEL, VOICE_SAMPLE_PROMPT, VOICE_SAMPLE_SCHEMA } from '@/prompts/voiceSample';

/**
 * Quick read of the voice sample recorded before a call on /live.
 *
 * Nothing is saved and nothing is billed here. The sample's minutes are billed
 * with the call, and the sample itself is analysed again — properly, with the
 * call — by /api/analyze-call. This only gives Freya her opening and gives the
 * page a transcript to screen before the call starts.
 */
export const maxDuration = 30;

function score(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(100, Math.max(0, value)))
    : null;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured on the server.' }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const audio = body?.audio_base64;
  const mimeType = body?.mime_type;
  const duration = Number(body?.duration_seconds);
  if (typeof audio !== 'string' || !audio || typeof mimeType !== 'string' || !mimeType) {
    return NextResponse.json({ error: 'audio_base64 and mime_type are required' }, { status: 400 });
  }
  if (!Number.isFinite(duration) || duration < 3 || duration > 120) {
    return NextResponse.json({ error: 'Record a few seconds of speech first.' }, { status: 400 });
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // The client gives up after 12 s, so this does not wait for a fallback
    // longer than that would be useful.
    const { json } = await generateWithFallback(
      apiKey,
      VOICE_SAMPLE_MODEL,
      {
        systemInstruction: { parts: [{ text: VOICE_SAMPLE_PROMPT }] },
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audio } },
            { text: `Voice note, about ${Math.round(duration)} seconds.` },
          ],
        }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseJsonSchema: VOICE_SAMPLE_SCHEMA,
          // The user is waiting between recording and calling.
          thinkingConfig: { thinkingLevel: 'low' },
        },
      },
      { timeoutMs: 6_000 }
    );
    const text = candidateText(json);
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Gemini returned no parseable JSON');
    const read = JSON.parse(match[0]) as Record<string, unknown>;

    if (read.analysis_status !== 'ok' || typeof read.transcript !== 'string' || !read.transcript.trim()) {
      return NextResponse.json(
        {
          error: 'We couldn’t hear clear speech in that sample. Try again a little closer to the microphone.',
          insufficient: true,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      transcript: read.transcript.trim(),
      mood_score: score(read.mood_score),
      energy: score(read.energy_level),
      stress: score(read.stress_level),
      detected_mode: typeof read.detected_mode === 'string' ? read.detected_mode : 'neutral',
      vocal_summary: typeof read.vocal_summary === 'string' ? read.vocal_summary.trim() : '',
      opening_note: typeof read.opening_note === 'string' ? read.opening_note.trim() : '',
    });
  } catch (err) {
    console.error('[voice-sample] quick read failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not read the voice sample.' }, { status: 500 });
  }
}
