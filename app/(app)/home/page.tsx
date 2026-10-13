'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { Card } from '@/components/Card';
import { MiniChart } from '@/components/MiniChart';
import { Icon } from '@/components/Icon';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { EarlyWarnings } from '@/components/EarlyWarnings';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { useAuth } from '@/lib/auth-context';
import {
  getStreak,
} from '@/lib/ai';
import { computeStats } from '@/lib/graphMetrics';
import { useCheckins, useSessionResource } from '@/lib/session-data';
import { fmtChartLabels, fmtDate, todayPretty } from '@/lib/format';

function modeColor(mode: string) {
  const c = MODE_COLOR[mode] ?? COLORS.blue;
  return c === COLORS.green ? COLORS.blue : c;
}

function HomeInner() {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { user, profile } = useAuth();
  const { data, loading: loadingStats, error: statsError, refresh: loadStats } = useCheckins();
  const sessions = (data ?? []).slice(0, 30);
  const stats = computeStats(sessions);
  const lastSession = sessions[0] ?? null;
  const { data: streak } = useSessionResource('streak', getStreak);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [recapDismissed, setRecapDismissed] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const todayStr = new Date().toISOString().slice(0, 10);
      try {
        setRecapDismissed(!!localStorage.getItem(`recap_dismissed_${todayStr}`));
      } catch {
        setRecapDismissed(false);
      }
    }
  }, []);

  const firstName =
    (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ??
    user?.email?.split('@')[0] ??
    'there';

  const dateString = todayPretty();

  const tooltipLabels = stats?.last7Dates ? fmtChartLabels(stats.last7Dates) : undefined;
  const rangeLabels = tooltipLabels?.length
    ? [tooltipLabels[0], tooltipLabels[tooltipLabels.length - 1]]
    : [];
  const trendDelta = stats?.trendDelta ?? null;
  const trendFlat = trendDelta === 0;
  const trendUp = trendDelta !== null && trendDelta >= 0;

  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const currentStreak = streak ? streak.current_streak : stats?.streak ?? 0;

  return (
    <AppShell title="Dashboard" subtitle={dateString}>
      {/* ── Hero: greeting + at-a-glance stats ── */}
      <section
        className="rv-rise rv-card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 24,
          padding: isMobile ? '22px 20px' : '28px 30px',
          marginBottom: 18,
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
        }}
      >
        {/* Soft brand glow, purely decorative. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(520px 220px at 100% 0%, rgba(14,165,233,0.12), transparent 70%), radial-gradient(420px 200px at 0% 100%, rgba(37,99,235,0.07), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: COLORS.blue,
                background: 'rgba(37,99,235,0.07)',
                border: '1px solid rgba(37,99,235,0.14)',
                padding: '4px 10px',
                borderRadius: 999,
                marginBottom: 12,
              }}
            >
              <Icon name="sparkles" size={12} color={COLORS.blue} />
              {dateString}
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: isMobile ? 26 : 32,
                fontWeight: 800,
                color: COLORS.textPrimary,
                lineHeight: 1.15,
                fontFamily: 'var(--font-syne)',
                letterSpacing: '-1px',
              }}
            >
              Good {partOfDay.toLowerCase()}, <span className="gradient-text">{firstName}</span>
            </h1>
            <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '8px 0 0' }}>
              Here&apos;s how you&apos;ve been feeling lately.
            </p>
          </div>

          {stats && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <HeroStat
                icon="flame"
                tint="#D97706"
                value={currentStreak}
                label={currentStreak === 1 ? 'Day streak' : 'Day streak'}
                sub={streak && streak.longest_streak > 1 ? `Best: ${streak.longest_streak} days` : undefined}
              />
              <HeroStat icon="pulse" tint={COLORS.blue} value={stats.recentAvg} label="Recent avg" />
              <HeroStat icon="time" tint={COLORS.sky} value={stats.totalSessions} label="Sessions" />
            </div>
          )}
        </div>
      </section>

      {/* ── Burnout alerts ── */}
      {sessions.length >= 3 && (
        <div className="rv-rise" style={{ marginBottom: 16, animationDelay: '60ms' }}>
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
          className="rv-rise rv-card"
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 18,
            padding: '14px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            animationDelay: '80ms',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <IconTile icon="sparkles" />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: COLORS.textPrimary }}>
                Haven&apos;t heard from you today
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                Want to talk with Freya and see how you&apos;re doing?
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => router.push('/live')}
              className="rv-cta"
              style={{
                background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                color: COLORS.white,
                borderRadius: 999,
                padding: '8px 16px',
                fontSize: 12.5,
                fontWeight: 700,
              }}
            >
              Check in
            </button>
            <DismissButton onClick={() => setNudgeDismissed(true)} label="Dismiss reminder" />
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
          try {
            localStorage.setItem(`recap_dismissed_${todayStr}`, 'true');
          } catch {}
          setRecapDismissed(true);
        };

        return (
          <Card
            style={{
              marginBottom: 18,
              background: `linear-gradient(135deg, rgba(37,99,235,0.05) 0%, rgba(14,165,233,0.04) 100%), ${COLORS.card}`,
              border: '1px solid rgba(37,99,235,0.16)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <IconTile icon="trending-up" />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
                    Your Weekly Recap
                  </div>
                  <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 1 }}>Monday review · last 7 days</div>
                </div>
              </div>
              <DismissButton onClick={handleDismissRecap} label="Dismiss weekly recap" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              <RecapTile label="Avg Mood">
                <span style={{ fontSize: 24, fontWeight: 800, color: COLORS.blue }}>{recapAvgMood}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}> pts</span>
              </RecapTile>
              <RecapTile label="Best Day">
                <span style={{ fontSize: 17, fontWeight: 800, color: COLORS.sky }}>{recapBestDayName}</span>
              </RecapTile>
              <RecapTile label="Mood Swing">
                <span style={{ fontSize: 24, fontWeight: 800, color: COLORS.danger }}>{recapMoodSwing}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: COLORS.textSecondary }}> pts span</span>
              </RecapTile>
              <RecapTile label="Streak Status">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 17, fontWeight: 800, color: COLORS.warning }}>
                  <Icon name="flame" size={16} color={COLORS.warning} />
                  {streak ? `${streak.current_streak} days` : '0 days'}
                </span>
              </RecapTile>
            </div>
          </Card>
        );
      })()}

      {/* ── Primary CTA Row (Check-In & Subscription) ── */}
      <div
        className="rv-rise"
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.5fr) minmax(0, 1fr)',
          gap: 16,
          marginBottom: 18,
          animationDelay: '120ms',
        }}
      >
        {/* Daily Check-In */}
        <button
          onClick={() => router.push('/live')}
          className="rv-cta"
          style={{
            textAlign: 'left',
            borderRadius: 24,
            padding: isMobile ? '22px 20px' : '26px 28px',
            background: `linear-gradient(135deg, ${COLORS.gradientStart} 0%, ${COLORS.gradientEnd} 100%)`,
            position: 'relative',
            overflow: 'hidden',
            minHeight: 168,
          }}
        >
          {/* Decorative light: two soft orbs and a fine sheen. */}
          <div aria-hidden="true" style={{ position: 'absolute', right: -60, top: -70, width: 240, height: 240, borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)', pointerEvents: 'none' }} />
          <div aria-hidden="true" style={{ position: 'absolute', left: -40, bottom: -90, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(17,17,24,0.14), transparent 65%)', pointerEvents: 'none' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 24, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25)', pointerEvents: 'none' }} />

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
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(6px)' }}>
                  <Icon name={stats?.doneToday ? 'checkmark' : 'mic'} size={19} color={COLORS.white} />
                </div>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.16)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    padding: '4px 11px',
                    borderRadius: 999,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: COLORS.white,
                    letterSpacing: '0.08em',
                  }}
                >
                  {stats?.doneToday ? 'DONE TODAY' : 'DAILY CHECK-IN'}
                </div>
              </div>
              <div style={{ fontSize: isMobile ? 21 : 24, fontWeight: 800, color: COLORS.white, marginBottom: 6, fontFamily: 'var(--font-syne)', letterSpacing: '-0.6px' }}>
                {stats?.doneToday ? 'Check-In Complete' : `${partOfDay} Check-In`}
              </div>
              <div style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.86)', lineHeight: 1.5 }}>
                {stats?.doneToday
                  ? `Mood ${stats.latestMood} · Feeling ${stats.latestMode}`
                  : 'Talk with Freya — we decode your mood & energy'}
              </div>
              <div
                style={{
                  marginTop: 18,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: COLORS.white,
                  color: COLORS.blue,
                  padding: '10px 18px',
                  borderRadius: 999,
                  fontSize: 13.5,
                  fontWeight: 700,
                  boxShadow: '0 6px 16px -6px rgba(17,17,24,0.35)',
                }}
              >
                {stats?.doneToday ? 'View Results' : 'Start'}
                <span className="rv-cta-arrow" style={{ display: 'inline-flex' }}>
                  <Icon name="arrow-forward" size={15} color={COLORS.blue} />
                </span>
              </div>
            </div>
            {!isMobile && <VoiceWave />}
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
          const primary = isLowQuota || subStatus !== 'active';
          const planTint = subStatus === 'active' ? COLORS.blue : '#EA580C';

          return (
            <div
              className="rv-card"
              style={{
                borderRadius: 24,
                padding: '22px 22px 20px',
                background: COLORS.card,
                border: `1px solid ${COLORS.cardBorder}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              {/* Plan Header */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 10.5,
                      fontWeight: 700,
                      color: planTint,
                      background: subStatus === 'active' ? 'rgba(37,99,235,0.07)' : 'rgba(234,88,12,0.07)',
                      border: `1px solid ${subStatus === 'active' ? 'rgba(37,99,235,0.16)' : 'rgba(234,88,12,0.18)'}`,
                      padding: '4px 10px',
                      borderRadius: 999,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    <Icon name="sparkles" size={12} color={planTint} />
                    {planName}
                  </span>
                  {subStatus !== 'expired' && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>
                      <Icon name="time" size={13} color={COLORS.textMuted} />
                      {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 8 }}>
                  {planDetails}
                </div>
              </div>

              {/* Minutes indicator */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.textSecondary }}>Quota Remaining</span>
                  <span style={{ fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.textPrimary }}>{minutesRemaining}</span>
                    <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500 }}> / {totalQuota} mins</span>
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Subscription minutes remaining"
                  aria-valuemin={0}
                  aria-valuemax={totalQuota}
                  aria-valuenow={Math.max(0, Math.min(totalQuota, minutesRemaining))}
                  style={{ width: '100%', height: 8, borderRadius: 999, background: 'rgba(37,99,235,0.08)', overflow: 'hidden' }}
                >
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: '100%',
                      borderRadius: 999,
                      background: progressPct <= 20 ? COLORS.danger : `linear-gradient(90deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                      boxShadow: progressPct <= 20 ? 'none' : '0 0 12px rgba(14,165,233,0.45)',
                      transition: 'width 0.6s var(--ease-out)',
                    }}
                  />
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => router.push(actionPath)}
                className={primary ? 'rv-cta' : 'rv-lift'}
                style={{
                  width: '100%',
                  padding: '11px 14px',
                  background: primary
                    ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
                    : COLORS.card,
                  color: primary ? COLORS.white : COLORS.blue,
                  border: primary ? 'none' : `1px solid rgba(37,99,235,0.22)`,
                  borderRadius: 14,
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontFamily: 'var(--font-syne)',
                }}
              >
                {actionLabel}
                <span className="rv-cta-arrow" style={{ display: 'inline-flex' }}>
                  <Icon name="arrow-forward" size={13} color={primary ? COLORS.white : COLORS.blue} />
                </span>
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── First load: skeletons instead of an empty page ── */}
      {loadingStats && !stats && (
        <Grid cols={2} gap={16}>
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} style={{ marginBottom: 0 }}>
              <div className="rv-skeleton" style={{ width: '40%', height: 14, marginBottom: 8 }} />
              <div className="rv-skeleton" style={{ width: '25%', height: 10, marginBottom: 22 }} />
              <div className="rv-skeleton" style={{ width: '100%', height: 96 }} />
            </Card>
          ))}
        </Grid>
      )}

      {/* ── Charts grid ── */}
      <div className="rv-rise" style={{ animationDelay: '180ms' }}>
      {/* Stretch so cards sharing a row end level, rather than leaving a gap. */}
      <Grid cols={2} gap={16} style={{ alignItems: 'stretch' }}>
        <Card style={{ marginBottom: 0 }}>
          <ChartHeader
            icon="pulse"
            title="Mood Trend"
            subtitle={stats ? `Last ${stats.last7MoodScores.length} saved check-ins` : 'Saved check-ins'}
            badge={
              loadingStats || trendDelta === null ? null : (
                <Pill tint={trendFlat ? COLORS.textMuted : trendUp ? COLORS.success : COLORS.danger}>
                  {trendFlat ? (
                    <span style={{ fontWeight: 800 }}>–</span>
                  ) : (
                    <Icon
                      name={trendUp ? 'trending-up' : 'trending-down'}
                      size={14}
                      color={trendUp ? COLORS.success : COLORS.danger}
                    />
                  )}
                  {!trendFlat && trendUp ? '+' : ''}
                  {trendDelta} pts
                </Pill>
              )
            }
          />

          {stats && stats.last7MoodScores.length >= 2 ? (
            <>
              <MiniChart
                data={stats.last7MoodScores}
                color={COLORS.blue}
                height={110}
                labels={tooltipLabels}
                ariaLabel="Mood across recent saved check-ins"
              />
              <DayLabels labels={rangeLabels} />
            </>
          ) : stats ? (
            <NeedsMoreData metric="mood" value={stats.last7MoodScores[0]} />
          ) : null}

          {stats && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 8,
                marginTop: 16,
              }}
            >
              <StatItem value={stats.recentAvg} label="Recent Avg" />
              <StatItem value={currentStreak} label="Day Streak" />
              <StatItem value={stats.totalSessions} label="Sessions" />
            </div>
          )}

          {!stats && !loadingStats && !statsError && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                fontSize: 12.5,
                color: COLORS.textMuted,
                textAlign: 'center',
                padding: '18px 0 6px',
              }}
            >
              <IconTile icon="mic" />
              Complete your first check-in to see trends.
            </div>
          )}

          {!loadingStats && statsError && (
            <div
              role="alert"
              style={{
                fontSize: 12,
                color: COLORS.danger,
                textAlign: 'center',
                marginTop: 8,
              }}
            >
              Your saved check-ins could not be loaded.{' '}
              <button onClick={loadStats} style={{ color: COLORS.blue, fontWeight: 700 }}>
                Try again
              </button>
            </div>
          )}

          {stats && (
            <button
              onClick={() => router.push('/trends')}
              className="rv-lift"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                width: '100%',
                marginTop: 14,
                padding: '10px 12px',
                borderRadius: 12,
                background: 'rgba(37,99,235,0.05)',
                border: '1px solid rgba(37,99,235,0.12)',
                color: COLORS.blue,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <Icon name="trending-up" size={14} color={COLORS.blue} />
              View My Trends
              <span className="rv-cta-arrow" style={{ display: 'inline-flex' }}>
                <Icon name="chevron-forward" size={14} color={COLORS.blue} />
              </span>
            </button>
          )}
        </Card>

        {stats ? (
          <Card style={{ marginBottom: 0 }}>
            <ChartHeader
              icon="flame"
              title="Energy Level"
              subtitle={`Last ${stats.last7EnergyScores.length} check-ins`}
              badge={
                <ScoreBadge
                  value={stats.last7EnergyScores[stats.last7EnergyScores.length - 1]}
                  color={COLORS.blue}
                />
              }
            />
            {stats.last7EnergyScores.length >= 2 ? (
              <>
                <MiniChart
                  data={stats.last7EnergyScores}
                  color={COLORS.blue}
                  height={110}
                  labels={tooltipLabels}
                  ariaLabel="Energy across recent saved check-ins"
                />
                <DayLabels labels={rangeLabels} />
              </>
            ) : (
              <NeedsMoreData metric="energy" value={stats.last7EnergyScores[0]} />
            )}
          </Card>
        ) : <div />}

        {stats ? (
          <Card style={{ marginBottom: 0 }}>
            <ChartHeader
              icon="warning"
              title="Stress Level"
              subtitle={`Last ${stats.last7StressScores.length} check-ins`}
              badge={
                <ScoreBadge
                  value={stats.last7StressScores[stats.last7StressScores.length - 1]}
                  color={COLORS.danger}
                />
              }
            />
            {stats.last7StressScores.length >= 2 ? (
              <>
                <MiniChart
                  data={stats.last7StressScores}
                  color={COLORS.danger}
                  height={110}
                  labels={tooltipLabels}
                  ariaLabel="Stress across recent saved check-ins"
                />
                <DayLabels labels={rangeLabels} />
              </>
            ) : (
              <NeedsMoreData metric="stress" value={stats.last7StressScores[0]} />
            )}
          </Card>
        ) : <div />}

        {lastSession?.insight ? (
          <Card
            style={{
              marginBottom: 0,
              position: 'relative',
              overflow: 'hidden',
              background: `linear-gradient(180deg, rgba(37,99,235,0.035), transparent 120px), ${COLORS.card}`,
            }}
          >
            <ChartHeader
              icon="bulb"
              title="Last Session Insight"
              subtitle={fmtDate(lastSession.created_at)}
              badge={
                <Pill tint={modeColor(lastSession.detected_mode)}>
                  <span
                    aria-hidden="true"
                    style={{ width: 6, height: 6, borderRadius: '50%', background: modeColor(lastSession.detected_mode) }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>{lastSession.detected_mode}</span>
                </Pill>
              }
            />
            <blockquote
              style={{
                margin: 0,
                padding: '2px 0 2px 14px',
                borderLeft: `3px solid rgba(37,99,235,0.35)`,
                fontSize: 14,
                color: COLORS.textSecondary,
                lineHeight: 1.7,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {lastSession.insight}
            </blockquote>
            {lastSession.tips?.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 16,
                  padding: '10px 12px',
                  borderRadius: 12,
                  background: 'rgba(37,99,235,0.05)',
                  border: '1px solid rgba(37,99,235,0.1)',
                }}
              >
                <Icon name="sparkles" size={14} color={COLORS.blue} />
                <span
                  style={{
                    fontSize: 12.5,
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
      </div>
    </AppShell>
  );
}

function IconTile({ icon }: { icon: string }) {
  return (
    <div
      aria-hidden="true"
      style={{
        width: 34,
        height: 34,
        borderRadius: 11,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(14,165,233,0.1))',
        border: '1px solid rgba(37,99,235,0.12)',
      }}
    >
      <Icon name={icon} size={16} color={COLORS.blue} />
    </div>
  );
}

function DismissButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="rv-icon-btn"
      style={{
        width: 30,
        height: 30,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="close" size={14} color={COLORS.textMuted} />
    </button>
  );
}

function HeroStat({
  icon,
  tint,
  value,
  label,
  sub,
}: {
  icon: string;
  tint: string;
  value: number;
  label: string;
  sub?: string;
}) {
  return (
    <div
      title={sub}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px 10px 10px',
        borderRadius: 16,
        background: 'rgba(255,255,255,0.8)',
        border: `1px solid ${COLORS.cardBorder}`,
        boxShadow: '0 1px 2px rgba(17,17,24,0.04)',
        minWidth: 112,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${tint}14`,
        }}
      >
        <Icon name={icon} size={16} color={tint} />
      </div>
      <div>
        <div style={{ fontSize: 19, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px', lineHeight: 1 }}>
          {value}
        </div>
        <div style={{ fontSize: 10.5, color: COLORS.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
          {label}
        </div>
      </div>
    </div>
  );
}

function RecapTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: COLORS.card, padding: '12px 14px', borderRadius: 14, border: `1px solid ${COLORS.cardBorder}` }}>
      <div style={{ fontSize: 10.5, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-syne)', marginTop: 6, letterSpacing: '-0.4px' }}>{children}</div>
    </div>
  );
}

function Pill({ tint, children }: { tint: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        color: tint,
        background: `${tint}14`,
        border: `1px solid ${tint}2e`,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function ScoreBadge({ value, color }: { value: number; color: string }) {
  return (
    <span style={{ fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px', lineHeight: 1 }}>
      <span style={{ fontSize: 24, fontWeight: 800, color }}>{value}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.textMuted }}> /100</span>
    </span>
  );
}

// Decorative voice bars on the check-in card: a quiet nod to what the
// check-in actually listens to.
function VoiceWave() {
  const bars = [0.5, 0.8, 0.4, 1, 0.65, 0.9, 0.45, 0.75, 0.55];
  return (
    <div
      aria-hidden="true"
      className="rv-wave"
      style={{ display: 'flex', alignItems: 'center', gap: 5, height: 72, paddingRight: 6, flexShrink: 0 }}
    >
      {bars.map((h, i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: `${h * 100}%`,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.55)',
            transformOrigin: 'center',
            animation: `rv-breathe ${1.1 + (i % 3) * 0.25}s ease-in-out ${i * 0.09}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function ChartHeader({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon?: string;
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
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        {icon && <IconTile icon={icon} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.3px' }}>{title}</div>
          <div style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 2 }}>{subtitle}</div>
        </div>
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

function NeedsMoreData({ metric, value }: { metric: string; value: number }) {
  return (
    <div
      role="status"
      style={{
        minHeight: 96,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        color: COLORS.textSecondary,
        fontSize: 12,
        textAlign: 'center',
        borderRadius: 14,
        background: COLORS.surface,
        border: `1px dashed ${COLORS.cardBorder}`,
        padding: '12px 16px',
      }}
    >
      <strong style={{ color: COLORS.textPrimary }}>{value} / 100</strong>
      One saved {metric} score. Talk with Freya again to reveal a trend.
    </div>
  );
}

function StatItem({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '10px 6px',
        borderRadius: 12,
        background: COLORS.surface,
        border: `1px solid ${COLORS.cardBorder}`,
      }}
    >
      <span style={{ fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>{value}</span>
      <span style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <>
      <HomeInner />
    </>
  );
}
