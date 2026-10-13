'use client';
import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { WaveformVisualizer } from '@/components/WaveformVisualizer';
import { useAudioRecorder, type RecordingResult } from '@/hooks/useAudioRecorder';
import { extractAcousticFeatures, type AcousticFeatures } from '@/lib/audioFeatures';
import { InsufficientCallError, readVoiceSample, type VoiceSampleRead } from '@/lib/ai';

/**
 * The short voice note recorded before a call on /live.
 *
 * Why it exists: a call alone gives the analysis captions and a noisy clip of
 * the user's voice. This gives it what Reflect had — a clean recording, Freya
 * silent, the same task every day — so tone is read reliably, days compare
 * fairly, and the results can show how the call moved the user.
 *
 * Its quick read also gives Freya her opening, and its transcript is screened
 * before the call starts, exactly as a spoken turn in the call would be.
 */

export const SAMPLE_MIN_SECONDS = 10;
export const SAMPLE_MAX_SECONDS = 45;

export type PreparedSample = {
  audio: RecordingResult;
  features?: AcousticFeatures;
  /** Null if the quick read failed; the call and the final analysis still use the audio. */
  read: VoiceSampleRead | null;
  blobUrl: string;
};

type Props = {
  disabledReason?: string;
  /** Screens the transcript. Returns false when the call must not go ahead. */
  onScreen: (text: string) => Promise<boolean>;
  onReady: (sample: PreparedSample) => void;
  onSkip: () => void;
};

export function VoiceSampleStep({ disabledReason, onScreen, onReady, onSkip }: Props) {
  const [processing, setProcessing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const handleRecording = async (audio: RecordingResult | null) => {
    if (!audio) return;
    if (audio.durationSeconds < SAMPLE_MIN_SECONDS) {
      setNote(`Keep going a little longer — at least ${SAMPLE_MIN_SECONDS} seconds helps Freya hear you properly.`);
      return;
    }

    setProcessing(true);
    setNote(null);
    let features: AcousticFeatures | undefined;
    try {
      features = await extractAcousticFeatures(audio.blob);
    } catch (err) {
      console.warn('[voice-sample] acoustic extraction failed:', err);
    }

    let read: VoiceSampleRead | null = null;
    try {
      read = await readVoiceSample(audio);
    } catch (err) {
      if (err instanceof InsufficientCallError) {
        setProcessing(false);
        setNote(err.message);
        return;
      }
      // The quick read is a nicety. The final analysis hears this audio again.
      console.warn('[voice-sample] quick read failed:', err);
    }

    if (read?.transcript) {
      const mayContinue = await onScreen(read.transcript);
      if (!mayContinue) {
        setProcessing(false);
        return;
      }
    }

    setProcessing(false);
    onReady({ audio, features, read, blobUrl: URL.createObjectURL(audio.blob) });
  };

  const { isRecording, seconds, start, stop, cancel, error, stream } = useAudioRecorder({
    maxSeconds: SAMPLE_MAX_SECONDS,
    onComplete: handleRecording,
  });

  useEffect(() => () => void cancel(), [cancel]);

  const handleMain = async () => {
    if (isRecording) {
      const audio = await stop();
      await handleRecording(audio);
    } else {
      setNote(null);
      await start();
    }
  };

  const remaining = SAMPLE_MAX_SECONDS - seconds;
  const canStop = seconds >= SAMPLE_MIN_SECONDS;

  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 24,
        padding: '26px 22px',
        textAlign: 'center',
      }}
    >
      {/* Voice Icon / Visualizer at Top */}
      <div style={{ height: 60, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {processing ? (
          <div className="animate-pulse-soft" style={{ display: 'inline-flex' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(37, 99, 235, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="mic" size={26} color={COLORS.blue} />
            </div>
          </div>
        ) : isRecording && stream ? (
          <WaveformVisualizer active stream={stream} />
        ) : (
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'rgba(37, 99, 235, 0.08)',
              border: `1px solid ${COLORS.cardBorder}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="mic" size={26} color={COLORS.blue} />
          </div>
        )}
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        Step 1 of 2 · Voice note
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.4px', marginTop: 8 }}>
        How are you feeling right now?
      </div>
      <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginTop: 6, maxWidth: 420, marginInline: 'auto' }}>
        Talk about your day and what&apos;s on your mind.
        Freya listens to how you sound as well as what you say, opens the call with it, and
        compares it with how you feel by the end.
      </div>

      {processing ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
            Freya is listening to your voice note...
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 20 }}>
          {isRecording && (
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
              {seconds}s · {canStop ? `up to ${remaining}s more` : `${SAMPLE_MIN_SECONDS - seconds}s until you can finish`}
            </div>
          )}

          <button
            type="button"
            onClick={handleMain}
            disabled={(!isRecording && !!disabledReason) || (isRecording && !canStop)}
            style={{
              background: isRecording
                ? COLORS.danger
                : `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              border: 'none',
              borderRadius: 999,
              padding: '13px 26px',
              fontSize: 14,
              fontWeight: 800,
              cursor: (!isRecording && disabledReason) || (isRecording && !canStop) ? 'not-allowed' : 'pointer',
              opacity: (!isRecording && disabledReason) || (isRecording && !canStop) ? 0.55 : 1,
            }}
          >
            {isRecording ? 'Done — continue to call' : 'Record voice note'}
          </button>

          {!isRecording && disabledReason && (
            <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 10 }}>{disabledReason}</div>
          )}
        </div>
      )}

      {(note || error) && (
        <div style={{ fontSize: 12.5, color: COLORS.warning, marginTop: 12, lineHeight: 1.5 }}>{note || error}</div>
      )}

      {!isRecording && !processing && (
        <button
          type="button"
          onClick={onSkip}
          style={{
            display: 'block',
            margin: '16px auto 0',
            background: 'none',
            border: 'none',
            color: COLORS.textMuted,
            fontSize: 12.5,
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Skip and call now (results will be less precise)
        </button>
      )}
    </div>
  );
}
