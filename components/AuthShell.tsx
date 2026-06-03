'use client';
import React from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Logo, LogoText } from './Logo';
import { useIsMobile } from '@/hooks/useMediaQuery';

export function AuthShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const isMobile = useIsMobile();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.background,
        display: 'flex',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -180,
          right: -120,
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: COLORS.blue,
          opacity: 0.07,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -200,
          left: -160,
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: COLORS.green,
          opacity: 0.05,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* Left promo (desktop only) */}
      {!isMobile && (
        <aside
          style={{
            width: '50%',
            maxWidth: 620,
            padding: '60px 56px',
            position: 'relative',
            zIndex: 2,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            borderRight: `1px solid ${COLORS.cardBorder}`,
            background: 'rgba(19, 24, 41, 0.4)',
          }}
        >
          <button
            onClick={() => router.push('/')}
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <Logo size={36} />
            <LogoText size={20} />
          </button>

          <div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                color: COLORS.white,
                lineHeight: 1.15,
                marginBottom: 18,
              }}
            >
              Your voice tells us what words can&apos;t.
            </div>
            <div style={{ fontSize: 15, color: COLORS.textSecondary, lineHeight: 1.7 }}>
              Reveal AI listens to a short daily check-in and decodes your mood, energy and
              stress — spotting burnout weeks before you would.
            </div>

            <ul style={{ listStyle: 'none', padding: 0, marginTop: 28 }}>
              {[
                'Detects burnout 7–14 days earlier',
                'Honest insights, not generic affirmations',
                'Private by default — audio is deleted after analysis',
              ].map((line) => (
                <li
                  key={line}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: 14,
                    color: COLORS.textSecondary,
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: COLORS.green,
                      flexShrink: 0,
                    }}
                  />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ fontSize: 12, color: COLORS.textMuted }}>
            © Reveal AI · Voice Says Everything
          </div>
        </aside>
      )}

      {/* Right form area */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: isMobile ? '40px 20px' : '32px 20px',
          position: 'relative',
          zIndex: 2,
        }}
      >
        <div style={{ width: '100%', maxWidth: 440 }}>{children}</div>
      </main>
    </div>
  );
}

export function AuthMobileLogo() {
  const isMobile = useIsMobile();
  if (!isMobile) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
      <Logo size={56} />
    </div>
  );
}
