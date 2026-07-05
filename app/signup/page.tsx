'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { GradientButton } from '@/components/GradientButton';
import { Icon } from '@/components/Icon';
import { AuthShell, AuthMobileLogo } from '@/components/AuthShell';
import { signUpWithOtp } from '@/lib/auth';
import '../auth.css';

const AVATAR_SIZE = 86;

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
          sessionStorage.setItem('pendingAvatar', JSON.stringify({ name: avatarFile.name, type: avatarFile.type, size: avatarFile.size }));
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

      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111118', margin: '0 0 8px', fontFamily: 'var(--font-syne)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Create your account
        </h1>
        <p style={{ fontSize: 14, color: 'rgba(17,17,24,0.55)', margin: 0, lineHeight: 1.65 }}>
          We&apos;ll send a 6-digit code to verify your email.
        </p>
      </div>

      {/* Avatar picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8, padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14 }}>
        <button type="button" onClick={onPick} style={{ position: 'relative', cursor: 'pointer', flexShrink: 0, background: 'none', border: 'none', padding: 0 }}>
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="avatar" style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, objectFit: 'cover', border: '2px solid rgba(79,141,245,0.5)' }} />
          ) : (
            <div style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2, background: 'linear-gradient(135deg,#4f8df5,#22d3ee)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={24} color="#fff" />
            </div>
          )}
          <span style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, background: '#4f8df5', border: '2px solid #07070d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pencil" size={10} color="#fff" />
          </span>
        </button>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111118', marginBottom: 3, fontFamily: 'var(--font-dm)' }}>Profile photo</div>
          <div style={{ fontSize: 12, color: 'rgba(17,17,24,0.42)', lineHeight: 1.4 }}>{avatarPreview ? 'Click to change' : 'Optional — add a photo'}</div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPicked} />
      </div>

      <form onSubmit={onSubmit}>
        <label className="auth-label">Full name <span style={{ color: '#f87171' }}>*</span></label>
        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" className="auth-input" autoComplete="name" />

        <label className="auth-label">Email <span style={{ color: '#f87171' }}>*</span></label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="auth-input" autoComplete="email" />

        <label className="auth-label">Password <span style={{ color: '#f87171' }}>*</span></label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="auth-input" autoComplete="new-password" />

        {errorMsg && <div className="auth-error">{errorMsg}</div>}

        <div style={{ height: 28 }} />
        <GradientButton
          type="submit"
          title={loading ? 'Sending code…' : 'Continue'}
          disabled={loading}
          style={{ borderRadius: 12, fontSize: 15, fontWeight: 700 }}
        />
      </form>

      <div className="auth-switch">
        Already have an account?{' '}
        <span onClick={() => router.push('/login')}>Log in</span>
      </div>
    </AuthShell>
  );
}
