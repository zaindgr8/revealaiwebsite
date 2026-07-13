'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';

type Props = {
  onClose: () => void;
};

const FEATURES_PRO = [
  { icon: '🎙️', text: '150 minutes of AI voice analysis' },
  { icon: '🧬', text: 'Mood, energy & stress decoded from voice' },
  { icon: '📈', text: 'Personal wellness trends & early burnout alerts' },
  { icon: '💬', text: 'Unlimited AI therapy chat sessions' },
  { icon: '📊', text: 'Weekly mood reports & streak tracking' },
  { icon: '🔒', text: 'Private & encrypted — audio deleted after analysis' },
];

export function PricingModal({ onClose }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<'trial' | 'pro'>('trial');

  const handleContinue = () => {
    onClose();
    router.push('/signup');
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          zIndex: 999,
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 520,
            background: '#fff',
            borderRadius: 28,
            boxShadow: '0 32px 80px rgba(37,99,235,0.18), 0 4px 16px rgba(0,0,0,0.08)',
            overflow: 'hidden',
            pointerEvents: 'all',
            animation: 'slideUp 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)',
          }}
        >
          {/* Gradient header */}
          <div
            style={{
              background: 'linear-gradient(135deg, #2563EB 0%, #0EA5E9 100%)',
              padding: '28px 28px 24px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative orbs */}
            <div style={{ position: 'absolute', right: -20, top: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', left: 30, bottom: -30, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

            {/* Close button */}
            <button
              onClick={onClose}
              style={{
                position: 'absolute',
                top: 14,
                right: 14,
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                border: 'none',
                color: '#fff',
                fontSize: 18,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                zIndex: 2,
              }}
            >
              ×
            </button>

            <div style={{ position: 'relative', zIndex: 1 }}>
              <div
                style={{
                  display: 'inline-block',
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  borderRadius: 20,
                  padding: '4px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                ✨ Choose Your Plan
              </div>
              <h2
                style={{
                  fontSize: 24,
                  fontWeight: 900,
                  color: '#fff',
                  margin: '0 0 6px',
                  fontFamily: 'var(--font-syne, system-ui)',
                  letterSpacing: '-0.6px',
                  lineHeight: 1.2,
                }}
              >
                Start your journey with Reveal AI
              </h2>
              <p style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.85)', margin: 0 }}>
                No hidden fees. Cancel anytime. Your voice stays private.
              </p>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '24px 24px 28px' }}>

            {/* Plan selector */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>

              {/* Free Trial Card */}
              <button
                id="plan-trial-btn"
                onClick={() => setSelected('trial')}
                style={{
                  padding: '16px 14px',
                  borderRadius: 16,
                  border: selected === 'trial' ? '2px solid #2563EB' : `2px solid ${COLORS.cardBorder}`,
                  background: selected === 'trial' ? 'rgba(37,99,235,0.04)' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.18s',
                  position: 'relative',
                }}
              >
                {selected === 'trial' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: '#fff',
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Free Trial
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: COLORS.textPrimary, fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-1px', lineHeight: 1 }}>
                  $0
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3, fontWeight: 500 }}>
                  3 days free
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
                  Then $12/mo after trial ends
                </div>
              </button>

              {/* Pro Monthly Card */}
              <button
                id="plan-pro-btn"
                onClick={() => setSelected('pro')}
                style={{
                  padding: '16px 14px',
                  borderRadius: 16,
                  border: selected === 'pro' ? '2px solid #2563EB' : `2px solid ${COLORS.cardBorder}`,
                  background: selected === 'pro' ? 'rgba(37,99,235,0.04)' : '#fff',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.18s',
                  position: 'relative',
                }}
              >
                {/* Most Popular badge */}
                <div
                  style={{
                    position: 'absolute',
                    top: -10,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #2563EB, #0EA5E9)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 800,
                    padding: '3px 10px',
                    borderRadius: 20,
                    whiteSpace: 'nowrap',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  MOST POPULAR
                </div>
                {selected === 'pro' && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      right: 10,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: '#2563EB',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      color: '#fff',
                      fontWeight: 700,
                    }}
                  >
                    ✓
                  </div>
                )}
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Pro Monthly
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                  <span style={{ fontSize: 26, fontWeight: 900, color: COLORS.textPrimary, fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-1px', lineHeight: 1 }}>$12</span>
                  <span style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 500 }}>/month</span>
                </div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3, fontWeight: 500 }}>
                  150 min / month
                </div>
                <div style={{ fontSize: 11, color: COLORS.textSecondary, marginTop: 8, lineHeight: 1.5 }}>
                  Full access from day one
                </div>
              </button>
            </div>

            {/* Features */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(37,99,235,0.03), rgba(14,165,233,0.03))',
                border: `1px solid rgba(37,99,235,0.1)`,
                borderRadius: 14,
                padding: '14px 16px',
                marginBottom: 20,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Everything included
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px 12px' }}>
                {FEATURES_PRO.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                    <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{f.icon}</span>
                    <span style={{ fontSize: 11.5, color: COLORS.textSecondary, lineHeight: 1.4, fontWeight: 500 }}>{f.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trial notice */}
            {selected === 'trial' && (
              <div
                style={{
                  background: 'rgba(217,119,6,0.06)',
                  border: '1px solid rgba(217,119,6,0.18)',
                  borderRadius: 12,
                  padding: '10px 14px',
                  marginBottom: 16,
                  fontSize: 12,
                  color: COLORS.warning,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                ⚠️ <strong>How the trial works:</strong> You get 3 days free. After that, you will be automatically charged $12/month for 150 minutes. You can cancel anytime from your account settings before the trial ends.
              </div>
            )}

            {/* CTA */}
            <button
              id="pricing-modal-continue-btn"
              onClick={handleContinue}
              style={{
                width: '100%',
                padding: '15px 24px',
                background: 'linear-gradient(135deg, #2563EB, #0EA5E9)',
                color: '#fff',
                border: 'none',
                borderRadius: 14,
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'var(--font-syne, system-ui)',
                letterSpacing: '-0.2px',
                boxShadow: '0 4px 20px rgba(37,99,235,0.35)',
                marginBottom: 10,
              }}
            >
              {selected === 'trial'
                ? '🚀 Start 3-Day Free Trial'
                : '✨ Subscribe & Get Started — $12/mo'}
            </button>

            <p style={{ textAlign: 'center', fontSize: 11, color: COLORS.textMuted, margin: 0, lineHeight: 1.6 }}>
              {selected === 'trial'
                ? 'No charge for 3 days • Cancel before trial ends to avoid billing'
                : 'Billed monthly • Cancel anytime'}
              {' '}• Secured by Ziina
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(32px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </>
  );
}
