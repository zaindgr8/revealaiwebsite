'use client';
import { COLORS } from '@/lib/theme';

type Props = {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  sublabel?: string;
  color?: string;
};

export function CircularProgress({
  value,
  max = 100,
  size = 140,
  label,
  sublabel,
  color = COLORS.green,
}: Props) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.min(safeMax, value)) : 0;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeValue / safeMax) * circumference;

  return (
    <div
      role="progressbar"
      aria-label={label ?? 'Score'}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={safeValue}
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={COLORS.cardBorder}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: size * 0.22, fontWeight: 800, color: COLORS.textPrimary }}>
          {safeValue}
        </span>
        <span style={{ fontSize: 9, color: COLORS.textMuted }}>/ {safeMax}</span>
        {label && <span style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 2 }}>{label}</span>}
        {sublabel && <span style={{ fontSize: 10, color: COLORS.textMuted }}>{sublabel}</span>}
      </div>
    </div>
  );
}
