'use client';
import { useMemo, useRef, useState } from 'react';
import { COLORS } from '@/lib/theme';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { updateTherapistVoice } from '@/lib/profile';
import { VOICES, resolveVoice } from '@/lib/voices';

/**
 * Lets the user choose which of Google's prebuilt voices Elena speaks with on
 * a live call.
 *
 * The sample is played from /api/voice-preview, not /api/tts, because only the
 * preview route uses the same voice list as the call itself. A preview that
 * sounded like a different voice than the call would be actively misleading.
 */
export function TherapistVoicePicker() {
  const { user, profile, refreshProfile } = useAuth();

  const saved = useMemo(() => resolveVoice(profile?.therapist_voice), [profile]);
  const [selected, setSelected] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const dirty = selected !== saved;

  const stopPreview = () => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const playPreview = async () => {
    setError(null);
    setMessage(null);
    stopPreview();
    setPreviewing(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? '';
      const res = await fetch('/api/voice-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ voice: selected }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ error: '' }));
        throw new Error(detail.error || 'Could not play this voice');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        setPreviewing(false);
        stopPreview();
      };
      await audio.play();
    } catch (err) {
      setPreviewing(false);
      setError((err as Error).message);
    }
  };

  const save = async () => {
    if (!user?.id || !dirty) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateTherapistVoice(user.id, selected);
      await refreshProfile();
      setMessage('Saved. Elena will use this voice on your next call.');
    } catch (err) {
      setError((err as Error).message || 'Could not save your choice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '0 2px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <select
          value={selected}
          onChange={(e) => {
            stopPreview();
            setPreviewing(false);
            setSelected(e.target.value);
            setMessage(null);
            setError(null);
          }}
          style={{
            flex: 1,
            minWidth: 180,
            padding: '10px 12px',
            borderRadius: 12,
            border: `1px solid ${COLORS.cardBorder}`,
            background: COLORS.card,
            color: COLORS.textPrimary,
            fontSize: 14,
            fontFamily: 'var(--font-dm)',
          }}
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id} — {v.tone}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={playPreview}
          disabled={previewing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 12,
            border: `1px solid ${COLORS.cardBorder}`,
            background: COLORS.surface,
            color: COLORS.textPrimary,
            fontSize: 13,
            fontWeight: 700,
            cursor: previewing ? 'not-allowed' : 'pointer',
            opacity: previewing ? 0.6 : 1,
          }}
        >
          <Icon name="mic" size={15} color={COLORS.textPrimary} />
          <span>{previewing ? 'Playing...' : 'Hear it'}</span>
        </button>

        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          style={{
            padding: '10px 18px',
            borderRadius: 12,
            border: 'none',
            background: `linear-gradient(135deg, ${COLORS.gradientStart}, ${COLORS.gradientEnd})`,
            color: COLORS.white,
            fontSize: 13,
            fontWeight: 800,
            fontFamily: 'var(--font-syne)',
            cursor: !dirty || saving ? 'not-allowed' : 'pointer',
            opacity: !dirty || saving ? 0.4 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {message && (
        <div style={{ fontSize: 12, color: COLORS.success, marginTop: 10 }}>{message}</div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: COLORS.danger, marginTop: 10 }}>{error}</div>
      )}
    </div>
  );
}
