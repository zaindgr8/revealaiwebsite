export const COLORS = {
  // Brand accent colors (Reveal AI brand guidelines)
  blue: '#6f6258',
  green: '#4f7a43',
  dark: '#2b2521',
  white: '#ffffff',

  background: '#ffffff',
  card: '#f7f2ed',
  cardBorder: '#e6dbd1',
  surface: '#f0e7de',

  textPrimary: '#2b2521',
  textSecondary: '#6f6258',
  textMuted: '#a89a8d',

  danger: '#c0392b',
  warning: '#b07d2e',
  success: '#4f7a43',

  gradientStart: '#c9b8a8',
  gradientEnd: '#6f6258',
};

export const MODE_COLOR: Record<string, string> = {
  calm: COLORS.green,
  hopeful: COLORS.green,
  anxious: COLORS.warning,
  venting: COLORS.warning,
  sad: COLORS.blue,
  angry: COLORS.danger,
  neutral: COLORS.textMuted,
};
