'use client';
import { supabase } from './supabase';
import type { AcousticFeatures } from './audioFeatures';

export type VocalMetrics = {
  pitch_variability: number;
  avg_pitch_hz: number;
  pause_frequency: 'low' | 'medium' | 'high';
  pause_count: number;
  speech_rate_wpm: number;
  jitter_shimmer_index: number;
  volume_consistency: number;
};

export type TherapySession = {
  id: string;
  created_at: string;
  mood_score: number;
  energy: number;
  stress: number;
  positivity: number;
  confidence: number;
  pace: string;
  detected_mode: string;
  // Legacy field — kept for backward compat (mapped from ai_insight)
  insight: string;
  // Legacy field — kept for backward compat (mapped from recommendations)
  tips: string[];
  // Legacy field — kept for backward compat (mapped from todays_action)
  daily_prompt?: string;
  transcript?: string;
  /** @deprecated use vocal_summary */
  emotional_mirror?: string;
  duration_seconds?: number;
  // New Phase-1 fields
  vocal_metrics?: VocalMetrics;
  vocal_summary?: string;
  transcript_summary?: string;
  ai_insight?: string;
  recommendations?: string[];
  todays_action?: string;
  // Deep analysis fields
  narrative_type?: 'past' | 'present' | 'future' | 'mixed';
  readiness_score?: number | null;
  readiness_note?: string | null;
};

export type AnalysisResult = Omit<TherapySession, 'id' | 'created_at'>;

export type UserContext = {
  time_of_day: 'morning' | 'afternoon' | 'evening' | 'night';
  day_of_week: string;
  hour: number;
  total_sessions: number;
  streak_days: number;
  avg_mood_7d?: number;
  avg_energy_7d?: number;
  avg_stress_7d?: number;
  energy_trend?: 'declining' | 'stable' | 'improving';
  last_mode?: string;
  last_mood?: number;
  recent_modes?: string[];
};

export type StreakData = {
  current_streak: number;
  longest_streak: number;
  last_checkin_date: string | null;
};

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

async function getAuthToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? '';
}

/**
 * Call after a successful analysis to update the streak.
 * Non-fatal — caller should catch and ignore errors.
 */
