-- 0016_call_shift.sql
--
-- Stores how a live call moved the user: mood and stress at the start (read
-- from the voice sample recorded before the call) and at the end (the call's
-- main scores), plus a one-line note.
--
-- Shape: { "start_mood": int, "start_stress": int, "end_mood": int,
--          "end_stress": int, "note": text | null }
--
-- Null for Reflect check-ins and for calls where the sample was skipped.
-- jsonb rather than four columns because it is read as one unit, by one
-- screen, and nothing filters or aggregates on it yet.
--
-- Code that writes this column falls back to inserting without it when the
-- column is missing (lib/therapy-session-row.ts).
--
-- TO REVERSE
--
--   alter table public.therapy_sessions drop column if exists call_shift;

alter table public.therapy_sessions
  add column if not exists call_shift jsonb;
