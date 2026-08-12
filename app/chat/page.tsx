'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { CrisisEscalation } from '@/components/CrisisEscalation';
import {
  chatTherapy,
  endCoachSession,
  flagSessionCrisis,
  getRecentTherapySessions,
  getSessionMessages,
  saveChatMessage,
  startOrResumeCoachSession,
  type AnalysisResult,
  type ChatMessage,
} from '@/lib/ai';
import type { CrisisResource } from '@/lib/crisis';
// Pure function, no server dependency — safe to import into a client component.
import { relativeDay } from '@/lib/chatMemory';

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
  // When the check-in behind `results` was recorded.
  //
  // `results` is captured once on mount and never updated, so without a date
  // beside it the header reads as "this is you, now" when it can be a mood
  // from three weeks ago — there is no time bound on the fallback lookup.
  // AnalysisResult omits created_at, so it is tracked separately rather than
  // widening the type for one field.
  const [contextAt, setContextAt] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  // Set when screening escalates. Non-null means the conversation is over —
  // T-8 renders the support view and the composer stays disabled.
  const [crisis, setCrisis] = useState<{ resources: CrisisResource[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // T-4: end the session, which triggers summarisation server-side. Only
  // offered once the user has actually said something — ending an empty
  // conversation would put a blank row in their history.
  const hasUserSpoken = messages.some((m) => m.role === 'user');

  const endSession = async () => {
    if (!sessionId || ending) return;
    setEnding(true);
    try {
      await endCoachSession(sessionId);
      router.push('/history');
    } catch (err) {
      console.error('[chat] could not end session:', err);
      setEnding(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Context comes from sessionStorage when arriving straight from a
        // check-in. Opening /chat directly used to bounce the user to /home;
        // now it falls back to their most recent stored check-in so the chat
        // is reachable on its own.
        let ctx: AnalysisResult | null = null;
        // Arriving from a check-in means it was recorded moments ago, so the
        // sessionStorage path is "now". The fallback path carries its own date.
        let ctxAt: string | null = null;
        const raw = sessionStorage.getItem('chatContext');
        if (raw) {
          try {
            ctx = JSON.parse(raw) as AnalysisResult;
            ctxAt = new Date().toISOString();
          } catch {
            ctx = null;
          }
        }
        if (!ctx) {
          const recent = await getRecentTherapySessions(1);
          if (recent.length > 0) {
            ctx = recent[0] as unknown as AnalysisResult;
            ctxAt = recent[0].created_at;
          }
        }
        if (!ctx) {
          // Genuinely nothing to talk about yet — send them to record one.
          router.replace('/home');
          return;
        }

        const session = await startOrResumeCoachSession();
        const stored = await getSessionMessages(session.id);
        if (cancelled) return;

        setResults(ctx);
        setContextAt(ctxAt);
        setSessionId(session.id);

        if (stored.length > 0) {
          // Resuming: replay exactly what was said, do not re-open.
          setMessages(
            stored.map((m) => ({ id: m.id, role: m.role, content: m.content }))
          );
          return;
        }

        // New conversation. The opener is persisted like any other message so
        // a reload shows the same first line rather than regenerating one.
        const opener = buildOpener(ctx);
        const savedOpener = await saveChatMessage({
          sessionId: session.id,
          role: 'assistant',
          content: opener,
        });
        if (cancelled) return;
        setMessages([{ id: savedOpener.id, role: 'assistant', content: opener }]);
      } catch {
        if (!cancelled) router.replace('/home');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading || !results || !sessionId) return;

    // Render immediately so typing feels responsive, then reconcile the id
    // once the row comes back.
    const tempId = `tmp-${Date.now()}`;
    const next = [...messages, { id: tempId, role: 'user' as const, content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const savedUser = await saveChatMessage({
        sessionId,
        role: 'user',
        content: text,
      });
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, id: savedUser.id } : m))
      );

      const apiMessages: ChatMessage[] = next.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const result = await chatTherapy({ messages: apiMessages });

      // T-7/T-8: no therapist reply was generated. Persist the escalation so
      // the transcript reflects what the user actually saw, flag it for the
      // T-8 audit trail, and hand off to the escalation view.
      const savedReply = await saveChatMessage({
        sessionId,
        role: 'assistant',
        content: result.reply,
        crisisFlagged: result.crisis === true,
      });
      setMessages((prev) => [
        ...prev,
        { id: savedReply.id, role: 'assistant', content: result.reply },
      ]);

      if (result.crisis) {
        await flagSessionCrisis(sessionId).catch(() => {});
        setCrisis({ resources: result.resources ?? [] });
      }
    } catch (err) {
      // Deliberately not persisted. A connection failure is not part of the
      // conversation, so it must not reappear in the transcript on reload.
      console.error('[chat] send failed:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: "I'm sorry, I couldn't connect. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Both are set together once the session is open. Waiting on sessionId too
  // means the composer never renders in a state where sending would no-op.
  if (!results || !sessionId) return null;

  const modeColor = MODE_COLOR[results.detected_mode] ?? COLORS.textMuted;
  // "today" / "3 days ago". Falls back to the neutral wording rather than
  // guessing a date when the timestamp is unavailable.
  const contextWhen = contextAt ? relativeDay(contextAt) : null;

  return (
    <AppShell
      title="AI Coach Chat"
      subtitle={
        contextWhen
          ? `From your check-in ${contextWhen}`
          : 'From your last check-in'
      }
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
          {/*
            Labelled as history, not as a live reading. This bar is frozen at
            mount and never updates as the conversation goes, so presenting a
            bare "Mood 45" invited people to read a possibly weeks-old score as
            how they are right now.
          */}
          <span style={{ fontSize: 12, color: COLORS.textMuted }}>
            {contextWhen ? `Check-in ${contextWhen}` : 'Last check-in'}
          </span>
          <span style={{ fontSize: 12, color: COLORS.cardBorder }}>·</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.blue, fontFamily: 'var(--font-syne)' }}>{results.mood_score}</span>
          <span style={{ fontSize: 12, color: COLORS.cardBorder }}>·</span>
          <span style={{ fontSize: 12, color: modeColor, textTransform: 'capitalize', fontWeight: 600 }}>
            {results.detected_mode}
          </span>

          {hasUserSpoken && (
            <button
              onClick={endSession}
              disabled={ending}
              style={{
                marginLeft: 'auto',
                padding: '6px 14px',
                borderRadius: 10,
                border: `1px solid ${COLORS.cardBorder}`,
                background: 'transparent',
                color: COLORS.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: ending ? 'wait' : 'pointer',
                opacity: ending ? 0.5 : 1,
              }}
            >
              {ending ? 'Saving…' : 'End session'}
            </button>
          )}
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

        {/*
          T-8: the composer is REPLACED, not disabled or overlaid. If the user
          can still type, the conversational flow was not interrupted and the
          requirement is not met.
        */}
        {crisis ? (
          <CrisisEscalation
            resources={crisis.resources}
            acknowledging={ending}
            onAcknowledge={endSession}
          />
        ) : (
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
        )}
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
