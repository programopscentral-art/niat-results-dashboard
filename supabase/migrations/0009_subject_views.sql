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
