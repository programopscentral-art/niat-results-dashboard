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
