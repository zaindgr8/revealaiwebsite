'use client';
import { COLORS } from '@/lib/theme';

type Props = {
  currentStreak: number;
  longestStreak?: number;
  size?: 'sm' | 'md';
};

export function StreakBadge({ currentStreak, longestStreak, size = 'md' }: Props) {
  if (!currentStreak || currentStreak < 1) return null;

  const isSm = size === 'sm';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? 5 : 7,
        background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(239,68,68,0.08))',
        border: '1px solid rgba(245,158,11,0.30)',
        borderRadius: isSm ? 10 : 14,
        padding: isSm ? '5px 10px' : '8px 14px',
      }}
    >
      <span style={{ fontSize: isSm ? 14 : 18, lineHeight: 1 }}>🔥</span>
      <div>
        <div
          style={{
            fontSize: isSm ? 13 : 15,
            fontWeight: 800,
            color: '#D97706',
            fontFamily: 'var(--font-syne)',
            letterSpacing: '-0.3px',
            lineHeight: 1,
          }}
        >
          Day {currentStreak}
        </div>
        {!isSm && longestStreak && longestStreak > 1 && (
          <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 1 }}>
            Best: {longestStreak} days
          </div>
        )}
      </div>
    </div>
  );
}
