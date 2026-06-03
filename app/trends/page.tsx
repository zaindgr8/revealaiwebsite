'use client';
import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Card } from '@/components/Card';
import { MiniChart } from '@/components/MiniChart';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { computeStats, getRecentTherapySessions, type Stats } from '@/lib/ai';
import { fmtDate } from '@/lib/format';

function motivationalMessage(s: Stats) {
  if (s.streak >= 7)
    return {
      emoji: '🏆',
      title: 'Amazing consistency!',
      body: `${s.streak} days straight. You're building a powerful self-awareness habit.`,
      color: COLORS.green,
    };
  if (s.streak >= 3)
    return {
      emoji: '🔥',
      title: 'On a roll!',
      body: `${s.streak}-day streak. Keep showing up for yourself every day.`,
      color: COLORS.blue,
    };
  if (s.weeklyAvg >= 75)
    return {
      emoji: '✨',
      title: "You're thriving",
      body: "Your mood has been consistently high. Whatever you're doing — keep it up.",
      color: COLORS.green,
    };
  if (s.energyDeclining)
    return {
      emoji: '💤',
      title: 'Your body needs rest',
      body: 'Energy has been low lately. Prioritise sleep and one restorative activity today.',
      color: COLORS.warning,
    };
  if (s.weeklyAvg < 45)
    return {
      emoji: '💙',
      title: "Tough stretch — you're not alone",
      body: "It's okay to struggle. You showed up today, and that matters more than the score.",
      color: COLORS.blue,
    };
  return {
    emoji: '📈',
    title: 'Keep the momentum',
    body: 'Your data shows genuine self-awareness. Every check-in makes the picture clearer.',
    color: COLORS.green,
  };
}

function TrendsInner() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRecentTherapySessions(30)
      .then((sessions) => setStats(computeStats(sessions)))
      .catch(() => setStats(null))
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

      {!loading && !stats && (
        <Card>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            No history yet. Complete a few daily check-ins to see your trends.
          </div>
        </Card>
      )}

      {!loading && stats && (
        <>
          <Grid cols={3} style={{ marginBottom: 16 }}>
            <StatBox big={stats.weeklyAvg.toString()} sub="Avg Mood" />
            <StatBox big={`${stats.streak}🔥`} sub="Day Streak" />
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
              <span style={{ fontSize: 32, marginTop: 2 }}>{motiv.emoji}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: motiv.color,
                    marginBottom: 4,
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

          <Grid cols={2} style={{ marginBottom: 16 }}>
            <Card>
              <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white, marginBottom: 16 }}>
                📊 Highlights
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
                    fontSize: 14,
                    fontWeight: 700,
                    color: COLORS.warning,
                    marginBottom: 6,
                  }}
                >
                  ⚠️ Burnout Risk Detected
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  Your energy has been declining over recent sessions. Consider lightening your
                  schedule, getting more sleep, and doing something you enjoy today.
                </div>
              </div>
            ) : (
              <Card>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white, marginBottom: 8 }}>
                  📈 Overall Direction
                </div>
                <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  Your scores are stable. Keep your daily check-ins to build a clearer picture of
                  how your week shapes your mood and energy.
                </div>
              </Card>
            )}
          </Grid>

          <ChartCard
            title="😊 Mood Score"
            data={stats.allMood}
            dates={stats.allDates}
            color={COLORS.green}
          />
          <Grid cols={2}>
            <ChartCard
              title="⚡ Energy Level"
              data={stats.allEnergy}
              dates={stats.allDates}
              color={COLORS.blue}
            />
            <ChartCard
              title="🌀 Stress Level"
              data={stats.allStress}
              dates={stats.allDates}
              color={COLORS.danger}
            />
          </Grid>
        </>
      )}
    </AppShell>
  );
}

function StatBox({ big, sub }: { big: string; sub: string }) {
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
      <div style={{ fontSize: 28, fontWeight: 800, color: COLORS.white }}>{big}</div>
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
}: {
  title: string;
  data: number[];
  dates: string[];
  color: string;
}) {
  return (
    <Card>
      <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white, marginBottom: 16 }}>
        {title}
      </div>
      <MiniChart data={data} color={color} height={110} labels={dates.map(fmtDate)} />
    </Card>
  );
}

export default function TrendsPage() {
  return (
    <AuthGuard>
      <TrendsInner />
    </AuthGuard>
  );
}
