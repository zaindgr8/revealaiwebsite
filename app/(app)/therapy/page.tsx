'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/theme';
import { Card } from '@/components/Card';
import { SecondaryButton } from '@/components/GradientButton';
import { MetricBar } from '@/components/MetricBar';
import { CircularProgress } from '@/components/CircularProgress';
import { WaveformVisualizer } from '@/components/WaveformVisualizer';
import { WaveformPlayer } from '@/components/WaveformPlayer';
import { TranscriptPlayer } from '@/components/TranscriptPlayer';
import { MoodSparklineInline } from '@/components/MoodSparklineInline';
import { StreakBadge } from '@/components/StreakBadge';
import { MoodCardExport } from '@/components/MoodCardExport';
import { Logo } from '@/components/Logo';
import { Icon } from '@/components/Icon';
import { AppShell } from '@/components/AppShell';
import { Grid } from '@/components/Grid';
import { MedicalDisclaimer } from '@/components/MedicalDisclaimer';
import { useAudioRecorder, type RecordingResult } from '@/hooks/useAudioRecorder';
import { extractAcousticFeatures, type AcousticFeatures, type SegmentEmotion } from '@/lib/audioFeatures';
import {
  analyzeMood,
  askDeepQuestion,
  buildUserContext,
  chatTherapy,
  createCoachSession,
  endCoachSession,
  flagSessionCrisis,
  getRecentTherapySessions,
  retrySaveAnalysis,
  saveChatMessage,
  updateStreak,
  type AnalysisResult,
  type TherapySession,
  type StreakData,
  type UserContext,
} from '@/lib/ai';
import { speakElena, stopElena } from '@/lib/elenaVoice';
import { deductSessionMinutes } from '@/lib/subscription';

const PACE_LABEL: Record<string, string> = { Slow: 'Slow', Normal: 'Normal', Fast: 'Fast' };

type Phase = 'record' | 'getting_question' | 'deep_conversation' | 'analyzing' | 'results';
type ReflectMode = 'quick' | 'deep';

type ConversationMessage = {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
};

function labelForMood(score: number) {
  if (score >= 80) return 'Great';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Okay';
  if (score >= 35) return 'Slightly Low';
  return 'Low';
}

function colorForWellbeingScore(score: number) {
  if (score >= 70) return COLORS.success;
  if (score >= 45) return COLORS.warning;
  return COLORS.danger;
}

const SESSION_STORAGE_KEY = 'reveal_last_session';

type PersistedSession = {
  results: AnalysisResult;
  waveEnvelope: number[];
  segmentEmotions: SegmentEmotion[];
  audioDuration: number;
  streak: StreakData | null;
};

function saveSession(data: PersistedSession) {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or unavailable — fail silently
  }
}

