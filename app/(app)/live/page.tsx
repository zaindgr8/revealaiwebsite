'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { AppShell } from '@/components/AppShell';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { Logo } from '@/components/Logo';
import { SessionResults } from '@/components/SessionResults';
import LiveVoiceChat, { type CapturedSpeech, type LiveTranscriptTurn } from '@/components/LiveVoiceChat';
import { VoiceSampleStep, type PreparedSample } from '@/components/VoiceSampleStep';
import { blobToBase64 } from '@/hooks/useAudioRecorder';
import { ELENA_LIVE_PERSONA } from '@/prompts/elena';
import { deductSessionMinutes } from '@/lib/subscription';
import { useAuth } from '@/lib/auth-context';
import { VOICES, resolveVoice } from '@/lib/voices';
import { supabase } from '@/lib/supabase';
import { useCheckins } from '@/lib/session-data';
import {
  analyzeCall,
  buildUserContext,
  createCoachSession,
  endCoachSession,
  flagSessionCrisis,
  InsufficientCallError,
  saveChatMessage,
  updateStreak,
  type AnalysisResult,
  type StreakData,
  type TherapySession,
} from '@/lib/ai';
import { CrisisEscalation } from '@/components/CrisisEscalation';
import type { CrisisResource } from '@/lib/crisis';

/**
 * Live Call — the real-time spoken conversation with Freya.
 *
 * LiveVoiceChat has existed since a76cb8e but nothing rendered it: /therapy
 * imported the component and never used it, so a finished feature shipped
 * dead. This page is the route the nav entry points at.
 *
 * MEMORY RUNS BOTH WAYS HERE
 *
 * In: the system instruction comes from /api/live-context, which assembles the
 * same memory block /chat uses. Freya arrives on a call already knowing this
 * person.
 *
 * Out: when the call ends, the transcript is written to coach_sessions and
 * chat_messages and then summarised, exactly as a chat is. That summary is
 * what /chat reads back later, so a call is remembered by the typed therapist
 * too. There is no second memory mechanism — a call becomes memory by
 * becoming an ordinary session.
 *
 * Minutes are billed off the call timer. Anything else would let the most
 * expensive path run free.
 *
 * RESULTS
 *
 * The recorded Reflect check-in on /therapy is retired; this page replaced it.
 * A session is two steps:
 *
 *  1. A short voice note (VoiceSampleStep). Clean audio, read quickly so
 *     Freya opens the call knowing how the person sounds, and screened before
 *     the call starts. Skippable, at the cost of precision.
 *  2. The call. LiveVoiceChat keeps the user's own speech from its end.
 *
 * When the call ends, /api/analyze-call hears the voice note and the user's
 * voice from the call and reads the captions, and returns the results Reflect
 * did — mood score, Breakdown, Heart-to-Heart Reflection, Recommendations,
 * Today's Action — plus how the call moved them. Saved as a therapy_sessions
 * row so the Dashboard and Healing Journey count it. The voice note's seconds
 * are billed with the call's; the analysis is not billed separately.
 */

/**
 * Appended to Freya's system instruction when a voice note was recorded.
 * Phrased as background for her, not a script: she should sound like someone
 * who listened, not someone reading out a report.
 */
function sampleBriefing(sample: PreparedSample): string {
  const read = sample.read;
  if (!read) {
    return '\n\nBEFORE THIS CALL the user recorded a short voice note about how they are feeling, but it could not be reviewed in time. Do not mention it unless they do.';
  }
  const lines = [
    '\n\nBEFORE THIS CALL the user recorded a short voice note about how they are feeling. Treat it as something they just told you.',
    `What they said: "${read.transcript.slice(0, 1500)}"`,
  ];
  if (read.vocal_summary) lines.push(`How they sounded: ${read.vocal_summary}`);
  if (read.opening_note) lines.push(`Where to start: ${read.opening_note}`);
  lines.push(
    'Open the call by warmly showing you heard it, in one or two sentences, then invite them to say more. Never mention scores, analysis or that their voice was assessed.'
  );
  return lines.join('\n');
}

type PersistedResults = {
  results: AnalysisResult;
  previousSession: TherapySession | null;
  recentSessions: TherapySession[];
  streak: StreakData | null;
};

// Kept so the results survive navigating away — Dashboard's "View Results"
// lands here. Same pattern the Reflect results screen used.
const resultsStorageKey = (userId: string) => `reveal_last_call_results_v1:${userId}`;

function loadResults(userId: string): PersistedResults | null {
  try {
    const raw = localStorage.getItem(resultsStorageKey(userId));
    return raw ? (JSON.parse(raw) as PersistedResults) : null;
  } catch {
    return null;
  }
}

