'use client';
import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import { MiniChart } from '@/components/MiniChart';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { EarlyWarnings } from '@/components/EarlyWarnings';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { ProfileStats, ProfileStatsExplainer } from '@/components/ProfileStats';
import {
  getRecentTherapySessions,
  type TherapySession,
} from '@/lib/ai';
import { computeStats, type Stats } from '@/lib/graphMetrics';
import { fmtChartLabels, fmtDate } from '@/lib/format';

function motivationalMessage(s: Stats) {
  if (s.totalSessions < 2)
    return {
      icon: 'sparkles',
      title: 'Your first point is recorded',
      body: 'Complete another Reflect when it feels useful, and your first trend will appear.',
      color: COLORS.blue,
    };
  if (s.streak >= 7)
    return {
      icon: 'sparkles',
      title: 'Amazing consistency!',
      body: `${s.streak} days straight. You're building a powerful self-awareness habit.`,
      color: COLORS.green,
    };
  if (s.streak >= 3)
    return {
      icon: 'flame',
      title: 'On a roll!',
      body: `${s.streak}-day streak. Keep showing up for yourself every day.`,
      color: COLORS.blue,
    };
  if (s.recentAvg >= 75)
    return {
      icon: 'sparkles',
      title: "You're thriving",
      body: "Your mood has been consistently high. Whatever you're doing — keep it up.",
      color: COLORS.green,
    };
  if (s.energyDeclining)
    return {
      icon: 'time',
      title: 'Your body needs rest',
      body: 'Energy has been low lately. Prioritise sleep and one restorative activity today.',
      color: COLORS.warning,
    };
  if (s.recentAvg < 45)
    return {
      icon: 'pulse',
      title: "Tough stretch — you're not alone",
      body: "It's okay to struggle. You showed up today, and that matters more than the score.",
      color: COLORS.blue,
    };
  return {
    icon: 'trending-up',
    title: 'Keep the momentum',
    body: 'Your data shows genuine self-awareness. Every check-in makes the picture clearer.',
    color: COLORS.green,
  };
}

