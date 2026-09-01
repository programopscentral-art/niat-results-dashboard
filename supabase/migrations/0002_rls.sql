-- ============================================================================
-- Row-Level Security
--   ops / super_admin  → read everything
--   college_staff      → read only their own college's rows
--   writes             → service role only (the sync worker) — bypasses RLS
-- ============================================================================

-- Helper: current user's role (security definer avoids recursive RLS on profiles)
create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function auth_college() returns uuid
language sql stable security definer set search_path = public as $$
  select college_id from profiles where id = auth.uid()
$$;

create or replace function is_ops() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() in ('ops','super_admin'), false)
$$;

-- Enable RLS
alter table colleges         enable row level security;
alter table semesters        enable row level security;
alter table college_sheets   enable row level security;
alter table students         enable row level security;
alter table subjects         enable row level security;
alter table results          enable row level security;
alter table result_summaries enable row level security;
alter table sync_rows        enable row level security;
alter table sync_runs        enable row level security;
alter table profiles         enable row level security;

-- ---------- profiles ----------
drop policy if exists p_profiles_self on profiles;
create policy p_profiles_self on profiles for select
  using (id = auth.uid() or is_ops());

-- ---------- reference tables: any authenticated user reads; college_staff sees all colleges/semesters ----------
drop policy if exists p_colleges_read on colleges;
create policy p_colleges_read on colleges for select using (auth.role() = 'authenticated');

drop policy if exists p_semesters_read on semesters;
create policy p_semesters_read on semesters for select using (auth.role() = 'authenticated');

drop policy if exists p_subjects_read on subjects;
create policy p_subjects_read on subjects for select
  using (is_ops() or college_id = auth_college());

drop policy if exists p_sheets_read on college_sheets;
create policy p_sheets_read on college_sheets for select
  using (is_ops() or college_id = auth_college());

-- ---------- students: ops see all; staff see only their college ----------
drop policy if exists p_students_read on students;
create policy p_students_read on students for select
  using (is_ops() or college_id = auth_college());

-- ---------- results: scoped through the owning student ----------
drop policy if exists p_results_read on results;
create policy p_results_read on results for select
  using (
    is_ops() or exists (
      select 1 from students s
      where s.id = results.student_id and s.college_id = auth_college()
    )
  );

-- ---------- summaries: carry college_id directly for a fast policy ----------
drop policy if exists p_summaries_read on result_summaries;
create policy p_summaries_read on result_summaries for select
  using (is_ops() or college_id = auth_college());

-- ---------- ops-only observability ----------
drop policy if exists p_sync_runs_read on sync_runs;
create policy p_sync_runs_read on sync_runs for select using (is_ops());

drop policy if exists p_sync_rows_read on sync_rows;
create policy p_sync_rows_read on sync_rows for select using (is_ops());

-- NOTE: no INSERT/UPDATE/DELETE policies are defined for the anon/authenticated
-- roles, so RLS denies all writes to them. The sync worker uses the service_role
-- key, which bypasses RLS entirely.
