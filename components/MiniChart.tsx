'use client';
import { useId, useRef, useState, useEffect } from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  data: number[];
  color?: string;
  height?: number;
  labels?: string[];
  ariaLabel?: string;
  showScale?: boolean;
};

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function MiniChart({
  data,
  color = COLORS.blue,
  height = 70,
  labels,
  ariaLabel = 'Wellbeing score trend',
  showScale = true,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [selected, setSelected] = useState<number | null>(null);
  const reactId = useId();
  const gradId = `chart-gradient-${reactId.replace(/:/g, '')}`;
  const valid = data.length > 0 && data.every(Number.isFinite);
  const values = valid ? data.map(clampScore) : [];
  const interactive = !!(labels && labels.length === values.length);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!valid) {
    return (
      <div
        role="status"
        style={{
          minHeight: height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: COLORS.textMuted,
          fontSize: 12,
        }}
      >
        Chart data unavailable
      </div>
    );
  }

  const padTop = 8;
  const padBottom = 8;
  const padLeft = 8;
  const padRight = showScale ? 30 : 8;
  const plotWidth = Math.max(1, width - padLeft - padRight);
  const plotHeight = Math.max(1, height - padTop - padBottom);
  const yFor = (value: number) => padTop + ((100 - value) / 100) * plotHeight;

  const pts = values.map((value, i) => ({
    x:
      values.length === 1
        ? padLeft + plotWidth / 2
        : padLeft + (i / (values.length - 1)) * plotWidth,
    y: yFor(value),
    v: value,
  }));

  const polylineStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const areaStr =
    pts.length >= 2
      ? `${pts[0].x},${padTop + plotHeight} ${polylineStr} ${pts[pts.length - 1].x},${padTop + plotHeight}`
      : '';
  const selectedIndex = selected !== null && selected < pts.length ? selected : null;
  const sel = selectedIndex !== null ? pts[selectedIndex] : null;
  const tooltipW = 104;
  const tooltipLeft = sel
    ? Math.min(Math.max(sel.x - tooltipW / 2, 0), Math.max(0, width - tooltipW))
    : 0;
  const summary = `${ariaLabel}. ${values.length} ${values.length === 1 ? 'score' : 'scores'} on a 0 to 100 scale: ${values.join(', ')}.`;

  const selectPoint = (index: number) => {
    setSelected((current) => (current === index ? null : index));
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role={interactive ? 'group' : 'img'}
        aria-label={summary}
        style={{ display: 'block', maxWidth: '100%' }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[100, 50, 0].map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick} aria-hidden="true">
              <line
                x1={padLeft}
                x2={padLeft + plotWidth}
                y1={y}
                y2={y}
                stroke={tick === 50 ? COLORS.cardBorder : `${COLORS.cardBorder}99`}
                strokeWidth="1"
                strokeDasharray={tick === 50 ? '3 3' : undefined}
              />
              {showScale && (
                <text
                  x={width - 2}
                  y={y}
                  fill={COLORS.textMuted}
                  fontSize="9"
                  textAnchor="end"
                  dominantBaseline="middle"
                >
                  {tick}
                </text>
              )}
            </g>
          );
        })}

        {areaStr && <polygon points={areaStr} fill={`url(#${gradId})`} aria-hidden="true" />}
        {pts.length >= 2 && (
          <polyline
            points={polylineStr}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          />
        )}

        {pts.map((p, i) => (
          <g
            key={i}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? 0 : undefined}
            aria-label={interactive ? `${labels?.[i]}: ${p.v} out of 100` : undefined}
            onClick={interactive ? () => selectPoint(i) : undefined}
            onMouseEnter={interactive ? () => setSelected(i) : undefined}
            onMouseLeave={interactive ? () => setSelected(null) : undefined}
            onFocus={interactive ? () => setSelected(i) : undefined}
            onBlur={interactive ? () => setSelected(null) : undefined}
            onKeyDown={
              interactive
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      selectPoint(i);
                    }
                  }
                : undefined
            }
            style={{ cursor: interactive ? 'pointer' : 'default', outline: 'none' }}
          >
            <circle
              cx={p.x}
              cy={p.y}
              r={selectedIndex === i ? 5 : pts.length === 1 ? 4 : 3}
              fill={selectedIndex === i ? color : COLORS.background}
              stroke={color}
              strokeWidth={selectedIndex === i ? 2 : 1.5}
            />
            {interactive && <circle cx={p.x} cy={p.y} r="14" fill="transparent" />}
          </g>
        ))}
      </svg>

      {sel !== null && interactive && labels && selectedIndex !== null && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            width: tooltipW,
            left: tooltipLeft,
            top: Math.max(sel.y - 46, 0),
            background: COLORS.surface,
            borderRadius: 8,
            padding: '4px 8px',
            border: `1px solid ${COLORS.cardBorder}`,
            textAlign: 'center',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary }}>
            {sel.v} / 100
          </div>
          <div style={{ fontSize: 10, color: COLORS.textSecondary, marginTop: 1 }}>
            {labels[selectedIndex]}
          </div>
        </div>
      )}
    </div>
  );
}
