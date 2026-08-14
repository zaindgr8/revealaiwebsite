# Migrations

Every schema change goes in here as a numbered `.sql` file, committed alongside
the code that depends on it.

This exists because the code and the database drifted apart: `analyze-mood`
was writing `narrative_type`, `readiness_score` and `readiness_note` to
`therapy_sessions`, none of which existed. PostgreSQL rejects the whole row
when any single column is unknown, so every check-in silently failed to save.

## Rules

1. A migration is committed in the **same commit** as the code that needs it.
2. Never add a column reference in code before the migration exists.
3. Files are numbered and never edited after being applied — add a new one instead.

## Applying

Paste the file contents into the Supabase SQL editor, or:

```bash
supabase db push
```

## Baseline

There is no baseline file yet. The schema predates this folder. Generate one with:

```bash
supabase db dump --schema public > migrations/0000_baseline.sql
```

Do that once and commit it, so a fresh environment can be rebuilt from scratch.
