'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { StudentRow, Summary } from '@/lib/types';
import { cgpa, passRate } from '@/lib/format';

type Filter = 'all' | 'pass' | 'backlog' | 'fail' | 'inc';
type Sort = 'name' | 'uid' | 'cgpa' | 'backlog';

export function StudentsClient({
  collegeId, semesterId, slug, initial,
}: { collegeId: string; semesterId: string; slug: string; initial: StudentRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<StudentRow[]>(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [q, setQ] = useState('');
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const flashTimers = useRef<Record<string, any>>({});

  // ---- Realtime: live-update this college's summaries & students ----
  useEffect(() => {
    const supabase = createClient();
    const markFlash = (id: string) => {
      setFlash((prev) => new Set(prev).add(id));
      clearTimeout(flashTimers.current[id]);
      flashTimers.current[id] = setTimeout(() => {
        setFlash((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }, 1600);
    };
    const channel = supabase
      .channel(`college-${collegeId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'result_summaries', filter: `college_id=eq.${collegeId}` },
        (payload) => {
          const s = payload.new as Summary;
          if (!s?.student_id) return;
          setRows((prev) => prev.map((r) => r.id === s.student_id ? { ...r, summary: s } : r));
          markFlash(s.student_id);
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'students', filter: `college_id=eq.${collegeId}` },
        (payload) => {
          const st = payload.new as any;
          if (!st?.id) return;
          setRows((prev) => {
            const exists = prev.some((r) => r.id === st.id);
            if (exists) return prev.map((r) => r.id === st.id ? { ...r, ...st } : r);
            return [...prev, { ...st, summary: null }];
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [collegeId]);

  const counts = useMemo(() => {
    const total = rows.length;
    const passed = rows.filter((r) => r.summary?.overall === 'pass').length;
    const failed = rows.filter((r) => r.summary?.overall === 'fail').length;
    const inc = rows.filter((r) => !r.summary || r.summary.overall === 'in_progress').length;
    const backlog = rows.filter((r) => (r.summary?.subjects_failed ?? 0) > 0).length;
    const done = rows.filter((r) => r.summary?.data_complete);
    const avg = done.length ? done.reduce((a, b) => a + (b.summary?.total_cgpa ?? 0), 0) / done.length : 0;
    const backlogs = rows.reduce((a, b) => a + (b.summary?.subjects_failed ?? 0), 0);
    return { total, passed, failed, inc, backlog, avg, backlogs, pr: passRate(passed, total, inc) };
  }, [rows]);

  const shown = useMemo(() => {
    const qq = q.toLowerCase();
    let out = rows.filter((r) => {
      const ov = r.summary?.overall ?? 'in_progress';
      if (filter === 'pass' && ov !== 'pass') return false;
      if (filter === 'fail' && ov !== 'fail') return false;
      if (filter === 'inc' && ov !== 'in_progress') return false;
      if (filter === 'backlog' && !((r.summary?.subjects_failed ?? 0) > 0)) return false;
      if (qq && !(
        (r.full_name ?? '').toLowerCase().includes(qq) ||
        r.uid.toLowerCase().includes(qq) ||
        (r.university_id ?? '').toLowerCase().includes(qq)
      )) return false;
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === 'cgpa') return (b.summary?.total_cgpa ?? 0) - (a.summary?.total_cgpa ?? 0);
      if (sort === 'backlog') return (b.summary?.subjects_failed ?? 0) - (a.summary?.subjects_failed ?? 0);
      if (sort === 'uid') return a.uid.localeCompare(b.uid);
      return (a.full_name ?? a.uid).localeCompare(b.full_name ?? b.uid);
    });
    return out;
  }, [rows, filter, sort, q]);

  const chip = (k: Filter, lab: string, c: number) => (
    <button className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{lab}<span className="c">{c}</span></button>
  );

  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="lab">Students</div><div className="val tnum">{counts.total}</div><div className="foot">enrolled this semester</div></div>
        <div className="kpi"><div className="lab">Pass rate</div><div className="val tnum g">{counts.pr}%</div><div className="foot">{counts.passed} of {counts.total - counts.inc} graded</div></div>
        <div className="kpi"><div className="lab">Avg CGPA</div><div className="val tnum">{cgpa(counts.avg)}</div><div className="foot">graded students only</div></div>
        <div className="kpi"><div className="lab">Open backlogs</div><div className="val tnum">{counts.backlogs}</div><div className="foot">{counts.backlog} students have backlogs · {counts.failed} failed overall</div></div>
      </div>

      <div className="toolbar">
        <div className="search" style={{ maxWidth: 320 }}>
          <input placeholder="Search name, UID, University ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="chips">
          {chip('all', 'All', counts.total)}
          {chip('pass', 'Passed', counts.passed)}
          {chip('backlog', 'Has backlogs', counts.backlog)}
          {chip('fail', 'Failed', counts.failed)}
          {chip('inc', 'In progress', counts.inc)}
        </div>
      </div>

      <div className="tablewrap"><div className="tscroll">
        <table>
          <thead><tr>
            <th onClick={() => setSort('name')}>Student</th>
            <th onClick={() => setSort('uid')}>UID</th>
            <th>University ID</th>
            <th onClick={() => setSort('cgpa')}>CGPA</th>
            <th onClick={() => setSort('backlog')}>Backlogs</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            {shown.map((r) => {
              const ov = r.summary?.overall ?? 'in_progress';
              return (
                <tr key={r.id} className={flash.has(r.id) ? 'flash' : ''}
                  onClick={() => router.push(`/students/${encodeURIComponent(r.uid)}`)}>
                  <td className="name">{r.full_name ?? '—'}{r.is_flagged && <span className="flag" title={r.flag_reason ?? ''}>⚑</span>}</td>
                  <td><span className="uid">{r.uid}</span></td>
                  <td><span className="uid">{r.university_id ?? '—'}</span></td>
                  <td className="cg">{cgpa(r.summary?.total_cgpa ?? null)}</td>
                  <td><span className={`bk ${r.summary?.subjects_failed ? 'w' : 'z'}`}>{r.summary?.subjects_failed ?? '—'}</span></td>
                  <td>
                    {ov === 'pass' && <span className="pill pass"><span className="dot" />Passed</span>}
                    {ov === 'fail' && <span className="pill fail"><span className="dot" />Failed</span>}
                    {ov === 'in_progress' && <span className="pill inc"><span className="dot" />In progress</span>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={6}><div className="empty">No students match this filter.</div></td></tr>}
          </tbody>
        </table>
      </div></div>
    </>
  );
}
