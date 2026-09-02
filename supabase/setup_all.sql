-- NIAT Records — COMPLETE Supabase setup (migrations 0001-0015 + seed). Idempotent.

-- >>>>> migrations/0001_core.sql <<<<<

-- ============================================================================
-- NIAT Records Platform — Core schema
-- 1 spreadsheet = 1 batch·semester | 1 tab = 1 college | 1 row = 1 student
-- Results normalized: one row per student · per subject (handles variable
-- subject counts, sparse data, and future semesters).
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "moddatetime";    -- updated_at triggers

-- ---------- Roles ----------
do $$ begin
  create type app_role as enum ('super_admin','ops','college_staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type overall_status as enum ('pass','fail','in_progress');
exception when duplicate_object then null; end $$;

-- ---------- Colleges (global registry — junk/template tabs never enter here) ----------
create table if not exists colleges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  code        text not null unique,          -- stable key; survives tab renames
  slug        text not null unique,
  hue         int  not null default 212,     -- brand accent for the UI badge
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Semesters (one per consolidation spreadsheet) ----------
create table if not exists semesters (
  id             uuid primary key default gen_random_uuid(),
  batch          text not null,              -- '2025'
  name           text not null,              -- 'Semester 1'
  spreadsheet_id text not null,              -- Google Sheets file id
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (batch, name)
);

-- ---------- College sheets (one per TAB; a college may have >1, e.g. Aurora Term I/II) ----------
create table if not exists college_sheets (
  id             uuid primary key default gen_random_uuid(),
  semester_id    uuid not null references semesters(id) on delete cascade,
  college_id     uuid not null references colleges(id)  on delete cascade,
  tab_name       text not null,              -- exact Google Sheets tab title
  term           text,                       -- 'Term I' / 'Term II' / null
  header_map     jsonb,                      -- detected column layout for this tab
  row_count      int  not null default 0,
  last_synced_at timestamptz,
  unique (semester_id, tab_name)
);

-- ---------- Students (keyed by NIAT UID; stable across semesters) ----------
create table if not exists students (
  id            uuid primary key default gen_random_uuid(),
  uid           text not null unique,        -- N25H02B0198
  full_name     text,
  university_id text,                         -- 2025EB01894 (normalized)
  bits_id       text,
  college_id    uuid references colleges(id) on delete set null,
  is_flagged    boolean not null default false,  -- dirty-ID / data-quality flag
  flag_reason   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- Subjects (per semester · per college; positional + named) ----------
create table if not exists subjects (
  id          uuid primary key default gen_random_uuid(),
  semester_id uuid not null references semesters(id) on delete cascade,
  college_id  uuid not null references colleges(id)  on delete cascade,
  position    int  not null,                 -- 1..8 (sheet column group)
  name        text,
  unique (semester_id, college_id, position)
);

-- ---------- Results (the heart: one row per student · per subject) ----------
create table if not exists results (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references students(id)  on delete cascade,
  semester_id  uuid not null references semesters(id) on delete cascade,
  subject_id   uuid not null references subjects(id)  on delete cascade,
  internal_pct numeric(8,2),
  external_pct numeric(8,2),
  total_pct    numeric(8,2),
  passed       boolean,                       -- null = not yet graded
  updated_at   timestamptz not null default now(),
  unique (student_id, semester_id, subject_id)
);

-- ---------- Per-student summary (dashboards read ONE fast row) ----------
create table if not exists result_summaries (
  student_id      uuid not null references students(id)  on delete cascade,
  semester_id     uuid not null references semesters(id) on delete cascade,
  college_id      uuid references colleges(id) on delete set null,
  total_cgpa      numeric(8,2),
  total_pct       numeric(8,2),
  subjects_failed int,
  overall         overall_status not null default 'in_progress',
  data_complete   boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (student_id, semester_id)
);

-- ---------- Raw sheet rows (audit + change-detection via row hash) ----------
create table if not exists sync_rows (
  semester_id      uuid not null references semesters(id) on delete cascade,
  college_id       uuid not null references colleges(id)  on delete cascade,
  college_sheet_id uuid not null references college_sheets(id) on delete cascade,
  uid              text not null,
  row_hash         text not null,
  raw              jsonb not null,
  deleted_at       timestamptz,
  primary key (semester_id, college_sheet_id, uid)
);

-- ---------- Sync run log (observability for ops) ----------
create table if not exists sync_runs (
  id             uuid primary key default gen_random_uuid(),
  semester_id    uuid references semesters(id) on delete set null,
  college_id     uuid references colleges(id)  on delete set null,
  trigger        text not null,              -- 'webhook' | 'cron' | 'manual' | 'backfill'
  status         text not null default 'running',
  rows_processed int default 0,
  inserted       int default 0,
  updated        int default 0,
  deleted        int default 0,
  errors         jsonb default '[]'::jsonb,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

-- ---------- Profiles (mirror of auth.users with role + college scope) ----------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       app_role not null default 'college_staff',
  college_id uuid references colleges(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------- Indexes (keep dashboards + "who failed subject X" instant) ----------
create index if not exists idx_students_college       on students(college_id);
create index if not exists idx_results_student         on results(student_id);
create index if not exists idx_results_sem_subj_pass   on results(semester_id, subject_id, passed);
create index if not exists idx_summaries_college_sem   on result_summaries(college_id, semester_id);
create index if not exists idx_subjects_sem_college    on subjects(semester_id, college_id);
create index if not exists idx_sync_runs_started       on sync_runs(started_at desc);

-- ---------- updated_at triggers ----------
drop trigger if exists trg_students_moddt on students;
create trigger trg_students_moddt before update on students
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists trg_results_moddt on results;
create trigger trg_results_moddt before update on results
  for each row execute procedure moddatetime(updated_at);
drop trigger if exists trg_summaries_moddt on result_summaries;
create trigger trg_summaries_moddt before update on result_summaries
  for each row execute procedure moddatetime(updated_at);

-- ---------- Auto-create a profile when a user signs up ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure handle_new_user();


-- >>>>> migrations/0002_rls.sql <<<<<

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


-- >>>>> migrations/0003_realtime.sql <<<<<

-- ============================================================================
-- Realtime — stream live changes to subscribed dashboards.
-- The web client subscribes per-college, so fan-out stays small at 2k users.
-- RLS above still applies to realtime, so staff only receive their own rows.
-- ============================================================================

alter publication supabase_realtime add table results;
alter publication supabase_realtime add table result_summaries;
alter publication supabase_realtime add table students;
alter publication supabase_realtime add table sync_runs;

-- REPLICA IDENTITY FULL so UPDATE/DELETE payloads include old values
-- (needed for the client to match & remove/replace the right row).
alter table results          replica identity full;
alter table result_summaries replica identity full;
alter table students         replica identity full;


-- >>>>> migrations/0004_views.sql <<<<<

-- ============================================================================
-- Aggregate view for the overview page. security_invoker = on (PG15+) so the
-- caller's RLS applies — college_staff only see their own college's numbers.
-- ============================================================================

create or replace view v_college_overview
with (security_invoker = on) as
select
  c.id   as college_id,
  c.name,
  c.slug,
  c.code,
  c.hue,
  rs.semester_id,
  count(rs.student_id)                                              as total,
  count(*) filter (where rs.overall = 'pass')                      as passed,
  count(*) filter (where rs.overall = 'fail')                      as failed,
  count(*) filter (where rs.overall = 'in_progress')              as in_progress,
  coalesce(sum(rs.subjects_failed), 0)                             as backlogs,
  round(avg(rs.total_cgpa) filter (where rs.data_complete), 2)     as avg_cgpa
from colleges c
left join result_summaries rs on rs.college_id = c.id
where c.is_active
group by c.id, c.name, c.slug, c.code, c.hue, rs.semester_id;

grant select on v_college_overview to authenticated, anon;


-- >>>>> migrations/0005_admin_bootstrap.sql <<<<<

-- ============================================================================
-- Admin bootstrap: emails listed here get the 'ops' role automatically on their
-- first sign-in. Everyone else defaults to 'college_staff' (scope them later).
-- ============================================================================

create table if not exists admin_emails (email text primary key);

insert into admin_emails (email) values
  ('programopscentral@nxtwave.in'),
  ('nalamasa.sanjay@nxtwave.co.in'),
  ('perisetti.sunil@nxtwave.co.in')
on conflict (email) do nothing;

-- Recreate the signup handler to honor the allowlist.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r app_role;
begin
  r := case when exists (select 1 from admin_emails a where a.email = new.email)
            then 'ops'::app_role else 'college_staff'::app_role end;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), r)
  on conflict (id) do update set role = excluded.role;
  return new;
end $$;


-- >>>>> migrations/0006_semester_modified.sql <<<<<

-- Track each spreadsheet's last-seen Drive modifiedTime so the cron can skip
-- unchanged files instead of re-reading them every minute.
alter table semesters add column if not exists last_modified_seen timestamptz;

-- Let the auto-discovery cron store the human title it parsed (nice for ops UI).
alter table semesters add column if not exists source_title text;


-- >>>>> migrations/0007_universal.sql <<<<<

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


-- >>>>> migrations/0008_subjects_per_sheet.sql <<<<<

-- ============================================================================
-- Subjects are keyed per TAB (college_sheet), not per (semester, college).
-- This lets one college have multiple term-tabs (e.g. Aurora Term-I / Term-II)
-- with their own subject sets in the same semester, without position collisions.
-- ============================================================================

alter table subjects add column if not exists college_sheet_id uuid references college_sheets(id) on delete cascade;
alter table subjects drop constraint if exists subjects_semester_id_college_id_position_key;
create unique index if not exists subjects_sheet_position_key on subjects(college_sheet_id, position);


-- >>>>> migrations/0009_subject_views.sql <<<<<

-- ============================================================================
-- Subject-wise drill-down. security_invoker so RLS applies (ops = all,
-- college_staff = own college). Counts + per-subject student lists.
-- ============================================================================

-- Per-subject pass / fail / in-progress counts for a college + semester.
create or replace function subject_stats(p_semester uuid, p_college uuid)
returns table (subject_id uuid, name text, pos int, term text, pass int, fail int, inprog int, total int)
language sql stable security invoker set search_path = public as $$
  select sub.id, sub.name, sub.position, cs.term,
         count(*) filter (where r.passed) ::int,
         count(*) filter (where r.passed = false) ::int,
         count(*) filter (where r.passed is null) ::int,
         count(*) ::int
  from subjects sub
  join college_sheets cs on cs.id = sub.college_sheet_id
  left join results r on r.subject_id = sub.id
  where sub.semester_id = p_semester and sub.college_id = p_college
  group by sub.id, sub.name, sub.position, cs.term
  order by cs.term nulls first, sub.position;
$$;

-- Students for one subject, ordered failed → in-progress → passed, then by name.
create or replace function subject_students(p_subject uuid)
returns table (uid text, full_name text, passed boolean, total_pct numeric, score numeric, grade text)
language sql stable security invoker set search_path = public as $$
  select st.uid, st.full_name, r.passed, r.total_pct, r.score, r.grade
  from results r join students st on st.id = r.student_id
  where r.subject_id = p_subject
  order by (r.passed = false) desc, (r.passed is null) desc, st.full_name nulls last, st.uid;
$$;

grant execute on function subject_stats(uuid, uuid) to authenticated, anon;
grant execute on function subject_students(uuid) to authenticated, anon;


-- >>>>> migrations/0010_recompute.sql <<<<<

-- ============================================================================
-- Recompute each student's per-semester summary from the ACTUAL results across
-- ALL their tabs. Fixes multi-tab colleges (e.g. Aurora Term-I + Term-II) where
-- each tab wrote the summary independently and the last one overwrote the other.
-- overall = pass when 0 failed subjects, fail when >=1, in_progress when none graded.
-- ============================================================================

create or replace function recompute_summaries(p_semester uuid) returns void
language sql security definer set search_path = public as $$
  update result_summaries rs set
    subjects_failed = case when g.graded = 0 then null else g.fails end,
    overall = case when g.graded = 0 then 'in_progress'::overall_status
                   when g.fails = 0 then 'pass'::overall_status
                   else 'fail'::overall_status end,
    updated_at = now()
  from (
    select r.student_id, r.semester_id,
      count(*) filter (where r.passed = false)::int as fails,
      count(*) filter (where r.passed is not null or r.total_pct is not null or r.grade is not null)::int as graded
    from results r
    where r.semester_id = p_semester
    group by r.student_id, r.semester_id
  ) g
  where rs.student_id = g.student_id and rs.semester_id = g.semester_id;
$$;

grant execute on function recompute_summaries(uuid) to service_role, authenticated;


-- >>>>> migrations/0011_semester_sources.sql <<<<<

-- Per-semester source stats for the ops "Sheets" page. security_invoker → RLS applies.
create or replace function semester_sources()
returns table (semester_id uuid, tabs int, colleges int, students int, awaiting int, last_synced timestamptz)
language sql stable security invoker set search_path = public as $$
  select s.id,
    (select count(*) from college_sheets cs where cs.semester_id = s.id)::int,
    (select count(distinct cs.college_id) from college_sheets cs where cs.semester_id = s.id)::int,
    (select count(*) from result_summaries rs where rs.semester_id = s.id)::int,
    (select count(*) from college_sheets cs where cs.semester_id = s.id and coalesce(cs.row_count, 0) = 0)::int,
    (select max(cs.last_synced_at) from college_sheets cs where cs.semester_id = s.id)
  from semesters s;
$$;
grant execute on function semester_sources() to authenticated, anon;


-- >>>>> migrations/0012_flag_cross_college.sql <<<<<

-- Flag students whose UID appears in more than one college tab (source-sheet error:
-- a UUID pasted into two colleges). Surfaces the ⚑ badge so ops fixes it at source.
create or replace function flag_cross_college_uids() returns void
language sql security definer set search_path = public as $$
  update students set is_flagged = true,
    flag_reason = 'Same UID appears in multiple college tabs — verify source sheet'
  where uid in (
    select uid from sync_rows where deleted_at is null
    group by semester_id, uid having count(distinct college_id) > 1
  )
  and coalesce(flag_reason, '') not like 'UID column holds%';
$$;
grant execute on function flag_cross_college_uids() to service_role, authenticated;


-- >>>>> seed.sql <<<<<

-- ============================================================================
-- Seed: the 19 live colleges + the Batch 2025 · Semester 1 spreadsheet.
-- Junk tabs (Sheet10/11/12) and the template tab are intentionally excluded.
-- Re-runnable (idempotent via ON CONFLICT).
-- ============================================================================

insert into colleges (name, code, slug, hue) values
  ('NIAT Chevella', 'N25H02B', 'niat-chevella', 212),
  ('CITY',          'CITY',    'city',          265),
  ('CIET',          'CIET',    'ciet',          150),
  ('NRI',           'NRI',     'nri',            24),
  ('ADYPU',         'ADYPU',   'adypu',         330),
  ('VGU',           'VGU',     'vgu',           190),
  ('Annamacharya',  'ANMC',    'annamacharya',  280),
  ('Takshashila',   'TAKS',    'takshashila',    45),
  ('CDU',           'CDU',     'cdu',           172),
  ('Aurora',        'AUR',     'aurora',        210),
  ('NSRIT',         'NSRIT',   'nsrit',          12),
  ('MRV',           'MRV',     'mrv',           300),
  ('AMET',          'AMET',    'amet',          130),
  ('NIU',           'NIU',     'niu',           255),
  ('Svyasa',        'SVY',     'svyasa',         88),
  ('Crescent',      'CRES',    'crescent',      340),
  ('SGU',           'SGU',     'sgu',           200),
  ('Yenepoya',      'YEN',     'yenepoya',      160)
on conflict (code) do update set name = excluded.name, hue = excluded.hue;

insert into semesters (batch, name, spreadsheet_id) values
  ('2025', 'Semester 1', '1XjpOv2b_cX356l-Ayk64o7l2yEntyL7dvslWpZN4Nx8')
on conflict (batch, name) do update set spreadsheet_id = excluded.spreadsheet_id;

-- Map each live tab → college for this semester.
-- Aurora is one college with two term-sheets.
with s as (select id from semesters where batch='2025' and name='Semester 1')
insert into college_sheets (semester_id, college_id, tab_name, term)
select s.id, c.id, v.tab, v.term
from s
join (values
  ('NIAT Chevella',  'N25H02B', null),
  ('CITY',           'CITY',    null),
  ('CIET',           'CIET',    null),
  ('NRI',            'NRI',     null),
  ('ADYPU',          'ADYPU',   null),
  ('VGU',            'VGU',     null),
  ('Annamacharya',   'ANMC',    null),
  ('Takshashila',    'TAKS',    null),
  ('CDU',            'CDU',     null),
  ('Aurora -Term-I', 'AUR',     'Term I'),
  ('Aurora -Term-II','AUR',     'Term II'),
  ('NSRIT',          'NSRIT',   null),
  ('MRV',            'MRV',     null),
  ('AMET',           'AMET',    null),
  ('NIU',            'NIU',     null),
  ('Svyasa',         'SVY',     null),
  ('Crescent',       'CRES',    null),
  ('SGU',            'SGU',     null),
  ('Yenepoya',       'YEN',     null)
) as v(tab, ccode, term) on true
join colleges c on c.code = v.ccode
on conflict (semester_id, tab_name) do nothing;


-- >>>>> migrations/0013_access_management.sql <<<<<
-- Access management: ops assign roles/college scope from the dashboard UI.
create table if not exists access_grants (
  email      text primary key,
  role       app_role not null default 'college_staff',
  college_id uuid references colleges(id) on delete set null,
  note       text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table access_grants enable row level security;

drop policy if exists p_access_grants_ops on access_grants;
create policy p_access_grants_ops on access_grants for all
  to authenticated using (is_ops()) with check (is_ops());

drop policy if exists p_profiles_ops_update on profiles;
create policy p_profiles_ops_update on profiles for update
  to authenticated using (is_ops()) with check (is_ops());

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r   app_role;
  cid uuid;
begin
  if exists (select 1 from admin_emails a where a.email = new.email) then
    r := 'ops'::app_role; cid := null;
  else
    select ag.role, ag.college_id into r, cid from access_grants ag where ag.email = new.email;
    if not found then r := 'college_staff'::app_role; cid := null; end if;
  end if;

  insert into public.profiles (id, email, full_name, role, college_id)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), r, cid)
  on conflict (id) do update set role = excluded.role, college_id = excluded.college_id;
  return new;
end $$;

grant select, insert, update, delete on access_grants to authenticated;


-- >>>>> migrations/0014_change_events.sql <<<<<
-- Activity log: every CRUD the worker detects in a sheet becomes a row here.
create table if not exists change_events (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid references semesters(id) on delete cascade,
  college_id   uuid references colleges(id)  on delete cascade,
  uid          text,
  student_name text,
  op           text not null,
  changes      jsonb not null default '[]'::jsonb,
  editor       text,
  trigger      text,
  detected_at  timestamptz not null default now()
);
create index if not exists idx_change_events_detected on change_events(detected_at desc);
create index if not exists idx_change_events_college   on change_events(college_id, detected_at desc);

alter table change_events enable row level security;
drop policy if exists p_change_events_read on change_events;
create policy p_change_events_read on change_events for select
  using (is_ops() or college_id = auth_college());

do $$ begin
  alter publication supabase_realtime add table change_events;
exception when duplicate_object then null; end $$;

