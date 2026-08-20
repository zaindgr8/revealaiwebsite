'use client';

import { useId } from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  scores: number[];
  dates?: string[];
  height?: number;
  width?: number;
  color?: string;
};

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function MoodSparklineInline({
  scores,
  dates,
  height = 40,
  width = 140,
  color = COLORS.blue,
}: Props) {
  const reactId = useId();
  if (!scores || scores.length < 2 || !scores.every(Number.isFinite)) return null;

  const padX = 4;
  const padY = 4;
  const w = width - padX * 2;
  const h = height - padY * 2;
  const pts = scores.map((rawScore, i) => {
    const score = clamp(rawScore);
    return {
      x: padX + (i / (scores.length - 1)) * w,
      y: padY + ((100 - score) / 100) * h,
      score,
    };
  });

  const linePath = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');
  const fillPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(
    padY + h
  ).toFixed(1)} L ${pts[0].x.toFixed(1)},${(padY + h).toFixed(1)} Z`;
  const gradId = `mood-spark-${reactId.replace(/:/g, '')}`;
  const dateContext =
    dates?.length === scores.length
      ? ` From ${dates[0]} to ${dates[dates.length - 1]}.`
      : '';
  const summary = `Mood over ${scores.length} saved check-ins on a 0 to 100 scale, from ${pts[0].score} to ${pts[pts.length - 1].score}.${dateContext}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={summary}
      style={{ overflow: 'visible' }}
    >
      <title>{summary}</title>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <line
        x1={padX}
        x2={padX + w}
        y1={padY + h / 2}
        y2={padY + h / 2}
        stroke={COLORS.cardBorder}
        strokeWidth="1"
        strokeDasharray="2 2"
        aria-hidden="true"
      />
      <path d={fillPath} fill={`url(#${gradId})`} aria-hidden="true" />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      />
      <circle
        cx={pts[pts.length - 1].x}
        cy={pts[pts.length - 1].y}
        r={3}
        fill={color}
        aria-hidden="true"
      />
    </svg>
  );
}
