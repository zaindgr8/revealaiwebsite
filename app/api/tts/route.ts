import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

// Google Cloud TTS Neural2 / Journey Female voice — warm, smooth & human
const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const text = String(body.text || '').trim();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
    const openAiKey = process.env.OPENAI_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    // 1. ElevenLabs (if ELEVENLABS_API_KEY is configured)
    if (elevenLabsKey) {
      // Voice ID for Despina / Rachel / Bella (warm female voice)
      const voiceId = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
      const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.8,
            style: 0.2,
            use_speaker_boost: true,
          },
        }),
      });

      if (elRes.ok) {
        const audioBuffer = await elRes.arrayBuffer();
        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // 2. OpenAI TTS (if OPENAI_API_KEY is configured)
    if (openAiKey) {
      const oaRes = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1-hd',
          input: text,
          voice: 'nova', // warm, comforting female voice
          speed: 0.96,
        }),
      });

      if (oaRes.ok) {
        const audioBuffer = await oaRes.arrayBuffer();
        return new NextResponse(audioBuffer, {
          headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    }

    // 3. Google Cloud Neural2 TTS (using GEMINI_API_KEY)
    if (geminiKey) {
      const gRes = await fetch(`${GOOGLE_TTS_URL}?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: 'en-US',
            name: 'en-US-Neural2-F', // Neural2 Female — warm, natural, human
            ssmlGender: 'FEMALE',
          },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: 0.94, // unhurried, natural cadence
            pitch: 0.2,
          },
        }),
      });

      if (gRes.ok) {
        const json = await gRes.json();
        if (json.audioContent) {
          const audioBuffer = Buffer.from(json.audioContent, 'base64');
          return new NextResponse(audioBuffer, {
            headers: {
              'Content-Type': 'audio/mpeg',
              'Cache-Control': 'public, max-age=3600',
            },
          });
        }
      }
    }

    return NextResponse.json({ error: 'No TTS service configured or available' }, { status: 500 });
  } catch (err) {
    console.error('[tts] Error generating speech:', err);
    return NextResponse.json({ error: (err as Error).message || 'TTS generation failed' }, { status: 500 });
  }
}