function storeResults(userId: string, data: PersistedResults | null) {
  try {
    if (data) localStorage.setItem(resultsStorageKey(userId), JSON.stringify(data));
    else localStorage.removeItem(resultsStorageKey(userId));
  } catch {
    // Storage full or unavailable. The results are still on screen.
  }
}

function LiveInner() {
  const router = useRouter();
  const { user, profile, subStatus, refreshSubStatus } = useAuth();
  const userId = user!.id;
  const { data: checkins } = useCheckins();

  const [callResults, setCallResults] = useState<PersistedResults | null>(() => loadResults(userId));
  const [analysisState, setAnalysisState] = useState<'idle' | 'analyzing' | 'failed'>('idle');
  const [analysisNote, setAnalysisNote] = useState<string | null>(null);
  // Step 1. 'pending' until the user records a voice note or skips it.
  const [sample, setSample] = useState<PreparedSample | 'pending' | 'skipped'>('pending');
  // Read by handleSessionComplete, which is created before the sample exists.
  const sampleRef = useRef<PreparedSample | null>(null);
  // The voice note being shown on the results screen, so it can be replayed.
  const [resultAudio, setResultAudio] = useState<PreparedSample | null>(null);
  // While true the voice note cannot be redone: swapping it out would unmount
  // the call.
  const [callActive, setCallActive] = useState(false);
  // The last analysis's inputs, kept so a failed analysis can be retried
  // without asking the user to repeat a conversation.
  type AnalysisArgs = [LiveTranscriptTurn[], number, string | null, PreparedSample | null, CapturedSpeech | null];
  const lastAnalysisRef = useRef<AnalysisArgs | null>(null);
  const [canRetryAnalysis, setCanRetryAnalysis] = useState(false);
  // Read at call end. State from the render the call started in would be stale.
  const checkinsRef = useRef<TherapySession[]>([]);
  useEffect(() => {
    checkinsRef.current = checkins ?? [];
  }, [checkins]);
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

  // The system instruction Freya starts the call with. Null while it loads.
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
        // Freya without history is still Freya. LiveVoiceChat falls back to
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
   * reply cannot be withheld, because Freya has already begun speaking by the
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
    setCallActive(true);
    persistedTurnIdsRef.current.clear();
    persistenceQueueRef.current = Promise.resolve();
    setSaveState('saving');
    try {
      const session = await createCoachSession('live');
      liveSessionIdRef.current = session.id;
    } catch (err) {
      setSaveState('failed');
      setCallActive(false);
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

  /**
   * Turns a finished call into its results screen. Runs alongside saving the
   * conversation, not after it: the summary is for memory, the analysis is
   * what the user is waiting to see.
   */
  const analyseCall = useCallback(
    async (
      transcript: LiveTranscriptTurn[],
      durationSeconds: number,
      sessionId: string | null,
      voiceNote: PreparedSample | null,
      userSpeech: CapturedSpeech | null
    ) => {
      // The recent sessions as they were before this call, so the comparison
      // and trend banner compare against the last session rather than this one.
      const recent = checkinsRef.current.slice(0, 14);
      lastAnalysisRef.current = [transcript, durationSeconds, sessionId, voiceNote, userSpeech];
      setAnalysisState('analyzing');
      setAnalysisNote(null);
      setCanRetryAnalysis(false);
      try {
        const callAudio = userSpeech
          ? {
              base64: await blobToBase64(userSpeech.blob),
              mimeType: userSpeech.mimeType,
              durationSeconds: userSpeech.durationSeconds,
            }
          : null;
        const results = await analyzeCall({
          transcript: transcript.map(({ role, content }) => ({ role, content })),
          durationSeconds,
          userContext: buildUserContext(recent),
          coachSessionId: sessionId,
          sample: voiceNote
            ? { ...voiceNote.audio, acousticFeatures: voiceNote.features }
            : null,
          callAudio,
        });

        let streak: StreakData | null = null;
        if (results.saved !== false) {
          try {
            streak = await updateStreak();
          } catch {}
        }

        const next: PersistedResults = {
          results,
          previousSession: recent[0] ?? null,
          recentSessions: recent,
          streak,
        };
        storeResults(userId, next);
        setCallResults(next);
        setResultAudio(voiceNote);
        lastAnalysisRef.current = null;
        setAnalysisState('idle');
      } catch (err) {
        console.error('[live] call analysis failed:', err);
        setAnalysisState('failed');
        setCanRetryAnalysis(!(err instanceof InsufficientCallError));
        setAnalysisNote(
          err instanceof InsufficientCallError
            ? err.message
            : 'We could not put together your results for this call just now. The conversation itself is saved in your Sessions.'
        );
      }
    },
    [userId]
  );

  const handleSessionComplete = useCallback(
    async (
      transcript: LiveTranscriptTurn[],
      durationSeconds: number,
      userSpeech: CapturedSpeech | null
    ) => {
      setCallActive(false);
      setLastCall(durationSeconds);
      setSaveState('saving');
      const sessionId = liveSessionIdRef.current;
      // A voice note belongs to one call. The next call records a fresh one.
      const voiceNote = sampleRef.current;
      sampleRef.current = null;
      setSample('pending');

      // Billing first, and on its own. A call that happened costs minutes even
      // if saving the transcript fails, and a transcript worth keeping must
      // not be dropped because the balance call failed.
      // The voice note is billed here, with the call, so the two round up to
      // whole minutes once rather than twice.
      const billedSeconds = durationSeconds + (voiceNote?.audio.durationSeconds ?? 0);
      if (billedSeconds > 0) {
        try {
          const result = await deductSessionMinutes(billedSeconds);
          if (result.needsTopUp) setShowTopUp(true);
          await refreshSubStatus();
        } catch {
          // The subscription page is the source of truth for the balance.
        }
      }

      // T-7/T-8: no scores and no "today's action" straight after a crisis
      // disclosure. The support view is the only thing on screen.
      if (!crisisRef.current && (voiceNote || transcript.some((t) => t.role === 'user'))) {
        void analyseCall(transcript, durationSeconds, sessionId, voiceNote, userSpeech);
      } else if (voiceNote) {
        URL.revokeObjectURL(voiceNote.blobUrl);
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
    [analyseCall, refreshSubStatus]
  );

  const handleSampleReady = (prepared: PreparedSample) => {
    sampleRef.current = prepared;
    setSample(prepared);
  };

  const handleSampleSkip = () => {
    sampleRef.current = null;
    setSample('skipped');
  };

  const handleRedoSample = () => {
    if (sampleRef.current) URL.revokeObjectURL(sampleRef.current.blobUrl);
    sampleRef.current = null;
    setSample('pending');
  };

  // Screening the voice note uses the same path as a spoken turn in the call.
  const handleSampleScreen = useCallback(
    async (text: string) => (await handleUserTurn(text)) !== false,
    [handleUserTurn]
  );

  const handleNewCall = () => {
    if (resultAudio) URL.revokeObjectURL(resultAudio.blobUrl);
    setResultAudio(null);
    storeResults(userId, null);
    setCallResults(null);
    setAnalysisNote(null);
    setAnalysisState('idle');
  };

  const handleResultsSaved = (saved: AnalysisResult, streak: StreakData | null) => {
    setCallResults((current) => {
      if (!current) return current;
      const next = { ...current, results: saved, streak };
      storeResults(userId, next);
      return next;
    });
  };

  const loading = instruction === null;

  const callBlockedReason = !consentGiven
    ? 'Confirm the recording and memory consent above first.'
    : saveState === 'saving' && lastCall !== null
      ? 'Finishing and saving your previous call...'
      : showTopUp || subStatus?.needsTopUp
        ? 'Add session minutes in Settings before starting another call.'
        : undefined;

  // The voice Freya will speak with on this call, named on screen so the user
  // recognises it before the call rather than during it. resolveVoice already
  // guarantees the id is one of VOICES, so the tone lookup always matches.
  const voiceId = resolveVoice(profile?.therapist_voice);
  const voice = VOICES.find((v) => v.id === voiceId);

  if (!crisis && analysisState === 'analyzing') {
    return (
      <AppShell title="Talk to Freya" subtitle="Putting your call together">
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div className="animate-pulse-soft">
            <Logo size={38} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, marginTop: 32, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
            Freya is reflecting on your call...
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}>
            Reading your mood, energy and stress from what you shared
          </div>
        </div>
      </AppShell>
    );
  }

  if (!crisis && callResults) {
    return (
      <AppShell title="Call Results" subtitle="Your conversation, decoded">
        {showTopUp && (
          <Banner>
            You are low on session minutes. Top up in{' '}
            <strong style={{ color: COLORS.textPrimary }}>Settings</strong> to keep talking
            with Freya.
          </Banner>
        )}
        <SessionResults
          results={callResults.results}
          previousSession={callResults.previousSession}
          recentSessions={callResults.recentSessions}
          streak={callResults.streak}
          heading="Your call is in"
          subheading={
            callResults.results.evidence?.voice_sample === false
              ? 'Estimated mood, energy and stress — based on what you shared with Freya.'
              : 'Estimated mood, energy and stress — based on what you said and how you sounded, before and during your call.'
          }
          newSessionLabel="New call"
          onNewSession={handleNewCall}
          onSaved={handleResultsSaved}
          audio={
            resultAudio?.features
              ? {
                  blobUrl: resultAudio.blobUrl,
                  envelope: resultAudio.features.waveform_envelope,
                  segments: resultAudio.features.segment_emotions,
                  duration: resultAudio.features.duration_seconds || resultAudio.audio.durationSeconds,
                }
              : null
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell title="Talk to Freya" subtitle="A real conversation, out loud, whenever you need it">
      <div style={{ maxWidth: 560, margin: '0 auto', width: '100%' }}>
        {showTopUp && (
          <Banner>
            You are low on session minutes. Top up in{' '}
            <strong style={{ color: COLORS.textPrimary }}>Settings</strong> to keep talking
            with Freya.
          </Banner>
        )}

        {analysisNote && (
          <Banner>
            {analysisNote}
            {canRetryAnalysis && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => {
                    const args = lastAnalysisRef.current;
                    if (args) void analyseCall(...args);
                  }}
                  style={{ background: 'none', border: 'none', padding: 0, color: COLORS.blue, textDecoration: 'underline', fontWeight: 700, cursor: 'pointer', fontSize: 'inherit' }}
                >
                  Try again
                </button>
              </>
            )}
          </Banner>
        )}

        {contextFailed && (
          <Banner>
            Freya couldn&apos;t catch up on your history just now. You can still talk, but she
            won&apos;t remember your past sessions this time.
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
          Start with a short voice note so Freya can hear how you are, then call and just
          talk — she answers out loud and you can jump in whenever you like. When you hang
          up you&apos;ll see your mood, energy and stress, how the call moved them, a
          reflection, and today&apos;s action. Minutes come off your plan while you talk.
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
              Voice: <strong style={{ color: COLORS.textSecondary }}>{voice?.name ?? 'Freya'}</strong>
              {voice ? ` — ${voice.tone.toLowerCase()}` : ''}
            </span>
            <Link
              href="/settings#therapist-voice"
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
              I agree that my voice note and my voice during this call will be securely sent
              to our voice provider (Google) to hold the conversation and to analyse my mood,
              energy and stress; that captions and results will be saved in my Sessions so
              Freya can remember them; and that voice note and call time will be deducted
              from my plan. Audio is not stored.
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
            Freya is catching up on how you&apos;ve been...
          </div>
        ) : sample === 'pending' ? (
          <VoiceSampleStep
            disabledReason={callBlockedReason}
            onScreen={handleSampleScreen}
            onReady={handleSampleReady}
            onSkip={handleSampleSkip}
          />
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
                padding: '10px 14px',
                marginBottom: 14,
                borderRadius: 14,
                border: `1px solid ${COLORS.cardBorder}`,
                background: COLORS.card,
                fontSize: 12.5,
                color: COLORS.textSecondary,
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                <Icon
                  name={sample === 'skipped' ? 'mic' : 'checkmark'}
                  size={14}
                  color={sample === 'skipped' ? COLORS.textMuted : COLORS.success}
                />
                {sample === 'skipped'
                  ? 'No voice note — results will be read from the call only.'
                  : `Voice note ready (${sample.audio.durationSeconds}s). Freya has heard it.`}
              </span>
              {!callActive && <button
                type="button"
                onClick={handleRedoSample}
                style={{ background: 'none', border: 'none', color: COLORS.blue, textDecoration: 'underline', fontSize: 12.5, cursor: 'pointer' }}
              >
                {sample === 'skipped' ? 'Record one' : 'Re-record'}
              </button>}
            </div>
            <LiveVoiceChat
              onSessionComplete={handleSessionComplete}
              onSessionStart={handleSessionStart}
              onTranscriptTurn={handleTranscriptTurn}
              voiceName={voiceId}
              systemInstructionText={
                sample === 'skipped'
                  ? instruction || undefined
                  : (instruction || ELENA_LIVE_PERSONA) + sampleBriefing(sample)
              }
              onUserTurn={handleUserTurn}
              disabledReason={callBlockedReason}
            />
          </>
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
              ? "Freya remembers your recent sessions and how you've been feeling. She'll remember this conversation too."
              : "This is your first conversation with Freya. She'll remember it next time you talk."}
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
            Your last conversation: {Math.floor(lastCall / 60)}m {lastCall % 60}s
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
    <>
      <LiveInner />
    </>
  );
}
