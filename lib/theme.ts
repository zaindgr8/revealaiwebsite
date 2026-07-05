export const COLORS = {
  // Brand accent colors (Reveal AI Brand Guidelines v2 — 2025)
  blue: '#2563EB', // Primary — CTAs, links, active states, key UI accents
  sky: '#0EA5E9', // Secondary — gradient end, highlights, progress indicators
  green: '#0EA5E9', // decorative accent alias, kept for call-site compatibility
  dark: '#111118', // Ink — headlines, body text, dark UI surfaces
  white: '#ffffff',

  background: '#F7F7F9', // Off-White — page backgrounds
  card: '#ffffff', // White — card surfaces
  cardBorder: '#E8E8EF', // Border — dividers, borders, outlines
  surface: '#F7F7F9', // Off-White — secondary surfaces

  textPrimary: '#111118', // Ink
  textSecondary: '#54545F', // muted ink for secondary copy
  textMuted: '#8A8A9A', // Muted — labels, placeholders

  danger: '#EF4444', // Red — error states, destructive actions only
  warning: '#D97706',
  success: '#16A34A',

  gradientStart: '#2563EB', // Blue
  gradientEnd: '#0EA5E9', // Sky, 135deg
};

export const MODE_COLOR: Record<string, string> = {
  calm: COLORS.success,
  hopeful: COLORS.success,
  anxious: COLORS.warning,
  venting: COLORS.warning,
  sad: COLORS.blue,
  angry: COLORS.danger,
  neutral: COLORS.textMuted,
};
