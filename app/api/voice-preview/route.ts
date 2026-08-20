import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveVoice } from '@/lib/voices';
import { GEMINI_TTS_MODEL } from '@/lib/geminiModel';

/**
 * A short spoken sample of one Google voice, so a user can hear Elena before
 * choosing her voice.
 *
 * This does not go through /api/tts. That route speaks with ElevenLabs or
 * OpenAI or Google Cloud Neural2, none of which share the Live API's voice
 * list — a preview from it would be a different voice than the live call
 * actually uses, which is worse than no preview at all.
 *
 * Gemini TTS returns raw PCM, not a playable file, so a 44-byte WAV header is
 * added here rather than in the browser.
 */
export const maxDuration = 30;

const TTS_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TTS_MODEL}:generateContent`;

// Gemini TTS output: 24 kHz, 16-bit, mono.
const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

const SAMPLE_LINE =
  "Hi, I'm Elena. Whenever you're ready, tell me how today has been for you.";

/** Wrap raw PCM in a WAV container so an <audio> element can play it. */
function pcmToWav(pcm: Buffer): Buffer {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // PCM chunk size
  header.writeUInt16LE(1, 20); // format: PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

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

  let body: { voice?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // resolveVoice rejects anything not on our list, so an arbitrary string from
  // the client cannot be forwarded to Google.
  const voice = resolveVoice(typeof body.voice === 'string' ? body.voice : null);

  try {
    let lastStatus = 502;
    let base64: string | null = null;

    // Gemini documents an occasional transient 500/no-audio TTS response.
    // Retry once; a voice-preview click should not make the user diagnose a
    // provider hiccup, while a bounded retry prevents an unending request.
    for (let attempt = 0; attempt < 2 && !base64; attempt += 1) {
      const res = await fetch(`${TTS_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: SAMPLE_LINE }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
            },
          },
        }),
      });
      lastStatus = res.status;

      if (!res.ok) {
        const detail = await res.text();
        console.error('[voice-preview] Gemini TTS failed:', res.status, detail);
        continue;
      }

      const json = await res.json();
      base64 =
        json?.candidates?.[0]?.content?.parts?.find(
          (p: { inlineData?: { data?: string } }) => p?.inlineData?.data
        )?.inlineData?.data ?? null;
    }

    if (!base64) {
      return NextResponse.json(
        { error: `Voice preview unavailable (HTTP ${lastStatus})` },
        { status: 502 }
      );
    }

    const wav = pcmToWav(Buffer.from(base64, 'base64'));
    return new NextResponse(new Uint8Array(wav), {
      headers: {
        'Content-Type': 'audio/wav',
        // The line is fixed, so the same voice always produces the same clip.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[voice-preview] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Voice preview failed' },
      { status: 500 }
    );
  }
}
