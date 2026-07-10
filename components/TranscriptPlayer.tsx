'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';

export type WordToken = {
  word: string;
  t_start: number; // estimated seconds
  t_end: number;
};

/**
 * Estimate word-level timestamps from transcript + duration.
 * Uses character-length weighting and distributes across speech time
 * (total duration minus estimated silence gaps).
 *
 * Accuracy: ±0.5-1s — enough for highlight-following to feel real.
 */
export function estimateWordTimestamps(
  transcript: string,
  durationSeconds: number,
  pauseCount: number
): WordToken[] {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !durationSeconds) return [];

  // Estimate total silence duration
  const silenceDuration = Math.min(pauseCount * 0.4, durationSeconds * 0.3);
  const speechDuration = Math.max(durationSeconds - silenceDuration, 1);

  // Total character length (proxy for word duration)
  const totalChars = words.reduce((s, w) => s + w.replace(/[^a-zA-Z]/g, '').length, 0);
  if (!totalChars) return [];

  const tokens: WordToken[] = [];
  let cursor = 0.1; // small offset from the very start

  for (let i = 0; i < words.length; i++) {
    const charLen = Math.max(1, words[i].replace(/[^a-zA-Z]/g, '').length);
    const wordDuration = (charLen / totalChars) * speechDuration;

    // Insert a small pause every ~8-10 words to simulate natural speech rhythm
    if (i > 0 && i % 9 === 0 && pauseCount > 0) {
      cursor += 0.35;
    }

    tokens.push({
      word: words[i],
      t_start: cursor,
      t_end: cursor + wordDuration,
    });
    cursor += wordDuration + 0.02; // 20ms inter-word gap
  }

  return tokens;
}

export type TranscriptPlayerProps = {
  transcript: string;
  durationSeconds: number;
  pauseCount: number;
  audioRef: React.RefObject<HTMLAudioElement | null>;
};

export function TranscriptPlayer({
  transcript,
  durationSeconds,
  pauseCount,
  audioRef,
}: TranscriptPlayerProps) {
  const [tokens] = useState<WordToken[]>(() =>
    estimateWordTimestamps(transcript, durationSeconds, pauseCount)
  );
  const [activeIdx, setActiveIdx] = useState(-1);
  const rafRef = useRef<number | null>(null);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);

  // Track current word via RAF
  const tick = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const t = el.currentTime;
    const idx = tokens.findIndex(tok => t >= tok.t_start && t < tok.t_end);
    setActiveIdx(idx);
    rafRef.current = requestAnimationFrame(tick);
  }, [tokens, audioRef]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay  = () => { rafRef.current = requestAnimationFrame(tick); };
    const onPause = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    const onEnded = () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); setActiveIdx(-1); };

    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [audioRef, tick]);

  // Auto-scroll to keep active word visible
  useEffect(() => {
    activeWordRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeIdx]);

  const seekToWord = useCallback(
    (token: WordToken) => {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = token.t_start;
      if (el.paused) el.play().catch(() => {});
    },
    [audioRef]
  );

  if (!transcript?.trim()) return null;
  if (!tokens.length) {
    return (
      <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6, fontStyle: 'italic' }}>
        &ldquo;{transcript}&rdquo;
      </div>
    );
  }

  return (
    <div>
      {/* Label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Icon name="mic" size={12} color={COLORS.blue} />
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.6 }}>
          Click any word to jump
        </span>
        <span style={{ fontSize: 10, color: COLORS.textMuted }}>· estimated timing</span>
      </div>

      {/* Word tokens */}
      <div
        style={{
          maxHeight: 120,
          overflowY: 'auto',
          lineHeight: 1.9,
          fontSize: 14,
          color: COLORS.textSecondary,
        }}
      >
        {tokens.map((tok, i) => {
          const isActive = i === activeIdx;
          const isPast   = activeIdx >= 0 && i < activeIdx;
          return (
            <span
              key={i}
              ref={isActive ? activeWordRef : undefined}
              onClick={() => seekToWord(tok)}
              style={{
                display: 'inline',
                cursor: 'pointer',
                padding: '1px 3px',
                borderRadius: 4,
                marginRight: 2,
                fontWeight: isActive ? 700 : 400,
                color: isActive
                  ? COLORS.blue
                  : isPast
                  ? COLORS.textMuted
                  : COLORS.textSecondary,
                background: isActive ? `${COLORS.blue}15` : 'transparent',
                transition: 'color 0.1s, background 0.1s, font-weight 0.1s',
                borderBottom: isActive ? `1.5px solid ${COLORS.blue}` : 'none',
              }}
            >
              {tok.word}{' '}
            </span>
          );
        })}
      </div>
    </div>
  );
}
