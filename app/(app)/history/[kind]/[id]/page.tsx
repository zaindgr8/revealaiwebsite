'use client';

/**
 * One past session, in full.
 *
 * NOT a PRD requirement. T-5 asks only that Profile History "lists past
 * sessions newest first with date, mood, summary", and the list satisfies that.
 * This exists because the client's actual brief was one line — "Profile History
 * Should be Showing There" — which the PRD narrowed to a list, and because
 * Intent Detector rows became clickable for I-6, which made the other two
 * feeling dead more obvious rather than less.
 *
 * Added after the 12 August scope freeze. It should be priced separately rather
 * than absorbed.
 *
 * One route for both kinds rather than two nearly identical ones: the framing —
 * header, back link, delete, not-found — is the same for a check-in and a
 * conversation, and only the body differs.
 */

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { COLORS, MODE_COLOR } from '@/lib/theme';
import { AppShell } from '@/components/AppShell';
import { Icon } from '@/components/Icon';
import { fmtFullDate, fmtTime } from '@/lib/format';
import {
  getTherapySession,
  getCoachSession,
  type TherapySession,
  type CoachSession,
  type ChatMessageRow,
} from '@/lib/ai';

type Loaded =
  | { kind: 'checkin'; session: TherapySession }
  | { kind: 'chat' | 'live'; session: CoachSession; messages: ChatMessageRow[] };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 18,
        padding: '18px 18px',
        marginBottom: 14,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary, marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 14, lineHeight: 1.65, color: COLORS.textPrimary, whiteSpace: 'pre-wrap' }}>
      {children}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 72 }}>
      <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'var(--font-syne)' }}>
        {typeof value === 'number' ? value : '—'}
      </div>
    </div>
  );
}

