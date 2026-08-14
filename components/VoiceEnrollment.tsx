'use client';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import {
  MIN_ENROLLMENT_SECONDS,
  deleteEnrollment,
  getEnrollment,
  uploadEnrollment,
  type VoiceEnrollment as Enrollment,
} from '@/lib/audioStorage';

/**
 * I-1: record a voice sample of at least 10 seconds during setup.
 * I-2: re-record at any time from settings; the new sample replaces the old.
 * N-4: delete the sample from within the product.
 *
 * The sample exists so the Intent Detector can tell which voice in a recording
 * belongs to the user. It is not authentication and must never be described as
 * such — a few seconds of anyone's voice is enough to clone it, so this
 * identifies a speaker in a conversation, it does not prove who they are.
 */

const MAX_SECONDS = 30;

/**
 * Something to read aloud.
 *
 * Enrollment fails in a specific way when people do not know what to say: they
 * record ten seconds of "um... testing... is this working". That is a poor
 * voiceprint — hesitant, quiet, unlike how they normally speak. A sentence to
 * read produces natural, connected speech.
 */
const PROMPT_TEXT =
  "I'm recording this so the app can recognise my voice later. " +
  'I usually speak at about this pace, and this is roughly how I sound ' +
  'when I am talking normally to someone I know.';

type Phase = 'loading' | 'idle' | 'recording' | 'review' | 'saving';

export function VoiceEnrollment({ onChange }: { onChange?: () => void } = {}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Held until the upload is confirmed. Losing this on a failed save would
  // mean asking the user to record all over again for no reason.
  const pendingRef = useRef<{ blob: Blob; seconds: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const recorder = useAudioRecorder({ maxSeconds: MAX_SECONDS });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await getEnrollment();
        if (!cancelled) setEnrollment(existing);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setPhase('idle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const longEnough = recorder.seconds >= MIN_ENROLLMENT_SECONDS;
  const remaining = Math.max(0, MIN_ENROLLMENT_SECONDS - recorder.seconds);

  const startRecording = async () => {
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    pendingRef.current = null;
    setPhase('recording');
    await recorder.start();
  };

  const stopRecording = async () => {
    const result = await recorder.stop();
    if (!result?.blob) {
      setError('Nothing was recorded. Please try again.');
      setPhase('idle');
      return;
    }
    pendingRef.current = { blob: result.blob, seconds: result.durationSeconds };
    setPreviewUrl(URL.createObjectURL(result.blob));
    setPhase('review');
  };

  const discard = async () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    pendingRef.current = null;
    setError(null);
    setPhase('idle');
  };

  const save = async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    setPhase('saving');
    setError(null);
    try {
      const saved = await uploadEnrollment(pending.blob, pending.seconds);
      setEnrollment(saved);
      // Only discard the blob once the upload is confirmed.
      pendingRef.current = null;
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPhase('idle');
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
      // Back to review, not idle — the recording is still held and retryable.
      setPhase('review');
    }
  };

  const remove = async () => {
    if (!confirm('Delete your voice sample? The Intent Detector will not be able to tell which voice is yours until you record a new one.')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteEnrollment();
      setEnrollment(null);
      onChange?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: 22,
            height: 22,
            border: `2px solid ${COLORS.cardBorder}`,
            borderTopColor: COLORS.blue,
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0 2px' }}>
      {phase === 'idle' && enrollment && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: COLORS.success + '14',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name="check" size={16} color={COLORS.success} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
              Voice sample saved
            </div>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
              {Math.round(enrollment.duration_seconds)} seconds ·{' '}
              {new Date(enrollment.updated_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}

      {phase === 'idle' && !enrollment && (
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.6,
            color: COLORS.textSecondary,
            marginBottom: 12,
          }}
        >
          Record {MIN_ENROLLMENT_SECONDS} seconds or more of your voice so the
          Intent Detector can tell which side of a conversation is yours.
        </p>
      )}

      {phase === 'recording' && (
        <div
          style={{
            border: `1px solid ${COLORS.blue}40`,
            background: COLORS.blue + '08',
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                background: COLORS.danger,
                animation: 'pulse 1.2s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
              {recorder.seconds}s
            </span>
            <span style={{ fontSize: 12, color: COLORS.textMuted }}>
              {longEnough ? 'Long enough — stop whenever you like' : `${remaining}s more needed`}
            </span>
          </div>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: COLORS.textSecondary, fontStyle: 'italic' }}>
            &ldquo;{PROMPT_TEXT}&rdquo;
          </p>
        </div>
      )}

      {phase === 'review' && previewUrl && (
        <div
          style={{
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 12,
            padding: '14px 16px',
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
            Have a listen before saving
          </div>
          <audio src={previewUrl} controls style={{ width: '100%' }} />
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            color: COLORS.danger,
            marginBottom: 10,
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {phase === 'idle' && (
          <>
            <ActionButton onClick={startRecording} primary>
              {enrollment ? 'Re-record' : 'Record voice sample'}
            </ActionButton>
            {enrollment && (
              <ActionButton onClick={remove} danger disabled={busy}>
                {busy ? 'Deleting…' : 'Delete'}
              </ActionButton>
            )}
          </>
        )}

        {phase === 'recording' && (
          <>
            <ActionButton onClick={stopRecording} primary disabled={!longEnough}>
              {longEnough ? 'Stop and review' : `Keep talking… ${remaining}s`}
            </ActionButton>
            <ActionButton
              onClick={async () => {
                await recorder.cancel();
                setPhase('idle');
              }}
            >
              Cancel
            </ActionButton>
          </>
        )}

        {phase === 'review' && (
          <>
            <ActionButton onClick={save} primary>
              Save this sample
            </ActionButton>
            <ActionButton onClick={discard}>Record again</ActionButton>
          </>
        )}

        {phase === 'saving' && <ActionButton onClick={() => {}} primary disabled>Saving…</ActionButton>}
      </div>

      {recorder.error && (
        <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 10 }}>
          {recorder.error}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        border: primary ? 'none' : `1px solid ${danger ? COLORS.danger + '55' : COLORS.cardBorder}`,
        background: primary
          ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
          : 'transparent',
        color: primary ? COLORS.white : danger ? COLORS.danger : COLORS.textSecondary,
      }}
    >
      {children}
    </button>
  );
}
