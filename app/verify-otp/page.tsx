'use client';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { GradientButton } from '@/components/GradientButton';
import { Icon } from '@/components/Icon';
import { AuthShell, AuthMobileLogo } from '@/components/AuthShell';
import { verifyOtp, resendOtp } from '@/lib/auth';
import { uploadAvatar } from '@/lib/profile';

const RESEND_COOLDOWN = 30;

function VerifyOtpInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get('email') ?? '';

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const onVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (token.length !== 6) {
      setErrorMsg('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const { user } = await verifyOtp(email, token);
      const pending = (window as unknown as { __pendingAvatarFile?: File }).__pendingAvatarFile;
      if (pending && user?.id) {
        try {
          await uploadAvatar(user.id, pending);
        } catch (err) {
          console.warn('avatar upload failed:', err);
        }
      }
      router.replace('/home');
    } catch (e) {
      setErrorMsg((e as Error).message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  const onResend = async () => {
    if (cooldown > 0) return;
    setErrorMsg(null);
    try {
      await resendOtp(email);
      setCooldown(RESEND_COOLDOWN);
      setNotice(`A new code was sent to ${email}.`);
    } catch (e) {
      setErrorMsg((e as Error).message || 'Try again later.');
    }
  };

  return (
    <AuthShell>
      <button
        onClick={() => router.back()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: COLORS.textSecondary,
          fontSize: 13,
          marginBottom: 24,
          padding: 0,
        }}
      >
        <Icon name="arrow-back" size={18} color={COLORS.textSecondary} />
        Back
      </button>

      <AuthMobileLogo />

      <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.white, marginBottom: 6 }}>
        Verify your email
      </h1>
      <p
        style={{
          fontSize: 14,
          color: COLORS.textSecondary,
          marginBottom: 28,
          lineHeight: 1.6,
        }}
      >
        We sent a 6-digit code to
        <br />
        <span style={{ color: COLORS.white, fontWeight: 700 }}>{email}</span>
      </p>

      <form onSubmit={onVerify}>
        <input
          type="text"
          inputMode="numeric"
          value={token}
          onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
          placeholder="------"
          autoFocus
          style={{
            width: '100%',
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 14,
            padding: '18px 0',
            color: COLORS.white,
            fontSize: 28,
            fontWeight: 800,
            letterSpacing: 12,
            textAlign: 'center',
          }}
        />

        {errorMsg && (
          <div style={{ marginTop: 14, color: COLORS.danger, fontSize: 13 }}>{errorMsg}</div>
        )}
        {notice && !errorMsg && (
          <div style={{ marginTop: 14, color: COLORS.green, fontSize: 13 }}>{notice}</div>
        )}

        <div style={{ height: 24 }} />
        <GradientButton
          type="submit"
          title={loading ? 'Verifying...' : 'Verify'}
          disabled={loading}
        />
      </form>

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <button
          onClick={onResend}
          disabled={cooldown > 0}
          style={{
            color: cooldown > 0 ? COLORS.textMuted : COLORS.blue,
            fontSize: 13,
            fontWeight: 700,
            cursor: cooldown > 0 ? 'default' : 'pointer',
          }}
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Didn't get it? Resend code"}
        </button>
      </div>
    </AuthShell>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div style={{ background: COLORS.background, minHeight: '100vh' }} />}>
      <VerifyOtpInner />
    </Suspense>
  );
}
