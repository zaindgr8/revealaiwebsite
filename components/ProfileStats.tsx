'use client';
import { useMemo, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Card } from './Card';
import { Icon } from './Icon';
import { MiniChart } from './MiniChart';
import {
  computeProfileAggregates,
  type AggregatePeriod,
  type MetricSummary,
  type TherapySession,
} from '@/lib/ai';

const PERIODS: { key: AggregatePeriod; label: string }[] = [
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
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
          <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.white }}>
            📈 Profile Stats
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
            {aggregates.totalSessionsInPeriod} session
            {aggregates.totalSessionsInPeriod === 1 ? '' : 's'} in this window · compared to your
            personal baseline
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
                style={{
                  padding: '7px 14px',
                  borderRadius: 9,
                  background: active ? COLORS.card : 'transparent',
                  color: active ? COLORS.white : COLORS.textSecondary,
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
    </Card>
  );
}

function MetricTile({ metric }: { metric: MetricSummary }) {
  const isFlat = metric.diff === 0;
  const isUp = metric.diff > 0;
  const isGood = isFlat ? null : (isUp && metric.goodWhen === 'up') || (!isUp && metric.goodWhen === 'down');
  const color = isFlat ? COLORS.textMuted : isGood ? COLORS.green : COLORS.danger;
  const arrow = isFlat ? '–' : isUp ? '▲' : '▼';

  const directionLabel = isFlat
    ? `matches your baseline of ${metric.baseline}`
    : `${Math.abs(metric.diffPct)}% ${isUp ? 'above' : 'below'} your personal average (${metric.baseline})`;

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 14,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6 }}>{metric.label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: COLORS.white }}>{metric.current}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>
          {arrow} {isUp ? '+' : ''}
          {metric.diffPct}%
        </span>
      </div>
      <div style={{ fontSize: 11, color: COLORS.textSecondary, lineHeight: 1.4, marginBottom: 8 }}>
        {directionLabel}
      </div>
      {metric.spark.length >= 2 && (
        <MiniChart
          data={metric.spark}
          color={color === COLORS.textMuted ? COLORS.blue : color}
          height={28}
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
        background: 'rgba(0,147,208,0.05)',
        border: '1px solid rgba(0,147,208,0.18)',
        borderRadius: 12,
        padding: '10px 14px',
        marginTop: 12,
      }}
    >
      <Icon name="bulb" size={14} color={COLORS.blue} style={{ marginTop: 3, flexShrink: 0 }} />
      <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
        <strong style={{ color: COLORS.white }}>How comparisons work:</strong> your &ldquo;baseline&rdquo;
        is your average across all check-ins outside the current window. The arrow shows whether
        today is above or below that baseline — green when it&apos;s healthier, red when it&apos;s
        worse. Less stress = better, so a red ▼ on stress means improvement.
      </div>
    </div>
  );
}
