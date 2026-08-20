'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { supabase } from '@/lib/supabase';
import { ELENA_LIVE_PERSONA } from '@/prompts/elena';
import { DEFAULT_VOICE, VOICES, resolveVoice } from '@/lib/voices';
import { GEMINI_LIVE_MODEL } from '@/lib/geminiModel';

export type LiveTranscriptTurn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

interface LiveVoiceChatProps {
  onSessionComplete?: (
    transcript: LiveTranscriptTurn[],
    durationSeconds: number
  ) => void;
  systemInstructionText?: string;
  /**
   * Google prebuilt voice id. The caller reads it from the user's profile;
   * an unknown or missing value falls back to DEFAULT_VOICE rather than
   * failing the call.
   */
  voiceName?: string;
  /** Creates the durable database session before audio is sent to Gemini. */
  onSessionStart?: () => Promise<void>;
  /** Persists completed turns while the call is still running. */
  onTranscriptTurn?: (turn: LiveTranscriptTurn) => Promise<void> | void;
  /**
   * Called once per spoken user turn, with what the user said, as soon as the
   * model starts answering it. Return false to end the call immediately.
   *
   * This is how T-8 reaches a live call. The component stays transport-only:
   * it reports the turn and obeys the answer, and the caller decides what
   * counts as a reason to stop.
   */
  onUserTurn?: (text: string) => Promise<boolean> | boolean;
  disabledReason?: string;
}

