import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SYSTEM_PROMPT, ANALYSIS_SCHEMA, REFLECT_GEMINI_MODEL } from '@/prompts/checkIn';
import { AnalysisValidationError, validateAnalysis, transcriptSpeechRate } from '@/lib/mood-analysis';

export const maxDuration = 60;

/** Recorded on every row as ai_model, so a stored analysis says what produced it. */
const GEMINI_MODEL = REFLECT_GEMINI_MODEL;

const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * therapy_sessions has a CHECK constraint accepting only 'Slow' | 'Normal' |
 * 'Fast'. Anything else fails the insert outright, so this normalises whatever
 * arrives rather than trusting it.
 */
function normalisePace(value: unknown): 'Slow' | 'Normal' | 'Fast' {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'slow') return 'Slow';
  if (v === 'fast') return 'Fast';
  return 'Normal';
}

/**
 * Values therapy_sessions.detected_mode will accept (migration 0008).
 *
 * Kept in sync with SCHEMA_BLOCK. They disagreed once — the model was told to
 * return happy, reflective and motivated while the database rejected all
 * three — and every check-in that produced one was silently lost.
 */
const ALLOWED_MODES = [
  'calm', 'happy', 'hopeful', 'anxious', 'sad',
  'angry', 'venting', 'reflective', 'neutral', 'motivated',
] as const;

/**
 * Guarantees a storable value.
 *
 * A model returning something outside the enum should cost the user a slightly
 * less precise label, not their entire check-in. Logged rather than swallowed,
 * because a mode appearing here means the prompt and the constraint have
 * drifted apart again and someone needs to widen one of them.
 */
function normaliseMode(value: unknown): string {
  const v = String(value ?? '').trim().toLowerCase();
  if ((ALLOWED_MODES as readonly string[]).includes(v)) return v;
  console.warn(
    `[analyze-mood] model returned detected_mode "${v}", which the database ` +
      'does not accept. Storing "neutral". Update SCHEMA_BLOCK and the ' +
      'therapy_sessions_detected_mode_check constraint together.'
  );
  return 'neutral';
}

