'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { AuthGuard } from '@/components/AuthGuard';
import { AppShell } from '@/components/AppShell';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import LiveVoiceChat, { type LiveTranscriptTurn } from '@/components/LiveVoiceChat';
import { deductSessionMinutes } from '@/lib/subscription';
import { useAuth } from '@/lib/auth-context';
import { VOICES, resolveVoice } from '@/lib/voices';
import { supabase } from '@/lib/supabase';
import {
  createCoachSession,
  endCoachSession,
  flagSessionCrisis,
  saveChatMessage,
} from '@/lib/ai';
import { CrisisEscalation } from '@/components/CrisisEscalation';
import type { CrisisResource } from '@/lib/crisis';

/**
 * Live Call — the real-time spoken conversation with Elena.
 *
 * LiveVoiceChat has existed since a76cb8e but nothing rendered it: /therapy
 * imported the component and never used it, so a finished feature shipped
 * dead. This page is the route the nav entry points at.
 *
 * MEMORY RUNS BOTH WAYS HERE
 *
 * In: the system instruction comes from /api/live-context, which assembles the
 * same memory block /chat uses. Elena arrives on a call already knowing this
 * person.
 *
 * Out: when the call ends, the transcript is written to coach_sessions and
 * chat_messages and then summarised, exactly as a chat is. That summary is
 * what /chat reads back later, so a call is remembered by the typed therapist
 * too. There is no second memory mechanism — a call becomes memory by
 * becoming an ordinary session.
 *
 * Minutes are billed off the call timer, the same way /therapy bills a Reflect
 * recording. Anything else would let the most expensive path run free.
 */
