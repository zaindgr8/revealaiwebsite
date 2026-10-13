import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { candidateText, generateWithFallback, GeminiUnavailableError } from '@/lib/geminiRetry';
import {
  CALL_ANALYSIS_MODEL,
  CALL_ANALYSIS_PROMPT,
  CALL_ANALYSIS_SCHEMA,
} from '@/prompts/callAnalysis';
import { AnalysisValidationError, validateAnalysis, transcriptSpeechRate } from '@/lib/mood-analysis';
import {
  insertTherapySession,
  makeCrisisContactLocationSafe,
  normaliseMode,
  normalisePace,
  normaliseRecommendations,
} from '@/lib/therapy-session-row';

/**
 * The live call's results: mood score, Breakdown, Heart-to-Heart Reflection,
 * Recommendations, Today's Action and the before → after shift, saved as a
 * therapy_sessions row.
 *
 * This replaced the recorded Reflect check-in, and listens as well as reads:
 *
 *   sample     — the voice note recorded just before the call, with its
 *                client-measured acoustic features. Clean audio; the source of
 *                vocal_metrics and of pace, as it was for Reflect.
 *   call_audio — the user's own speech from the end of the call (WAV, Freya
 *                and silences removed). Tone only.
 *   transcript — the call's captions. What was actually said, all call long.
 *
 * Only the captions are required. Each missing piece makes the result less
 * precise, never absent.
 *
 * Billing is not done here: /live bills the sample and the call off their
 * timers, and analysing them must not charge a second time.
 */
// Two 45 s attempts plus a fallback can outlast 60 s when Gemini is struggling.
export const maxDuration = 120;

/** Enough of the user's own words to say anything real about them. */
const MIN_USER_WORDS = 12;
/** Keeps the request bounded on a very long call; the end of a call matters most. */
const MAX_TRANSCRIPT_CHARS = 60_000;
/** Base64 lengths. ~45 s of opus is well under 1 MB; 60 s of 16 kHz WAV is ~2.6 MB. */
const MAX_SAMPLE_B64 = 3_000_000;
const MAX_CALL_AUDIO_B64 = 4_000_000;

type Turn = { role: 'user' | 'assistant'; content: string };

type AcousticFeatures = {
  avg_pitch_hz: number;
  pitch_variability: number;
  pause_count: number;
  pause_frequency: 'low' | 'medium' | 'high';
  volume_consistency: number;
  jitter_shimmer_index: number;
  duration_seconds: number;
  signal_quality: 'good' | 'fair' | 'poor';
};

type Audio = { data: string; mimeType: string; durationSeconds: number };
type Sample = Audio & { features: AcousticFeatures | null };

function parseTurns(value: unknown): Turn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is Turn =>
        !!t &&
        typeof t === 'object' &&
        ((t as Turn).role === 'user' || (t as Turn).role === 'assistant') &&
        typeof (t as Turn).content === 'string'
    )
    .map((t) => ({ role: t.role, content: t.content.trim() }))
    .filter((t) => t.content);
}

function parseAudio(value: unknown, maxB64: number): Audio | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const data = v.audio_base64;
  const mimeType = v.mime_type;
  const durationSeconds = Number(v.duration_seconds);
  if (typeof data !== 'string' || !data || data.length > maxB64) return null;
  if (typeof mimeType !== 'string' || !/^audio\//.test(mimeType)) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds < 2 || durationSeconds > 180) return null;
  return { data, mimeType, durationSeconds };
}

function parseFeatures(value: unknown): AcousticFeatures | null {
  if (!value || typeof value !== 'object') return null;
  const af = value as AcousticFeatures;
  const numeric = ['avg_pitch_hz', 'pitch_variability', 'pause_count', 'volume_consistency', 'jitter_shimmer_index', 'duration_seconds'] as const;
  return numeric.every((k) => typeof af[k] === 'number' && Number.isFinite(af[k])) ? af : null;
}

function countWords(text: string): number {
  return [...new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text)]
    .filter((part) => part.isWordLike).length;
}

function formatTranscript(turns: Turn[]): string {
  const text = turns
    .map((t) => `${t.role === 'user' ? 'USER' : 'FREYA'}: ${t.content}`)
    .join('\n');
  return text.length > MAX_TRANSCRIPT_CHARS
    ? `[earlier part of the call omitted]\n${text.slice(-MAX_TRANSCRIPT_CHARS)}`
    : text;
}

function optionalScore(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.round(Math.min(100, Math.max(0, value)))
    : null;
}

