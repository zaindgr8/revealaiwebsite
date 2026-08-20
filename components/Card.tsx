'use client';
import React from 'react';
import { COLORS } from '@/lib/theme';

type Props = {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  /**
   * Anchor target, so another page can link straight to this card with a
   * fragment (/settings#elena-voice). Optional: most cards have no anchor.
   */
  id?: string;
};

export function Card({ children, onClick, style, id }: Props) {
  return (
    <div
      id={id}
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
