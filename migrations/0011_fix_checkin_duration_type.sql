-- 0011_fix_checkin_duration_type.sql
--
-- The same drift as 0010, on the other table, found by 0010's audit query.
--
-- `therapy_sessions.duration_seconds` is `smallint`, and the check-in write
-- path sends a float:
--
--   lib/audioTrim.ts:191   resampled.length / OUTPUT_SAMPLE_RATE
--   lib/ai.ts:278          duration_seconds: durationSeconds
--   app/api/analyze-mood/route.ts:383   duration_seconds: duration_seconds ?? 0
--
-- WHY THIS HAS NEVER FIRED
--
-- The recorder stops itself at 60 seconds (app/therapy/page.tsx:500). A
-- check-in that runs to that cap produces exactly 60.0, which is a whole
-- number, which fits in a smallint. Every check-in written by the current
-- codebase — there is exactly one, on 6 August, the "first save since June"
-- from Demo 1 — ran the full minute.
--
-- Tap stop at 43 seconds and the duration is fractional, and the insert fails
-- with `invalid input syntax for type smallint`, exactly as the conversation
-- upload did before 0010. The nine older rows all have whole-number durations
-- because they were written by the previous developer's build, which sourced
-- the value differently.
--
-- So T-1 — "chat and check-in data saves" — is only verified for one specific
-- user behaviour: recording until the timer runs out. The moment someone stops
-- early, they are back to a silent-looking failure. That is the same class of
-- bug Demo 1 was called for, still live on the same requirement, hidden behind
-- a default that happens to be an integer.
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
