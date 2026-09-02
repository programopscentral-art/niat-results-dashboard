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
