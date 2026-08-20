import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { REFLECT_GEMINI_MODEL } from '@/prompts/checkIn';

const ALLOWED_MODES = new Set([
  'calm',
  'happy',
  'hopeful',
  'anxious',
  'sad',
  'angry',
  'venting',
  'reflective',
  'neutral',
  'motivated',
]);
const ALLOWED_NARRATIVES = new Set(['past', 'present', 'future', 'mixed']);

function score(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(Math.min(100, Math.max(0, parsed))) : fallback;
}

function optionalText(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function stringList(value: unknown, limit = 3): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function pace(value: unknown): 'Slow' | 'Normal' | 'Fast' {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'slow') return 'Slow';
  if (normalized === 'fast') return 'Fast';
  return 'Normal';
}

export async function POST(req: NextRequest) {
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

  const body = (await req.json().catch(() => null)) as { result?: Record<string, unknown> } | null;
  const result = body?.result;
  if (!result) {
    return NextResponse.json({ error: 'Missing analysis result' }, { status: 400 });
  }

  const modeValue = String(result.detected_mode ?? '').trim().toLowerCase();
  const narrativeValue = String(result.narrative_type ?? '').trim().toLowerCase();
  const recommendations = stringList(result.recommendations ?? result.tips);
  const insight = optionalText(result.ai_insight ?? result.insight) ?? '';
  const todaysAction = optionalText(result.todays_action ?? result.daily_prompt);
  const readiness = result.readiness_score == null ? null : score(result.readiness_score);

  const sessionData = {
    user_id: user.id,
    mood_score: score(result.mood_score),
    energy: score(result.energy),
    stress: score(result.stress),
    positivity: score(result.positivity),
    confidence: score(result.confidence),
    pace: pace(result.pace),
    ai_provider: 'gemini',
    ai_model: REFLECT_GEMINI_MODEL,
    detected_mode: ALLOWED_MODES.has(modeValue) ? modeValue : 'neutral',
    insight,
    tips: recommendations,
    daily_prompt: todaysAction,
    transcript: optionalText(result.transcript),
    emotional_mirror: optionalText(result.vocal_summary ?? result.emotional_mirror),
    duration_seconds: Math.max(0, Math.round(Number(result.duration_seconds) || 0)),
    vocal_metrics:
      result.vocal_metrics && typeof result.vocal_metrics === 'object'
        ? result.vocal_metrics
        : null,
    vocal_summary: optionalText(result.vocal_summary ?? result.emotional_mirror),
    transcript_summary: optionalText(result.transcript_summary),
    ai_insight: insight,
    recommendations,
    todays_action: todaysAction,
    narrative_type: ALLOWED_NARRATIVES.has(narrativeValue) ? narrativeValue : 'present',
    readiness_score: readiness,
    readiness_note: optionalText(result.readiness_note),
  };

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { error } = await db.from('therapy_sessions').insert(sessionData);
  if (error) {
    console.error(`[analyze-mood/save] retry failed for ${user.id}: ${error.code} ${error.message}`);
    return NextResponse.json({ error: error.message, saved: false }, { status: 500 });
  }

  return NextResponse.json({ saved: true });
}
