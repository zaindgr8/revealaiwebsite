'use client';

/**
 * Despina Voice Synthesis Helper
 * Persona: Despina — Smooth & Inviting
 * Uses neural AI audio playback (/api/tts) for authentic, warm human voice sound.
 */

let currentAudio: HTMLAudioElement | null = null;

export async function speakDespina(text: string, onEnd?: () => void) {
  if (typeof window === 'undefined') return;

  // Stop any currently playing speech/audio
  stopDespina();

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

export function stopDespina() {
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

    let chosenVoice =
      naturalVoices.find((v) => v.name.toLowerCase().includes('despina')) ||
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
