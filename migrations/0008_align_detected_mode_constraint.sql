-- 0008_align_detected_mode_constraint.sql
--
-- Aligns the detected_mode CHECK constraint with the values the AI is actually
-- instructed to produce.
--
-- THE MISMATCH
--
-- SCHEMA_BLOCK in app/api/analyze-mood/route.ts tells the model to return
-- exactly one of:
--
--   calm | happy | anxious | sad | angry | venting | reflective | neutral | motivated
--
-- The database accepted only:
--
--   calm | anxious | sad | angry | venting | neutral | hopeful
--
-- So three values the model is explicitly told to use — happy, reflective,
-- motivated — failed the insert with 23514. And one value the database allows,
-- hopeful, was never offered to the model at all, despite appearing in the
-- existing rows.
--
-- The effect was that a check-in saved or vanished depending on the user's
-- mood. Someone having a good day was materially more likely to lose their
-- session than someone anxious, which is close to the worst possible failure
-- distribution for a wellbeing product.
--
-- Resolved by widening the constraint rather than narrowing the prompt: happy
-- and motivated are states worth recording, and removing them would flatten
-- the product to make the schema's job easier.
--
-- Found 6 Aug 2026 while verifying migration 0001. It was one of four
-- independent causes of the reported "data not saving" bug.

alter table public.therapy_sessions
  drop constraint if exists therapy_sessions_detected_mode_check;

alter table public.therapy_sessions
  add constraint therapy_sessions_detected_mode_check
  check (detected_mode in (
    'calm',
    'happy',
    'hopeful',      -- present in existing rows, absent from the prompt until now
    'anxious',
    'sad',
    'angry',
    'venting',
    'reflective',
    'neutral',
    'motivated'
  ));

-- Same class of problem, already fixed in code by normalisePace(): the route
-- wrote lowercase 'normal' against a constraint expecting 'Normal'. Restated
-- here so the accepted set is documented in one place alongside the mode list.
alter table public.therapy_sessions
  drop constraint if exists therapy_sessions_pace_check;

alter table public.therapy_sessions
  add constraint therapy_sessions_pace_check
  check (pace in ('Slow', 'Normal', 'Fast'));