function LiveInner() {
  const router = useRouter();
  const { profile, subStatus, refreshSubStatus } = useAuth();
  const [showTopUp, setShowTopUp] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);
  const [lastCall, setLastCall] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  // Set when screening escalates. Non-null means the call is over: the support
  // view replaces the call card and there is no way back into it without
  // leaving the page.
  const [crisis, setCrisis] = useState<{ resources: CrisisResource[] } | null>(null);
  // Read by handleSessionComplete, which runs after this is set and needs to
  // mark the saved session. State would not have committed in time.
  const crisisRef = useRef(false);
  const liveSessionIdRef = useRef<string | null>(null);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const persistedTurnIdsRef = useRef(new Set<string>());

  // The system instruction Elena starts the call with. Null while it loads.
  const [instruction, setInstruction] = useState<string | null>(null);
  const [hasMemory, setHasMemory] = useState(false);
  const [contextFailed, setContextFailed] = useState(false);

  // Loaded before the call, not during it. LiveVoiceChat reads the instruction
  // at the moment the socket opens, so fetching it on click would race the
  // handshake and start some calls with no memory and no way to tell.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? '';
        const res = await fetch('/api/live-context', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('context unavailable');
        const json = await res.json();
        if (cancelled) return;
        setInstruction(json.systemInstruction as string);
        setHasMemory(Boolean(json.hasMemory));
        setContextFailed(Boolean(json.contextPartial));
      } catch {
        if (cancelled) return;
        // Elena without history is still Elena. LiveVoiceChat falls back to
        // ELENA_LIVE_PERSONA when the instruction is undefined, so the call
        // goes ahead — the user is told what was lost rather than blocked.
        setContextFailed(true);
        setInstruction('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * T-8 on the live call. Runs on every spoken user turn.
   *
   * Returning false tells LiveVoiceChat to stop the audio and close the
   * socket, which is the strongest thing available here — unlike /chat, the
   * reply cannot be withheld, because Elena has already begun speaking by the
   * time the turn is transcribed.
   *
   * A failed screening returns true. Losing the model classifier must not end
   * a call, and lib/crisis.ts still applies its deterministic check
   * server-side before the model is consulted at all.
   */
  const handleUserTurn = useCallback(async (text: string) => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      const res = await fetch('/api/live-screen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return true;
      const json = await res.json();
      if (json.level === 'crisis') {
        crisisRef.current = true;
        setCrisis({ resources: (json.resources ?? []) as CrisisResource[] });
        return false;
      }
      return true;
    } catch (err) {
      console.error('[live] screening failed:', err);
      return true;
    }
  }, []);

  const handleSessionStart = useCallback(async () => {
    crisisRef.current = false;
    persistedTurnIdsRef.current.clear();
    persistenceQueueRef.current = Promise.resolve();
    setSaveState('saving');
    try {
      const session = await createCoachSession('live');
      liveSessionIdRef.current = session.id;
    } catch (err) {
      setSaveState('failed');
      throw err;
    }
  }, []);

  const handleTranscriptTurn = useCallback((turn: LiveTranscriptTurn) => {
    const sessionId = liveSessionIdRef.current;
    if (!sessionId || persistedTurnIdsRef.current.has(turn.id)) return Promise.resolve();

    const save = persistenceQueueRef.current.then(async () => {
      if (persistedTurnIdsRef.current.has(turn.id)) return;
      await saveChatMessage({
        sessionId,
        role: turn.role,
        content: turn.content,
      });
      persistedTurnIdsRef.current.add(turn.id);
    });

    // Keep the queue usable after one transient failure. Final reconciliation
    // retries every turn whose id was not marked as persisted.
    persistenceQueueRef.current = save.catch((err) => {
      console.error('[live] progressive transcript save failed:', err);
    });
    return save;
  }, []);

  const handleSessionComplete = useCallback(
    async (transcript: LiveTranscriptTurn[], durationSeconds: number) => {
      setLastCall(durationSeconds);
      setSaveState('saving');
      const sessionId = liveSessionIdRef.current;

      // Billing first, and on its own. A call that happened costs minutes even
      // if saving the transcript fails, and a transcript worth keeping must
      // not be dropped because the balance call failed.
      if (durationSeconds > 0) {
        try {
          const result = await deductSessionMinutes(durationSeconds);
          if (result.needsTopUp) setShowTopUp(true);
          await refreshSubStatus();
        } catch {
          // The subscription page is the source of truth for the balance.
        }
      }

      if (!sessionId) {
        setSaveState('failed');
        return;
      }

      try {
        await persistenceQueueRef.current;

        // Reconcile captions that arrived immediately before a close or whose
        // progressive insert failed. The stable component turn id prevents a
        // normal end from duplicating already-written messages.
        for (const turn of transcript) {
          if (!turn.content.trim() || persistedTurnIdsRef.current.has(turn.id)) continue;
          await saveChatMessage({
            sessionId,
            role: turn.role,
            content: turn.content.trim(),
          });
          persistedTurnIdsRef.current.add(turn.id);
        }
        // The T-8 audit trail, written before the summary so it survives a
        // slow or failed summarise. Session level rather than message level,
        // matching /chat: chat_messages has no UPDATE policy by design.
        if (crisisRef.current) {
          await flagSessionCrisis(sessionId).catch((err) =>
            console.error('[live] could not flag the session:', err)
          );
        }

        // Writes the summary, mood and topics, and sets ended_at. Until this
        // runs the session is invisible to memory: both readers require
        // ended_at.
        await endCoachSession(sessionId);
        setSaveState('saved');
      } catch (err) {
        console.error('[live] could not save the call:', err);
        setSaveState('failed');
      } finally {
        if (liveSessionIdRef.current === sessionId) {
          liveSessionIdRef.current = null;
        }
      }
    },
    [refreshSubStatus]
  );

  const loading = instruction === null;

  // The voice Elena will speak with on this call, named on screen so the user
  // recognises it before the call rather than during it. resolveVoice already
  // guarantees the id is one of VOICES, so the tone lookup always matches.
  const voiceId = resolveVoice(profile?.therapist_voice);
  const voiceTone = VOICES.find((v) => v.id === voiceId)?.tone;

  return (
    <AppShell title="Live Call" subtitle="Talk with Elena in real time">
      <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
        {showTopUp && (
          <Banner>
            You are low on session minutes. Top up in{' '}
            <strong style={{ color: COLORS.textPrimary }}>Settings</strong> to keep making
            live calls.
          </Banner>
        )}

        {contextFailed && (
          <Banner>
            Elena could not load your history just now. The call will still work, but she
            will not remember your past sessions this time.
          </Banner>
        )}

        <div
          style={{
            fontSize: 13,
            color: COLORS.textSecondary,
            lineHeight: 1.6,
            marginBottom: 18,
            textAlign: 'center',
          }}
        >
          Press start, allow the microphone, then just talk. Elena answers out loud and
          you can cut in at any time. Minutes come off your plan while the call runs.
        </div>

        {/*
          The voice, named and changeable from here.

          The paragraph above used to end with "You can change how she sounds in
          Settings", which is a direction, not a control: it named neither the
          current voice nor a way to reach the setting. A user who dislikes the
          voice finds that out on this page, so the way out belongs on this page
          too. The link carries a fragment so Settings opens on that card.

          Shown while a call runs as well. A change saved mid-call applies to the
          next one, which is what the Settings card says, so the line stays
          honest either way.
        */}
        {!crisis && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 8,
              marginBottom: 16,
              fontSize: 12.5,
              color: COLORS.textMuted,
            }}
          >
            <Icon name="mic" size={14} color={COLORS.textMuted} />
            <span>
              Elena&apos;s voice: <strong style={{ color: COLORS.textSecondary }}>{voiceId}</strong>
              {voiceTone ? ` — ${voiceTone.toLowerCase()}` : ''}
            </span>
            <Link
              href="/settings#elena-voice"
              style={{ color: COLORS.blue, textDecoration: 'underline' }}
            >
              Change
            </Link>
          </div>
        )}

        {!crisis && !loading && (
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              marginBottom: 16,
              border: `1px solid ${consentGiven ? COLORS.blue : COLORS.cardBorder}`,
              borderRadius: 14,
              background: consentGiven ? 'rgba(37, 99, 235, 0.08)' : COLORS.card,
              cursor: 'pointer',
              fontSize: 12.5,
              lineHeight: 1.55,
              color: COLORS.textSecondary,
            }}
          >
            <input
              type="checkbox"
              checked={consentGiven}
              onChange={(event) => setConsentGiven(event.target.checked)}
              style={{ marginTop: 3 }}
            />
            <span>
              I agree that my microphone audio will be sent to Gemini for this live call,
              that captions will be saved in my Sessions so Elena can remember them, and
              that call time will be deducted from my plan.
            </span>
          </label>
        )}

        {crisis ? (
          // No onAcknowledge work to do: LiveVoiceChat already closed the
          // socket and released the microphone, and handleSessionComplete
          // already saved and flagged the call. Acknowledging returns the user
          // to the dashboard rather than to a call they must not resume.
          <CrisisEscalation
            resources={crisis.resources}
            onAcknowledge={() => router.push('/home')}
          />
        ) : loading ? (
          <div
            style={{
              textAlign: 'center',
              fontSize: 13,
              color: COLORS.textMuted,
              padding: '40px 0',
            }}
          >
            Bringing Elena up to date...
          </div>
        ) : (
          <LiveVoiceChat
            onSessionComplete={handleSessionComplete}
            onSessionStart={handleSessionStart}
            onTranscriptTurn={handleTranscriptTurn}
            voiceName={voiceId}
            systemInstructionText={instruction || undefined}
            onUserTurn={handleUserTurn}
            disabledReason={
              !consentGiven
                ? 'Confirm the recording and memory consent above first.'
                : saveState === 'saving' && lastCall !== null
                  ? 'Finishing and saving your previous call...'
                : showTopUp || subStatus?.needsTopUp
                  ? 'Add session minutes in Settings before starting another call.'
                  : undefined
            }
          />
        )}

        {!crisis && !loading && !contextFailed && (
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: COLORS.textMuted,
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            {hasMemory
              ? 'Elena remembers your recent sessions and mood. This call is saved, so she will remember it too.'
              : 'This is your first session with Elena. She will remember this call next time.'}
          </div>
        )}

        {!crisis && lastCall !== null && lastCall > 0 && (
          <div
            style={{
              marginTop: 12,
              fontSize: 12,
              color: saveState === 'failed' ? COLORS.danger : COLORS.textMuted,
              textAlign: 'center',
            }}
          >
            Last call: {Math.floor(lastCall / 60)}m {lastCall % 60}s
            {saveState === 'saving' && ' — saving...'}
            {saveState === 'saved' && ' — saved to your sessions'}
            {saveState === 'failed' && ' — the call could not be saved'}
          </div>
        )}

        <MedicalDisclaimer variant="inline" />
      </div>
    </AppShell>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        background: 'rgba(217, 119, 6, 0.08)',
        border: `1px solid ${COLORS.warning}`,
        borderRadius: 14,
        padding: '12px 14px',
        marginBottom: 18,
      }}
    >
      <Icon name="warning" size={16} color={COLORS.warning} />
      <div style={{ fontSize: 12.5, color: COLORS.textSecondary, lineHeight: 1.55 }}>
        {children}
      </div>
    </div>
  );
}

export default function LivePage() {
  return (
    <AuthGuard>
      <LiveInner />
    </AuthGuard>
  );
}
