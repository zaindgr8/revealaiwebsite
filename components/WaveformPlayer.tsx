'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import type { SegmentEmotion } from '@/lib/audioFeatures';

export type WaveformPlayerProps = {
  blobUrl: string;
  envelope: number[];           // 0-1 normalized amplitude, ~500 pts
  segments: SegmentEmotion[];   // per-2s emotion windows
  duration: number;             // seconds
  audioRef?: React.RefObject<HTMLAudioElement | null>;
};

const LEGEND = [
  { label: 'Calm',      color: '#3B82F6' },
  { label: 'Neutral',   color: '#8B5CF6' },
  { label: 'Energised', color: '#F59E0B' },
  { label: 'Tense',     color: '#EF4444' },
];

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

export function WaveformPlayer({
  blobUrl,
  envelope,
  segments,
  duration,
  audioRef: externalAudioRef,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const internalAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioEl = externalAudioRef ?? internalAudioRef;
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoveredSeg, setHoveredSeg] = useState<SegmentEmotion | null>(null);

  // ── Draw waveform ─────────────────────────────────────────────────────────
  const draw = useCallback(
    (progressFraction: number) => {
      const canvas = canvasRef.current;
      if (!canvas || !envelope.length) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      ctx.clearRect(0, 0, W, H);

      const midY = H / 2;
      const maxAmp = midY * 0.85;

      // Build a lookup: for each pixel x → which segment index?
      const getSegColor = (xFraction: number): string => {
        const t = xFraction * duration;
        const seg = segments.find(s => t >= s.t_start && t < s.t_end);
        return seg?.color ?? '#8B5CF6';
      };

      // Draw waveform bars
      const barCount = envelope.length;
      const barW = W / barCount;

      for (let i = 0; i < barCount; i++) {
        const xFrac = i / barCount;
        const x = i * barW;
        const h = Math.max(2, envelope[i] * maxAmp);
        const color = getSegColor(xFrac);

        // Played portion: full opacity; unplayed: 30% opacity
        const played = xFrac <= progressFraction;
        ctx.globalAlpha = played ? 0.9 : 0.25;
        ctx.fillStyle = color;

        // Top bar
        ctx.beginPath();
        ctx.roundRect(x + 0.5, midY - h, Math.max(1.5, barW - 1), h, 1);
        ctx.fill();

        // Mirror bottom bar
        ctx.globalAlpha = played ? 0.45 : 0.12;
        ctx.beginPath();
        ctx.roundRect(x + 0.5, midY + 1, Math.max(1.5, barW - 1), h * 0.5, 1);
        ctx.fill();
      }

      // Playhead cursor
      ctx.globalAlpha = 1;
      const cursorX = progressFraction * W;
      ctx.strokeStyle = COLORS.textPrimary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cursorX, 4);
      ctx.lineTo(cursorX, H - 4);
      ctx.stroke();

      // Cursor dot
      ctx.fillStyle = COLORS.textPrimary;
      ctx.beginPath();
      ctx.arc(cursorX, midY, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    [envelope, segments, duration]
  );

  // ── Init audio element ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = new Audio(blobUrl);
    el.preload = 'metadata';
    internalAudioRef.current = el;
    if (externalAudioRef) (externalAudioRef as React.MutableRefObject<HTMLAudioElement | null>).current = el;

    const onTimeUpdate = () => setCurrentTime(el.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); draw(0); };
    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('ended', onEnded);

    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('ended', onEnded);
      el.pause();
      internalAudioRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blobUrl]);

  // ── RAF loop while playing ─────────────────────────────────────────────────
  useEffect(() => {
    const el = audioEl.current;
    if (!el) return;

    if (playing) {
      const tick = () => {
        draw(duration > 0 ? el.currentTime / duration : 0);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      draw(duration > 0 ? (el.currentTime || 0) / duration : 0);
    }

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [playing, draw, duration, audioEl]);

  // ── Initial draw ───────────────────────────────────────────────────────────
  useEffect(() => { draw(0); }, [draw]);

  // ── Canvas resize observer ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      const el = audioEl.current;
      draw(el && duration > 0 ? el.currentTime / duration : 0);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [draw, audioEl, duration]);

  // ── Playback controls ──────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const el = audioEl.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().then(() => setPlaying(true)).catch(() => {});
    }
  }, [playing, audioEl]);

  const seekTo = useCallback(
    (seconds: number) => {
      const el = audioEl.current;
      if (!el || !duration) return;
      const next = Math.max(0, Math.min(duration, seconds));
      el.currentTime = next;
      setCurrentTime(next);
      draw(next / duration);
    },
    [audioEl, duration, draw]
  );

  // ── Click-to-seek ──────────────────────────────────────────────────────────
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const el = audioEl.current;
      if (!canvas || !el || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const xFrac = (e.clientX - rect.left) / rect.width;
      seekTo(xFrac * duration);
    },
    [audioEl, duration, seekTo]
  );

  // ── Hover to show segment tooltip ─────────────────────────────────────────
  const handleCanvasMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !duration) return;
      const rect = canvas.getBoundingClientRect();
      const t = ((e.clientX - rect.left) / rect.width) * duration;
      const seg = segments.find(s => t >= s.t_start && t < s.t_end) ?? null;
      setHoveredSeg(seg);
    },
    [duration, segments]
  );

  const visibleSegment =
    hoveredSeg ?? segments.find((segment) => currentTime >= segment.t_start && currentTime < segment.t_end) ?? null;

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(17,17,24,0.03) 0%, rgba(37,99,235,0.04) 100%)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 18,
        padding: 20,
        marginBottom: 16,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(139,92,246,0.12))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="pulse" size={14} color={COLORS.blue} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
              Voice Waveform
            </div>
            <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 1 }}>
              Color-coded by emotional signal per 2s segment
            </div>
          </div>
        </div>
        {/* Segment tooltip */}
        {visibleSegment && (
          <div
            style={{
              fontSize: 11,
              color: visibleSegment.color,
              fontWeight: 700,
              background: `${visibleSegment.color}18`,
              border: `1px solid ${visibleSegment.color}40`,
              borderRadius: 8,
              padding: '4px 10px',
              textTransform: 'capitalize',
            }}
          >
            {visibleSegment.label} · {visibleSegment.energy} / 100 energy
          </div>
        )}
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        role="slider"
        tabIndex={0}
        aria-label="Audio position. Use left and right arrow keys to seek by 5 seconds."
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(duration))}
        aria-valuenow={Math.max(0, Math.round(currentTime))}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        onClick={handleCanvasClick}
        onMouseMove={handleCanvasMove}
        onMouseLeave={() => setHoveredSeg(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            seekTo(currentTime - 5);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            seekTo(currentTime + 5);
          } else if (event.key === 'Home') {
            event.preventDefault();
            seekTo(0);
          } else if (event.key === 'End') {
            event.preventDefault();
            seekTo(duration);
          }
        }}
        style={{
          width: '100%',
          height: 80,
          borderRadius: 10,
          cursor: 'pointer',
          display: 'block',
        }}
      />

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <button
          type="button"
          aria-label={playing ? 'Pause recording playback' : 'Play recording'}
          onClick={togglePlay}
          style={{
            width: 36, height: 36,
            borderRadius: 10,
            border: `1px solid ${COLORS.cardBorder}`,
            background: playing
              ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
              : COLORS.card,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            transition: 'background 0.2s',
          }}
        >
          <Icon
            name={playing ? 'stop' : 'mic'}
            size={16}
            color={playing ? '#fff' : COLORS.textSecondary}
          />
        </button>

        <div style={{ flex: 1 }}>
          {/* Progress bar (click to seek) */}
          <div
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              const frac = (e.clientX - rect.left) / rect.width;
              const el = audioEl.current;
              if (el && duration) seekTo(frac * duration);
            }}
            style={{
              height: 4, borderRadius: 2,
              background: COLORS.cardBorder,
              cursor: 'pointer',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0,
                width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
                background: `linear-gradient(90deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                borderRadius: 2,
                transition: 'width 0.1s linear',
              }}
            />
          </div>
        </div>

        <span style={{ fontSize: 12, color: COLORS.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 12, flexWrap: 'wrap' }}>
        {LEGEND.map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 600 }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
