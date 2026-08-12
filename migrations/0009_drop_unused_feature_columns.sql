-- 0009_drop_unused_feature_columns.sql
--
-- Removes columns for features that do not exist yet.
--
-- THIS IS THE ONLY DESTRUCTIVE MIGRATION IN THIS SET.
--
-- It is safe because both tables were verified empty immediately before it was
-- written: coach_sessions 0 rows, intent_sessions 0 rows. No data is lost.
-- therapy_sessions is deliberately untouched — it holds 9 real rows.
--
-- WHAT THESE COLUMNS WERE
--
-- coach_sessions was never a chat table. Its shape — clarity, pace_wpm,
-- filler_count, tone_match — is a TONE COACH schema: vocal delivery metrics
-- for the third feature advertised on the marketing site, which is explicitly
-- out of scope for this phase. It was designed and never written to.
--
-- intent_sessions carried genuine / deceptive / manipulative / warmth /
-- sincerity / dominance / engagement as smallints. That is the percentage
-- output format — "Genuine Interest 92%" from the site — already encoded in
-- the schema. It is decision D-1, answered in one direction before D-1 was
-- ever asked. Also never written to.
--
-- Both are removed rather than worked around, so the tables describe what the
-- product actually does. The original definitions are preserved verbatim below
-- so either feature can be restored exactly when it is genuinely being built.
--
-- TO RESTORE TONE COACH:
--   alter table public.coach_sessions
--     add column scenario         text,
--     add column readiness_score  smallint,
--     add column confidence       smallint,
--     add column clarity          smallint,
--     add column energy           smallint,
--     add column pace_wpm         smallint,
--     add column filler_count     smallint,
--     add column tone_match       smallint,
--     add column feedback         text,
--     add column duration_seconds smallint,
--     add column ai_provider      text not null,
--     add column ai_model         text;
--
-- TO RESTORE PERCENTAGE-STYLE INTENT OUTPUT (only if D-1 lands on scores):
--   alter table public.intent_sessions
--     add column context      text,
--     add column genuine      smallint,
--     add column deceptive    smallint,
--     add column manipulative smallint,
--     add column neutral      smallint,
--     add column warmth       smallint,
--     add column sincerity    smallint,
--     add column dominance    smallint,
--     add column engagement   smallint,
--     add column key_moments  jsonb,
--     add column advice       text,
--     add column ai_provider  text not null,
--     add column ai_model     text;

-- ─────────────────────────────────────────────────────────────
-- coach_sessions — leave only what a chat conversation needs
--
-- ai_provider was NOT NULL and unwritten, which blocked every insert. That is
-- the same failure therapy_sessions had, in a second table.
-- ─────────────────────────────────────────────────────────────

alter table public.coach_sessions
  drop column if exists scenario,
  drop column if exists readiness_score,
  drop column if exists confidence,
  drop column if exists clarity,
  drop column if exists energy,
  drop column if exists pace_wpm,
  drop column if exists filler_count,
  drop column if exists tone_match,
  drop column if exists feedback,
  drop column if exists duration_seconds,
  drop column if exists ai_provider,
  drop column if exists ai_model;

-- ─────────────────────────────────────────────────────────────
-- intent_sessions — leave only what the current pipeline uses
--
-- `summary` and `duration_seconds` are kept: both are generic, and the
-- analysis layer will want them once D-1 is answered.
-- ─────────────────────────────────────────────────────────────

alter table public.intent_sessions
  drop column if exists context,
  drop column if exists genuine,
  drop column if exists deceptive,
  drop column if exists manipulative,
  drop column if exists neutral,
  drop column if exists warmth,
  drop column if exists sincerity,
  drop column if exists dominance,
  drop column if exists engagement,
  drop column if exists key_moments,
  drop column if exists advice,
  drop column if exists ai_provider,
  drop column if exists ai_model;
