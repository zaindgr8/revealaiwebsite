import { computeProfileAggregates, computeStats, computeStreak } from '../lib/graphMetrics';
import type { TherapySession } from '../lib/ai';
import { fmtChartLabels } from '../lib/format';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function session(createdAt: Date, mood: number, overrides: Partial<TherapySession> = {}): TherapySession {
  return {
    id: `${createdAt.getTime()}-${mood}`,
    created_at: createdAt.toISOString(),
    mood_score: mood,
    energy: mood,
    stress: 100 - mood,
    positivity: mood,
    confidence: mood,
    pace: 'Normal',
    detected_mode: 'neutral',
    insight: '',
    tips: [],
    ...overrides,
  };
}

function daysBefore(now: Date, days: number, hour = 12): Date {
  const value = new Date(now);
  value.setDate(value.getDate() - days);
  value.setHours(hour, 0, 0, 0);
  return value;
}

const now = new Date(2026, 7, 20, 18, 0, 0);

const single = computeStats([session(daysBefore(now, 0), 45)]);
assert(single?.trendDelta === null, 'One score must not produce a trend delta');
assert(single?.recentAvg === 45, 'One score should remain the recent average');

const two = computeStats([
  session(daysBefore(now, 1), 45),
  session(daysBefore(now, 0), 50),
]);
assert(two?.trendDelta === 5, '45 to 50 should be +5 points, not a percentage');

assert(
  computeStreak([session(daysBefore(now, 1), 50)], now) === 1,
  'A streak should remain active throughout the day after the last check-in'
);
assert(
  computeStreak([session(daysBefore(now, 2), 50)], now) === 0,
  'A streak should be zero after a full missed day'
);
assert(
  computeStreak(
    [session(daysBefore(now, 2), 50), session(daysBefore(now, 1), 55), session(daysBefore(now, 0), 60)],
    now
  ) === 3,
  'Consecutive calendar days should produce a matching streak'
);

const periodSessions = [
  session(daysBefore(now, 10), 40),
  session(daysBefore(now, 9), 50),
  session(daysBefore(now, 8), 60),
  session(daysBefore(now, 0, 9), 70),
  session(daysBefore(now, 0, 17), 90),
];
const today = computeProfileAggregates(periodSessions, 'daily', now);
const mood = today?.metrics.find((metric) => metric.key === 'mood_score');
assert(today?.totalSessionsInPeriod === 2, 'Today should use the local calendar day');
assert(mood?.periodAvg === 80, 'The selected-window value should be its actual average');
assert(mood?.baseline === 50, 'Baseline should use only earlier check-ins');
assert(mood?.diff === 30, 'Comparison should be expressed in score points');

const insufficientBaseline = computeProfileAggregates(periodSessions.slice(-3), 'daily', now);
assert(
  insufficientBaseline?.metrics[0].baseline === null,
  'A baseline should not be shown before three earlier check-ins exist'
);

const repeatedDayLabels = fmtChartLabels([
  daysBefore(now, 0, 9).toISOString(),
  daysBefore(now, 0, 17).toISOString(),
]);
assert(
  repeatedDayLabels.every((label) => /\d{2}:\d{2}$/.test(label)),
  'Repeated-day chart points should include their time'
);

console.log('Graph metric regression checks: PASS');
