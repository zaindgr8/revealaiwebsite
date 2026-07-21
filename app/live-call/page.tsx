'use client';

import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import LiveVoiceChat from '@/components/LiveVoiceChat';
import { COLORS } from '@/lib/theme';

export default function LiveCallPage() {
  return (
    <AuthGuard>
      <AppShell
        title="Live Voice Call"
        subtitle="Real-time 2-way conversation powered by Gemini Multimodal Live API"
      >
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {/* Header Card */}
          <div
            style={{
              background: COLORS.card,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 24,
              padding: '24px 28px',
              marginBottom: 28,
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.04)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 22,
                }}
              >
                🎙️
              </div>
              <div>
                <h1
                  style={{
                    fontFamily: 'var(--font-syne)',
                    fontSize: 22,
                    fontWeight: 800,
                    color: COLORS.textPrimary,
                    margin: 0,
                  }}
                >
                  Live Companion Call (Despina Voice)
                </h1>
                <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: '2px 0 0' }}>
                  Authentic, human-like voice conversation with zero latency and natural cadence
                </p>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
                marginTop: 16,
                paddingTop: 16,
                borderTop: `1px solid ${COLORS.cardBorder}`,
              }}
            >
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                <strong style={{ color: COLORS.textPrimary, display: 'block' }}>✨ Smooth Voice</strong>
                Despina persona — warm, inviting, &amp; natural rhythm
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                <strong style={{ color: COLORS.textPrimary, display: 'block' }}>⚡ Multimodal Live API</strong>
                Direct WebSocket streaming with low-latency PCM audio
              </div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
                <strong style={{ color: COLORS.textPrimary, display: 'block' }}>🗣️ Interruption Aware</strong>
                Speak over at any time, just like a real phone call
              </div>
            </div>
          </div>

          {/* Live Voice Chat Interactive Component */}
          <LiveVoiceChat />
        </div>
      </AppShell>
    </AuthGuard>
  );
}
