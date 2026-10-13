-- 0015_link_call_analysis.sql
--
-- Links a live call's analysis to the call's conversation.
--
-- WHY
--
-- The recorded Reflect check-in on /therapy is retired. Its results screen —
-- mood score, Breakdown, Heart-to-Heart Reflection, Recommendations, Today's
-- Action — now appears after a call on /live, produced by /api/analyze-call
-- and saved as an ordinary therapy_sessions row so Dashboard, Healing Journey
-- and History keep reading one table.
--
-- A call is therefore stored twice: as a coach_sessions conversation (the
-- transcript and the summary that memory reads) and as a therapy_sessions
-- analysis (the scores). Without a link, History lists the same call as two
-- rows. This column is that link; History hides the conversation row when an
-- analysis row points at it.
--
-- WHAT CHANGES
--
-- One nullable column. Existing check-ins keep null. Deleting the call's
-- conversation leaves the analysis in place and clears the link, so the
-- scores stay in the user's trends.
--
-- Code that writes this column falls back to inserting without it when the
-- column is missing, so applying this late loses only the de-duplication.
--
-- TO REVERSE
--
--   alter table public.therapy_sessions drop column if exists coach_session_id;

alter table public.therapy_sessions
  add column if not exists coach_session_id uuid
    references public.coach_sessions (id) on delete set null;

create index if not exists therapy_sessions_coach_session_idx
  on public.therapy_sessions (coach_session_id)
  where coach_session_id is not null;
