'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { verifyZiinaPayment } from '@/lib/subscription';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/lib/theme';

type VerifyState = 'checking' | 'success' | 'pending' | 'error';

function PaymentSuccessInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlPaymentIntentId = searchParams.get('paymentIntentId');
  const { user, loading: authLoading, refreshProfile } = useAuth();
  const [state, setState] = useState<VerifyState>('checking');
  const [minutesGranted, setMinutesGranted] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const pollCount = useRef(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (authLoading || !user || hasStarted.current) return;
    hasStarted.current = true;

    const verify = async () => {
      pollCount.current++;

      try {
        let paymentIntentId = urlPaymentIntentId;

        if (!paymentIntentId) {
          // Get pending payment intent ID from profile as fallback
          const { data: profile } = await supabase
            .from('profiles')
            .select('pending_payment_intent_id')
            .eq('id', user.id)
            .single();

          paymentIntentId = profile?.pending_payment_intent_id;
        }

        if (!paymentIntentId) {
          setState('error');
          setErrorMsg('No pending payment found. If you were charged, please contact support.');
          return;
        }

        const result = await verifyZiinaPayment(paymentIntentId);

        if (result.verified) {
          setMinutesGranted(result.minutesGranted ?? 150);
          setState('success');
          refreshProfile();
          // Auto-redirect after 3 seconds
          setTimeout(() => router.push('/home'), 3000);
        } else if (result.status === 'pending' || result.status === 'requires_user_action' || result.status === 'requires_payment_instrument') {
          if (pollCount.current < 10) {
            // Retry every 2 seconds for up to 20 seconds
            setTimeout(verify, 2000);
          } else {
            setState('pending');
          }
        } else {
          setState('error');
          setErrorMsg(`Payment status: ${result.status}. If you were charged, please contact support.`);
        }
      } catch (e) {
        if (pollCount.current < 5) {
          setTimeout(verify, 2000);
        } else {
          setState('error');
          setErrorMsg((e as Error).message);
        }
      }
    };

    verify();
  }, [authLoading, user, router, refreshProfile, urlPaymentIntentId]);

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
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          borderRadius: 24,
          boxShadow: '0 8px 40px rgba(37,99,235,0.10)',
          overflow: 'hidden',
        }}
      >
        {/* Gradient top bar */}
        <div
          style={{
            height: 6,
            background: `linear-gradient(90deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          }}
        />

        <div style={{ padding: '40px 32px 36px', textAlign: 'center' }}>
          {/* Checking */}
          {state === 'checking' && (
            <>
              <div
                style={{
                  width: 72,
                  height: 72,
                  border: `4px solid ${COLORS.cardBorder}`,
                  borderTopColor: COLORS.blue,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  margin: '0 auto 24px',
                }}
              />
              <h2 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 8px', fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-0.5px' }}>
                Verifying Payment…
              </h2>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: 0, lineHeight: 1.6 }}>
                Please wait while we confirm your payment with Ziina.
              </p>
            </>
          )}

          {/* Success */}
          {state === 'success' && (
            <>
              <div
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(22,163,74,0.12), rgba(22,163,74,0.06))',
                  border: '2px solid rgba(22,163,74,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 24px',
                  fontSize: 38,
                }}
              >
                ✅
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: COLORS.textPrimary, margin: '0 0 8px', fontFamily: 'var(--font-syne, system-ui)', letterSpacing: '-0.7px' }}>
                Payment Successful!
              </h2>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '0 0 24px', lineHeight: 1.6 }}>
                Your subscription is now active. You&apos;ve been granted{' '}
                <strong style={{ color: COLORS.blue }}>{minutesGranted} minutes</strong> of Reveal AI access.
              </p>

              {/* Minutes pill */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                  borderRadius: 16,
                  padding: '10px 22px',
                  color: '#fff',
                  fontSize: 15,
                  fontWeight: 800,
                  marginBottom: 24,
                  fontFamily: 'var(--font-syne, system-ui)',
                }}
              >
                🎙️ {minutesGranted} Minutes Unlocked
              </div>

              <p style={{ fontSize: 12, color: COLORS.textMuted, margin: '0 0 20px' }}>
                Redirecting to your dashboard in a moment…
              </p>

              <button
                onClick={() => router.push('/home')}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-syne, system-ui)',
                }}
              >
                Go to Dashboard →
              </button>
            </>
          )}

          {/* Still pending after polling */}
          {state === 'pending' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 20 }}>⏳</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 8px', fontFamily: 'var(--font-syne, system-ui)' }}>
                Payment Processing
              </h2>
              <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: '0 0 24px', lineHeight: 1.6 }}>
                Your payment is still being processed by Ziina. This can take a few minutes.
                Please check back shortly or contact support.
              </p>
              <button
                onClick={() => router.push('/payment')}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Back to Subscription
              </button>
            </>
          )}

          {/* Error */}
          {state === 'error' && (
            <>
              <div style={{ fontSize: 48, marginBottom: 20 }}>❌</div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 8px', fontFamily: 'var(--font-syne, system-ui)' }}>
                Verification Failed
              </h2>
              <p style={{
                fontSize: 13, color: COLORS.danger, margin: '0 0 24px', lineHeight: 1.6,
                background: 'rgba(239,68,68,0.06)', padding: '12px', borderRadius: 10,
                border: '1px solid rgba(239,68,68,0.15)'
              }}>
                {errorMsg || 'An unexpected error occurred.'}
              </p>
              <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
                <button
                  onClick={() => router.push('/payment')}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Try Again
                </button>
                <a
                  href="mailto:support@revealai.app"
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '14px',
                    background: 'transparent',
                    color: COLORS.textMuted,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 12,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    textAlign: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  Contact Support
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLORS.background }}>
        <div style={{ width: 32, height: 32, border: `3px solid ${COLORS.cardBorder}`, borderTopColor: COLORS.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    }>
      <PaymentSuccessInner />
    </Suspense>
  );
}

