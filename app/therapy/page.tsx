'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/GradientButton';
import { MetricBar } from '@/components/MetricBar';
import { CircularProgress } from '@/components/CircularProgress';
import { WaveformVisualizer } from '@/components/WaveformVisualizer';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { useAudioRecorder, type RecordingResult } from '@/hooks/useAudioRecorder';
import {
  analyzeMood,
  buildUserContext,
  getRecentTherapySessions,
  type AnalysisResult,
  type TherapySession,
} from '@/lib/ai';

const PACE_LABEL: Record<string, string> = { Slow: 'Slow', Normal: 'Normal', Fast: 'Fast' };

type Phase = 'record' | 'analyzing' | 'results';

function labelForMood(score: number) {
  if (score >= 80) return 'Great';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Okay';
  if (score >= 35) return 'Slightly Low';
  return 'Low';
}

function TherapyInner() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('record');
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [previousSession, setPreviousSession] = useState<TherapySession | null>(null);
  const recentSessionsRef = useRef<TherapySession[]>([]);

  // Pre-load recent history once so we can pass context to analyze + show comparison.
  useEffect(() => {
    getRecentTherapySessions(14)
      .then((s) => {
        recentSessionsRef.current = s;
        setPreviousSession(s[0] ?? null);
      })
      .catch(() => {
        recentSessionsRef.current = [];
      });
  }, []);

  const processAudio = useCallback(
    async (audio: RecordingResult | null) => {
      if (!audio) return;
      setPhase('analyzing');
      try {
        const userContext = buildUserContext(recentSessionsRef.current);
        const data = await analyzeMood({
          audioBase64: audio.base64,
          mimeType: audio.mimeType,
          durationSeconds: audio.durationSeconds,
          userContext,
        });
        setResults(data);
        setPhase('results');
      } catch (e) {
        setAnalyzeErr((e as Error).message || 'Analysis failed.');
        setPhase('record');
      }
    },
    []
  );

  const { isRecording, seconds, start, stop, cancel, error, stream } = useAudioRecorder({
    maxSeconds: 60,
    onComplete: processAudio,
  });

  useEffect(() => {
    if (error) alert(error);
  }, [error]);

  const handleStart = async () => {
    setAnalyzeErr(null);
    await start();
  };

  const handleStop = async () => {
    if (seconds < 3) {
      await cancel();
      alert('Please record at least 3 seconds.');
      return;
    }
    const audio = await stop();
    if (!audio) return;
    await processAudio(audio);
  };

  if (phase === 'results' && results) {
    const moodLabel = labelForMood(results.mood_score);
    return (
      <AppShell title="Analysis Results" subtitle="Your voice, decoded">
        <MedicalDisclaimer />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 24,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.6px' }}>
              Your check-in is in
            </div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
              Mood score, energy, stress and insight — all from your voice.
            </div>
          </div>
          <button
            onClick={() => setPhase('record')}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              border: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.textPrimary,
              fontSize: 13,
              fontWeight: 700,
              background: COLORS.card,
            }}
          >
            New recording
          </button>
        </div>

        {(results.transcript || results.emotional_mirror) && (
          <div
            style={{
              background: `linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(14, 165, 233, 0.06))`,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 18,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Icon name="mic" size={16} color={COLORS.blue} />
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: COLORS.blue,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6,
                }}
              >
                Reveal Voice AI
              </span>
            </div>

            {results.transcript && (
              <div style={{ marginBottom: results.emotional_mirror ? 14 : 0 }}>
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  What we heard you say
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: COLORS.textPrimary,
                    lineHeight: 1.6,
                    fontStyle: 'italic',
                  }}
                >
                  &ldquo;{results.transcript}&rdquo;
                </div>
              </div>
            )}

            {results.emotional_mirror && (
              <div
                style={{
                  paddingTop: results.transcript ? 14 : 0,
                  borderTop: results.transcript ? `1px solid ${COLORS.cardBorder}` : 'none',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    color: COLORS.textMuted,
                    marginBottom: 4,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  How your voice sounded
                </div>
                <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  {results.emotional_mirror}
                </div>
              </div>
            )}
          </div>
        )}

        <Grid cols={2} gap={14}>
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 0 }}>
            <CircularProgress
              value={results.mood_score}
              size={170}
              label="Mood Score"
              sublabel={moodLabel}
              color={COLORS.green}
            />
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <CardTitle>Breakdown</CardTitle>
            <MetricBar label="Energy Level" value={results.energy} color={COLORS.blue} />
            <MetricBar label="Stress Level" value={results.stress} color={COLORS.danger} />
            <MetricBar label="Positivity" value={results.positivity} color={COLORS.green} />
            <MetricBar label="Confidence" value={results.confidence} color={COLORS.blue} />
            <InlineRow label="Pace" value={PACE_LABEL[results.pace] ?? results.pace} />
            <InlineRow label="Detected mode" value={results.detected_mode} />
          </Card>
        </Grid>

        {previousSession && (
          <div style={{ marginTop: 14 }}>
            <ComparisonCard current={results} previous={previousSession} />
          </div>
        )}

        <PersonalNoteCard
          current={results}
          recentSessions={recentSessionsRef.current}
        />

        <Card style={{ marginBottom: 0, marginTop: 14 }}>
          <CardTitle icon="bulb">AI Insight</CardTitle>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            {results.insight}
          </div>
        </Card>
        <div style={{ height: 14 }} />

        <Grid cols={2} gap={14}>
          <Card style={{ marginBottom: 0 }}>
            <CardTitle icon="checkmark">Recommendations</CardTitle>
            {(results.tips ?? []).map((tip, i) => (
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

          {results.daily_prompt ? (
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
                {results.daily_prompt}
              </div>
            </div>
          ) : (
            <Card style={{ marginBottom: 0 }}>
              <CardTitle>Next Step</CardTitle>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                Talk to your AI coach about anything that came up, or view how today fits into
                your weekly trend.
              </div>
            </Card>
          )}
        </Grid>

        <Grid cols={2} gap={14}>
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
              gap: 10,
              width: '100%',
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              borderRadius: 16,
              padding: '15px 18px',
              color: COLORS.white,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            <Icon name="chat" size={18} color={COLORS.white} />
            Talk to AI Coach
          </button>

          <SecondaryButton
            title="View My Trends"
            onClick={() => router.push('/trends')}
            icon={<Icon name="trending-up" size={18} color={COLORS.textPrimary} />}
            style={{ borderRadius: 16 }}
          />
        </Grid>
      </AppShell>
    );
  }

  if (phase === 'analyzing') {
    return (
      <AppShell title="Reflect" subtitle="Analyzing your voice">
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="animate-pulse-soft">
            <Logo size={38} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginTop: 32, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
            Analyzing your voice...
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}>
            Detecting tone, pace, energy &amp; emotions
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Reflect" subtitle="Record 60 seconds — we listen to your voice">
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 24,
          padding: '52px 24px 44px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: 'calc(100vh - 180px)',
          justifyContent: 'center',
        }}
      >
        {/* Status text */}
        <div
          style={{
            fontSize: 15,
            color: COLORS.textSecondary,
            textAlign: 'center',
            lineHeight: 1.65,
            marginBottom: 48,
            maxWidth: 400,
          }}
        >
          {isRecording ? (
            <>Speak freely — anything on your mind.<br />We&apos;ll stop automatically at 60 seconds.</>
          ) : (
            <>Talk about how you&apos;re feeling today.<br />Anything on your mind.</>
          )}
        </div>

        {/* Mic button with pulse rings */}
        <div style={{ position: 'relative', marginBottom: 32 }}>
          {isRecording && (
            <>
              <div className="recording-ring" />
              <div className="recording-ring-2" />
            </>
          )}
          <button
            onClick={isRecording ? handleStop : handleStart}
            style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              border: `2.5px solid ${isRecording ? COLORS.danger : COLORS.blue}`,
              background: isRecording
                ? `radial-gradient(circle, ${COLORS.danger}18 0%, ${COLORS.danger}08 100%)`
                : `radial-gradient(circle, rgba(37,99,235,0.07) 0%, transparent 70%)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'border-color 0.2s, background 0.2s',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <Icon
              name={isRecording ? 'stop' : 'mic'}
              size={52}
              color={isRecording ? COLORS.danger : COLORS.blue}
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: isRecording ? COLORS.danger : COLORS.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isRecording ? 'Stop' : 'Tap to start'}
            </span>
          </button>
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-1px', lineHeight: 1 }}>
            {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
          </span>
          <span style={{ fontSize: 16, fontWeight: 400, color: COLORS.textMuted }}>
            {' / 1:00'}
          </span>
        </div>

        {/* Status label */}
        <div
          style={{
            fontSize: 13,
            color: isRecording ? COLORS.danger : COLORS.textMuted,
            textAlign: 'center',
            marginBottom: 32,
            fontWeight: isRecording ? 600 : 400,
          }}
        >
          {isRecording ? '● Recording in progress' : 'Tap the mic to start recording'}
        </div>

        {analyzeErr && (
          <div style={{ marginBottom: 16, color: COLORS.danger, fontSize: 13, textAlign: 'center' }}>
            {analyzeErr}
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 340 }}>
          <WaveformVisualizer active={isRecording} barCount={35} stream={stream} />
        </div>
      </div>
    </AppShell>
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
        text: `Your last few sessions have all been "${current.detected_mode}" — there's a clear pattern. Worth sharing with your AI Coach to dig into what's driving it.`,
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

export default function TherapyPage() {
  return (
    <AuthGuard>
      <TherapyInner />
    </AuthGuard>
  );
}
