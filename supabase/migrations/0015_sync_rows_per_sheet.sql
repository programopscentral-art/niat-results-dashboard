-- ============================================================================
-- Change detection must be per TAB, not per college. Multi-tab colleges (Aurora
-- Term-I / Term-II share one college_id) collided in sync_rows keyed by
-- (semester, college, uid): the two tabs overwrote each other's row-hash on every
-- sync and ping-ponged "updated" forever. Harmless for results (disposable diff
-- cache; DB is rebuilt from the sheets) but it would flood the activity log.
--
-- sync_rows is a rebuildable audit/diff cache, so we re-key it by college_sheet.
-- Truncate + re-PK, then run `npm run backfill` to repopulate.
-- ============================================================================

truncate table sync_rows;

alter table sync_rows drop constraint if exists sync_rows_pkey;
alter table sync_rows add column if not exists college_sheet_id uuid references college_sheets(id) on delete cascade;
alter table sync_rows alter column college_sheet_id set not null;
alter table sync_rows add primary key (semester_id, college_sheet_id, uid);
create index if not exists idx_sync_rows_sheet on sync_rows(semester_id, college_sheet_id);
