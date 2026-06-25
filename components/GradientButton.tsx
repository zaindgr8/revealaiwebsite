'use client';
import React from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  title: string;
  onClick?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
  type?: 'button' | 'submit';
};

export function GradientButton({ title, onClick, icon, disabled, style, type = 'button' }: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '16px 28px',
        borderRadius: 14,
        background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
        color: COLORS.white,
        fontSize: 15,
        fontWeight: 700,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.2s, transform 0.1s',
        ...style,
      }}
    >
      {icon}
      {title}
    </button>
  );
}

export function SecondaryButton({ title, onClick, icon, style }: Omit<Props, 'disabled' | 'type'>) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '16px 28px',
        borderRadius: 14,
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        color: COLORS.textPrimary,
        fontSize: 15,
        fontWeight: 700,
        ...style,
      }}
    >
      {icon}
      {title}
    </button>
  );
}
