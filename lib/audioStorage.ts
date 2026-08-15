'use client';
import { supabase } from './supabase';
import { REFERENCE_SECONDS, buildReferenceClip } from './audioTrim';

/**
 * Audio storage for the Intent Detector (migration 0004).
 *
 * Both buckets are private. Nothing here ever produces a public URL — these
 * are recordings of people who never signed up for this product, and a
 * guessable link to one is the worst failure this feature could have.
 */

export const ENROLLMENT_BUCKET = 'voice-enrollments';
export const RECORDING_BUCKET = 'intent-recordings';

/** I-1 requires at least 10 seconds of enrolled voice. */
export const MIN_ENROLLMENT_SECONDS = 10;

/**
 * How much of the stored sample is sent as a speaker reference.
 *
 * OpenAI's known_speaker_references[] wants 2-10 seconds. The stored sample is
 * longer (I-1 requires >= 10s), so a shorter clip is derived from it at
 * enrollment time by lib/audioTrim.ts and stored alongside.
 */
export const REFERENCE_CLIP_SECONDS = REFERENCE_SECONDS;

export type IntentScenario = 'date' | 'interview' | 'general';

export type IntentStatus =
  | 'draft'
  | 'awaiting_upload'
  | 'uploaded'
  | 'transcribing'
  | 'analysing'
  | 'complete'
  | 'insufficient_quality'
  | 'failed';

/** Terminal states. Anything else means work is outstanding. */
export const TERMINAL_STATUSES: IntentStatus[] = [
  'complete',
  'insufficient_quality',
  'failed',
];

export type VoiceEnrollment = {
  user_id: string;
  storage_path: string;
  duration_seconds: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
  /** Derived 2-10s clip actually sent to the transcription API (migration 0005). */
  reference_path: string | null;
  reference_duration_seconds: number | null;
  reference_offset_seconds: number | null;
};

export type IntentSession = {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  scenario: IntentScenario | null;
  consent_confirmed_at: string | null;
  storage_path: string | null;
  mime_type: string | null;
  duration_seconds: number | null;
  status: IntentStatus;
  error: string | null;
  transcript: unknown | null;
  analysis: unknown | null;
  attribution_confidence: number | null;
  other_speaker_name: string | null;
  /**
   * Legacy. The column still exists on intent_sessions from migration 0004 but
   * nothing writes it any more — automatic retention was removed on 15 August
   * 2026. Rows created before then still carry a date; it means nothing now.
   */
  expires_at: string | null;
  /** Ordered segment paths and durations (migration 0006). */
  segment_paths: string[] | null;
  segment_durations: number[] | null;
  /** True when the user flipped the speaker labels (migration 0007). */
  attribution_corrected: boolean;
  attribution_corrected_at: string | null;
};

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Not authenticated');
  return data.user.id;
}

function extensionFor(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'wav';
}

// ─────────────────────────────────────────────────────────────
// Enrollment (I-1, I-2)
// ─────────────────────────────────────────────────────────────

export async function getEnrollment(): Promise<VoiceEnrollment | null> {
  const { data, error } = await supabase
    .from('voice_enrollments')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VoiceEnrollment) ?? null;
}

/**
 * I-1 / I-2: store the user's voice sample, replacing any existing one.
 *
 * The storage path is stable per user and uploaded with upsert, so a
 * re-recording overwrites rather than accumulating copies of someone's voice.
 */