async function callGemini(
  apiKey: string,
  turns: Turn[],
  durationSeconds: number,
  sample: Sample | null,
  callAudio: Audio | null,
  userContext?: Record<string, unknown>
): Promise<{ analysis: Record<string, unknown>; model: string }> {
  const parts: Record<string, unknown>[] = [];

  if (sample) {
    const lines = [`━━ A. VOICE SAMPLE (about ${Math.round(sample.durationSeconds)} s, recorded before the call) ━━`];
    if (sample.features) {
      const af = sample.features;
      lines.push(
        'Estimated audio features of this sample (supporting context only):',
        `Signal quality: ${af.signal_quality}; average pitch ${af.avg_pitch_hz} Hz; pitch variability ${af.pitch_variability}/100; ` +
          `pauses ${af.pause_count} (${af.pause_frequency}); volume consistency ${af.volume_consistency}/100; ` +
          `jitter-shimmer index ${af.jitter_shimmer_index}/100 (unvalidated proxy, not tension).`
      );
    }
    parts.push({ text: lines.join('\n') });
    parts.push({ inlineData: { mimeType: sample.mimeType, data: sample.data } });
  } else {
    parts.push({ text: '━━ A. VOICE SAMPLE ━━\nNot provided.' });
  }

  if (callAudio) {
    parts.push({
      text: `━━ B. USER SPEECH FROM THE CALL (about ${callAudio.durationSeconds} s of the user's voice, Freya and silences removed) ━━`,
    });
    parts.push({ inlineData: { mimeType: callAudio.mimeType, data: callAudio.data } });
  } else {
    parts.push({ text: '━━ B. USER SPEECH FROM THE CALL ━━\nNot provided.' });
  }

  const tail = [
    `━━ C. CAPTIONS (call length about ${Math.max(1, Math.round(durationSeconds / 60))} minute(s)) ━━`,
    formatTranscript(turns) || '(no captions)',
    '━━ END ━━',
  ];
  if (userContext) {
    tail.push(`\nUser context (personalise subtly, do not mention directly): ${JSON.stringify(userContext)}`);
  }
  parts.push({ text: tail.join('\n') });

  const { json, model } = await generateWithFallback(apiKey, CALL_ANALYSIS_MODEL, {
    systemInstruction: { parts: [{ text: CALL_ANALYSIS_PROMPT }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: CALL_ANALYSIS_SCHEMA,
    },
  });

  const match = candidateText(json).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned no parseable JSON');
  return { analysis: validateAnalysis(JSON.parse(match[0])), model };
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server.' },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const turns = parseTurns(body.transcript);
  const durationSeconds = Number(body.duration_seconds);
  const userContext =
    body.user_context && typeof body.user_context === 'object'
      ? (body.user_context as Record<string, unknown>)
      : undefined;
  const coachSessionId =
    typeof body.coach_session_id === 'string' && body.coach_session_id
      ? body.coach_session_id
      : null;

  const sampleAudio = parseAudio(body.sample, MAX_SAMPLE_B64);
  const sample: Sample | null = sampleAudio
    ? { ...sampleAudio, features: parseFeatures((body.sample as Record<string, unknown>).acoustic_features) }
    : null;
  const callAudio = parseAudio(body.call_audio, MAX_CALL_AUDIO_B64);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return NextResponse.json({ error: 'duration_seconds is required' }, { status: 400 });
  }

  // With a voice sample there is always something real to read, even if the
  // call itself was brief. Without one, the captions have to carry it.
  const userWords = countWords(
    turns.filter((t) => t.role === 'user').map((t) => t.content).join(' ')
  );
  if (!sample && userWords < MIN_USER_WORDS) {
    return NextResponse.json(
      {
        error:
          'The call was too short to read how you are doing. Talk with Freya a little longer next time to see your results.',
        insufficient: true,
      },
      { status: 422 }
    );
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const auth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const {
    data: { user },
    error: authError,
  } = await auth.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { analysis, model } = await callGemini(apiKey, turns, durationSeconds, sample, callAudio, userContext);

    const aiInsight = String(analysis.ai_insight || '');
    const vocalSummary = String(analysis.vocal_summary || '');
    const transcriptSummary = String(analysis.transcript_summary || '');
    const recommendations = normaliseRecommendations(analysis.recommendations).map(
      makeCrisisContactLocationSafe
    );
    const todaysAction = analysis.todays_action
      ? makeCrisisContactLocationSafe(String(analysis.todays_action))
      : null;
    const userTranscript = String(analysis.transcript);
    const sampleTranscript = String(analysis.sample_transcript ?? '').trim();

    // Pace. The voice sample has true timing, so it is measured there, as
    // Reflect measured its recording. Without one, the user's share of
    // caption words stands in for their share of talk time — rough, which is
    // why it only ever picks Slow/Normal/Fast.
    let speechRate: number;
    if (sample && sampleTranscript) {
      speechRate = transcriptSpeechRate(sampleTranscript, sample.features?.duration_seconds || sample.durationSeconds);
    } else {
      const allWords = countWords(turns.map((t) => t.content).join(' '));
      const userShare = allWords > 0 ? userWords / allWords : 0.5;
      speechRate = transcriptSpeechRate(userTranscript, durationSeconds * userShare);
    }

    const af = sample?.features ?? null;
    const vocalMetrics = af ? {
      pitch_variability: af.pitch_variability,
      avg_pitch_hz: af.avg_pitch_hz,
      pause_frequency: af.pause_frequency,
      pause_count: af.pause_count,
      speech_rate_wpm: speechRate,
      jitter_shimmer_index: af.jitter_shimmer_index,
      volume_consistency: af.volume_consistency,
    } : null;

    const endMood = Number(analysis.mood_score);
    const endStress = Number(analysis.stress_level);
    const startMood = sample ? optionalScore(analysis.start_mood_score) : null;
    const startStress = sample ? optionalScore(analysis.start_stress_level) : null;
    const callShift = startMood != null && startStress != null
      ? {
          start_mood: startMood,
          start_stress: startStress,
          end_mood: endMood,
          end_stress: endStress,
          note: String(analysis.shift_note ?? '').trim() || null,
        }
      : null;

    const sessionData = {
      user_id: user.id,
      mood_score: endMood,
      energy: Number(analysis.energy_level),
      stress: endStress,
      positivity: Number(analysis.positivity),
      confidence: Number(analysis.confidence),
      pace: normalisePace(speechRate < 100 ? 'slow' : speechRate > 180 ? 'fast' : 'normal'),
      ai_provider: 'gemini',
      ai_model: model,
      detected_mode: normaliseMode(analysis.detected_mode),
      insight: aiInsight,
      tips: recommendations,
      daily_prompt: todaysAction,
      transcript: userTranscript || null,
      emotional_mirror: vocalSummary || null,
      duration_seconds: Math.round(durationSeconds + (sample?.durationSeconds ?? 0)),
      vocal_metrics: vocalMetrics,
      vocal_summary: vocalSummary || null,
      transcript_summary: transcriptSummary || null,
      ai_insight: aiInsight,
      recommendations,
      todays_action: todaysAction,
      narrative_type: analysis.narrative_type ? String(analysis.narrative_type) : 'present',
      readiness_score: analysis.readiness_score != null ? Number(analysis.readiness_score) : null,
      readiness_note: analysis.readiness_note ? String(analysis.readiness_note) : null,
      coach_session_id: coachSessionId,
      call_shift: callShift,
    };

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );
    const dbError = await insertTherapySession(db, sessionData);

    const { user_id, ...result } = sessionData;
    void user_id;

    // What the analysis drew on, so the results screen can say so honestly.
    const evidence = { voice_sample: !!sample, call_audio: !!callAudio };

    if (dbError) {
      // Same contract as analyze-mood: return the result so the user does not
      // lose it, and say plainly that it is not in their history yet.
      console.error(
        `[analyze-call] DB save FAILED for user ${user.id}: ` +
          `${dbError.code ?? 'no-code'} ${dbError.message}`
      );
      return NextResponse.json({ ...result, evidence, saved: false, save_error: dbError.message });
    }

    return NextResponse.json({ ...result, evidence, saved: true });
  } catch (err) {
    if (err instanceof AnalysisValidationError) {
      // validateAnalysis words its errors for a recording. Only the
      // too-little-speech case is the user's to fix; the rest are an
      // incomplete model answer, which a retry can fix.
      const insufficient = /enough clear speech|transcribed/i.test(err.message);
      return NextResponse.json(
        {
          error: insufficient
            ? 'There wasn’t enough in this call to read how you are doing. Talk with Freya a little longer next time to see your results.'
            : 'The call analysis came back incomplete. Please try again.',
          insufficient,
        },
        { status: 422 }
      );
    }
    console.error('[analyze-call] Analysis failed:', (err as Error).message);
    const busy = err instanceof GeminiUnavailableError;
    return NextResponse.json(
      {
        error: busy
          ? 'Our analysis service is very busy right now. Your conversation is saved — try again in a minute.'
          : 'We could not analyse this call. Your conversation is still saved.',
      },
      { status: busy ? 503 : 500 }
    );
  }
}
