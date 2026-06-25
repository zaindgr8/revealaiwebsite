'use client';
import { COLORS } from '@/lib/theme';

export function Logo({ size = 50 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.87} viewBox="0 0 60 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="revealWave" x1="8" y1="0" x2="48" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={COLORS.dark} />
          <stop offset="55%" stopColor={COLORS.gradientStart} />
          <stop offset="100%" stopColor={COLORS.gradientEnd} />
        </linearGradient>
        <linearGradient id="revealBubble" x1="6" y1="4" x2="50" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={COLORS.gradientStart} />
          <stop offset="100%" stopColor={COLORS.gradientEnd} />
        </linearGradient>
      </defs>
      <circle
        cx="27"
        cy="22"
        r="19"
        stroke="url(#revealBubble)"
        strokeWidth="2.6"
        strokeDasharray="103 16"
        fill="none"
      />
      <path
        d="M16 38 L13 46 L23 39"
        stroke="url(#revealBubble)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <g stroke="url(#revealWave)" strokeWidth="2" strokeLinecap="round">
        <line x1="10" y1="20" x2="10" y2="24" />
        <line x1="13" y1="18" x2="13" y2="26" />
        <line x1="16" y1="15" x2="16" y2="29" />
        <line x1="19" y1="11" x2="19" y2="33" />
        <line x1="22" y1="6" x2="22" y2="38" />
        <line x1="25" y1="3" x2="25" y2="41" />
        <line x1="28" y1="8" x2="28" y2="36" />
        <line x1="31" y1="14" x2="31" y2="30" />
        <line x1="34" y1="17" x2="34" y2="27" />
        <line x1="37" y1="12" x2="37" y2="32" />
        <line x1="40" y1="18" x2="40" y2="26" />
        <line x1="43" y1="20" x2="43" y2="24" />
      </g>
    </svg>
  );
}

export function LogoText({ size = 22 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: size, fontWeight: 700, color: COLORS.textPrimary }}>Reveal</span>
      <span style={{ fontSize: size, fontWeight: 400, color: COLORS.textSecondary }}>&nbsp;AI</span>
    </div>
  );
}
