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
  const c = MODE_COLOR[mode] ?? COLORS.blue;
  return c === COLORS.green ? COLORS.blue : c;
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
      {/* ── Welcome row ── */}
      <div style={{ marginBottom: 20 }}>
        <div
          style={{
            fontSize: 26,
            fontWeight: 800,
            color: COLORS.textPrimary,
            lineHeight: 1.2,
            fontFamily: 'var(--font-syne)',
            letterSpacing: '-0.7px',
          }}
        >
          Welcome back, <span style={{ color: COLORS.blue }}>{firstName}</span>
        </div>
        <div style={{ fontSize: 13.5, color: COLORS.textSecondary, marginTop: 5 }}>
          Here&apos;s how you&apos;ve been feeling lately.
        </div>
      </div>

      {/* ── Burnout alerts ── */}
      {sessions.length >= 3 && (
        <div style={{ marginBottom: 16 }}>
          <EarlyWarnings sessions={sessions} />
        </div>
      )}

      {/* ── Streak banner ── */}
      {stats && stats.streak > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(37,99,235,0.05)',
            border: '1px solid rgba(37,99,235,0.15)',
            borderRadius: 14,
            padding: '11px 16px',
            marginBottom: 16,
          }}
        >
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="flame" size={15} color={COLORS.blue} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.blue }}>
            {stats.streak}-day streak — keep showing up.
          </span>
        </div>
      )}

      {/* ── Primary CTA ── */}
      <button
        onClick={() => router.push('/therapy')}
        style={{
          width: '100%',
          textAlign: 'left',
          borderRadius: 20,
          padding: '22px 24px',
          marginBottom: 20,
          background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* decorative blur orb */}
        <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            position: 'relative',
            zIndex: 1,
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="mic" size={20} color={COLORS.white} />
              </div>
              <div
                style={{
                  background: 'rgba(255,255,255,0.18)',
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: 10,
                  fontWeight: 700,
                  color: COLORS.white,
                  letterSpacing: '0.06em',
                }}
              >
                {stats?.doneToday ? '✓ DONE TODAY' : 'DAILY CHECK-IN'}
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: COLORS.white, marginBottom: 4, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
              {stats?.doneToday ? 'Check-In Complete' : 'Morning Check-In'}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.82)' }}>
              {stats?.doneToday
                ? `Mood ${stats.latestMood} · Feeling ${stats.latestMode}`
                : 'Record 60 seconds — we decode your mood & energy'}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.25)',
              color: COLORS.white,
              padding: '10px 18px',
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              flexShrink: 0,
            }}
          >
            {stats?.doneToday ? 'View Results' : 'Start'}
            <Icon name="arrow-forward" size={15} color={COLORS.white} />
          </div>
        </div>
      </button>

      {/* ── Charts grid ── */}
      <Grid cols={2} gap={14}>
        <Card style={{ marginBottom: 0 }}>
          <ChartHeader
            title="Mood Trend"
            subtitle={stats ? `Last ${stats.last7MoodScores.length} check-ins` : 'Last 7 days'}
            badge={
              loadingStats ? null : stats ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Icon
                    name={trendUp ? 'trending-up' : 'trending-down'}
                    size={15}
                    color={trendUp ? COLORS.blue : COLORS.danger}
                  />
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: trendUp ? COLORS.blue : COLORS.danger,
                    }}
                  >
                    {trendUp ? '+' : ''}
                    {trendPct}%
                  </span>
                </div>
              ) : null
            }
          />

          <MiniChart data={chartData} color={COLORS.blue} height={88} labels={tooltipLabels} />
          <DayLabels labels={dayLabels} />

          {stats && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                marginTop: 14,
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

        {stats ? (
          <Card style={{ marginBottom: 0 }}>
            <ChartHeader
              title="Energy Level"
              subtitle={`Last ${stats.last7EnergyScores.length} check-ins`}
              badge={
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.blue, fontFamily: 'var(--font-syne)' }}>
                  {stats.last7EnergyScores[stats.last7EnergyScores.length - 1]}
                </span>
              }
            />
            <MiniChart
              data={stats.last7EnergyScores}
              color={COLORS.blue}
              height={88}
              labels={tooltipLabels}
            />
            <DayLabels labels={dayLabels} />
          </Card>
        ) : <div />}

        {stats ? (
          <Card style={{ marginBottom: 0 }}>
            <ChartHeader
              title="Stress Level"
              subtitle={`Last ${stats.last7StressScores.length} check-ins`}
              badge={
                <span style={{ fontSize: 14, fontWeight: 700, color: COLORS.danger, fontFamily: 'var(--font-syne)' }}>
                  {stats.last7StressScores[stats.last7StressScores.length - 1]}
                </span>
              }
            />
            <MiniChart
              data={stats.last7StressScores}
              color={COLORS.danger}
              height={88}
              labels={tooltipLabels}
            />
            <DayLabels labels={dayLabels} />
          </Card>
        ) : <div />}

        {lastSession?.insight ? (
          <Card style={{ marginBottom: 0 }}>
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
                  <Icon name="bulb" size={15} color={COLORS.blue} />
                  Last Session Insight
                </div>
                <div
                  style={{
                    background: modeColor(lastSession.detected_mode) + '22',
                    padding: '3px 9px',
                    borderRadius: 7,
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
                lineHeight: 1.65,
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
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: `1px solid ${COLORS.cardBorder}`,
                }}
              >
                <Icon name="bulb" size={13} color={COLORS.blue} />
                <span
                  style={{
                    fontSize: 12,
                    color: COLORS.blue,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}
                >
                  {lastSession.tips[0]}
                </span>
              </div>
            )}
          </Card>
        ) : <div />}
      </Grid>
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
        alignItems: 'flex-start',
        marginBottom: 14,
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>{title}</div>
        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{subtitle}</div>
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
        marginTop: 6,
        paddingLeft: 2,
        paddingRight: 2,
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
      <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>{value}</span>
      <span style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
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