interface MessageLog {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

type BrowserWindow = Window &
  typeof globalThis & { webkitAudioContext?: typeof AudioContext };

type GeminiLiveResponse = {
  setupComplete?: unknown;
  sessionResumptionUpdate?: { newHandle?: unknown };
  goAway?: unknown;
  serverContent?: {
    interrupted?: boolean;
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
    modelTurn?: { parts?: Array<{ inlineData?: { data?: string } }> };
    turnComplete?: boolean;
  };
};

function audioContextConstructor(): typeof AudioContext {
  return window.AudioContext || (window as BrowserWindow).webkitAudioContext!;
}

async function decodeGeminiMessage(data: unknown): Promise<GeminiLiveResponse> {
  let raw: string;
  if (typeof data === 'string') {
    raw = data;
  } else if (data instanceof Blob) {
    raw = await data.text();
  } else if (data instanceof ArrayBuffer) {
    raw = new TextDecoder().decode(data);
  } else if (ArrayBuffer.isView(data)) {
    raw = new TextDecoder().decode(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
  } else {
    throw new Error(`Unsupported WebSocket message type: ${Object.prototype.toString.call(data)}`);
  }

  return JSON.parse(raw) as GeminiLiveResponse;
}

export default function LiveVoiceChat({
  onSessionComplete,
  systemInstructionText,
  voiceName = DEFAULT_VOICE,
  onSessionStart,
  onTranscriptTurn,
  onUserTurn,
  disabledReason,
}: LiveVoiceChatProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [status, setStatus] = useState<string>('Ready for Live Call');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [showTranscript, setShowTranscript] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Audio & Media Refs
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMutedRef = useRef(false);
  const callDurationRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const completionFiredRef = useRef(false);
  const setupCompleteRef = useRef(false);
  const reconnectingRef = useRef(false);
  const resumptionHandleRef = useRef<string | null>(null);
  const finaliseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const screenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef<MessageLog[]>([]);
  const emittedTurnIdsRef = useRef(new Set<string>());

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Visualizer canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-scroll transcript
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Transcription arrives a few words at a time, from both sides at once. Each
  // fragment has to extend the speaker's open turn rather than become its own
  // line, or a single sentence renders as a column of one-word rows. The ids
  // live in a ref so a fragment can find the turn it belongs to without the
  // socket handler depending on `messages`.
  const openTurnRef = useRef<{ user: string | null; assistant: string | null }>({
    user: null,
    assistant: null,
  });
  const turnCounterRef = useRef(0);

  const replaceMessages = useCallback(
    (update: (current: MessageLog[]) => MessageLog[]) => {
      const next = update(messagesRef.current);
      messagesRef.current = next;
      setMessages(next);
    },
    []
  );

  const appendTranscript = useCallback((role: 'user' | 'assistant', chunk: string) => {
    if (!chunk) return;

    const openId = openTurnRef.current[role];
    if (openId) {
      replaceMessages((prev) =>
        prev.map((m) => (m.id === openId ? { ...m, content: m.content + chunk } : m))
      );
      return;
    }

    // The id is claimed outside the updater, so a double-invoked updater in
    // development cannot mint two rows for one turn.
    const id = `${role}-${turnCounterRef.current++}`;
    openTurnRef.current[role] = id;
    replaceMessages((prev) => [
      ...prev,
      {
        id,
        role,
        content: chunk,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, [replaceMessages]);

  // Close both turns so the next fragment starts a fresh line.
  const onTranscriptTurnRef = useRef(onTranscriptTurn);
  useEffect(() => {
    onTranscriptTurnRef.current = onTranscriptTurn;
  }, [onTranscriptTurn]);

  const finaliseRole = useCallback((role: 'user' | 'assistant') => {
    const id = openTurnRef.current[role];
    openTurnRef.current[role] = null;
    if (!id || emittedTurnIdsRef.current.has(id)) return;

    const turn = messagesRef.current.find((message) => message.id === id);
    if (!turn?.content.trim()) return;
    emittedTurnIdsRef.current.add(id);
    void Promise.resolve(
      onTranscriptTurnRef.current?.({
        id: turn.id,
        role: turn.role,
        content: turn.content.trim(),
      })
    ).catch((err) => console.error('[LiveVoiceChat] Could not persist turn:', err));
  }, []);

  const closeTurns = useCallback(() => {
    finaliseRole('user');
    finaliseRole('assistant');
  }, [finaliseRole]);

  // What the user has said in the turn now in progress, and whether that turn
  // has already been handed to onUserTurn. Kept in refs, not state, because
  // the socket handler reads them on every frame and must not be re-created
  // each time a caption arrives.
  const userTurnTextRef = useRef('');
  const previousUserTailRef = useRef('');
  const lastScreenedTextRef = useRef('');

  // The socket handler is created once per call and would otherwise capture
  // the first onUserTurn it saw. Kept current in an effect rather than during
  // render, which React forbids.
  const onUserTurnRef = useRef(onUserTurn);
  useEffect(() => {
    onUserTurnRef.current = onUserTurn;
  }, [onUserTurn]);

  const finishConversationRef = useRef<(reason?: string) => void>(() => {});

  const scheduleUserScreen = useCallback((delayMs = 350) => {
    if (screenTimerRef.current) clearTimeout(screenTimerRef.current);
    screenTimerRef.current = setTimeout(() => {
      const current = userTurnTextRef.current.trim();
      if (!current) return;
      const text = `${previousUserTailRef.current}\n${current}`.trim().slice(-4000);
      if (!text || text === lastScreenedTextRef.current) return;
      lastScreenedTextRef.current = text;

      const handler = onUserTurnRef.current;
      if (!handler) return;
      void Promise.resolve(handler(text))
        .then((mayContinue) => {
          if (mayContinue === false) finishConversationRef.current('crisis');
        })
        .catch((err) =>
          console.error('[LiveVoiceChat] User-turn handler failed:', err)
        );
    }, delayMs);
  }, []);

  const finaliseCurrentTurn = useCallback(() => {
    if (finaliseTimerRef.current) {
      clearTimeout(finaliseTimerRef.current);
      finaliseTimerRef.current = null;
    }
    const userText = userTurnTextRef.current.trim();
    if (userText) previousUserTailRef.current = userText.slice(-240);
    closeTurns();
    userTurnTextRef.current = '';
  }, [closeTurns]);

  // Transcriptions are a side channel with no ordering guarantee. Give late
  // fragments a short grace period, and every new fragment restarts both the
  // finalisation timer and safety screening.
  const scheduleTurnFinalisation = useCallback(() => {
    if (finaliseTimerRef.current) clearTimeout(finaliseTimerRef.current);
    finaliseTimerRef.current = setTimeout(finaliseCurrentTurn, 750);
  }, [finaliseCurrentTurn]);

  // Audio queue playback (24kHz PCM from Gemini Multimodal Live API)
  const playAudioChunk = useCallback((base64PCM: string) => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = audioContextConstructor();
        audioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
      }

      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // Initialize AnalyserNode for audio visualization
      if (!analyserRef.current) {
        analyserRef.current = audioCtx.createAnalyser();
        analyserRef.current.fftSize = 64;
        analyserRef.current.smoothingTimeConstant = 0.8;
      }

      // Convert Base64 PCM to Float32
      const binary = atob(base64PCM);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      if (float32.length === 0) return;

      const buffer = audioCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = audioCtx.createBufferSource();
      source.buffer = buffer;

      // Connect source to analyser & destination
      source.connect(analyserRef.current);
      analyserRef.current.connect(audioCtx.destination);

      const currentTime = audioCtx.currentTime;
      const startTime = Math.max(currentTime, nextStartTimeRef.current);
      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;

      activeSourcesRef.current.push(source);
      setIsSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setIsSpeaking(false);
        }
      };
    } catch (err) {
      console.error('[LiveVoiceChat] Playback error:', err);
    }
  }, []);

  // Stop current audio queue (for interruption or ending call)
  const stopAudioQueue = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    activeSourcesRef.current = [];
    setIsSpeaking(false);
    if (audioCtxRef.current) {
      nextStartTimeRef.current = audioCtxRef.current.currentTime;
    }
  }, []);

  const stopMicProcessor = useCallback(() => {
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (micAudioCtxRef.current) {
      void micAudioCtxRef.current.close().catch(() => {});
      micAudioCtxRef.current = null;
    }
  }, []);

  // Stop & Clean up media streams & connections
  const cleanup = useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);
    stopAudioQueue();

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (finaliseTimerRef.current) clearTimeout(finaliseTimerRef.current);
    if (screenTimerRef.current) clearTimeout(screenTimerRef.current);
    if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    finaliseTimerRef.current = null;
    screenTimerRef.current = null;
    connectTimerRef.current = null;
    setupCompleteRef.current = false;
    stopMicProcessor();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, [stopAudioQueue, stopMicProcessor]);

  // Start microphone capture & stream to WebSocket (16kHz PCM)
  const startMicCapture = useCallback(async (ws: WebSocket, stream: MediaStream) => {
    try {
      mediaStreamRef.current = stream;
      stopMicProcessor();

      const AudioCtx = audioContextConstructor();
      const micCtx = new AudioCtx({ sampleRate: 16000 });
      micAudioCtxRef.current = micCtx;

      const source = micCtx.createMediaStreamSource(stream);
      // 512 samples at 16 kHz is 32 ms, inside Google's 20–40 ms target.
      // AudioWorklet remains the eventual replacement for ScriptProcessor,
      // but this removes the previous 256 ms buffering delay now.
      const processor = micCtx.createScriptProcessor(512, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (isMutedRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcm16[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7fff;
        }

        // Convert PCM16 buffer to Base64 in safe chunks
        let binary = '';
        const bytes = new Uint8Array(pcm16.buffer);
        const chunkSize = 8192;
        for (let i = 0; i < bytes.byteLength; i += chunkSize) {
          const sub = bytes.subarray(i, i + chunkSize);
          binary += String.fromCharCode.apply(null, Array.from(sub));
        }
        const base64Audio = btoa(binary);

        ws.send(
          JSON.stringify({
            realtimeInput: {
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: base64Audio,
              },
            },
          })
        );
      };

      source.connect(processor);
      processor.connect(micCtx.destination);
    } catch (err) {
      console.error('[LiveVoiceChat] Mic processing error:', err);
      setStatus('Microphone error');
      setErrorMsg('Error processing microphone audio stream.');
    }
  }, [stopMicProcessor]);

  useEffect(() => {
    if (!isMuted || !isConnected || !setupCompleteRef.current) return;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      // Required when automatic VAD is active and audio pauses for >1 second.
      ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }, [isConnected, isMuted]);

  const onSessionCompleteRef = useRef(onSessionComplete);
  useEffect(() => {
    onSessionCompleteRef.current = onSessionComplete;
  }, [onSessionComplete]);

  const finishConversation = useCallback(
    (reason = 'user') => {
      if (completionFiredRef.current) return;
      completionFiredRef.current = true;
      reconnectingRef.current = false;

      // Capture the final captions before cleanup clears timers and closes the
      // transport. The parent also receives turns progressively, so this
      // snapshot is a last-chance reconciliation after a dropped connection.
      finaliseCurrentTurn();
      const transcript: LiveTranscriptTurn[] = messagesRef.current
        .filter((message) => message.content.trim())
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content.trim(),
        }));
      const durationSeconds = callDurationRef.current;
      sessionActiveRef.current = false;
      cleanup();

      if (reason === 'crisis') {
        setStatus('Call ended for safety');
      } else if (reason === 'disconnected') {
        setStatus('Connection closed');
      } else {
        setStatus('Call ended');
      }

      void Promise.resolve(
        onSessionCompleteRef.current?.(transcript, durationSeconds)
      ).catch((err) => console.error('[LiveVoiceChat] Could not finish session:', err));
    },
    [cleanup, finaliseCurrentTurn]
  );

  useEffect(() => {
    finishConversationRef.current = finishConversation;
  }, [finishConversation]);

  // Main Call Handler: Start Conversation (Triggered on direct click)
  const startConversation = async () => {
    if (isConnecting || isConnected || disabledReason) return;
    setErrorMsg(null);
    completionFiredRef.current = false;
    sessionActiveRef.current = false;
    reconnectingRef.current = false;
    resumptionHandleRef.current = null;
    setupCompleteRef.current = false;
    callDurationRef.current = 0;
    setCallDuration(0);
    messagesRef.current = [];
    setMessages([]);
    emittedTurnIdsRef.current.clear();
    openTurnRef.current = { user: null, assistant: null };
    userTurnTextRef.current = '';
    previousUserTailRef.current = '';
    lastScreenedTextRef.current = '';
    setIsConnecting(true);
    setStatus('Initializing audio & requesting mic...');

    // 1. Synchronously create & resume AudioContext inside the user gesture handler
    try {
      const AudioCtx = audioContextConstructor();
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioCtx({ sampleRate: 24000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }
    } catch (e) {
      console.warn('[LiveVoiceChat] Could not pre-initialize AudioContext:', e);
    }

    // 2. Request Microphone Access
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      // Own the stream immediately. If token provisioning or WebSocket setup
      // fails, cleanup can now always extinguish the browser mic indicator.
      mediaStreamRef.current = stream;
    } catch (err) {
      console.error('[LiveVoiceChat] Microphone permission denied:', err);
      setIsConnecting(false);
      setStatus('Microphone Access Denied');
      setErrorMsg('Please allow microphone permissions in your browser to start the live call.');
      return;
    }

    // 3. Fetch a one-use ephemeral credential. The permanent Gemini key stays
    // server-side and this endpoint also re-checks the caller's entitlement.
    setStatus('Preparing secure connection...');
    let ephemeralToken = '';
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData.session?.access_token ?? '';
      const res = await fetch('/api/gemini-token', {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(
          res.status === 401
            ? 'Your session expired. Please sign in again to start a live call.'
            : res.status === 402
              ? 'You have no live-call time available. Add minutes in Settings.'
              : body.error || 'Live Call is temporarily unavailable.'
        );
      }
      const data = (await res.json()) as { token?: string; model?: string };
      ephemeralToken = data.token ?? '';
      if (!ephemeralToken || data.model !== GEMINI_LIVE_MODEL) {
        throw new Error('The secure Live Call credential was invalid.');
      }

      // Create the durable row before any audio leaves the browser. This makes
      // tab closes, network drops and safety stops recoverable in History.
      await onSessionStart?.();
      sessionActiveRef.current = true;
    } catch (err) {
      console.error('[LiveVoiceChat] Token fetch error:', err);
      cleanup();
      setStatus('Could not start call');
      setErrorMsg((err as Error).message || 'Live Call could not start.');
      return;
    }

    // 4. Connect to the constrained Live endpoint. A GoAway reconnect reuses
    // the latest resumption handle and the same one-use token; Google does not
    // count a resumed session as another use.
    const connectSocket = (resumeHandle?: string) => {
      setStatus(resumeHandle ? 'Reconnecting securely...' : 'Connecting securely...');
      const wsUrl =
        'wss://generativelanguage.googleapis.com/ws/' +
        'google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained' +
        `?access_token=${encodeURIComponent(ephemeralToken)}`;
      const ws = new WebSocket(wsUrl);
      // Gemini may deliver JSON in binary WebSocket frames. Browsers default
      // those to Blob objects; ArrayBuffer makes the common binary path
      // synchronously decodable, while decodeGeminiMessage still accepts Blob
      // for browsers that already queued a frame before this assignment.
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;
      let messageQueue: Promise<void> = Promise.resolve();
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
      connectTimerRef.current = setTimeout(() => {
        setErrorMsg('The secure Live Call connection timed out. Please try again.');
        ws.close();
      }, 15_000);

      ws.onopen = () => {
        setupCompleteRef.current = false;
        const setupMessage = {
          setup: {
            model: `models/${GEMINI_LIVE_MODEL}`,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    // A Google voice id, not the persona's name. The persona
                    // is Elena in every voice. This was hard-coded to
                    // 'Despina'; it now follows the user's choice in Settings,
                    // and resolveVoice keeps a retired id from reaching Google.
                    voiceName: resolveVoice(voiceName),
                  },
                },
              },
            },
            systemInstruction: {
              parts: [
                {
                  text: systemInstructionText || ELENA_LIVE_PERSONA,
                },
              ],
            },
            // A native-audio model returns AUDIO and nothing else, so without
            // these two the caption panel and the saved transcript are both
            // empty. Empty objects are the whole config: they are switches.
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
            contextWindowCompression: { slidingWindow: {} },
          },
        };

        ws.send(JSON.stringify(setupMessage));
      };

      ws.onmessage = (event) => {
        // Blob.text() is asynchronous. Serialising handlers preserves the
        // provider's frame order, which matters for setupComplete, transcript
        // fragments and turnComplete.
        messageQueue = messageQueue.then(async () => {
          if (completionFiredRef.current) return;
          const response = await decodeGeminiMessage(event.data);

          if (response.setupComplete) {
            if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
            connectTimerRef.current = null;
            setupCompleteRef.current = true;
            reconnectingRef.current = false;
            setIsConnecting(false);
            setIsConnected(true);
            setStatus('Connected — speaking with Elena');
            void startMicCapture(ws, stream);
            if (!timerIntervalRef.current) {
              timerIntervalRef.current = setInterval(() => {
                callDurationRef.current += 1;
                setCallDuration(callDurationRef.current);
              }, 1000);
            }
          }

          if (typeof response.sessionResumptionUpdate?.newHandle === 'string') {
            resumptionHandleRef.current = response.sessionResumptionUpdate.newHandle;
          }

          if (response.goAway) {
            reconnectingRef.current = Boolean(resumptionHandleRef.current);
            if (!reconnectingRef.current) {
              setErrorMsg('The Live Call reached its connection limit. Please start another call.');
            }
            ws.close(1000, reconnectingRef.current ? 'resume' : 'limit');
            return;
          }

          const serverContent = response.serverContent;

          // Handle interruption if the user spoke over Elena
          if (serverContent?.interrupted) {
            stopAudioQueue();
            finaliseRole('assistant');
          }

          // What the user said, and what Elena said back. Both are separate
          // from the audio stream below — the transcript is a side channel,
          // not the model's response parts.
          if (serverContent?.inputTranscription?.text) {
            const said = serverContent.inputTranscription.text;
            userTurnTextRef.current += said;
            appendTranscript('user', said);
            scheduleUserScreen();
            if (finaliseTimerRef.current) scheduleTurnFinalisation();
          }
          if (serverContent?.outputTranscription?.text) {
            appendTranscript('assistant', serverContent.outputTranscription.text);
            if (finaliseTimerRef.current) scheduleTurnFinalisation();
          }

          // Elena has started answering, so the user has stopped talking. This
          // is the earliest moment their whole turn is known, and screening it
          // here rather than at turnComplete cuts a crisis call short by
          // however long her answer would have taken to finish.
          const elenaAnswering =
            Boolean(serverContent?.outputTranscription?.text) ||
            Boolean(serverContent?.modelTurn?.parts?.length);

          if (elenaAnswering) scheduleUserScreen(0);

          // Play the audio. Text parts are not read here: a native-audio model
          // never sends them, and reading both would print every reply twice.
          if (serverContent?.modelTurn?.parts) {
            for (const part of serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                playAudioChunk(part.inlineData.data);
              }
            }
          }

          if (serverContent?.turnComplete) {
            scheduleUserScreen(0);
            scheduleTurnFinalisation();
          }
        }).catch((e) => {
          console.error('[LiveVoiceChat] Error parsing message:', e);
        });
      };

      ws.onclose = (event) => {
        if (completionFiredRef.current) return;
        stopMicProcessor();
        setupCompleteRef.current = false;
        setIsConnected(false);

        if (reconnectingRef.current && resumptionHandleRef.current) {
          connectSocket(resumptionHandleRef.current);
          return;
        }

        if (!event.wasClean || event.code !== 1000) {
          console.warn('[LiveVoiceChat] Connection closed abnormally:', event.code, event.reason);
          setErrorMsg(
            `Live Call disconnected (code ${event.code}${event.reason ? `: ${event.reason}` : ''}). The conversation was saved.`
          );
        }
        finishConversationRef.current('disconnected');
      };

      ws.onerror = (err) => {
        console.error('[LiveVoiceChat] WebSocket error:', err);
        setErrorMsg('The Live Call connection failed. The conversation will be saved.');
        ws.close();
      };
    };

    try {
      connectSocket();
    } catch (err) {
      console.error('[LiveVoiceChat] Connection initiation failed:', err);
      setStatus('Connection failed');
      setErrorMsg('Failed to open WebSocket connection.');
      finishConversation('disconnected');
    }
  };

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      if (sessionActiveRef.current && !completionFiredRef.current) {
        finishConversationRef.current('unmount');
      } else {
        cleanup();
      }
    };
  }, [cleanup]);

  // Audio Visualizer Canvas animation loop
  useEffect(() => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const barWidth = 4;
      const barGap = 3;
      const barCount = Math.floor(width / (barWidth + barGap));

      const dataArray = new Uint8Array(barCount);
      if (analyserRef.current && isSpeaking) {
        analyserRef.current.getByteFrequencyData(dataArray);
      }

      for (let i = 0; i < barCount; i++) {
        let val = isSpeaking ? dataArray[i % dataArray.length] / 255 : 0.08 + Math.sin(Date.now() * 0.003 + i) * 0.04;
        if (!isConnected) val = 0.05;

        const barHeight = Math.max(6, val * height * 0.85);
        const x = i * (barWidth + barGap);
        const y = (height - barHeight) / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        if (isSpeaking) {
          gradient.addColorStop(0, COLORS.sky);
          gradient.addColorStop(1, COLORS.gradientStart);
        } else if (isConnected) {
          gradient.addColorStop(0, COLORS.blue);
          gradient.addColorStop(1, COLORS.gradientEnd);
        } else {
          gradient.addColorStop(0, 'rgba(148, 163, 184, 0.3)');
          gradient.addColorStop(1, 'rgba(148, 163, 184, 0.1)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 3);
        ctx.fill();
      }
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isConnected, isSpeaking]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedVoice = resolveVoice(voiceName);
  const selectedVoiceTone = VOICES.find((voice) => voice.id === selectedVoice)?.tone ?? 'Natural';

  return (
    <div
      style={{
        background: 'linear-gradient(145deg, rgba(15, 23, 42, 0.85), rgba(30, 41, 59, 0.95))',
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 24,
        padding: 32,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        color: COLORS.textPrimary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
        maxWidth: 520,
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Background ambient aura glow when speaking */}
      <div
        style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 280,
          height: 280,
          borderRadius: '50%',
          background: isSpeaking
            ? `radial-gradient(circle, ${COLORS.sky} 0%, transparent 70%)`
            : isConnected
            ? `radial-gradient(circle, ${COLORS.gradientStart} 0%, transparent 70%)`
            : 'transparent',
          opacity: isSpeaking ? 0.35 : isConnected ? 0.15 : 0,
          transition: 'all 0.5s ease',
          pointerEvents: 'none',
        }}
      />

      {/* Header Badge */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(255, 255, 255, 0.06)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          padding: '6px 14px',
          fontSize: 12,
          fontWeight: 700,
          color: COLORS.textSecondary,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: 24,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: isConnected ? COLORS.green : isConnecting ? COLORS.sky : COLORS.danger,
            boxShadow: isConnected ? `0 0 10px ${COLORS.green}` : 'none',
            display: 'inline-block',
          }}
        />
        <span>{status}</span>
        {isConnected && <span style={{ opacity: 0.6, marginLeft: 4 }}>• {formatTimer(callDuration)}</span>}
      </div>

      {/* Main Avatar & Visualizer */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '12px 0 24px',
        }}
      >
        {/* Pulsing Voice Avatar Container */}
        <div
          style={{
            width: 110,
            height: 110,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isSpeaking
              ? `0 0 40px ${COLORS.sky}, 0 0 80px rgba(168, 85, 247, 0.4)`
              : isConnected
              ? `0 0 24px rgba(37, 99, 235, 0.4)`
              : '0 8px 24px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.3s ease',
            transform: isSpeaking ? 'scale(1.06)' : 'scale(1)',
          }}
        >
          <div
            style={{
              width: 98,
              height: 98,
              borderRadius: '50%',
              background: COLORS.card,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 36 }}>🎙️</span>
          </div>
        </div>

        <h3
          style={{
            fontFamily: 'var(--font-syne)',
            fontSize: 20,
            fontWeight: 800,
            color: COLORS.textPrimary,
            marginTop: 16,
            marginBottom: 4,
          }}
        >
          Elena Voice Companion
        </h3>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', margin: 0 }}>
          Gemini Live • {selectedVoiceTone} voice
        </p>
      </div>

      {/* Real-time Spectrum Waveform */}
      <div style={{ width: '100%', height: 48, marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
        <canvas aria-hidden="true" ref={canvasRef} width={340} height={48} style={{ width: 340, height: 48, maxWidth: '100%' }} />
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${COLORS.danger}`,
            borderRadius: 12,
            padding: '10px 16px',
            fontSize: 13,
            color: '#fca5a5',
            marginBottom: 20,
            textAlign: 'center',
            width: '100%',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Controls Bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '100%', justifyContent: 'center' }}>
        {!isConnected ? (
          <button
            type="button"
            onClick={startConversation}
            disabled={isConnecting || Boolean(disabledReason)}
            aria-label="Start live call"
            title={disabledReason}
            style={{
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              border: 'none',
              borderRadius: 30,
              padding: '14px 32px',
              fontSize: 15,
              fontWeight: 800,
              fontFamily: 'var(--font-syne)',
              cursor: isConnecting || disabledReason ? 'not-allowed' : 'pointer',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              opacity: isConnecting || disabledReason ? 0.55 : 1,
            }}
          >
            <span>{isConnecting ? '⏳ Connecting...' : '📞 Start Live Call'}</span>
          </button>
        ) : (
          <>
            {/* Mute Mic Button */}
            <button
              type="button"
              onClick={() => setIsMuted((prev) => !prev)}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: isMuted ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${isMuted ? COLORS.danger : 'rgba(255, 255, 255, 0.15)'}`,
                color: isMuted ? COLORS.danger : COLORS.textPrimary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
            >
              <Icon name={isMuted ? 'stop' : 'mic'} size={20} color={isMuted ? COLORS.danger : COLORS.textPrimary} />
            </button>

            {/* End Call Button */}
            <button
              type="button"
              onClick={() => finishConversation('user')}
              aria-label="End live call"
              style={{
                background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                color: COLORS.white,
                border: 'none',
                borderRadius: 30,
                padding: '14px 28px',
                fontSize: 14,
                fontWeight: 800,
                fontFamily: 'var(--font-syne)',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>🛑 End Call</span>
            </button>

            {/* Toggle Transcript */}
            <button
              type="button"
              onClick={() => setShowTranscript((prev) => !prev)}
              aria-label={showTranscript ? 'Hide live captions' : 'Show live captions'}
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: showTranscript ? 'rgba(37, 99, 235, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                border: `1px solid ${showTranscript ? COLORS.blue : 'rgba(255, 255, 255, 0.15)'}`,
                color: showTranscript ? COLORS.blue : COLORS.textPrimary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
              }}
              title={showTranscript ? 'Hide Captions' : 'Show Captions'}
            >
              <Icon name="chat" size={20} color={showTranscript ? COLORS.blue : COLORS.textPrimary} />
            </button>
          </>
        )}
      </div>

      {!isConnected && disabledReason && (
        <p
          role="status"
          style={{
            margin: '12px 0 0',
            color: COLORS.textMuted,
            fontSize: 12,
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          {disabledReason}
        </p>
      )}

      {/* Expandable Live Transcript Log */}
      {showTranscript && (
        <div
          style={{
            marginTop: 24,
            width: '100%',
            maxHeight: 180,
            overflowY: 'auto',
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 14,
            padding: 14,
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {messages.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', fontStyle: 'italic' }}>
              Live captions will appear here once the call starts...
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ fontSize: 12, color: COLORS.textPrimary }}>
                <span
                  style={{
                    fontWeight: 700,
                    color: m.role === 'user' ? COLORS.sky : COLORS.blue,
                  }}
                >
                  {m.role === 'user' ? 'You: ' : 'Elena: '}
                </span>
                <span>{m.content}</span>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>
      )}
    </div>
  );
}