function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedSession) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function TherapyInner() {
  const router = useRouter();

  // Restore last session from localStorage on first render
  const savedSession = useRef<PersistedSession | null>(null);
  if (savedSession.current === null) {
    savedSession.current = loadSession();
  }
  const saved = savedSession.current;

  const [phase, setPhase] = useState<Phase>(saved ? 'results' : 'record');
  const [results, setResults] = useState<AnalysisResult | null>(saved?.results ?? null);
  const [analyzeErr, setAnalyzeErr] = useState<string | null>(null);
  const [isRetryingSave, setIsRetryingSave] = useState(false);
  const [saveRetryError, setSaveRetryError] = useState<string | null>(null);
  const [previousSession, setPreviousSession] = useState<TherapySession | null>(null);
  const recentSessionsRef = useRef<TherapySession[]>([]);
  // Phase 2: audio playback state (blob URL cannot be restored after navigation)
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [waveEnvelope, setWaveEnvelope] = useState<number[]>(saved?.waveEnvelope ?? []);
  const [segmentEmotions, setSegmentEmotions] = useState<SegmentEmotion[]>(saved?.segmentEmotions ?? []);
  const [audioDuration, setAudioDuration] = useState(saved?.audioDuration ?? 0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  // Phase 3: streak + trend
  const [streak, setStreak] = useState<StreakData | null>(saved?.streak ?? null);
  // Phase 4: Shareable Card
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  // Subscription: top-up modal
  const [showTopUpBanner, setShowTopUpBanner] = useState(false);
  // Mode Toggle state ('quick' or 'deep')
  const [reflectMode, setReflectMode] = useState<ReflectMode>('quick');
  const [interactionMode, setInteractionMode] = useState<'live' | 'chat'>('chat');
  // Deep Understanding conversation state
  const [deepQuestion, setDeepQuestion] = useState<string | null>(null);
  const [savedAudio, setSavedAudio] = useState<RecordingResult | null>(null);
  const [savedAcoustic, setSavedAcoustic] = useState<AcousticFeatures | undefined>(undefined);
  const [isSubmittingDeep, setIsSubmittingDeep] = useState(false);

  // Multi-turn conversation state
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  // T-1: the check-in conversation is persisted too, not just the /chat one.
  // Stored with source 'checkin' so it stays out of Profile History — its
  // content already lands on the therapy_sessions row it feeds.
  const coachSessionIdRef = useRef<string | null>(null);
  const [chatInputText, setChatInputText] = useState('');
  const [isTherapistThinking, setIsTherapistThinking] = useState(false);
  const [isSpeakingId, setIsSpeakingId] = useState<string | null>(null);
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-scroll chat to latest message
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages, isTherapistThinking]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      stopElena();
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  const playMessageVoice = (id: string, text: string) => {
    if (isSpeakingId === id) {
      stopElena();
      setIsSpeakingId(null);
    } else {
      setIsSpeakingId(id);
      speakElena(text, () => setIsSpeakingId(null));
    }
  };

  const handleSendUserMessage = async (overrideText?: string) => {
    const textToSend = (overrideText ?? chatInputText).trim();
    if (!textToSend || isTherapistThinking) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg: ConversationMessage = {
      id: userMsgId,
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...conversationMessages, userMsg];
    setConversationMessages(updatedMessages);
    setChatInputText('');
    setIsTherapistThinking(true);
    stopElena();
    setIsSpeakingId(null);

    const sessionId = coachSessionIdRef.current;
    if (sessionId) {
      void saveChatMessage({ sessionId, role: 'user', content: textToSend }).catch((err) =>
        console.error('[therapy] could not persist user message:', err)
      );
    }

    try {
      const apiMessages = updatedMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const assistantCount = conversationMessages.filter((m) => m.role === 'assistant').length;
      const isFinalTurn = assistantCount >= 2; // Next assistant response will be 3rd (final)

      const result = await chatTherapy({
        messages: apiMessages,
        isFinalTurn,
      });

      const assistantMsgId = `assistant-${Date.now()}`;
      const assistantMsg: ConversationMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: result.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (sessionId) {
        void saveChatMessage({
          sessionId,
          role: 'assistant',
          content: result.reply,
          crisisFlagged: result.crisis === true,
        }).catch((err) =>
          console.error('[therapy] could not persist assistant message:', err)
        );
        if (result.crisis) void flagSessionCrisis(sessionId).catch(() => {});
      }

      setConversationMessages((prev) => {
        const nextMsgs = [...prev, assistantMsg];
        // T-7/T-8: on escalation the conversation stops here. Do not roll into
        // the auto-generated results screen — scoring someone's mood and
        // handing them "today's action" immediately after a crisis disclosure
        // is exactly the wrong response.
        if (isFinalTurn && !result.crisis) {
          // System automatically ends chat and generates full results after 1.8s
          setTimeout(() => {
            handleFinishDeepConversation(nextMsgs);
          }, 1800);
        }
        return nextMsgs;
      });
      setIsSpeakingId(null);
    } catch (err) {
      console.warn('[therapy] Therapist reply error:', err);
    } finally {
      setIsTherapistThinking(false);
    }
  };

  const toggleVoiceDictation = () => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Voice dictation is not supported by your browser. Please type your response below.');
      return;
    }

    if (isListeningVoice) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsListeningVoice(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListeningVoice(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setChatInputText(transcript);
      };

      recognition.onerror = () => {
        setIsListeningVoice(false);
      };

      recognition.onend = () => {
        setIsListeningVoice(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Speech recognition start failed:', e);
      setIsListeningVoice(false);
    }
  };

  const handleFinishDeepConversation = async (explicitMessages?: ConversationMessage[]) => {
    if (!savedAudio || isSubmittingDeep) return;
    setIsSubmittingDeep(true);
    stopElena();
    setIsSpeakingId(null);

    const msgsToUse = explicitMessages || conversationMessages;

    // Close the persisted conversation. Marked ended so the abandoned-session
    // sweep does not later pick it up, and so message_count settles.
    const sessionId = coachSessionIdRef.current;
    if (sessionId) {
      coachSessionIdRef.current = null;
      void endCoachSession(sessionId).catch((err) =>
        console.error('[therapy] could not close conversation:', err)
      );
    }

    const questions = msgsToUse
      .filter((m) => m.role === 'assistant')
      .map((m) => m.content)
      .join(' | ');

    const userAnswers = msgsToUse
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join(' | ');

    try {
      await runFullAnalysis(
        savedAudio,
        savedAcoustic,
        undefined,
        questions || deepQuestion || undefined,
        userAnswers || 'User completed deep conversational session'
      );
    } catch (e) {
      setAnalyzeErr((e as Error).message || 'Analysis failed.');
      setPhase('record');
    } finally {
      setIsSubmittingDeep(false);
    }
  };

  // Pre-load recent history once so we can pass context to analyze + show comparison.
  useEffect(() => {
    getRecentTherapySessions(14)
      .then((s) => {
        recentSessionsRef.current = s;
        setPreviousSession(s[0] ?? null);
      })
      .catch(() => {
        recentSessionsRef.current = [];
      });
  }, []);

  const runFullAnalysis = useCallback(
    async (
      audio: RecordingResult,
      acousticFeatures?: AcousticFeatures,
      userContext?: UserContext,
      q?: string,
      ans?: string
    ) => {
      setPhase('analyzing');
      const uCtx = userContext ?? buildUserContext(recentSessionsRef.current);

      const data = await analyzeMood({
        audioBase64: audio.base64,
        mimeType: audio.mimeType,
        durationSeconds: audio.durationSeconds,
        userContext: uCtx,
        acousticFeatures,
        deepQuestion: q,
        deepAnswer: ans,
      });
      setResults(data);
      setPhase('results');

      let updatedStreak: StreakData | null = null;
      if (data.saved !== false) {
        try {
          updatedStreak = await updateStreak();
          setStreak(updatedStreak);
        } catch {}
      }

      saveSession({
        results: data,
        waveEnvelope: acousticFeatures?.waveform_envelope ?? [],
        segmentEmotions: acousticFeatures?.segment_emotions ?? [],
        audioDuration: acousticFeatures?.duration_seconds ?? audio.durationSeconds,
        streak: updatedStreak,
      });

      try {
        const deductResult = await deductSessionMinutes(audio.durationSeconds || 60);
        if (deductResult.needsTopUp) {
          setShowTopUpBanner(true);
        }
      } catch {}
    },
    []
  );

  const processAudio = useCallback(
    async (audio: RecordingResult | null) => {
      if (!audio) return;

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      try {
        const userContext = buildUserContext(recentSessionsRef.current);

        let acousticFeatures: AcousticFeatures | undefined;
        try {
          acousticFeatures = await extractAcousticFeatures(audio.blob);
          if (acousticFeatures) {
            setWaveEnvelope(acousticFeatures.waveform_envelope);
            setSegmentEmotions(acousticFeatures.segment_emotions);
            setAudioDuration(acousticFeatures.duration_seconds || audio.durationSeconds);
          }
        } catch (aErr) {
          console.warn('[therapy] Acoustic extraction failed:', aErr);
        }

        const url = URL.createObjectURL(audio.blob);
        blobUrlRef.current = url;
        setBlobUrl(url);

        // Deep Understanding Mode: Therapist asks initial deep question and enters multi-turn conversation
        if (reflectMode === 'deep') {
          setSavedAudio(audio);
          setSavedAcoustic(acousticFeatures);
          setPhase('getting_question');

          try {
            const question = await askDeepQuestion({
              audioBase64: audio.base64,
              mimeType: audio.mimeType,
              userContext,
            });

            const initialMsg: ConversationMessage = {
              id: 'msg-init-1',
              role: 'assistant',
              content: question,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            setDeepQuestion(question);
            setConversationMessages([initialMsg]);
            setPhase('deep_conversation');
            setIsSpeakingId(null);

            // Persistence must never block the user from answering, so this
            // runs alongside rather than in front of the conversation.
            void (async () => {
              try {
                const session = await createCoachSession('checkin');
                coachSessionIdRef.current = session.id;
                await saveChatMessage({
                  sessionId: session.id,
                  role: 'assistant',
                  content: question,
                });
              } catch (err) {
                console.error('[therapy] could not persist conversation:', err);
              }
            })();
          } catch (qErr) {
            console.warn('[therapy] Deep question failed, continuing to direct analysis:', qErr);
            await runFullAnalysis(audio, acousticFeatures, userContext);
          }
          return;
        }

        await runFullAnalysis(audio, acousticFeatures, userContext);
      } catch (e) {
        setAnalyzeErr((e as Error).message || 'Analysis failed.');
        setPhase('record');
      }
    },
    [reflectMode, runFullAnalysis]
  );

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const { isRecording, seconds, start, stop, cancel, error, stream } = useAudioRecorder({
    maxSeconds: 60,
    onComplete: processAudio,
  });

  useEffect(() => {
    if (error) alert(error);
  }, [error]);

  const handleStart = async () => {
    setAnalyzeErr(null);
    await start();
  };

  const handleStop = async () => {
    if (seconds < 3) {
      await cancel();
      alert('Please record at least 3 seconds.');
      return;
    }
    const audio = await stop();
    if (!audio) return;
    await processAudio(audio);
  };

  // Reset to record — revoke blob and clear persisted session
  const handleNewRecording = () => {
    stopElena();
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlobUrl(null);
    setWaveEnvelope([]);
    setSegmentEmotions([]);
    setResults(null);
    setSaveRetryError(null);
    setDeepQuestion(null);
    setConversationMessages([]);
    setSavedAudio(null);
    setSavedAcoustic(undefined);
    clearSession();
    setPhase('record');
  };

  const handleRetrySave = async () => {
    if (!results || isRetryingSave) return;
    setIsRetryingSave(true);
    setSaveRetryError(null);
    try {
      await retrySaveAnalysis(results);
      const savedResult: AnalysisResult = { ...results, saved: true, save_error: undefined };
      setResults(savedResult);

      let updatedStreak = streak;
      try {
        updatedStreak = await updateStreak();
        setStreak(updatedStreak);
      } catch {}

      saveSession({
        results: savedResult,
        waveEnvelope,
        segmentEmotions,
        audioDuration,
        streak: updatedStreak,
      });
    } catch (error) {
      setSaveRetryError((error as Error).message || 'Could not save this result.');
    } finally {
      setIsRetryingSave(false);
    }
  };

  if (phase === 'results' && results) {
    const moodLabel = labelForMood(results.mood_score);
    const resultRecommendations = (results.recommendations ?? results.tips ?? []).filter(Boolean);
    return (
      <AppShell title="Analysis Results" subtitle="Your voice, decoded">
        {results.saved === false && (
          <div
            role="alert"
            style={{
              background: 'rgba(217,119,6,0.08)',
              border: '1px solid rgba(217,119,6,0.35)',
              borderRadius: 16,
              padding: '14px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ color: COLORS.warning, fontSize: 14, fontWeight: 800 }}>
                This result is not in your history yet
              </div>
              <div style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>
                Your analysis is safe on this screen, but Dashboard, Journey, and History will not
                include it until saving succeeds.
              </div>
              {saveRetryError && (
                <div style={{ color: COLORS.danger, fontSize: 11, marginTop: 5 }}>
                  {saveRetryError}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleRetrySave}
              disabled={isRetryingSave}
              style={{
                borderRadius: 10,
                padding: '9px 14px',
                background: COLORS.warning,
                color: COLORS.white,
                fontSize: 12,
                fontWeight: 800,
                opacity: isRetryingSave ? 0.65 : 1,
                cursor: isRetryingSave ? 'wait' : 'pointer',
              }}
            >
              {isRetryingSave ? 'Saving…' : 'Retry saving'}
            </button>
          </div>
        )}
        {/* -- Top-Up Banner — shown when minutes run out -- */}
        {showTopUpBanner && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(14,165,233,0.06))',
              border: '1.5px solid rgba(37,99,235,0.18)',
              borderRadius: 16,
              padding: '16px 18px',
              marginBottom: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 24 }}>🔋</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary }}>
                  You&apos;ve used all 150 minutes
                </div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                  Top up with 150 more minutes for just $12 to keep going.
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push('/payment')}
              style={{
                background: `linear-gradient(135deg, #2563EB, #0EA5E9)`,
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '9px 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}
            >
              Top Up — $12
            </button>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.6px' }}>
              Your check-in is in
            </div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
              Mood score, energy, stress and insight — all from your voice.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {streak && streak.current_streak > 0 && (
              <StreakBadge currentStreak={streak.current_streak} longestStreak={streak.longest_streak} size="sm" />
            )}
            <button
              onClick={handleNewRecording}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                border: `1px solid ${COLORS.cardBorder}`,
                color: COLORS.textPrimary,
                fontSize: 13,
                fontWeight: 700,
                background: COLORS.card,
                cursor: 'pointer',
              }}
            >
              New recording
            </button>
          </div>
        </div>

        {/* -- Trend Delta Banner -- */}
        {(() => {
          const currentMood = results.mood_score;
          const previousMood = previousSession?.mood_score;
          if (previousMood === undefined || isNaN(previousMood)) return null;

          const moodDelta = currentMood - previousMood;
          const trendFlat = moodDelta === 0;
          const trendUp = moodDelta >= 0;
          const moodDeltaColor = trendFlat ? COLORS.textMuted : trendUp ? COLORS.success : COLORS.danger;
          const moodDeltaArrow = trendFlat ? '–' : trendUp ? '▲' : '▼';
          const moodDeltaText = moodDelta !== 0
            ? `Your mood is ${trendUp ? 'up' : 'down'} ${Math.abs(moodDelta)} points from your last check-in`
            : `Your mood is unchanged from your last check-in`;

          return (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: trendFlat
                  ? 'rgba(138,138,154,0.06)'
                  : trendUp
                    ? 'rgba(22,163,74,0.06)'
                    : 'rgba(239,68,68,0.06)',
                border: `1px solid ${
                  trendFlat
                    ? 'rgba(138,138,154,0.2)'
                    : trendUp
                      ? 'rgba(22,163,74,0.2)'
                      : 'rgba(239,68,68,0.2)'
                }`,
                borderRadius: 14,
                padding: '11px 15px',
                marginBottom: 16,
              }}
            >
              <span style={{ color: moodDeltaColor, fontWeight: 900, fontSize: 12 }}>
                {moodDeltaArrow}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: COLORS.textSecondary }}>
                {moodDeltaText}
              </span>
            </div>
          );
        })()}

        {/* -- Emotion-colored waveform player -------------------------- */}
        {blobUrl && waveEnvelope.length > 0 && (
          <WaveformPlayer
            blobUrl={blobUrl}
            envelope={waveEnvelope}
            segments={segmentEmotions}
            duration={audioDuration}
            audioRef={audioRef}
          />
        )}

        {/* -- Reveal Voice AI card (transcript + vocal summary) ------------ */}
        {(results.transcript || results.vocal_summary || results.emotional_mirror) && (
          <div
            style={{
              background: `linear-gradient(135deg, rgba(37, 99, 235, 0.06), rgba(14, 165, 233, 0.06))`,
              border: `1px solid ${COLORS.cardBorder}`,
              borderRadius: 18,
              padding: 20,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Icon name="mic" size={16} color={COLORS.blue} />
              <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Reveal Voice AI
              </span>
            </div>

            {/* Synced transcript player */}
            {results.transcript && blobUrl ? (
              <div style={{ marginBottom: (results.vocal_summary || results.emotional_mirror) ? 16 : 0 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  What we heard you say
                </div>
                <TranscriptPlayer
                  transcript={results.transcript}
                  durationSeconds={audioDuration || results.duration_seconds || 30}
                  pauseCount={results.vocal_metrics?.pause_count ?? 2}
                  audioRef={audioRef}
                />
              </div>
            ) : results.transcript ? (
              <div style={{ marginBottom: (results.vocal_summary || results.emotional_mirror) ? 14 : 0 }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  What we heard you say
                </div>
                <div style={{ fontSize: 14, color: COLORS.textPrimary, lineHeight: 1.6, fontStyle: 'italic' }}>
                  &ldquo;{results.transcript}&rdquo;
                </div>
              </div>
            ) : null}

            {(results.vocal_summary || results.emotional_mirror) && (
              <div style={{ paddingTop: results.transcript ? 14 : 0, borderTop: results.transcript ? `1px solid ${COLORS.cardBorder}` : 'none' }}>
                <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  How your voice felt
                </div>
                <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                  {results.vocal_summary || results.emotional_mirror}
                </div>
              </div>
            )}
          </div>
        )}

        <Grid cols={2} gap={14}>
          <Card style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 0, justifyContent: 'center' }}>
            <CircularProgress
              value={results.mood_score}
              size={160}
              label="Mood Score"
              sublabel={moodLabel}
              color={colorForWellbeingScore(results.mood_score)}
            />
            {/* Saved check-in mood sparkline inline */}
            {(() => {
              if (results.saved === false) return null;
              const previous = recentSessionsRef.current.slice(0, 6).reverse();
              const scores = [...previous.map((session) => session.mood_score), results.mood_score];
              const dates = [...previous.map((session) => session.created_at), 'Current check-in'];
              if (scores.length < 2) return null;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 14, width: '100%', borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                    {scores.length} Saved Check-ins · 0–100
                  </div>
                  <MoodSparklineInline scores={scores} dates={dates} width={130} height={35} />
                </div>
              );
            })()}
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <CardTitle>Breakdown</CardTitle>
            <MetricBar label="Energy Level" value={results.energy} color={COLORS.blue} />
            <MetricBar label="Stress Level" value={results.stress} color={COLORS.danger} />
            <MetricBar label="Positivity" value={results.positivity} color={COLORS.green} />
            <MetricBar label="Confidence" value={results.confidence} color={COLORS.blue} />
            <InlineRow label="Pace" value={PACE_LABEL[results.pace] ?? results.pace} />
          </Card>
        </Grid>

        {/* -- Detected Mode badge ----------------------------------- */}
        <DetectedModeBadge mode={results.detected_mode} />

        {/* -- Narrative Type badge ----------------------------------- */}
        {results.narrative_type && (() => {
          const NARRATIVE_META: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
            past:    { label: 'Processing the past', emoji: '🌀', color: '#7C3AED', bg: 'rgba(139,92,246,0.06)' },
            present: { label: 'How you feel right now', emoji: '🌿', color: '#16A34A', bg: 'rgba(16,163,74,0.06)' },
            future:  { label: 'Looking ahead', emoji: '🔭', color: '#2563EB', bg: 'rgba(37,99,235,0.06)' },
            mixed:   { label: 'Past, present & future', emoji: '✨', color: '#D97706', bg: 'rgba(245,158,11,0.06)' },
          };
          const meta = NARRATIVE_META[results.narrative_type!] ?? NARRATIVE_META.present;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: meta.bg,
              border: `1px solid ${meta.color}33`,
              borderRadius: 14,
              padding: '10px 16px',
              marginTop: 10,
            }}>
              <span style={{ fontSize: 18 }}>{meta.emoji}</span>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.8 }}>What you shared</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginTop: 1 }}>{meta.label}</div>
              </div>
            </div>
          );
        })()}

        {previousSession && (
          <div style={{ marginTop: 14 }}>
            <ComparisonCard current={results} previous={previousSession} />
          </div>
        )}

        <PersonalNoteCard
          current={results}
          recentSessions={recentSessionsRef.current}
        />

        {/* -- Vocal Metrics card -------------------------------------- */}
        {results.vocal_metrics && (
          <VocalMetricsCard metrics={results.vocal_metrics} />
        )}

        <Card style={{ marginBottom: 0, marginTop: 14 }}>
          <CardTitle icon="bulb">A Heart-to-Heart Reflection</CardTitle>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.7 }}>
            {results.ai_insight || results.insight}
          </div>
        </Card>
        <div style={{ height: 14 }} />

        {/* -- Readiness card (only for future/mixed narratives) ------- */}
        {(results.narrative_type === 'future' || results.narrative_type === 'mixed') && results.readiness_score != null && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(37,99,235,0.04), rgba(14,165,233,0.06))',
            border: '1px solid rgba(37,99,235,0.18)',
            borderRadius: 18,
            padding: '20px 20px 18px',
            marginBottom: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Readiness Check</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>How ready does your voice say you are?</div>
              </div>
              <div
                role="progressbar"
                aria-label="Readiness score"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, results.readiness_score))}
                style={{
                width: 58, height: 58, borderRadius: '50%',
                background: `conic-gradient(${colorForWellbeingScore(results.readiness_score)} ${Math.max(0, Math.min(100, results.readiness_score)) * 3.6}deg, rgba(17,17,24,0.08) 0deg)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: COLORS.card, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
                    {Math.max(0, Math.min(100, results.readiness_score))}
                    <span style={{ fontSize: 8, color: COLORS.textMuted }}> / 100</span>
                  </span>
                </div>
              </div>
            </div>
            {results.readiness_note && (
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.65, borderTop: `1px solid ${COLORS.cardBorder}`, paddingTop: 12 }}>
                {results.readiness_note}
              </div>
            )}
          </div>
        )}

        <Grid cols={2} gap={14}>
          {resultRecommendations.length > 0 && (
            <Card style={{ marginBottom: 0 }}>
              <CardTitle icon="checkmark">Recommendations</CardTitle>
              {resultRecommendations.map((tip, i) => (
                <div
                  key={i}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: COLORS.green,
                      marginTop: 7,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ fontSize: 13, color: COLORS.textSecondary, flex: 1, lineHeight: 1.55 }}>
                    {tip}
                  </div>
                </div>
              ))}
            </Card>
          )}

          {(results.todays_action || results.daily_prompt) ? (
            <div
              style={{
                background: 'rgba(99,179,237,0.08)',
                border: '1px solid rgba(99,179,237,0.25)',
                borderRadius: 18,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  fontSize: 13,
                  fontWeight: 700,
                  color: COLORS.blue,
                  marginBottom: 8,
                  fontFamily: 'var(--font-syne)',
                }}
              >
                <Icon name="pulse" size={14} color={COLORS.blue} />
                Today&apos;s Action
              </div>
              <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                {results.todays_action || results.daily_prompt}
              </div>
            </div>
          ) : (
            <Card style={{ marginBottom: 0 }}>
              <CardTitle>Next Step</CardTitle>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
                Talk to your AI coach about anything that came up, or view how today fits into
                your weekly trend.
              </div>
            </Card>
          )}
        </Grid>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {/* Primary CTA: Share Mood Card */}
          {/* <button
            ref={shareTriggerRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              borderRadius: 16,
              padding: '16px 18px',
              color: COLORS.white,
              fontSize: 16,
              fontWeight: 800,
              fontFamily: 'var(--font-syne)',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 10px 15px -3px rgba(37,99,235,0.2)',
            }}
          >
            <Icon name="share" size={18} color={COLORS.white} />
            Share Mood Card
          </button> */}

          {/* Secondary CTA buttons grid */}
          <Grid cols={2} gap={10}>
            <button
              onClick={() => {
                try {
                  sessionStorage.setItem('chatContext', JSON.stringify(results));
                } catch {}
                router.push('/chat');
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                background: COLORS.card,
                border: `1.5px solid ${COLORS.cardBorder}`,
                borderRadius: 16,
                padding: '13px 16px',
                color: COLORS.textSecondary,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Icon name="chat" size={16} color={COLORS.textSecondary} />
              Talk to Coach
            </button>

            <button
              onClick={() => router.push('/trends')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                background: COLORS.card,
                border: `1.5px solid ${COLORS.cardBorder}`,
                borderRadius: 16,
                padding: '13px 16px',
                color: COLORS.textSecondary,
                fontSize: 13.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Icon name="trending-up" size={16} color={COLORS.textSecondary} />
              View Trends
            </button>
          </Grid>
        </div>

        <div style={{ marginTop: 24 }}>
          <MedicalDisclaimer />
        </div>

        {/* Shareable Mood Card Engine */}
        <MoodCardExport
          moodScore={results.mood_score}
          mode={results.detected_mode}
          insightLine={results.vocal_summary || results.ai_insight || ''}
          triggerRef={shareTriggerRef}
        />
      </AppShell>
    );
  }

  if (phase === 'getting_question') {
    return (
      <AppShell title="Reflect — Deep Understanding" subtitle="Therapist Elena is listening">
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="animate-pulse-soft">
            <Logo size={38} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, marginTop: 32, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
            Elena is tuning into your voice...
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}>
            Preparing 1 targeted follow-up question to start your session
          </div>
        </div>
      </AppShell>
    );
  }

  if (phase === 'deep_conversation') {
    return (
      <AppShell title="Reflect — Deep Understanding" subtitle="Interactive conversation with Elena">
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 24,
            padding: '24px 20px',
            maxWidth: 720,
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 'calc(100vh - 160px)',
          }}
        >
          {/* Header Bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: 16,
              borderBottom: `1px solid ${COLORS.cardBorder}`,
              marginBottom: 20,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(14,165,233,0.15))',
                  border: '1.5px solid rgba(37,99,235,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                  position: 'relative',
                }}
              >
                🧠
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
                  Elena — Your Safe Space
                </div>
                <div style={{ fontSize: 12, color: COLORS.blue, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Not just heard. Understood.</span>
                  {/* <span style={{ color: COLORS.textMuted }}>•</span> */}
                  {/* <span style={{ color: COLORS.textSecondary, fontWeight: 700 }}>
                    Question {Math.min(conversationMessages.filter((m) => m.role === 'assistant').length, 3)} of 3
                  </span> */}
                </div>
              </div>
            </div>

            {/* Finish CTA */}
            <button
              onClick={() => handleFinishDeepConversation()}
              disabled={isSubmittingDeep}
              style={{
                background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                color: COLORS.white,
                border: 'none',
                borderRadius: 14,
                padding: '10px 18px',
                fontSize: 13,
                fontWeight: 800,
                fontFamily: 'var(--font-syne)',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                whiteSpace: 'nowrap',
              }}
            >
              {isSubmittingDeep ? 'Analyzing Session...' : 'Finish & See Full Analysis →'}
            </button>
          </div>

          {/* Conversation Chat Stream */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              paddingRight: 4,
              marginBottom: 20,
            }}
          >
            {conversationMessages.map((msg) => {
              const isAssistant = msg.role === 'assistant';
              const isSpeaking = isSpeakingId === msg.id;

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isAssistant ? 'flex-start' : 'flex-end',
                    maxWidth: '85%',
                    alignSelf: isAssistant ? 'flex-start' : 'flex-end',
                  }}
                >
                  <div
                    style={{
                      background: isAssistant
                        ? 'linear-gradient(135deg, rgba(37,99,235,0.06), rgba(14,165,233,0.08))'
                        : `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
                      border: isAssistant ? '1px solid rgba(37,99,235,0.18)' : 'none',
                      color: isAssistant ? COLORS.textPrimary : COLORS.white,
                      borderRadius: isAssistant ? '20px 20px 20px 6px' : '20px 20px 6px 20px',
                      padding: '16px 20px',
                      fontSize: 14.5,
                      lineHeight: 1.6,
                      boxShadow: isAssistant ? 'none' : '0 4px 14px rgba(37,99,235,0.18)',
                    }}
                  >
                    {isAssistant && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 8,
                          gap: 8,
                        }}
                      >
                        <span style={{ fontSize: 11, fontWeight: 800, color: COLORS.blue, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                          Elena
                        </span>
                      </div>
                    )}
                    <div>{msg.content}</div>
                  </div>
                  <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 4, padding: '0 4px' }}>
                    {msg.timestamp}
                  </div>
                </div>
              );
            })}

            {isTherapistThinking && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  background: 'rgba(37,99,235,0.06)',
                  border: '1px solid rgba(37,99,235,0.18)',
                  borderRadius: '20px 20px 20px 6px',
                  padding: '12px 18px',
                  fontSize: 13,
                  color: COLORS.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <div className="animate-pulse-soft" style={{ fontSize: 14 }}>🧠</div>
                <span>Elena is listening and reflecting...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Completion Banner when 3 questions answered */}
          {conversationMessages.filter((m) => m.role === 'assistant').length >= 3 &&
            conversationMessages.filter((m) => m.role === 'user').length >= 3 && (
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(37,99,235,0.08), rgba(14,165,233,0.1))',
                  border: '1px solid rgba(37,99,235,0.25)',
                  borderRadius: 16,
                  padding: '12px 16px',
                  marginBottom: 14,
                  fontSize: 13,
                  color: COLORS.textPrimary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <strong style={{ color: COLORS.blue, display: 'block' }}>✨ Session Complete (3/3 Questions Answered)</strong>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Elena has gathered full emotional clarity for your session analysis. Generating results...</span>
                </div>
              </div>
            )}

          {/* Chat Input Bar */}
          <div
            style={{
              background: COLORS.background,
              border: `1.5px solid ${COLORS.cardBorder}`,
              borderRadius: 20,
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: conversationMessages.filter((m) => m.role === 'assistant').length >= 3 && conversationMessages.filter((m) => m.role === 'user').length >= 3 ? 0.6 : 1,
            }}
          >
            {/* Mic Dictation Button */}
            <button
              onClick={toggleVoiceDictation}
              disabled={conversationMessages.filter((m) => m.role === 'assistant').length >= 3 && conversationMessages.filter((m) => m.role === 'user').length >= 3}
              title={isListeningVoice ? 'Stop dictation' : 'Speak your answer (Voice Dictation)'}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                border: isListeningVoice ? `2px solid ${COLORS.danger}` : `1px solid ${COLORS.cardBorder}`,
                background: isListeningVoice ? 'rgba(239,68,68,0.12)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: isListeningVoice ? COLORS.danger : COLORS.textSecondary,
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >
              <Icon name={isListeningVoice ? 'stop' : 'mic'} size={18} color={isListeningVoice ? COLORS.danger : COLORS.textSecondary} />
            </button>

            {/* Input Field */}
            <input
              type="text"
              value={chatInputText}
              onChange={(e) => setChatInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendUserMessage()}
              placeholder={
                conversationMessages.filter((m) => m.role === 'assistant').length >= 3 && conversationMessages.filter((m) => m.role === 'user').length >= 3
                  ? '3/3 Questions completed — Generating full results...'
                  : isListeningVoice
                  ? 'Listening... Speak now...'
                  : 'Type or speak your answer to Elena...'
              }
              disabled={
                isTherapistThinking ||
                (conversationMessages.filter((m) => m.role === 'assistant').length >= 3 && conversationMessages.filter((m) => m.role === 'user').length >= 3)
              }
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 14,
                color: COLORS.textPrimary,
                padding: '8px 4px',
              }}
            />

            {/* Send Button */}
            <button
              onClick={() => handleSendUserMessage()}
              disabled={!chatInputText.trim() || isTherapistThinking}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                border: 'none',
                background: chatInputText.trim() && !isTherapistThinking
                  ? `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`
                  : COLORS.cardBorder,
                color: COLORS.white,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: chatInputText.trim() && !isTherapistThinking ? 'pointer' : 'not-allowed',
                flexShrink: 0,
                transition: 'all 0.2s ease',
              }}
            >
              <Icon name="send" size={16} color={COLORS.white} />
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (phase === 'analyzing') {
    return (
      <AppShell title="Reflect" subtitle="Analyzing your voice">
        <div
          style={{
            minHeight: '60vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div className="animate-pulse-soft">
            <Logo size={38} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: COLORS.textPrimary, marginTop: 32, fontFamily: 'var(--font-syne)', letterSpacing: '-0.5px' }}>
            {reflectMode === 'deep' ? 'Synthesizing your deep session...' : 'Analyzing your voice...'}
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}>
            {reflectMode === 'deep' ? 'Integrating your voice memo + therapist response' : 'Detecting tone, pace, energy & emotions'}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Reflect" subtitle="Record 60 seconds — we listen to your voice">
      <div
        style={{
          background: COLORS.card,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 24,
          padding: '40px 24px 44px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: 'calc(100vh - 180px)',
          justifyContent: 'center',
        }}
      >
        {/* Mode Selector Toggle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(17,17,24,0.04)',
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 16,
            padding: 4,
            marginBottom: 28,
            gap: 4,
            maxWidth: 420,
            width: '100%',
          }}
        >
          <button
            onClick={() => setReflectMode('quick')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 12,
              border: 'none',
              background: reflectMode === 'quick' ? COLORS.card : 'transparent',
              boxShadow: reflectMode === 'quick' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              color: reflectMode === 'quick' ? COLORS.textPrimary : COLORS.textSecondary,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            <span>⚡</span>
            Quick Check-In
          </button>
          <button
            onClick={() => setReflectMode('deep')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 12,
              border: reflectMode === 'deep' ? '1px solid rgba(37,99,235,0.25)' : '1px solid transparent',
              background: reflectMode === 'deep' ? 'linear-gradient(135deg, rgba(37,99,235,0.1), rgba(14,165,233,0.12))' : 'transparent',
              boxShadow: reflectMode === 'deep' ? '0 2px 8px rgba(37,99,235,0.15)' : 'none',
              color: reflectMode === 'deep' ? COLORS.blue : COLORS.textSecondary,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'all 0.2s ease',
            }}
          >
            <span>🧠</span>
            Deep Understanding
          </button>
        </div>

        {/* Status text */}
        <div
          style={{
            fontSize: 15,
            color: COLORS.textSecondary,
            textAlign: 'center',
            lineHeight: 1.65,
            marginBottom: 36,
            maxWidth: 440,
          }}
        >
          {isRecording ? (
            <>Speak freely — anything on your mind.<br />We&apos;ll stop automatically at 60 seconds.</>
          ) : reflectMode === 'deep' ? (
            <><strong>Deep Understanding Mode</strong><br />Record your voice memo. Once finished, AI Therapist will ask 1 deep targeted question before decoding your results.</>
          ) : (
            <>Talk about how you&apos;re feeling today.<br />Anything on your mind.</>
          )}
        </div>

        {/* Mic button with pulse rings */}
        <div style={{ position: 'relative', marginBottom: 32 }}>
          {isRecording && (
            <>
              <div className="recording-ring" />
              <div className="recording-ring-2" />
            </>
          )}
          <button
            onClick={isRecording ? handleStop : handleStart}
            style={{
              width: 160,
              height: 160,
              borderRadius: 80,
              border: `2.5px solid ${isRecording ? COLORS.danger : COLORS.blue}`,
              background: isRecording
                ? `radial-gradient(circle, ${COLORS.danger}18 0%, ${COLORS.danger}08 100%)`
                : `radial-gradient(circle, rgba(37,99,235,0.07) 0%, transparent 70%)`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              transition: 'border-color 0.2s, background 0.2s',
              position: 'relative',
              zIndex: 1,
            }}
          >
            <Icon
              name={isRecording ? 'stop' : 'mic'}
              size={52}
              color={isRecording ? COLORS.danger : COLORS.blue}
            />
            <span style={{ fontSize: 10, fontWeight: 700, color: isRecording ? COLORS.danger : COLORS.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {isRecording ? 'Stop' : 'Tap to start'}
            </span>
          </button>
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 44, fontWeight: 800, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)', letterSpacing: '-1px', lineHeight: 1 }}>
            {Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}
          </span>
          <span style={{ fontSize: 16, fontWeight: 400, color: COLORS.textMuted }}>
            {' / 1:00'}
          </span>
        </div>

        {/* Status label */}
        <div
          style={{
            fontSize: 13,
            color: isRecording ? COLORS.danger : COLORS.textMuted,
            textAlign: 'center',
            marginBottom: 32,
            fontWeight: isRecording ? 600 : 400,
          }}
        >
          {isRecording ? '● Recording in progress' : 'Tap the mic to start recording'}
        </div>

        {analyzeErr && (
          <div style={{ marginBottom: 16, color: COLORS.danger, fontSize: 13, textAlign: 'center' }}>
            {analyzeErr}
          </div>
        )}

        <div style={{ width: '100%', maxWidth: 340 }}>
          <WaveformVisualizer active={isRecording} barCount={35} stream={stream} />
        </div>
      </div>
    </AppShell>
  );
}

