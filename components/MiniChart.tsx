'use client';
import { useState, useRef, useEffect } from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  data: number[];
  color?: string;
  height?: number;
  labels?: string[];
};

export function MiniChart({ data, color = COLORS.green, height = 70, labels }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [selected, setSelected] = useState<number | null>(null);
  const interactive = !!(labels && labels.length === data.length);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const padding = 8;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const pts = data.map((v, i) => ({
    x: padding + (i / Math.max(data.length - 1, 1)) * (width - padding * 2),
    y: height - padding - ((v - min) / range) * (height - padding * 2),
    v,
  }));

  const polylineStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const areaStr = `${padding},${height} ${polylineStr} ${width - padding},${height}`;

  const sel = selected !== null ? pts[selected] : null;
  const tooltipW = 80;
  const tooltipLeft = sel
    ? Math.min(Math.max(sel.x - tooltipW / 2, 0), width - tooltipW)
    : 0;

  const gradId = `grad_${color.replace('#', '')}`;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={width} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaStr} fill={`url(#${gradId})`} />
        <polyline points={polylineStr} fill="none" stroke={color} strokeWidth="2" />
        {interactive &&
          pts.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={selected === i ? 5 : 3}
                fill={selected === i ? color : COLORS.background}
                stroke={color}
                strokeWidth={selected === i ? 0 : 1.5}
              />
              <rect
                x={p.x - 16}
                y={0}
                width={32}
                height={height}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onClick={() => setSelected(selected === i ? null : i)}
              />
            </g>
          ))}
      </svg>
      {sel !== null && interactive && labels && (
        <div
          style={{
            position: 'absolute',
            width: tooltipW,
            left: tooltipLeft,
            top: Math.max(sel.y - 42, 0),
            background: COLORS.surface,
            borderRadius: 8,
            padding: '4px 8px',
            border: `1px solid ${COLORS.cardBorder}`,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.white }}>{sel.v}</div>
          <div style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 1 }}>
            {labels[selected!]}
          </div>
        </div>
      )}
    </div>
  );
}
