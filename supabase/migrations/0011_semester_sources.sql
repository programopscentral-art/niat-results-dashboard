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
