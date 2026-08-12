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
