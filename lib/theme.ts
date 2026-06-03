export const COLORS = {
  blue: '#0093d0',
  green: '#02da8b',
  dark: '#424242',
  white: '#ffffff',

  background: '#0a0e1a',
  card: '#131829',
  cardBorder: '#1e2540',
  surface: '#1a2035',

  textPrimary: '#ffffff',
  textSecondary: '#8b95b0',
  textMuted: '#555f7a',

  danger: '#ff4d6a',
  warning: '#ffb84d',
  success: '#02da8b',

  gradientStart: '#0093d0',
  gradientEnd: '#02da8b',
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
