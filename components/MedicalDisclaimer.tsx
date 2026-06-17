'use client';
import { COLORS } from '@/lib/theme';
import { Icon } from './Icon';

type Variant = 'card' | 'inline' | 'banner';

const FULL_TEXT =
  'Reveal AI provides reflective insights based on voice patterns. It is not a medical device and does not provide medical advice, diagnosis, or treatment. If you are experiencing a mental-health crisis or thoughts of self-harm, please contact a qualified professional or your local emergency services.';

const SHORT_TEXT =
  'For reflection, not diagnosis. Reveal AI is not a medical device — consult a qualified professional for clinical concerns.';

export function MedicalDisclaimer({ variant = 'card' }: { variant?: Variant }) {
  if (variant === 'inline') {
    return (
      <div
        style={{
          fontSize: 11,
          color: COLORS.textMuted,
          lineHeight: 1.5,
          marginTop: 14,
          textAlign: 'center',
        }}
      >
        {SHORT_TEXT}
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          background: 'rgba(255,184,77,0.06)',
          border: `1px solid rgba(255,184,77,0.18)`,
          borderRadius: 14,
          padding: '12px 14px',
          marginBottom: 16,
        }}
      >
        <Icon name="warning" size={16} color={COLORS.warning} style={{ marginTop: 2, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
          {SHORT_TEXT}
        </div>
      </div>
    );
  }

  // Default: card
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        background: 'rgba(255,184,77,0.05)',
        border: `1px solid rgba(255,184,77,0.18)`,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          background: 'rgba(255,184,77,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name="warning" size={16} color={COLORS.warning} />
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: COLORS.warning,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.4,
          }}
        >
          Wellness Reflection — Not Medical Advice
        </div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.55 }}>
          {FULL_TEXT}
        </div>
      </div>
    </div>
  );
}
