'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Card } from '@/components/Card';
import { MetricBar } from '@/components/MetricBar';
import { CircularProgress } from '@/components/CircularProgress';
import { MoodSparklineInline } from '@/components/MoodSparklineInline';
import { StreakBadge } from '@/components/StreakBadge';
import { Icon } from '@/components/Icon';
import { Grid } from '@/components/Grid';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { WaveformPlayer } from '@/components/WaveformPlayer';
import type { SegmentEmotion } from '@/lib/audioFeatures';
import {
  retrySaveAnalysis,
  updateStreak,
  type AnalysisResult,
  type CallShift,
  type StreakData,
  type TherapySession,
} from '@/lib/ai';

/**
 * The results screen for a session: mood score, Breakdown, the Heart-to-Heart
 * Reflection, Recommendations and Today's Action, plus the comparison with the
 * previous session and personal notes.
 *
 * It was the Reflect check-in's results screen on /therapy. Reflect is retired
 * and live calls on /live produce the same AnalysisResult, so the screen moved
 * here unchanged rather than being rebuilt beside a dead copy.
 */

const PACE_LABEL: Record<string, string> = { Slow: 'Slow', Normal: 'Normal', Fast: 'Fast' };

export function labelForMood(score: number) {
  if (score >= 80) return 'Great';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Okay';
  if (score >= 35) return 'Slightly Low';
  return 'Low';
}

function colorForWellbeingScore(score: number) {
  if (score >= 70) return COLORS.success;
  if (score >= 45) return COLORS.warning;
  return COLORS.danger;
}

type SessionResultsProps = {
  results: AnalysisResult;
  /** The session before this one, for the trend banner and comparison card. */
  previousSession: TherapySession | null;
  /** Recent saved sessions, newest first, excluding this one. */
  recentSessions: TherapySession[];
  streak: StreakData | null;
  heading: string;
  subheading: string;
  newSessionLabel: string;
  onNewSession: () => void;
  /** Called after a failed save is retried successfully. */
  onSaved: (saved: AnalysisResult, streak: StreakData | null) => void;
  /** The voice sample, playable with its loudness colouring. Lost on reload. */
  audio?: { blobUrl: string; envelope: number[]; segments: SegmentEmotion[]; duration: number } | null;
};

