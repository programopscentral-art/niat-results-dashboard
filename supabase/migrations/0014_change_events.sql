-- ============================================================================
-- Activity log: every CRUD the worker detects in a Google Sheet becomes a row
-- here — which college, which student (uid + name), what fields changed
-- (old → new), when it was detected, and (best-effort) who last edited the sheet.
-- Streamed live to the dashboard via Realtime. Written by the worker (service
-- role) only; ops read all, college_staff read their own college.
-- ============================================================================

create table if not exists change_events (
  id           uuid primary key default gen_random_uuid(),
  semester_id  uuid references semesters(id) on delete cascade,
  college_id   uuid references colleges(id)  on delete cascade,
  uid          text,                                   -- student UID that changed
  student_name text,
  op           text not null,                          -- 'insert' | 'update' | 'delete'
  changes      jsonb not null default '[]'::jsonb,     -- [{field, old, new}]
  editor       text,                                   -- sheet's last modifying user (best-effort)
  trigger      text,                                   -- 'cron' | 'webhook'
  detected_at  timestamptz not null default now()
);

create index if not exists idx_change_events_detected on change_events(detected_at desc);
create index if not exists idx_change_events_college   on change_events(college_id, detected_at desc);

alter table change_events enable row level security;

drop policy if exists p_change_events_read on change_events;
create policy p_change_events_read on change_events for select
  using (is_ops() or college_id = auth_college());

-- Realtime stream (RLS above still applies, so staff only receive their college's events).
do $$ begin
  alter publication supabase_realtime add table change_events;
exception when duplicate_object then null; end $$;
