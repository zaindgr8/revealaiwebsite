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
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
  const target = (safeValue / safeMax) * 100;

  useEffect(() => {
    const t = setTimeout(() => setWidth(target), 50);
    return () => clearTimeout(t);
  }, [target]);

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
          {safeValue} / {safeMax}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
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
