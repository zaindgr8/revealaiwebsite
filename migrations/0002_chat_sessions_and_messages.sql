-- 0002_chat_sessions_and_messages.sql
--
-- Schema for Feature 1: AI Chat Therapist with memory (PRD T-1 to T-8).
--
-- Today the chat holds messages in React state and the check-in context in
-- sessionStorage. Nothing is written to the database, so closing the tab loses
-- the conversation and the therapist has no memory between sessions.
--
-- coach_sessions already exists but only has id, user_id and created_at. It is
-- extended here rather than replaced, so the existing table and any RLS on it
-- stay intact.
--
-- Supports:
--   T-1  messages persist, linked to the user
--   T-4  a structured record (summary, mood, topics) written on session end
--   T-5  Profile History listed newest-first, under 2s at 100 sessions
--   T-7  per-message crisis flag

-- ─────────────────────────────────────────────────────────────
-- coach_sessions — one row per chat conversation
-- ─────────────────────────────────────────────────────────────

alter table public.coach_sessions
  add column if not exists ended_at       timestamptz,
  add column if not exists summary        text,
  add column if not exists mood_score     integer,
  add column if not exists topics         text[],
  add column if not exists message_count  integer not null default 0,
  add column if not exists crisis_flagged boolean not null default false;

-- Mood is expressed on the same 0-100 scale as therapy_sessions.mood_score so
-- the two can be charted on one axis in Profile History.
alter table public.coach_sessions
  drop constraint if exists coach_sessions_mood_score_check;

alter table public.coach_sessions
  add constraint coach_sessions_mood_score_check
  check (mood_score is null
         or (mood_score >= 0 and mood_score <= 100));

-- T-5: newest-first per user is the only read pattern this table has.
create index if not exists coach_sessions_user_created_idx
  on public.coach_sessions (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- chat_messages — one row per message, the T-1 requirement
-- ─────────────────────────────────────────────────────────────

create table if not exists public.chat_messages (
  id             uuid        primary key default gen_random_uuid(),
  session_id     uuid        not null
                             references public.coach_sessions (id) on delete cascade,
  user_id        uuid        not null
                             references auth.users (id) on delete cascade,
  role           text        not null check (role in ('user', 'assistant')),
  content        text        not null,
  -- T-7: set when the crisis classifier flags a user message. Stored so the
  -- escalation path is auditable against the T-8 test set rather than only
  -- visible at runtime.
  crisis_flagged boolean     not null default false,
  created_at     timestamptz not null default now()
);

-- Messages are always read as a whole conversation in chronological order.
create index if not exists chat_messages_session_created_idx
  on public.chat_messages (session_id, created_at);

-- Used to review flagged messages across all users during T-8 verification.
create index if not exists chat_messages_crisis_idx
  on public.chat_messages (created_at desc)
  where crisis_flagged;

-- ─────────────────────────────────────────────────────────────
-- Row level security
--
-- Same shape as therapy_sessions: a user reaches their own rows and nothing
-- else. Policies are dropped first so this file can be re-run safely.
-- ─────────────────────────────────────────────────────────────

alter table public.coach_sessions enable row level security;
alter table public.chat_messages  enable row level security;

drop policy if exists "own coach sessions select" on public.coach_sessions;
drop policy if exists "own coach sessions insert" on public.coach_sessions;
drop policy if exists "own coach sessions update" on public.coach_sessions;
drop policy if exists "own coach sessions delete" on public.coach_sessions;

create policy "own coach sessions select" on public.coach_sessions
  for select using (auth.uid() = user_id);

create policy "own coach sessions insert" on public.coach_sessions
  for insert with check (auth.uid() = user_id);

create policy "own coach sessions update" on public.coach_sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own coach sessions delete" on public.coach_sessions
  for delete using (auth.uid() = user_id);

drop policy if exists "own chat messages select" on public.chat_messages;
drop policy if exists "own chat messages insert" on public.chat_messages;
drop policy if exists "own chat messages delete" on public.chat_messages;

create policy "own chat messages select" on public.chat_messages
  for select using (auth.uid() = user_id);

-- Checking auth.uid() = user_id alone is not enough. The message_count trigger
-- below runs as security definer and therefore bypasses RLS, so a user could
-- insert a row carrying their own user_id but someone else's session_id and
-- drive up that person's counter. Ownership of the parent session is verified
-- here so that cannot happen.
create policy "own chat messages insert" on public.chat_messages
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.coach_sessions s
       where s.id = session_id
         and s.user_id = auth.uid()
    )
  );

-- Deliberately no UPDATE policy. A therapy transcript is a record; it is
-- appended to and deleted, never rewritten.
create policy "own chat messages delete" on public.chat_messages
  for delete using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- message_count upkeep
--
-- Denormalised so the Profile History list never counts rows per session,
-- which is what would break the 2-second target at 100 sessions.
-- ─────────────────────────────────────────────────────────────

create or replace function public.bump_coach_session_message_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.coach_sessions
       set message_count = message_count + 1
     where id = new.session_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.coach_sessions
       set message_count = greatest(message_count - 1, 0)
     where id = old.session_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists chat_messages_count_trigger on public.chat_messages;

create trigger chat_messages_count_trigger
  after insert or delete on public.chat_messages
  for each row execute function public.bump_coach_session_message_count();

-- This function is SECURITY DEFINER, which means it runs with the owner's
-- privileges and bypasses RLS. Postgres grants EXECUTE to PUBLIC by default,
-- and anon / authenticated inherit from PUBLIC — so without this revoke it is
-- a privileged, publicly callable endpoint sitting in an exposed schema.
--
-- Calling it outside a trigger would fail on the missing TG_OP rather than do
-- damage, but a SECURITY DEFINER function should never be left callable by
-- default regardless of whether today's body happens to be harmless.
revoke execute on function public.bump_coach_session_message_count() from public;