export function SessionResults({
  results,
  previousSession,
  recentSessions,
  streak,
  heading,
  subheading,
  newSessionLabel,
  onNewSession,
  onSaved,
  audio,
}: SessionResultsProps) {
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isRetryingSave, setIsRetryingSave] = useState(false);
  const [saveRetryError, setSaveRetryError] = useState<string | null>(null);

  const handleRetrySave = async () => {
    if (isRetryingSave) return;
    setIsRetryingSave(true);
    setSaveRetryError(null);
    try {
      await retrySaveAnalysis(results);
      let updatedStreak = streak;
      try {
        updatedStreak = await updateStreak();
      } catch {}
      onSaved({ ...results, saved: true, save_error: undefined }, updatedStreak);
    } catch (error) {
      setSaveRetryError((error as Error).message || 'Could not save this result.');
    } finally {
      setIsRetryingSave(false);
    }
  };

  const moodLabel = labelForMood(results.mood_score);
  const resultRecommendations = (results.recommendations ?? results.tips ?? []).filter(Boolean);

  return (
    <>
      {results.saved === false && (
        <div
          role="alert"
          style={{
            background: 'rgba(217,119,6,0.08)',
            border: '1px solid rgba(217,119,6,0.35)',
            borderRadius: 16,
            padding: '14px 16px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ color: COLORS.warning, fontSize: 14, fontWeight: 800 }}>
              This result is not in your history yet
            </div>
            <div style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
              Your analysis is safe on this screen, but Dashboard, Journey, and History will not
              include it until saving succeeds.
            </div>
            {saveRetryError && (
              <div style={{ color: COLORS.danger, fontSize: 11, marginTop: 5 }}>
                {saveRetryError}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleRetrySave}
            disabled={isRetryingSave}
            style={{
              borderRadius: 10,
              padding: '9px 14px',
              background: COLORS.warning,
              color: COLORS.white,
              fontSize: 12,
              fontWeight: 800,
              opacity: isRetryingSave ? 0.65 : 1,
              cursor: isRetryingSave ? 'wait' : 'pointer',
            }}
          >
            {isRetryingSave ? 'Saving…' : 'Retry saving'}
          </button>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.6px' }}>
            {heading}
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            {subheading}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {streak && streak.current_streak > 0 && (
            <StreakBadge currentStreak={streak.current_streak} longestStreak={streak.longest_streak} size="sm" />
          )}
          <button
            onClick={onNewSession}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.textPrimary,
              fontSize: 13,
              fontWeight: 700,
              background: COLORS.card,
              cursor: 'pointer',
            }}
          >
            {newSessionLabel}
          </button>
        </div>
      </div>

      {/* -- Trend Delta Banner -- */}
      {(() => {
        const currentMood = results.mood_score;
        const previousMood = previousSession?.mood_score;
        if (previousMood === undefined || isNaN(previousMood)) return null;

        const moodDelta = currentMood - previousMood;
        const trendFlat = moodDelta === 0;
        const trendUp = moodDelta >= 0;
        const moodDeltaColor = trendFlat ? COLORS.textMuted : trendUp ? COLORS.success : COLORS.danger;
        const moodDeltaArrow = trendFlat ? '–' : trendUp ? '▲' : '▼';
        const moodDeltaText = moodDelta !== 0
          ? `Your mood is ${trendUp ? 'up' : 'down'} ${Math.abs(moodDelta)} points from your last session`
          : `Your mood is unchanged from your last session`;

        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: trendFlat
                ? 'rgba(138,138,154,0.06)'
                : trendUp
                  ? 'rgba(22,163,74,0.06)'
                  : 'rgba(239,68,68,0.06)',
              border: `1px solid ${
                trendFlat
                  ? 'rgba(138,138,154,0.2)'
                  : trendUp
                    ? 'rgba(22,163,74,0.2)'
                    : 'rgba(239,68,68,0.2)'
              }`,
              borderRadius: 14,
              padding: '11px 15px',
              marginBottom: 16,
            }}
          >
            <span style={{ color: moodDeltaColor, fontWeight: 900, fontSize: 12 }}>
              {moodDeltaArrow}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary }}>
              {moodDeltaText}
            </span>
          </div>
        );
      })()}

      {results.evidence && !results.evidence.voice_sample && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            background: 'rgba(37,99,235,0.05)',
            border: '1px solid rgba(37,99,235,0.18)',
            borderRadius: 14,
            padding: '11px 15px',
            marginBottom: 16,
            fontSize: 12.5,
            color: COLORS.textSecondary,
            lineHeight: 1.55,
          }}
        >
          <Icon name="mic" size={14} color={COLORS.blue} />
          <span>
            {results.evidence.call_audio
              ? 'Read from your call only. Record the short voice note before your next call for a cleaner read of your tone and a before-and-after comparison.'
              : 'Read from your words only. Record the short voice note before your next call so Freya can read your tone as well.'}
          </span>
        </div>
      )}

      {audio && audio.envelope.length > 0 && (
        <WaveformPlayer
          blobUrl={audio.blobUrl}
          envelope={audio.envelope}
          segments={audio.segments}
          duration={audio.duration}
          audioRef={audioRef}
        />
      )}

      {/* -- What Freya heard ------------------------------------------ */}
      {(results.transcript_summary || results.vocal_summary || results.emotional_mirror) && (
        <div
          style={{
            background: `linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(14, 165, 233, 0.06))`,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 18,
            padding: 20,
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Icon name="mic" size={16} color={COLORS.blue} />
            <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              What Freya heard
            </span>
          </div>

          {results.transcript_summary && (
            <div style={{ marginBottom: (results.vocal_summary || results.emotional_mirror) ? 14 : 0 }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                What you talked about
              </div>
              <div style={{ fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.6 }}>
                {results.transcript_summary}
              </div>
            </div>
          )}

          {(results.vocal_summary || results.emotional_mirror) && (
            <div style={{ paddingTop: results.transcript_summary ? 14 : 0, borderTop: results.transcript_summary ? `1px solid ${COLORS.cardBorder}` : 'none' }}>
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                How you came across
              </div>
              <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                {results.vocal_summary || results.emotional_mirror}
              </div>
            </div>
          )}
        </div>
      )}

      <Grid cols={2} gap={14}>
        <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 0, justifyContent: 'center' }}>
          <CircularProgress
            value={results.mood_score}
            size={160}
            label="Mood Score"
            sublabel={moodLabel}
            color={colorForWellbeingScore(results.mood_score)}
          />
          {/* Saved check-in mood sparkline inline */}
          {(() => {
            if (results.saved === false) return null;
            const previous = recentSessions.slice(0, 6).reverse();
            const scores = [...previous.map((session) => session.mood_score), results.mood_score];
            const dates = [...previous.map((session) => session.created_at), 'This session'];
            if (scores.length < 2) return null;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 14, width: '100%', borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 12 }}>
                <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                  {scores.length} Saved Sessions · 0–100
                </div>
                <MoodSparklineInline scores={scores} dates={dates} width={130} height={35} />
              </div>
            );
          })()}
        </Card>

        <Card style={{ marginBottom: 0 }}>
          <CardTitle>Breakdown</CardTitle>
          <MetricBar label="Energy Level" value={results.energy} color={COLORS.blue} />
          <MetricBar label="Stress Level" value={results.stress} color={COLORS.danger} />
          <MetricBar label="Positivity" value={results.positivity} color={COLORS.green} />
          <MetricBar label="Confidence" value={results.confidence} color={COLORS.blue} />
          <InlineRow label="Pace" value={PACE_LABEL[results.pace] ?? results.pace} />
        </Card>
      </Grid>

      {results.call_shift && <ShiftCard shift={results.call_shift} />}

      {/* -- Detected Mode badge ----------------------------------- */}
      <DetectedModeBadge mode={results.detected_mode} />

      {/* -- Narrative Type badge ----------------------------------- */}
      {results.narrative_type && (() => {
        const NARRATIVE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
          past:    { label: 'Processing the past', emoji: '🌀', color: '#7C3AED', bg: 'rgba(139,92,246,0.06)' },
          present: { label: 'How you feel right now', emoji: '🌿', color: '#16A34A', bg: 'rgba(16,163,74,0.06)' },
          future:  { label: 'Looking ahead', emoji: '🔭', color: '#2563EB', bg: 'rgba(37,99,235,0.06)' },
          mixed:   { label: 'Past, present & future', emoji: '✨', color: '#D97706', bg: 'rgba(245,158,11,0.06)' },
        };
        const meta = NARRATIVE_META[results.narrative_type!] ?? NARRATIVE_META.present;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: meta.bg,
            border: `1px solid ${meta.color}33`,
            borderRadius: 14,
            padding: '10px 16px',
            marginTop: 10,
          }}>
            <span style={{ fontSize: 18 }}>{meta.emoji}</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.8 }}>What you shared</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginTop: 1 }}>{meta.label}</div>
            </div>
          </div>
        );
      })()}

      {previousSession && (
        <div style={{ marginTop: 14 }}>
          <ComparisonCard current={results} previous={previousSession} />
        </div>
      )}

      <PersonalNoteCard
        current={results}
        recentSessions={recentSessions}
      />

      <Card style={{ marginBottom: 0, marginTop: 14 }}>
        <CardTitle icon="bulb">A Heart-to-Heart Reflection</CardTitle>
        <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.7 }}>
          {results.ai_insight || results.insight}
        </div>
      </Card>
      <div style={{ height: 14 }} />

      {/* -- Readiness card (only for future/mixed narratives) ------- */}
      {(results.narrative_type === 'future' || results.narrative_type === 'mixed') && results.readiness_score != null && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(37,99,235,0.04), rgba(14,165,233,0.06))',
          border: '1px solid rgba(37,99,235,0.18)',
          borderRadius: 18,
          padding: '20px 20px 18px',
          marginBottom: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Readiness Check</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>How ready do you feel?</div>
            </div>
            <div
              role="progressbar"
              aria-label="Readiness score"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.max(0, Math.min(100, results.readiness_score))}
              style={{
              width: 58, height: 58, borderRadius: '50%',
              background: `conic-gradient(${colorForWellbeingScore(results.readiness_score)} ${Math.max(0, Math.min(100, results.readiness_score)) * 3.6}deg, rgba(17,17,24,0.08) 0deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: COLORS.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
                  {Math.max(0, Math.min(100, results.readiness_score))}
                  <span style={{ fontSize: 8, color: COLORS.textMuted }}> / 100</span>
                </span>
              </div>
            </div>
          </div>
          {results.readiness_note && (
            <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.65, borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 12 }}>
              {results.readiness_note}
            </div>
          )}
        </div>
      )}

      <Grid cols={2} gap={14}>
        {resultRecommendations.length > 0 && (
          <Card style={{ marginBottom: 0 }}>
            <CardTitle icon="checkmark">Recommendations</CardTitle>
            {resultRecommendations.map((tip, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}
              >
                <div
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: COLORS.green,
                    marginTop: 7,
                    flexShrink: 0,
                  }}
                />
                <div style={{ fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 1.55 }}>
                  {tip}
                </div>
              </div>
            ))}
          </Card>
        )}

        {(results.todays_action || results.daily_prompt) ? (
          <div
            style={{
              background: 'rgba(99,179,237,0.08)',
              border: '1px solid rgba(99,179,237,0.25)',
              borderRadius: 18,
              padding: 20,
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                fontSize: 13,
                fontWeight: 700,
                color: COLORS.blue,
                marginBottom: 8,
                fontFamily: 'var(--font-syne)',
              }}
            >
              <Icon name="pulse" size={14} color={COLORS.blue} />
              Today&apos;s Action
            </div>
            <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
              {results.todays_action || results.daily_prompt}
            </div>
          </div>
        ) : (
          <Card style={{ marginBottom: 0 }}>
            <CardTitle>Next Step</CardTitle>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
              Talk to Freya about anything that came up, or see how today fits into
              your week.
            </div>
          </Card>
        )}
      </Grid>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        {/* Secondary CTA buttons grid */}
        <Grid cols={2} gap={10}>
          <button
            onClick={() => {
              try {
                sessionStorage.setItem('chatContext', JSON.stringify(results));
              } catch {}
              router.push('/chat');
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              background: COLORS.card,
              border: `1.5px solid ${COLORS.cardBorder}`,
              borderRadius: 16,
              padding: '13px 16px',
              color: COLORS.textSecondary,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Icon name="chat" size={16} color={COLORS.textSecondary} />
            Talk to Freya
          </button>

          <button
            onClick={() => router.push('/trends')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              background: COLORS.card,
              border: `1.5px solid ${COLORS.cardBorder}`,
              borderRadius: 16,
              padding: '13px 16px',
              color: COLORS.textSecondary,
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Icon name="trending-up" size={16} color={COLORS.textSecondary} />
            View Trends
          </button>
        </Grid>
      </div>

      <div style={{ marginTop: 24 }}>
        <MedicalDisclaimer />
      </div>
    </>
  );
}

function CardTitle({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
      {icon && <Icon name={icon} size={15} color={COLORS.blue} />}
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// DetectedModeBadge — large, icon-led, screenshot-worthy mode display
// -----------------------------------------------------------------------------
const MODE_META: Record<string, { emoji: string; tagline: string; bg: string; border: string; text: string }> = {
  calm:       { emoji: '🌊', tagline: 'Grounded and at ease', bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.2)', text: '#2563EB' },
  happy:      { emoji: '✨', tagline: 'High on life right now', bg: 'rgba(16,163,74,0.06)', border: 'rgba(16,163,74,0.25)', text: '#16A34A' },
  motivated:  { emoji: '⚡', tagline: 'Ready to move', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', text: '#D97706' },
  anxious:    { emoji: '🌀', tagline: 'Something is pressing on you', bg: 'rgba(217,119,6,0.06)', border: 'rgba(217,119,6,0.25)', text: '#D97706' },
  venting:    { emoji: '🔥', tagline: 'Letting it out — that takes courage', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  angry:      { emoji: '⚡', tagline: 'Strong signal — something matters here', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#EF4444' },
  sad:        { emoji: '🌧️', tagline: 'Carrying something heavy', bg: 'rgba(37,99,235,0.07)', border: 'rgba(37,99,235,0.2)', text: '#2563EB' },
  reflective: { emoji: '🪞', tagline: 'Thinking things through', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)', text: '#7C3AED' },
  neutral:    { emoji: '⚖️', tagline: 'Balanced, measured', bg: 'rgba(138,138,154,0.06)', border: 'rgba(138,138,154,0.2)', text: '#54545F' },
};

function DetectedModeBadge({ mode }: { mode: string }) {
  const meta = MODE_META[mode.toLowerCase()] ?? MODE_META.neutral;
  const label = mode.charAt(0).toUpperCase() + mode.slice(1);

  return (
    <div
      style={{
        background: meta.bg,
        border: `1.5px solid ${meta.border}`,
        borderRadius: 20,
        padding: '20px 24px',
        marginTop: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
      }}
    >
      {/* Big emoji icon */}
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: `${meta.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          flexShrink: 0,
        }}
      >
        {meta.emoji}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: meta.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Detected Mode
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: meta.text,
            fontFamily: 'var(--font-syne)',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
          {meta.tagline}
        </div>
      </div>

      {/* RevealAI watermark for screenshots */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          textAlign: 'right',
          flexShrink: 0,
          opacity: 0.6,
        }}
      >
        Reveal
        <br />
        Voice AI
      </div>
    </div>
  );
}

