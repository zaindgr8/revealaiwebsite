'use client';
import React from 'react';
import { COLORS } from '@/lib/theme';

export function PageShell({ children, maxWidth = 720 }: { children: React.ReactNode; maxWidth?: number }) {
  return (
    <div style={{ minHeight: '100vh', background: COLORS.background }}>
      <div style={{ maxWidth, margin: '0 auto', padding: '24px 20px 40px' }}>{children}</div>
    </div>
  );
}
