'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Logo, LogoText } from '@/components/Logo';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth-context';
import { Grid } from '@/components/Grid';

const features = [
  {
    emoji: '🧠',
    title: 'Your Loyal Friend',
    desc: 'Hears your burnout 7–14 days before you realize it. Understands your emotions. Tells you what you lack and what you must do.',
  },
  {
    emoji: '🔍',
    title: 'Your Mind Reader',
    desc: 'Senses conversations in your daily life — dating, corporate, social. Detects real vs fake. Jealousy. True interest. Gives you complete insights.',
  },
  {
    emoji: '🎤',
    title: 'Your Voice Coach',
    desc: 'Train before the interview, date, or boardroom. Record your voice. Get real-time suggestions. Sound confident.',
  },
];

const stats = [
  { value: '60s', label: 'Daily check-in' },
  { value: '7-14d', label: 'Early burnout signal' },
  { value: '100%', label: 'Private by default' },
];

export default function LandingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) router.replace('/home');
  }, [user, loading, router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.background,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* decorative glows */}
      <div
        style={{
          position: 'absolute',
          top: -180,
          right: -120,
          width: 460,
          height: 460,
          borderRadius: '50%',
          background: COLORS.blue,
          opacity: 0.08,
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
          opacity: 0.06,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* Top nav */}
      <header
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1200,
          margin: '0 auto',
          padding: '20px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Logo size={36} />
          <LogoText size={20} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '10px 16px',
              borderRadius: 12,
              color: COLORS.textSecondary,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Log in
          </button>
          <button
            onClick={() => router.push('/signup')}
            style={{
              padding: '10px 18px',
              borderRadius: 12,
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            Get Started
          </button>
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1200,
          margin: '0 auto',
          padding: '60px 24px 40px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            display: 'inline-block',
            background: 'rgba(0, 147, 208, 0.12)',
            border: '1px solid rgba(0, 147, 208, 0.3)',
            color: COLORS.blue,
            fontSize: 12,
            fontWeight: 700,
            padding: '6px 14px',
            borderRadius: 20,
            marginBottom: 24,
            letterSpacing: 0.5,
          }}
        >
          VOICE SAYS EVERYTHING
        </div>
        <h1
          style={{
            fontSize: 'clamp(34px, 5.5vw, 60px)',
            fontWeight: 800,
            color: COLORS.white,
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 20,
            maxWidth: 880,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Your AI companion that
          <br />
          <span className="gradient-text">hears what you can&apos;t say</span>
        </h1>
        <p
          style={{
            fontSize: 'clamp(15px, 1.6vw, 18px)',
            color: COLORS.textSecondary,
            lineHeight: 1.6,
            margin: '0 auto 36px',
            maxWidth: 640,
          }}
        >
          Reveal AI listens to a 60-second check-in and decodes your mood, energy and stress —
          spotting burnout weeks before you would. Private. Honest. Always there.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 12,
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginBottom: 48,
          }}
        >
          <button
            onClick={() => router.push('/signup')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 26px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Get Started Free
            <Icon name="arrow-forward" size={18} color={COLORS.white} />
          </button>
          <button
            onClick={() => router.push('/login')}
            style={{
              padding: '14px 26px',
              borderRadius: 14,
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.white,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            I already have an account
          </button>
        </div>

        {/* Stats strip */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 40,
            flexWrap: 'wrap',
          }}
        >
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: COLORS.white,
                  lineHeight: 1,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: COLORS.textMuted,
                  marginTop: 6,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1200,
          margin: '0 auto',
          padding: '40px 24px 80px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.white, margin: 0 }}>
            Three sides of you, one voice.
          </h2>
          <p style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 10 }}>
            Reveal AI works as your friend, your mind reader and your coach.
          </p>
        </div>
        <Grid cols={3}>
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.cardBorder}`,
                borderRadius: 22,
                padding: 28,
              }}
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>{f.emoji}</div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: COLORS.white,
                  marginBottom: 10,
                }}
              >
                {f.title}
              </div>
              <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </Grid>

        {/* CTA strip */}
        <div
          style={{
            marginTop: 56,
            background: `linear-gradient(135deg, rgba(0,147,208,0.12), rgba(2,218,139,0.08))`,
            border: '1px solid rgba(0,147,208,0.25)',
            borderRadius: 24,
            padding: '36px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 20,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.white, marginBottom: 8 }}>
              Start your first 60-second check-in
            </div>
            <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.55 }}>
              Free to try. No card. Your audio is deleted after analysis.
            </div>
          </div>
          <button
            onClick={() => router.push('/signup')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '14px 24px',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Create my account
            <Icon name="arrow-forward" size={18} color={COLORS.white} />
          </button>
        </div>
      </section>

      <footer
        style={{
          position: 'relative',
          zIndex: 2,
          textAlign: 'center',
          padding: '24px 24px 40px',
          color: COLORS.textMuted,
          fontSize: 12,
        }}
      >
        © Reveal AI · Voice Says Everything
      </footer>
    </div>
  );
}
