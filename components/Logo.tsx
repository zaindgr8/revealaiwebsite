'use client';
import { COLORS } from '@/lib/theme';

export function Logo({ size = 50 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.8} viewBox="0 0 50 40">
      <defs>
        <linearGradient id="logoG" x1="0" y1="0" x2="50" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={COLORS.blue} />
          <stop offset="100%" stopColor={COLORS.green} />
        </linearGradient>
      </defs>
      <path
        d="M10 25 L18 25 L25 8 L32 32 L39 20 L45 20"
        stroke="url(#logoG)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function LogoText({ size = 22 }: { size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <span style={{ fontSize: size, fontWeight: 800, color: COLORS.white }}>Reveal</span>
      <span style={{ fontSize: size, fontWeight: 400, color: COLORS.textSecondary }}>&nbsp;AI</span>
    </div>
  );
}
