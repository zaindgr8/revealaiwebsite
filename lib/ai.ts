'use client';
import { supabase } from './supabase';

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
  insight: string;
  tips: string[];
  daily_prompt?: string;
  transcript?: string;
  emotional_mirror?: string;
  duration_seconds?: number;
};

export type AnalysisResult = Omit<TherapySession, 'id' | 'created_at'>;

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export async function chatTherapy({
  messages,
  context,
}: {
  messages: ChatMessage[];
  context: Partial<AnalysisResult>;
}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('chat-therapy', {
    body: { messages, context },
  });
  if (error) throw new Error(error.message || 'Chat failed');
  if (data?.error) throw new Error(data.error);
  return data.reply;
}

export async function analyzeMood({
  audioBase64,
  mimeType,
  durationSeconds,
}: {
  audioBase64: string;
  mimeType: string;
  durationSeconds: number;
}): Promise<AnalysisResult> {
  const { data, error } = await supabase.functions.invoke('analyze-mood', {
    body: {
      audio_base64: audioBase64,
      mime_type: mimeType,
      duration_seconds: durationSeconds,
    },
  });
  if (error) throw new Error(error.message || 'Analysis failed');
  if (data?.error) throw new Error(data.error);
  return data;
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
