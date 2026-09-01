-- ============================================================================
-- Subjects are keyed per TAB (college_sheet), not per (semester, college).
-- This lets one college have multiple term-tabs (e.g. Aurora Term-I / Term-II)
-- with their own subject sets in the same semester, without position collisions.
-- ============================================================================

alter table subjects add column if not exists college_sheet_id uuid references college_sheets(id) on delete cascade;
alter table subjects drop constraint if exists subjects_semester_id_college_id_position_key;
create unique index if not exists subjects_sheet_position_key on subjects(college_sheet_id, position);
