import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  SYSTEM_PROMPT,
  SCHEMA_BLOCK,
  SCORING_RUBRIC,
  VOCAL_SUMMARY_VS_AI_INSIGHT_RULE,
  ANCHOR_RULE,
} from '@/prompts/checkIn';

export const maxDuration = 60;

/** Recorded on every row as ai_model, so a stored analysis says what produced it. */
const GEMINI_MODEL = 'gemini-2.5-flash';

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
  speech_rate_wpm: number;
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
    lines.push(`IMPORTANT: Integrate the user's answer into your deep insight, root cause diagnosis, readiness score, and recommendations. This interaction revealed critical additional context.`);
  }

  if (af) {
    lines.push(`\n\n━━ REAL MEASURED ACOUSTIC DATA (signal-processed before AI call) ━━`);
    lines.push(`Signal quality: ${af.signal_quality}`);
    lines.push(`Duration: ${af.duration_seconds}s`);
    lines.push(`Average pitch (F0): ${af.avg_pitch_hz} Hz`);
    lines.push(`Pitch variability: ${af.pitch_variability}/100 (0=monotone, 100=highly expressive)`);
    lines.push(`Speech rate: ${af.speech_rate_wpm} WPM`);
    lines.push(`Pause count: ${af.pause_count} pauses`);
    lines.push(`Pause frequency: ${af.pause_frequency}`);
    lines.push(`Volume consistency: ${af.volume_consistency}/100 (100=steady, 0=erratic)`);
    lines.push(`Jitter-shimmer index: ${af.jitter_shimmer_index}/100 (0=smooth, 100=rough/tense)`);
    lines.push(`━━ END MEASURED DATA ━━`);
    lines.push(`\nIMPORTANT: Copy vocal_metrics exactly from the measured values above.`);
    lines.push(`Your vocal_summary and ai_insight MUST reference these specific numbers.`);
  } else {
    lines.push(`\n\n[Note: Acoustic pre-processing data unavailable. Estimate vocal metrics from the audio directly but be conservative — do not over-claim precision. Still lead with vocal evidence.]`);
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

  // Inline concrete measured values into the example sentences in the schema
  // so the model has a concrete reference for what real numbers look like.
  let schema = SCHEMA_BLOCK;
  if (acousticFeatures) {
    schema = schema
      .replace('PITCH_HZ', String(acousticFeatures.avg_pitch_hz))
      .replace('PAUSE_FREQ', acousticFeatures.pause_frequency)
      .replace('WPM', String(acousticFeatures.speech_rate_wpm));
  }

  // These three blocks were written as prompt fragments but were never
  // referenced — fullPrompt was built from SYSTEM_PROMPT + schema + context
  // only, so none of them ever reached the model. Almost certainly dropped in
  // a refactor rather than removed deliberately: they have no other purpose.
  //
  // SCORING_RUBRIC is the one that mattered. SYSTEM_PROMPT explains that the
  // five scores must be coherent with each other, but nothing told the model
  // how to DERIVE them from the measured acoustics — so energy, stress and
  // confidence were being set without reference to pitch variability, jitter
  // or volume consistency, despite those being measured and passed in.
  //
  // NOTE: restoring these changes check-in output. Compare a few analyses
  // before and after once GEMINI_API_KEY is available.
  const fullPrompt = [
    SYSTEM_PROMPT,
    schema,
    SCORING_RUBRIC,
    VOCAL_SUMMARY_VS_AI_INSIGHT_RULE,
    ANCHOR_RULE,
    acousticCtx,
  ].join('\n');

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: fullPrompt },
        ],
      },
    ],
    generationConfig: {
      // Measured 6 Aug 2026: same audio, same prompt, six runs each.
      //
      //                  temp 0.3        temp 0
      //   mood_score     30-45 (±15)     35-40 (±5)
      //   energy_level   40-65 (±25)     60    (±0)
      //   stress_level   70-85 (±15)     80    (±0)
      //   confidence     40-60 (±20)     45-50 (±5)
      //
      // At 0.3 the scores were not reproducible: identical audio produced a
      // 25-point spread on energy. That matters beyond cosmetics, because
      // computeEarlyWarnings() fires burnout on "energy dropped 15+ points
      // across 4 sessions" — a threshold well inside the noise band. The
      // alerts could trigger on measurement noise alone.
      //
      // detected_mode was stable at both settings (anxious, 6/6 either way).
      // The qualitative read was never the problem; the numbers were.
      //
      // Trade-off: this also makes ai_insight and vocal_summary more
      // deterministic, so wording will vary less between sessions. Worth
      // watching. If the prose becomes noticeably repetitive, split into two
      // calls — scores at 0, narrative at 0.6 — rather than reintroducing
      // variance into numbers users are shown as trends.
      temperature: 0,
      topP: 0.85,
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

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned no parseable JSON');
  return JSON.parse(match[0]);
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
    const recommendations = Array.isArray(analysis.recommendations)
      ? analysis.recommendations
      : Array.isArray(analysis.tips)
      ? analysis.tips
      : [];
    const todaysAction = analysis.todays_action
      ? String(analysis.todays_action)
      : analysis.daily_prompt
      ? String(analysis.daily_prompt)
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

    // Build vocal_metrics — prefer what Gemini returned, overlay with measured data for trust
    const rawVm = analysis.vocal_metrics as Record<string, unknown> | undefined;
    const af = acoustic_features ?? null;
    const vocalMetrics = {
      pitch_variability: af?.pitch_variability ?? Number(rawVm?.pitch_variability ?? 50),
      avg_pitch_hz: af?.avg_pitch_hz ?? Number(rawVm?.avg_pitch_hz ?? 0),
      pause_frequency: af?.pause_frequency ?? (String(rawVm?.pause_frequency ?? 'medium') as 'low' | 'medium' | 'high'),
      pause_count: af?.pause_count ?? Number(rawVm?.pause_count ?? 0),
      speech_rate_wpm: af?.speech_rate_wpm ?? Number(rawVm?.speech_rate_wpm ?? 120),
      jitter_shimmer_index: af?.jitter_shimmer_index ?? Number(rawVm?.jitter_shimmer_index ?? 30),
      volume_consistency: af?.volume_consistency ?? Number(rawVm?.volume_consistency ?? 70),
    };

    const sessionData = {
      user_id: user.id,
      mood_score: Number(analysis.mood_score) || 50,
      energy: Number(analysis.energy_level ?? analysis.energy) || 50,
      stress: Number(analysis.stress_level ?? analysis.stress) || 50,
      positivity: Number(analysis.positivity) || 50,
      confidence: Number(analysis.confidence) || 50,
      // Capitalised deliberately. therapy_sessions has a CHECK constraint that
      // only accepts 'Slow' | 'Normal' | 'Fast', and every insert here was
      // writing lowercase 'normal' — which failed with 23514 on every single
      // check-in, independently of the missing-column problem.
      //
      // Note the model is never asked for `pace`: it is absent from
      // SCHEMA_BLOCK, so analysis.pace is always undefined and this value is
      // always the fallback. That is worth fixing properly, but the immediate
      // bug is the casing.
      pace: normalisePace(analysis.pace),

      // NOT NULL on the table, and this route has never written them — the
      // insert failed with 23502 before it could reach anything else. The nine
      // surviving rows were written by code that predates this repository.
      //
      // Worth keeping rather than relaxing the constraint: the product now
      // uses two AI vendors, so knowing which one produced a given analysis
      // stops being trivia the moment output quality is ever questioned.
      ai_provider: 'gemini',
      ai_model: GEMINI_MODEL,
      detected_mode: normaliseMode(analysis.detected_mode),
      // Legacy columns — populated for backward compat
      insight: aiInsight,
      tips: recommendations,
      daily_prompt: todaysAction,
      transcript: analysis.transcript ? String(analysis.transcript) : null,
      emotional_mirror: vocalSummary || null,
      duration_seconds: duration_seconds ?? 0,
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
    console.error('[analyze-mood] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Analysis failed' },
      { status: 500 }
    );
  }
}
