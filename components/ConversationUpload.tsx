'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';
import {
  AudioSplitError,
  MAX_INPUT_SECONDS,
  MIN_INPUT_SECONDS,
  looksLikeAudio,
  splitConversation,
  type AudioChunk,
} from '@/lib/audioSplit';
import { useAudioRecorder, type RecordingResult } from '@/hooks/useAudioRecorder';
import {
  cachePendingRecording,
  clearPendingRecording,
  getPendingRecording,
} from '@/lib/recordingCache';
import {
  startProcessing,
  uploadRecordingSegments,
  type IntentSession,
} from '@/lib/audioStorage';

/**
 * Captures a conversation, by recording it here or by uploading a file.
 *
 * Recording is the primary path. The Intent Detector is for a conversation you
 * are in — a date, an interview — and asking someone to record on their phone,
 * transfer the file, and then upload it puts three steps between the moment and
 * the product. Upload stays for audio that already exists, or was captured on a
 * better microphone than the device they are sitting at.
 *
 * Both routes converge immediately: splitConversation takes any Blob, so a
 * recording and a file become the same list of chunks and share every line
 * after that.
 *
 * N-3 applies to both, and matters more for recording. An upload that fails
 * halfway sends someone back to a file they still have; a recording that fails
 * halfway is a conversation that cannot happen twice. Prepared chunks go to
 * IndexedDB before any network call and are cleared only once storage confirms
 * them.
 */

type Phase = 'idle' | 'recording' | 'preparing' | 'uploading' | 'failed' | 'done';

