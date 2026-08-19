-- 0010_fix_duration_column_type.sql
--
-- Fixes: uploading a conversation failed with
--   invalid input syntax for type smallint: "361.8134375"
--
-- WHAT WENT WRONG
--
-- Migration 0004 line 190 says:
--
--   add column if not exists duration_seconds numeric
--
-- and `intent_sessions` was a pre-existing table from the previous developer,
-- where `duration_seconds` already existed as `smallint`. `if not exists`
-- matches on the column NAME only — it does not check the type, and it does
-- not warn. So the migration reported success, the file said `numeric`, and
-- the database stayed `smallint`.
--
-- Every audio duration the app computes is fractional (361.8134375 seconds for
-- a six-minute clip), so the very first real upload was rejected. The feature
-- had never been exercised end to end against this table, which is why it sat
-- undiscovered until 12 August.
--
-- This is the same class of bug as the check-in persistence failure in Demo 1:
-- code and schema drifting apart, with the mismatch hidden by something that
-- fails quietly. There the culprit was a swallowed error; here it is
-- `if not exists`. Worth remembering that the clause is a no-op guard, not a
-- reconciliation — it makes a migration re-runnable, not correct.
--
-- WHY numeric AND NOT ROUNDING IN THE CLIENT
--
-- Rounding would also stop the error, but the file has claimed `numeric` since
-- 0004 and every other duration column in the schema is `numeric`. Rounding
-- would leave one column disagreeing with its own migration and with its
-- siblings, which is the condition that produced this bug in the first place.
-- Fix the drift, not the symptom.
--
-- Range was never the problem — smallint reaches 32767 seconds, about nine
-- hours. Only the fraction was rejected.

-- ─────────────────────────────────────────────────────────────
-- The fix
-- ─────────────────────────────────────────────────────────────

alter table public.intent_sessions
  alter column duration_seconds type numeric using duration_seconds::numeric;

-- ─────────────────────────────────────────────────────────────
-- Audit: are there other columns with the same drift?
--
-- Every column 0004-0007 added with `if not exists` to a pre-existing table
-- could have been skipped the same way. This reports rather than alters —
-- read the output before assuming the fix is complete.
--
-- Expected after this migration: duration_seconds, attribution_confidence and
-- reference_duration_seconds are all `numeric`; segment_durations is
-- `numeric[]`; the timestamps are `timestamp with time zone`.
-- ─────────────────────────────────────────────────────────────

select table_name,
       column_name,
       data_type,
       case
         when column_name like '%duration%'   and data_type not in ('numeric', 'ARRAY') then 'DRIFT'
         when column_name like '%confidence%' and data_type <> 'numeric'                then 'DRIFT'
         when column_name like '%_at'         and data_type <> 'timestamp with time zone' then 'DRIFT'
         else 'ok'
       end as verdict
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('intent_sessions', 'voice_enrollments', 'coach_sessions', 'therapy_sessions')
   and (column_name like '%duration%'
     or column_name like '%confidence%'
     or column_name like '%_at')
 order by verdict desc, table_name, column_name;
