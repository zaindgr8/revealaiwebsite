'use client';
import { useEffect, useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  active: boolean;
  barCount?: number;
  stream?: MediaStream | null;
};

const MIN_BAR = 4;
const MAX_BAR = 50;

function idleBars(barCount: number) {
  return Array.from({ length: barCount }, (_, i) => Math.sin(i * 0.5) * 4 + 8);
}

export function WaveformVisualizer({ active, barCount = 30, stream }: Props) {
  const [heights, setHeights] = useState<number[]>(() => idleBars(barCount));
  const rafRef = useRef<number | null>(null);

  // Real microphone visualization when stream is provided
  useEffect(() => {
    if (!active || !stream) {
      setHeights(idleBars(barCount));
      return;
    }

    let cancelled = false;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;

    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
    } catch {
      // Fall back to fake animation if Web Audio API fails
      const interval = setInterval(() => {
        setHeights(Array.from({ length: barCount }, () => MIN_BAR + Math.random() * MAX_BAR));
      }, 120);
      return () => clearInterval(interval);
    }

    const buffer = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (cancelled || !analyser) return;
      analyser.getByteFrequencyData(buffer);

      // Sample `barCount` evenly-spaced points across the frequency spectrum.
      // Boost a little because speech tends to live in lower-to-mid frequencies.
      const bars: number[] = new Array(barCount);
      const usableBins = Math.floor(buffer.length * 0.7); // skip high freqs that are mostly silent
      for (let i = 0; i < barCount; i++) {
        const idx = Math.min(
          usableBins - 1,
          Math.floor((i / barCount) * usableBins)
        );
        // gentle gain curve
        const v = Math.min(1, (buffer[idx] / 255) * 1.4);
        bars[i] = MIN_BAR + v * MAX_BAR;
      }
      setHeights(bars);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        source?.disconnect();
        analyser?.disconnect();
        audioCtx?.close();
      } catch {}
    };
  }, [active, stream, barCount]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 60,
        gap: 3,
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: h,
            borderRadius: 2,
            background: i % 2 === 0 ? COLORS.blue : COLORS.green,
            transition: 'height 0.08s ease-out',
          }}
        />
      ))}
    </div>
  );
}
