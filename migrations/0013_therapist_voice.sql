-- 0013_therapist_voice.sql
--
-- Lets a user choose which voice Elena speaks with.
--
-- WHY
--
-- The voice was hard-coded to 'Despina' inside LiveVoiceChat. Google publishes
-- 30 prebuilt voices and people hear warmth very differently, so the one a
-- therapist speaks with is a real preference, not a build-time constant.
--
-- WHAT THIS IS NOT
--
-- It is not the persona. Elena is Elena in every voice — the persona lives in
-- prompts/elena.ts. This column holds a Google voice id and nothing more.
--
-- NULL MEANS "HAS NOT CHOSEN"
--
-- Deliberately nullable with no default. lib/voices.ts resolves NULL to
-- DEFAULT_VOICE, which is the value the code used before this migration, so
-- every existing user keeps the exact voice they already had. Writing a
-- default here instead would make "never chose" and "chose the default"
-- indistinguishable, and we want to know which users have been through the
-- picker.
--
-- The id is validated in application code against lib/voices.ts rather than by
-- a check constraint. Google adds and retires voices on its own schedule, and
-- a constraint here would need a migration every time they do.

alter table public.profiles
  add column if not exists therapist_voice text;

comment on column public.profiles.therapist_voice is
  'Google prebuilt voice id for the live call. NULL means the user has not chosen; see lib/voices.ts.';
