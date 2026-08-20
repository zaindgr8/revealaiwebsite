'use client';
import { useMemo, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Card } from './Card';
import { Icon } from './Icon';
import { MiniChart } from './MiniChart';
import type { TherapySession } from '@/lib/ai';
import {
  computeProfileAggregates,
  type AggregatePeriod,
  type MetricSummary,
} from '@/lib/graphMetrics';

const PERIODS: { key: AggregatePeriod; label: string }[] = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: '7 Days' },
  { key: 'monthly', label: '30 Days' },
];

export function ProfileStats({ sessions }: { sessions: TherapySession[] }) {
  const [period, setPeriod] = useState<AggregatePeriod>('weekly');

  const aggregates = useMemo(() => computeProfileAggregates(sessions, period), [sessions, period]);

  if (!aggregates) {
    return (
      <Card>
        <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
          Complete a few check-ins to see your personal stats and how today compares to your
          baseline.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
            <Icon name="trending-up" size={15} color={COLORS.blue} />
            Profile Stats
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            Window averages from {aggregates.totalSessionsInPeriod} saved check-in
            {aggregates.totalSessionsInPeriod === 1 ? '' : 's'}
          </div>
        </div>

        <div
          style={{
            display: 'inline-flex',
            background: COLORS.cardBorder,
            borderRadius: 12,
            padding: 3,
            gap: 2,
          }}
        >
          {PERIODS.map((p) => {
            const active = p.key === period;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                aria-pressed={active}
                style={{
                  padding: '7px 14px',
                  borderRadius: 9,
                  background: active ? COLORS.card : 'transparent',
                  color: active ? COLORS.textPrimary : COLORS.textSecondary,
                  fontSize: 12,
                  fontWeight: 700,
                  border: active ? `1px solid ${COLORS.cardBorder}` : '1px solid transparent',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {aggregates.totalSessionsInPeriod === 0 ? (
        <div
          role="status"
          style={{
            padding: '24px 12px',
            textAlign: 'center',
            color: COLORS.textSecondary,
            fontSize: 13,
          }}
        >
          No saved check-ins in this window. Choose a longer window or complete a new Reflect.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: 12,
          }}
        >
          {aggregates.metrics.map((m) => (
            <MetricTile key={m.key} metric={m} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MetricTile({ metric }: { metric: MetricSummary }) {
  const hasBaseline = metric.diff !== null && metric.baseline !== null;
  const isFlat = metric.diff === 0;
  const isUp = (metric.diff ?? 0) > 0;
  const isGood =
    hasBaseline && !isFlat
      ? (isUp && metric.goodWhen === 'up') || (!isUp && metric.goodWhen === 'down')
      : null;
  const color = !hasBaseline || isFlat ? COLORS.textMuted : isGood ? COLORS.success : COLORS.danger;
  const arrow = !hasBaseline || isFlat ? '–' : isUp ? '▲' : '▼';

  const directionLabel = !hasBaseline
    ? 'Complete 3 earlier check-ins to establish a baseline'
    : isFlat
      ? `Matches your earlier baseline of ${metric.baseline}`
      : `${Math.abs(metric.diff!)} points ${isUp ? 'above' : 'below'} your earlier baseline (${metric.baseline})`;

  return (
    <div
      style={{
        background: 'rgba(17, 17, 24, 0.025)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>
        {metric.label} · window average
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.textPrimary }}>
          {metric.periodAvg}
          <span style={{ fontSize: 10, color: COLORS.textMuted, marginLeft: 3 }}>/ 100</span>
        </span>
        {hasBaseline && (
          <span style={{ fontSize: 12, fontWeight: 700, color }}>
            {arrow} {isUp ? '+' : ''}
            {metric.diff} pts
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.4, marginBottom: 8 }}>
        {directionLabel}
      </div>
      {metric.spark.length >= 2 && (
        <MiniChart
          data={metric.spark}
          color={color === COLORS.textMuted ? COLORS.blue : color}
          height={28}
          showScale={false}
          ariaLabel={`${metric.label} scores in the selected window`}
        />
      )}
    </div>
  );
}

export function ProfileStatsExplainer() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'rgba(37, 99, 235, 0.05)',
        border: '1px solid rgba(37, 99, 235, 0.18)',
        borderRadius: 12,
        padding: '10px 14px',
        marginTop: 12,
      }}
    >
      <Icon name="bulb" size={14} color={COLORS.blue} style={{ marginTop: 3, flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
        <strong style={{ color: COLORS.textPrimary }}>How comparisons work:</strong> each tile shows
        the average for the selected window on a 0–100 scale. After at least 3 earlier check-ins,
        the arrow compares that window with your earlier baseline in points. Green means a
        healthier direction; for stress, a lower score is healthier.
      </div>
    </div>
  );
}
