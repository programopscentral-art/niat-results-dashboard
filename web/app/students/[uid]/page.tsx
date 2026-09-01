import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSelectedSemester } from '@/lib/semester';
import { grad, initials, cgpa } from '@/lib/format';
import type { Subject, Result } from '@/lib/types';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';

export default async function StudentPage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = await params;
  const decoded = decodeURIComponent(uid);
  const supabase = await createClient();

  const { data: student } = await supabase
    .from('students')
    .select('id, uid, full_name, university_id, bits_id, college_id, is_flagged, flag_reason')
    .eq('uid', decoded).maybeSingle();
  if (!student) notFound();

  const { data: college } = await supabase
    .from('colleges').select('id, name, slug, code, hue').eq('id', student.college_id).maybeSingle();
  const sem = await getSelectedSemester();

  const [{ data: subjects }, { data: results }, { data: summary }, { data: allSummaries }] = await Promise.all([
    supabase.from('subjects').select('id, position, name')
      .eq('college_id', student.college_id).eq('semester_id', sem?.id ?? '').order('position'),
    supabase.from('results').select('subject_id, internal_pct, external_pct, total_pct, passed, score, grade, metrics')
      .eq('student_id', student.id).eq('semester_id', sem?.id ?? ''),
    supabase.from('result_summaries').select('total_cgpa, subjects_failed, overall, data_complete')
      .eq('student_id', student.id).eq('semester_id', sem?.id ?? '').maybeSingle(),
    // Cross-semester journey: every semester this student has a record in.
    supabase.from('result_summaries')
      .select('semester_id, total_cgpa, subjects_failed, overall, semester:semesters(name, batch, created_at)')
      .eq('student_id', student.id),
  ]);

  const journey = ((allSummaries ?? []) as any[])
    .filter((r) => r.semester)
    .sort((a, b) => String(a.semester.created_at).localeCompare(String(b.semester.created_at)));

  const bySubject = new Map<string, Result>((results ?? []).map((r: any) => [r.subject_id, r]));
  const subs = (subjects ?? []) as Subject[];
  const failedNames = subs
    .filter((s) => bySubject.get(s.id)?.passed === false)
    .map((s) => s.name ?? `Subject ${s.position}`);
  const overall = summary?.overall ?? 'in_progress';
  const hue = college?.hue ?? 212;

  return (
    <main>
      <div className="view">
        <Link href={college ? `/colleges/${college.slug}` : '/'} className="back">← {college?.name ?? 'Back'}</Link>
        <div className="crumbs">
          <Link href="/">Colleges</Link> / {college && <><Link href={`/colleges/${college.slug}`}>{college.name}</Link> / </>}
          <span>{student.full_name ?? student.uid}</span>
        </div>

        <div className="st-toolbar no-print"><PrintButton /></div>

        <div className="st-head">
          <div className="avatar" style={{ background: grad(hue) }}>{initials(student.full_name ?? student.uid)}</div>
          <div className="st-id">
            <h1>{student.full_name ?? student.uid}</h1>
            <div className="ids">
              <span>UID <b>{student.uid}</b></span>
              <span>University ID <b>{student.university_id ?? '—'}</b></span>
              {student.bits_id && <span>BITS ID <b>{student.bits_id}</b></span>}
              <span>College <b>{college?.name ?? '—'}</b></span>
            </div>
          </div>
          <div className="st-cg"><div className="big g">{cgpa(summary?.total_cgpa ?? null)}</div><div className="t">CGPA</div></div>
        </div>

        {student.is_flagged && (
          <div className="alert warn"><span style={{ fontSize: '1.3rem' }}>⚑</span>
            <div><b>Data-quality flag.</b> {student.flag_reason ?? 'This record was flagged during sync — verify the source sheet.'}</div></div>
        )}
        {overall === 'in_progress' ? (
          <div className="alert warn"><span style={{ fontSize: '1.3rem' }}>⧗</span>
            <div><b>Results in progress.</b> Subject scores haven’t been entered in the sheet yet — they appear here the moment ops fills them in.</div></div>
        ) : failedNames.length > 0 ? (
          <div className="alert"><span style={{ fontSize: '1.3rem' }}>⚠</span>
            <div><b>{failedNames.length} active backlog{failedNames.length > 1 ? 's' : ''}.</b> {failedNames.join(', ')} — must be cleared.</div></div>
        ) : (
          <div className="alert ok"><span style={{ fontSize: '1.3rem' }}>✓</span>
            <div><b>All subjects cleared.</b> No backlogs this semester — clean record.</div></div>
        )}

        {journey.length >= 2 && (
          <>
            <div className="page-h"><h2 className="sec-h">Academic journey</h2></div>
            <div className="timeline">
              {journey.map((j: any, i: number) => {
                const prev = i > 0 ? journey[i - 1] : null;
                const cur = j.total_cgpa == null ? null : Number(j.total_cgpa);
                const prv = prev?.total_cgpa == null ? null : Number(prev?.total_cgpa);
                const trend = cur != null && prv != null ? (cur > prv ? 'up' : cur < prv ? 'down' : 'flat') : null;
                const isSel = j.semester_id === sem?.id;
                return (
                  <div key={j.semester_id} className={`tl-node ${isSel ? 'sel' : ''}`}>
                    <div className="tl-sem">{j.semester?.batch} · {j.semester?.name}</div>
                    <div className="tl-cg">
                      {cgpa(j.total_cgpa)}
                      {trend && <span className={`tl-trend ${trend}`}>{trend === 'up' ? '▲' : trend === 'down' ? '▼' : '▬'}</span>}
                    </div>
                    <div className="tl-meta">
                      {j.overall === 'pass' && <span className="pill pass"><span className="dot" />Passed</span>}
                      {j.overall === 'fail' && <span className="pill fail"><span className="dot" />Failed</span>}
                      {j.overall === 'in_progress' && <span className="pill inc"><span className="dot" />In progress</span>}
                      <span className="tl-bk">{j.subjects_failed ?? 0} backlog{(j.subjects_failed ?? 0) === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="page-h"><h2 className="sec-h">Subject-wise performance <span className="sec-sem">{sem?.batch} · {sem?.name}</span></h2></div>
        <div className="legend">
          <span style={{ color: 'var(--fg-mute)' }}>Each subject shows its recorded result and the exact breakdown from the sheet — marks, grades, or points as your college reports them.</span>
        </div>

        <div className="subs">
          {subs.map((s) => {
            const r = bySubject.get(s.id);
            const name = s.name ?? `Subject ${s.position}`;
            const hasData = r && r.metrics && Object.keys(r.metrics).length > 0;
            if (!hasData) {
              return (
                <div key={s.id} className="subj">
                  <div className="top"><h4>{name}</h4><span className="pos mono">S{s.position}</span></div>
                  <div style={{ color: 'var(--fg-mute)', fontSize: '.85rem', padding: '14px 0', textAlign: 'center' }}>Awaiting entry</div>
                </div>
              );
            }
            const passed = r!.passed;
            const isMarks = r!.internal_pct != null || r!.external_pct != null;
            const headline = r!.total_pct != null ? `${Math.round(Number(r!.total_pct))}%`
              : r!.grade ? r!.grade
              : r!.score != null ? String(r!.score) : '—';
            return (
              <div key={s.id} className={`subj ${passed === false ? 'failed' : ''}`}>
                <div className="top"><h4>{name}</h4>
                  {passed === true && <span className="pill pass"><span className="dot" />Pass</span>}
                  {passed === false && <span className="pill fail"><span className="dot" />Fail</span>}
                  {passed == null && (r!.grade
                    ? <span className="pill inc"><span className="dot" />{r!.grade}</span>
                    : <span className="pos mono">S{s.position}</span>)}
                </div>

                {isMarks ? (
                  <>
                    {r!.internal_pct != null && <Metric label="Internal" val={r!.internal_pct} cls="int" />}
                    {r!.external_pct != null && <Metric label="External" val={r!.external_pct} cls="ext" />}
                    {r!.total_pct != null && <Metric label="Total" val={r!.total_pct} cls="tot" />}
                  </>
                ) : (
                  <div className="mkv">
                    {Object.entries(r!.metrics!).map(([k, v]) => (
                      <div key={k} className="mkv-row"><span>{k}</span><b>{String(v)}</b></div>
                    ))}
                  </div>
                )}

                <div className="total">
                  <span style={{ color: 'var(--fg-soft)', fontSize: '.8rem' }}>Result</span>
                  <span className="v" style={{ color: passed === false ? 'var(--bad)' : 'var(--good)' }}>{headline}</span>
                </div>
              </div>
            );
          })}
          {subs.length === 0 && <div className="empty">No subjects defined for this college/semester yet.</div>}
        </div>
      </div>
    </main>
  );
}

function Metric({ label, val, cls }: { label: string; val: number | null; cls: string }) {
  const v = val == null ? 0 : Math.round(Number(val));
  return (
    <div className="metric">
      <div className="r"><span>{label}</span><b>{val == null ? '—' : `${v}%`}</b></div>
      <div className="mbar"><i className={cls} style={{ width: `${Math.min(100, v)}%` }} /></div>
    </div>
  );
}