function InlineRow({ label, value }: { label: string; value: string }) {

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
      }}
    >
      <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</span>
      <span
        style={{
          background: COLORS.cardBorder,
          padding: '4px 12px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          color: COLORS.textPrimary,
          textTransform: 'capitalize',
        }}
      >
        {value}
      </span>
    </div>
  );
}

type DiffMeta = {
  label: string;
  current: number;
  delta: number;
  goodWhen: 'up' | 'down';
};

function ComparisonCard({
  current,
  previous,
}: {
  current: AnalysisResult;
  previous: TherapySession;
}) {
  const diffs: DiffMeta[] = [
    { label: 'Mood', current: current.mood_score, delta: current.mood_score - previous.mood_score, goodWhen: 'up' },
    { label: 'Energy', current: current.energy, delta: current.energy - previous.energy, goodWhen: 'up' },
    { label: 'Stress', current: current.stress, delta: current.stress - previous.stress, goodWhen: 'down' },
    { label: 'Positivity', current: current.positivity, delta: current.positivity - previous.positivity, goodWhen: 'up' },
  ];

  const prevDate = new Date(previous.created_at);
  const dateLabel = prevDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
            <Icon name="trending-up" size={16} color={COLORS.blue} />
            Compared to Last Session
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{dateLabel}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        {diffs.map((d) => (
          <DiffTile key={d.label} {...d} />
        ))}
      </div>
    </Card>
  );
}

