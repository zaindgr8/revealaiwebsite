'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import {
  TERMINAL_STATUSES,
  deleteIntentSession,
  getIntentSession,
  nameOtherSpeaker,
  startAnalysis,
  startProcessing,
  swapSpeakerAttribution,
  type IntentSession,
  type IntentStatus,
} from '@/lib/audioStorage';
import type { Segment } from '@/lib/transcription';
import { signalTone, type IntentAnalysis } from '@/lib/intentAnalysis';

/**
 * Intent Detector result screen.
 *
 * N-8: processing runs as a background job with visible status. This polls the
 * session row rather than holding a request open — a 20-minute recording takes
 * minutes to process, and a page that hangs on it breaks the moment anyone
 * closes the tab or loses signal.
 *
 * I-6: results are retrievable after logout and login, which is why this is a
 * routable page keyed on the session id rather than state in the record flow.
 */

const POLL_MS = 4000;

/**
 * How long a session may sit at 'uploaded' before the page stops calling it
 * "Queued" and offers a way out.
 *
 * Normally this state lasts a second or two — the upload flow fires
 * startProcessing and the route flips the row to 'transcribing' almost
 * immediately. But every failure BEFORE that first write leaves the session
 * here with a null error and no way forward: the route checks its API key ahead
 * of anything else and returns 500 without touching the database, so a missing
 * key on the server strands the row silently. That happened on production on
 * 19 August, to two different users, and the page span forever on both.
 *
 * Long enough not to alarm anyone during the normal window, short enough that
 * nobody sits watching a spinner that is never going to stop.
 */
const STALL_AFTER_MS = 20000;

const STATUS_COPY: Record<IntentStatus, { title: string; detail: string }> = {
  draft: { title: 'Not started', detail: 'This session was never recorded.' },
  awaiting_upload: {
    title: 'Waiting for the recording',
    detail: 'The audio has not finished uploading yet.',
  },
  uploaded: {
    title: 'Queued',
    detail: 'Your recording is stored and about to be processed.',
  },
  transcribing: {
    title: 'Working out who said what',
    detail: 'Separating the two voices and matching one of them to your voice sample.',
  },
  analysing: {
    title: 'Reading the conversation',
    detail: 'The transcript is ready. Working through what stood out.',
  },
  complete: { title: 'Done', detail: '' },
  insufficient_quality: {
    title: 'We could not read this recording clearly',
    detail: '',
  },
  failed: { title: 'Something went wrong', detail: '' },
};

