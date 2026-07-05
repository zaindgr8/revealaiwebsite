'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { useIsMobile } from '@/hooks/useMediaQuery';

const C = {
  bg: '#f7f7f9',
  text: '#111118',
  muted: 'rgba(17,17,24,0.58)',
  faint: 'rgba(17,17,24,0.38)',
  border: 'rgba(17,17,24,0.09)',
  surface: '#ffffff',
  blue: '#2563eb',
  sky: '#0ea5e9',
  gradient: 'linear-gradient(135deg,#2563eb,#0ea5e9)',
};

const BULLETS = [
  'Detects burnout 7–14 days earlier',
  'Honest insights, not generic affirmations',
  'Private by default — audio is deleted after analysis',
];

export function AuthShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: 'var(--font-dm)',
      background: [
        'radial-gradient(ellipse at 10% 20%, rgba(37,99,235,0.13) 0%, transparent 50%)',
        'radial-gradient(ellipse at 90% 10%, rgba(14,165,233,0.11) 0%, transparent 45%)',
        'radial-gradient(ellipse at 50% 95%, rgba(99,102,241,0.08) 0%, transparent 48%)',
        'linear-gradient(160deg, #f0f5ff 0%, #f8faff 50%, #f7f7f9 100%)',
      ].join(','),
    }}>

      {/* ── Left promo panel (desktop) ── */}
      {!isMobile && (
        <aside style={{
          width: '46%', maxWidth: 560,
          padding: '52px 56px',
          position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          borderRight: `1px solid ${C.border}`,
          background: 'rgba(255,255,255,0.5)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}>

          {/* Logo */}
          <button onClick={() => router.push('/')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
            <Logo size={28} />
          </button>

          {/* Main content */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            {/* Headline */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 38, fontWeight: 800, color: C.text, lineHeight: 1.15, letterSpacing: '-1.8px', fontFamily: 'var(--font-syne)', marginBottom: 16 }}>
                Your voice tells us<br />
                what{' '}
                <span style={{ background: C.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                  words can&apos;t.
                </span>
              </div>
              <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.75, margin: 0 }}>
                Reveal AI listens to a short daily check-in and decodes your mood, energy and stress — spotting burnout weeks before you would.
              </p>
            </div>

            {/* Bullet points */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 28 }}>
              {BULLETS.map((text) => (
                <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(37,99,235,0.08)',
                    border: '1px solid rgba(37,99,235,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Icon name="checkmark" size={13} color="#2563eb" />
                  </div>
                  <span style={{ fontSize: 14, color: C.text, lineHeight: 1.5, fontWeight: 500 }}>{text}</span>
                </div>
              ))}
            </div>

            {/* Stats row */}
            <div style={{ display: 'flex', paddingTop: 22, borderTop: `1px solid ${C.border}`, marginBottom: 24 }}>
              {[
                { val: '10K+', label: 'Professionals' },
                { val: '7–14', label: 'Days early' },
                { val: '60s', label: 'Daily habit' },
              ].map(({ val, label }, i) => (
                <div key={val} style={{
                  flex: 1, textAlign: 'center',
                  paddingLeft: i > 0 ? 16 : 0,
                  borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
                }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.text, fontFamily: 'var(--font-syne)', letterSpacing: '-0.8px', lineHeight: 1, marginBottom: 5, background: C.gradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{val}</div>
                  <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</div>
                </div>
              ))}
            </div>

            {/* Testimonial */}
            <div style={{
              padding: '16px 18px',
              background: '#ffffff',
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 2px 12px rgba(37,99,235,0.06)',
            }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: C.gradient }} />
              <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.68, margin: '0 0 14px', fontStyle: 'italic' }}>
                &ldquo;I noticed I was burning out two weeks before my doctor told me. Reveal AI caught it first.&rdquo;
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: '50%', background: C.gradient, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10.5, fontWeight: 700, color: '#fff', flexShrink: 0, fontFamily: 'var(--font-syne)' }}>AC</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>Alex Chen</div>
                  <div style={{ fontSize: 11.5, color: C.faint, marginTop: 1 }}>Software Engineer</div>
                </div>
                <div style={{ marginLeft: 'auto', color: '#f59e0b', fontSize: 11, letterSpacing: 1 }}>★★★★★</div>
              </div>
            </div>
          </div>

          <p style={{ fontSize: 11.5, color: C.faint, margin: 0 }}>
            &copy; 2026 Reveal AI &middot; Voice Says Everything
          </p>
        </aside>
      )}

      {/* ── Right form area ── */}
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '52px 20px' : '40px 40px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{
          width: '100%', maxWidth: 420,
          background: '#ffffff',
          border: `1px solid ${C.border}`,
          borderRadius: 24,
          padding: '40px 36px',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(37,99,235,0.08), 0 2px 12px rgba(17,17,24,0.06)',
        }}>
          {/* Top gradient accent */}
          <div style={{ position: 'absolute', top: 0, left: '20%', right: '20%', height: 2, background: C.gradient }} />
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthMobileLogo() {
  const isMobile = useIsMobile();
  const router = useRouter();
  if (!isMobile) return null;
  return (
    <button onClick={() => router.push('/')} style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
      <Logo size={40} />
    </button>
  );
}
