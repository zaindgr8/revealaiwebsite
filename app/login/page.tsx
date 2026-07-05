'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GradientButton } from '@/components/GradientButton';
import { AuthShell, AuthMobileLogo } from '@/components/AuthShell';
import { signIn } from '@/lib/auth';
import '../auth.css';

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

      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111118', marginBottom: 8, fontFamily: 'var(--font-syne)', letterSpacing: '-1px', lineHeight: 1.1, margin: '0 0 8px' }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(17,17,24,0.55)', margin: 0, lineHeight: 1.65 }}>
          Log in to continue your journey.
        </p>
      </div>

      <form onSubmit={onSubmit}>
        <label className="auth-label">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="auth-input"
          autoComplete="email"
        />

        <label className="auth-label">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
          className="auth-input"
          autoComplete="current-password"
        />

        {errorMsg && (
          <div className="auth-error">{errorMsg}</div>
        )}

        <div style={{ height: 28 }} />
        <GradientButton
          type="submit"
          title={loading ? 'Logging in…' : 'Log in'}
          disabled={loading}
          style={{ borderRadius: 12, fontSize: 15, fontWeight: 700 }}
        />
      </form>

      <div className="auth-switch">
        New here?{' '}
        <span onClick={() => router.push('/signup')}>Create an account</span>
      </div>
    </AuthShell>
  );
}
