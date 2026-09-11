'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { PricingModal } from '@/components/PricingModal';
import './landing.css';

const WAVE_BAR_COUNT = 40;
const WAVE_BAR_HEIGHTS: number[] = Array.from({ length: WAVE_BAR_COUNT }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return Math.round(15 + frac * 50);
});

// Decorative spectrum strip along the hero floor — echoes the voice-waveform brand motif.
const SPECTRUM_BAR_COUNT = 58;
const SPECTRUM_HEIGHTS: number[] = Array.from({ length: SPECTRUM_BAR_COUNT }, (_, i) => {
  const seed = Math.sin(i * 9.7354 + 1.2) * 43758.5453;
  const frac = seed - Math.floor(seed);
  const bell = Math.exp(-Math.pow((i - 29) / 18, 2));
  return Math.round((10 + frac * 46) * (0.35 + bell * 0.65));
});

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const ctaHref = user ? '/home' : '/signup';

  // Open pricing modal for non-logged-in users; logged-in go straight to /home
  const handleGetStarted = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      setShowPricingModal(true);
    }
  };

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // All entrance/scroll animations are pure enhancement: every animated element is
    // already visible via CSS by default, so a failed/slow import never hides content —
    // it just skips the motion. gsap is imported statically (not via a racy dynamic
    // import) so the hero timeline runs synchronously on mount, no promise race.
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ctx: any;

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      if (cancelled || !rootRef.current) return;

      gsap.registerPlugin(ScrollTrigger);

      ctx = gsap.context(() => {
        const heroTl = gsap.timeline({ delay: 0.15 });
        heroTl
          .fromTo('.hero-badge', { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' })
          .fromTo('.hero-h1', { opacity: 0, y: 56 }, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out' }, '-=0.35')
          .fromTo('.hero-sub', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out' }, '-=0.45')
          .fromTo('.hero-buttons', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.35')
          .fromTo('.hero-stats', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.25')
          .fromTo('.hero-visual', { opacity: 0, y: 30, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out' }, '-=0.5');

        gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, y: 50 }, {
            opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });

        gsap.fromTo('.problems-grid .problem-card', { opacity: 0, y: 44 }, {
          opacity: 1, y: 0, duration: 0.75, stagger: 0.13, ease: 'power3.out',
          scrollTrigger: { trigger: '.problems-grid', start: 'top 82%', once: true },
        });

        gsap.fromTo('.trust-grid .problem-card', { opacity: 0, y: 44 }, {
          opacity: 1, y: 0, duration: 0.75, stagger: 0.13, ease: 'power3.out',
          scrollTrigger: { trigger: '.trust-grid', start: 'top 82%', once: true },
        });

        gsap.fromTo('.feat-item', { opacity: 0, y: 36 }, {
          opacity: 1, y: 0, duration: 0.75, stagger: 0.12, ease: 'power3.out',
          scrollTrigger: { trigger: '.features-grid', start: 'top 82%', once: true },
        });

        gsap.fromTo('.step', { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.16, ease: 'power3.out',
          scrollTrigger: { trigger: '.steps-container', start: 'top 84%', once: true },
        });

        gsap.fromTo('.pricing-card', { opacity: 0, y: 40 }, {
          opacity: 1, y: 0, duration: 0.7, stagger: 0.1, ease: 'power3.out',
          scrollTrigger: { trigger: '.pricing-grid', start: 'top 82%', once: true },
        });

        gsap.fromTo('.cta-card', { opacity: 0, scale: 0.97, y: 40 }, {
          opacity: 1, scale: 1, y: 0, duration: 1, ease: 'power3.out',
          scrollTrigger: { trigger: '.cta-card', start: 'top 88%', once: true },
        });

        gsap.utils.toArray<HTMLElement>('.orb').forEach((orb, i) => {
          gsap.to(orb, {
            y: i % 2 === 0 ? 120 : -90, ease: 'none',
            scrollTrigger: { trigger: 'body', start: 'top top', end: 'bottom top', scrub: 2 },
          });
        });

        document.querySelectorAll<HTMLElement>('.btn-magnetic').forEach((btn) => {
          btn.addEventListener('mousemove', (ev: Event) => {
            const e = ev as MouseEvent;
            const rect = btn.getBoundingClientRect();
            gsap.to(btn, { x: (e.clientX - rect.left - rect.width / 2) * 0.18, y: (e.clientY - rect.top - rect.height / 2) * 0.18, duration: 0.4, ease: 'power2.out' });
          });
          btn.addEventListener('mouseleave', () => {
            gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
          });
        });
      }, rootRef);
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const scrollTo = (id: string) => {
    closeMenu();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={rootRef} className="landing-root">
      <div className="noise-overlay" aria-hidden="true" />
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb" /><div className="orb" /><div className="orb" />
      </div>

      {/* Nav */}
      <nav className={`landing-nav${scrolled ? ' scrolled' : ''}`}>
        <button type="button" className="nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Reveal AI">
          <Logo size={30} />
        </button>
        <ul className={`nav-links${menuOpen ? ' show' : ''}`}>
          <li><button type="button" onClick={() => scrollTo('problems')}>Problem</button></li>
          <li><button type="button" onClick={() => scrollTo('features')}>Features</button></li>
          <li><button type="button" onClick={() => scrollTo('how')}>How It Works</button></li>
          <li><button type="button" onClick={() => scrollTo('pricing')}>Pricing</button></li>
          <li>
            <Link href={ctaHref} prefetch className="nav-cta" onClick={(e) => { closeMenu(); handleGetStarted(e); }}>
              {user ? 'Open Dashboard' : 'Get Started'}
            </Link>
          </li>
        </ul>
        <button type="button" className="mobile-toggle" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu" aria-expanded={menuOpen}>
          <span /><span /><span />
        </button>
      </nav>

      {/* Hero */}
      <section className="hero" id="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badge"><span className="dot" />Private voice check-ins, decoded by AI</div>
            <h1 className="hero-h1">
              Your Voice<br />
              Says <span className="hero-gradient-text">Everything</span>
            </h1>
            <p className="hero-sub">
              A minute of honest reflection, most days. Reveal AI listens to{' '}
              <em>how</em>{' '}you sound — pace, tension, the pauses — and tells you
              what it&apos;s hearing before burnout does.
            </p>
            <div className="hero-buttons">
              <Link href={ctaHref} prefetch className="btn-lg btn-primary btn-magnetic" onClick={handleGetStarted}>
                <Icon name="mic" size={18} color="#fff" />
                {user ? 'Open Dashboard' : 'Start Your Free Check-In'}
              </Link>
              <button type="button" className="btn-lg btn-secondary" onClick={() => scrollTo('how')}>
                See How It Works
              </button>
            </div>
            <div className="hero-stats">
              <div className="hero-stat"><span className="hstat-val">60s</span><span className="hstat-label">A check-in</span></div>
              <div className="hstat-sep" />
              <div className="hero-stat"><span className="hstat-val">7–14</span><span className="hstat-label">Days earlier warning</span></div>
              <div className="hstat-sep" />
              <div className="hero-stat"><span className="hstat-val">3 days</span><span className="hstat-label">Free, no strings</span></div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="preview-card" aria-hidden="true">
              <div className="preview-top">
                <span className="preview-label">Today&apos;s check-in</span>
                <span className="preview-time">Analyzed in 12s</span>
              </div>
              <div className="preview-score">
                <span className="preview-score-num">78</span>
                <span className="preview-score-word">Good</span>
              </div>
              <p className="preview-insight">
                &ldquo;You sound steady today — a little tired underneath it, but nothing heavy.&rdquo;
              </p>
              <div className="preview-bars">
                <PreviewBar label="Energy" value={68} />
                <PreviewBar label="Stress" value={32} />
                <PreviewBar label="Confidence" value={82} />
              </div>
              <div className="preview-footer">
                <Icon name="mic" size={13} color="var(--faint)" />
                Voice check-in · Elena
              </div>
            </div>
            <div className="preview-float preview-float-1">
              <Icon name="warning" size={14} color="#D97706" />
              <span>Energy trending down — 3 sessions</span>
            </div>
            <div className="preview-float preview-float-2">
              <Icon name="trending-up" size={14} color="#16a34a" />
              <span>Day 12 streak</span>
            </div>
            <div className="hero-spectrum" aria-hidden="true">
              {SPECTRUM_HEIGHTS.map((h, i) => (
                <span key={i} style={{ height: `${h}px` }} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Problems */}
      <section className="problems" id="problems">
        <div className="container">
          <div className="reveal">
            <div className="section-label">The Problem</div>
            <h2 className="section-title">You Feel It Before<br />You Can Name It</h2>
            <p className="section-desc">Burnout, stress, and low moods rarely arrive all at once. They build quietly — and by the time you notice, you&apos;re already deep in it.</p>
          </div>
          <div className="problems-grid">
            <div className="problem-card">
              <div className="problem-icon"><Icon name="flame" size={26} color="var(--blue)" /></div>
              <h3>Burnout Builds in Silence</h3>
              <p>Energy drops a little more every day. It&apos;s easy to miss day-to-day, and easy to explain away — until it isn&apos;t.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon"><Icon name="pulse" size={26} color="var(--blue)" /></div>
              <h3>Feelings Get Bottled Up</h3>
              <p>You carry it all day and never actually say it out loud — not to a friend, not even to yourself. There&apos;s rarely a place to just unload.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon"><Icon name="trending-down" size={26} color="var(--blue)" /></div>
              <h3>Progress Is Invisible</h3>
              <p>Without a record of how you actually felt last week, it&apos;s hard to know if today is a bad day — or a pattern worth paying attention to.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="container">
          <div className="reveal features-header">
            <div className="section-label" style={{ justifyContent: 'center' }}>The Solution</div>
            <h2 className="section-title">What Reveal AI <span className="gradient-text">Actually Does</span></h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>No black box, no clinical jargon dumped on you. Just a daily reflection, decoded honestly.</p>
          </div>
          <div className="features-grid">
            <div className="feat-item">
              <span className="feat-n">01</span>
              <h3>Reflect</h3>
              <p>Record a short voice memo or answer a couple of questions from Elena, your AI companion. She listens for pace, tension, and pauses — not just your words.</p>
              <div className="feat-viz-wave">
                {WAVE_BAR_HEIGHTS.slice(0, 28).map((h, i) => (
                  <span key={i} className="fw-bar" style={{ '--fh': `${Math.round(h * 0.78)}px`, animationDelay: `${i * 0.07}s` } as React.CSSProperties} />
                ))}
              </div>
              <div className="feat-footer">Voice &amp; Text Check-ins · Gemini-Powered</div>
            </div>
            <div className="feat-item">
              <span className="feat-n">02</span>
              <h3>Live Call</h3>
              <p>Prefer to talk it through out loud? Call Elena for a real, spoken conversation. She already knows your recent check-ins, and remembers this call the next time you chat.</p>
              <div className="feat-viz-call">
                <div className="fvc-avatar"><Icon name="phone" size={18} color="#fff" /></div>
                <div className="fvc-info">
                  <span className="fvc-status"><span className="fvc-dot" />Live · 02:14</span>
                  <div className="feat-viz-wave feat-viz-wave-sm">
                    {WAVE_BAR_HEIGHTS.slice(6, 20).map((h, i) => (
                      <span key={i} className="fw-bar" style={{ '--fh': `${Math.round(h * 0.5)}px`, animationDelay: `${i * 0.07}s` } as React.CSSProperties} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="feat-footer">Real-Time Voice · Shared Memory With Chat</div>
            </div>
            <div className="feat-item">
              <span className="feat-n">03</span>
              <h3>Early Warning</h3>
              <p>We track mood, energy, and stress across your recent sessions. When a pattern crosses a threshold, you get an alert — with the exact rule that fired.</p>
              <div className="feat-viz-intent">
                <div className="fvi-row">
                  <div className="fvi-meta"><span className="fvi-person">Burnout signal</span><span className="fvi-result" style={{ color: '#D97706' }}>Action recommended</span></div>
                  <div className="fvi-bar-wrap"><div className="fvi-track"><div className="fvi-fill" style={{ width: '82%', background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }} /></div><span className="fvi-pct" style={{ color: '#D97706' }}>4 sessions</span></div>
                </div>
                <div className="fvi-row">
                  <div className="fvi-meta"><span className="fvi-person">Mood slump</span><span className="fvi-result" style={{ opacity: 0.6 }}>Worth noticing</span></div>
                  <div className="fvi-bar-wrap"><div className="fvi-track"><div className="fvi-fill" style={{ width: '46%', opacity: 0.55 }} /></div><span className="fvi-pct" style={{ opacity: 0.6 }}>2 sessions</span></div>
                </div>
              </div>
              <div className="feat-footer">Explainable Alerts · 7–14 Day Early Window</div>
            </div>
            <div className="feat-item">
              <span className="feat-n">04</span>
              <h3>Track &amp; Share</h3>
              <p>Watch mood, energy, and stress move over time, keep a streak going, and export any check-in as a shareable card.</p>
              <div className="feat-viz-metrics">
                <div className="fvm-row"><span className="fvm-label">Mood</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '74%' }} /></div><span className="fvm-val">Trending up</span></div>
                <div className="fvm-row"><span className="fvm-label">Streak</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '60%' }} /></div><span className="fvm-val">Day 12</span></div>
                <div className="fvm-row"><span className="fvm-label">Shared</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '40%' }} /></div><span className="fvm-val">3 cards</span></div>
              </div>
              <div className="feat-footer">Trends &amp; Streaks · Shareable Mood Cards</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works" id="how">
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="reveal">
            <div className="section-label" style={{ justifyContent: 'center' }}>How It Works</div>
            <h2 className="section-title">Simple as 1-2-3</h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>Start understanding yourself in under a minute.</p>
          </div>
          <div className="steps-container">
            <Step n={1} icon="mic" title="Check In" desc="Record a voice memo or answer a couple of quick questions from Elena. It takes about a minute." />
            <Step n={2} icon="sparkles" title="AI Listens" desc="Gemini decodes tone, pace, and pauses alongside what you said, then reflects it back in plain, human language." />
            <Step n={3} icon="trending-up" title="See The Pattern" desc="Track mood, energy, and stress over time, and get an early, explained alert if things start to look like burnout." />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="trust" id="trust">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="section-label" style={{ justifyContent: 'center' }}>Why Trust It</div>
            <h2 className="section-title">Built to Be Honest With You</h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>No fake positivity, no mystery scores — a tool that tells you what it sees, and why.</p>
          </div>
          <div className="problems-grid trust-grid">
            <div className="problem-card">
              <div className="problem-icon"><Icon name="bulb" size={26} color="var(--blue)" /></div>
              <h3>Explainable, Not a Black Box</h3>
              <p>Every early warning shows the exact rule that fired — the trend, the session count, the threshold. Never just a mystery score.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon"><Icon name="lock" size={26} color="var(--blue)" /></div>
              <h3>Private by Design</h3>
              <p>Your voice is never sold and never used to train on your conversations. You&apos;re always in control — delete any recording, chat, or session from your account whenever you want.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon"><Icon name="warning" size={26} color="var(--blue)" /></div>
              <h3>A Reflection Tool, Not a Diagnosis</h3>
              <p>Reveal AI isn&apos;t a medical device and doesn&apos;t replace professional care. If a check-in signals crisis language, we skip the analysis and point you to real human help.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing" id="pricing">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="section-label" style={{ justifyContent: 'center' }}>Pricing</div>
            <h2 className="section-title">Simple, Honest Pricing</h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>Try it free. Stay only if it&apos;s actually useful.</p>
          </div>
          <div className="pricing-grid pricing-grid-2">
            <PricingCard
              plan="Free Trial"
              price="$0"
              period="3 days"
              desc="Full access, so you can see if it's actually useful before paying anything."
              features={['3 days full access', 'Voice & text check-ins with Elena', 'Mood, energy & stress decoded', 'Early burnout alerts']}
              ctaLabel="Start Free Trial"
              ctaHref={ctaHref}
              onCtaClick={handleGetStarted}
            />
            <PricingCard
              plan="Pro"
              price="$12"
              period="per month"
              desc="150 minutes of AI voice analysis a month, renews automatically."
              features={['150 minutes of AI voice analysis', 'Unlimited AI chat with Elena', 'Early burnout alerts, explained', 'Weekly mood reports & streaks', 'Shareable mood cards', 'Private & encrypted — audio deleted after analysis']}
              ctaLabel="Subscribe — $12/mo"
              ctaHref={ctaHref}
              featured
              onCtaClick={handleGetStarted}
            />
          </div>
          <p className="pricing-note">
            3 days free, then $12/month for 150 minutes — cancel before the trial ends to avoid billing. Need more minutes? Top up anytime from your account. Payments secured by Ziina.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="download">
        <div className="container">
          <div className="cta-card">
            <div className="cta-glow" aria-hidden="true" />
            <h2>Ready to Decode<br />Your <span className="hero-gradient-text">Voice</span>?</h2>
            <p>{user ? 'Welcome back. Pick up where you left off.' : 'Create your account in seconds — just an email and a 6-digit code. Your first check-in takes about a minute.'}</p>
            <div className="cta-buttons">
              <Link href={ctaHref} prefetch className="btn-lg btn-primary btn-magnetic" onClick={handleGetStarted}>
                <Icon name="mic" size={18} color="#fff" />
                {user ? 'Open Dashboard' : 'Start Your Free Trial'}
              </Link>
            </div>
            {!user && <p className="cta-note">3 days free, then $12/mo for 150 minutes · Cancel anytime</p>}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer>
        <div className="footer-top">
          <div className="footer-brand">
            <button
              type="button"
              className="footer-logo"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              aria-label="Back to top"
            >
              <Logo size={36} />
            </button>
            <p>Understand your voice.<br />Catch burnout early.<br />One honest check-in at a time.</p>
            <p className="footer-disclaimer">
              Reveal AI offers reflective wellness insights. It is not a medical device and does not provide diagnosis or treatment.
            </p>
          </div>
          <div className="footer-nav">
            <div className="footer-col">
              <h5>Product</h5>
              <button type="button" onClick={() => scrollTo('features')}>Features</button>
              <button type="button" onClick={() => scrollTo('pricing')}>Pricing</button>
              <button type="button" onClick={() => scrollTo('how')}>How it Works</button>
              <button type="button" onClick={() => scrollTo('trust')}>Trust &amp; Privacy</button>
            </div>
            <div className="footer-col">
              <h5>Support</h5>
              <a href="mailto:support@revealai.app">Contact Us</a>
              <a href="mailto:support@revealai.app">Get Help</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Reveal AI. All rights reserved.</p>
        </div>
      </footer>

      {/* Pricing Modal — shown when non-user clicks any Get Started CTA */}
      {showPricingModal && (
        <PricingModal onClose={() => setShowPricingModal(false)} />
      )}
    </div>
  );
}

function PreviewBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="pbar-row">
      <span className="pbar-label">{label}</span>
      <div className="pbar-track"><div className="pbar-fill" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: number; icon: string; title: string; desc: string }) {
  return (
    <div className="step">
      <div className="step-number">
        <span>{n}</span>
        <div className="step-icon"><Icon name={icon} size={15} color="#fff" /></div>
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
    </div>
  );
}

function PricingCard({
  plan, price, period, desc, features, featured, ctaLabel, ctaHref, onCtaClick,
}: {
  plan: string; price: string; period: string; desc: string;
  features: string[]; featured?: boolean; ctaLabel: string; ctaHref: string;
  onCtaClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={`pricing-card${featured ? ' pricing-card-featured' : ''}`}>
      {featured && <div className="pricing-popular">Most Popular</div>}
      <div className="pricing-header">
        <div className="pricing-plan">{plan}</div>
        <div className="pricing-price">
          <span className="price-amount">{price}</span>
          <span className="price-period">/{period}</span>
        </div>
      </div>
      <p className="pricing-desc">{desc}</p>
      <ul className="pricing-features">
        {features.map((f, i) => (
          <li key={i}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
      <Link href={ctaHref} className={`pricing-cta${featured ? ' pricing-cta-featured' : ''}`} onClick={onCtaClick}>
        {ctaLabel}
      </Link>
    </div>
  );
}
