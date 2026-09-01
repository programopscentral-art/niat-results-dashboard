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
