'use client';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { decodeContext } from '@/lib/audioTrim';
import {
  MIN_ENROLLMENT_SECONDS,
  deleteEnrollment,
  getEnrollment,
  uploadEnrollment,
  type VoiceEnrollment as Enrollment,
} from '@/lib/audioStorage';

/**
 * I-1: provide a voice sample of at least 10 seconds during setup, by recording
 *      it here or uploading one.
 * I-2: replace it at any time from settings; the new sample replaces the old.
 * N-4: delete the sample from within the product.
 *
 * The sample exists so the Intent Detector can tell which voice in a recording
 * belongs to the user. It is not authentication and must never be described as
 * such — a few seconds of anyone's voice is enough to clone it, so this
 * identifies a speaker in a conversation, it does not prove who they are.
 */

const MAX_SECONDS = 30;

/**
 * Ceiling on an uploaded sample.
 *
 * Only the best 8 seconds of it ever become the reference clip
 * (buildReferenceClip), so a longer file buys nothing and costs storage on
 * every user. Two minutes is well past the point of diminishing returns while
 * still accepting anything someone is likely to reach for.
 */
const MAX_UPLOAD_SECONDS = 120;

/**
 * What decodeAudioData will take. Deliberately the same list the conversation
 * upload accepts — a user who can upload a recording of a conversation and
 * cannot upload a recording of themselves would rightly find that strange.
 */
const ACCEPTED_UPLOAD = 'audio/*,.m4a,.mp3,.wav,.webm,.ogg';

/** Fills in a missing MIME type so the stored file does not get the wrong extension. */
function typedBlob(file: File): Blob {
  if (file.type) return file;
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  const guess: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    ogg: 'audio/ogg',
    webm: 'audio/webm',
  };
  return guess[ext] ? file.slice(0, file.size, guess[ext]) : file;
}

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
  // Set when the pending sample came from a file rather than the microphone,
  // so the review step can say which and offer the right way back. State and
  // not part of pendingRef: this is rendered, and pendingRef deliberately is
  // not, so that holding on to the blob never triggers a re-render.
  const [pendingFile, setPendingFile] = useState<{ name: string; seconds: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    setPendingFile(null);
    setPhase('recording');
    await recorder.start();
  };

  /**
   * I-1 by upload rather than microphone.
   *
   * The requirement says the user provides a voice sample; it does not say the
   * browser has to capture it. Recording in the moment is the better sample and
   * stays the primary action, but it rules out anyone whose usable audio
   * already exists — a voice note, a clip cut from an interview, or a recording
   * made on a better microphone than the laptop they are sitting at.
   *
   * Everything downstream is unchanged: uploadEnrollment decodes whatever it is
   * handed and derives the reference clip itself, so this only has to produce a
   * blob and an honest duration.
   */
  const pickFile = async (file: File) => {
    setError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    pendingRef.current = null;
    setPendingFile(null);
    setBusy(true);

    const blob = typedBlob(file);
    const ctx = decodeContext();
    try {
      // Decoded here rather than trusting the file, for two reasons: it is the
      // only honest way to get a duration, and it fails now — while they are
      // looking at the picker — rather than at save time on a file the browser
      // was never going to be able to read.
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const seconds = decoded.duration;

      if (seconds < MIN_ENROLLMENT_SECONDS) {
        setError(
          `That file is ${seconds.toFixed(1)} seconds. We need at least ` +
            `${MIN_ENROLLMENT_SECONDS} seconds of your voice to recognise it reliably.`
        );
        return;
      }
      if (seconds > MAX_UPLOAD_SECONDS) {
        setError(
          `That file is ${Math.round(seconds / 60)} minutes. Please use a clip of ` +
            `${MAX_UPLOAD_SECONDS / 60} minutes or less — only the clearest few seconds are used anyway.`
        );
        return;
      }

      pendingRef.current = { blob, seconds };
      setPendingFile({ name: file.name, seconds });
      setPreviewUrl(URL.createObjectURL(blob));
      setPhase('review');
    } catch {
      setError(
        'We could not read that file. Try a .wav, .mp3, .m4a, .ogg or .webm ' +
          'recording of just your voice.'
      );
    } finally {
      void ctx.close();
      setBusy(false);
      // Cleared so re-picking the same file after an error still fires onChange.
      if (fileRef.current) fileRef.current.value = '';
    }
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
    setPendingFile(null);
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
      setPendingFile(null);
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
          Intent Detector can tell which side of a conversation is yours, or
          upload a recording you already have.
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
          {pendingFile && (
            <div
              style={{
                fontSize: 11.5,
                color: COLORS.textMuted,
                marginBottom: 8,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {pendingFile.name} · {Math.round(pendingFile.seconds)}s
            </div>
          )}
          <audio src={previewUrl} controls style={{ width: '100%' }} />
          {pendingFile && (
            // Worth saying once, at the point of decision. The sample decides
            // which voice in a conversation is called "you", so a file with two
            // people on it makes every transcript wrong in a way that is hard
            // to spot afterwards.
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, lineHeight: 1.55, marginTop: 8 }}>
              Check this is only you speaking. Anyone else on the recording can
              end up being labelled as you.
            </p>
          )}
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
            <ActionButton onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Reading…' : 'Upload a file'}
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
            <ActionButton onClick={discard}>
              {pendingFile ? 'Choose another' : 'Record again'}
            </ActionButton>
          </>
        )}

        {phase === 'saving' && <ActionButton onClick={() => {}} primary disabled>Saving…</ActionButton>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_UPLOAD}
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickFile(file);
        }}
      />

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