function CardTitle({ children, icon }: { children: React.ReactNode; icon?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 16, fontFamily: 'var(--font-syne)', letterSpacing: '-0.2px' }}>
      {icon && <Icon name={icon} size={15} color={COLORS.blue} />}
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// DetectedModeBadge — large, icon-led, screenshot-worthy mode display
// -----------------------------------------------------------------------------
const MODE_META: Record<string, { emoji: string; tagline: string; bg: string; border: string; text: string }> = {
  calm:       { emoji: '🌊', tagline: 'Grounded and at ease', bg: 'rgba(37,99,235,0.06)', border: 'rgba(37,99,235,0.2)', text: '#2563EB' },
  happy:      { emoji: '✨', tagline: 'High on life right now', bg: 'rgba(16,163,74,0.06)', border: 'rgba(16,163,74,0.25)', text: '#16A34A' },
  motivated:  { emoji: '⚡', tagline: 'Ready to move', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', text: '#D97706' },
  anxious:    { emoji: '🌀', tagline: 'Something is pressing on you', bg: 'rgba(217,119,6,0.06)', border: 'rgba(217,119,6,0.25)', text: '#D97706' },
  venting:    { emoji: '🔥', tagline: 'Letting it out — that takes courage', bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', text: '#EF4444' },
  angry:      { emoji: '⚡', tagline: 'Strong signal — something matters here', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', text: '#EF4444' },
  sad:        { emoji: '🌧️', tagline: 'Carrying something heavy', bg: 'rgba(37,99,235,0.07)', border: 'rgba(37,99,235,0.2)', text: '#2563EB' },
  reflective: { emoji: '🪞', tagline: 'Thinking things through', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.2)', text: '#7C3AED' },
  neutral:    { emoji: '⚖️', tagline: 'Balanced, measured', bg: 'rgba(138,138,154,0.06)', border: 'rgba(138,138,154,0.2)', text: '#54545F' },
};

function DetectedModeBadge({ mode }: { mode: string }) {
  const meta = MODE_META[mode.toLowerCase()] ?? MODE_META.neutral;
  const label = mode.charAt(0).toUpperCase() + mode.slice(1);

  return (
    <div
      style={{
        background: meta.bg,
        border: `1.5px solid ${meta.border}`,
        borderRadius: 20,
        padding: '20px 24px',
        marginTop: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 18,
      }}
    >
      {/* Big emoji icon */}
      <div
        style={{
          width: 60,
          height: 60,
          borderRadius: 16,
          background: `${meta.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 28,
          flexShrink: 0,
        }}
      >
        {meta.emoji}
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: meta.text, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          Detected Mode
        </div>
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            color: meta.text,
            fontFamily: 'var(--font-syne)',
            letterSpacing: '-0.5px',
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>
          {meta.tagline}
        </div>
      </div>

      {/* RevealAI watermark for screenshots */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: COLORS.textMuted,
          textTransform: 'uppercase',
          letterSpacing: 1.2,
          textAlign: 'right',
          flexShrink: 0,
          opacity: 0.6,
        }}
      >
        Reveal
        <br />
        Voice AI
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// VocalMetricsCard — renders the real measured acoustic numbers

// -----------------------------------------------------------------------------
type VocalMetricsProps = {
  metrics: {
    avg_pitch_hz: number;
    pitch_variability: number;
    speech_rate_wpm: number;
    pause_count: number;
    pause_frequency: string;
    volume_consistency: number;
    jitter_shimmer_index: number;
  };
};

function VocalMetricsCard({ metrics }: VocalMetricsProps) {
  const statChips = [
    {
      label: 'Vocal Warmth',
      value: metrics.avg_pitch_hz > 0 ? `${metrics.avg_pitch_hz} Hz` : '—',
      icon: 'pulse',
    },
    {
      label: 'Speaking Pace',
      value: metrics.speech_rate_wpm > 0 ? `${metrics.speech_rate_wpm} WPM` : '—',
      icon: 'time',
    },
    {
      label: 'Breathing Spaces',
      value: `${metrics.pause_count} moments (${metrics.pause_frequency})`,
      icon: 'bulb',
    },
  ];

  const bars = [
    {
      label: 'Vocal Expression',
      value: metrics.pitch_variability,
      color: COLORS.blue,
      hint: metrics.pitch_variability < 25
        ? 'Steady & grounded delivery'
        : metrics.pitch_variability < 55
        ? 'Balanced vocal melody'
        : 'Richly expressive highs & lows',
    },
    {
      label: 'Flow Stability',
      value: metrics.volume_consistency,
      color: COLORS.green,
      hint: metrics.volume_consistency > 75
        ? 'Steady, reassuring presence'
        : metrics.volume_consistency > 45
        ? 'Gentle variations in volume'
        : 'Soft fades & breathing pauses',
    },
    {
      label: 'Ease vs Strain',
      value: metrics.jitter_shimmer_index,
      color: metrics.jitter_shimmer_index > 55 ? COLORS.danger : COLORS.blue,
      hint: metrics.jitter_shimmer_index < 25
        ? 'Relaxed & easy flow'
        : metrics.jitter_shimmer_index < 55
        ? 'Subtle holding of tension'
        : 'Vocal holding / working harder',
    },
  ];

  // return (
    // <div
    //   style={{
    //     background: 'linear-gradient(135deg, rgba(14,165,233,0.05) 0%, rgba(99,102,241,0.05) 100%)',
    //     border: `1px solid ${COLORS.cardBorder}`,
    //     borderRadius: 18,
    //     padding: 20,
    //     marginTop: 14,
    //   }}
    // >
    //   {/* Header */}
    //   <div
    //     style={{
    //       display: 'flex',
    //       alignItems: 'center',
    //       gap: 8,
    //       marginBottom: 16,
    //     }}
    //   >
    //     <div
    //       style={{
    //         width: 28,
    //         height: 28,
    //         borderRadius: 8,
    //         background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(14,165,233,0.15))',
    //         display: 'flex',
    //         alignItems: 'center',
    //         justifyContent: 'center',
    //         flexShrink: 0,
    //       }}
    //     >
    //       <Icon name="mic" size={14} color={COLORS.blue} />
    //     </div>
    //     {/* <div>
    //       <div
    //         style={{
    //           fontSize: 14,
    //           fontWeight: 700,
    //           color: COLORS.textPrimary,
    //           fontFamily: 'var(--font-syne)',
    //           letterSpacing: '-0.2px',
    //         }}
    //       >
    //         The Rhythm & Resonance of Your Voice
    //       </div>
    //       <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>
    //         These are the subtle frequencies, flow, and breathing patterns we heard in your recording
    //       </div>
    //     </div> */}
    //   </div>

    //   {/* Stat chips */}
    //   {/* <div
    //     style={{
    //       display: 'grid',
    //       gridTemplateColumns: 'repeat(3, 1fr)',
    //       gap: 8,
    //       marginBottom: 16,
    //     }}
    //   >
    //     {statChips.map((chip) => (
    //       <div
    //         key={chip.label}
    //         style={{
    //           background: 'rgba(17,17,24,0.03)',
    //           border: `1px solid ${COLORS.cardBorder}`,
    //           borderRadius: 12,
    //           padding: '10px 12px',
    //           textAlign: 'center',
    //         }}
    //       >
    //         <div
    //           style={{
    //             fontSize: 11,
    //             color: COLORS.textMuted,
    //             marginBottom: 4,
    //             textTransform: 'uppercase',
    //             letterSpacing: 0.4,
    //           }}
    //         >
    //           {chip.label}
    //         </div>
    //         <div
    //           style={{
    //             fontSize: 15,
    //             fontWeight: 800,
    //             color: COLORS.textPrimary,
    //             fontFamily: 'var(--font-syne)',
    //             letterSpacing: '-0.3px',
    //           }}
    //         >
    //           {chip.value}
    //         </div>
    //       </div>
    //     ))}
    //   </div> */}

    //   {/* Metric bars */}
    //   {/* <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    //     {bars.map((bar) => (
    //       <div key={bar.label}>
    //         <div
    //           style={{
    //             display: 'flex',
    //             justifyContent: 'space-between',
    //             alignItems: 'center',
    //             marginBottom: 5,
    //           }}
    //         >
    //           <span style={{ fontSize: 12, color: COLORS.textSecondary, fontWeight: 600 }}>
    //             {bar.label}
    //           </span>
    //           <span style={{ fontSize: 11, color: COLORS.textMuted }}>{bar.hint}</span>
    //         </div>
    //         <div
    //           style={{
    //             height: 6,
    //             borderRadius: 3,
    //             background: 'rgba(17,17,24,0.08)',
    //             overflow: 'hidden',
    //           }}
    //         >
    //           <div
    //             style={{
    //               height: '100%',
    //               width: `${bar.value}%`,
    //               borderRadius: 3,
    //               background: bar.color,
    //               transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
    //             }}
    //           />
    //         </div>
    //       </div>
    //     ))}
    //   </div> */}
    // </div>
  // );
  return null;
}

function InlineRow({ label, value }: { label: string; value: string }) {

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 10,
      }}
    >
      <span style={{ fontSize: 13, color: COLORS.textSecondary }}>{label}</span>
      <span
        style={{
          background: COLORS.cardBorder,
          padding: '4px 12px',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 700,
          color: COLORS.textPrimary,
          textTransform: 'capitalize',
        }}
      >
        {value}
      </span>
    </div>
  );
}

type DiffMeta = {
  label: string;
  current: number;
  delta: number;
  goodWhen: 'up' | 'down';
};

function ComparisonCard({
  current,
  previous,
}: {
  current: AnalysisResult;
  previous: TherapySession;
}) {
  const diffs: DiffMeta[] = [
    { label: 'Mood', current: current.mood_score, delta: current.mood_score - previous.mood_score, goodWhen: 'up' },
    { label: 'Energy', current: current.energy, delta: current.energy - previous.energy, goodWhen: 'up' },
    { label: 'Stress', current: current.stress, delta: current.stress - previous.stress, goodWhen: 'down' },
    { label: 'Positivity', current: current.positivity, delta: current.positivity - previous.positivity, goodWhen: 'up' },
  ];

  const prevDate = new Date(previous.created_at);
  const dateLabel = prevDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, fontFamily: 'var(--font-syne)' }}>
            <Icon name="trending-up" size={16} color={COLORS.blue} />
            Compared to Last Session
          </div>
          <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 2 }}>{dateLabel}</div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 10,
        }}
      >
        {diffs.map((d) => (
          <DiffTile key={d.label} {...d} />
        ))}
      </div>
    </Card>
  );
}

function DiffTile({ label, current, delta, goodWhen }: DiffMeta) {
  const isFlat = delta === 0;
  const isUp = delta > 0;
  const isGood = isFlat ? null : (isUp && goodWhen === 'up') || (!isUp && goodWhen === 'down');
  const color = isFlat ? COLORS.textMuted : isGood ? COLORS.success : COLORS.danger;
  const arrow = isFlat ? '–' : isUp ? '▲' : '▼';
  const sign = isUp ? '+' : '';

  return (
    <div
      style={{
        background: 'rgba(17, 17, 24, 0.025)',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 800, color: COLORS.textPrimary }}>{current}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color }}>
          {arrow} {sign}
          {delta}
        </span>
      </div>
    </div>
  );
}

function PersonalNoteCard({
  current,
  recentSessions,
}: {
  current: AnalysisResult;
  recentSessions: TherapySession[];
}) {
  const lines = buildPersonalNotes(current, recentSessions);
  if (!lines.length) return null;

  return (
    <Card>
      <CardTitle icon="sparkles">Personal Notes</CardTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              fontSize: 13,
              color: COLORS.textSecondary,
              lineHeight: 1.55,
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
              <Icon name={line.icon} size={13} color={COLORS.blue} />
            </div>
            <span style={{ flex: 1 }}>{line.text}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function buildPersonalNotes(
  current: AnalysisResult,
  recent: TherapySession[]
): { icon: string; text: string }[] {
  const notes: { icon: string; text: string }[] = [];
  const hour = new Date().getHours();
  const timeBand =
    hour < 6 ? 'late night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 22 ? 'evening' : 'night';

  // Streak-aware note
  const distinctDays = new Set(
    recent.map((s) => new Date(s.created_at).toDateString())
  );
  if (distinctDays.size >= 5) {
    notes.push({
      icon: 'flame',
      text: `You've shown up ${distinctDays.size} days recently — that consistency is the work. The habit itself is rewiring your self-awareness.`,
    });
  } else if (distinctDays.size >= 2) {
    notes.push({
      icon: 'trending-up',
      text: `${distinctDays.size}-day rhythm building. Two more sessions this week and the trend signal becomes much sharper.`,
    });
  }

  // Time-of-day note
  if (timeBand === 'morning' && current.energy < 50) {
    notes.push({
      icon: 'bulb',
      text: 'Low morning energy — try 5 minutes outside in daylight before your first task. Strongest non-caffeine cortisol lift available.',
    });
  } else if (timeBand === 'evening' && current.stress > 60) {
    notes.push({
      icon: 'time',
      text: 'Evening stress is high. Avoid making decisions tonight — write down what is pressing you, sleep on it, decide tomorrow.',
    });
  } else if (timeBand === 'late night' && current.mood_score < 50) {
    notes.push({
      icon: 'time',
      text: 'Tough feelings at night get amplified — they look different in daylight. Be gentle with yourself and prioritise sleep.',
    });
  }

  // Mode-aware (using recent_modes pattern)
  if (recent.length >= 3) {
    const recentModes = recent.slice(0, 3).map((s) => s.detected_mode);
    const sameMode = recentModes.every((m) => m === current.detected_mode);
    if (sameMode && current.detected_mode) {
      notes.push({
        icon: 'pulse',
        text: `Your last few sessions have all been "${current.detected_mode}" — there's a clear pattern. Worth sharing with your AI Coach to dig into what's driving it.`,
      });
    }
  }

  // Compare against personal baselines
  if (recent.length >= 5) {
    const avgMood = Math.round(recent.reduce((s, x) => s + x.mood_score, 0) / recent.length);
    if (current.mood_score >= avgMood + 12) {
      notes.push({
        icon: 'trending-up',
        text: `Today's mood is well above your usual (${avgMood}). Whatever's different today — note it. That's actionable data.`,
      });
    } else if (current.mood_score <= avgMood - 12) {
      notes.push({
        icon: 'trending-down',
        text: `Today scored ${avgMood - current.mood_score} points below your typical mood. One off-day isn't a trend — be honest, not harsh.`,
      });
    }
  }

  // Burnout early warning
  if (recent.length >= 4) {
    const recentEnergy = recent.slice(0, 4).map((s) => s.energy);
    const declining = recentEnergy.every((v, i, arr) => i === 0 || v <= arr[i - 1] + 3);
    const droppedTotal = recentEnergy[recentEnergy.length - 1] - recentEnergy[0];
    if (declining && droppedTotal < -15) {
      notes.push({
        icon: 'warning',
        text: 'Energy is on a clear downward slope across your last few sessions. This is the 7–14 day burnout window — protect sleep and cut one non-essential commitment this week.',
      });
    }
  }

  // Cap at 3 to avoid wall of text
  return notes.slice(0, 3);
}

export default function TherapyPage() {
  return (
    <>
      <TherapyInner />
    </>
  );
}
