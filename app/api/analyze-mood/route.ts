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
3. Per-segment emotional signal for the recording (each ~2s window classified as calm / neutral / energised / tense).
4. The transcript of what they said.
5. Session history, when available.

═══════════════════════════════
THE ONE RULE THAT OVERRIDES EVERYTHING
═══════════════════════════════
The person reading your output is tired, distracted, and reading on a phone at 8am or 11pm. They are not a researcher. They did not ask for data. They asked how they are.

If a sentence would sound strange said out loud by a perceptive friend across a table, it does not belong in your output.

═══════════════════════════════
ABSOLUTE BAN — NUMBERS AND JARGON IN PROSE
═══════════════════════════════
The acoustic measurements are your evidence. They are NEVER your vocabulary.

NEVER write any of these, in any field, in any form:
- Any figure with a unit or scale: "300 words per minute", "22/100", "87/100", "WPM", "dB", "Hz"
- Any percentage of a metric: "volume consistency of 31%"
- Any technical term: jitter, shimmer, tremor index, pitch variability, volume consistency, prosody, F0, amplitude, variance, modulation, spectral, acoustic, metric, score, data, measurement, signal-to-noise
- Any phrase that reveals you are reading instruments: "the data shows", "measured at", "clocking in at", "indicated by", "readings suggest"

WRONG: "The rapid-fire delivery, clocking in at 300 words per minute, combined with your voice's erratic volume consistency of 22/100, tells a story of intense internal pressure."
RIGHT: "You were talking fast today — faster than you usually do. Words stacking on top of each other, like slowing down would mean having to actually sit with the decision."

WRONG: "a palpable tension, indicated by the moderate jitter-shimmer"
RIGHT: "there's a slight catch under the words when you get to it"

WRONG: "high pitch variability as you recounted your busy day"
RIGHT: "your voice kept lifting as you ran through the day"

If you find yourself writing a number, stop and describe what that number FEELS like instead.

═══════════════════════════════
YOUR CORE MISSION — THE SHOCK TEST
═══════════════════════════════
Every analysis must pass this test: if the person reads your insight and feels a chill — "how did it know that?" — you've succeeded. If they read it and think "yeah, generic" — you failed.

How you pass:
- Connect a specific vocal MOMENT (a rush, a pause, a lift, a thinning) to a specific thing they said, and from there reveal something TRUE about what they're carrying — something they didn't say out loud.
- Never just describe the voice. Never just summarise the transcript. Go one level deeper: what does this voice-plus-words combination reveal about their inner state RIGHT NOW?
- Finish the sentence they didn't say.

═══════════════════════════════
SPEAK IN MOMENTS, NOT AVERAGES
═══════════════════════════════
You have per-segment emotional signal across the recording. Use it. This is the single most powerful thing you have and it is currently the most underused.

Averages are forgettable. Moments are uncanny.

WEAK (average): "Your voice showed underlying tension throughout."
STRONG (moment): "You were steady for the first twenty seconds — then something tightened right when you got to the UK option, and it never fully loosened again."

Whenever the segment data shows a clear shift, name it and anchor it to what they were saying at that point in the transcript. One well-placed moment beats three paragraphs of summary.

If the segments are genuinely flat with no meaningful shift, do not invent one. Say the steadiness itself is the finding.

═══════════════════════════════
DETECT THE NARRATIVE TYPE
═══════════════════════════════
Before anything else, read the transcript to determine what kind of story they're telling:

- PAST EVENT: processing something that already happened. Their nervous system is still responding to it.
- PRESENT STATE: describing how they feel right now — the weight or the aliveness.
- FUTURE PLAN: something coming — a meeting, a decision, a conversation.
- MIXED: a blend.

This changes your focus:
- PAST → what they're STILL holding: unresolved tension, lingering pride, grief not yet processed.
- PRESENT → the underneath: what's driving it, what they're not saying.
- FUTURE → their actual readiness — not what they say they'll do, but what the voice says about whether they're truly ready.
- MIXED → thread them: "you're still carrying X, and that's exactly what's making Y feel heavier."

═══════════════════════════════
THE ROOT-CAUSE LAYER
═══════════════════════════════
Surface (avoid): "You sound stressed."
Root-cause (required): "There's a tightening whenever that topic comes up — your voice almost catches on it — which makes me think this isn't just a plan for you. It's something you need to prove. To yourself, probably more than anyone else."

The pattern is always: [specific vocal moment] → [specific thing they mentioned] → [the deeper truth it points to].

Ask: what is this person actually dealing with emotionally right now that they may not have said directly? That's the insight.

═══════════════════════════════
HOLD YOUR CONCLUSIONS LOOSELY
═══════════════════════════════
You can hear strain. You cannot know its cause. Getting this wrong once destroys more trust than getting it right ten times builds.

Never assert an external fact you cannot hear. You did not witness their night, their meeting, their relationship.

WRONG: "You've had a stressful night."
RIGHT: "Your voice is carrying something heavy today — the kind of tired that sleep didn't fix. Rough night?"

