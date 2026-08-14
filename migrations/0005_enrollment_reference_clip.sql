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
