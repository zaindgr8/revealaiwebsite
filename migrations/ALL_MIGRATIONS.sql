-- ============================================================
-- Reveal AI — all pending migrations, in order.
-- Generated 2026-08-06 13:36 UTC
--
-- Paste into the Supabase SQL Editor and run once.
--
-- SAFETY: no destructive statements. Every column is ADD COLUMN IF NOT
-- EXISTS; every NOT NULL has a DEFAULT; every CHECK permits NULL.
-- Re-running is safe.
-- ============================================================


-- ============================================================
-- 0001_add_narrative_readiness_columns.sql
-- ============================================================

-- 0001_add_narrative_readiness_columns.sql
--
-- Fixes the data persistence bug.
--
-- app/api/analyze-mood/route.ts builds sessionData containing narrative_type,
-- readiness_score and readiness_note. None of the three existed on
-- therapy_sessions, so PostgREST rejected every insert with 42703 and the
-- error was discarded at route.ts:535 while the endpoint returned 200.
--
-- Net effect: users saw a complete results screen and nothing was ever saved,
-- which is why Profile History and Trends appeared empty.
--
-- Confirmed 5 Aug 2026 by probing the live schema:
--   narrative_type  -> column therapy_sessions.narrative_type does not exist
--   readiness_score -> column therapy_sessions.readiness_score does not exist
--   readiness_note  -> column therapy_sessions.readiness_note does not exist
--
-- All other columns written by that route already existed.

alter table public.therapy_sessions
  add column if not exists narrative_type  text,
  add column if not exists readiness_score integer,
  add column if not exists readiness_note  text;

-- narrative_type is constrained to the values the model is allowed to return.
-- See SCHEMA_BLOCK in app/api/analyze-mood/route.ts.
alter table public.therapy_sessions
  drop constraint if exists therapy_sessions_narrative_type_check;

alter table public.therapy_sessions
  add constraint therapy_sessions_narrative_type_check
  check (narrative_type is null
         or narrative_type in ('past', 'present', 'future', 'mixed'));

-- readiness_score is only meaningful for future/mixed narratives and is
-- explicitly null otherwise, so it is nullable but range-checked when present.
alter table public.therapy_sessions
  drop constraint if exists therapy_sessions_readiness_score_check;

alter table public.therapy_sessions
  add constraint therapy_sessions_readiness_score_check
  check (readiness_score is null
         or (readiness_score >= 0 and readiness_score <= 100));

-- Profile History (T-5) reads newest-first per user and must load in under
-- 2 seconds with 100 sessions stored.
create index if not exists therapy_sessions_user_created_idx
  on public.therapy_sessions (user_id, created_at desc);


-- ============================================================
-- 0002_chat_sessions_and_messages.sql
-- ============================================================

-- 0002_chat_sessions_and_messages.sql
--
-- Schema for Feature 1: AI Chat Therapist with memory (PRD T-1 to T-8).
--
-- Today the chat holds messages in React state and the check-in context in
-- sessionStorage. Nothing is written to the database, so closing the tab loses
-- the conversation and the therapist has no memory between sessions.
--
-- coach_sessions already exists but only has id, user_id and created_at. It is
-- extended here rather than replaced, so the existing table and any RLS on it
-- stay intact.
--
-- Supports:
--   T-1  messages persist, linked to the user
--   T-4  a structured record (summary, mood, topics) written on session end
--   T-5  Profile History listed newest-first, under 2s at 100 sessions
--   T-7  per-message crisis flag

-- ─────────────────────────────────────────────────────────────
-- coach_sessions — one row per chat conversation
-- ─────────────────────────────────────────────────────────────

alter table public.coach_sessions
  add column if not exists ended_at       timestamptz,
  add column if not exists summary        text,
  add column if not exists mood_score     integer,
  add column if not exists topics         text[],
  add column if not exists message_count  integer not null default 0,
  add column if not exists crisis_flagged boolean not null default false;