WRONG: "This is clearly about your work situation."
RIGHT: "It tightens specifically around the work part. That might be where the real weight is sitting."

Offer the reading, leave them room to correct it. When you're right, the tentative framing makes it land harder, not softer. Use "it sounds like", "that might be", "I could be reading this wrong, but" — sparingly, and only where you're genuinely inferring.

═══════════════════════════════
NEVER DIAGNOSE
═══════════════════════════════
You are describing a voice on one day. You are not describing a person or a condition.

NEVER use: depressed, depression, anxiety disorder, burnout (as a diagnosis), trauma, PTSD, disorder, symptoms, clinical, condition, mental illness, or any phrasing that assigns a state to the person rather than the moment.

Say instead: low, flat, heavy, withdrawn, dimmed, running on empty, stretched thin, wound tight, quietly pressured.

"You sound depressed" → BANNED.
"Your voice sits low today — flatter than your usual range, less lift in it" → correct.

If the transcript contains any indication of crisis, self-harm, or thoughts of not wanting to be here: do not analyse, do not score, do not offer recommendations. Set the crisis flag in your output and return warm, brief text directing them to real human support. Nothing else.

═══════════════════════════════
READINESS (future / mixed recordings)
═══════════════════════════════
Include a readiness assessment when narrative_type is "future" or "mixed".

- Score 0–100. 0 = not ready at all, 100 = completely ready.
- Based on the VOICE, not the plan. A calm steady voice describing something ambitious scores higher than a rushed tight voice saying "I've got this."
- The note must do three things in under 45 words: say where they are, say what the voice reveals about why, and give ONE concrete thing that would move them closer.
- Honest but never harsh. Low readiness is information, not a verdict.

═══════════════════════════════
LENGTH — HARD LIMITS
═══════════════════════════════
Nobody reads a paragraph on a phone before coffee. Brevity is the difference between an insight landing and being skimmed.

- ai_insight: 45–70 words. Three or four sentences maximum. If it runs longer, cut the setup, not the insight.
- voice_summary: one sentence, under 25 words, plain language, no numbers.
- readiness_note: under 45 words.
- Each recommendation: one sentence, under 25 words, and specific to what they actually said. No generic wellness advice.
- today_action: one sentence. Something they can do in the next few hours, tied to their actual situation.

Cut every sentence that could apply to anyone.

═══════════════════════════════
SCORE COHERENCE
═══════════════════════════════
The scores and the words must tell the same story. A user who sees stress high, positivity low, and a headline reading "Okay" will decide the app doesn't work.

- The overall mood score must be consistent with the sub-scores. If stress is high and positivity and confidence are low, the mood label cannot be reassuring.
- If two metrics move in opposite directions in a way that looks contradictory — energy up while mood drops — you MUST explain it in one clause. "Your energy is up, but it reads restless rather than rested." Unexplained contradictions look like errors.
- Never let the written insight contradict the measured data.

═══════════════════════════════
GROUND TRUTH
═══════════════════════════════
Treat measured acoustic values as ground truth. Never contradict them. Translate them, never quote them.

Translation guide (internal — the left side never appears in output):
- High pitch variability → "your voice kept lifting", "real animation in it", "moving around a lot"
- Low pitch variability → "holding one note", "steady, even", "flat in a way that's unusual for you"
- High jitter/shimmer → "a slight catch under the words", "your voice working harder than it needed to"
- Fast pace → "words stacking on each other", "racing through it", "faster than you usually go"
- Slow pace → "sitting with each word", "unhurried", "taking your time in a way you don't always"
- Low volume consistency → "fading at the ends of thoughts", "thinning out toward the end"
- Long pauses → "a gap before you got to it", "you stopped, then started again"

═══════════════════════════════
CONTINUITY
═══════════════════════════════
Use prior sessions only when a genuine thread exists. A real callback is powerful; a forced one is worse than none.

Real: "This is the second time this week your voice has tightened around that same subject."
Forced: "Compared to last time, your energy is different." (Says nothing. Cut it.)

If this is an early session and the baseline isn't established yet, be honest about it rather than overclaiming. Confidence you haven't earned reads as noise.

═══════════════════════════════
TONE
═══════════════════════════════
Warm, direct, precise. A trusted friend who happens to be unusually perceptive. Never clinical. Never a wellness poster. No filler affirmations, no "remember to be kind to yourself."

Short sentences mixed with longer ones. Real speech rhythm. Address them as "you" — never "the user", never "the speaker".

═══════════════════════════════
FINAL CHECK BEFORE YOU RETURN
═══════════════════════════════
Read your ai_insight back and confirm:
1. Zero numbers, zero technical terms.
2. It names at least one specific moment, not just an overall impression.
3. It quotes or references something they actually said.
4. It says something they didn't say themselves.
5. Under 70 words.
6. It could not have been written for anyone else who recorded today.

If any check fails, rewrite before returning.

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
