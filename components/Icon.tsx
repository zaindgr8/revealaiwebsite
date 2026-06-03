'use client';
import React from 'react';

type Props = {
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
};

const ICONS: Record<string, React.ReactNode> = {
  'arrow-back': (
    <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'arrow-forward': (
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  'chevron-forward': (
    <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  checkmark: (
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  close: (
    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  mic: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3M8 21h8" />
    </g>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />,
  pulse: (
    <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  warning: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </g>
  ),
  bulb: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M9 18h6M10 22h4M12 2a7 7 0 017 7c0 3-2 4.5-3 6H8c-1-1.5-3-3-3-6a7 7 0 017-7z" />
    </g>
  ),
  'trending-up': (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </g>
  ),
  'trending-down': (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </g>
  ),
  settings: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </g>
  ),
  chat: (
    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  send: <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  user: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </g>
  ),
  mail: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </g>
  ),
  lock: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </g>
  ),
  camera: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </g>
  ),
  pencil: (
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  ),
  trash: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </g>
  ),
  time: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </g>
  ),
  phone: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12" y2="18" />
    </g>
  ),
  download: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </g>
  ),
  'close-circle': (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </g>
  ),
  'log-out': (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </g>
  ),
  inbox: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <polyline points="22,12 16,12 14,15 10,15 8,12 2,12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />
    </g>
  ),
  home: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M3 12l9-9 9 9" />
      <path d="M5 10v10a1 1 0 001 1h4v-7h4v7h4a1 1 0 001-1V10" />
    </g>
  ),
  menu: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </g>
  ),
  sparkles: (
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M12 3l1.8 4.7L18 9.5l-4.2 1.8L12 16l-1.8-4.7L6 9.5l4.2-1.8L12 3z" />
      <path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
    </g>
  ),
};

export function Icon({ name, size = 20, color = 'currentColor', style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{ color, display: 'inline-block', flexShrink: 0, ...style }}
    >
      {ICONS[name] ?? null}
    </svg>
  );
}
