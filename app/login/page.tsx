'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { GradientButton } from '@/components/GradientButton';
import { AuthShell, AuthMobileLogo } from '@/components/AuthShell';
import { signIn } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!email.trim() || !password) {
      setErrorMsg('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace('/home');
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (msg.toLowerCase().includes('not confirmed')) {
        router.push(`/verify-otp?email=${encodeURIComponent(email.trim())}`);
      } else {
        setErrorMsg(msg || 'Invalid credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthMobileLogo />

      <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.white, marginBottom: 6 }}>
        Welcome back
      </h1>
      <p style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 28 }}>
        Log in to continue your journey.
      </p>

      <form onSubmit={onSubmit}>
        <FieldLabel>Email</FieldLabel>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={inputStyle}
          autoComplete="email"
        />

        <div style={{ height: 8 }} />
        <FieldLabel>Password</FieldLabel>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          style={inputStyle}
          autoComplete="current-password"
        />

        {errorMsg && (
          <div style={{ marginTop: 14, color: COLORS.danger, fontSize: 13 }}>{errorMsg}</div>
        )}

        <div style={{ height: 24 }} />
        <GradientButton
          type="submit"
          title={loading ? 'Logging in...' : 'Log in'}
          disabled={loading}
        />
      </form>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          onClick={() => router.push('/signup')}
          style={{ color: COLORS.textSecondary, fontSize: 13 }}
        >
          New here?{' '}
          <span style={{ color: COLORS.blue, fontWeight: 700 }}>Create an account</span>
        </button>
      </div>
    </AuthShell>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 700,
        color: COLORS.textSecondary,
        marginBottom: 8,
        marginTop: 14,
      }}
    >
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 14,
  padding: '14px 16px',
  color: COLORS.white,
  fontSize: 15,
};
