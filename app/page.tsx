'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import './landing.css';

const WAVE_BAR_COUNT = 40;
// Deterministic pseudo-random heights (module-level so they're stable across renders
// and don't violate React purity rules). Rounded to integers so SSR and CSR produce
// identical serialized strings (avoids hydration mismatch on floating-point precision).
const WAVE_BAR_HEIGHTS: number[] = Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return Math.round(15 + frac * 50);
});

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // CTA destination — already signed in users skip auth.
  const ctaHref = user ? '/home' : '/signup';

  // Nav scroll effect
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll reveal via IntersectionObserver
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>('.reveal');
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            setTimeout(() => target.classList.add('visible'), i * 100);
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    targets.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const scrollTo = (id: string) => {
    closeMenu();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} className="landing-root">
      {/* Animated background orbs */}
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb" />
        <div className="orb" />
        <div className="orb" />
      </div>

      {/* Nav */}
      <nav className={`landing-nav${scrolled ? ' scrolled' : ''}`}>
        <button
          type="button"
          className="nav-logo"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Reveal AI"
        >
          <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M8 22 L14 22 L20 10 L26 30 L32 18 L36 18"
              stroke="url(#navGrad)"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
            <defs>
              <linearGradient id="navGrad" x1="8" y1="20" x2="36" y2="20">
                <stop stopColor="#0093d0" />
                <stop offset="1" stopColor="#02da8b" />
              </linearGradient>
            </defs>
          </svg>
          <span>
            Reveal<em> AI</em>
          </span>
        </button>

        <ul className={`nav-links${menuOpen ? ' show' : ''}`}>
          <li>
            <button type="button" onClick={() => scrollTo('problems')}>
              Problem
            </button>
          </li>
          <li>
            <button type="button" onClick={() => scrollTo('features')}>
              Features
            </button>
          </li>
          <li>
            <button type="button" onClick={() => scrollTo('how')}>
              How It Works
            </button>
          </li>
          <li>
            <Link href={ctaHref} prefetch className="nav-cta" onClick={closeMenu}>
              {user ? 'Open Dashboard' : 'Get Started'}
            </Link>
          </li>
        </ul>

        <button
          type="button"
          className="mobile-toggle"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="dot" />
            AI-Powered Voice Analysis
          </div>
          <h1>
            Your Voice Says
            <br />
            <span className="gradient-text">Everything</span>
          </h1>
          <p>
            Understand yourself. Decode others. Master your tone. Reveal AI listens to <em>how</em>{' '}
            you say it — not just what you say.
          </p>
          <div className="hero-buttons">
            <Link href={ctaHref} prefetch className="btn-store primary">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="store-text">
                <small>{user ? 'Continue to' : 'Get started on'}</small>
                <strong>{user ? 'Dashboard' : 'Web App'}</strong>
              </div>
            </Link>
            <Link href={ctaHref} prefetch className="btn-store secondary">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 010 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.991l-2.302 2.302-8.634-8.635z"
                  fill="#fff"
                />
              </svg>
              <div className="store-text">
                <small>Coming soon to</small>
                <strong>Mobile App</strong>
              </div>
            </Link>
          </div>
        </div>
        <div className="hero-scroll" aria-hidden="true">
          <span>Scroll</span>
          <div className="scroll-line" />
        </div>
      </section>

      {/* Problems */}
      <section className="problems" id="problems">
        <div className="container">
          <div className="reveal">
            <div className="section-label">The Problem</div>
            <h2 className="section-title">
              Three Silent Battles
              <br />
              You&apos;re Fighting
            </h2>
            <p className="section-desc">
              Every day, your voice hides more than it reveals. These invisible struggles hold you
              back.
            </p>
          </div>
          <div className="problems-grid">
            <div className="problem-card reveal">
              <div className="problem-icon">😔</div>
              <h3>Burning Out in Silence</h3>
              <p>
                You&apos;re exhausted. Energy dropping. But you don&apos;t realize it until it&apos;s
                too late. No one to listen. No one to truly understand.
              </p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-icon">🎭</div>
              <h3>Reading People Wrong</h3>
              <p>
                People around you mask their intentions. Are they genuine? Faking? Jealous? You
                can&apos;t tell — always a step behind.
              </p>
            </div>
            <div className="problem-card reveal">
              <div className="problem-icon">🎤</div>
              <h3>Not Sounding Like Yourself</h3>
              <p>
                You know what to say, but your voice doesn&apos;t match. Your tone is weak. Your
                energy is off. You sound less confident than you are.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 80 }}>
            <div className="section-label" style={{ justifyContent: 'center' }}>
              The Solution
            </div>
            <h2 className="section-title">
              Your Loyal <span className="gradient-text">Companion</span>
            </h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>
              Reveal AI listens — really listens. Not to what you say, but to how you say it.
            </p>
          </div>

          {/* Feature 1 */}
          <div className="feature-block reveal">
            <div className="feature-text">
              <div className="feature-number">01</div>
              <h3>Reflect — Daily Check-in</h3>
              <p>
                Record 60 seconds each morning. AI analyzes your tone, pace, and energy — detecting
                burnout patterns 7–14 days before you feel it. Get emotional insights no one else
                can give you.
              </p>
              <div className="feature-tags">
                <span>Burnout Detection</span>
                <span>Daily Check-ins</span>
                <span>Early Warning</span>
              </div>
            </div>
            <div className="feature-visual">
              <div className="feature-mockup">
                <div className="mockup-header">
                  <div className="mockup-avatar">
                    <svg viewBox="0 0 24 24" fill="#fff" width="20" height="20">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z" />
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                    </svg>
                  </div>
                  <div className="mockup-meta">
                    <strong>Morning Check-in</strong>
                    <span>Recording — 0:47</span>
                  </div>
                </div>
                <div className="mockup-wave">
                  {WAVE_BAR_HEIGHTS.map((h, i) => (
                    <span
                      key={i}
                      className="bar"
                      style={{ animationDelay: `${i * 0.06}s`, height: `${h}px` }}
                    />
                  ))}
                </div>
                <div className="mockup-result">
                  <div className="label">Mood Analysis</div>
                  <div className="emotion">Calm &amp; Focused</div>
                  <div className="confidence">Confidence: 87%</div>
                  <div className="bar-bg">
                    <div className="bar-fill" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2 */}
          <div className="feature-block reverse reveal">
            <div className="feature-text">
              <div className="feature-number">02</div>
              <h3>Intent Detector</h3>
              <p>
                Record conversations with consent. Reveal AI reveals true intentions behind
                people&apos;s words. Are they genuine? Jealous? Manipulative? Get real analysis of
                how people treat you.
              </p>
              <div className="feature-tags">
                <span>Sentiment Analysis</span>
                <span>Intent Detection</span>
                <span>Real Insights</span>
              </div>
            </div>
            <div className="feature-visual">
              <div
                className="feature-mockup"
                style={{
                  background: 'linear-gradient(145deg, rgba(2,218,139,0.12), rgba(0,147,208,0.08))',
                }}
              >
                <div className="mockup-header">
                  <div
                    className="mockup-avatar"
                    style={{ background: 'linear-gradient(135deg,#02da8b,#0093d0)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="#fff" width="20" height="20">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                    </svg>
                  </div>
                  <div className="mockup-meta">
                    <strong>Conversation Analysis</strong>
                    <span>2 speakers detected</span>
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'rgba(2,218,139,0.08)',
                      borderRadius: 12,
                      borderLeft: '3px solid var(--green)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        color: 'var(--green)',
                        marginBottom: 4,
                      }}
                    >
                      Speaker 1
                    </div>
                    <div style={{ color: 'var(--white)', fontSize: '0.9rem', fontWeight: 600 }}>
                      Genuine Interest
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                      Confidence 92%
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '14px 16px',
                      background: 'rgba(255,180,0,0.06)',
                      borderRadius: 12,
                      borderLeft: '3px solid #f0a030',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        textTransform: 'uppercase',
                        letterSpacing: 1,
                        color: '#f0a030',
                        marginBottom: 4,
                      }}
                    >
                      Speaker 2
                    </div>
                    <div style={{ color: 'var(--white)', fontSize: '0.9rem', fontWeight: 600 }}>
                      Guarded / Cautious
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                      Confidence 78%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Feature 3 */}
          <div className="feature-block reveal">
            <div className="feature-text">
              <div className="feature-number">03</div>
              <h3>Voice Tone Coach</h3>
              <p>
                Going on a date? Interview? Important meeting? Train your voice beforehand. Record
                yourself and get real-time suggestions on tone, energy, and confidence. Sound like
                your best self.
              </p>
              <div className="feature-tags">
                <span>Real-time Feedback</span>
                <span>Confidence Training</span>
                <span>Tone Mastery</span>
              </div>
            </div>
            <div className="feature-visual">
              <div
                className="feature-mockup"
                style={{
                  background: 'linear-gradient(145deg, rgba(0,147,208,0.15), rgba(2,218,139,0.05))',
                }}
              >
                <div className="mockup-header">
                  <div className="mockup-avatar">
                    <svg viewBox="0 0 24 24" fill="#fff" width="20" height="20">
                      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z" />
                      <path d="M12 15l1.57-3.43L17 10l-3.43-1.57L12 5l-1.57 3.43L7 10l3.43 1.57z" />
                    </svg>
                  </div>
                  <div className="mockup-meta">
                    <strong>Voice Training</strong>
                    <span>Practice Mode</span>
                  </div>
                </div>
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    gap: 16,
                  }}
                >
                  <ToneRow label="Confidence" value="High" color="var(--green)" width="82%" />
                  <ToneBar width="82%" />
                  <ToneRow label="Energy" value="Balanced" color="var(--blue)" width="68%" />
                  <ToneBar
                    width="68%"
                    fill="linear-gradient(90deg,#0093d0,#02da8b)"
                  />
                  <ToneRow label="Clarity" value="Excellent" color="var(--green)" width="91%" />
                  <ToneBar width="91%" />
                </div>
                <div
                  style={{
                    marginTop: 16,
                    textAlign: 'center',
                    padding: 12,
                    background: 'rgba(2,218,139,0.08)',
                    borderRadius: 12,
                  }}
                >
                  <span style={{ fontSize: '0.8rem', color: 'var(--green)', fontWeight: 600 }}>
                    💡 Tip: Slow down slightly for authority
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works" id="how">
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="reveal">
            <div className="section-label" style={{ justifyContent: 'center' }}>
              How It Works
            </div>
            <h2 className="section-title">Simple as 1-2-3</h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>
              Start understanding yourself in under a minute.
            </p>
          </div>
          <div className="steps-container">
            <Step n={1} title="Record Your Voice" desc="Just 60 seconds each morning. Press record and speak naturally." />
            <Step n={2} title="AI Analyzes" desc="Our AI decodes tone, pace, energy, and emotional patterns in real time." />
            <Step n={3} title="Get Insights" desc="Receive actionable feedback, burnout alerts, and voice coaching tips." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="download">
        <div className="container">
          <div className="cta-card reveal">
            <h2>
              Ready to Decode
              <br />
              Your <span className="gradient-text">Voice</span>?
            </h2>
            <p>
              {user
                ? 'Welcome back. Pick up where you left off.'
                : 'Create your free account in seconds. Start your journey to self-awareness today.'}
            </p>
            <div className="cta-stores">
              <Link href={ctaHref} prefetch className="btn-store primary">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
                <div className="store-text">
                  <small>{user ? 'Continue to' : 'Get started on'}</small>
                  <strong>{user ? 'Dashboard' : 'Web App'}</strong>
                </div>
              </Link>
              <Link href={ctaHref} prefetch className="btn-store secondary">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.807 1.626a1 1 0 010 1.732l-2.807 1.626L15.206 12l2.492-2.492zM5.864 2.658L16.8 8.991l-2.302 2.302-8.634-8.635z" />
                </svg>
                <div className="store-text">
                  <small>Coming soon to</small>
                  <strong>Mobile App</strong>
                </div>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-inner">
          <div className="footer-logo">
            <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M8 22 L14 22 L20 10 L26 30 L32 18 L36 18"
                stroke="url(#footGrad)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <defs>
                <linearGradient id="footGrad" x1="8" y1="20" x2="36" y2="20">
                  <stop stopColor="#0093d0" />
                  <stop offset="1" stopColor="#02da8b" />
                </linearGradient>
              </defs>
            </svg>
            <span>
              Reveal<em> AI</em>
            </span>
          </div>
          <p>&copy; 2026 Reveal AI — All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <div className="step reveal">
      <div className="step-number">
        <span>{n}</span>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

function ToneRow({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
  width: string;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
      <span style={{ fontSize: '0.85rem', color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function ToneBar({ width, fill }: { width: string; fill?: string }) {
  return (
    <div
      style={{
        height: 6,
        background: 'rgba(255,255,255,0.08)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width,
          background: fill ?? 'var(--gradient)',
          borderRadius: 6,
        }}
      />
    </div>
  );
}
