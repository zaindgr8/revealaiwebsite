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

const SPECTRUM_HEIGHTS: number[] = Array.from({ length: 58 }, (_, i) => {
  const seed = Math.sin(i * 9.7354 + 1.2) * 43758.5453;
  const frac = seed - Math.floor(seed);
  const bell = Math.exp(-Math.pow((i - 29) / 18, 2));
  return Math.round((28 + frac * 130) * (0.35 + bell * 0.65));
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ctx: any;

    Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
      ([{ default: gsap }, { ScrollTrigger }]) => {
        gsap.registerPlugin(ScrollTrigger);

        ctx = gsap.context(() => {
          const heroTl = gsap.timeline({ delay: 0.25 });
          heroTl
            .fromTo('.hero-badge', { opacity: 0, y: 20, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: 'power3.out' })
            .fromTo('.hero-h1', { opacity: 0, y: 56 }, { opacity: 1, y: 0, duration: 0.85, ease: 'power3.out' }, '-=0.35')
            .fromTo('.hero-sub', { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: 0.65, ease: 'power3.out' }, '-=0.45')
            .fromTo('.hero-buttons', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.35')
            .fromTo('.hero-stats', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.25');

          gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
            gsap.fromTo(el, { opacity: 0, y: 50 }, {
              opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
              scrollTrigger: { trigger: el, start: 'top 88%', once: true },
            });
          });

          gsap.fromTo('.problem-card', { opacity: 0, y: 44 }, {
            opacity: 1, y: 0, duration: 0.75, stagger: 0.13, ease: 'power3.out',
            scrollTrigger: { trigger: '.problems-grid', start: 'top 82%', once: true },
          });

          gsap.fromTo('.feat-item', { opacity: 0, y: 36 }, {
            opacity: 1, y: 0, duration: 0.75, stagger: 0.12, ease: 'power3.out',
            scrollTrigger: { trigger: '.features-grid', start: 'top 82%', once: true },
          });

          gsap.fromTo('.step', { opacity: 0, y: 40 }, {
            opacity: 1, y: 0, duration: 0.7, stagger: 0.16, ease: 'power3.out',
            scrollTrigger: { trigger: '.steps-container', start: 'top 84%', once: true },
          });

          gsap.fromTo('.testi-card', { opacity: 0, y: 40 }, {
            opacity: 1, y: 0, duration: 0.7, stagger: 0.12, ease: 'power3.out',
            scrollTrigger: { trigger: '.testi-grid', start: 'top 82%', once: true },
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
              gsap.to(btn, { x: (e.clientX - rect.left - rect.width / 2) * 0.22, y: (e.clientY - rect.top - rect.height / 2) * 0.22, duration: 0.4, ease: 'power2.out' });
            });
            btn.addEventListener('mouseleave', () => {
              gsap.to(btn, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
            });
          });
        }, rootRef);
      }
    );

    return () => ctx?.revert();
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
        <div className="hero-content">
          <div className="hero-badge"><span className="dot" />AI-Powered Voice Analysis</div>
          <h1 className="hero-h1">
            Your Voice<br />
            Says <span className="hero-gradient-text">Everything</span>
          </h1>
          <p className="hero-sub">
            Understand yourself. Decode others. Master your tone. Reveal AI listens to{' '}
            <em>how</em> you say it — not just what you say.
          </p>
          <div className="hero-buttons">
            <Link href={ctaHref} prefetch className="btn-store primary btn-magnetic" onClick={handleGetStarted}>
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
          <div className="hero-stats">
            <div className="hero-stat"><span className="hstat-val">60s</span><span className="hstat-label">Daily check-in</span></div>
            <div className="hstat-sep" />
            <div className="hero-stat"><span className="hstat-val">7–14</span><span className="hstat-label">Days early detection</span></div>
            <div className="hstat-sep" />
            <div className="hero-stat"><span className="hstat-val">3</span><span className="hstat-label">AI features</span></div>
          </div>
        </div>
      </section>

      {/* Problems */}
      <section className="problems" id="problems">
        <div className="container">
          <div className="reveal">
            <div className="section-label">The Problem</div>
            <h2 className="section-title">Three Silent Battles<br />You&apos;re Fighting</h2>
            <p className="section-desc">Every day, your voice hides more than it reveals. These invisible struggles hold you back.</p>
          </div>
          <div className="problems-grid">
            <div className="problem-card">
              <div className="problem-icon"><Icon name="flame" size={26} color="var(--blue)" /></div>
              <h3>Burning Out in Silence</h3>
              <p>You&apos;re exhausted. Energy dropping. But you don&apos;t realize it until it&apos;s too late. No one to listen. No one to truly understand.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon"><Icon name="users" size={26} color="var(--blue)" /></div>
              <h3>Reading People Wrong</h3>
              <p>People around you mask their intentions. Are they genuine? Faking? Jealous? You can&apos;t tell — always a step behind.</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon"><Icon name="mic" size={26} color="var(--blue)" /></div>
              <h3>Not Sounding Like Yourself</h3>
              <p>You know what to say, but your voice doesn&apos;t match. Your tone is weak. Your energy is off. You sound less confident than you are.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="container">
          <div className="reveal features-header">
            <div className="section-label" style={{ justifyContent: 'center' }}>The Solution</div>
            <h2 className="section-title">Your Loyal <span className="gradient-text">Companion</span></h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>Reveal AI listens — really listens. Not to what you say, but to how you say it.</p>
          </div>
          <div className="features-grid">
            <div className="feat-item">
              <span className="feat-n">01</span>
              <h3>Reflect</h3>
              <p>Record 60 seconds each morning. AI detects burnout 7–14 days before you feel it.</p>
              <div className="feat-viz-wave">
                {WAVE_BAR_HEIGHTS.slice(0, 28).map((h, i) => (
                  <span key={i} className="fw-bar" style={{ '--fh': `${Math.round(h * 0.78)}px`, animationDelay: `${i * 0.07}s` } as React.CSSProperties} />
                ))}
              </div>
              <div className="feat-footer">Burnout Detection · Early Warning</div>
            </div>
            <div className="feat-item">
              <span className="feat-n">02</span>
              <h3>Intent Detector</h3>
              <p>Understand what people actually feel — not just what they say.</p>
              <div className="feat-viz-intent">
                <div className="fvi-row">
                  <div className="fvi-meta"><span className="fvi-person">Speaker 1</span><span className="fvi-result">Genuine Interest</span></div>
                  <div className="fvi-bar-wrap"><div className="fvi-track"><div className="fvi-fill" style={{ width: '92%' }} /></div><span className="fvi-pct">92%</span></div>
                </div>
                <div className="fvi-row">
                  <div className="fvi-meta"><span className="fvi-person">Speaker 2</span><span className="fvi-result">Guarded / Cautious</span></div>
                  <div className="fvi-bar-wrap"><div className="fvi-track"><div className="fvi-fill" style={{ width: '78%', opacity: 0.55 }} /></div><span className="fvi-pct" style={{ opacity: 0.6 }}>78%</span></div>
                </div>
              </div>
              <div className="feat-footer">Sentiment Analysis · Intent Detection</div>
            </div>
            <div className="feat-item">
              <span className="feat-n">03</span>
              <h3>Tone Coach</h3>
              <p>Real-time vocal guidance for interviews, dates, and high-stakes moments.</p>
              <div className="feat-viz-metrics">
                <div className="fvm-row"><span className="fvm-label">Confidence</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '82%' }} /></div><span className="fvm-val">High</span></div>
                <div className="fvm-row"><span className="fvm-label">Energy</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '68%' }} /></div><span className="fvm-val">Balanced</span></div>
                <div className="fvm-row"><span className="fvm-label">Clarity</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '91%' }} /></div><span className="fvm-val">Excellent</span></div>
              </div>
              <div className="feat-footer">Real-time Feedback · Tone Mastery</div>
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
            <Step n={1} icon="mic" title="Record Your Voice" desc="Just 60 seconds each morning. Press record and speak naturally." />
            <Step n={2} icon="sparkles" title="AI Analyzes" desc="Our AI decodes tone, pace, energy, and emotional patterns in real time." />
            <Step n={3} icon="trending-up" title="Get Insights" desc="Receive actionable feedback, burnout alerts, and voice coaching tips." />
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="testimonials" id="testimonials">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="section-label" style={{ justifyContent: 'center' }}>What People Say</div>
            <h2 className="section-title">Real Voices. Real Change.</h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>From burnout alerts to better meetings — hear how Reveal AI is transforming lives.</p>
          </div>
          <div className="testi-grid">
            <TestiCard
              quote="I noticed I was burning out three weeks before my doctor told me. Reveal AI's early warning is genuinely scary-accurate."
              name="Alex Chen"
              role="Software Engineer, Google"
              initials="AC"
            />
            <TestiCard
              quote="The intent detector revealed my co-founder wasn't fully committed — saved me from a disastrous partnership before it cost me everything."
              name="Maria Santos"
              role="Startup Co-founder"
              initials="MS"
            />
            <TestiCard
              quote="Two weeks of voice coaching and I closed a $200K deal. My tone went from nervous to authoritative and clients felt it immediately."
              name="David Park"
              role="Sales Director"
              initials="DP"
            />
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing" id="pricing">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: 64 }}>
            <div className="section-label" style={{ justifyContent: 'center' }}>Pricing</div>
            <h2 className="section-title">Simple, Transparent</h2>
            <p className="section-desc" style={{ margin: '0 auto' }}>Start free. Upgrade when your voice is ready to grow.</p>
          </div>
          <div className="pricing-grid">
            <PricingCard
              plan="Free"
              price="$0"
              period="forever"
              desc="Perfect to get started with daily voice check-ins."
              features={['5 check-ins per month', 'Basic mood analysis', 'Burnout snapshot', 'Mobile app access']}
              ctaLabel="Get Started Free"
              ctaHref={ctaHref}
              onCtaClick={handleGetStarted}
            />
            <PricingCard
              plan="Pro"
              price="$12"
              period="per month"
              desc="Unlock everything for serious self-awareness and growth."
              features={['Unlimited check-ins', 'All 3 AI features', 'Early burnout alerts (7–14 days)', 'Intent detector', 'Voice tone coaching', 'Priority support']}
              ctaLabel="Start Pro Trial"
              ctaHref={ctaHref}
              featured
              onCtaClick={handleGetStarted}
            />
            <PricingCard
              plan="Team"
              price="$39"
              period="per month"
              desc="For teams that want to grow together, not burn out."
              features={['5 team seats', 'Team health dashboard', 'Manager insights', 'All Pro features', 'API access', 'Dedicated support']}
              ctaLabel="Talk to Us"
              ctaHref={ctaHref}
              onCtaClick={handleGetStarted}
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="download">
        <div className="container">
          <div className="cta-card">
            <div className="cta-glow" aria-hidden="true" />
            <h2>Ready to Decode<br />Your <span className="hero-gradient-text">Voice</span>?</h2>
            <p>{user ? 'Welcome back. Pick up where you left off.' : 'Create your free account in seconds. Start your journey to self-awareness today.'}</p>
            <div className="cta-stores">
              <Link href={ctaHref} prefetch className="btn-store primary btn-magnetic">
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
            <p>Understand yourself.<br />Decode others.<br />Master your voice.</p>
          </div>
          <div className="footer-nav">
            <div className="footer-col">
              <h5>Product</h5>
              <button type="button" onClick={() => scrollTo('features')}>Features</button>
              <button type="button" onClick={() => scrollTo('pricing')}>Pricing</button>
              <button type="button" onClick={() => scrollTo('how')}>How it Works</button>
              <button type="button" onClick={() => scrollTo('testimonials')}>Testimonials</button>
            </div>
            <div className="footer-col">
              <h5>Company</h5>
              <a href="#">About</a>
              <a href="#">Blog</a>
              <a href="#">Careers</a>
              <a href="#">Contact</a>
            </div>
            <div className="footer-col">
              <h5>Legal</h5>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Use</a>
              <a href="#">Cookie Policy</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Reveal AI. All rights reserved.</p>
          <div className="footer-socials">
            <a href="#" className="footer-social-btn" aria-label="X / Twitter">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
            <a href="#" className="footer-social-btn" aria-label="Instagram">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a href="#" className="footer-social-btn" aria-label="LinkedIn">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z" />
                <circle cx="4" cy="4" r="2" />
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {/* Pricing Modal — shown when non-user clicks any Get Started CTA */}
      {showPricingModal && (
        <PricingModal onClose={() => setShowPricingModal(false)} />
      )}
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

function TestiCard({ quote, name, role, initials }: { quote: string; name: string; role: string; initials: string }) {
  return (
    <div className="testi-card">
      <div className="testi-stars">★★★★★</div>
      <p className="testi-quote">{quote}</p>
      <div className="testi-author">
        <div className="testi-avatar">{initials}</div>
        <div className="testi-info">
          <strong>{name}</strong>
          <span>{role}</span>
        </div>
      </div>
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