export async function updateStreak(): Promise<StreakData> {
  const token = await getAuthToken();
  const res = await fetch('/api/update-streak', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Streak update failed');
  return data as StreakData;
}

/**
 * Fetch the current streak without updating it.
 * Returns null if the user has no streak row yet.
 */
export async function getStreak(): Promise<StreakData | null> {
  try {
    const token = await getAuthToken();
    const res = await fetch('/api/update-streak', {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as StreakData;
  } catch {
    return null;
  }
}

export async function chatTherapy({
  messages,
  context,
  isFinalTurn,
}: {
  messages: ChatMessage[];
  context: Partial<AnalysisResult>;
  isFinalTurn?: boolean;
}): Promise<string> {
  const token = await getAuthToken();
  const res = await fetch('/api/chat-therapy', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, context, is_final_turn: isFinalTurn }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Chat failed');
  if (data?.error) throw new Error(data.error);
  return data.reply;
}

export async function askDeepQuestion({
  audioBase64,
  mimeType,
  userContext,
}: {
  audioBase64: string;
  mimeType: string;
  userContext?: UserContext;
}): Promise<string> {
  const token = await getAuthToken();
  const res = await fetch('/api/deep-question', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      audio_base64: audioBase64,
      mime_type: mimeType,
      user_context: userContext,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Failed to get deep question');
  if (data?.error) throw new Error(data.error);
  return data.question;
}

export async function analyzeMood({
  audioBase64,
  mimeType,
  durationSeconds,
  userContext,
  acousticFeatures,
  deepQuestion,
  deepAnswer,
}: {
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
  userContext?: UserContext;
  acousticFeatures?: AcousticFeatures;
  deepQuestion?: string;
  deepAnswer?: string;
}): Promise<AnalysisResult> {
  const token = await getAuthToken();
  const res = await fetch('/api/analyze-mood', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      audio_base64: audioBase64,
      mime_type: mimeType,
      duration_seconds: durationSeconds,
      user_context: userContext,
      acoustic_features: acousticFeatures ?? null,
      deep_question: deepQuestion,
      deep_answer: deepAnswer,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Analysis failed');
  if (data?.error) throw new Error(data.error);
  return data as AnalysisResult;
}

export function buildUserContext(sessions: TherapySession[]): UserContext {
  const now = new Date();
  const hour = now.getHours();
  const timeOfDay: UserContext['time_of_day'] =
    hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';
  const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });

  const stats = computeStats(sessions);
  const last7 = (sessions ?? []).slice(0, 7);

  const last = sessions?.[0];

  let energyTrend: UserContext['energy_trend'] = 'stable';
  if (stats?.energyDeclining) energyTrend = 'declining';
  else if (last7.length >= 4) {
    const older = last7.slice(-2).reduce((s, x) => s + x.energy, 0) / 2;
    const newer = last7.slice(0, 2).reduce((s, x) => s + x.energy, 0) / 2;
    if (newer > older + 8) energyTrend = 'improving';
  }

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : undefined;

  return {
    time_of_day: timeOfDay,
    day_of_week: dayOfWeek,
    hour,
    total_sessions: sessions?.length ?? 0,
    streak_days: stats?.streak ?? 0,
    avg_mood_7d: avg(last7.map((s) => s.mood_score)),
    avg_energy_7d: avg(last7.map((s) => s.energy)),
    avg_stress_7d: avg(last7.map((s) => s.stress)),
    energy_trend: energyTrend,
    last_mode: last?.detected_mode,
    last_mood: last?.mood_score,
    recent_modes: last7.map((s) => s.detected_mode),
  };
}

export async function getRecentTherapySessions(limit = 30): Promise<TherapySession[]> {
  const { data, error } = await supabase
    .from('therapy_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as TherapySession[];
}

export async function deleteTherapySession(id: string) {
  const { error } = await supabase.from('therapy_sessions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAllTherapySessions() {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Not authenticated');
  const { error } = await supabase.from('therapy_sessions').delete().eq('user_id', data.user.id);
  if (error) throw new Error(error.message);
}

export async function getAllSessionsForExport() {
  const { data, error } = await supabase
    .from('therapy_sessions')
    .select(
      'created_at, mood_score, energy, stress, positivity, confidence, pace, detected_mode, insight, tips, transcript, emotional_mirror, duration_seconds'
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type Stats = {
  doneToday: boolean;
  last7MoodScores: number[];
  last7EnergyScores: number[];
  last7StressScores: number[];
  last7Dates: string[];
  allMood: number[];
  allEnergy: number[];
  allStress: number[];
  allDates: string[];
  trendPct: number;
  energyDeclining: boolean;
  latestMood: number;
  latestMode: string;
  streak: number;
  weeklyAvg: number;
  totalSessions: number;
  best: { score: number; date: string };
  worst: { score: number; date: string };
};

export function computeStats(sessions: TherapySession[] | null | undefined): Stats | null {
  if (!sessions || sessions.length === 0) return null;

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latest = sorted[sorted.length - 1];

  const todayStr = new Date().toDateString();
  const doneToday = new Date(latest.created_at).toDateString() === todayStr;

  const last7 = sorted.slice(-7);

  const half = Math.max(1, Math.floor(last7.length / 2));
  const oldAvg = last7.slice(0, half).reduce((s, x) => s + x.mood_score, 0) / half;
  const newAvg =
    last7.slice(half).reduce((s, x) => s + x.mood_score, 0) / Math.max(1, last7.length - half);
  const trendPct = oldAvg > 0 ? Math.round(((newAvg - oldAvg) / oldAvg) * 100) : 0;

  const forBurnout = sorted.slice(-5);
  let energyDeclining = false;
  if (forBurnout.length >= 4) {
    const older = forBurnout.slice(0, 2).reduce((s, x) => s + x.energy, 0) / 2;
    const newer = forBurnout.slice(-2).reduce((s, x) => s + x.energy, 0) / 2;
    energyDeclining = newer < older - 8;
  }

  const streak = computeStreak(sorted);
  const weeklyAvg = Math.round(last7.reduce((s, x) => s + x.mood_score, 0) / last7.length);
  const best = sorted.reduce((a, b) => (b.mood_score > a.mood_score ? b : a));
  const worst = sorted.reduce((a, b) => (b.mood_score < a.mood_score ? b : a));

  return {
    doneToday,
    last7MoodScores: last7.map((s) => s.mood_score),
    last7EnergyScores: last7.map((s) => s.energy),
    last7StressScores: last7.map((s) => s.stress),
    last7Dates: last7.map((s) => s.created_at),
    allMood: sorted.map((s) => s.mood_score),
    allEnergy: sorted.map((s) => s.energy),
    allStress: sorted.map((s) => s.stress),
    allDates: sorted.map((s) => s.created_at),
    trendPct,
    energyDeclining,
    latestMood: latest.mood_score,
    latestMode: latest.detected_mode,
    streak,
    weeklyAvg,
    totalSessions: sessions.length,
    best: { score: best.mood_score, date: best.created_at },
    worst: { score: worst.mood_score, date: worst.created_at },
  };
}

function computeStreak(sortedSessions: TherapySession[]): number {
  if (!sortedSessions.length) return 0;
  const days = [...new Set(sortedSessions.map((s) => new Date(s.created_at).toDateString()))];
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 90; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (days.includes(d.toDateString())) streak++;
    else break;
  }
  return streak;
}

// ─────────────────────────────────────────────────────────────
// Profile aggregates — daily / weekly / monthly comparisons
// ─────────────────────────────────────────────────────────────

export type AggregatePeriod = 'daily' | 'weekly' | 'monthly';

export type MetricKey = 'mood_score' | 'energy' | 'stress' | 'positivity' | 'confidence';

export type MetricSummary = {
  key: MetricKey;
  label: string;
  current: number; // today's (or last) value
  periodAvg: number; // avg over the selected period
  baseline: number; // personal all-time baseline (avg of everything outside the period)
  diff: number; // current - baseline
  diffPct: number; // diff / baseline * 100, rounded
  goodWhen: 'up' | 'down';
  spark: number[];
};

const METRIC_LABEL: Record<MetricKey, string> = {
  mood_score: 'Mood',
  energy: 'Energy',
  stress: 'Stress',
  positivity: 'Positivity',
  confidence: 'Confidence',
};

const GOOD_WHEN: Record<MetricKey, 'up' | 'down'> = {
  mood_score: 'up',
  energy: 'up',
  stress: 'down',
  positivity: 'up',
  confidence: 'up',
};

function daysInPeriod(period: AggregatePeriod): number {
  if (period === 'daily') return 1;
  if (period === 'weekly') return 7;
  return 30;
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s, n) => s + n, 0) / arr.length);
}

export type ProfileAggregates = {
  period: AggregatePeriod;
  totalSessionsInPeriod: number;
  metrics: MetricSummary[];
};

export function computeProfileAggregates(
  sessions: TherapySession[] | null | undefined,
  period: AggregatePeriod
): ProfileAggregates | null {
  if (!sessions || sessions.length === 0) return null;

  const days = daysInPeriod(period);
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;

  const sortedAsc = [...sessions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latest = sortedAsc[sortedAsc.length - 1];

  const inPeriod = sortedAsc.filter((s) => new Date(s.created_at).getTime() >= cutoff);
  const baselinePool = sortedAsc.filter((s) => new Date(s.created_at).getTime() < cutoff);
  // If we have no history before the cutoff, fall back to using all sessions as baseline
  const baselineSet = baselinePool.length >= 3 ? baselinePool : sortedAsc;

  const keys: MetricKey[] = ['mood_score', 'energy', 'stress', 'positivity', 'confidence'];

  const metrics: MetricSummary[] = keys.map((key) => {
    const currentValue = latest[key];
    const periodValues = inPeriod.map((s) => s[key]);
    const baselineValues = baselineSet.map((s) => s[key]);
    const periodAvg = inPeriod.length ? avg(periodValues) : currentValue;
    const baseline = avg(baselineValues);
    const diff = currentValue - baseline;
    const diffPct = baseline > 0 ? Math.round((diff / baseline) * 100) : 0;
    const spark = inPeriod.slice(-14).map((s) => s[key]);

    return {
      key,
      label: METRIC_LABEL[key],
      current: currentValue,
      periodAvg,
      baseline,
      diff,
      diffPct,
      goodWhen: GOOD_WHEN[key],
      spark,
    };
  });

  return {
    period,
    totalSessionsInPeriod: inPeriod.length,
    metrics,
  };
}

// ─────────────────────────────────────────────────────────────
// Early Warning Alerts
//
// Pure pattern-detection over the user's recent sessions.
// Every rule documents (a) what it watches and (b) the threshold,
// so the UI can show the user EXACTLY why each alert fired.
// ─────────────────────────────────────────────────────────────

export type WarningSeverity = 'info' | 'caution' | 'high';

export type EarlyWarning = {
  id: string;
  severity: WarningSeverity;
  title: string;
  detail: string;
  rule: string; // human-readable explanation of what we looked at
  recommendation: string;
};

export function computeEarlyWarnings(
  sessions: TherapySession[] | null | undefined
): EarlyWarning[] {
  if (!sessions || sessions.length < 3) return [];

  // sessions come in newest-first from getRecentTherapySessions — re-sort to be safe
  const sortedDesc = [...sessions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const recent = sortedDesc.slice(0, 7); // window of last 7 sessions
  const last5 = sortedDesc.slice(0, 5);
  const last4 = sortedDesc.slice(0, 4);
  const last3 = sortedDesc.slice(0, 3);

  const warnings: EarlyWarning[] = [];

  // 1) Burnout window — energy on a clear downward slope
  if (last4.length === 4) {
    const energies = last4.map((s) => s.energy).reverse(); // oldest → newest
    let monotone = true;
    for (let i = 1; i < energies.length; i++) {
      if (energies[i] > energies[i - 1] + 3) {
        monotone = false;
        break;
      }
    }
    const totalDrop = energies[energies.length - 1] - energies[0];
    if (monotone && totalDrop <= -15) {
      warnings.push({
        id: 'burnout_slope',
        severity: 'high',
        title: 'Burnout signal',
        detail: `Energy has dropped ${Math.abs(totalDrop)} points across your last 4 sessions. This is the 7–14 day burnout window.`,
        rule: 'Triggers when 4 consecutive sessions show non-increasing energy AND total drop ≥15 points.',
        recommendation:
          'Protect sleep this week. Cut one non-essential commitment. Schedule one truly restorative activity.',
      });
    }
  }

  // 2) Stress spike sustained
  if (last3.length === 3 && last3.every((s) => s.stress > 70)) {
    const avgStress = Math.round(last3.reduce((s, x) => s + x.stress, 0) / 3);
    warnings.push({
      id: 'stress_spike',
      severity: 'high',
      title: 'High stress, sustained',
      detail: `Stress has been above 70 for your last 3 sessions (averaging ${avgStress}).`,
      rule: 'Triggers when stress > 70 for 3 consecutive sessions.',
      recommendation:
        'Identify the single biggest stressor and one concrete change you can make this week. Talk to your Coach.',
    });
  }

  // 3) Mood slump
  if (last3.length === 3 && last3.every((s) => s.mood_score < 40)) {
    warnings.push({
      id: 'mood_slump',
      severity: 'high',
      title: 'Mood is consistently low',
      detail: `Your last 3 mood scores are all below 40. This isn't one bad day.`,
      rule: 'Triggers when mood < 40 for 3 consecutive sessions.',
      recommendation:
        'Consider reaching out to a friend, your support network, or a qualified mental health professional.',
    });
  }

  // 4) Negative-mode loop (anxious/sad/angry/venting 3+ in a row)
  if (last3.length === 3) {
    const negatives = new Set(['anxious', 'sad', 'angry', 'venting']);
    const modes = last3.map((s) => s.detected_mode);
    const allNegative = modes.every((m) => negatives.has(m));
    const sameMode = modes[0] === modes[1] && modes[1] === modes[2];
    if (allNegative && sameMode) {
      warnings.push({
        id: 'mode_loop',
        severity: 'caution',
        title: `Repeated "${modes[0]}" pattern`,
        detail: `Your last 3 check-ins have all read as "${modes[0]}". There's a clear thread here worth understanding.`,
        rule: 'Triggers when the same negative mode (anxious/sad/angry/venting) is detected for 3 consecutive sessions.',
        recommendation: `Open AI Coach Chat and dig into what's driving the "${modes[0]}" pattern.`,
      });
    }
  }

  // 5) Hidden fatigue — mood looks fine but energy + positivity dropping
  if (last5.length === 5) {
    const moods = last5.map((s) => s.mood_score);
    const energies = last5.map((s) => s.energy);
    const positivities = last5.map((s) => s.positivity);
    const moodStable = Math.abs(avg(moods.slice(0, 2)) - avg(moods.slice(-2))) <= 8;
    const energyDrop = avg(energies.slice(-2)) - avg(energies.slice(0, 2));
    const positivityDrop = avg(positivities.slice(-2)) - avg(positivities.slice(0, 2));
    if (moodStable && energyDrop <= -12 && positivityDrop <= -10) {
      warnings.push({
        id: 'hidden_fatigue',
        severity: 'caution',
        title: 'Hidden fatigue',
        detail:
          'Your mood looks steady, but energy and positivity have been quietly dropping across the last 5 sessions.',
        rule: 'Triggers when mood is stable (±8) but energy drop ≥12 AND positivity drop ≥10 over last 5 sessions.',
        recommendation:
          'Smiling on the outside can mask building exhaustion. Check sleep, hydration, and time outdoors.',
      });
    }
  }

  // 6) Streak reset (encouragement, low severity)
  if (recent.length >= 3) {
    const todayDone = new Date(sortedDesc[0].created_at).toDateString() === new Date().toDateString();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDone = sortedDesc.some(
      (s) => new Date(s.created_at).toDateString() === yesterday.toDateString()
    );
    if (todayDone && !yesterdayDone) {
      warnings.push({
        id: 'returning',
        severity: 'info',
        title: 'Welcome back',
        detail: 'You skipped yesterday — no judgement. Showing up today is what matters.',
        rule: 'Triggers when today has a session but yesterday did not, and you have a history of regular check-ins.',
        recommendation: 'Aim for 3 sessions this week to keep your pattern signal sharp.',
      });
    }
  }

  return warnings;
}

export type WarningRuleDoc = {
  title: string;
  description: string;
  examples: string[];
};

// Plain-English description of every detection rule — surface this in the UI
// so the user always knows WHY they got an alert.
export const WARNING_RULES_DOC: WarningRuleDoc[] = [
  {
    title: 'Burnout signal',
    description:
      'Watches the last 4 sessions. Fires if energy is non-increasing AND has dropped 15+ points total. Designed to catch the 7–14 day burnout window before the user feels it.',
    examples: ['Energy: 72 → 65 → 58 → 53 → flags.'],
  },
  {
    title: 'High stress, sustained',
    description:
      'Fires when stress > 70 for the last 3 sessions in a row. Catches sustained-stress patterns, not one bad day.',
    examples: ['Stress: 76 → 74 → 81 → flags.'],
  },
  {
    title: 'Mood slump',
    description:
      'Fires when mood < 40 for 3 consecutive sessions. Considered a high-severity signal that warrants attention.',
    examples: ['Mood: 35 → 30 → 38 → flags. One bad day at 30 alone does NOT flag.'],
  },
  {
    title: 'Repeated negative mode',
    description:
      'Fires when the AI detects the same negative mode (anxious / sad / angry / venting) for 3 consecutive sessions. Tells the user there is a thread worth pulling on.',
    examples: ['Modes: anxious, anxious, anxious → flags. Modes: anxious, sad, anxious → does NOT flag.'],
  },
  {
    title: 'Hidden fatigue',
    description:
      'Subtle one. Fires when mood looks stable (±8 points across 5 sessions) BUT energy has dropped ≥12 and positivity ≥10. Catches the "fine on the outside" pattern.',
    examples: ['Mood: 65→64→66→63→65, energy 70→55, positivity 68→55 → flags.'],
  },
  {
    title: 'Welcome back',
    description:
      'Low-severity nudge. Fires when today has a session but yesterday did not — no shame, just encouragement to keep the rhythm.',
    examples: ['Sessions Mon, Tue, Wed, [skip Thu], Fri → Friday triggers a friendly nudge.'],
  },
];
