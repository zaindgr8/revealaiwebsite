-- 0007_attribution_correction.sql
--
-- Records when a user corrects which speaker is them.
--
-- Speaker attribution is the one failure in this product that is invisible.
-- If the labels come back the wrong way round, the user reads an analysis of
-- themselves believing it describes the other person, and nothing on screen
-- suggests anything is wrong. A confident answer about the wrong person is
-- worse than declining to answer, which is what I-7 exists to avoid.
--
-- So the user can swap the labels. This column exists because that correction
-- is also the only honest measurement of I-4 in production.
--
-- I-4 requires correct attribution on 90% of segments in a quiet room, which
-- is verified before launch against recordings someone labelled by hand. That
-- does not scale, and it says nothing about noisy real-world use. The share of
-- sessions a user had to flip is a direct, continuous read on whether the 90%
-- claim survives contact with actual dates and interviews.
--
-- Query it as: corrections / total complete sessions.

alter table public.intent_sessions
  add column if not exists attribution_corrected boolean not null default false,
  add column if not exists attribution_corrected_at timestamptz;

-- Only corrected rows are interesting, and they should stay a small minority.
create index if not exists intent_sessions_corrected_idx
  on public.intent_sessions (attribution_corrected_at desc)
  where attribution_corrected;
