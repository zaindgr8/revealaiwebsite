'use client';

/**
 * Elena Voice Synthesis Helper
 * Persona: Elena, the therapist named everywhere else in the product.
 * The file and the functions used to say 'Despina', which is a Google voice
 * id and not a character — it made the persona look like two people.
 * Uses neural AI audio playback (/api/tts) for authentic, warm human voice sound.
 */

let currentAudio: HTMLAudioElement | null = null;

export async function speakElena(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined') return;

  // Stop any currently playing speech/audio
  stopElena();

  try {
    // 1. Try neural AI speech API for authentic human audio
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        if (onEnd) onEnd();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        fallbackWebSpeech(text, onEnd);
      };

      await audio.play();
      return;
    }
  } catch (err) {
    console.warn('[despinaVoice] Neural TTS API call failed, falling back to browser speech:', err);
  }

  // 2. Fallback to Web Speech API (filtering for Premium / Enhanced / Natural neural voices)
  fallbackWebSpeech(text, onEnd);
}

export function stopElena() {
  if (typeof window === 'undefined') return;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function fallbackWebSpeech(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);

  utterance.rate = 0.94;
  utterance.pitch = 1.03;
  utterance.volume = 1.0;

  const setVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || !voices.length) return;

    // Filter out old robotic system voices
    const naturalVoices = voices.filter(
      (v) =>
        v.name.includes('Enhanced') ||
        v.name.includes('Premium') ||
        v.name.includes('Natural') ||
        v.name.includes('Online') ||
        v.name.includes('Google') ||
        v.name.includes('Siri')
    );

    // The first lookup here searched the browser's voice list for 'despina'.
    // No browser ships a voice by that name — it is a Google Live API id — so
    // the branch never matched. Removed rather than renamed: 'elena' would not
    // match either.
    const chosenVoice =
      naturalVoices.find(
        (v) =>
          v.name.includes('Samantha') ||
          v.name.includes('Ava') ||
          v.name.includes('Karen') ||
          v.name.includes('Victoria') ||
          v.name.includes('Serena') ||
          v.name.includes('Zira') ||
          v.name.includes('Google')
      ) ||
      naturalVoices[0] ||
      voices.find((v) => v.lang.startsWith('en'));

    if (chosenVoice) {
      utterance.voice = chosenVoice;
    }
  };

  setVoice();

  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = setVoice;
  }

  if (onEnd) {
    utterance.onend = onEnd;
  }

  window.speechSynthesis.speak(utterance);
}
