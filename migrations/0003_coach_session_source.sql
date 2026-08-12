-- 0003_coach_session_source.sql
--
-- Distinguishes the two chat surfaces that both write to coach_sessions.
--
-- There are two conversations in this product:
--
--   'chat'    — the standalone /chat route. A therapy conversation in its own
--               right, and its own row in Profile History.
--
--   'checkin' — the inline conversation inside the voice check-in flow
--               (app/therapy/page.tsx). Its questions and answers are fed into
--               the check-in analysis and end up on the therapy_sessions row.
--
-- T-1 requires ALL chat messages to persist, so the check-in conversation must
-- be stored too. But it must not also appear as a separate history entry —
-- one check-in would then show as two rows, a check-in and a conversation,
-- for a single thing the user did once.
--
-- So: everything is stored, and Profile History filters to source = 'chat'.

alter table public.coach_sessions
  add column if not exists source text not null default 'chat';

alter table public.coach_sessions
  drop constraint if exists coach_sessions_source_check;

alter table public.coach_sessions
  add constraint coach_sessions_source_check
  check (source in ('chat', 'checkin'));

-- Profile History reads newest-first filtered by source, so the index needs
-- source ahead of the sort key.
create index if not exists coach_sessions_source_created_idx
  on public.coach_sessions (user_id, source, created_at desc);
