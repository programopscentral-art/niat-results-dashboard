-- ============================================================================
-- Universal adapter: colleges grade differently (marks / CIA-ESE / grade-points
-- / MID-based / Theory-IA). Store every subject's RAW metrics as JSONB, plus a
-- normalized layer (score, grade, total_pct, passed) derived where possible.
-- ============================================================================

alter table results add column if not exists score   numeric(8,2);  -- headline number
alter table results add column if not exists grade   text;          -- letter grade (A-, B+, ...)
alter table results add column if not exists metrics jsonb;         -- all raw per-subject cells

-- Remember each tab's detected shape (for the ops UI / debugging).
alter table college_sheets add column if not exists format text;    -- 'marks' | 'cia_ese' | 'grade_points' | ...
