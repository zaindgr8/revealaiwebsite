'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { GradientButton } from '@/components/GradientButton';
import { Icon } from '@/components/Icon';
import { AuthShell, AuthMobileLogo } from '@/components/AuthShell';
import { signUpWithOtp } from '@/lib/auth';

const AVATAR_SIZE = 92;

export default function SignUpPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onPick = () => fileRef.current?.click();

  const onPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim()) return setErrorMsg('Please enter your full name.');
    if (!email.trim() || !password) return setErrorMsg('Email and password are required.');
    if (password.length < 8) return setErrorMsg('Password must be at least 8 characters.');

    setLoading(true);
    try {
      await signUpWithOtp(email.trim(), password, fullName.trim());

      if (avatarFile) {
        try {
          sessionStorage.setItem(
            'pendingAvatar',
            JSON.stringify({
              name: avatarFile.name,
              type: avatarFile.type,
              size: avatarFile.size,
            })
          );
          (window as unknown as { __pendingAvatarFile?: File }).__pendingAvatarFile = avatarFile;
        } catch {}
      }

      router.push(`/verify-otp?email=${encodeURIComponent(email.trim())}`);
    } catch (e) {
      setErrorMsg((e as Error).message || 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <AuthMobileLogo />

      <h1 style={{ fontSize: 28, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 6 }}>
        Create your account
      </h1>
      <p style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 22 }}>
        We&apos;ll send a 6-digit code to verify your email.
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <button
          type="button"
          onClick={onPick}
          style={{ position: 'relative', cursor: 'pointer' }}
        >
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarPreview}
              alt="avatar"
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: AVATAR_SIZE / 2,
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                borderRadius: AVATAR_SIZE / 2,
                background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="camera" size={28} color={COLORS.white} />
            </div>
          )}
          <span
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 26,
              height: 26,
              borderRadius: 13,
              background: COLORS.blue,
              border: `2px solid ${COLORS.background}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="pencil" size={12} color={COLORS.white} />
          </span>
        </button>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8 }}>
          {avatarPreview ? 'Tap to change' : 'Add photo (optional)'}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onPicked}
        />
      </div>

      <form onSubmit={onSubmit}>
        <FieldLabel required>Full name</FieldLabel>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Doe"
          style={inputStyle}
          autoComplete="name"
        />

        <FieldLabel required>Email</FieldLabel>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={inputStyle}
          autoComplete="email"
        />

        <FieldLabel required>Password</FieldLabel>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          style={inputStyle}
          autoComplete="new-password"
        />

        {errorMsg && (
          <div style={{ marginTop: 14, color: COLORS.danger, fontSize: 13 }}>{errorMsg}</div>
        )}

        <div style={{ height: 24 }} />
        <GradientButton
          type="submit"
          title={loading ? 'Sending code...' : 'Continue'}
          disabled={loading}
        />
      </form>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button
          onClick={() => router.push('/login')}
          style={{ color: COLORS.textSecondary, fontSize: 13 }}
        >
          Already have an account?{' '}
          <span style={{ color: COLORS.blue, fontWeight: 700 }}>Log in</span>
        </button>
      </div>
    </AuthShell>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
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
      {children} {required && <span style={{ color: COLORS.danger }}>*</span>}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: COLORS.card,
  border: `1px solid ${COLORS.cardBorder}`,
  borderRadius: 14,
  padding: '14px 16px',
  color: COLORS.textPrimary,
  fontSize: 15,
};
