-- 0014_live_call_sessions.sql
--
-- Lets a live voice call be stored as a conversation.
--
-- WHY
--
-- /live talked to Google from the browser and kept nothing. The call ended and
-- the whole conversation went with it. That broke memory in both directions:
-- Elena met the user as a stranger on every call, and the chat therapist never
-- learned that a call had happened at all, because T-2 builds its memory from
-- coach_sessions rows that do not exist for a call.
--
-- WHAT CHANGES
--
-- One value on one check constraint. coach_sessions.source accepted 'chat' and
-- 'checkin'; it now also accepts 'live'.
--
--   'chat'    — a typed conversation on /chat
--   'checkin' — the conversation inside the voice check-in flow
--   'live'    — a spoken call on /live          <-- new
--
-- WHY A NEW VALUE RATHER THAN REUSING 'chat'
--
-- The rows are read by source in four places, and the three kinds are not
-- interchangeable. startOrResumeCoachSession() resumes any open 'chat' within
-- the resume window; if a call were stored as 'chat', opening /chat after a
-- dropped call would silently continue that call's session and append typed
-- messages to a voice transcript. Profile History also needs to say which one
-- the user is looking at — "Chat" on a row that was a phone call is wrong.
--
-- WHAT IS NOT CHANGED
--
-- No new table and no new column. A live call is a conversation with a
-- transcript, which is exactly what coach_sessions and chat_messages already
-- hold. The summary written by /api/summarise-session is what T-2 reads back,
-- so a call becomes memory through the same path a chat does, with no second
-- mechanism to keep in step.
--
-- TO REVERSE
--
-- Re-run 0003's constraint. Any 'live' rows must be deleted or moved to 'chat'
-- first, or the constraint will refuse to apply.

alter table public.coach_sessions
  drop constraint if exists coach_sessions_source_check;

alter table public.coach_sessions
  add constraint coach_sessions_source_check
  check (source in ('chat', 'checkin', 'live')) not valid;

-- Adding NOT VALID avoids scanning the table while holding the stronger lock;
-- validation then checks existing rows without blocking ordinary reads/writes.
alter table public.coach_sessions
  validate constraint coach_sessions_source_check;
