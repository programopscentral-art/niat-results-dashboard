-- ============================================================================
-- NIAT Records — COMPLETE Supabase setup (run once in the SQL Editor).
-- Combines: 0001_core, 0002_rls, 0003_realtime, 0004_views, seed.
-- Safe to re-run (idempotent).
-- ============================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> migrations/0001_core.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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
  internal_pct numeric(5,2),
  external_pct numeric(5,2),
  total_pct    numeric(5,2),
  passed       boolean,                       -- null = not yet graded
  updated_at   timestamptz not null default now(),
  unique (student_id, semester_id, subject_id)
);

-- ---------- Per-student summary (dashboards read ONE fast row) ----------
create table if not exists result_summaries (
  student_id      uuid not null references students(id)  on delete cascade,
  semester_id     uuid not null references semesters(id) on delete cascade,
  college_id      uuid references colleges(id) on delete set null,
  total_cgpa      numeric(4,2),
  total_pct       numeric(5,2),
  subjects_failed int,
  overall         overall_status not null default 'in_progress',
  data_complete   boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (student_id, semester_id)
);

-- ---------- Raw sheet rows (audit + change-detection via row hash) ----------
create table if not exists sync_rows (
  semester_id uuid not null references semesters(id) on delete cascade,
  college_id  uuid not null references colleges(id)  on delete cascade,
  uid         text not null,
  row_hash    text not null,
  raw         jsonb not null,
  deleted_at  timestamptz,
  primary key (semester_id, college_id, uid)
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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> migrations/0002_rls.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> migrations/0003_realtime.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> migrations/0004_views.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>> seed.sql <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

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