-- Mood is expressed on the same 0-100 scale as therapy_sessions.mood_score so
-- the two can be charted on one axis in Profile History.
alter table public.coach_sessions
  drop constraint if exists coach_sessions_mood_score_check;

alter table public.coach_sessions
  add constraint coach_sessions_mood_score_check
  check (mood_score is null
         or (mood_score >= 0 and mood_score <= 100));

-- T-5: newest-first per user is the only read pattern this table has.
create index if not exists coach_sessions_user_created_idx
  on public.coach_sessions (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- chat_messages — one row per message, the T-1 requirement
-- ─────────────────────────────────────────────────────────────

create table if not exists public.chat_messages (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null
                             references public.coach_sessions (id) on delete cascade,
  user_id        uuid        not null
                             references auth.users (id) on delete cascade,
  role           text        not null check (role in ('user', 'assistant')),
  content        text        not null,
  -- T-7: set when the crisis classifier flags a user message. Stored so the
  -- escalation path is auditable against the T-8 test set rather than only
  -- visible at runtime.
  crisis_flagged boolean     not null default false,
  created_at     timestamptz not null default now()
);

-- Messages are always read as a whole conversation in chronological order.
create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

-- Used to review flagged messages across all users during T-8 verification.
create index if not exists chat_messages_crisis_idx
  on public.chat_messages (created_at desc)
  where crisis_flagged;

-- ─────────────────────────────────────────────────────────────
-- Row level security
--
-- Same shape as therapy_sessions: a user reaches their own rows and nothing
-- else. Policies are dropped first so this file can be re-run safely.
-- ─────────────────────────────────────────────────────────────

alter table public.coach_sessions enable row level security;
alter table public.chat_messages  enable row level security;

drop policy if exists "own coach sessions select" on public.coach_sessions;
drop policy if exists "own coach sessions insert" on public.coach_sessions;
drop policy if exists "own coach sessions update" on public.coach_sessions;
drop policy if exists "own coach sessions delete" on public.coach_sessions;

create policy "own coach sessions select" on public.coach_sessions
  for select using (auth.uid() = user_id);

create policy "own coach sessions insert" on public.coach_sessions
  for insert with check (auth.uid() = user_id);

create policy "own coach sessions update" on public.coach_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own coach sessions delete" on public.coach_sessions
  for delete using (auth.uid() = user_id);

drop policy if exists "own chat messages select" on public.chat_messages;
drop policy if exists "own chat messages insert" on public.chat_messages;
drop policy if exists "own chat messages delete" on public.chat_messages;

create policy "own chat messages select" on public.chat_messages
  for select using (auth.uid() = user_id);

-- Checking auth.uid() = user_id alone is not enough. The message_count trigger
-- below runs as security definer and therefore bypasses RLS, so a user could
-- insert a row carrying their own user_id but someone else's session_id and
-- drive up that person's counter. Ownership of the parent session is verified
-- here so that cannot happen.
create policy "own chat messages insert" on public.chat_messages
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.coach_sessions s
       where s.id = session_id
         and s.user_id = auth.uid()
    )
  );

-- Deliberately no UPDATE policy. A therapy transcript is a record; it is
-- appended to and deleted, never rewritten.
create policy "own chat messages delete" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- message_count upkeep
--
-- Denormalised so the Profile History list never counts rows per session,
-- which is what would break the 2-second target at 100 sessions.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_coach_session_message_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.coach_sessions
       set message_count = message_count + 1
     where id = new.session_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.coach_sessions
       set message_count = greatest(message_count - 1, 0)
     where id = old.session_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists chat_messages_count_trigger on public.chat_messages;

create trigger chat_messages_count_trigger
  after insert or delete on public.chat_messages
  for each row execute function public.bump_coach_session_message_count();

