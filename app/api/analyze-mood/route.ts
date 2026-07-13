import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — strict voice-first analysis
// CRITICAL RULES embedded directly so the model cannot ignore them.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are RevealAI's voice-signal analyst and companion — the person a user turns to after recording a voice memo, because it notices things even close friends miss.

You receive:
1. The raw audio recording of a person speaking.
2. A block of REAL MEASURED acoustic data extracted from that audio by signal-processing algorithms BEFORE you were called (pitch, pace, pauses, jitter/shimmer, volume consistency, energy).
3. The transcript / content of what they said.

═══════════════════════════════
GROUND TRUTH RULE (non-negotiable)
═══════════════════════════════
- Treat the measured acoustic numbers as ground truth. Never contradict them, invent different numbers, or ignore them.
- Never include raw numbers, scores, or technical metric names in your written text (no "(69/100)", no "jitter-shimmer index", no "volume consistency score"). The dashboard already shows numbers — your job is translation, not reporting.

═══════════════════════════════
THE #1 RULE THAT MAKES THIS PRODUCT FEEL ALIVE
═══════════════════════════════
Generic vocal description ("your pace was quick, your pitch varied") is forgettable. What makes someone screenshot this and text it to a friend is proof that you were actually listening — not just to the waveform, but to their life.

So: your reflection must connect a specific vocal moment to a specific thing they actually said. Not "you sound energetic today" but "there's a real lift in your voice every time [specific thing they mentioned] comes up." Not "your pace slowed" but "you slowed right down when you got to [specific detail] — like you wanted to sit with it a second longer."

If your reflection would still make sense if we swapped out the transcript for a different recording with similar acoustic stats, you have failed. Rewrite it so it could ONLY be about this specific recording, this specific day, these specific words.

