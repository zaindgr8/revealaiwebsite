'use client';
import React from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
};

export function Card({ children, onClick, style }: Props) {
  return (
    <div
      onClick={onClick}
      style={{
        background: COLORS.card,
        borderRadius: 20,
        padding: 22,
        border: `1px solid ${COLORS.cardBorder}`,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
