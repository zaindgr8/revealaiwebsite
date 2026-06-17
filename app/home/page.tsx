'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { Card } from '@/components/Card';
import { MiniChart } from '@/components/MiniChart';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { EarlyWarnings } from '@/components/EarlyWarnings';
import { useAuth } from '@/lib/auth-context';
import {
  computeStats,
  getRecentTherapySessions,
  type Stats,
  type TherapySession,
} from '@/lib/ai';
import { DAY_ABBR, fmtDate, todayPretty } from '@/lib/format';

function modeColor(mode: string) {
  return MODE_COLOR[mode] ?? COLORS.blue;
}

function HomeInner() {
  const router = useRouter();
  const { user } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [lastSession, setLastSession] = useState<TherapySession | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    user?.email?.split('@')[0] ??
    'there';

  const dateString = todayPretty();

  const loadStats = useCallback(async () => {
    try {
      const recent = await getRecentTherapySessions(30);
      setSessions(recent);
      setStats(computeStats(recent));
      if (recent.length) setLastSession(recent[0]);
    } catch {
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const dayLabels = stats?.last7Dates
    ? stats.last7Dates.map((d) => DAY_ABBR[new Date(d).getDay()])
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const tooltipLabels = stats?.last7Dates ? stats.last7Dates.map(fmtDate) : undefined;
  const chartData = stats?.last7MoodScores?.length
    ? stats.last7MoodScores
    : [50, 50, 50, 50, 50, 50, 50];

  const trendPct = stats?.trendPct ?? 0;
  const trendUp = trendPct >= 0;

  return (
    <AppShell title="Dashboard" subtitle={dateString}>
      {/* Welcome hero */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: 20,
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: COLORS.white,
              lineHeight: 1.2,
            }}
          >
            Welcome <span style={{ color: COLORS.green }}>{firstName}</span>
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 6 }}>
            Here&apos;s how you&apos;ve been feeling lately.
          </div>
        </div>
      </div>

      {/* Burnout Alert */}
      {sessions.length >= 3 && <EarlyWarnings sessions={sessions} />}

      {/* Streak Banner */}
      {stats && stats.streak > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(2,218,139,0.08)',
            border: '1px solid rgba(2,218,139,0.2)',
            borderRadius: 18,
            padding: '12px 16px',
            marginBottom: 16,
          }}
        >
          <span style={{ fontSize: 20 }}>🔥</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.green }}>
            {stats.streak}-day streak! Keep going.
          </span>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={() => router.push('/therapy')}
        style={{
          width: '100%',
          textAlign: 'left',
          borderRadius: 22,
          padding: 28,
          marginBottom: 20,
          background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <Icon name="mic" size={28} color={COLORS.white} />
              <div
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  padding: '4px 10px',
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  color: COLORS.white,
                }}
              >
                {stats?.doneToday ? '✓ DONE TODAY' : 'DAILY'}
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.white, marginBottom: 6 }}>
              {stats?.doneToday ? 'Check-In Complete' : 'Morning Check-In'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
              {stats?.doneToday
                ? `Mood score: ${stats.latestMood} · Feeling ${stats.latestMode}`
                : 'Record 60 seconds to analyze your mood & energy'}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.18)',
              color: COLORS.white,
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            Start
            <Icon name="arrow-forward" size={16} color={COLORS.white} />
          </div>
        </div>
      </button>

      {/* Charts grid */}
      <Grid cols={2} style={{ marginBottom: 16 }}>
        <Card>
          <ChartHeader
            title="Mood Trend"
            subtitle={stats ? `Last ${stats.last7MoodScores.length} check-ins` : 'Last 7 days'}
            badge={
              loadingStats ? null : stats ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon
                    name={trendUp ? 'trending-up' : 'trending-down'}
                    size={16}
                    color={trendUp ? COLORS.green : COLORS.danger}
                  />
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: trendUp ? COLORS.green : COLORS.danger,
                    }}
                  >
                    {trendUp ? '+' : ''}
                    {trendPct}%
                  </span>
                </div>
              ) : null
            }
          />

          <MiniChart data={chartData} color={COLORS.green} height={90} labels={tooltipLabels} />
          <DayLabels labels={dayLabels} />

          {stats && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px solid ${COLORS.cardBorder}`,
              }}
            >
              <StatItem value={stats.weeklyAvg} label="Avg Mood" />
              <div style={{ width: 1, background: COLORS.cardBorder }} />
              <StatItem value={stats.streak} label="Day Streak" />
              <div style={{ width: 1, background: COLORS.cardBorder }} />
              <StatItem value={stats.totalSessions} label="Sessions" />
            </div>
          )}

          {!stats && !loadingStats && (
            <div
              style={{
                fontSize: 12,
                color: COLORS.textMuted,
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Complete your first check-in to see trends.
            </div>
          )}

          {stats && (
            <button
              onClick={() => router.push('/trends')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                marginTop: 14,
                paddingTop: 12,
                borderTop: `1px solid ${COLORS.cardBorder}`,
                color: COLORS.blue,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <Icon name="trending-up" size={14} color={COLORS.blue} />
              View My Trends
              <Icon name="chevron-forward" size={14} color={COLORS.blue} />
            </button>
          )}
        </Card>

        {stats && (
          <Card>
            <ChartHeader
              title="⚡ Energy Level"
              subtitle={`Last ${stats.last7EnergyScores.length} check-ins`}
              badge={
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.blue }}>
                  {stats.last7EnergyScores[stats.last7EnergyScores.length - 1]}
                </span>
              }
            />
            <MiniChart
              data={stats.last7EnergyScores}
              color={COLORS.blue}
              height={90}
              labels={tooltipLabels}
            />
            <DayLabels labels={dayLabels} />
          </Card>
        )}

        {stats && (
          <Card>
            <ChartHeader
              title="🌀 Stress Level"
              subtitle={`Last ${stats.last7StressScores.length} check-ins`}
              badge={
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.danger }}>
                  {stats.last7StressScores[stats.last7StressScores.length - 1]}
                </span>
              }
            />
            <MiniChart
              data={stats.last7StressScores}
              color={COLORS.danger}
              height={90}
              labels={tooltipLabels}
            />
            <DayLabels labels={dayLabels} />
          </Card>
        )}

        {lastSession?.insight && (
          <Card>
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.white }}>
                  🧠 Last Session Insight
                </div>
                <div
                  style={{
                    background: modeColor(lastSession.detected_mode) + '22',
                    padding: '3px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    color: modeColor(lastSession.detected_mode),
                    textTransform: 'capitalize',
                  }}
                >
                  {lastSession.detected_mode}
                </div>
              </div>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
                {fmtDate(lastSession.created_at)}
              </div>
            </div>
            <div
              style={{
                fontSize: 13,
                color: COLORS.textSecondary,
                lineHeight: 1.6,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {lastSession.insight}
            </div>
            {lastSession.tips?.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <Icon name="bulb" size={13} color={COLORS.green} />
                <span
                  style={{
                    fontSize: 12,
                    color: COLORS.green,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {lastSession.tips[0]}
                </span>
              </div>
            )}
          </Card>
        )}
      </Grid>

      {/* Module */}
      <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white, marginBottom: 14 }}>
        Start Your Session
      </div>
      <button
        onClick={() => router.push('/therapy')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          textAlign: 'left',
          background: COLORS.card,
          borderRadius: 18,
          padding: 18,
          border: `1px solid ${COLORS.cardBorder}`,
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: COLORS.blue + '18',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon name="pulse" size={24} color={COLORS.blue} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>
              Reflect
            </span>
            <span
              style={{
                background: COLORS.blue + '20',
                color: COLORS.blue,
                padding: '2px 7px',
                borderRadius: 6,
                fontSize: 9,
                fontWeight: 700,
              }}
            >
              SELF
            </span>
          </div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
            Daily emotional check-in & burnout detection
          </div>
        </div>
        <Icon name="chevron-forward" size={18} color={COLORS.textMuted} />
      </button>
    </AppShell>
  );
}

function ChartHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.white }}>{title}</div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{subtitle}</div>
      </div>
      {badge}
    </div>
  );
}

function DayLabels({ labels }: { labels: string[] }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 8,
        paddingLeft: 4,
        paddingRight: 4,
      }}
    >
      {labels.map((d, i) => (
        <span key={i} style={{ fontSize: 10, color: COLORS.textMuted }}>
          {d}
        </span>
      ))}
    </div>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.white }}>{value}</span>
      <span style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>{label}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <AuthGuard>
      <HomeInner />
    </AuthGuard>
  );
}