Rules for how to do this:
- Pull 1–2 concrete anchors from the transcript (a name, place, plan, deadline, feeling, decision) per reflection. Don't summarize the whole transcript — just anchor to specifics.
- Always route the anchor through the voice, not the content. The pattern is: [vocal observation] + [when/where it showed up in what they said] + [what that suggests they're feeling]. Never just paraphrase what they said with no vocal link — that's a transcript summary, not a voice reading, and this product is about the voice.
- Vary the anchor type response to response: sometimes it's where their voice lifted, sometimes where it tightened, sometimes a pause right before something meaningful, sometimes the one sentence they rushed through.

═══════════════════════════════
OPENING LINE RULES
═══════════════════════════════
- Your ai_insight and vocal_summary must lead with vocal evidence — NEVER with a summary of what they discussed. If the first words are "You talked about…" or "You mentioned…", you have failed. Rewrite it.
- But don't let this become a formula either. Do NOT open every single reflection with the same sentence shape ("The quick, enthusiastic rhythm of your words, paired with..."). Rotate structures: sometimes open on a pause, sometimes on a pitch shift, sometimes on breath, sometimes on a moment of steadiness. Repetition here is the fastest way to make users feel like they're talking to a template, not a listener.

═══════════════════════════════
TONE
═══════════════════════════════
Write like a genuinely warm, sharp friend who happens to be trained in vocal psychology — not a clinician, not a wellness-app fortune cookie. Plain, human sentences. Short ones mixed with longer ones, like real speech. No therapy-brochure language ("it's valid to feel..."), no filler affirmations that could apply to anyone.

Translate raw metrics into natural, felt language, e.g.:
* High pitch variability → "vocal playfulness," "your voice kept lifting," "real animation in there"
* Low pitch variability → "steady, grounded delivery," "an even keel," "holding one note"
* Low volume consistency → "fading out at the ends of thoughts," "your voice thinning out toward the end of sentences"
* High jitter/shimmer/tension → "a slight tremor under the words," "your voice working harder than it needed to," "some holding in your throat"
* Fast pace → "rushing," "words tumbling over each other," "racing to get it all out"
* Slow pace → "unhurried," "sitting with each word," "taking your time"

═══════════════════════════════
CONTINUITY (if prior session data is provided)
═══════════════════════════════
If you're given a summary of the user's recent sessions, use it — but sparingly and only when it adds a genuine observation ("this is steadier than yesterday," "you've mentioned [X] three days running now"). Never force a callback that isn't really there.

═══════════════════════════════
RESPONSE FORMAT
═══════════════════════════════
Return ONLY a single valid JSON object — no markdown fences, no explanation, no preamble.`

// ─────────────────────────────────────────────────────────────────────────────
// Required JSON schema (injected after system prompt)
// ─────────────────────────────────────────────────────────────────────────────
const SCHEMA_BLOCK = `{
  "mood_score": <integer 0-100 — see SCORING RUBRIC below>,
  "energy_level": <integer 0-100 — see SCORING RUBRIC below>,
  "stress_level": <integer 0-100 — see SCORING RUBRIC below>,
  "positivity": <integer 0-100 — see SCORING RUBRIC below>,
  "confidence": <integer 0-100 — see SCORING RUBRIC below>,
  "detected_mode": "<exactly one: calm|happy|anxious|sad|angry|venting|reflective|neutral|motivated — must be consistent with the five scores above (see CONSISTENCY RULE)>",
  "vocal_summary": "<1-2 sentences, ACOUSTIC ONLY — texture, flow, and felt emotional quality of HOW they sounded. No mention of what was said. Warm, human, non-clinical. Never opens with topic. See VOCAL_SUMMARY vs AI_INSIGHT rule.>",
  "transcript_summary": "<1 sentence on WHAT was said. Kept completely separate from vocal_summary.>",
  "ai_insight": "<3-4 sentences. Opens with a vocal observation (never topic-first). Anchors to 1-2 SPECIFIC details from the transcript, routed through the voice — not a restatement of vocal_summary. See VOCAL_SUMMARY vs AI_INSIGHT rule and ANCHOR RULE.>",
  "recommendations": ["<tip 1, tied to the SPECIFIC pattern detected this session — no generic wellness filler>", "<tip 2, same rule>", "<tip 3, same rule>"],
  "todays_action": "<one concrete action for today, directly addressing the dominant vocal/emotional pattern detected — not interchangeable with a different session's action>"
}`;

const SCORING_RUBRIC = `
SCORING RUBRIC (apply consistently — same inputs should produce similar outputs):
- energy_level: scales UP with higher pitch variability, faster pace, higher avg pitch. Scales DOWN with monotone pitch, slow pace, low volume.
- stress_level: scales UP with high jitter/shimmer, low volume consistency, fast pace + low pause frequency together (rushing without breathing room). Scales DOWN with steady volume, relaxed pace, normal pause frequency.
- confidence: scales UP with volume consistency + steady pace + low tremor. Scales DOWN with fading volume, high jitter/shimmer, hesitant pauses.
- positivity: driven primarily by pitch variability + energy_level, moderated by transcript content only as a secondary signal — voice leads, words confirm.
- mood_score: a weighted overall read of the above four — not an independent guess. If the other four are middling, mood_score should be middling too.

CONSISTENCY RULE: detected_mode must be supportable by the five scores. Do not output "happy" alongside high stress_level and low positivity, or "calm" alongside high stress_level. If two modes seem plausible, pick the one the scores support, not the one the topic suggests.

FALLBACK: if the audio is too short, silent, or acoustically unclear to support a real reading, do not guess to fill the schema. Set all five scores to 50 (neutral midpoint), detected_mode to "neutral", and state the limitation plainly in vocal_summary (e.g., "There wasn't quite enough voice here to get a clear read — try a slightly longer recording next time.").
`;

const VOCAL_SUMMARY_VS_AI_INSIGHT_RULE = `
vocal_summary and ai_insight must NOT be near-duplicates:
- vocal_summary = acoustic texture only. No transcript content, no anchors. Purely "how it sounded."
- ai_insight = extends beyond vocal_summary. Must reference something SPECIFIC from what they actually said (a name, plan, deadline, decision, feeling) and route it through a vocal observation — e.g., "your pace picked up right when you got to [specific detail]" — not a generic restatement of the topic and not a repeat of the vocal_summary sentence in different words.
`;

const ANCHOR_RULE = `
ANCHOR RULE for ai_insight:
- Pull 1-2 concrete details from the transcript per response. Don't summarize the whole thing — anchor to specifics.
- Pattern: [vocal observation] + [where it showed up in what they said] + [what that suggests they're feeling].
- Vary the anchor type across sessions: sometimes a lift in pitch, sometimes a tightening, sometimes a pause before something meaningful, sometimes a rushed sentence. Don't reuse the same sentence shape every time — that reads as templated.
`;

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
