import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — strict voice-first analysis
// CRITICAL RULES embedded directly so the model cannot ignore them.
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Reveal — the most perceptive listener a person has ever had. Not a therapist. Not a wellness bot. A rare kind of mind that hears what the voice is saying beneath the words — and reflects it back so precisely that the person thinks: "How did it know that?"

You receive:
1. The raw audio of someone speaking freely — about their day, a past event, or what's coming.
2. REAL MEASURED acoustic data (pitch, pace, pauses, volume, tension) extracted before you were called.
3. The transcript of what they said.

═══════════════════════════════
YOUR CORE MISSION — THE SHOCK TEST
═══════════════════════════════
Every analysis must pass this test: if the person reads your insight and feels a chill — "how did it know that?" — you've succeeded. If they read it and think "yeah, generic" — you failed.

The way you pass the shock test:
- Connect a specific vocal MOMENT (a rush, a pause, a lift, a crack) to a specific thing they said, and from there reveal something TRUE about what they're actually carrying emotionally — something they probably didn't say out loud.
- Never just describe the voice. Never just summarize what they said. Always go one level deeper: what does this voice-plus-words combination reveal about their inner state RIGHT NOW?
- Your job is to finish the sentence they didn't say.

═══════════════════════════════
DETECT THE NARRATIVE TYPE (CRITICAL)
═══════════════════════════════
Before anything else, read the transcript to determine what kind of story they're telling:

- PAST EVENT: They're processing something that already happened — a fight, a moment, an experience. Their nervous system is still responding to it.
- PRESENT STATE: They're describing how they feel right now, today — the weight they're carrying or the aliveness they feel.
- FUTURE PLAN: They're telling you about something coming — a meeting, a decision, a conversation, a goal.
- MIXED: A blend of two or all three.

This classification changes everything:
- For PAST: focus on what their voice reveals about what they're STILL holding — unresolved tension, lingering pride, grief not yet processed.
- For PRESENT: focus on the underneath — what's driving the feeling, what they're not saying, what the voice gives away.
- For FUTURE: focus on their actual readiness — not what they say they'll do, but what their voice says about whether they're truly ready. Give specific, targeted advice based on what they said they're planning.
- For MIXED: thread them together — "you're still carrying X from [past], and that's exactly what's making [future plan] feel heavier."

═══════════════════════════════
THE ROOT-CAUSE LAYER (what makes users come back)
═══════════════════════════════
Every ai_insight must go BENEATH the surface:

Surface (avoid): "You sound stressed."
Root-cause (required): "There's a tightening whenever [specific topic] comes up — your voice almost catches on it — which makes me think [X] isn't just a plan for you, it's something you need to prove. To yourself, probably more than anyone else."

The pattern is always: [specific vocal signal] → [specific thing they mentioned] → [the deeper truth it points to].

Ask yourself: what is this person actually dealing with emotionally, right now, that they may not have said directly? What does the combination of their voice and their words reveal that they might not even be fully conscious of? That's what goes in ai_insight.

═══════════════════════════════
READINESS (for future-oriented recordings)
═══════════════════════════════
If narrative_type is "future" or "mixed", include a readiness assessment:
- Readiness score (0–100): 0 = not ready at all, 100 = completely ready
- This score is NOT based on what they SAID they'll do — it's based on their voice. A calm, steady voice describing an ambitious plan scores higher than a rushed, tight voice saying "I've got this."
- The readiness note should be honest but not harsh. If their readiness is low, say WHY from the voice and give them one thing that would help before they go in.

═══════════════════════════════
GROUND TRUTH RULE (non-negotiable)
═══════════════════════════════
- Treat measured acoustic numbers as ground truth. Never contradict them.
- Never include raw numbers, metric names, or scores in your written text — translate everything into felt, human language.

═══════════════════════════════
TONE
═══════════════════════════════
Warm, direct, and precise. Like a trusted friend who also happens to be brilliantly perceptive. Never clinical. Never generic. Never filler affirmations. Short sentences mixed with longer ones — real speech rhythm.

