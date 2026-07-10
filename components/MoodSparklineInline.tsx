'use client';

/**
 * MoodSparklineInline.tsx
 * Compact inline SVG sparkline for embedding under the mood score circle.
 * Shows last N mood scores as a smooth polyline with gradient fill.
 * Gracefully returns null if fewer than 2 data points.
 */

import { COLORS } from '@/lib/theme';

type Props = {
  scores: number[];           // last N mood scores, oldest → newest
  dates?: string[];           // ISO date strings for tooltip (optional)
  height?: number;
  width?: number;
  color?: string;
};

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function MoodSparklineInline({
  scores,
  dates,
  height = 40,
  width = 140,
  color = COLORS.blue,
}: Props) {
  if (!scores || scores.length < 2) return null;

  const padX = 4;
  const padY = 4;
  const w = width - padX * 2;
  const h = height - padY * 2;

  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = Math.max(max - min, 10);

  const pts = scores.map((s, i) => {
    const x = padX + (i / (scores.length - 1)) * w;
    const y = padY + h - ((clamp(s, min, max) - min) / range) * h;
    return { x, y, score: s, date: dates?.[i] };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(padY + h).toFixed(1)} L ${pts[0].x.toFixed(1)},${(padY + h).toFixed(1)} Z`;

  const gradId = `spark-grad-${Math.random().toString(36).slice(2, 7)}`;

  // Trend: is latest point higher than first?
  const trendUp = pts[pts.length - 1].score >= pts[0].score;
  const lineColor = trendUp ? COLORS.success : COLORS.danger;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
      aria-label="7-day mood sparkline"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.18" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Fill area */}
      <path d={fillPath} fill={`url(#${gradId})`} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* End dot (latest value) */}
      <circle
        cx={pts[pts.length - 1].x}
        cy={pts[pts.length - 1].y}
        r={3}
        fill={lineColor}
      />
    </svg>
  );
}
