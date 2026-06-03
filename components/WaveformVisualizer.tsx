'use client';
import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  active: boolean;
  barCount?: number;
};

export function WaveformVisualizer({ active, barCount = 30 }: Props) {
  const [heights, setHeights] = useState<number[]>(() =>
    Array.from({ length: barCount }, (_, i) => Math.sin(i * 0.5) * 6 + 10)
  );

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: barCount }, (_, i) => Math.sin(i * 0.5) * 6 + 10));
      return;
    }
    const interval = setInterval(() => {
      setHeights(Array.from({ length: barCount }, () => 4 + Math.random() * 40));
    }, 120);
    return () => clearInterval(interval);
  }, [active, barCount]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 50,
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
            transition: 'height 0.15s ease-out',
          }}
        />
      ))}
    </div>
  );
}