function DetailInner() {
  const router = useRouter();
  const params = useParams<{ kind: string; id: string }>();
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (params.kind === 'checkin') {
          const session = await getTherapySession(params.id);
          if (!cancelled) setData(session ? { kind: 'checkin', session } : null);
        } else if (params.kind === 'chat' || params.kind === 'live') {
          const found = await getCoachSession(params.id);
          if (!cancelled)
            setData(found ? { kind: params.kind === 'live' ? 'live' : 'chat', ...found } : null);
        } else if (!cancelled) {
          setError('Unknown session type.');
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.kind, params.id]);

  if (loading) {
    return (
      <AppShell title="Session">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div
            style={{
              width: 32,
              height: 32,
              border: `3px solid ${COLORS.cardBorder}`,
              borderTopColor: COLORS.blue,
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell title="Session">
        <Card title={error ? 'Could not open this session' : 'Session not found'}>
          <Prose>
            {error ??
              'This session no longer exists. It may have been deleted from another device.'}
          </Prose>
          <button
            onClick={() => router.push('/history')}
            style={{
              marginTop: 14,
              padding: '10px 16px',
              borderRadius: 12,
              border: `1px solid ${COLORS.cardBorder}`,
              color: COLORS.textSecondary,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            Back to history
          </button>
        </Card>
      </AppShell>
    );
  }

  const created = data.kind === 'checkin' ? data.session.created_at : data.session.created_at;

  return (
    <AppShell
      title={
        data.kind === 'checkin'
          ? 'Voice check-in'
          : data.kind === 'live'
          ? 'Live call'
          : 'Chat'
      }
      subtitle={`${fmtFullDate(created)} · ${fmtTime(created)}`}
      contentMaxWidth={860}
    >
      {data.kind === 'checkin' ? (
        <CheckinBody session={data.session} />
      ) : (
        <ChatBody session={data.session} messages={data.messages} />
      )}

      <button
        onClick={() => router.push('/history')}
        style={{
          padding: '10px 16px',
          borderRadius: 12,
          border: `1px solid ${COLORS.cardBorder}`,
          color: COLORS.textSecondary,
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        Back to history
      </button>
    </AppShell>
  );
}

function CheckinBody({ session }: { session: TherapySession }) {
  const modeColor = MODE_COLOR[session.detected_mode] ?? COLORS.blue;
  // Every field below is written by analyze-mood but has only ever been visible
  // on the results screen immediately after recording. Older sessions may not
  // carry all of them, so each renders only when present rather than showing an
  // empty heading.
  const insight = session.ai_insight ?? session.insight;
  const recommendations = session.recommendations ?? session.tips ?? [];

  return (
    <>
      <Card title="How you scored">
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Stat label="Mood" value={session.mood_score} color={modeColor} />
          <Stat label="Energy" value={session.energy} color={COLORS.blue} />
          <Stat label="Stress" value={session.stress} color={COLORS.danger} />
          <Stat label="Positivity" value={session.positivity} color={COLORS.green} />
          <Stat label="Confidence" value={session.confidence} color={COLORS.blue} />
        </div>
        {session.detected_mode && (
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                background: modeColor + '18',
                color: modeColor,
                padding: '3px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'capitalize',
              }}
            >
              {session.detected_mode}
            </span>
            {session.pace && (
              <span
                style={{
                  background: COLORS.cardBorder + '40',
                  color: COLORS.textSecondary,
                  padding: '3px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {session.pace} pace
              </span>
            )}
          </div>
        )}
      </Card>

      {session.vocal_summary && <Card title="How your voice sounded"><Prose>{session.vocal_summary}</Prose></Card>}
      {session.transcript_summary && (
        <Card title="What you talked about"><Prose>{session.transcript_summary}</Prose></Card>
      )}
      {insight && <Card title="What it points to"><Prose>{insight}</Prose></Card>}

      {session.readiness_note && (
        <Card title="How ready you sounded">
          <Prose>{session.readiness_note}</Prose>
          {typeof session.readiness_score === 'number' && (
            <div style={{ marginTop: 8, fontSize: 13, color: COLORS.textMuted }}>
              Readiness {session.readiness_score}
            </div>
          )}
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card title="What might help">
          <ul style={{ margin: 0, paddingLeft: 18, color: COLORS.textPrimary }}>
            {recommendations.map((r, i) => (
              <li key={i} style={{ fontSize: 14, lineHeight: 1.65, marginBottom: 6 }}>
                {r}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {session.todays_action && <Card title="One thing to try"><Prose>{session.todays_action}</Prose></Card>}
      {session.transcript && (
        <Card title="What you said">
          <Prose>{`“${session.transcript}”`}</Prose>
        </Card>
      )}
    </>
  );
}

function ChatBody({
  session,
  messages,
}: {
  session: CoachSession;
  messages: ChatMessageRow[];
}) {
  return (
    <>
      {session.crisis_flagged && (
        <div
          style={{
            background: COLORS.danger + '10',
            border: `1px solid ${COLORS.danger}40`,
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 14,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Icon name="warning" size={18} color={COLORS.danger} />
          <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
            Support resources were shown during this conversation.
          </div>
        </div>
      )}

      {session.summary && <Card title="Summary"><Prose>{session.summary}</Prose></Card>}

      {session.topics && session.topics.length > 0 && (
        <Card title="Topics">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {session.topics.map((t) => (
              <span
                key={t}
                style={{
                  background: COLORS.blue + '14',
                  color: COLORS.blue,
                  padding: '3px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card title={`Conversation · ${messages.length} messages`}>
        {messages.length === 0 ? (
          <Prose>This conversation has no saved messages.</Prose>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: m.role === 'user' ? COLORS.blue : COLORS.textMuted,
                    marginBottom: 3,
                  }}
                >
                  {m.role === 'user' ? 'You' : 'Elena'}
                </div>
                <div
                  style={{
                    maxWidth: '85%',
                    background: m.role === 'user' ? COLORS.blue + '10' : COLORS.surface,
                    border: `1px solid ${COLORS.cardBorder}`,
                    borderRadius: 14,
                    padding: '10px 13px',
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: COLORS.textPrimary,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

export default function HistoryDetailPage() {
  return (
    <>
      <DetailInner />
    </>
  );
}
