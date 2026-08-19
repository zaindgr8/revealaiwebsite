'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';
import {
  AudioSplitError,
  looksLikeAudio,
  splitConversation,
  type AudioChunk,
} from '@/lib/audioSplit';
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
 * Uploads a conversation the user recorded elsewhere.
 *
 * The app does not capture the conversation itself — the user records it on
 * their phone and brings the file. Only the enrolment sample is recorded
 * in-product.
 *
 * N-3 still applies. An upload that fails halfway must not send someone back
 * to a recording they cannot make again, so prepared chunks go to IndexedDB
 * before any network call and are cleared only once storage confirms them.
 */

type Phase = 'idle' | 'preparing' | 'uploading' | 'failed' | 'done';

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

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);

    if (!looksLikeAudio(file)) {
      setError('That does not look like an audio file. Try an mp3, m4a, wav or webm.');
      return;
    }

    setPhase('preparing');
    setPrepared({ count: 0, done: 0 });

    let chunks: AudioChunk[];
    try {
      const result = await splitConversation(file, {
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
              padding: '34px 22px',
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
              Choose your recording
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
              Drop the file here, or tap to browse.
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

      {phase === 'preparing' && (
        <Panel>
          <Spinner />
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginTop: 12 }}>
            Preparing {fileName}
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
            <Button onClick={discard}>Choose a different file</Button>
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
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
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
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
