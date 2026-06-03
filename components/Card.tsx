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
        borderRadius: 18,
        padding: 20,
        border: `1px solid ${COLORS.cardBorder}`,
        marginBottom: 16,
        cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
