'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type RecordingResult = {
  base64: string;
  mimeType: string;
  durationSeconds: number;
  /** Raw audio Blob — used by the acoustic feature extractor before upload. */
  blob: Blob;
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

export function useAudioRecorder({
  maxSeconds = 60,
  onComplete,
}: {
  maxSeconds?: number;
  onComplete?: (result: RecordingResult | null) => void;
} = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeRef = useRef<string>('audio/webm');
  const secondsRef = useRef(0);
  const stopResolveRef = useRef<((r: RecordingResult | null) => void) | null>(null);
  const stoppingRef = useRef(false);
  const cancelledRef = useRef(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const cleanupTimer = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  };

  // Stops the recorder safely. Idempotent — multiple calls are fine.
  // requestData() forces any buffered audio to fire `ondataavailable` before stop.
  const safeStopRecorder = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    try {
      if (rec.state === 'recording') {
        try {
          rec.requestData();
        } catch {
          // requestData may throw on some browsers; ignore and let stop() handle it
        }
        rec.stop();
      }
    } catch {
      // ignore
    }
  };

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone not available in this browser');
      return;
    }
    try {
      setError(null);
      cancelledRef.current = false;
      stoppingRef.current = false;
      secondsRef.current = 0;

      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = mediaStream;
      setStream(mediaStream);

      const mime = pickMimeType();
      mimeRef.current = mime;
      const recorder = new MediaRecorder(mediaStream, {
        mimeType: mime,
        audioBitsPerSecond: 64000,
      });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onerror = (e) => {
        // eslint-disable-next-line no-console
        console.error('MediaRecorder error:', e);
      };

      recorder.onstop = async () => {
        cleanupTimer();

        // Cancelled flow: throw away everything.
        if (cancelledRef.current) {
          chunksRef.current = [];
          stopStream();
          setIsRecording(false);
          stoppingRef.current = false;
          return;
        }

        let result: RecordingResult | null = null;
        try {
          if (chunksRef.current.length) {
            const blob = new Blob(chunksRef.current, { type: mimeRef.current });
            const base64 = await blobToBase64(blob);
            result = {
              base64,
              mimeType: mimeRef.current,
              durationSeconds: secondsRef.current,
              blob,
            };
          }
        } catch (err) {
          setError((err as Error).message || 'Failed to read recording');
        }

        stopStream();
        setIsRecording(false);
        stoppingRef.current = false;

        const resolve = stopResolveRef.current;
        stopResolveRef.current = null;
        if (resolve) {
          resolve(result);
        } else {
          onCompleteRef.current?.(result);
        }
      };

      recorderRef.current = recorder;
      // Use a 1-second timeslice so chunks flush every second.
      // Even if the final stop misbehaves, we still have ~all of the audio.
      recorder.start(1000);
      setIsRecording(true);
      setSeconds(0);

      tickRef.current = setInterval(() => {
        setSeconds((s) => {
          const next = s + 1;
          secondsRef.current = next;

          if (next >= maxSeconds) {
            // Stop the ticker first so we don't fire again while waiting on onstop.
            cleanupTimer();
            // Then stop the recorder (async — onstop will fire and deliver the result).
            safeStopRecorder();
            return maxSeconds;
          }
          return next;
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
      cleanupTimer();
      safeStopRecorder();
    });
  }, []);

  const cancel = useCallback(async () => {
    cleanupTimer();
    cancelledRef.current = true;
    stopResolveRef.current = null;
    safeStopRecorder();
    // If the recorder was already inactive, force cleanup
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      chunksRef.current = [];
      stopStream();
      setIsRecording(false);
      stoppingRef.current = false;
    }
    recorderRef.current = null;
    setSeconds(0);
  }, []);

  useEffect(() => {
    return () => {
      cleanupTimer();
      stopStream();
    };
  }, []);

  return { isRecording, seconds, error, start, stop, cancel, stream };
}