-- This function is SECURITY DEFINER, which means it runs with the owner's
-- privileges and bypasses RLS. Postgres grants EXECUTE to PUBLIC by default,
-- and anon / authenticated inherit from PUBLIC — so without this revoke it is
-- a privileged, publicly callable endpoint sitting in an exposed schema.
--
-- Calling it outside a trigger would fail on the missing TG_OP rather than do
-- damage, but a SECURITY DEFINER function should never be left callable by
-- default regardless of whether today's body happens to be harmless.
revoke execute on function public.bump_coach_session_message_count() from public;


-- ============================================================
-- 0003_coach_session_source.sql
-- ============================================================

-- 0003_coach_session_source.sql
--
-- Distinguishes the two chat surfaces that both write to coach_sessions.
--
-- There are two conversations in this product:
--
--   'chat'    — the standalone /chat route. A therapy conversation in its own
--               right, and its own row in Profile History.
--
--   'checkin' — the inline conversation inside the voice check-in flow
--               (app/therapy/page.tsx). Its questions and answers are fed into
--               the check-in analysis and end up on the therapy_sessions row.
--
-- T-1 requires ALL chat messages to persist, so the check-in conversation must
-- be stored too. But it must not also appear as a separate history entry —
-- one check-in would then show as two rows, a check-in and a conversation,
-- for a single thing the user did once.
--
-- So: everything is stored, and Profile History filters to source = 'chat'.

alter table public.coach_sessions
  add column if not exists source text not null default 'chat';

alter table public.coach_sessions
  drop constraint if exists coach_sessions_source_check;

alter table public.coach_sessions
  add constraint coach_sessions_source_check
  check (source in ('chat', 'checkin'));

-- Profile History reads newest-first filtered by source, so the index needs
-- source ahead of the sort key.
create index if not exists coach_sessions_source_created_idx
  on public.coach_sessions (user_id, source, created_at desc);


-- ============================================================
-- 0004_audio_storage.sql
-- ============================================================

-- 0004_audio_storage.sql
--
-- The audio storage layer for Feature 2 (Intent Detector).
--
-- This product has never stored an audio file. Check-ins are analysed and the
-- recording is discarded — Settings says so to the user, and the only bucket
-- that exists is `avatars`. Everything below is new.
--
-- Covers PRD requirements:
--   I-1  enrollment sample stored and retrievable, encrypted at rest
--   I-2  a new sample replaces the old one
--   I-3  scenario stored with the session
--   I-4  consent recorded before recording may begin
--   I-7  results retrievable after logout and login
--   I-8  a low-confidence result is withheld rather than shown
--   I-9  the other speaker can be named after the fact
--   N-1  encrypted at rest and in transit
--   N-4  the user can delete their sample and any recording
--   N-5  a retention period after which recordings are deleted
--   N-7  upload and processing failure without losing the recording
--   N-8  processing runs as a background job with visible status
--
-- ON N-1, ENCRYPTION
-- Supabase Storage encrypts objects at rest (AES-256) and serves them over
-- TLS, and both buckets below are private with signed-URL access only. That
-- satisfies N-1 as written. Application-layer encryption on top would prevent
-- the transcription vendor from reading the file without a decrypt-and-forward
-- step, and would break playback. If the client wants envelope encryption with
-- customer-managed keys, that is a different requirement and a different
-- estimate — raise it before building.

-- ─────────────────────────────────────────────────────────────
-- Buckets
--
-- Both private. Access is via short-lived signed URLs, never public links —
-- these are recordings of people who are not users of this product.
-- ─────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('voice-enrollments', 'voice-enrollments', false, 5242880,
   array['audio/wav','audio/webm','audio/mpeg','audio/mp4','audio/ogg']),
  ('intent-recordings', 'intent-recordings', false, 209715200,
   array['audio/wav','audio/webm','audio/mpeg','audio/mp4','audio/ogg'])
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────
-- Storage RLS
--
-- Path convention is {user_id}/... for both buckets, so the first path segment
-- is the owner and is compared against auth.uid().
-- ─────────────────────────────────────────────────────────────

