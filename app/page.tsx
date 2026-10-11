'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { PricingModal } from '@/components/PricingModal';
import './landing.css';

// Deterministic pseudo-random heights so server and client render the same bars.
function seededHeights(count: number, salt: number, min: number, range: number, bellCentre?: number) {
  return Array.from({ length: count }, (_, i) => {
    const seed = Math.sin(i * 12.9898 + salt) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const bell = bellCentre === undefined ? 1 : 0.35 + Math.exp(-Math.pow((i - bellCentre) / (count / 3), 2)) * 0.65;
    return Math.round((min + frac * range) * bell);
  });
}

const WAVE_HEIGHTS = seededHeights(44, 0, 14, 40, 22);
const CALL_WAVE_HEIGHTS = seededHeights(22, 3.1, 6, 20, 11);
const CARD_WAVE_HEIGHTS = seededHeights(32, 7.7, 4, 18, 16);

// The signals a check-in listens for, taken from the copy below.
const SIGNALS = ['Pace', 'Tension', 'Pauses', 'Energy', 'Stress', 'Mood', 'Confidence', 'Burnout signals', 'Tone', 'What you said'];

const NAV_SECTIONS = [
  { id: 'problems', label: 'Problem' },
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
];

// useLayoutEffect warns during SSR; fall back to useEffect there.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const ctaHref = user ? '/home' : '/signup';

  // Open pricing modal for non-logged-in users; logged-in go straight to /home
  const handleGetStarted = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      setShowPricingModal(true);
    }
  };

  // Nav state + reading-progress bar. One passive listener, written straight to
  // the DOM for the bar so scrolling never re-renders the page.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        setScrolled(y > 40);
        const max = document.documentElement.scrollHeight - window.innerHeight;
        if (progressRef.current) {
          progressRef.current.style.transform = `scaleX(${max > 0 ? Math.min(1, y / max) : 0})`;
        }
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  // Which section is on screen, so the nav pill can follow along.
  useEffect(() => {
    const els = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    els.forEach((el) => io.observe(el));
    const hero = document.getElementById('hero');
    const heroIo = new IntersectionObserver(([e]) => e.isIntersecting && setActiveSection(null), {
      rootMargin: '-45% 0px -50% 0px',
    });
    if (hero) heroIo.observe(hero);
    return () => {
      io.disconnect();
      heroIo.disconnect();
    };
  }, []);

  // Slide the nav highlight under the active link. Re-measured on resize and
  // once web fonts land, since both change the link widths.
  useIsoLayoutEffect(() => {
    const list = navListRef.current;
    if (!list) return;
    const measure = () => {
      const btn = activeSection ? list.querySelector<HTMLElement>(`[data-section="${activeSection}"]`) : null;
      if (btn) {
        // Measured against the list, not offsetLeft: each button sits in a
        // positioned <li>, so offsetLeft would always be 0.
        const lr = list.getBoundingClientRect();
        const br = btn.getBoundingClientRect();
        list.style.setProperty('--ind-x', `${br.left - lr.left}px`);
        list.style.setProperty('--ind-w', `${br.width}px`);
        list.style.setProperty('--ind-o', '1');
      } else {
        list.style.setProperty('--ind-o', '0');
      }
    };
    measure();
    window.addEventListener('resize', measure);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => window.removeEventListener('resize', measure);
  }, [activeSection]);

  // Cursor-following spotlight on every `.spot` surface. Pure CSS variables, so
  // it costs one style write per pointer move and works without GSAP.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('.spot');
      if (!target) return;
      const r = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${e.clientX - r.left}px`);
      target.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    root.addEventListener('pointermove', onMove, { passive: true });
    return () => root.removeEventListener('pointermove', onMove);
  }, []);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    // Every animation here is enhancement only: all content is visible in CSS by
    // default and GSAP sets its own "from" state just before animating. A slow
    // or failed import therefore skips the motion but never hides content.
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ctx: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const splits: any[] = [];

    (async () => {
      const [{ default: gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('gsap/SplitText'),
      ]);
      if (cancelled || !rootRef.current) return;

      gsap.registerPlugin(ScrollTrigger, SplitText);
      // Keep animations on the wall clock. With lag smoothing on, a throttled or
      // busy main thread slows every tween down, which would leave the hero
      // half-revealed for seconds on a slow phone.
      gsap.ticker.lagSmoothing(0);
      const finePointer = window.matchMedia('(pointer: fine)').matches;

      ctx = gsap.context(() => {
        // ── Hero entrance ────────────────────────────────────────────────
        const heroTl = gsap.timeline({ delay: 0.1, defaults: { ease: 'expo.out' } });
        heroTl
          .fromTo('.hero-badge', { opacity: 0, y: 16, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9 })
          .fromTo('.hero-h1 .w-inner', { yPercent: 115, rotate: 4 }, { yPercent: 0, rotate: 0, duration: 1.2, stagger: 0.07 }, '-=0.6')
          .fromTo('.hero-sub', { opacity: 0, y: 24, filter: 'blur(8px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1 }, '-=0.85')
          .fromTo('.hero-buttons > *', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.08 }, '-=0.75')
          .fromTo('.hero-stats', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.9 }, '-=0.7')
          .fromTo('.preview-stage', { opacity: 0, y: 60, rotateX: 18, scale: 0.94 }, { opacity: 1, y: 0, rotateX: 0, scale: 1, duration: 1.5 }, '-=1.2')
          .fromTo('.preview-float', { opacity: 0, scale: 0.8, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: 1, stagger: 0.15, ease: 'back.out(1.6)' }, '-=0.8')
          .fromTo('.voice-ring', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 1.6, stagger: 0.12 }, '-=1.4');

        // Score counts up and the bars fill once the card has landed.
        const score = { v: 0 };
        heroTl.to(score, {
          v: 78,
          duration: 1.6,
          ease: 'power3.out',
          onUpdate: () => {
            const el = document.querySelector('.preview-score-num');
            if (el) el.textContent = String(Math.round(score.v));
          },
        }, '-=1.3');
        heroTl.fromTo('.pbar-fill', { scaleX: 0 }, { scaleX: 1, duration: 1.4, stagger: 0.12, ease: 'expo.out' }, '<0.1');

        // ── Hero stat counters ───────────────────────────────────────────
        gsap.utils.toArray<HTMLElement>('[data-count]').forEach((el) => {
          const to = Number(el.dataset.count);
          const obj = { v: 0 };
          gsap.to(obj, {
            v: to,
            duration: 1.8,
            ease: 'power3.out',
            delay: 0.9,
            onUpdate: () => {
              el.textContent = String(Math.round(obj.v));
            },
          });
        });

        // ── Pointer: 3D tilt on the preview, parallax on the floats ──────
        if (finePointer) {
          const stage = document.querySelector<HTMLElement>('.hero-visual');
          const card = document.querySelector<HTMLElement>('.preview-stage');
          if (stage && card) {
            const rx = gsap.quickTo(card, 'rotationX', { duration: 0.8, ease: 'power3.out' });
            const ry = gsap.quickTo(card, 'rotationY', { duration: 0.8, ease: 'power3.out' });
            const floats = gsap.utils.toArray<HTMLElement>('.preview-float');
            const fx = floats.map((f) => gsap.quickTo(f, 'x', { duration: 1, ease: 'power3.out' }));
            const fy = floats.map((f) => gsap.quickTo(f, 'y', { duration: 1, ease: 'power3.out' }));
            stage.addEventListener('pointermove', (e) => {
              const r = stage.getBoundingClientRect();
              const px = (e.clientX - r.left) / r.width - 0.5;
              const py = (e.clientY - r.top) / r.height - 0.5;
              rx(-py * 10);
              ry(px * 12);
              floats.forEach((_, i) => {
                const depth = i === 0 ? 28 : -22;
                fx[i](px * depth);
                fy[i](py * depth);
              });
            });
            stage.addEventListener('pointerleave', () => {
              rx(0);
              ry(0);
              fx.forEach((f) => f(0));
              fy.forEach((f) => f(0));
            });
          }

          // Hero background spotlight follows the cursor.
          const hero = document.querySelector<HTMLElement>('.hero');
          if (hero) {
            const sx = gsap.quickTo(hero, '--hx', { duration: 1.2, ease: 'power3.out' });
            const sy = gsap.quickTo(hero, '--hy', { duration: 1.2, ease: 'power3.out' });
            hero.addEventListener('pointermove', (e) => {
              const r = hero.getBoundingClientRect();
              sx(((e.clientX - r.left) / r.width) * 100);
              sy(((e.clientY - r.top) / r.height) * 100);
            });
          }
        }

        // Hero content drifts up and softens as you scroll away.
        gsap.to('.hero-content', {
          yPercent: -12,
          opacity: 0.35,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
        });
        gsap.to('.hero-visual', {
          yPercent: -6,
          ease: 'none',
          scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true },
        });

        // ── Section headings: line-by-line mask reveal ───────────────────
        gsap.utils.toArray<HTMLElement>('.section-title').forEach((title) => {
          const split = new SplitText(title, { type: 'lines,words', linesClass: 'split-line', mask: 'lines' });
          splits.push(split);
          gsap.fromTo(split.lines, { yPercent: 110 }, {
            yPercent: 0,
            duration: 1.1,
            stagger: 0.1,
            ease: 'expo.out',
            scrollTrigger: { trigger: title, start: 'top 85%', once: true },
          });
        });

        gsap.utils.toArray<HTMLElement>('.reveal-fade').forEach((el) => {
          gsap.fromTo(el, { opacity: 0, y: 28, filter: 'blur(6px)' }, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 1, ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        });

        // ── Card grids ───────────────────────────────────────────────────
        const cardGroup = (cards: string, trigger: string) =>
          gsap.fromTo(cards, { opacity: 0, y: 60, scale: 0.96 }, {
            opacity: 1, y: 0, scale: 1, duration: 1.1, stagger: 0.12, ease: 'expo.out',
            scrollTrigger: { trigger, start: 'top 82%', once: true },
          });
        cardGroup('.problems-grid:not(.trust-grid) .problem-card', '.problems-grid:not(.trust-grid)');
        cardGroup('.trust-grid .problem-card', '.trust-grid');
        cardGroup('.feat-item', '.features-grid');
        cardGroup('.pricing-card', '.pricing-grid');

        // Feature visuals come alive as they enter.
        gsap.fromTo('.fvi-fill, .fvm-fill', { scaleX: 0 }, {
          scaleX: 1, duration: 1.6, stagger: 0.12, ease: 'expo.out',
          scrollTrigger: { trigger: '.features-grid', start: 'top 70%', once: true },
        });
        gsap.fromTo('.spark-path', { strokeDashoffset: 1 }, {
          strokeDashoffset: 0, duration: 2, ease: 'power2.inOut',
          scrollTrigger: { trigger: '.feat-viz-metrics', start: 'top 85%', once: true },
        });

        // ── How it works: the connecting line draws as you scroll ───────
        gsap.fromTo('.steps-line-fill', { scaleX: 0 }, {
          scaleX: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: '.steps-container',
            start: 'top 75%',
            end: 'bottom 55%',
            scrub: 0.6,
            onUpdate: (self) => {
              document.querySelectorAll<HTMLElement>('.step').forEach((step, i, all) => {
                const at = all.length === 1 ? 0 : i / (all.length - 1);
                step.classList.toggle('lit', self.progress >= at - 0.02);
              });
            },
          },
        });
        gsap.fromTo('.step', { opacity: 0, y: 50 }, {
          opacity: 1, y: 0, duration: 1, stagger: 0.15, ease: 'expo.out',
          scrollTrigger: { trigger: '.steps-container', start: 'top 82%', once: true },
        });

        // ── CTA ─────────────────────────────────────────────────────────
        gsap.fromTo('.cta-card', { opacity: 0, y: 80, scale: 0.94 }, {
          opacity: 1, y: 0, scale: 1, duration: 1.4, ease: 'expo.out',
          scrollTrigger: { trigger: '.cta-card', start: 'top 88%', once: true },
        });

        // Footer wordmark fills in as it scrolls into view.
        gsap.fromTo('.footer-wordmark', { backgroundSize: '0% 100%' }, {
          backgroundSize: '100% 100%',
          ease: 'none',
          // Ends exactly at the bottom of the page, so it always completes.
          scrollTrigger: { trigger: 'footer', start: 'top bottom', end: 'bottom bottom', scrub: true },
        });

        // Ambient orbs drift with scroll.
        gsap.utils.toArray<HTMLElement>('.orb').forEach((orb, i) => {
          gsap.to(orb, {
            y: i % 2 === 0 ? 160 : -120,
            ease: 'none',
            scrollTrigger: { trigger: document.body, start: 'top top', end: 'bottom bottom', scrub: 2 },
          });
        });

        // ── Magnetic buttons ─────────────────────────────────────────────
        if (finePointer) {
          document.querySelectorAll<HTMLElement>('.btn-magnetic').forEach((btn) => {
            const mx = gsap.quickTo(btn, 'x', { duration: 0.5, ease: 'power3.out' });
            const my = gsap.quickTo(btn, 'y', { duration: 0.5, ease: 'power3.out' });
            btn.addEventListener('pointermove', (e) => {
              const r = btn.getBoundingClientRect();
              mx((e.clientX - r.left - r.width / 2) * 0.22);
              my((e.clientY - r.top - r.height / 2) * 0.3);
            });
            btn.addEventListener('pointerleave', () => {
              gsap.to(btn, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.35)' });
            });
          });
        }
      }, rootRef);
    })();

    return () => {
      cancelled = true;
      splits.forEach((s) => s.revert());
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
      <div className="scroll-progress" ref={progressRef} aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="bg-orbs" aria-hidden="true">
        <div className="orb" /><div className="orb" /><div className="orb" />
      </div>

      {/* Nav */}
      <nav className={`landing-nav${scrolled ? ' scrolled' : ''}${menuOpen ? ' menu-open' : ''}`}>
        <button type="button" className="nav-logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Reveal AI">
          <Logo size={30} />
        </button>
        <ul ref={navListRef} className={`nav-links${menuOpen ? ' show' : ''}`}>
          <li className="nav-indicator" aria-hidden="true" />
          {NAV_SECTIONS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                data-section={s.id}
                className={activeSection === s.id ? 'active' : undefined}
                aria-current={activeSection === s.id ? 'true' : undefined}
                onClick={() => scrollTo(s.id)}
              >
                {s.label}
              </button>
            </li>
          ))}
          <li>
            <Link href={ctaHref} prefetch className="nav-cta" onClick={(e) => { closeMenu(); handleGetStarted(e); }}>
              {user ? 'Open Dashboard' : 'Get Started'}
              <span className="nav-cta-arrow" aria-hidden="true"><Icon name="arrow-forward" size={13} color="#fff" /></span>
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
        <div className="hero-spotlight" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-content">
            <div className="hero-badge">
              <span className="dot" />
              Private voice check-ins, decoded by AI
              <span className="badge-shine" aria-hidden="true" />
            </div>
            <h1 className="hero-h1">
              <span className="w"><span className="w-inner">Your</span></span>{' '}
              <span className="w"><span className="w-inner">Voice</span></span>
              <br />
              <span className="w"><span className="w-inner">Says</span></span>{' '}
              <span className="w"><span className="w-inner hero-gradient-text">Everything</span></span>
            </h1>
            <p className="hero-sub">
              A minute of honest reflection, most days. Reveal AI listens to{' '}
              <em>how</em>{' '}you sound — pace, tension, the pauses — and tells you
              what it&apos;s hearing before burnout does.
            </p>
            <div className="hero-buttons">
              <Link href={ctaHref} prefetch className="btn-lg btn-primary btn-magnetic" onClick={handleGetStarted}>
                <span className="btn-shine" aria-hidden="true" />
                <span className="btn-icon"><Icon name="mic" size={16} color="#fff" /></span>
                {user ? 'Open Dashboard' : 'Start Your Free Check-In'}
              </Link>
              <button type="button" className="btn-lg btn-secondary" onClick={() => scrollTo('how')}>
                <span className="play-dot" aria-hidden="true" />
                See How It Works
              </button>
            </div>
            <div className="hero-stats">
              <div className="hero-stat">
                <span className="hstat-val"><span data-count="60">60</span>s</span>
                <span className="hstat-label">A check-in</span>
              </div>
              <div className="hstat-sep" />
              <div className="hero-stat">
                <span className="hstat-val"><span data-count="7">7</span>–<span data-count="14">14</span></span>
                <span className="hstat-label">Days earlier warning</span>
              </div>
              <div className="hstat-sep" />
              <div className="hero-stat">
                <span className="hstat-val"><span data-count="3">3</span> days</span>
                <span className="hstat-label">Free, no strings</span>
              </div>
            </div>
          </div>

          <div className="hero-visual">
            <div className="voice-rings" aria-hidden="true">
              <span className="voice-ring" /><span className="voice-ring" /><span className="voice-ring" />
            </div>
            <div className="preview-stage">
              <div className="preview-card" aria-hidden="true">
                <div className="preview-border" />
                <div className="preview-top">
                  <span className="preview-label">Today&apos;s check-in</span>
                  <span className="preview-time"><span className="live-dot" />Analyzed in 12s</span>
                </div>
                <div className="preview-score">
                  <span className="preview-score-num">78</span>
                  <span className="preview-score-word">Good</span>
                  <span className="preview-score-ring">
                    <svg viewBox="0 0 36 36" width="44" height="44">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(17,17,24,0.07)" strokeWidth="3" />
                      <circle className="score-arc" cx="18" cy="18" r="15" fill="none" stroke="url(#scoreGrad)" strokeWidth="3" strokeLinecap="round" pathLength={100} strokeDasharray="78 100" transform="rotate(-90 18 18)" />
                      <defs>
                        <linearGradient id="scoreGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#2563eb" />
                          <stop offset="100%" stopColor="#0ea5e9" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </span>
                </div>
                <div className="preview-wave">
                  {CARD_WAVE_HEIGHTS.map((h, i) => (
                    <span key={i} style={{ height: `${h + 4}px`, animationDelay: `${i * 0.06}s` }} />
                  ))}
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
                  <span className="preview-avatar">F</span>
                  Voice check-in · Freya
                </div>
              </div>
            </div>
            <div className="preview-float preview-float-1">
              <span className="pf-icon pf-amber"><Icon name="warning" size={13} color="#D97706" /></span>
              <span>Energy trending down — 3 sessions</span>
            </div>
            <div className="preview-float preview-float-2">
              <span className="pf-icon pf-green"><Icon name="trending-up" size={13} color="#16a34a" /></span>
              <span>Day 12 streak</span>
            </div>
          </div>
        </div>

        <button type="button" className="scroll-cue" onClick={() => scrollTo('problems')} aria-label="Scroll to the next section">
          <span className="scroll-cue-mouse"><span /></span>
        </button>
      </section>

      {/* Signal marquee */}
      <div className="marquee" aria-label="What a check-in listens for">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <div className="marquee-group" key={dup} aria-hidden={dup === 1 ? true : undefined}>
              {SIGNALS.map((s) => (
                <span className="marquee-item" key={s}>
                  <span className="marquee-glyph" aria-hidden="true" />
                  {s}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Problems */}
      <section className="problems" id="problems">
        <div className="container">
          <div className="section-head">
            <div className="section-label reveal-fade">The Problem</div>
            <h2 className="section-title">You Feel It Before<br />You Can Name It</h2>
            <p className="section-desc reveal-fade">Burnout, stress, and low moods rarely arrive all at once. They build quietly — and by the time you notice, you&apos;re already deep in it.</p>
          </div>
          <div className="problems-grid">
            <ProblemCard n="01" icon="flame" title="Burnout Builds in Silence">
              Energy drops a little more every day. It&apos;s easy to miss day-to-day, and easy to explain away — until it isn&apos;t.
            </ProblemCard>
            <ProblemCard n="02" icon="pulse" title="Feelings Get Bottled Up">
              You carry it all day and never actually say it out loud — not to a friend, not even to yourself. There&apos;s rarely a place to just unload.
            </ProblemCard>
            <ProblemCard n="03" icon="trending-down" title="Progress Is Invisible">
              Without a record of how you actually felt last week, it&apos;s hard to know if today is a bad day — or a pattern worth paying attention to.
            </ProblemCard>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="features" id="features">
        <div className="container">
          <div className="section-head centered">
            <div className="section-label reveal-fade">The Solution</div>
            <h2 className="section-title">What Reveal AI <span className="gradient-text">Actually Does</span></h2>
            <p className="section-desc reveal-fade">No black box, no clinical jargon dumped on you. Just a daily reflection, decoded honestly.</p>
          </div>
          <div className="features-grid">
            <div className="feat-item spot feat-wide">
              <div className="feat-copy">
                <span className="feat-n">01</span>
                <h3>Reflect</h3>
                <p>Record a short voice memo or answer a couple of questions from Freya, your AI companion. She listens for pace, tension, and pauses — not just your words.</p>
              </div>
              <div className="feat-viz-wave">
                {WAVE_HEIGHTS.map((h, i) => (
                  <span key={i} className="fw-bar" style={{ '--fh': `${h}px`, animationDelay: `${(i % 11) * 0.09}s` } as React.CSSProperties} />
                ))}
                <div className="fw-scan" aria-hidden="true" />
              </div>
              <div className="feat-footer">Voice &amp; Text Check-ins · Gemini-Powered</div>
            </div>
            <div className="feat-item spot">
              <div className="feat-copy">
                <span className="feat-n">02</span>
                <h3>Live Call</h3>
                <p>Prefer to talk it through out loud? Call Freya for a real, spoken conversation. She already knows your recent check-ins, and remembers this call the next time you chat.</p>
              </div>
              <div className="feat-viz-call">
                <div className="fvc-avatar">
                  <span className="fvc-pulse" /><span className="fvc-pulse" />
                  <span className="fvc-initial">F</span>
                </div>
                <div className="fvc-info">
                  <span className="fvc-status"><span className="fvc-dot" />Live · <LiveTimer start={134} /></span>
                  <div className="feat-viz-wave feat-viz-wave-sm">
                    {CALL_WAVE_HEIGHTS.map((h, i) => (
                      <span key={i} className="fw-bar" style={{ '--fh': `${h}px`, animationDelay: `${(i % 7) * 0.1}s` } as React.CSSProperties} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="feat-footer">Real-Time Voice · Shared Memory With Chat</div>
            </div>
            <div className="feat-item spot">
              <div className="feat-copy">
                <span className="feat-n">03</span>
                <h3>Early Warning</h3>
                <p>We track mood, energy, and stress across your recent sessions. When a pattern crosses a threshold, you get an alert — with the exact rule that fired.</p>
              </div>
              <div className="feat-viz-intent">
                <div className="fvi-row">
                  <div className="fvi-meta"><span className="fvi-person">Burnout signal</span><span className="fvi-result fvi-amber"><span className="fvi-ping" />Action recommended</span></div>
                  <div className="fvi-bar-wrap"><div className="fvi-track"><div className="fvi-fill fvi-fill-warn" style={{ width: '82%' }} /></div><span className="fvi-pct" style={{ color: '#D97706' }}>4 sessions</span></div>
                </div>
                <div className="fvi-row">
                  <div className="fvi-meta"><span className="fvi-person">Mood slump</span><span className="fvi-result" style={{ opacity: 0.6 }}>Worth noticing</span></div>
                  <div className="fvi-bar-wrap"><div className="fvi-track"><div className="fvi-fill" style={{ width: '46%', opacity: 0.55 }} /></div><span className="fvi-pct" style={{ opacity: 0.6 }}>2 sessions</span></div>
                </div>
              </div>
              <div className="feat-footer">Explainable Alerts · 7–14 Day Early Window</div>
            </div>
            <div className="feat-item spot feat-wide">
              <div className="feat-copy">
                <span className="feat-n">04</span>
                <h3>Track &amp; Share</h3>
                <p>Watch mood, energy, and stress move over time, keep a streak going, and export any check-in as a shareable card.</p>
              </div>
              <div className="feat-viz-metrics">
                <svg className="spark" viewBox="0 0 300 70" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="sparkStroke" x1="0" x2="1">
                      <stop offset="0%" stopColor="#2563eb" />
                      <stop offset="100%" stopColor="#0ea5e9" />
                    </linearGradient>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(37,99,235,0.18)" />
                      <stop offset="100%" stopColor="rgba(37,99,235,0)" />
                    </linearGradient>
                  </defs>
                  <path d="M0 52 C 30 50, 45 58, 70 46 S 115 30, 140 38 S 190 22, 215 26 S 265 10, 300 8 L 300 70 L 0 70 Z" fill="url(#sparkFill)" />
                  <path className="spark-path" d="M0 52 C 30 50, 45 58, 70 46 S 115 30, 140 38 S 190 22, 215 26 S 265 10, 300 8" fill="none" stroke="url(#sparkStroke)" strokeWidth="2.5" strokeLinecap="round" pathLength={1} strokeDasharray="1" />
                </svg>
                <div className="fvm-rows">
                  <div className="fvm-row"><span className="fvm-label">Mood</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '74%' }} /></div><span className="fvm-val">Trending up</span></div>
                  <div className="fvm-row"><span className="fvm-label">Streak</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '60%' }} /></div><span className="fvm-val">Day 12</span></div>
                  <div className="fvm-row"><span className="fvm-label">Shared</span><div className="fvm-track"><div className="fvm-fill" style={{ width: '40%' }} /></div><span className="fvm-val">3 cards</span></div>
                </div>
              </div>
              <div className="feat-footer">Trends &amp; Streaks · Shareable Mood Cards</div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="how-it-works" id="how">
        <div className="how-glow" aria-hidden="true" />
        <div className="container" style={{ textAlign: 'center' }}>
          <div className="section-head centered">
            <div className="section-label reveal-fade">How It Works</div>
            <h2 className="section-title">Simple as 1-2-3</h2>
            <p className="section-desc reveal-fade">Start understanding yourself in under a minute.</p>
          </div>
          <div className="steps-container">
            <div className="steps-line" aria-hidden="true"><div className="steps-line-fill" /></div>
            <Step n={1} icon="mic" title="Check In" desc="Record a voice memo or answer a couple of quick questions from Freya. It takes about a minute." />
            <Step n={2} icon="sparkles" title="AI Listens" desc="Gemini decodes tone, pace, and pauses alongside what you said, then reflects it back in plain, human language." />
            <Step n={3} icon="trending-up" title="See The Pattern" desc="Track mood, energy, and stress over time, and get an early, explained alert if things start to look like burnout." />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="trust" id="trust">
        <div className="container">
          <div className="section-head centered">
            <div className="section-label reveal-fade">Why Trust It</div>
            <h2 className="section-title">Built to Be Honest With You</h2>
            <p className="section-desc reveal-fade">No fake positivity, no mystery scores — a tool that tells you what it sees, and why.</p>
          </div>
          <div className="problems-grid trust-grid">
            <ProblemCard icon="bulb" title="Explainable, Not a Black Box">
              Every early warning shows the exact rule that fired — the trend, the session count, the threshold. Never just a mystery score.
            </ProblemCard>
            <ProblemCard icon="lock" title="Private by Design">
              Your voice is never sold and never used to train on your conversations. You&apos;re always in control — delete any recording, chat, or session from your account whenever you want.
            </ProblemCard>
            <ProblemCard icon="warning" title="A Reflection Tool, Not a Diagnosis">
              Reveal AI isn&apos;t a medical device and doesn&apos;t replace professional care. If a check-in signals crisis language, we skip the analysis and point you to real human help.
            </ProblemCard>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="pricing" id="pricing">
        <div className="container">
          <div className="section-head centered">
            <div className="section-label reveal-fade">Pricing</div>
            <h2 className="section-title">Simple, Honest Pricing</h2>
            <p className="section-desc reveal-fade">Try it free. Stay only if it&apos;s actually useful.</p>
          </div>
          <div className="pricing-grid pricing-grid-2">
            <PricingCard
              plan="Free Trial"
              price="$0"
              period="3 days"
              desc="Full access, so you can see if it's actually useful before paying anything."
              features={['3 days full access', 'Voice & text check-ins with Freya', 'Mood, energy & stress decoded', 'Early burnout alerts']}
              ctaLabel="Start Free Trial"
              ctaHref={ctaHref}
              onCtaClick={handleGetStarted}
            />
            <PricingCard
              plan="Pro"
              price="$12"
              period="per month"
              desc="150 minutes of AI voice analysis a month, renews automatically."
              features={['150 minutes of AI voice analysis', 'Unlimited AI chat with Freya', 'Early burnout alerts, explained', 'Weekly mood reports & streaks', 'Shareable mood cards', 'Private & encrypted — audio deleted after analysis']}
              ctaLabel="Subscribe — $12/mo"
              ctaHref={ctaHref}
              featured
              onCtaClick={handleGetStarted}
            />
          </div>
          <p className="pricing-note reveal-fade">
            3 days free, then $12/month for 150 minutes — cancel before the trial ends to avoid billing. Need more minutes? Top up anytime from your account. Payments secured by Ziina.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section" id="download">
        <div className="container">
          <div className="cta-card">
            <div className="cta-aurora" aria-hidden="true"><span /><span /><span /></div>
            <div className="cta-grid" aria-hidden="true" />
            <svg className="cta-waves" viewBox="0 0 1200 200" preserveAspectRatio="none" aria-hidden="true">
              <path className="cta-wave cta-wave-1" d="M0 100 C 150 40, 300 160, 450 100 S 750 40, 900 100 S 1100 160, 1200 100" />
              <path className="cta-wave cta-wave-2" d="M0 110 C 150 170, 300 50, 450 110 S 750 170, 900 110 S 1100 50, 1200 110" />
            </svg>
            <h2>Ready to Decode<br />Your <span className="cta-highlight">Voice</span>?</h2>
            <p>{user ? 'Welcome back. Pick up where you left off.' : 'Create your account in seconds — just an email and a 6-digit code. Your first check-in takes about a minute.'}</p>
            <div className="cta-buttons">
              <Link href={ctaHref} prefetch className="btn-lg btn-light btn-magnetic" onClick={handleGetStarted}>
                <span className="btn-icon btn-icon-dark"><Icon name="mic" size={16} color="#fff" /></span>
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
        <div className="footer-wordmark-wrap" aria-hidden="true">
          <div className="footer-wordmark">Voice Says Everything</div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Reveal AI. All rights reserved.</p>
          <button type="button" className="back-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            Back to top
            <span className="back-top-icon"><Icon name="arrow-forward" size={12} color="currentColor" style={{ transform: 'rotate(-90deg)' }} /></span>
          </button>
        </div>
      </footer>

      {/* Pricing Modal — shown when non-user clicks any Get Started CTA */}
      {showPricingModal && (
        <PricingModal onClose={() => setShowPricingModal(false)} />
      )}
    </div>
  );
}

// A call timer that actually ticks, isolated so only it re-renders each second.
function LiveTimer({ start }: { start: number }) {
  const [s, setS] = useState(start);
  useEffect(() => {
    const id = window.setInterval(() => setS((v) => v + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <>{String(Math.floor(s / 60)).padStart(2, '0')}:{String(s % 60).padStart(2, '0')}</>;
}

function PreviewBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="pbar-row">
      <span className="pbar-label">{label}</span>
      <div className="pbar-track"><div className="pbar-fill" style={{ width: `${value}%` }} /></div>
      <span className="pbar-val">{value}</span>
    </div>
  );
}

function ProblemCard({ n, icon, title, children }: { n?: string; icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="problem-card spot">
      {n && <span className="problem-n" aria-hidden="true">{n}</span>}
      <div className="problem-icon"><Icon name={icon} size={24} color="var(--blue)" /></div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Step({ n, icon, title, desc }: { n: number; icon: string; title: string; desc: string }) {
  return (
    <div className="step spot">
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
    <div className={`pricing-card spot${featured ? ' pricing-card-featured' : ''}`}>
      {featured && <div className="pricing-border" aria-hidden="true" />}
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
            <span className="pf-check">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            {f}
          </li>
        ))}
      </ul>
      <Link href={ctaHref} className={`pricing-cta${featured ? ' pricing-cta-featured' : ''}`} onClick={onCtaClick}>
        {ctaLabel}
        <Icon name="arrow-forward" size={14} color="currentColor" />
      </Link>
    </div>
  );
}
