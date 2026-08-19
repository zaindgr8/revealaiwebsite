-- 0011_fix_checkin_duration_type.sql
--
-- The same drift as 0010, on the other table, found by 0010's audit query.
-- `therapy_sessions.duration_seconds` was `smallint`, which stores whole
-- numbers only. A fractional duration would not be rounded or truncated — the
-- INSERT is rejected outright with `invalid input syntax for type smallint`,
-- and Postgres refuses the whole row over the one bad column. That is how the
-- conversation upload was failing before 0010, and how check-ins used to vanish
-- with the analysis apparently succeeding.
--
-- IS IT REACHABLE TODAY? NO — AND THE ORIGINAL VERSION OF THIS COMMENT SAID
-- OTHERWISE
--
-- This file used to claim that stopping a check-in early produced a fractional
-- duration and a failed insert. That does not reproduce. The actual path:
--
--   hooks/useAudioRecorder.ts:182   secondsRef.current = next   (1s setInterval)
--   hooks/useAudioRecorder.ts:151   durationSeconds: secondsRef.current
--   app/therapy/page.tsx:375        durationSeconds: audio.durationSeconds
--   lib/ai.ts:278                   duration_seconds: durationSeconds
--   app/api/analyze-mood/route.ts   duration_seconds: duration_seconds ?? 0
--
-- The recorder counts whole seconds off a one-second tick, so stopping at 43
-- seconds yields exactly 43. Every value reaching this column is an integer.
--
-- The old comment also cited lib/audioTrim.ts:191 as part of this chain. It is
-- not — that figure feeds voice enrolment and conversation splitting, which
-- write to voice_enrollments and intent_sessions, not here.
--
-- WHY APPLY IT ANYWAY
--
-- Because the type is wrong for what the column stores, and the only thing
-- standing between that and a silent data-loss bug is an implementation detail
-- nobody is protecting. A duration is not a whole number; it is a whole number
-- here by accident of how the timer happens to work. Change the tick to 100ms,
-- take the duration from the decoded audio instead of the counter, or add an
-- upload path for check-ins, and the column starts rejecting rows again — on
-- T-1, the requirement this project has already been burned on twice, with no
-- error visible to the user.
--
-- Cheap insurance, not an outage. Applied 19 August 2026.
--
-- NOT CHANGED: therapy_sessions.confidence
--
-- 0010's audit flagged it as DRIFT, and that was a false positive. The audit
-- matched every column named like %confidence%, but this one is specified as
-- `<integer 0-100>` in prompts/checkIn.ts and written as
-- `Number(analysis.confidence) || 50`. It is genuinely a whole number and
-- smallint is the right type. `intent_sessions.attribution_confidence` is a
-- different thing — a 0-to-1 ratio — and is correctly numeric already.
--
-- Worth keeping in mind when reading that audit again: it flags candidates by
-- name, not by what the code writes. Check the write path before altering.

alter table public.therapy_sessions
  alter column duration_seconds type numeric using duration_seconds::numeric;

-- Confirm. Expect one row, numeric.
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'therapy_sessions'
   and column_name = 'duration_seconds';