function TrendsInner() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    getRecentTherapySessions(60)
      .then((s) => {
        setSessions(s);
        setStats(computeStats(s));
      })
      .catch((error) => {
        setSessions([]);
        setStats(null);
        setLoadError((error as Error).message || 'Could not load saved check-ins.');
      })
      .finally(() => setLoading(false));
  }, []);

  const motiv = stats ? motivationalMessage(stats) : null;

  return (
    <AppShell title="My Trends" subtitle="Your emotional journey over time">
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${COLORS.cardBorder}`,
              borderTopColor: COLORS.blue,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      )}

      {!loading && !stats && !loadError && (
        <Card>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            No history yet. Complete a few daily check-ins to see your trends.
          </div>
        </Card>
      )}

      {!loading && loadError && (
        <Card>
          <div role="alert" style={{ fontSize: 13, color: COLORS.danger, lineHeight: 1.6 }}>
            Your saved trends could not be loaded. Refresh the page to try again.
          </div>
        </Card>
      )}

      {!loading && stats && (
        <>
          <MedicalDisclaimer variant="banner" />

          <EarlyWarnings sessions={sessions} />

          <ProfileStats sessions={sessions} />
          <ProfileStatsExplainer />
          <div style={{ height: 16 }} />

          <Grid cols={3} gap={14} style={{ marginBottom: 14 }}>
            <StatBox big={stats.recentAvg.toString()} sub="Recent 7 Avg" />
            <StatBox big={stats.streak.toString()} sub="Day Streak" icon="flame" />
            <StatBox big={stats.totalSessions.toString()} sub="Sessions" />
          </Grid>

          {motiv && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 14,
                background: COLORS.card,
                border: `1px solid ${motiv.color}40`,
                borderRadius: 18,
                padding: 20,
                marginBottom: 16,
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: 12, background: `${motiv.color}15`, border: `1px solid ${motiv.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={motiv.icon} size={20} color={motiv.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: motiv.color,
                    marginBottom: 4,
                    fontFamily: 'var(--font-syne)',
                    letterSpacing: '-0.3px',
                  }}
                >
                  {motiv.title}
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.55 }}>
                  {motiv.body}
                </div>
              </div>
            </div>
          )}

          <Grid cols={2} gap={14} style={{ marginBottom: 14 }}>
            {stats.totalSessions >= 2 ? (
              <Card style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16, fontFamily: 'var(--font-syne)' }}>
                <Icon name="trending-up" size={15} color={COLORS.blue} />
                Highlights
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                }}
              >
                <Highlight
                  label="Best Day"
                  score={stats.best.score}
                  date={stats.best.date}
                  color={COLORS.green}
                />
                <div style={{ width: 1, height: 50, background: COLORS.cardBorder }} />
                <Highlight
                  label="Tough Day"
                  score={stats.worst.score}
                  date={stats.worst.date}
                  color={COLORS.warning}
                />
              </div>
              </Card>
            ) : (
              <Card style={{ marginBottom: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
                  Highlights
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  Best and tough-day comparisons appear after your second saved Reflect.
                </div>
              </Card>
            )}

            {stats.energyDeclining ? (
              <div
                style={{
                  background: 'rgba(255,184,77,0.08)',
                  border: '1px solid rgba(255,184,77,0.2)',
                  borderRadius: 18,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    fontSize: 14,
                    fontWeight: 700,
                    color: COLORS.warning,
                    marginBottom: 6,
                    fontFamily: 'var(--font-syne)',
                  }}
                >
                  <Icon name="warning" size={15} color={COLORS.warning} />
                  Burnout Risk Detected
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  Your energy has been declining over recent sessions. Consider lightening your
                  schedule, getting more sleep, and doing something you enjoy today.
                </div>
              </div>
            ) : (
              <Card style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8, fontFamily: 'var(--font-syne)' }}>
                  <Icon name="trending-up" size={15} color={COLORS.blue} />
                  Overall Direction
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  {stats.trendDelta === null
                    ? 'Complete one more Reflect to establish a direction.'
                    : Math.abs(stats.trendDelta) <= 3
                      ? 'Your recent mood is broadly steady. Keep checking in to make the pattern clearer.'
                      : stats.trendDelta > 0
                        ? `Your recent mood average is up ${stats.trendDelta} points.`
                        : `Your recent mood average is down ${Math.abs(stats.trendDelta)} points. One change is not a diagnosis, but it may be worth reflecting on what shifted.`}
                </div>
              </Card>
            )}
          </Grid>

          <ChartCard
            title="Mood Score"
            data={stats.allMood}
            dates={stats.allDates}
            color={COLORS.blue}
          />
          <Grid cols={2} gap={14}>
            <ChartCard
              title="Energy Level"
              data={stats.allEnergy}
              dates={stats.allDates}
              color={COLORS.blue}
              noMargin
            />
            <ChartCard
              title="Stress Level"
              data={stats.allStress}
              dates={stats.allDates}
              color={COLORS.danger}
              noMargin
            />
          </Grid>
        </>
      )}
    </AppShell>
  );
}

function StatBox({ big, sub, icon }: { big: string; sub: string; icon?: string }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 16,
        padding: '20px 16px',
        textAlign: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 28, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.8px' }}>
        {big}
        {icon && <Icon name={icon} size={18} color={COLORS.blue} />}
      </div>
      <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function Highlight({
  label,
  score,
  date,
  color,
}: {
  label: string;
  score: number;
  date: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: 'center', flex: 1 }}>
      <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{score}</div>
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{fmtDate(date)}</div>
    </div>
  );
}

function ChartCard({
  title,
  data,
  dates,
  color,
  noMargin,
}: {
  title: string;
  data: number[];
  dates: string[];
  color: string;
  noMargin?: boolean;
}) {
  const pointLabels = fmtChartLabels(dates);
  const rangeLabel = dates.length
    ? dates.length === 1
      ? fmtDate(dates[0])
      : `${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}`
    : '';
  return (
    <Card style={noMargin ? { marginBottom: 0 } : { marginBottom: 14 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
          {data.length} saved check-in{data.length === 1 ? '' : 's'}{rangeLabel ? ` · ${rangeLabel}` : ''}
        </div>
      </div>
      {data.length >= 2 ? (
        <MiniChart
          data={data}
          color={color}
          height={120}
          labels={pointLabels}
          ariaLabel={`${title} over saved check-ins`}
        />
      ) : (
        <div
          role="status"
          style={{ minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textSecondary, fontSize: 12, textAlign: 'center' }}
        >
          One score: {data[0]} / 100. Complete another Reflect to reveal a trend.
        </div>
      )}
    </Card>
  );
}

export default function TrendsPage() {
  return (
    <>
      <TrendsInner />
    </>
  );
}
