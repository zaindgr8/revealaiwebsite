'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { GradientButton } from '@/components/GradientButton';

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter both a username and a password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'Incorrect username or password.');
        return;
      }
      router.replace('/admin');
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: COLORS.background,
        fontFamily: 'var(--font-dm)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 20,
          padding: '36px 32px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(17,17,24,0.06)',
        }}
      >
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <Logo size={30} />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 100,
              background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.18)',
              fontSize: 11, fontWeight: 700, color: COLORS.blue,
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12,
            }}
          >
            <Icon name="lock" size={11} color={COLORS.blue} />
            Admin Access
          </div>
          <h1
            style={{
              fontSize: 20, fontWeight: 800, color: COLORS.textPrimary, margin: '0 0 6px',
              fontFamily: 'var(--font-syne)', letterSpacing: '-0.4px',
            }}
          >
            Operator sign-in
          </h1>
          <p style={{ fontSize: 13, color: COLORS.textMuted, margin: 0, lineHeight: 1.5 }}>
            Restricted to Reveal AI staff. Not for customer accounts.
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            autoFocus
            style={inputStyle}
          />

          <label style={{ ...labelStyle, marginTop: 14 }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            style={inputStyle}
          />

          {error && (
            <div
              style={{
                marginTop: 14, padding: '10px 12px', borderRadius: 10,
                background: `${COLORS.danger}0f`, border: `1px solid ${COLORS.danger}33`,
                color: COLORS.danger, fontSize: 12.5, lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ height: 22 }} />
          <GradientButton
            type="submit"
            title={loading ? 'Signing in…' : 'Sign in'}
            disabled={loading}
            style={{ borderRadius: 12, fontSize: 14 }}
          />
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: `1.5px solid ${COLORS.cardBorder}`, background: COLORS.surface,
  fontSize: 14, color: COLORS.textPrimary, outline: 'none', fontFamily: 'inherit',
};
