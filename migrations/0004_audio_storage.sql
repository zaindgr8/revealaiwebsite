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
