'use client';
import React from 'react';
import { useIsMobile } from '@/hooks/useMediaQuery';

export function Grid({
  cols = 2,
  gap = 16,
  children,
  style,
}: {
  cols?: 2 | 3;
  gap?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const isMobile = useIsMobile();
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : `repeat(${cols}, minmax(0, 1fr))`,
        gap,
        alignItems: 'start',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
