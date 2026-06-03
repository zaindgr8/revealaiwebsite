'use client';
import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  label: string;
  value: number;
  max?: number;
  color?: string;
};

export function MetricBar({ label, value, max = 100, color = COLORS.green }: Props) {
  const [width, setWidth] = useState(0);
  const target = Math.max(0, Math.min(100, (value / max) * 100));

  useEffect(() => {
    const t = setTimeout(() => setWidth(target), 50);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.white }}>{value}%</span>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: COLORS.cardBorder,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${width}%`,
            background: color,
            borderRadius: 3,
            transition: 'width 1s ease-out',
          }}
        />
      </div>
    </div>
  );
}
