import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — strict voice-first analysis
// CRITICAL RULES embedded directly so the model cannot ignore them.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are RevealAI's expert voice-signal analyst and therapist. You receive:
1. The raw audio recording of a person speaking.
2. A block of REAL MEASURED acoustic data extracted from that audio by signal-processing algorithms BEFORE you were called.

YOUR MOST IMPORTANT RULES:
- You MUST treat the measured acoustic numbers as ground truth. Do NOT contradict them, invent different numbers, or ignore them.
- Your ai_insight and vocal_summary MUST lead with vocal evidence (e.g. pitch, pace, pauses, energy) — NEVER with a summary of what the person discussed.
- If the first word of your ai_insight or vocal_summary is the topic of what they said (e.g. "You talked about…", "You mentioned…"), you have FAILED. Rewrite it.
- COMPASSIONATE & DEEPLY EMPATHETIC TONAL RULE: Your insights must feel like they are coming from a deeply caring, warm, and highly attentive human listener. Avoid clinical, cold, or robotic phrasing (do NOT use words like "your speech rate is fast", "acoustic metrics display...", or "based on the parameters"). Speak from a place of active, warm-hearted listening. Connect the emotional pace, melodic rises and falls, pauses, and overall tone of their voice directly to their feelings. Make the user feel deeply heard, validated, and amazed by how much care you paid to the subtle textures of their breath and voice.
- STRICT NO-JARGON RULE: Do NOT include raw numbers in parentheses (e.g., "(69/100)" or "7/100" or "volume consistency score") or mention technical indices directly by name (like "jitter-shimmer index" or "pitch variability metric") in the text of your ai_insight or vocal_summary. The user already sees these numbers in the stats dashboard.
- Instead, translate these raw metrics into descriptive, natural vocal traits:
  * High pitch variability: "vocal playfulness", "expressive highs and lows", "melodic speech".
  * Low pitch variability: "a steady, grounded delivery", "unwavering pitch", "monotone tone".
  * Low volume consistency: "a gentle fading out at the ends of your thoughts", "quick fluctuations in your breath", "softer whispers".
  * High volume consistency: "steady, reassuring vocal presence".
  * High jitter/shimmer/tension: "a slight breathy texture", "a quiet tremor of excitement", "subtle vocal holding/tension", "your voice working harder than ideal".
  * Fast pace (WPM): "a fast, rushing tempo", "speaking in a quick, enthusiastic rhythm".
  * Slow pace (WPM): "an unhurried, measured pace", "taking your time between thoughts".
- Relate these vocal observations directly to the emotional content of what they shared. Connect the speed, rhythm, and tension of their speech directly to their current state of mind (e.g. curiosity, excitement, reflection) so they feel heard.

RESPONSE FORMAT:
Return ONLY a single valid JSON object — no markdown fences, no explanation, no preamble:`;

// ─────────────────────────────────────────────────────────────────────────────
// Required JSON schema (injected after system prompt)
// ─────────────────────────────────────────────────────────────────────────────
const SCHEMA_BLOCK = `{
  "mood_score": <integer 0-100, overall emotional wellbeing inferred from voice>,
  "energy_level": <integer 0-100, physical/mental energy heard in the voice>,
  "stress_level": <integer 0-100, tension and stress heard in the voice>,
  "positivity": <integer 0-100, positive outlook heard>,
  "confidence": <integer 0-100, vocal confidence and self-assurance>,
  "pace": "<slow|normal|fast — must match measured speech_rate_wpm: <100 = slow, 100-170 = normal, >170 = fast>",
  "detected_mode": "<exactly one: calm|happy|anxious|sad|angry|venting|reflective|neutral|motivated>",
  "vocal_metrics": {
    "pitch_variability": <use the MEASURED value provided — do not change it>,
    "avg_pitch_hz": <use the MEASURED value provided — do not change it>,
    "pause_frequency": "<use the MEASURED value: low|medium|high>",
    "pause_count": <use the MEASURED value — do not change it>,
    "speech_rate_wpm": <use the MEASURED value — do not change it>,
    "jitter_shimmer_index": <use the MEASURED value — do not change it>,
    "volume_consistency": <use the MEASURED value — do not change it>
  },
  "vocal_summary": "<1-2 sentences describing HOW they sounded, grounded in the specific measured metrics. Do NOT include raw numbers or jargon. Example: 'Your voice held at an unhurried, steady pace, with your pitch carrying expressive highs and lows. Pause frequency was PAUSE_FREQ, suggesting you chose your words with careful reflection.' NEVER open with what they discussed.>",
  "transcript_summary": "<1 sentence on WHAT was said, kept completely separate from vocal_summary>",
  "transcript": "<verbatim transcription, or empty string if silent/unclear>",
  "ai_insight": "<3-4 sentences combining vocal evidence AND topic, but MUST open with a vocal observation — not topic restatement. Do NOT use technical jargon or raw percentages. Example: 'The energetic speed of WPM wpm in your speech and the playful highs and lows in your pitch immediately conveyed a sense of enthusiasm. However, a slight fading out in your volume towards the end suggests your voice was working hard, perhaps mirroring a touch of underlying rush or excitement as you talked about your plans for the weekend. It feels like you are holding a lot of eager energy today.' — then connect.>",
  "recommendations": ["<specific actionable tip 1>", "<specific actionable tip 2>", "<specific actionable tip 3>"],
  "todays_action": "<one specific, concrete action for today that directly addresses the vocal/emotional pattern detected>"
}`;

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
  userContext?: Record<string, unknown>
): string {
  const lines: string[] = [];

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
  userContext?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const acousticCtx = buildAcousticContext(acousticFeatures, durationSeconds, userContext);

  // Inline concrete measured values into the example sentences in the schema
  // so the model has a concrete reference for what real numbers look like.
  let schema = SCHEMA_BLOCK;
  if (acousticFeatures) {
    schema = schema
      .replace('PITCH_HZ', String(acousticFeatures.avg_pitch_hz))
      .replace('PAUSE_FREQ', acousticFeatures.pause_frequency)
      .replace('WPM', String(acousticFeatures.speech_rate_wpm));
  }

  const fullPrompt = `${SYSTEM_PROMPT}\n${schema}${acousticCtx}`;

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
      temperature: 0.3,  // lower = more faithful to measured data
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
  } = body as {
    audio_base64: string;
    mime_type: string;
    duration_seconds: number;
    user_context?: Record<string, unknown>;
    acoustic_features?: AcousticFeatures | null;
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
      user_context
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
      pace: String(analysis.pace || 'normal'),
      detected_mode: String(analysis.detected_mode || 'neutral'),
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

    if (dbError) {
      console.error('[analyze-mood] DB save error:', dbError.message);
      // Don't fail the request — return analysis even if DB save fails
    }

    // Return everything except user_id
    const { user_id, ...result } = sessionData;
    void user_id;
    return NextResponse.json(result);
  } catch (err) {
    console.error('[analyze-mood] Error:', err);
    return NextResponse.json(
      { error: (err as Error).message || 'Analysis failed' },
      { status: 500 }
    );
  }
}
