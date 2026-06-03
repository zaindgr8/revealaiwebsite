'use client';
import { useEffect, useState } from 'react';
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
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { analyzeMood, type AnalysisResult } from '@/lib/ai';

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

  const { isRecording, seconds, start, stop, cancel, error } = useAudioRecorder({
    maxSeconds: 60,
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

    setPhase('analyzing');
    try {
      const data = await analyzeMood({
        audioBase64: audio.base64,
        mimeType: audio.mimeType,
        durationSeconds: audio.durationSeconds,
      });
      setResults(data);
      setPhase('results');
    } catch (e) {
      setAnalyzeErr((e as Error).message || 'Analysis failed.');
      setPhase('record');
    }
  };

  if (phase === 'results' && results) {
    const moodLabel = labelForMood(results.mood_score);
    return (
      <AppShell title="Analysis Results" subtitle="Your voice, decoded">
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
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.white }}>
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
              color: COLORS.white,
              fontSize: 13,
              fontWeight: 700,
              background: COLORS.card,
            }}
          >
            New recording
          </button>
        </div>

        <Grid cols={2}>
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <CircularProgress
              value={results.mood_score}
              size={170}
              label="Mood Score"
              sublabel={moodLabel}
              color={COLORS.green}
            />
          </Card>

          <Card>
            <CardTitle>Breakdown</CardTitle>
            <MetricBar label="Energy Level" value={results.energy} color={COLORS.blue} />
            <MetricBar label="Stress Level" value={results.stress} color={COLORS.danger} />
            <MetricBar label="Positivity" value={results.positivity} color={COLORS.green} />
            <MetricBar label="Confidence" value={results.confidence} color={COLORS.blue} />
            <InlineRow label="Pace" value={PACE_LABEL[results.pace] ?? results.pace} />
            <InlineRow label="Detected mode" value={results.detected_mode} />
          </Card>
        </Grid>

        <Card>
          <CardTitle>🧠 AI Insight</CardTitle>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            {results.insight}
          </div>
        </Card>

        <Grid cols={2}>
          <Card>
            <CardTitle>💡 Recommendations</CardTitle>
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
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLORS.blue,
                  marginBottom: 8,
                }}
              >
                🎯 Today&apos;s Action
              </div>
              <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                {results.daily_prompt}
              </div>
            </div>
          ) : (
            <Card>
              <CardTitle>Next Step</CardTitle>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                Talk to your AI coach about anything that came up, or view how today fits into
                your weekly trend.
              </div>
            </Card>
          )}
        </Grid>

        <Grid cols={2}>
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
              background: COLORS.blue,
              borderRadius: 18,
              padding: '16px 18px',
              color: COLORS.white,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            <Icon name="chat" size={20} color={COLORS.white} />
            Talk to AI Coach
          </button>

          <SecondaryButton
            title="View My Trends"
            onClick={() => router.push('/trends')}
            icon={<Icon name="trending-up" size={18} color={COLORS.white} />}
          />
        </Grid>
      </AppShell>
    );
  }

  if (phase === 'analyzing') {
    return (
      <AppShell title="Therapy Coach" subtitle="Analyzing your voice">
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
            <Logo size={100} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.white, marginTop: 28 }}>
            Analyzing your voice...
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}>
            Detecting tone, pace, energy & emotions
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Personal Therapy Coach" subtitle="Record 60 seconds — we listen to your voice">
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 24,
          padding: '48px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: 'calc(100vh - 220px)',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: 16,
            color: COLORS.textSecondary,
            textAlign: 'center',
            lineHeight: 1.6,
            marginBottom: 40,
            maxWidth: 480,
          }}
        >
          Talk about how you&apos;re feeling today.
          <br />
          Anything on your mind.
        </div>

        <button
          onClick={isRecording ? handleStop : handleStart}
          style={{
            width: 170,
            height: 170,
            borderRadius: 85,
            border: `3px solid ${isRecording ? COLORS.danger : COLORS.blue}`,
            background: isRecording ? COLORS.danger + '15' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 28,
            transition: 'all 0.2s',
          }}
        >
          <Icon
            name={isRecording ? 'stop' : 'mic'}
            size={56}
            color={isRecording ? COLORS.danger : COLORS.blue}
          />
        </button>

        <div style={{ fontSize: 40, fontWeight: 800, color: COLORS.white, marginBottom: 4 }}>
          0:{seconds.toString().padStart(2, '0')}
          <span style={{ fontSize: 18, fontWeight: 400, color: COLORS.textMuted }}>
            {' / 1:00'}
          </span>
        </div>
        <div
          style={{
            fontSize: 14,
            color: isRecording ? COLORS.danger : COLORS.textSecondary,
          }}
        >
          {isRecording ? 'Recording... tap to stop' : 'Tap the mic to start recording'}
        </div>

        {analyzeErr && (
          <div style={{ marginTop: 16, color: COLORS.danger, fontSize: 13, textAlign: 'center' }}>
            {analyzeErr}
          </div>
        )}

        <div style={{ marginTop: 32, width: '100%', maxWidth: 360 }}>
          <WaveformVisualizer active={isRecording} barCount={35} />
        </div>
      </div>
    </AppShell>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white, marginBottom: 16 }}>
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
          color: COLORS.white,
          textTransform: 'capitalize',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function TherapyPage() {
  return (
    <AuthGuard>
      <TherapyInner />
    </AuthGuard>
  );
}
