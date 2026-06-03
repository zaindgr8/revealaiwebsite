'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordingResult = {
  base64: string;
  mimeType: string;
  durationSeconds: number;
};

function pickMimeType(): string {
  if (typeof window === 'undefined' || !('MediaRecorder' in window)) return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

export function useAudioRecorder({ maxSeconds = 60 }: { maxSeconds?: number } = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>('audio/webm');
  const secondsRef = useRef(0);
  const stopResolveRef = useRef<((r: RecordingResult | null) => void) | null>(null);

  useEffect(() => {
    secondsRef.current = seconds;
  }, [seconds]);

  const cleanupTimer = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not available in this browser');
      return;
    }
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mime = pickMimeType();
      mimeRef.current = mime;
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 64000 });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        cleanupTimer();
        stopStream();
        setIsRecording(false);
        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        try {
          if (!chunksRef.current.length) {
            resolve?.(null);
            return;
          }
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          const base64 = await blobToBase64(blob);
          resolve?.({
            base64,
            mimeType: mimeRef.current,
            durationSeconds: secondsRef.current,
          });
        } catch (err) {
          setError((err as Error).message || 'Failed to read recording');
          resolve?.(null);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setSeconds(0);

      tickRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) {
            if (recorderRef.current && recorderRef.current.state === 'recording') {
              recorderRef.current.stop();
            }
            return maxSeconds;
          }
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setError((e as Error).message || 'Microphone permission denied');
      setIsRecording(false);
      stopStream();
    }
  }, [maxSeconds]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    return new Promise((resolve) => {
      const rec = recorderRef.current;
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        return;
      }
      stopResolveRef.current = resolve;
      rec.stop();
    });
  }, []);

  const cancel = useCallback(async () => {
    cleanupTimer();
    const rec = recorderRef.current;
    chunksRef.current = [];
    stopResolveRef.current = null;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {}
    }
    stopStream();
    recorderRef.current = null;
    setIsRecording(false);
    setSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanupTimer();
      stopStream();
    };
  }, []);

  return { isRecording, seconds, error, start, stop, cancel };
}
