'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';

interface LiveVoiceChatProps {
  onSessionComplete?: (transcript: { role: string; content: string }[]) => void;
  systemInstructionText?: string;
}

interface MessageLog {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function LiveVoiceChat({
  onSessionComplete,
  systemInstructionText,
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
  isMutedRef.current = isMuted;

  // Visualizer canvas ref
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Auto-scroll transcript
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Audio queue playback (24kHz PCM from Gemini Multimodal Live API)
  const playAudioChunk = useCallback((base64PCM: string) => {
    try {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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

  // Stop & Clean up media streams & connections
  const cleanup = useCallback(() => {
    setIsConnected(false);
    setIsConnecting(false);
    stopAudioQueue();

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {}
      processorRef.current = null;
    }

    if (micAudioCtxRef.current) {
      try {
        micAudioCtxRef.current.close();
      } catch {}
      micAudioCtxRef.current = null;
    }

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
  }, [stopAudioQueue]);

  // Start microphone capture & stream to WebSocket (16kHz PCM)
  const startMicCapture = useCallback(async (ws: WebSocket, stream: MediaStream) => {
    try {
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const micCtx = new AudioCtx({ sampleRate: 16000 });
      micAudioCtxRef.current = micCtx;

      const source = micCtx.createMediaStreamSource(stream);
      const processor = micCtx.createScriptProcessor(4096, 1, 1);
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
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: base64Audio,
                },
              ],
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
  }, []);

  // Main Call Handler: Start Conversation (Triggered on direct click)
  const startConversation = async () => {
    setErrorMsg(null);
    setIsConnecting(true);
    setStatus('Initializing audio & requesting mic...');

    // 1. Synchronously create & resume AudioContext inside the user gesture handler
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
    } catch (err) {
      console.error('[LiveVoiceChat] Microphone permission denied:', err);
      setIsConnecting(false);
      setStatus('Microphone Access Denied');
      setErrorMsg('Please allow microphone permissions in your browser to start the live call.');
      return;
    }

    // 3. Fetch API Key for Gemini WebSocket
    setStatus('Fetching live API key...');
    let apiKey = '';
    try {
      const res = await fetch('/api/gemini-token');
      if (!res.ok) {
        throw new Error('Failed to retrieve Gemini API Key from server');
      }
      const data = await res.json();
      apiKey = data.apiKey;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is missing.');
      }
    } catch (err) {
      console.error('[LiveVoiceChat] Token fetch error:', err);
      stream.getTracks().forEach((t) => t.stop());
      setIsConnecting(false);
      setStatus('API Key Missing');
      setErrorMsg((err as Error).message || 'Failed to retrieve API Key');
      return;
    }

    // 4. Connect to Gemini Multimodal Live API WebSocket
    setStatus('Connecting to Gemini Multimodal Live API...');
    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnecting(false);
        setIsConnected(true);
        setStatus('Connected! Speaking with Despina...');
        setCallDuration(0);

        // Timer interval
        timerIntervalRef.current = setInterval(() => {
          setCallDuration((prev) => prev + 1);
        }, 1000);

        // Send Handshake Setup Payload
        const defaultPrompt =
          `You are Despina, a real, warm, empathetic AI therapeutic companion having an authentic live phone call with a friend. ` +
          `- Speak casually with human warmth, natural rhythm, and natural conversational pauses. ` +
          `- Keep responses concise (1 to 2 sentences max) so it feels like a real dialogue. ` +
          `- Do NOT read text formally or act like an AI assistant.`;

        // Try primary model (gemini-2.0-flash-exp / gemini-2.5-flash)
        const setupMessage = {
          setup: {
            model: 'models/gemini-2.0-flash-exp',
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Despina', // Smooth & Inviting female voice
                  },
                },
              },
            },
            systemInstruction: {
              parts: [
                {
                  text: systemInstructionText || defaultPrompt,
                },
              ],
            },
          },
        };

        ws.send(JSON.stringify(setupMessage));

        // Start Microphone Streaming
        startMicCapture(ws, stream);
      };

      ws.onmessage = async (event) => {
        try {
          const response = JSON.parse(event.data);

          // Handle interruption if user spoke over Despina
          if (response.serverContent?.interrupted) {
            stopAudioQueue();
          }

          // Handle incoming audio & text chunks from Gemini
          if (response.serverContent?.modelTurn?.parts) {
            let collectedText = '';

            for (const part of response.serverContent.modelTurn.parts) {
              if (part.text) {
                collectedText += part.text;
              }
              if (part.inlineData?.data) {
                playAudioChunk(part.inlineData.data);
              }
            }

            if (collectedText.trim()) {
              setMessages((prev) => [
                ...prev,
                {
                  id: `asst-${Date.now()}`,
                  role: 'assistant',
                  content: collectedText.trim(),
                  timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ]);
            }
          }
        } catch (e) {
          console.error('[LiveVoiceChat] Error parsing message:', e);
        }
      };

      ws.onclose = (event) => {
        cleanup();
        if (!event.wasClean && event.code !== 1000) {
          console.warn('[LiveVoiceChat] Connection closed abnormally:', event.code, event.reason);
          setStatus('Connection Closed');
          setErrorMsg(`Live Call disconnected (Code ${event.code}${event.reason ? `: ${event.reason}` : ''}). Please try again.`);
        } else {
          setStatus('Call Ended');
        }
      };

      ws.onerror = (err) => {
        console.error('[LiveVoiceChat] WebSocket error:', err);
        setErrorMsg('Live WebSocket connection encountered an error.');
        cleanup();
      };
    } catch (err) {
      console.error('[LiveVoiceChat] Connection initiation failed:', err);
      stream.getTracks().forEach((t) => t.stop());
      setIsConnecting(false);
      setStatus('Connection Failed');
      setErrorMsg('Failed to open WebSocket connection.');
    }
  };

  const endConversation = () => {
    cleanup();
    if (onSessionComplete) {
      onSessionComplete(messages.map((m) => ({ role: m.role, content: m.content })));
    }
  };

  // Component unmount cleanup
  useEffect(() => {
    return () => {
      cleanup();
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

      let dataArray = new Uint8Array(barCount);
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
          Despina Voice Companion
        </h3>
        <p style={{ fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', margin: 0 }}>
          Gemini Multimodal Live • Smooth &amp; Inviting
        </p>
      </div>

      {/* Real-time Spectrum Waveform */}
      <div style={{ width: '100%', height: 48, marginBottom: 24, display: 'flex', justifyContent: 'center' }}>
        <canvas ref={canvasRef} width={340} height={48} style={{ width: 340, height: 48 }} />
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
            disabled={isConnecting}
            style={{
              background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
              color: COLORS.white,
              border: 'none',
              borderRadius: 30,
              padding: '14px 32px',
              fontSize: 15,
              fontWeight: 800,
              fontFamily: 'var(--font-syne)',
              cursor: isConnecting ? 'not-allowed' : 'pointer',
              boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              opacity: isConnecting ? 0.7 : 1,
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
              onClick={endConversation}
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
              Live transcript captions will appear here as Despina speaks...
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} style={{ fontSize: 12, color: COLORS.textPrimary }}>
                <span style={{ fontWeight: 700, color: COLORS.blue }}>Despina: </span>
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
