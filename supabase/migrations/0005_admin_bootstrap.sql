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
