-- ============================================================================
-- Access management: ops assign roles/college scope from the dashboard UI.
--   • access_grants — pre-authorize an email BEFORE first login (applied by the
--     signup trigger, so a new user sees the right dashboard the instant they log in).
--   • ops can UPDATE any profile (writes were service-role only before) so changes
--     to already-logged-in users take effect on their next page load.
-- ============================================================================

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

-- Let ops edit anyone's role/college from the UI (RLS previously allowed no writes).
drop policy if exists p_profiles_ops_update on profiles;
create policy p_profiles_ops_update on profiles for update
  to authenticated using (is_ops()) with check (is_ops());

-- Signup handler: admin_emails ⇒ ops; else a pre-authorized grant ⇒ its role/college;
-- else college_staff with no college (no data until an admin grants access).
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