function DiffTile({ label, current, delta, goodWhen }: DiffMeta) {
  const isFlat = delta === 0;
  const isUp = delta > 0;
  const isGood = isFlat ? null : (isUp && goodWhen === 'up') || (!isUp && goodWhen === 'down');
  const color = isFlat ? COLORS.textMuted : isGood ? COLORS.success : COLORS.danger;
  const arrow = isFlat ? '–' : isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  return (
    <div
      style={{
        background: 'rgba(17, 17, 24, 0.025)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>{current}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>
          {arrow} {sign}
          {delta}
        </span>
      </div>
    </div>
  );
}

function PersonalNoteCard({
  current,
  recentSessions,
}: {
  current: AnalysisResult;
  recentSessions: TherapySession[];
}) {
  const lines = buildPersonalNotes(current, recentSessions);
  if (!lines.length) return null;

  return (
    <Card>
      <CardTitle icon="sparkles">Personal Notes</CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13,
              color: COLORS.textSecondary,
              lineHeight: 1.55,
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <Icon name={line.icon} size={13} color={COLORS.blue} />
            </div>
            <span style={{ flex: 1 }}>{line.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function buildPersonalNotes(
  current: AnalysisResult,
  recent: TherapySession[]
): { icon: string; text: string }[] {
  const notes: { icon: string; text: string }[] = [];
  const hour = new Date().getHours();
  const timeBand =
    hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';

  // Streak-aware note
  const distinctDays = new Set(
    recent.map((s) => new Date(s.created_at).toDateString())
  );
  if (distinctDays.size >= 5) {
    notes.push({
      icon: 'flame',
      text: `You've shown up ${distinctDays.size} days recently — that consistency is the work. The habit itself is rewiring your self-awareness.`,
    });
  } else if (distinctDays.size >= 2) {
    notes.push({
      icon: 'trending-up',
      text: `${distinctDays.size}-day rhythm building. Two more sessions this week and the trend signal becomes much sharper.`,
    });
  }

  // Time-of-day note
  if (timeBand === 'morning' && current.energy < 50) {
    notes.push({
      icon: 'bulb',
      text: 'Low morning energy — try 5 minutes outside in daylight before your first task. Strongest non-caffeine cortisol lift available.',
    });
  } else if (timeBand === 'evening' && current.stress > 60) {
    notes.push({
      icon: 'time',
      text: 'Evening stress is high. Avoid making decisions tonight — write down what is pressing you, sleep on it, decide tomorrow.',
    });
  } else if (timeBand === 'late night' && current.mood_score < 50) {
    notes.push({
      icon: 'time',
      text: 'Tough feelings at night get amplified — they look different in daylight. Be gentle with yourself and prioritise sleep.',
    });
  }

  // Mode-aware (using recent_modes pattern)
  if (recent.length >= 3) {
    const recentModes = recent.slice(0, 3).map((s) => s.detected_mode);
    const sameMode = recentModes.every((m) => m === current.detected_mode);
    if (sameMode && current.detected_mode) {
      notes.push({
        icon: 'pulse',
        text: `Your last few sessions have all been "${current.detected_mode}" — there's a clear pattern. Worth talking through with Freya to understand what's driving it.`,
      });
    }
  }

  // Compare against personal baselines
  if (recent.length >= 5) {
    const avgMood = Math.round(recent.reduce((s, x) => s + x.mood_score, 0) / recent.length);
    if (current.mood_score >= avgMood + 12) {
      notes.push({
        icon: 'trending-up',
        text: `Today's mood is well above your usual (${avgMood}). Whatever's different today — note it. That's actionable data.`,
      });
    } else if (current.mood_score <= avgMood - 12) {
      notes.push({
        icon: 'trending-down',
        text: `Today scored ${avgMood - current.mood_score} points below your typical mood. One off-day isn't a trend — be honest, not harsh.`,
      });
    }
  }

  // Burnout early warning
  if (recent.length >= 4) {
    const recentEnergy = recent.slice(0, 4).map((s) => s.energy);
    const declining = recentEnergy.every((v, i, arr) => i === 0 || v <= arr[i - 1] + 3);
    const droppedTotal = recentEnergy[recentEnergy.length - 1] - recentEnergy[0];
    if (declining && droppedTotal < -15) {
      notes.push({
        icon: 'warning',
        text: 'Energy is on a clear downward slope across your last few sessions. This is the 7–14 day burnout window — protect sleep and cut one non-essential commitment this week.',
      });
    }
  }

  // Cap at 3 to avoid wall of text
  return notes.slice(0, 3);
}

/**
 * Before → after for a live call: the voice sample against the end of the
 * call. Reflect could only ever show one moment; this is what a conversation
 * adds — whether talking it through moved anything.
 */
function ShiftCard({ shift }: { shift: CallShift }) {
  const rows: { label: string; start: number; end: number; goodWhen: 'up' | 'down' }[] = [
    { label: 'Mood', start: shift.start_mood, end: shift.end_mood, goodWhen: 'up' },
    { label: 'Stress', start: shift.start_stress, end: shift.end_stress, goodWhen: 'down' },
  ];

  return (
    <Card style={{ marginTop: 14, marginBottom: 0 }}>
      <CardTitle icon="trending-up">Before &amp; After Your Call</CardTitle>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {rows.map((row) => {
          const delta = row.end - row.start;
          const flat = Math.abs(delta) < 3;
          const good = (delta > 0 && row.goodWhen === 'up') || (delta < 0 && row.goodWhen === 'down');
          const color = flat ? COLORS.textMuted : good ? COLORS.success : COLORS.danger;
          return (
            <div
              key={row.label}
              style={{
                background: 'rgba(17, 17, 24, 0.025)',
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 12,
                padding: '12px 14px',
              }}
            >
              <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{row.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: COLORS.textSecondary }}>{row.start}</span>
                <span style={{ fontSize: 13, color: COLORS.textMuted }}>→</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>{row.end}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color }}>
                  {flat ? 'steady' : `${delta > 0 ? '+' : ''}${delta}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {shift.note && (
        <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginTop: 12 }}>
          {shift.note}
        </div>
      )}
    </Card>
  );
}
