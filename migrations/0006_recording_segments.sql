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
