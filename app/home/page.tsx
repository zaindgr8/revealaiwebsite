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
import { StreakBadge } from '@/components/StreakBadge';
import { useAuth } from '@/lib/auth-context';
import {
  computeStats,
  getRecentTherapySessions,
  getStreak,
  type Stats,
  type TherapySession,
  type StreakData,
} from '@/lib/ai';
import { DAY_ABBR, fmtDate, todayPretty } from '@/lib/format';

function modeColor(mode: string) {
  const c = MODE_COLOR[mode] ?? COLORS.blue;
  return c === COLORS.green ? COLORS.blue : c;
}

function HomeInner() {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<TherapySession[]>([]);
  const [lastSession, setLastSession] = useState<TherapySession | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  // Phase 3 states
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [recapDismissed, setRecapDismissed] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const todayStr = new Date().toISOString().slice(0, 10);
      const dismissed = localStorage.getItem(`recap_dismissed_${todayStr}`);
      setRecapDismissed(!!dismissed);
    }
  }, []);

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

      // Fetch persistent database streak
      const s = await getStreak();
      setStreak(s);
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

      {/* ── Warm Re-engagement Nudge ── */}
      {!nudgeDismissed && lastSession && (() => {
        const diffMs = Date.now() - new Date(lastSession.created_at).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        return diffHours >= 24;
      })() && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.04) 0%, rgba(99,102,241,0.04) 100%)',
            border: `1.5px dashed ${COLORS.cardBorder}`,
            borderRadius: 18,
            padding: 16,
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🌸</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                Haven&apos;t heard from you today
              </div>
              <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 1 }}>
                Want to check in and see how your voice is sounding?
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => router.push('/therapy')}
              style={{
                background: COLORS.blue,
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Check in
            </button>
            <button
              onClick={() => setNudgeDismissed(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: COLORS.textMuted,
                fontSize: 13,
                cursor: 'pointer',
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Weekly Recap Card (Mondays) ── */}
      {(() => {
        const isMonday = new Date().getDay() === 1;
        const weeklySessions = sessions.filter((s) => {
          const diffMs = Date.now() - new Date(s.created_at).getTime();
          return diffMs <= 7 * 24 * 60 * 60 * 1000;
        });
        const hasRecap = weeklySessions.length >= 3;

        if (!isMonday || recapDismissed || !hasRecap) return null;

        const recapAvgMood = Math.round(
          weeklySessions.reduce((sum, s) => sum + s.mood_score, 0) / weeklySessions.length
        );

        const recapBestSession = weeklySessions.reduce(
          (best, s) => (s.mood_score > best.mood_score ? s : best),
          weeklySessions[0]
        );
        const DAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const recapBestDayName = DAYS_FULL[new Date(recapBestSession.created_at).getDay()];

        const moodScores = weeklySessions.map((s) => s.mood_score);
        const recapMoodSwing = Math.max(...moodScores) - Math.min(...moodScores);

        const handleDismissRecap = () => {
          const todayStr = new Date().toISOString().slice(0, 10);
          localStorage.setItem(`recap_dismissed_${todayStr}`, 'true');
          setRecapDismissed(true);
        };

        return (
          <Card
            style={{
              marginBottom: 20,
              background: 'linear-gradient(135deg, rgba(139,92,246,0.04) 0%, rgba(99,102,241,0.04) 100%)',
              border: `1.5px solid rgba(139,92,246,0.18)`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 20 }}>📊</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
                    Your Weekly Recap
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>Monday review · last 7 days</div>
                </div>
              </div>
              <button
                onClick={handleDismissRecap}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.textMuted,
                  fontSize: 14,
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              <div style={{ background: 'rgba(17,17,24,0.02)', padding: 12, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Avg Mood</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.blue, fontFamily: 'var(--font-syne)', marginTop: 4 }}>
                  {recapAvgMood} <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>pts</span>
                </div>
              </div>

              <div style={{ background: 'rgba(17,17,24,0.02)', padding: 12, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Best Day</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.green, fontFamily: 'var(--font-syne)', marginTop: 8 }}>
                  {recapBestDayName}
                </div>
              </div>

              <div style={{ background: 'rgba(17,17,24,0.02)', padding: 12, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Mood Swing</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.danger, fontFamily: 'var(--font-syne)', marginTop: 4 }}>
                  {recapMoodSwing} <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}>pts span</span>
                </div>
              </div>

              <div style={{ background: 'rgba(17,17,24,0.02)', padding: 12, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 }}>Streak Status</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#D97706', fontFamily: 'var(--font-syne)', marginTop: 8 }}>
                  🔥 {streak ? `${streak.current_streak} days` : '0 days'}
                </div>
              </div>
            </div>
          </Card>
        );
      })()}

      {/* ── Streak banner ── */}
      {streak && streak.current_streak > 0 && (
        <div style={{ marginBottom: 16 }}>
          <StreakBadge currentStreak={streak.current_streak} longestStreak={streak.longest_streak} />
        </div>
      )}

      {/* ── Primary CTA Row (Check-In & Subscription) ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        {/* Daily Check-In */}
        <button
          onClick={() => router.push('/therapy')}
          style={{
            textAlign: 'left',
            borderRadius: 20,
            padding: '22px 24px',
            background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
            position: 'relative',
            overflow: 'hidden',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(37,99,235,0.15)',
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
              position: 'relative',
              zIndex: 1,
              height: '100%',
            }}
          >
            <div style={{ flex: 1, minWidth: 200 }}>
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
              <div style={{ fontSize: 19, fontWeight: 800, color: COLORS.white, marginBottom: 4, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
                {stats?.doneToday ? 'Check-In Complete' : 'Morning Check-In'}
              </div>
              <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.82)' }}>
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
                fontSize: 13.5,
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

        {/* Subscription & Usage */}
        {(() => {
          const subStatus = profile?.subscription_status ?? 'trial';
          const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
          const now = new Date();
          const diffMs = trialEndsAt ? trialEndsAt.getTime() - now.getTime() : 0;
          const daysLeft = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

          const minutesRemaining = profile?.subscription_minutes_remaining ?? 0;
          
          let planName = 'Free Trial';
          let planDetails = `${daysLeft} days remaining`;
          let actionLabel = 'Upgrade Plan';
          let actionPath = '/payment';
          let isLowQuota = false;

          if (subStatus === 'active') {
            planName = 'Premium Plan';
            planDetails = `$12/month • ${daysLeft} days left`;
            actionLabel = 'Manage Plan';
            actionPath = '/settings';
            if (minutesRemaining <= 30) {
              isLowQuota = true;
              actionLabel = 'Top-Up Minutes';
              actionPath = '/payment';
            }
          } else if (subStatus === 'expired') {
            planName = 'Plan Expired';
            planDetails = 'Renew to continue therapy sessions';
            actionLabel = 'Renew Subscription';
            actionPath = '/payment';
          }

          const totalQuota = 150;
          const progressPct = Math.min(100, Math.max(0, (minutesRemaining / totalQuota) * 100));

          return (
            <div
              style={{
                borderRadius: 20,
                padding: '20px 22px',
                background: COLORS.card,
                border: `1.5px solid ${COLORS.cardBorder}`,
                boxShadow: '0 4px 24px rgba(37,99,235,0.02)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 12,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Plan Header */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: subStatus === 'active' ? COLORS.blue : '#EA580C',
                      background: subStatus === 'active' ? 'rgba(37,99,235,0.06)' : 'rgba(234,88,12,0.06)',
                      padding: '3px 9px',
                      borderRadius: 12,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    ⚡ {planName}
                  </span>
                  {subStatus !== 'expired' && (
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.textSecondary }}>
                      ⏳ {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>
                  {planDetails}
                </div>
              </div>

              {/* Progress bar and minutes indicator */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>Quota Remaining</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.blue }}>
                    {minutesRemaining} <span style={{ fontSize: 10.5, color: COLORS.textSecondary, fontWeight: 500 }}>/ {totalQuota} mins</span>
                  </span>
                </div>
                {/* Progress track */}
                <div style={{ width: '100%', height: 7, borderRadius: 4, background: 'rgba(37,99,235,0.06)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: '100%',
                      borderRadius: 4,
                      background: progressPct <= 20 ? COLORS.danger : `linear-gradient(90deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => router.push(actionPath)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: isLowQuota || subStatus !== 'active'
                    ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
                    : 'transparent',
                  color: isLowQuota || subStatus !== 'active' ? '#fff' : COLORS.blue,
                  border: isLowQuota || subStatus !== 'active' ? 'none' : `1.5px solid ${COLORS.blue}33`,
                  borderRadius: 12,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-syne)',
                }}
              >
                {actionLabel}
                <Icon name="arrow-forward" size={13} color={isLowQuota || subStatus !== 'active' ? '#fff' : COLORS.blue} />
              </button>
            </div>
          );
        })()}
      </div>

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
              <StatItem value={streak ? streak.current_streak : stats.streak} label="Day Streak" />
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