function ResultInner() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const sessionId = params?.id;

  const [session, setSession] = useState<IntentSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);
  // When we first saw this session sitting at 'uploaded'. Null whenever it is
  // in any other state, so leaving and re-entering that state restarts the clock.
  const uploadedSinceRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Polling means 'analysing' is seen repeatedly. Without this the page would
  // fire a fresh analysis every four seconds; the route is idempotent, but only
  // after the first one has finished writing.
  const analysisFiredRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;

    const tick = async () => {
      try {
        const s = await getIntentSession(sessionId);
        if (cancelled) return;
        if (!s) {
          setError('That session no longer exists.');
          setLoading(false);
          return;
        }
        setSession(s);
        setNameDraft((prev) => prev || s.other_speaker_name || '');
        setLoading(false);

        // Deliberately not auto-firing startProcessing here, the way the
        // analysis below is auto-fired. The upload flow has already called it,
        // and the window between that call and the route's first write is
        // exactly when this page is mounting — firing again inside it would
        // start a second transcription of the same audio and bill for it twice.
        // A stalled session gets a button instead, and a person decides.
        if (s.status === 'uploaded') {
          uploadedSinceRef.current ??= Date.now();
          if (Date.now() - uploadedSinceRef.current > STALL_AFTER_MS) setStalled(true);
        } else {
          uploadedSinceRef.current = null;
          setStalled(false);
        }

        // I-5. Transcription hands over at 'analysing' and stops; this is what
        // picks the session up. Kicked from the page rather than chained inside
        // /api/intent/process so the two halves keep separate time budgets and
        // separate retries.
        if (s.status === 'analysing' && !analysisFiredRef.current) {
          analysisFiredRef.current = true;
          startAnalysis(s.id).catch((e) => {
            if (!cancelled) setAnalysisError((e as Error).message);
          });
        }

        // Stop polling once there is nothing left to wait for.
        if (!TERMINAL_STATUSES.includes(s.status)) {
          timerRef.current = setTimeout(tick, POLL_MS);
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setLoading(false);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sessionId]);

  const retry = async () => {
    if (!session) return;
    setRetrying(true);
    setError(null);
    setStalled(false);
    uploadedSinceRef.current = null;
    try {
      await startProcessing(session.id);
      const s = await getIntentSession(session.id);
      setSession(s);
      if (s && !TERMINAL_STATUSES.includes(s.status)) {
        timerRef.current = setTimeout(async () => {
          const next = await getIntentSession(session.id);
          setSession(next);
        }, POLL_MS);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRetrying(false);
    }
  };

  /** Re-runs I-5 over an existing transcript. No re-transcription, no re-upload. */
  const reanalyse = async (sessionToRead: IntentSession) => {
    setAnalysisError(null);
    analysisFiredRef.current = true;
    try {
      await startAnalysis(sessionToRead.id);
      setSession(await getIntentSession(sessionToRead.id));
    } catch (e) {
      setAnalysisError((e as Error).message);
    }
  };

  const swap = async () => {
    if (!session || swapping) return;
    setSwapping(true);
    setError(null);
    try {
      // The swap discards any analysis and drops the session back to
      // 'analysing', because every finding in it was drawn from lines that have
      // just changed owner. Re-running is not optional here.
      const swapped = await swapSpeakerAttribution(session.id);
      setSession(swapped);
      analysisFiredRef.current = false;
      if (swapped.status === 'analysing') void reanalyse(swapped);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwapping(false);
    }
  };

  const saveName = async () => {
    if (!session) return;
    try {
      await nameOtherSpeaker(session.id, nameDraft);
      setSession({ ...session, other_speaker_name: nameDraft.trim() || null });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async () => {
    if (!session) return;
    if (!confirm('Delete this recording and its analysis? This cannot be undone.')) return;
    try {
      await deleteIntentSession(session.id);
      router.push('/history');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) {
    return (
      <AppShell title="Conversation">
        <div style={{ display: 'flex', justifyContent: 'center', padding: 70 }}>
          <Spinner />
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell title="Conversation">
        <Notice tone="danger">{error ?? 'Session not found.'}</Notice>
      </AppShell>
    );
  }

  const copy = STATUS_COPY[session.status];
  const transcript = session.transcript as
    | { segments?: Segment[]; enrolled_share?: number; chunk_count?: number; transcribed_in_seconds?: number }
    | null;
  const segments = transcript?.segments ?? [];
  // Two forms, because one of them is a name and the other is a pronoun.
  // themLabel heads the transcript, where 'Them' is a column title. themName
  // goes in sentences, where lowercasing it turns Ahmed into ahmed.
  const themLabel = session.other_speaker_name?.trim() || 'Them';
  const themName = session.other_speaker_name?.trim() || 'them';
  const inProgress = !TERMINAL_STATUSES.includes(session.status);
  const analysis = session.analysis as IntentAnalysis | null;

  return (
    <AppShell
      title="Conversation"
      subtitle={
        session.scenario
          ? `${session.scenario[0].toUpperCase()}${session.scenario.slice(1)} · ${new Date(session.created_at).toLocaleDateString()}`
          : new Date(session.created_at).toLocaleDateString()
      }
    >
      <div style={{ maxWidth: 680 }}>
        {error && <Notice tone="danger">{error}</Notice>}

        {inProgress && !stalled && (
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <Spinner size={20} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                  {copy.title}
                </div>
                <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                  {copy.detail}
                </div>
              </div>
            </div>
            <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 14, lineHeight: 1.6 }}>
              You can leave this page. The work carries on and the result will be
              here when you come back.
            </p>
          </Card>
        )}

        {/*
          Stuck at 'uploaded'. Not an error state in the database — the row has
          no error on it, because the failure happened before anything could be
          written there. Which is exactly why it needs its own affordance: the
          'failed' card below never renders for these, so without this the page
          spins forever and the recording is unreachable.
        */}
        {stalled && (
          <Card accent={COLORS.warning}>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8, fontFamily: 'var(--font-syne)' }}>
              This has not started
            </div>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.65, marginBottom: 10 }}>
              Your recording uploaded correctly and is safely stored, but the
              processing never began. That usually means something was wrong on
              our side rather than with your audio.
            </p>
            <p style={{ fontSize: 12.5, color: COLORS.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
              Nothing has been lost. Starting it again costs you nothing but the
              wait.
            </p>
            <Button onClick={retry} primary disabled={retrying}>
              {retrying ? 'Starting…' : 'Try again'}
            </Button>
          </Card>
        )}

        {/* I-7: a quality problem is a legitimate outcome, not an error. */}
        {session.status === 'insufficient_quality' && (
          <Card accent={COLORS.warning}>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8, fontFamily: 'var(--font-syne)' }}>
              {copy.title}
            </div>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.65, marginBottom: 14 }}>
              {session.error}
            </p>
            <p style={{ fontSize: 12.5, color: COLORS.textMuted, lineHeight: 1.6 }}>
              We would rather tell you this than show you a confident answer built
              on audio we could not read properly.
            </p>
          </Card>
        )}

        {session.status === 'failed' && (
          <Card accent={COLORS.danger}>
            <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, marginBottom: 8 }}>
              {copy.title}
            </div>
            <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.65, marginBottom: 14 }}>
              {session.error}
            </p>
            <Button onClick={retry} primary disabled={retrying}>
              {retrying ? 'Starting…' : 'Try again'}
            </Button>
          </Card>
        )}

        {segments.length > 0 && (
          <>
            <Card>
              <Row label="Who said what">
                {Math.round((transcript?.enrolled_share ?? 0) * 100)}% you
              </Row>
              <Row label="Confidence">
                {session.attribution_confidence != null
                  ? `${Math.round(session.attribution_confidence * 100)}%`
                  : '—'}
              </Row>
              <Row label="Length">
                {session.duration_seconds
                  ? `${Math.round(session.duration_seconds / 60)} min`
                  : '—'}
              </Row>
              {transcript?.transcribed_in_seconds != null && (
                <Row label="Processed in" last>
                  {Math.round(transcript.transcribed_in_seconds)}s across{' '}
                  {transcript.chunk_count ?? 1} parts
                </Row>
              )}
            </Card>

            {/* I-9: naming the other speaker. Presentation only. */}
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 8 }}>
                Who were you speaking with?
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="Their name"
                  maxLength={40}
                  style={{
                    flex: 1,
                    padding: '10px 13px',
                    borderRadius: 10,
                    border: `1.5px solid ${COLORS.cardBorder}`,
                    fontSize: 13,
                    color: COLORS.textPrimary,
                  }}
                />
                <Button onClick={saveName}>Save</Button>
              </div>
            </Card>

            {/* I-5 */}
            {analysisError && (
              <Card accent={COLORS.danger}>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 6 }}>
                  The analysis did not finish
                </div>
                <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6, marginBottom: 12 }}>
                  {analysisError}
                </p>
                <p style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6, marginBottom: 14 }}>
                  Your transcript is safe and is below. Only the reading of it
                  needs to run again.
                </p>
                <Button onClick={() => void reanalyse(session)} primary>
                  Try the analysis again
                </Button>
              </Card>
            )}

            {session.status === 'analysing' && !analysisError && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                  <Spinner size={20} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                      Reading the conversation
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 3, lineHeight: 1.5 }}>
                      Going back over what {themName} said. The transcript is
                      below in the meantime.
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {analysis && <AnalysisView analysis={analysis} themName={themName} />}

            <Card>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                  Transcript
                </div>
                {/*
                  Placed on the transcript, not buried in settings. This is the
                  only screen where a reversed label is noticeable — the user
                  reads a line and knows immediately whether they said it.
                */}
                <button
                  onClick={swap}
                  disabled={swapping}
                  style={{
                    padding: '7px 13px',
                    borderRadius: 10,
                    border: `1px solid ${COLORS.cardBorder}`,
                    background: 'transparent',
                    color: COLORS.textSecondary,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: swapping ? 'wait' : 'pointer',
                    opacity: swapping ? 0.55 : 1,
                  }}
                >
                  {swapping ? 'Swapping…' : 'These are the wrong way round'}
                </button>
              </div>

              {session.attribution_corrected && (
                <div
                  style={{
                    fontSize: 11.5,
                    color: COLORS.textMuted,
                    lineHeight: 1.55,
                    marginBottom: 12,
                    paddingBottom: 12,
                    borderBottom: `1px solid ${COLORS.cardBorder}`,
                  }}
                >
                  You corrected the speaker labels on this conversation. Any
                  analysis reflects the corrected version.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {segments.map((s, i) => (
                  <div
                    key={s.id ?? i}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: s.isEnrolled ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.5,
                        textTransform: 'uppercase',
                        color: s.isEnrolled ? COLORS.blue : COLORS.textMuted,
                        marginBottom: 4,
                      }}
                    >
                      {s.isEnrolled ? 'You' : themLabel}
                      <span style={{ fontWeight: 500, marginLeft: 6, textTransform: 'none', letterSpacing: 0 }}>
                        {formatClock(s.start)}
                      </span>
                    </div>
                    <div
                      style={{
                        maxWidth: '86%',
                        padding: '11px 14px',
                        borderRadius: 14,
                        background: s.isEnrolled ? COLORS.blue + '10' : COLORS.surface,
                        border: `1px solid ${s.isEnrolled ? COLORS.blue + '33' : COLORS.cardBorder}`,
                        fontSize: 13.5,
                        lineHeight: 1.6,
                        color: COLORS.textSecondary,
                      }}
                    >
                      {s.text.trim()}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}

        {/* N-2 */}
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <Button onClick={() => router.push('/history')}>Back to history</Button>
          <Button onClick={remove} danger>
            Delete recording
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

/**
 * I-5, as the client asked for it on 14 August:
 *
 *   "it needs to tell that at 'this' point the other person was trying to
 *    manipulate, he was maybe faking this thing."
 *
 * So each finding leads with a timestamp and the words that prompted it, and
 * the reading comes last. The quote is not decoration — it is what lets the
 * user check the claim against their own memory of the conversation, and it is
 * how a misattributed line gives itself away.
 *
 * No scores anywhere. That is D-1, answered.
 */
function AnalysisView({
  analysis,
  themName,
}: {
  analysis: IntentAnalysis;
  themName: string;
}) {
  const toneColor = (signal: string) => {
    const tone = signalTone(signal);
    if (tone === 'concern') return COLORS.warning;
    if (tone === 'positive') return COLORS.green;
    return COLORS.textMuted;
  };

  return (
    <>
      {analysis.overall && (
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 9 }}>
            How {themName} came across
          </div>
          <p style={{ fontSize: 13.5, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            {analysis.overall}
          </p>
        </Card>
      )}

      <Card>
        <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
          Moments worth a second look
        </div>

        {analysis.moments.length === 0 ? (
          // A conversation where nothing stood out is a real answer, not an
          // empty state. Saying so beats inventing something to fill the card.
          <p style={{ fontSize: 13, color: COLORS.textMuted, lineHeight: 1.65, marginTop: 8 }}>
            Nothing in this conversation stood out enough to point at. That is
            usually what an ordinary conversation looks like.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {analysis.moments.map((m, i) => {
              const color = toneColor(m.signal);
              return (
                <div
                  key={`${m.at}-${i}`}
                  style={{
                    borderLeft: `3px solid ${color}`,
                    paddingLeft: 13,
                    paddingTop: 2,
                    paddingBottom: 2,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatClock(m.at)}
                    </span>
                    <span
                      style={{
                        background: color + '1A',
                        color,
                        padding: '2px 9px',
                        borderRadius: 7,
                        fontSize: 11,
                        fontWeight: 700,
                        textTransform: 'capitalize',
                      }}
                    >
                      {m.signal}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 13,
                      fontStyle: 'italic',
                      color: COLORS.textSecondary,
                      lineHeight: 1.6,
                      marginBottom: 8,
                    }}
                  >
                    “{m.quote}”
                  </div>

                  {m.observation && (
                    <div style={{ fontSize: 13, color: COLORS.textPrimary, lineHeight: 1.65 }}>
                      {m.observation}
                    </div>
                  )}
                  {m.reading && (
                    <div style={{ fontSize: 12.5, color: COLORS.textMuted, lineHeight: 1.65, marginTop: 4 }}>
                      {m.reading}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/*
          Standing, not dismissible. This is a reading of a real person who was
          not asked whether they wanted to be read, produced from words on a
          page with no tone of voice and no face attached. The user should have
          that in front of them at the same time as the findings, not buried in
          settings where it exists only to have been said.
        */}
        <p
          style={{
            fontSize: 11.5,
            color: COLORS.textMuted,
            lineHeight: 1.65,
            marginTop: 18,
            paddingTop: 14,
            borderTop: `1px solid ${COLORS.cardBorder}`,
          }}
        >
          These are possibilities drawn from the words alone — not conclusions,
          and not evidence of anything. There is no tone of voice here and no
          face to read. You were there and this was not, so where the two of you
          disagree, you are right.
        </p>
      </Card>
    </>
  );
}

function formatClock(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function Spinner({ size = 26 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: `3px solid ${COLORS.cardBorder}`,
        borderTopColor: COLORS.blue,
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
        flexShrink: 0,
      }}
    />
  );
}

function Card({ children, accent }: { children: React.ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${accent ? accent + '44' : COLORS.cardBorder}`,
        borderRadius: 16,
        padding: '18px 18px',
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '9px 0',
        borderBottom: last ? 'none' : `1px solid ${COLORS.cardBorder}`,
      }}
    >
      <span style={{ fontSize: 12.5, color: COLORS.textMuted }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>{children}</span>
    </div>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: 'danger' | 'info' }) {
  const color = tone === 'danger' ? COLORS.danger : COLORS.blue;
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        background: color + '0E',
        border: `1px solid ${color}33`,
        color: tone === 'danger' ? color : COLORS.textSecondary,
        fontSize: 12.5,
        lineHeight: 1.6,
        marginBottom: 14,
      }}
    >
      {children}
    </div>
  );
}

function Button({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '10px 18px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        border: primary ? 'none' : `1px solid ${danger ? COLORS.danger + '55' : COLORS.cardBorder}`,
        background: primary
          ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
          : 'transparent',
        color: primary ? COLORS.white : danger ? COLORS.danger : COLORS.textSecondary,
      }}
    >
      {children}
    </button>
  );
}

export default function IntentResultPage() {
  return (
    <AuthGuard>
      <ResultInner />
    </AuthGuard>
  );
}
