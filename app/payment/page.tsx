'use client';
import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { createZiinaPayment, getSubscriptionStatus, type SubscriptionStatus } from '@/lib/subscription';
import { COLORS } from '@/lib/theme';

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'rgba(37,99,235,0.04)',
        borderRadius: 12,
        border: '1px solid rgba(37,99,235,0.1)',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      <span style={{ fontSize: 13.5, color: COLORS.textSecondary, fontWeight: 500 }}>{text}</span>
    </div>
  );
}

function PaymentInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wasCancelled = searchParams.get('cancelled') === 'true';
  const wasFailed = searchParams.get('failed') === 'true';

  useEffect(() => {
    if (!user && !authLoading) {
      router.replace('/');
      return;
    }
    if (!user) return;

    getSubscriptionStatus()
      .then(setSubStatus)
      .catch(() => setSubStatus(null))
      .finally(() => setIsLoading(false));
  }, [user, authLoading, router]);

  const handleSubscribe = async () => {
    setError(null);
    setIsPaying(true);
    try {
      const { redirectUrl } = await createZiinaPayment();
      // Redirect to Ziina hosted checkout
      window.location.href = redirectUrl;
    } catch (e) {
      setError((e as Error).message || 'Failed to start payment. Please try again.');
      setIsPaying(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.background }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${COLORS.cardBorder}`, borderTopColor: COLORS.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  const isTrialExpired = subStatus && !subStatus.trialActive && subStatus.status !== 'active';
  const isOutOfMinutes = subStatus?.needsTopUp;
  const isTopUp = isOutOfMinutes && !isTrialExpired;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.background,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: 'var(--font-dm, system-ui, sans-serif)',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo / Brand header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              background: '#fff',
              border: `1.5px solid ${COLORS.cardBorder}`,
              borderRadius: 16,
              padding: '10px 20px',
              boxShadow: '0 2px 12px rgba(37,99,235,0.08)',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
              }}
            >
              🧠
            </div>
            <span
              style={{
                fontSize: 18,
                fontWeight: 800,
                color: COLORS.textPrimary,
                fontFamily: 'var(--font-syne, system-ui)',
                letterSpacing: '-0.5px',
              }}
            >
              Reveal AI
            </span>
          </div>
        </div>

        {/* Main card */}
        <div
          style={{
            background: '#fff',
            borderRadius: 24,
            boxShadow: '0 8px 40px rgba(37,99,235,0.10), 0 2px 8px rgba(0,0,0,0.04)',
            overflow: 'hidden',
          }}
        >
          {/* Gradient header */}
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.gradientStart} 0%, ${COLORS.gradientEnd} 100%)`,
              padding: '32px 28px 28px',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative orbs */}
            <div style={{ position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', right: 40, bottom: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }} />

            <div style={{ position: 'relative', zIndex: 1 }}>
              {/* Badge */}
              <div
                style={{
                  display: 'inline-block',
                  background: 'rgba(255,255,255,0.2)',
                  border: '1px solid rgba(255,255,255,0.3)',
                  borderRadius: 20,
                  padding: '4px 14px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: '#fff',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                }}
              >
                {isTopUp ? '🔋 Top-Up Required' : isTrialExpired ? '⏰ Trial Ended' : '✨ Unlock Full Access'}
              </div>

              <h1
                style={{
                  fontSize: 28,
                  fontWeight: 900,
                  color: '#fff',
                  margin: '0 0 8px',
                  fontFamily: 'var(--font-syne, system-ui)',
                  letterSpacing: '-0.8px',
                  lineHeight: 1.15,
                }}
              >
                {isTopUp
                  ? 'You\'ve used all 150 minutes'
                  : isTrialExpired
                  ? 'Your free trial has ended'
                  : 'Start Your Free Trial'}
              </h1>
              <p
                style={{
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.85)',
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {isTopUp
                  ? 'Get 150 more minutes of AI-powered mood analysis for just $12.'
                  : isTrialExpired
                  ? 'Subscribe to continue your mental wellness journey with Reveal AI.'
                  : '3 days free, then $12/month for 150 minutes of deep voice analysis.'}
              </p>
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '28px 28px 32px' }}>

            {/* Alert if payment was cancelled or failed */}
            {(wasCancelled || wasFailed) && (
              <div
                style={{
                  background: wasFailed ? 'rgba(239,68,68,0.06)' : 'rgba(217,119,6,0.06)',
                  border: `1px solid ${wasFailed ? 'rgba(239,68,68,0.2)' : 'rgba(217,119,6,0.2)'}`,
                  borderRadius: 12,
                  padding: '12px 16px',
                  marginBottom: 20,
                  fontSize: 13,
                  color: wasFailed ? COLORS.danger : COLORS.warning,
                  fontWeight: 600,
                }}
              >
                {wasFailed
                  ? '❌ Payment failed. Please try again or use a different card.'
                  : '⚠️ Payment was cancelled. You can try again anytime.'}
              </div>
            )}

            {/* Pricing pill */}
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(37,99,235,0.04), rgba(14,165,233,0.04))',
                border: '1.5px solid rgba(37,99,235,0.15)',
                borderRadius: 16,
                padding: '20px 20px',
                marginBottom: 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                  {isTopUp ? 'Top-Up Pack' : 'Monthly Plan'}
                </div>
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 38, fontWeight: 900, color: COLORS.textPrimary, fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-1.5px' }}>$12</span>
                  {!isTopUp && (
                    <span style={{ fontSize: 14, color: COLORS.textMuted, fontWeight: 500 }}>/month</span>
                  )}
                </div>
                {!isTopUp && (
                  <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>
                    3-day free trial • Cancel anytime
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.blue, fontFamily: 'var(--font-syne, system-ui)' }}>150</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>minutes</div>
              </div>
            </div>

            {/* Features list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              <Feature icon="🎙️" text="150 minutes of voice analysis per pack" />
              <Feature icon="🧬" text="AI mood & energy detection from voice" />
              <Feature icon="📈" text="Personal wellness trends & insights" />
              <Feature icon="💬" text="AI therapy chat between sessions" />
              <Feature icon="🔒" text="Private & encrypted — your data stays yours" />
            </div>

            {/* Error */}
            {error && (
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: COLORS.danger, fontWeight: 500 }}>
                {error}
              </div>
            )}

            {/* CTA Button */}
            <button
              id="subscribe-btn"
              onClick={handleSubscribe}
              disabled={isPaying}
              style={{
                width: '100%',
                padding: '16px 24px',
                background: isPaying
                  ? COLORS.cardBorder
                  : `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                color: isPaying ? COLORS.textMuted : '#fff',
                border: 'none',
                borderRadius: 14,
                fontSize: 16,
                fontWeight: 800,
                cursor: isPaying ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-syne, system-ui)',
                letterSpacing: '-0.2px',
                transition: 'all 0.2s',
                boxShadow: isPaying ? 'none' : '0 4px 20px rgba(37,99,235,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              {isPaying ? (
                <>
                  <span style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: COLORS.textMuted, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                  Connecting to Ziina…
                </>
              ) : isTopUp ? (
                '🔋 Top-Up 150 Minutes — $12'
              ) : (
                '✨ Subscribe Now — $12/month'
              )}
            </button>

            {/* Ziina badge */}
            <div style={{ textAlign: 'center', marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>Secured by</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textSecondary, letterSpacing: '-0.2px' }}>Ziina</span>
              <span style={{ fontSize: 11, color: COLORS.textMuted }}>• All major cards accepted</span>
            </div>

            {/* Back link for top-up (user might still have some minutes or just wants to go home) */}
            {isTopUp && (
              <button
                onClick={() => router.push('/home')}
                style={{
                  width: '100%',
                  marginTop: 12,
                  background: 'transparent',
                  border: `1px solid ${COLORS.cardBorder}`,
                  borderRadius: 12,
                  padding: '12px',
                  fontSize: 13,
                  color: COLORS.textMuted,
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                ← Back to Dashboard
              </button>
            )}
          </div>
        </div>

        {/* Footer note */}
        <p style={{ textAlign: 'center', fontSize: 12, color: COLORS.textMuted, marginTop: 20, lineHeight: 1.5 }}>
          By subscribing you agree to our Terms of Service.<br />
          Payments processed securely via Ziina.
        </p>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function PaymentPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.background }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${COLORS.cardBorder}`, borderTopColor: COLORS.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <PaymentInner />
    </Suspense>
  );
}

