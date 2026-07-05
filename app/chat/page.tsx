'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { chatTherapy, type AnalysisResult, type ChatMessage } from '@/lib/ai';

type Msg = ChatMessage & { id: string };

function buildOpener(results: AnalysisResult) {
  const score = results.mood_score;
  const mode = results.detected_mode;
  if (mode === 'sad' || score < 40)
    return `I hear you. It sounds like today has been really hard. I'm here — what's weighing on you the most right now?`;
  if (mode === 'anxious')
    return `I can sense some tension in what you shared. That feeling is valid. What's been on your mind most today?`;
  if (mode === 'angry' || mode === 'venting')
    return `It sounds like a lot came up for you today. Sometimes we just need to let it out — I'm listening. What happened?`;
  if (mode === 'calm' || mode === 'hopeful' || score >= 70)
    return `You sound like you're in a good place today — that's great to hear. What's been going well for you?`;
  return `Thanks for checking in today. Your mood score is ${score} — tell me, how are you really feeling right now?`;
}

function ChatInner() {
  const router = useRouter();
  const [results, setResults] = useState<AnalysisResult | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('chatContext');
      if (!raw) {
        router.replace('/home');
        return;
      }
      const parsed = JSON.parse(raw) as AnalysisResult;
      setResults(parsed);
      setMessages([{ id: '0', role: 'assistant', content: buildOpener(parsed) }]);
    } catch {
      router.replace('/home');
    }
  }, [router]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !results) return;

    const userMsg: Msg = { id: Date.now().toString(), role: 'user', content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const apiMessages: ChatMessage[] = next.map((m) => ({ role: m.role, content: m.content }));
      const reply = await chatTherapy({
        messages: apiMessages,
        context: {
          mood_score: results.mood_score,
          energy: results.energy,
          stress: results.stress,
          detected_mode: results.detected_mode,
          insight: results.insight,
        },
      });
      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: 'assistant', content: reply },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I'm sorry, I couldn't connect. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!results) return null;

  const modeColor = MODE_COLOR[results.detected_mode] ?? COLORS.textMuted;

  return (
    <AppShell
      title="AI Coach Chat"
      subtitle={`Mood ${results.mood_score} · ${results.detected_mode}`}
      contentMaxWidth={920}
      contentPadding="0"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 70px)',
        }}
      >
        <div
          style={{
            padding: '12px 24px',
            borderBottom: `1px solid ${COLORS.cardBorder}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: 4, background: COLORS.blue, boxShadow: `0 0 6px ${COLORS.blue}` }} />
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>Mood</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.blue, fontFamily: 'var(--font-syne)' }}>{results.mood_score}</span>
          <span style={{ fontSize: 12, color: COLORS.cardBorder }}>·</span>
          <span style={{ fontSize: 12, color: modeColor, textTransform: 'capitalize', fontWeight: 600 }}>
            {results.detected_mode}
          </span>
        </div>

        <div style={{ padding: '14px 24px 0' }}>
          <MedicalDisclaimer variant="banner" />
        </div>

        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  maxWidth: '78%',
                  padding: '12px 16px',
                  borderRadius: 18,
                  background: m.role === 'user' ? COLORS.blue : COLORS.card,
                  border: m.role === 'user' ? 'none' : `1px solid ${COLORS.cardBorder}`,
                  borderBottomRightRadius: m.role === 'user' ? 6 : 18,
                  borderBottomLeftRadius: m.role === 'user' ? 18 : 6,
                  color: m.role === 'user' ? COLORS.white : COLORS.textSecondary,
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 0 10px 14px',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${COLORS.cardBorder}`,
                  borderTopColor: COLORS.blue,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span style={{ fontSize: 13, color: COLORS.textMuted }}>Thinking...</span>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 10,
            padding: '12px 20px',
            borderTop: `1px solid ${COLORS.cardBorder}`,
            background: COLORS.background,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Share what's on your mind…"
            rows={1}
            maxLength={500}
            style={{
              flex: 1,
              background: COLORS.card,
              border: `1.5px solid ${COLORS.cardBorder}`,
              borderRadius: 18,
              padding: '11px 18px',
              fontSize: 14,
              color: COLORS.textPrimary,
              maxHeight: 120,
              resize: 'none',
              transition: 'border-color 0.2s',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !input.trim() || loading ? 0.35 : 1,
              cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              transition: 'opacity 0.2s',
            }}
            aria-label="Send"
          >
            <Icon name="send" size={18} color={COLORS.white} />
          </button>
        </div>
      </div>
    </AppShell>
  );
}

export default function ChatPage() {
  return (
    <AuthGuard>
      <ChatInner />
    </AuthGuard>
  );
}