export async function uploadEnrollment(
  blob: Blob,
  durationSeconds: number
): Promise<VoiceEnrollment> {
  if (durationSeconds < MIN_ENROLLMENT_SECONDS) {
    throw new Error(
      `Please record at least ${MIN_ENROLLMENT_SECONDS} seconds so we can recognise your voice.`
    );
  }

  const userId = await currentUserId();
  const mimeType = blob.type || 'audio/webm';
  const path = `${userId}/enrollment.${extensionFor(mimeType)}`;

  // Derived before anything is uploaded. If the recording cannot produce a
  // valid reference — too short, mostly silence — the user finds out now,
  // while they are still on the recording screen and can simply try again.
  // Discovering it at transcription time means a conversation is already over.
  const reference = await buildReferenceClip(blob, REFERENCE_SECONDS);
  const referencePath = `${userId}/reference.wav`;

  const { error: uploadErr } = await supabase.storage
    .from(ENROLLMENT_BUCKET)
    .upload(path, blob, { contentType: mimeType, upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  const { error: refErr } = await supabase.storage
    .from(ENROLLMENT_BUCKET)
    .upload(referencePath, reference.blob, {
      contentType: 'audio/wav',
      upsert: true,
    });
  if (refErr) throw new Error(refErr.message);

  const { data, error } = await supabase
    .from('voice_enrollments')
    .upsert(
      {
        user_id: userId,
        storage_path: path,
        duration_seconds: durationSeconds,
        mime_type: mimeType,
        reference_path: referencePath,
        reference_duration_seconds: reference.durationSeconds,
        reference_offset_seconds: reference.offsetSeconds,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  return data as VoiceEnrollment;
}

/** N-4. Removes the row and the stored audio. */
export async function deleteEnrollment(): Promise<void> {
  const existing = await getEnrollment();
  if (!existing) return;

  // Both objects. N-2 requires the audio to be gone from storage, and a
  // derived clip is still a recording of the person's voice.
  const paths = [existing.storage_path];
  if (existing.reference_path) paths.push(existing.reference_path);

  const { error: storageErr } = await supabase.storage
    .from(ENROLLMENT_BUCKET)
    .remove(paths);
  if (storageErr) throw new Error(storageErr.message);

  const { error } = await supabase
    .from('voice_enrollments')
    .delete()
    .eq('user_id', existing.user_id);
  if (error) throw new Error(error.message);
}

/** Short-lived signed URL. Never a public link. */
export async function getEnrollmentUrl(expiresInSeconds = 300): Promise<string | null> {
  const existing = await getEnrollment();
  if (!existing) return null;
  const { data, error } = await supabase.storage
    .from(ENROLLMENT_BUCKET)
    .createSignedUrl(existing.storage_path, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}

/**
 * True when this enrollment predates migration 0005 and has no derived clip.
 *
 * Such a row cannot be used for attribution. The user has to re-record, which
 * is a far better outcome than sending an out-of-spec reference and getting
 * quietly wrong speaker labels.
 */
export function needsReRecording(enrollment: VoiceEnrollment | null): boolean {
  return Boolean(enrollment && !enrollment.reference_path);
}

// ─────────────────────────────────────────────────────────────
// Sessions (I-3, I-4, I-7, I-9)
// ─────────────────────────────────────────────────────────────

/** I-3: the scenario is chosen and stored before recording begins. */
export async function createIntentSession(
  scenario: IntentScenario
): Promise<IntentSession> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('intent_sessions')
    .insert({ user_id: userId, scenario, status: 'draft' })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as IntentSession;
}

/**
 * I-4: recording cannot begin without explicit confirmation.
 *
 * The timestamp is the record that consent was given, and moving out of
 * 'draft' is what the recording UI gates on. Consent is deliberately stored
 * rather than held in component state — if this is ever questioned, "the user
 * clicked a button we did not persist" is not an answer.
 */
export async function confirmConsent(sessionId: string): Promise<IntentSession> {
  const { data, error } = await supabase
    .from('intent_sessions')
    .update({
      consent_confirmed_at: new Date().toISOString(),
      status: 'awaiting_upload',
    })
    .eq('id', sessionId)
    .eq('status', 'draft')
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data as IntentSession;
}

export async function getIntentSession(id: string): Promise<IntentSession | null> {
  const { data, error } = await supabase
    .from('intent_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntentSession) ?? null;
}

/** I-7: results retrievable after logout and login. */
export async function getIntentSessions(limit = 30): Promise<IntentSession[]> {
  const { data, error } = await supabase
    .from('intent_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as IntentSession[];
}

/**
 * Flips which speaker is the user.
 *
 * Attribution is the one failure here that is silent. If the labels come back
 * reversed, the user reads an analysis of themselves believing it describes the
 * other person, and nothing on screen hints at it. Everywhere else the product
 * declines rather than guesses (I-7); this is the case where it cannot tell it
 * has guessed, so the user gets the final say instead.
 *
 * The correction is also recorded, because the proportion of sessions users
 * have to flip is the only continuous measurement of I-4 accuracy in real use.
 * Pre-launch verification against hand-labelled audio does not scale and says
 * nothing about noisy rooms.
 */
export async function swapSpeakerAttribution(sessionId: string): Promise<IntentSession> {
  const session = await getIntentSession(sessionId);
  if (!session) throw new Error('Session not found');

  const transcript = session.transcript as {
    segments?: { isEnrolled?: boolean }[];
    enrolled_share?: number;
  } | null;

  if (!transcript?.segments?.length) {
    throw new Error('There is no transcript to correct yet.');
  }

  const segments = transcript.segments.map((s) => ({ ...s, isEnrolled: !s.isEnrolled }));

  // Any existing analysis is now describing the wrong person — every finding
  // about "them" was drawn from lines that turn out to be the user's own. That
  // is worse than having no analysis, so it is discarded and the session drops
  // back to 'analysing' to be redone against the corrected labels. The result
  // page already promises the user exactly this.
  const { data, error } = await supabase
    .from('intent_sessions')
    .update({
      transcript: {
        ...transcript,
        segments,
        enrolled_share:
          typeof transcript.enrolled_share === 'number'
            ? 1 - transcript.enrolled_share
            : undefined,
      },
      analysis: null,
      summary: null,
      status: session.status === 'complete' ? 'analysing' : session.status,
      attribution_corrected: true,
      attribution_corrected_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  return data as IntentSession;
}

/** I-9: naming the other speaker. Presentational only. */
export async function nameOtherSpeaker(
  sessionId: string,
  name: string
): Promise<void> {
  const { error } = await supabase
    .from('intent_sessions')
    .update({ other_speaker_name: name.trim() || null })
    .eq('id', sessionId);
  if (error) throw new Error(error.message);
}

/** N-4. Removes the recording and the session row. */
export async function deleteIntentSession(sessionId: string): Promise<void> {
  const session = await getIntentSession(sessionId);
  if (!session) return;

  if (session.storage_path) {
    const { error: storageErr } = await supabase.storage
      .from(RECORDING_BUCKET)
      .remove([session.storage_path]);
    // A missing object must not block the row delete, or a half-cleaned
    // session becomes undeletable and the user can never get rid of it.
    if (storageErr) {
      console.error('[audioStorage] could not remove recording:', storageErr.message);
    }
  }

  const { error } = await supabase.from('intent_sessions').delete().eq('id', sessionId);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// Upload (N-7)
// ─────────────────────────────────────────────────────────────

export type UploadProgress =
  | { phase: 'uploading'; attempt: number }
  | { phase: 'retrying'; attempt: number; error: string }
  | { phase: 'done' };

const MAX_UPLOAD_ATTEMPTS = 3;

/**
 * N-7: upload without losing the recording on failure.
 *
 * The caller keeps the Blob. This function never consumes or discards it, so a
 * failure can be retried with the same object rather than sending the user
 * back to re-record a conversation that cannot be re-created.
 *
 * On exhausted retries the session is marked 'failed' rather than left mid-
 * flight, because 'failed' is a state the UI can offer a retry from. A session
 * stuck in 'awaiting_upload' looks identical to one still in progress.
 */
export async function uploadRecording({
  sessionId,
  blob,
  durationSeconds,
  onProgress,
}: {
  sessionId: string;
  blob: Blob;
  durationSeconds: number;
  onProgress?: (p: UploadProgress) => void;
}): Promise<IntentSession> {
  const userId = await currentUserId();
  const mimeType = blob.type || 'audio/webm';
  const path = `${userId}/${sessionId}.${extensionFor(mimeType)}`;

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
    onProgress?.({ phase: 'uploading', attempt });

    const { error } = await supabase.storage
      .from(RECORDING_BUCKET)
      .upload(path, blob, { contentType: mimeType, upsert: true });

    if (!error) {
      const { data, error: rowErr } = await supabase
        .from('intent_sessions')
        .update({
          storage_path: path,
          mime_type: mimeType,
          duration_seconds: durationSeconds,
          status: 'uploaded',
          error: null,
        })
        .eq('id', sessionId)
        .select('*')
        .single();
      if (rowErr) throw new Error(rowErr.message);

      onProgress?.({ phase: 'done' });
      return data as IntentSession;
    }

    lastError = error.message;
    if (attempt < MAX_UPLOAD_ATTEMPTS) {
      onProgress?.({ phase: 'retrying', attempt, error: lastError });
      await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
    }
  }

  await supabase
    .from('intent_sessions')
    .update({ status: 'failed', error: `Upload failed: ${lastError}` })
    .eq('id', sessionId);

  throw new Error(
    `Could not upload the recording after ${MAX_UPLOAD_ATTEMPTS} attempts. ` +
      `Your recording has not been lost — you can retry. (${lastError})`
  );
}

/**
 * N-7 for segmented recordings.
 *
 * Uploads each segment, then records all of them in one row update. The row is
 * written only after every segment is stored, so a partial upload never leaves
 * a session claiming audio it does not have — the client still holds the blobs
 * and can retry the whole set.
 */
export async function uploadRecordingSegments({
  sessionId,
  segments,
  onProgress,
}: {
  sessionId: string;
  segments: { blob: Blob; mimeType: string; durationSeconds: number }[];
  onProgress?: (done: number, total: number) => void;
}): Promise<IntentSession> {
  if (segments.length === 0) throw new Error('No audio was recorded.');

  const userId = await currentUserId();
  const paths: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const path = `${userId}/${sessionId}/seg-${String(i).padStart(3, '0')}.${extensionFor(seg.mimeType)}`;

    let lastError = '';
    let ok = false;
    for (let attempt = 1; attempt <= MAX_UPLOAD_ATTEMPTS; attempt++) {
      const { error } = await supabase.storage
        .from(RECORDING_BUCKET)
        .upload(path, seg.blob, { contentType: seg.mimeType, upsert: true });
      if (!error) {
        ok = true;
        break;
      }
      lastError = error.message;
      if (attempt < MAX_UPLOAD_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
      }
    }

    if (!ok) {
      await supabase
        .from('intent_sessions')
        .update({ status: 'failed', error: `Upload failed on segment ${i + 1}: ${lastError}` })
        .eq('id', sessionId);
      throw new Error(
        `Could not upload segment ${i + 1} of ${segments.length}. ` +
          `Your recording has not been lost — you can retry. (${lastError})`
      );
    }

    paths.push(path);
    onProgress?.(i + 1, segments.length);
  }

  const totalDuration = segments.reduce((s, x) => s + x.durationSeconds, 0);

  const { data, error } = await supabase
    .from('intent_sessions')
    .update({
      segment_paths: paths,
      segment_durations: segments.map((s) => s.durationSeconds),
      mime_type: segments[0].mimeType,
      duration_seconds: totalDuration,
      status: 'uploaded',
      error: null,
    })
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  return data as IntentSession;
}

/** Kicks off server-side processing. Returns immediately; poll the session for status. */
export async function startProcessing(sessionId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  const res = await fetch('/api/intent/process', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Could not start processing');
}

/**
 * I-5. Runs the analysis over a transcript that is already stored.
 *
 * Separate from startProcessing because the two halves fail independently: a
 * session can have a perfectly good transcript and a failed analysis, and that
 * should cost one retry of the cheap half rather than re-transcribing the audio.
 */
export async function startAnalysis(sessionId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token ?? '';
  const res = await fetch('/api/intent/analyse', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Could not start the analysis');
}

/** Short-lived signed URL for playback or for handing to a processing job. */
export async function getRecordingUrl(
  session: IntentSession,
  expiresInSeconds = 600
): Promise<string | null> {
  if (!session.storage_path) return null;
  const { data, error } = await supabase.storage
    .from(RECORDING_BUCKET)
    .createSignedUrl(session.storage_path, expiresInSeconds);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}