function normaliseRecommendations(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Reflect is available outside the US, so a model must not silently insert a
 * US-only crisis number. The escalation UI has the client's verified regional
 * resources; Reflect prose stays location-neutral when no user region was
 * supplied to the model.
 */
function makeCrisisContactLocationSafe(value: string): string {
  return value
    .replace(/\b(?:call|dial|text)\s+(?:the\s+)?988\b/gi, 'contact your local crisis line or emergency services')
    .replace(/\b988\s+(?:Suicide\s*&\s*Crisis\s+)?Lifeline\b/gi, 'your local crisis line or emergency services')
    .replace(/\b(?:National\s+Suicide\s+Prevention|Suicide\s*&\s*Crisis)\s+Lifeline\b/gi, 'your local crisis line or emergency services');
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — strict voice-first analysis
// CRITICAL RULES embedded directly so the model cannot ignore them.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// Build the context block injected into the prompt
// ─────────────────────────────────────────────────────────────────────────────
function buildAcousticContext(
  af: AcousticFeatures | null,
  durationSeconds: number,
  userContext?: Record<string, unknown>,
  deepQuestion?: string,
  deepAnswer?: string
): string {
  const lines: string[] = [];

  if (deepQuestion && deepAnswer) {
    lines.push(`\n\n━━ DEEP UNDERSTANDING CONVERSATION TURN ━━`);
    lines.push(`Therapist Follow-up Question: "${deepQuestion}"`);
    lines.push(`User Answer to Question: "${deepAnswer}"`);
    lines.push(`━━ END CONVERSATION TURN ━━`);
    lines.push(`Use the answer as additional self-reported context, separately from the recording.`);
  }

  if (af) {
    lines.push(`\n\n━━ ESTIMATED AUDIO FEATURES (supporting context only) ━━`);
    lines.push(`Signal quality: ${af.signal_quality}`);
    lines.push(`Duration: ${af.duration_seconds}s`);
    lines.push(`Average pitch (F0): ${af.avg_pitch_hz} Hz`);
    lines.push(`Pitch variability: ${af.pitch_variability}/100 (0=monotone, 100=highly expressive)`);
    lines.push(`Pause count: ${af.pause_count} pauses`);
    lines.push(`Pause frequency: ${af.pause_frequency}`);
    lines.push(`Volume consistency: ${af.volume_consistency}/100 (100=steady, 0=erratic)`);
    lines.push(`Jitter-shimmer index: ${af.jitter_shimmer_index}/100 (unvalidated frame-variation proxy, not psychological tension)`);
    lines.push(`━━ END MEASURED DATA ━━`);
    lines.push('Do not quote these values in prose or use them as direct emotion scores.');
  } else {
    lines.push(`\n\n[Note: Acoustic pre-processing data unavailable. Do not invent numerical measurements. Use clearly audible observations and the spoken account.]`);
    lines.push(`Duration: ~${durationSeconds}s`);
  }

  if (userContext) {
    lines.push(`\nUser context (personalise subtly, do not mention directly): ${JSON.stringify(userContext)}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini call
// ─────────────────────────────────────────────────────────────────────────────
async function callGemini(
  apiKey: string,
  audioBase64: string,
  mimeType: string,
  durationSeconds: number,
  acousticFeatures: AcousticFeatures | null,
  userContext?: Record<string, unknown>,
  deepQuestion?: string,
  deepAnswer?: string
): Promise<Record<string, unknown>> {
  const acousticCtx = buildAcousticContext(acousticFeatures, durationSeconds, userContext, deepQuestion, deepAnswer);

  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [
      { inlineData: { mimeType, data: audioBase64 } },
      { text: acousticCtx || 'Analyze this recording.' },
    ] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseJsonSchema: ANALYSIS_SCHEMA,
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

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned no parseable JSON');
  return validateAnalysis(JSON.parse(match[0]));
}

// ─────────────────────────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────────────────────────
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

  const {
    audio_base64,
    mime_type,
    duration_seconds,
    user_context,
    acoustic_features,
    deep_question,
    deep_answer,
  } = body as {
    audio_base64: string;
    mime_type: string;
    duration_seconds: number;
    user_context?: Record<string, unknown>;
    acoustic_features?: AcousticFeatures | null;
    deep_question?: string;
    deep_answer?: string;
  };

  if (typeof audio_base64 !== 'string' || !audio_base64 || typeof mime_type !== 'string' || !mime_type) {
    return NextResponse.json(
      { error: 'audio_base64 and mime_type are required' },
      { status: 400 }
    );
  }

  if (typeof duration_seconds !== 'number' || !Number.isFinite(duration_seconds) || duration_seconds < 3 || duration_seconds > 180) {
    return NextResponse.json({ error: 'Please record a few seconds of clear speech (up to three minutes).' }, { status: 400 });
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
    const analysis = await callGemini(
      apiKey,
      audio_base64,
      mime_type,
      duration_seconds ?? 0,
      acoustic_features ?? null,
      user_context,
      deep_question,
      deep_answer
    );

    // ── Map new schema fields, with safe fallbacks ───────────────────────────
    const aiInsight = String(
      analysis.ai_insight || analysis.insight || ''
    );
    const vocalSummary = String(analysis.vocal_summary || analysis.emotional_mirror || '');
    const transcriptSummary = String(analysis.transcript_summary || '');
    const recommendations = normaliseRecommendations(
      analysis.recommendations ?? analysis.tips
    ).map(makeCrisisContactLocationSafe);
    const rawTodaysAction = analysis.todays_action
      ? String(analysis.todays_action)
      : analysis.daily_prompt
      ? String(analysis.daily_prompt)
      : null;
    const todaysAction = rawTodaysAction
      ? makeCrisisContactLocationSafe(rawTodaysAction)
      : null;

    // New deep-analysis fields
    const narrativeType = analysis.narrative_type
      ? String(analysis.narrative_type)
      : 'present';
    const readinessScore = analysis.readiness_score != null
      ? Number(analysis.readiness_score)
      : null;
    const readinessNote = analysis.readiness_note
      ? String(analysis.readiness_note)
      : null;

    // Use transcription for speech rate; sustained loudness is not a word count.
    const af = acoustic_features ?? null;
    const measuredDuration = af?.duration_seconds;
    const duration = typeof measuredDuration === 'number' && Number.isFinite(measuredDuration) && measuredDuration >= 3 && measuredDuration <= 180
      ? measuredDuration : duration_seconds;
    const speechRate = transcriptSpeechRate(String(analysis.transcript), duration);
    const validFeatures = af && ['pitch_variability', 'avg_pitch_hz', 'pause_count', 'jitter_shimmer_index', 'volume_consistency']
      .every((key) => typeof af[key as keyof AcousticFeatures] === 'number' && Number.isFinite(af[key as keyof AcousticFeatures]));
    const vocalMetrics = validFeatures ? {
      pitch_variability: af.pitch_variability,
      avg_pitch_hz: af.avg_pitch_hz,
      pause_frequency: af.pause_frequency,
      pause_count: af.pause_count,
      speech_rate_wpm: speechRate,
      jitter_shimmer_index: af.jitter_shimmer_index,
      volume_consistency: af.volume_consistency,
    } : null;

    const sessionData = {
      user_id: user.id,
      mood_score: Number(analysis.mood_score),
      energy: Number(analysis.energy_level ?? analysis.energy),
      stress: Number(analysis.stress_level ?? analysis.stress),
      positivity: Number(analysis.positivity),
      confidence: Number(analysis.confidence),
      pace: normalisePace(speechRate < 100 ? 'slow' : speechRate > 180 ? 'fast' : 'normal'),
      // Preserve the model provenance required by the existing save contract.
      ai_provider: 'gemini',
      ai_model: GEMINI_MODEL,
      detected_mode: normaliseMode(analysis.detected_mode),
      // Legacy columns — populated for backward compat
      insight: aiInsight,
      tips: recommendations,
      daily_prompt: todaysAction,
      transcript: analysis.transcript ? String(analysis.transcript) : null,
      emotional_mirror: vocalSummary || null,
      duration_seconds: duration,
      // New Phase-1 columns (graceful — ignored by DB if column doesn't exist yet)
      vocal_metrics: vocalMetrics,
      vocal_summary: vocalSummary || null,
      transcript_summary: transcriptSummary || null,
      ai_insight: aiInsight,
      recommendations,
      todays_action: todaysAction,
      // New deep-analysis fields
      narrative_type: narrativeType,
      readiness_score: readinessScore,
      readiness_note: readinessNote,
    };


    // Save with user's JWT so RLS works
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { error: dbError } = await supabaseAuth
      .from('therapy_sessions')
      .insert(sessionData);

    // Return everything except user_id
    const { user_id, ...result } = sessionData;
    void user_id;

    if (dbError) {
      // Never swallow this. A silent save failure is what caused check-ins to
      // vanish: the user saw a complete results screen while nothing was
      // written, so Profile History and Trends stayed empty.
      //
      // The analysis is still returned so the user does not lose a paid-for
      // result, but `saved` is false and the client must surface that.
      console.error(
        `[analyze-mood] DB save FAILED for user ${user.id}: ` +
          `${dbError.code ?? 'no-code'} ${dbError.message}`
      );
      return NextResponse.json(
        {
          ...result,
          saved: false,
          save_error: dbError.message,
        },
        { status: 200 }
      );
    }

    return NextResponse.json({ ...result, saved: true });
  } catch (err) {
    if (err instanceof AnalysisValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    console.error('[analyze-mood] Analysis failed');
    return NextResponse.json(
      { error: 'Analysis failed. Please try again.' },
      { status: 500 }
    );
  }
}
