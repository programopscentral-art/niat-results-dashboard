'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export interface SubjectStat {
  subject_id: string; name: string | null; pos: number; term: string | null;
  pass: number; fail: number; inprog: number; total: number;
}
interface SubjRow { uid: string; full_name: string | null; passed: boolean | null; total_pct: number | null; score: number | null; grade: string | null; }
type Filter = 'all' | 'fail' | 'inprog' | 'pass';

export function SubjectExplorer({ subjectStats }:
  { collegeId: string; semesterId: string; subjectStats: SubjectStat[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<SubjectStat | null>(subjectStats[0] ?? null);
  const [rows, setRows] = useState<SubjRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setLoading(true); setFilter('all'); setQ('');
    createClient().rpc('subject_students', { p_subject: sel.subject_id }).then(({ data }) => {
      if (!cancelled) { setRows((data as SubjRow[]) ?? []); setLoading(false); }
    });
    return () => { cancelled = true; };
  }, [sel]);

  const shown = useMemo(() => {
    const qq = q.toLowerCase();
    return rows.filter((r) => {
      const st = r.passed === true ? 'pass' : r.passed === false ? 'fail' : 'inprog';
      if (filter !== 'all' && filter !== st) return false;
      if (qq && !((r.full_name ?? '').toLowerCase().includes(qq) || r.uid.toLowerCase().includes(qq))) return false;
      return true;
    });
  }, [rows, filter, q]);

  const headline = (r: SubjRow) => r.total_pct != null ? `${Math.round(Number(r.total_pct))}%`
    : r.grade ? r.grade : r.score != null ? String(r.score) : '—';

  return (
    <div className="subjexp">
      <div className="subjlist">
        {subjectStats.map((s) => {
          const rate = s.total ? Math.round((s.pass / (s.total - s.inprog || 1)) * 100) : 0;
          const on = sel?.subject_id === s.subject_id;
          return (
            <button key={s.subject_id} className={`subjcard ${on ? 'on' : ''}`} onClick={() => setSel(s)}>
              <div className="sj-name">{s.name ?? `Subject ${s.pos}`}{s.term && <span className="sj-term">{s.term}</span>}</div>
              <div className="sj-counts">
                <span className="c-pass">{s.pass} pass</span>
                <span className="c-fail">{s.fail} fail</span>
                {s.inprog > 0 && <span className="c-inp">{s.inprog} in progress</span>}
              </div>
              <div className="sj-bar"><i style={{ width: `${rate}%` }} /></div>
            </button>
          );
        })}
        {subjectStats.length === 0 && <div className="empty">No subjects for this semester yet.</div>}
      </div>

      <div className="subjdetail">
        {!sel ? <div className="empty">Select a subject.</div> : (
          <>
            <div className="sd-head">
              <h3>{sel.name ?? `Subject ${sel.pos}`}{sel.term ? ` · ${sel.term}` : ''}</h3>
              <div className="sd-sub">{sel.total} students · {sel.pass} passed · {sel.fail} failed{sel.inprog ? ` · ${sel.inprog} in progress` : ''}</div>
            </div>
            <div className="toolbar">
              <div className="search" style={{ maxWidth: 300 }}>
                <input placeholder="Search name or UID…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="chips">
                <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All<span className="c">{sel.total}</span></button>
                <button className={`chip ${filter === 'fail' ? 'on' : ''}`} onClick={() => setFilter('fail')}>Failed<span className="c">{sel.fail}</span></button>
                <button className={`chip ${filter === 'inprog' ? 'on' : ''}`} onClick={() => setFilter('inprog')}>In progress<span className="c">{sel.inprog}</span></button>
                <button className={`chip ${filter === 'pass' ? 'on' : ''}`} onClick={() => setFilter('pass')}>Passed<span className="c">{sel.pass}</span></button>
              </div>
            </div>

            <div className="tablewrap"><div className="tscroll">
              <table>
                <thead><tr><th>Student</th><th>UID</th><th>Result</th><th>Status</th></tr></thead>
                <tbody>
                  {loading && <tr><td colSpan={4}><div className="empty">Loading…</div></td></tr>}
                  {!loading && shown.map((r) => {
                    const st = r.passed === true ? 'pass' : r.passed === false ? 'fail' : 'inprog';
                    return (
                      <tr key={r.uid} onClick={() => router.push(`/students/${encodeURIComponent(r.uid)}`)}>
                        <td className="name">{r.full_name ?? '—'}</td>
                        <td><span className="uid">{r.uid}</span></td>
                        <td className="cg">{headline(r)}</td>
                        <td>
                          {st === 'pass' && <span className="pill pass"><span className="dot" />Pass</span>}
                          {st === 'fail' && <span className="pill fail"><span className="dot" />Fail</span>}
                          {st === 'inprog' && <span className="pill inc"><span className="dot" />In progress</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && shown.length === 0 && <tr><td colSpan={4}><div className="empty">No students match.</div></td></tr>}
                </tbody>
              </table>
            </div></div>
          </>
        )}
      </div>
    </div>
  );
}