drop policy if exists "own enrollment read"   on storage.objects;
drop policy if exists "own enrollment write"  on storage.objects;
drop policy if exists "own enrollment update" on storage.objects;
drop policy if exists "own enrollment delete" on storage.objects;
drop policy if exists "own recording read"    on storage.objects;
drop policy if exists "own recording write"   on storage.objects;
drop policy if exists "own recording update"  on storage.objects;
drop policy if exists "own recording delete"  on storage.objects;

-- Every policy below is scoped TO authenticated. Without it the predicate is
-- still evaluated for the anon role, where auth.uid() is null — which is a
-- comparison that can never match but is checked on every request anyway.
-- Naming the role also makes the intent explicit rather than implied.

create policy "own enrollment read" on storage.objects
  for select to authenticated using (
    bucket_id = 'voice-enrollments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "own enrollment write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'voice-enrollments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- I-2: re-recording overwrites in place, which needs UPDATE as well as INSERT.
--
-- WITH CHECK is not optional here. USING alone controls which rows may be
-- updated; WITH CHECK controls what they may be updated TO. Without it a user
-- could rename their own object into another user's folder, since the path
-- prefix is the ownership check.
create policy "own enrollment update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'voice-enrollments'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'voice-enrollments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- N-4
create policy "own enrollment delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'voice-enrollments'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "own recording read" on storage.objects
  for select to authenticated using (
    bucket_id = 'intent-recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "own recording write" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'intent-recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Required, and its absence was a real bug.
--
-- uploadRecordingSegments() uploads with upsert: true, and N-3's whole point
-- is that a failed upload can be retried. A retry re-uploads to the same path,
-- which is an UPDATE — and with no UPDATE policy Supabase Storage fails that
-- silently. The recovery path would have been broken in exactly the situation
-- it exists for.
create policy "own recording update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'intent-recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'intent-recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "own recording delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'intent-recordings'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────────────────────────
-- voice_enrollments (I-1, I-2)
--
-- user_id is the primary key: one enrollment per person. I-2 says a new
-- sample replaces the old, so this is an upsert target rather than a log.
-- ─────────────────────────────────────────────────────────────

create table if not exists public.voice_enrollments (
  user_id          uuid        primary key references auth.users (id) on delete cascade,
  storage_path     text        not null,
  duration_seconds numeric     not null,
  mime_type        text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- I-1 requires at least 10 seconds. OpenAI's known_speaker_references wants
  -- a 2-10s clip, so the stored sample is longer than the reference sent with
  -- each request and gets trimmed at call time. Enforced here so a too-short
  -- sample cannot be stored and silently fail attribution later.
  constraint voice_enrollments_duration_check check (duration_seconds >= 10)
);

alter table public.voice_enrollments enable row level security;

drop policy if exists "own enrollment row select" on public.voice_enrollments;
drop policy if exists "own enrollment row upsert" on public.voice_enrollments;
drop policy if exists "own enrollment row update" on public.voice_enrollments;
drop policy if exists "own enrollment row delete" on public.voice_enrollments;

create policy "own enrollment row select" on public.voice_enrollments
  for select using (auth.uid() = user_id);
create policy "own enrollment row upsert" on public.voice_enrollments
  for insert with check (auth.uid() = user_id);
create policy "own enrollment row update" on public.voice_enrollments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own enrollment row delete" on public.voice_enrollments
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- intent_sessions
--
-- The table already exists with id, user_id, created_at, summary and context,
-- but nothing else. Extended rather than replaced.
-- ─────────────────────────────────────────────────────────────

alter table public.intent_sessions
  add column if not exists scenario            text,
  add column if not exists consent_confirmed_at timestamptz,
  add column if not exists storage_path        text,
  add column if not exists mime_type           text,
  add column if not exists duration_seconds    numeric,
  add column if not exists status              text not null default 'draft',
  add column if not exists error               text,
  add column if not exists transcript          jsonb,
  add column if not exists analysis            jsonb,
  add column if not exists attribution_confidence numeric,
  add column if not exists other_speaker_name  text,
  add column if not exists expires_at          timestamptz,
  add column if not exists updated_at          timestamptz not null default now();

-- I-3: one of exactly three scenarios, stored with the session.
alter table public.intent_sessions
  drop constraint if exists intent_sessions_scenario_check;
alter table public.intent_sessions
  add constraint intent_sessions_scenario_check
  check (scenario is null or scenario in ('date', 'interview', 'general'));

-- N-8: status is the background job's visible state, and N-7 depends on it
-- being explicit enough to resume from. 'insufficient_quality' is I-8 — a
-- terminal state that is NOT an error, because declining to answer is the
-- correct outcome for a poor recording, not a failure.
alter table public.intent_sessions
  drop constraint if exists intent_sessions_status_check;
alter table public.intent_sessions
  add constraint intent_sessions_status_check
  check (status in (
    'draft',                 -- created, consent not yet given
    'awaiting_upload',       -- consent given, recording in progress or pending upload
    'uploaded',              -- audio safely stored
    'transcribing',
    'analysing',
    'complete',
    'insufficient_quality',  -- I-8
    'failed'                 -- N-7: retryable, audio is still in storage
  ));

alter table public.intent_sessions
  drop constraint if exists intent_sessions_confidence_check;
alter table public.intent_sessions
  add constraint intent_sessions_confidence_check
  check (attribution_confidence is null
         or (attribution_confidence >= 0 and attribution_confidence <= 1));

alter table public.intent_sessions enable row level security;

drop policy if exists "own intent select" on public.intent_sessions;
drop policy if exists "own intent insert" on public.intent_sessions;
drop policy if exists "own intent update" on public.intent_sessions;
drop policy if exists "own intent delete" on public.intent_sessions;

create policy "own intent select" on public.intent_sessions
  for select using (auth.uid() = user_id);
create policy "own intent insert" on public.intent_sessions
  for insert with check (auth.uid() = user_id);
create policy "own intent update" on public.intent_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own intent delete" on public.intent_sessions
  for delete using (auth.uid() = user_id);

-- I-7: results are read newest-first per user.
create index if not exists intent_sessions_user_created_idx
  on public.intent_sessions (user_id, created_at desc);

-- N-5: the retention sweep scans by expiry across all users.
create index if not exists intent_sessions_expires_idx
  on public.intent_sessions (expires_at)
  where expires_at is not null;

-- N-7: finding sessions stuck mid-processing so they can be resumed.
create index if not exists intent_sessions_status_idx
  on public.intent_sessions (status, updated_at)
  where status in ('awaiting_upload', 'uploaded', 'transcribing', 'analysing');

-- ─────────────────────────────────────────────────────────────
-- updated_at upkeep
-- ─────────────────────────────────────────────────────────────

-- Prefixed rather than the generic touch_updated_at(). CREATE OR REPLACE on a
-- generic name would silently overwrite an existing function of the same name
-- and change behaviour on tables this migration never mentions.
create or replace function public.revealai_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists intent_sessions_touch on public.intent_sessions;
create trigger intent_sessions_touch
  before update on public.intent_sessions
  for each row execute function public.revealai_touch_updated_at();

drop trigger if exists voice_enrollments_touch on public.voice_enrollments;
create trigger voice_enrollments_touch
  before update on public.voice_enrollments
  for each row execute function public.revealai_touch_updated_at();

-- Postgres grants EXECUTE to PUBLIC on every new function, and anon /
-- authenticated inherit from PUBLIC. A function in the public schema is
-- therefore reachable as an API endpoint unless that grant is removed. This
-- one is a trigger function with no business being called directly.
revoke execute on function public.revealai_touch_updated_at() from public;


-- ============================================================
-- 0005_enrollment_reference_clip.sql
-- ============================================================

-- 0005_enrollment_reference_clip.sql
--
-- Stores the derived speaker reference clip alongside the full enrollment.
--
-- Two constraints that only just overlap:
--   I-1                            enrollment sample must be >= 10 seconds
--   known_speaker_references[]      reference must be 2-10 seconds
--
-- The recorder allows up to 30 seconds, so most real samples fall outside what
-- the API accepts. Rather than trimming on every transcription request, the
-- clip is derived once in the browser at enrollment time and stored next to
-- the original.
--
-- Both are kept. The full sample satisfies I-1 and lets the clip be re-derived
-- later if the target length or selection method changes; the clip is what
-- actually gets sent with each request.

alter table public.voice_enrollments
  add column if not exists reference_path             text,
  add column if not exists reference_duration_seconds numeric,
  -- Where in the original the clip was taken from. Kept for debugging bad
  -- attribution: a reference lifted from a silent stretch is a plausible cause
  -- and is otherwise invisible after the fact.
  add column if not exists reference_offset_seconds   numeric;

alter table public.voice_enrollments
  drop constraint if exists voice_enrollments_reference_duration_check;

alter table public.voice_enrollments
  add constraint voice_enrollments_reference_duration_check
  check (reference_duration_seconds is null
         or (reference_duration_seconds >= 2 and reference_duration_seconds <= 10));


-- ============================================================
-- 0006_recording_segments.sql
-- ============================================================

-- 0006_recording_segments.sql
--
-- Recordings are stored as an ordered list of segments rather than one file.
--
-- N-4 requires a 20-minute recording to be analysed within 3 minutes, which is
-- only reachable by transcribing chunks in parallel — measured at ~2 minutes
-- chunked against ~6.7 minutes in a single request.
--
-- The split has to happen client-side, because Vercel's serverless runtime has
-- no ffmpeg and MediaRecorder's webm output cannot be divided by byte range.
-- The recorder therefore restarts at intervals, producing complete independent
-- files, and each is uploaded separately.
--
-- storage_path from migration 0004 is kept for sessions recorded before this
-- change and as the single-segment case.

alter table public.intent_sessions
  -- Ordered. Index in the array is the position in the conversation.
  add column if not exists segment_paths     text[],
  -- Per-segment durations, same order. Needed to compute each segment's offset
  -- so transcript timestamps can be shifted back onto the real timeline.
  add column if not exists segment_durations numeric[];

-- The two arrays are read together and are meaningless if they disagree.
alter table public.intent_sessions
  drop constraint if exists intent_sessions_segments_aligned_check;

alter table public.intent_sessions
  add constraint intent_sessions_segments_aligned_check
  check (
    (segment_paths is null and segment_durations is null)
    or array_length(segment_paths, 1) = array_length(segment_durations, 1)
  );


-- ============================================================
-- 0007_attribution_correction.sql
-- ============================================================

-- 0007_attribution_correction.sql
--
-- Records when a user corrects which speaker is them.
--
-- Speaker attribution is the one failure in this product that is invisible.
-- If the labels come back the wrong way round, the user reads an analysis of
-- themselves believing it describes the other person, and nothing on screen
-- suggests anything is wrong. A confident answer about the wrong person is
-- worse than declining to answer, which is what I-7 exists to avoid.
--
-- So the user can swap the labels. This column exists because that correction
-- is also the only honest measurement of I-4 in production.
--
-- I-4 requires correct attribution on 90% of segments in a quiet room, which
-- is verified before launch against recordings someone labelled by hand. That
-- does not scale, and it says nothing about noisy real-world use. The share of
-- sessions a user had to flip is a direct, continuous read on whether the 90%
-- claim survives contact with actual dates and interviews.
--
-- Query it as: corrections / total complete sessions.

alter table public.intent_sessions
  add column if not exists attribution_corrected boolean not null default false,
  add column if not exists attribution_corrected_at timestamptz;

-- Only corrected rows are interesting, and they should stay a small minority.
create index if not exists intent_sessions_corrected_idx
  on public.intent_sessions (attribution_corrected_at desc)
  where attribution_corrected;

