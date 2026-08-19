'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { ScenarioPicker } from '@/components/ScenarioPicker';
import { ConsentGate } from '@/components/ConsentGate';
import { VoiceEnrollment } from '@/components/VoiceEnrollment';
import { ConversationUpload } from '@/components/ConversationUpload';
import {
  confirmConsent,
  createIntentSession,
  getEnrollment,
  type IntentScenario,
  type IntentSession,
} from '@/lib/audioStorage';

/**
 * Intent Detector setup flow.
 *
 * Order is enforced by the state machine rather than by hiding buttons:
 *
 *   enrol -> scenario (I-3) -> consent (I-4) -> record
 *
 * The recording step is only reachable from a session whose consent timestamp
 * is already stored. I-4 says recording cannot begin without confirmation, and
 * a screen the user could skip past — or refresh out of — would not satisfy
 * that. Consent lives in the database, so a reload lands back in the right
 * place instead of quietly resuming with an unconsented session.
 */

type Step = 'loading' | 'enrol' | 'scenario' | 'consent' | 'ready';

function IntentInner() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('loading');
  const [scenario, setScenario] = useState<IntentScenario | null>(null);
  const [session, setSession] = useState<IntentSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Enrollment first. Without a voice sample the analysis cannot tell
        // which speaker is the user, so there is no point recording anything.
        const enrollment = await getEnrollment();
        if (cancelled) return;
        setStep(enrollment ? 'scenario' : 'enrol');
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setStep('enrol');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const goToConsent = async () => {
    if (!scenario) return;
    setBusy(true);
    setError(null);
    try {
      // I-3: the scenario is stored with the session before anything is recorded.
      const created = await createIntentSession(scenario);
      setSession(created);
      setStep('consent');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onConsent = async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      // I-4: persisted, not held in component state.
      const updated = await confirmConsent(session.id);
      setSession(updated);
      setStep('ready');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const cancelConsent = () => {
    // The session row is left in 'draft'. It has no recording and no consent,
    // so it is inert — and keeping it means a user who backed out once is
    // visible if that ever needs looking at.
    setSession(null);
    setStep('scenario');
  };

  return (
    <AppShell title="Intent Detector" subtitle="Understand how the other person responded">
      <div style={{ maxWidth: 560 }}>
        {error && (
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 12,
              background: COLORS.danger + '10',
              border: `1px solid ${COLORS.danger}33`,
              color: COLORS.danger,
              fontSize: 13,
              marginBottom: 16,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        {step === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <div
              style={{
                width: 28,
                height: 28,
                border: `3px solid ${COLORS.cardBorder}`,
                borderTopColor: COLORS.blue,
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
          </div>
        )}

        {step === 'enrol' && (
          <>
            <StepHeading n={1} of={3} title="First, record your voice" />
            <p style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.textSecondary, marginBottom: 18 }}>
              You only do this once. It lets us tell which side of a
              conversation is yours.
            </p>
            <VoiceEnrollment onChange={() => setStep('scenario')} />
          </>
        )}

        {step === 'scenario' && (
          <>
            <StepHeading n={2} of={3} title="What kind of conversation?" />
            <p style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.textSecondary, marginBottom: 18 }}>
              This changes what we look for. Pick the closest match.
            </p>
            <ScenarioPicker value={scenario} onChange={setScenario} disabled={busy} />
            <button
              onClick={goToConsent}
              disabled={!scenario || busy}
              style={{
                marginTop: 18,
                width: '100%',
                padding: '13px 20px',
                borderRadius: 14,
                border: 'none',
                background:
                  scenario && !busy
                    ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
                    : COLORS.cardBorder,
                color: scenario && !busy ? COLORS.white : COLORS.textMuted,
                fontSize: 14,
                fontWeight: 700,
                cursor: scenario && !busy ? 'pointer' : 'not-allowed',
              }}
            >
              {busy ? 'One moment…' : 'Continue'}
            </button>
          </>
        )}

        {step === 'consent' && (
          <>
            <StepHeading n={3} of={3} title="Before you start" />
            <ConsentGate onConfirm={onConsent} onCancel={cancelConsent} busy={busy} />
          </>
        )}

        {step === 'ready' && session && (
          <>
            <StepHeading n={3} of={3} title="Upload the conversation" />
            <ConversationUpload
              session={session}
              onUploaded={(updated) => setSession(updated)}
            />
            <button
              onClick={() => router.push('/home')}
              style={{
                marginTop: 16,
                padding: '11px 20px',
                borderRadius: 12,
                border: `1px solid ${COLORS.cardBorder}`,
                background: 'transparent',
                color: COLORS.textSecondary,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Back to dashboard
            </button>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StepHeading({ n, of, title }: { n: number; of: number; title: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: 'uppercase',
          color: COLORS.textMuted,
          marginBottom: 6,
        }}
      >
        Step {n} of {of}
      </div>
      <h2
        style={{
          fontSize: 21,
          fontWeight: 800,
          color: COLORS.textPrimary,
          fontFamily: 'var(--font-syne)',
          letterSpacing: '-0.5px',
        }}
      >
        {title}
      </h2>
    </div>
  );
}

export default function IntentPage() {
  return (
    <AuthGuard>
      <IntentInner />
    </AuthGuard>
  );
}