function clock(total: number): string {
  const m = Math.floor(total / 60);
  const sec = Math.floor(total % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export function ConversationUpload({
  session,
  onUploaded,
}: {
  session: IntentSession;
  onUploaded: (updated: IntentSession) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<{ count: number; done: number } | null>(null);
  const [uploaded, setUploaded] = useState<{ done: number; total: number } | null>(null);
  const [recovered, setRecovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Held until storage confirms every chunk.
  const pendingRef = useRef<
    { blob: Blob; mimeType: string; durationSeconds: number }[] | null
  >(null);

  const attemptUpload = useCallback(
    async (segments: { blob: Blob; mimeType: string; durationSeconds: number }[]) => {
      setPhase('uploading');
      setError(null);
      setUploaded({ done: 0, total: segments.length });
      try {
        const updated = await uploadRecordingSegments({
          sessionId: session.id,
          segments,
          onProgress: (done, total) => setUploaded({ done, total }),
        });
        await clearPendingRecording(session.id);
        pendingRef.current = null;
        setPhase('done');
        onUploaded(updated);

        void startProcessing(session.id).catch((e) =>
          console.error('[upload] could not start processing:', e)
        );
      } catch (e) {
        setError((e as Error).message);
        setPhase('failed');
      }
    },
    [session.id, onUploaded]
  );

  // Anything left behind by an interrupted visit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await getPendingRecording(session.id);
      if (cancelled || !cached) return;
      pendingRef.current = cached.segments;
      setRecovered(true);
      setPhase('failed');
      setError('A file you selected earlier was never uploaded. It is still here.');
    })();
    return () => {
      cancelled = true;
    };
  }, [session.id]);

  /**
   * Everything after "we have audio", shared by both routes.
   *
   * `label` is only what the preparing screen shows — a filename, or a plain
   * description of the recording. Nothing downstream reads it.
   */
  const prepareAndUpload = async (source: Blob, label: string) => {
    setError(null);
    setFileName(label);
    setPhase('preparing');
    setPrepared({ count: 0, done: 0 });

    let chunks: AudioChunk[];
    try {
      const result = await splitConversation(source, {
        onProgress: (done, total) => setPrepared({ count: total, done }),
      });
      chunks = result.chunks;
    } catch (e) {
      setError(
        e instanceof AudioSplitError
          ? e.message
          : `Could not prepare that file: ${(e as Error).message}`
      );
      setPhase('idle');
      return;
    }

    const segments = chunks.map((c) => ({
      blob: c.blob,
      mimeType: c.mimeType,
      durationSeconds: c.durationSeconds,
    }));
    pendingRef.current = segments;

    // Cached before the first network call, for the same reason as everywhere
    // else: the user may not be able to produce this audio a second time.
    await cachePendingRecording({ sessionId: session.id, segments });

    await attemptUpload(segments);
  };

  const handleFile = async (file: File) => {
    if (!looksLikeAudio(file)) {
      setError('That does not look like an audio file. Try an mp3, m4a, wav or webm.');
      return;
    }
    await prepareAndUpload(file, file.name);
  };

  // skipBase64: the check-in path posts audio as base64 JSON and needs it. This
  // one hands the Blob to splitConversation and never looks at it, and a
  // 20-minute recording would become a multi-megabyte string built to be thrown
  // away.
  const finishRecording = async (result: RecordingResult | null) => {
    if (!result?.blob) {
      setError('Nothing was recorded. Check the microphone and try again.');
      setPhase('idle');
      return;
    }
    await prepareAndUpload(result.blob, `Recording · ${clock(result.durationSeconds)}`);
  };

  const recorder = useAudioRecorder({
    maxSeconds: MAX_INPUT_SECONDS,
    skipBase64: true,
    // Manual stops resolve recorder.stop() below. This callback handles the
    // recorder's automatic stop at MAX_INPUT_SECONDS so that recording is not
    // silently discarded at the advertised ceiling.
    onComplete: (result) => void finishRecording(result),
  });

  const startRecording = async () => {
    setError(null);
    setFileName(null);
    setPhase('recording');
    const started = await recorder.start();
    if (!started) {
      setError('Could not start recording. Allow microphone access and try again.');
      setPhase('idle');
    }
  };

  const stopRecording = async () => {
    const result = await recorder.stop();
    await finishRecording(result);
  };

  const cancelRecording = async () => {
    await recorder.cancel();
    setPhase('idle');
  };

  const retry = async () => {
    const pending = pendingRef.current;
    if (!pending?.length) {
      setError('That file is no longer available. Please choose it again.');
      setPhase('idle');
      return;
    }
    await attemptUpload(pending);
  };

  const discard = async () => {
    await clearPendingRecording(session.id);
    pendingRef.current = null;
    setError(null);
    setRecovered(false);
    setFileName(null);
    setPhase('idle');
  };

  return (
    <div>
      {phase === 'idle' && (
        <>
          {/*
            Record first, and visually dominant. The product is for a
            conversation the user is part of; recording it here is the direct
            route, and uploading is the fallback for audio that already exists.
          */}
          <div
            style={{
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 16,
              padding: '26px 22px',
              textAlign: 'center',
              background: COLORS.card,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.textPrimary,
                marginBottom: 6,
                fontFamily: 'var(--font-syne)',
              }}
            >
              Record the conversation
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
              Put the phone or laptop between you both and start when you are
              ready.
            </p>
            <Button onClick={startRecording} primary>
              Start recording
            </Button>
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 12, lineHeight: 1.6 }}>
              At least {MIN_INPUT_SECONDS} seconds, up to {MAX_INPUT_SECONDS / 60} minutes
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '4px 0 12px',
              color: COLORS.textMuted,
              fontSize: 11.5,
            }}
          >
            <span style={{ flex: 1, height: 1, background: COLORS.cardBorder }} />
            or use audio you already have
            <span style={{ flex: 1, height: 1, background: COLORS.cardBorder }} />
          </div>

          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            style={{
              border: `1.5px dashed ${COLORS.cardBorder}`,
              borderRadius: 16,
              padding: '22px 22px',
              textAlign: 'center',
              cursor: 'pointer',
              background: COLORS.card,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.textPrimary,
                marginBottom: 6,
                fontFamily: 'var(--font-syne)',
              }}
            >
              Upload a file
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
              Drop it here, or tap to browse.
            </p>
            <p style={{ fontSize: 11.5, color: COLORS.textMuted, marginTop: 8, lineHeight: 1.6 }}>
              mp3, m4a, wav or webm · at least 20 seconds
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
          />
        </>
      )}

      {phase === 'recording' && (
        <div
          style={{
            border: `1px solid ${COLORS.blue}40`,
            background: COLORS.blue + '08',
            borderRadius: 16,
            padding: '24px 22px',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: COLORS.danger,
                animation: 'pulse 1.2s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: COLORS.textPrimary,
                fontFamily: 'var(--font-syne)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {clock(recorder.seconds)}
            </span>
          </div>
          <p style={{ fontSize: 12.5, color: COLORS.textMuted, lineHeight: 1.6, marginBottom: 16 }}>
            {recorder.seconds < MIN_INPUT_SECONDS
              ? `${MIN_INPUT_SECONDS - recorder.seconds}s more before this is long enough to separate two voices`
              : 'Stop whenever the conversation ends. Keep this tab open.'}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button onClick={stopRecording} primary disabled={recorder.seconds < MIN_INPUT_SECONDS}>
              {recorder.seconds < MIN_INPUT_SECONDS ? 'Keep going…' : 'Stop and upload'}
            </Button>
            <Button onClick={cancelRecording}>Cancel</Button>
          </div>
          {recorder.error && (
            <p style={{ fontSize: 12, color: COLORS.danger, marginTop: 12 }}>{recorder.error}</p>
          )}
        </div>
      )}

      {phase === 'preparing' && (
        <Panel>
          <Spinner />
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginTop: 12 }}>
            Preparing {fileName ?? 'your recording'}
          </div>
          <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 5, lineHeight: 1.55 }}>
            {prepared?.count
              ? `Splitting into parts so it can be processed quickly — ${prepared.done} of ${prepared.count}`
              : 'Reading the audio…'}
          </p>
        </Panel>
      )}

      {phase === 'uploading' && (
        <Panel>
          <Spinner />
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginTop: 12 }}>
            {uploaded && uploaded.total > 1
              ? `Uploading part ${Math.min(uploaded.done + 1, uploaded.total)} of ${uploaded.total}`
              : 'Uploading'}
          </div>
          <p style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 5, lineHeight: 1.55 }}>
            Saved on this device, so it is safe even if this fails.
          </p>
        </Panel>
      )}

      {phase === 'failed' && (
        <div
          style={{
            border: `1px solid ${recovered ? COLORS.cardBorder : COLORS.danger + '44'}`,
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
            {recovered ? 'You have an unsent recording' : 'Upload did not complete'}
          </div>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 16 }}>
            {error}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button onClick={retry} primary>
              Try again
            </Button>
            <Button onClick={discard}>Start over</Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div
          style={{
            border: `1px solid ${COLORS.success}44`,
            background: COLORS.success + '08',
            borderRadius: 16,
            padding: '22px 20px',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: COLORS.textPrimary,
              marginBottom: 6,
              fontFamily: 'var(--font-syne)',
            }}
          >
            Uploaded
          </div>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 14 }}>
            We are separating the voices now. This takes a couple of minutes and
            carries on whether you stay here or not.
          </p>
          <a
            href={`/intent/${session.id}`}
            style={{
              display: 'inline-block',
              padding: '11px 20px',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              fontSize: 13,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Follow progress
          </a>
        </div>
      )}

      {error && phase === 'idle' && (
        <div
          style={{
            marginTop: 12,
            padding: '11px 14px',
            borderRadius: 12,
            background: COLORS.danger + '10',
            border: `1px solid ${COLORS.danger}33`,
            color: COLORS.danger,
            fontSize: 12.5,
            lineHeight: 1.55,
          }}
        >
          {error}
        </div>
      )}

    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 16,
        padding: '28px 20px',
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        margin: '0 auto',
        border: `3px solid ${COLORS.cardBorder}`,
        borderTopColor: COLORS.blue,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }}
    />
  );
}

function Button({
  children,
  onClick,
  primary,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '11px 20px',
        borderRadius: 12,
        border: primary ? 'none' : `1px solid ${COLORS.cardBorder}`,
        background: primary
          ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
          : 'transparent',
        color: primary ? COLORS.white : COLORS.textSecondary,
        fontSize: 13,
        fontWeight: 700,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
