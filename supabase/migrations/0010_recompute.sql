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