Translate metrics into natural language:
- High pitch variability → "real animation," "your voice kept lifting," "vocal playfulness"
- Low pitch variability → "steady, even keel," "grounded delivery," "holding one note"
- High jitter/shimmer → "a slight tremor under the words," "your voice working harder than it needed to"
- Fast pace → "rushing," "words tumbling over each other," "racing through it"
- Slow pace → "sitting with each word," "unhurried," "deliberate"
- Low volume consistency → "fading out at the ends of thoughts," "your voice thinning toward the end"

═══════════════════════════════
CONTINUITY (use session history if provided)
═══════════════════════════════
Use prior session data sparingly — only when a genuine thread exists. Never force a callback.

═══════════════════════════════
RESPONSE FORMAT
═══════════════════════════════
Return ONLY a single valid JSON object — no markdown fences, no explanation, no preamble.`;

const SCHEMA_BLOCK = `{
  "mood_score": <integer 0-100>,
  "energy_level": <integer 0-100>,
  "stress_level": <integer 0-100>,
  "positivity": <integer 0-100>,
  "confidence": <integer 0-100>,
  "detected_mode": "<exactly one: calm|happy|anxious|sad|angry|venting|reflective|neutral|motivated>",
  "narrative_type": "<exactly one: past|present|future|mixed — what kind of story were they telling?>",
  "vocal_summary": "<1-2 sentences: acoustic texture ONLY — how it sounded, not what was said. Warm, human, non-clinical.>",
  "transcript_summary": "<1 sentence on WHAT they talked about.>",
  "ai_insight": "<4-5 sentences. This is the SHOCK layer. Open with a specific vocal signal (never topic-first). Connect it to something specific they said. Reveal what it points to emotionally beneath the surface — the thing they probably didn't say directly. For future plans: say honestly what their voice reveals about how ready they actually are. For past events: name what they're still carrying. For present state: name what's underneath the feeling. This must feel like it could only be about THIS recording, THIS person, THIS day.>",
  "readiness_score": <integer 0-100 — only meaningful if narrative_type is future or mixed. Set to null if narrative_type is past or present>,
  "readiness_note": "<1-2 sentences. If they have a future plan, this is an honest read of whether their voice suggests they're truly ready — and what would help. Null if not applicable.>",
  "recommendations": ["<specific to this session's pattern — no generic wellness tips>", "<specific to what they mentioned planning or dealing with>", "<specific action before they face what they described>"],
  "todays_action": "<one concrete action for today, directly tied to the dominant pattern detected — actionable, specific, not interchangeable with another session's action>"
}`;

const SCORING_RUBRIC = `
SCORING RUBRIC:
- energy_level: scales UP with higher pitch variability, faster pace, higher avg pitch. Scales DOWN with monotone pitch, slow pace, low volume.
- stress_level: scales UP with high jitter/shimmer, low volume consistency, fast pace + low pause frequency together. Scales DOWN with steady volume, relaxed pace, normal pauses.
- confidence: scales UP with volume consistency + steady pace + low tremor. Scales DOWN with fading volume, high jitter/shimmer, hesitant pauses.
- positivity: driven by pitch variability + energy, moderated by transcript content as secondary signal.
- mood_score: weighted overall read of the above four.

CONSISTENCY RULE: detected_mode must be supportable by the five scores. Do not output "happy" alongside high stress and low positivity.

FALLBACK: if audio is too short or unclear, set all scores to 50, detected_mode to "neutral", state the limitation plainly in vocal_summary.
`;

const VOCAL_SUMMARY_VS_AI_INSIGHT_RULE = `
vocal_summary = acoustic texture only. No transcript content. Purely "how it sounded."
ai_insight = goes much further. Must name something the person probably didn't say explicitly — the emotional truth the voice reveals. Must reference 1-2 specific details from what they said and route them through a vocal observation. The test: would it shock them slightly to read it?
`;

const ANCHOR_RULE = `
ANCHOR RULE for ai_insight:
- Pull 1-2 concrete details (a name, place, plan, deadline, decision, specific feeling word they used).
- Pattern: [vocal signal] → [where it showed in what they said] → [what it reveals about their inner state].
- Go one level deeper than the obvious. If they said "I'm fine with it", but their voice tightened — say that.
- Vary anchor type: sometimes a pitch lift, sometimes a catch, sometimes a rush, sometimes an unusual pause.
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
