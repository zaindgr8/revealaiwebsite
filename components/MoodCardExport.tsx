'use client';
import { useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { domToPng } from '@/lib/htmlToImage';
import { Icon } from '@/components/Icon';

type Props = {
  moodScore: number;
  mode: string;
  insightLine: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

// Mode styling specific to Card Export
const CARD_MODE_META: Record<string, { emoji: string; text: string; gradient: string }> = {
  calm:       { emoji: '🌊', text: 'Calm',       gradient: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0369a1 100%)' },
  happy:      { emoji: '✨', text: 'Happy',      gradient: 'linear-gradient(135deg, #022c22 0%, #065f46 50%, #0f766e 100%)' },
  motivated:  { emoji: '⚡', text: 'Motivated',  gradient: 'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #78350f 100%)' },
  anxious:    { emoji: '🌀', text: 'Anxious',    gradient: 'linear-gradient(135deg, #1c1917 0%, #442a08 50%, #b45309 100%)' },
  venting:    { emoji: '🔥', text: 'Venting',    gradient: 'linear-gradient(135deg, #1a0505 0%, #581c0c 50%, #991b1b 100%)' },
  angry:      { emoji: '⚡', text: 'Angry',      gradient: 'linear-gradient(135deg, #1a0505 0%, #7f1d1d 50%, #b91c1c 100%)' },
  sad:        { emoji: '🌧️', text: 'Sad',        gradient: 'linear-gradient(135deg, #090d16 0%, #1e293b 50%, #1d4ed8 100%)' },
  reflective: { emoji: '🪞', text: 'Reflective', gradient: 'linear-gradient(135deg, #0f0b16 0%, #2e1065 50%, #6d28d9 100%)' },
  neutral:    { emoji: '⚖️', text: 'Neutral',    gradient: 'linear-gradient(135deg, #09090b 0%, #18181b 50%, #3f3f46 100%)' },
};

export function MoodCardExport({ moodScore, mode, insightLine, triggerRef }: Props) {
  const storyRef = useRef<HTMLDivElement>(null);
  const squareRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const cleanMode = mode.toLowerCase().trim();
  const meta = CARD_MODE_META[cleanMode] ?? CARD_MODE_META.neutral;

  // Truncate insight line for card space
  const displayInsight = insightLine.split(/[.!?]/)[0] + '.';

  // Waveform bars heights for graphic
  const waveHeights = [20, 35, 15, 45, 60, 30, 75, 90, 40, 80, 50, 70, 25, 40, 15];

  const handleExport = async (format: 'story' | 'square') => {
    const target = format === 'story' ? storyRef.current : squareRef.current;
    if (!target) return;

    setExporting(true);
    setShowOptions(false);

    const width = format === 'story' ? 1080 : 1080;
    const height = format === 'story' ? 1920 : 1080;
    const filename = `reveal_mood_${format}_${Date.now()}.png`;

    try {
      // Temporarily reveal target container for capturing
      target.style.display = 'flex';
      // Wait one frame to ensure DOM layout is correct
      await new Promise((r) => requestAnimationFrame(r));

      const pngData = await domToPng(target, width, height);

      // Hide template back
      target.style.display = 'none';

      // ── Share or Save File ──
      const blob = await (await fetch(pngData)).blob();
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Voice Check-In',
          text: `Analyzed my voice on Reveal AI — I'm in ${meta.text} mode.`,
        });
      } else {
        // Desktop / unsupported: trigger download
        const a = document.createElement('a');
        a.href = pngData;
        a.download = filename;
        a.click();
      }
    } catch (err) {
      console.error('[MoodCardExport] Export failed:', err);
      alert('Failed to export card image. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Wire up trigger click to show options menu
  if (triggerRef.current) {
    triggerRef.current.onclick = () => setShowOptions(true);
  }

  return (
    <>
      {/* Options Modal Dialog */}
      {showOptions && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9,9,12,0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 24,
              padding: 24,
              width: '100%',
              maxWidth: 380,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
                Choose Share Format
              </div>
              <button
                onClick={() => setShowOptions(false)}
                style={{ background: 'transparent', border: 'none', color: COLORS.textMuted, fontSize: 16, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                onClick={() => handleExport('story')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px',
                  borderRadius: 14, border: `1px solid ${COLORS.cardBorder}`, background: 'rgba(17,17,24,0.02)',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s',
                }}
              >
                <div style={{ fontSize: 24 }}>📱</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>Story Format (9:16)</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>Best for Instagram / TikTok Stories</div>
                </div>
              </button>

              <button
                onClick={() => handleExport('square')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '14px 16px',
                  borderRadius: 14, border: `1px solid ${COLORS.cardBorder}`, background: 'rgba(17,17,24,0.02)',
                  cursor: 'pointer', textAlign: 'left', transition: 'background 0.2s',
                }}
              >
                <div style={{ fontSize: 24 }}>⬜</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>Square Format (1:1)</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>Best for Feed posts, Twitter, or Chat sharing</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {exporting && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(9,9,12,0.85)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            gap: 12,
          }}
        >
          <div
            style={{
              width: 40, height: 40, borderRadius: '50%',
              border: `4px solid ${COLORS.cardBorder}`, borderTopColor: COLORS.blue,
              animation: 'spin 1s linear infinite',
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'var(--font-syne)' }}>
            Generating Mood Card...
          </span>
          <style>{`
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}

      {/* ── Off-screen export templates (rendered hidden, flex when capturing) ── */}

      {/* 1. Story Template (1080 x 1920) */}
      <div
        ref={storyRef}
        style={{
          display: 'none', // absolute off-screen hiding
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 1080,
          height: 1920,
          padding: '120px 80px',
          background: meta.gradient,
          boxSizing: 'border-box',
          position: 'fixed',
          top: -9999,
          left: -9999,
          zIndex: -999,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Header logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', letterSpacing: 8, textTransform: 'uppercase', opacity: 0.9 }}>
            REVEAL VOICE AI
          </div>
          <div style={{ width: 40, height: 1, background: '#fff', margin: '12px auto 0', opacity: 0.3 }} />
        </div>

        {/* Center content */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 60 }}>
          {/* Circular Mood Score */}
          <div
            style={{
              width: 320, height: 320, borderRadius: '50%',
              border: '6px solid rgba(255,255,255,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <span style={{ fontSize: 100, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{moodScore}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 2, marginTop: 4 }}>
              MOOD SCORE
            </span>
          </div>

          {/* Mode Badge */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'rgba(255,255,255,0.1)',
              border: '2px solid rgba(255,255,255,0.2)',
              borderRadius: 30,
              padding: '16px 36px',
            }}
          >
            <span style={{ fontSize: 40 }}>{meta.emoji}</span>
            <span style={{ fontSize: 32, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>
              {meta.text} MODE
            </span>
          </div>

          {/* AI Insight sentence */}
          <div
            style={{
              textAlign: 'center', color: 'rgba(255,255,255,0.9)',
              fontSize: 34, fontWeight: 600, lineHeight: 1.5,
              padding: '0 20px', maxWidth: 850,
            }}
          >
            &ldquo;{displayInsight}&rdquo;
          </div>
        </div>

        {/* Stylized mini-waveform + watermark */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', gap: 40 }}>
          {/* Waveform graphic */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 100 }}>
            {waveHeights.map((h, i) => (
              <div
                key={i}
                style={{
                  width: 8, height: h * 0.9, borderRadius: 4,
                  background: 'rgba(255,255,255,0.7)',
                }}
              />
            ))}
          </div>

          {/* Website watermark */}
          <div style={{ fontSize: 16, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 4, textTransform: 'uppercase' }}>
            REVEALVOICE.AI
          </div>
        </div>
      </div>

      {/* 2. Square Template (1080 x 1080) */}
      <div
        ref={squareRef}
        style={{
          display: 'none', // absolute off-screen hiding
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 1080,
          height: 1080,
          padding: '80px',
          background: meta.gradient,
          boxSizing: 'border-box',
          position: 'fixed',
          top: -9999,
          left: -9999,
          zIndex: -999,
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 4, textTransform: 'uppercase', opacity: 0.9 }}>
            REVEAL VOICE AI
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase' }}>
            REVEALVOICE.AI
          </div>
        </div>

        {/* Center row grid */}
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-around', gap: 40, padding: '0 20px' }}>
          {/* Circular Mood Score */}
          <div
            style={{
              width: 260, height: 260, borderRadius: '50%',
              border: '6px solid rgba(255,255,255,0.15)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
              background: 'rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 80, fontWeight: 900, color: '#fff', lineHeight: 1 }}>{moodScore}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 2 }}>
              MOOD SCORE
            </span>
          </div>

          {/* Right layout block */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20, flex: 1 }}>
            {/* Mode Badge */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'rgba(255,255,255,0.1)',
                border: '1.5px solid rgba(255,255,255,0.2)',
                borderRadius: 24,
                padding: '12px 28px',
              }}
            >
              <span style={{ fontSize: 28 }}>{meta.emoji}</span>
              <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {meta.text} MODE
              </span>
            </div>

            {/* AI Insight sentence */}
            <div
              style={{
                color: 'rgba(255,255,255,0.95)',
                fontSize: 26, fontWeight: 600, lineHeight: 1.45,
                maxWidth: 550,
              }}
            >
              &ldquo;{displayInsight}&rdquo;
            </div>
          </div>
        </div>

        {/* Footer mini-waveform */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, height: 60, width: '100%', justifyContent: 'center' }}>
          {waveHeights.map((h, i) => (
            <div
              key={i}
              style={{
                width: 6, height: h * 0.55, borderRadius: 3,
                background: 'rgba(255,255,255,0.6)',
              }}
            />
          ))}
        </div>
      </div>
    </>
  );
}
