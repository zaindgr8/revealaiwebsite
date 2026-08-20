export type GraphSession = {
  created_at: string;
  mood_score: number;
  energy: number;
  stress: number;
  positivity: number;
  confidence: number;
  detected_mode: string;
};

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
  trendDelta: number | null;
  energyDeclining: boolean;
  latestMood: number;
  latestMode: string;
  streak: number;
  recentAvg: number;
  totalSessions: number;
  best: { score: number; date: string };
  worst: { score: number; date: string };
};

export function computeStats<T extends GraphSession>(sessions: T[] | null | undefined): Stats | null {
  if (!sessions || sessions.length === 0) return null;

  const sorted = [...sessions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const doneToday = new Date(latest.created_at).toDateString() === new Date().toDateString();
  const last7 = sorted.slice(-7);

  let trendDelta: number | null = null;
  if (last7.length >= 2) {
    const half = Math.max(1, Math.floor(last7.length / 2));
    const older = last7.slice(0, half);
    const newer = last7.slice(half);
    const oldAvg = older.reduce((sum, item) => sum + item.mood_score, 0) / older.length;
    const newAvg = newer.reduce((sum, item) => sum + item.mood_score, 0) / newer.length;
    trendDelta = Math.round(newAvg - oldAvg);
  }

  const forBurnout = sorted.slice(-5);
  let energyDeclining = false;
  if (forBurnout.length >= 4) {
    const older = forBurnout.slice(0, 2).reduce((sum, item) => sum + item.energy, 0) / 2;
    const newer = forBurnout.slice(-2).reduce((sum, item) => sum + item.energy, 0) / 2;
    energyDeclining = newer < older - 8;
  }

  const recentAvg = Math.round(
    last7.reduce((sum, item) => sum + item.mood_score, 0) / last7.length
  );
  const best = sorted.reduce((a, b) => (b.mood_score > a.mood_score ? b : a));
  const worst = sorted.reduce((a, b) => (b.mood_score < a.mood_score ? b : a));

  return {
    doneToday,
    last7MoodScores: last7.map((item) => item.mood_score),
    last7EnergyScores: last7.map((item) => item.energy),
    last7StressScores: last7.map((item) => item.stress),
    last7Dates: last7.map((item) => item.created_at),
    allMood: sorted.map((item) => item.mood_score),
    allEnergy: sorted.map((item) => item.energy),
    allStress: sorted.map((item) => item.stress),
    allDates: sorted.map((item) => item.created_at),
    trendDelta,
    energyDeclining,
    latestMood: latest.mood_score,
    latestMode: latest.detected_mode,
    streak: computeStreak(sorted),
    recentAvg,
    totalSessions: sessions.length,
    best: { score: best.mood_score, date: best.created_at },
    worst: { score: worst.mood_score, date: worst.created_at },
  };
}

export function computeStreak<T extends Pick<GraphSession, 'created_at'>>(
  sortedSessions: T[],
  now = new Date()
): number {
  if (!sortedSessions.length) return 0;
  const days = new Set(sortedSessions.map((item) => new Date(item.created_at).toDateString()));
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const startsToday = days.has(today.toDateString());
  const startsYesterday = days.has(yesterday.toDateString());
  if (!startsToday && !startsYesterday) return 0;

  let streak = 0;
  const startOffset = startsToday ? 0 : 1;
  for (let i = startOffset; i < 90; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    if (days.has(day.toDateString())) streak++;
    else break;
  }
  return streak;
}

export type AggregatePeriod = 'daily' | 'weekly' | 'monthly';
export type MetricKey = 'mood_score' | 'energy' | 'stress' | 'positivity' | 'confidence';
export type MetricSummary = {
  key: MetricKey;
  label: string;
  current: number;
  periodAvg: number;
  baseline: number | null;
  diff: number | null;
  goodWhen: 'up' | 'down';
  spark: number[];
};
export type ProfileAggregates = {
  period: AggregatePeriod;
  totalSessionsInPeriod: number;
  metrics: MetricSummary[];
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

function periodCutoff(period: AggregatePeriod, now: Date): number {
  if (period === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  const days = period === 'weekly' ? 7 : 30;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

function avg(values: number[]): number {
  return values.length
    ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;
}

export function computeProfileAggregates<T extends GraphSession>(
  sessions: T[] | null | undefined,
  period: AggregatePeriod,
  now = new Date()
): ProfileAggregates | null {
  if (!sessions || sessions.length === 0) return null;
  const cutoff = periodCutoff(period, now);
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const latest = sorted[sorted.length - 1];
  const inPeriod = sorted.filter((item) => new Date(item.created_at).getTime() >= cutoff);
  const baselinePool = sorted.filter((item) => new Date(item.created_at).getTime() < cutoff);
  const baselineSet = baselinePool.length >= 3 ? baselinePool : null;
  const keys: MetricKey[] = ['mood_score', 'energy', 'stress', 'positivity', 'confidence'];

  const metrics = keys.map((key): MetricSummary => {
    const periodAvg = inPeriod.length ? avg(inPeriod.map((item) => item[key])) : latest[key];
    const baseline = baselineSet ? avg(baselineSet.map((item) => item[key])) : null;
    return {
      key,
      label: METRIC_LABEL[key],
      current: latest[key],
      periodAvg,
      baseline,
      diff: baseline === null ? null : periodAvg - baseline,
      goodWhen: GOOD_WHEN[key],
      spark: inPeriod.slice(-14).map((item) => item[key]),
    };
  });

  return { period, totalSessionsInPeriod: inPeriod.length, metrics };
}
