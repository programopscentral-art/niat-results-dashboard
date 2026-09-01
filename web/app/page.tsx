import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSelectedSemester } from '@/lib/semester';
import { grad, passRate, cgpa } from '@/lib/format';
import type { CollegeOverview, College } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles').select('role, college_id').eq('id', user!.id).maybeSingle();
  const isStaff = profile?.role === 'college_staff';

  const sem = await getSelectedSemester();

  // Base list of colleges (RLS lets staff read all names; we scope below).
  let colQ = supabase.from('colleges').select('id, name, slug, code, hue').eq('is_active', true).order('name');
  if (isStaff && profile?.college_id) colQ = colQ.eq('id', profile.college_id);
  const { data: colleges } = await colQ;

  // Stats for the active semester (RLS already limits staff to their own).
  const { data: stats } = await supabase
    .from('v_college_overview').select('*').eq('semester_id', sem?.id ?? '');
  const byId = new Map<string, CollegeOverview>((stats ?? []).map((s: any) => [s.college_id, s]));

  const rows = (colleges ?? []) as College[];
  const totalStudents = rows.reduce((a, c) => a + (byId.get(c.id)?.total ?? 0), 0);
  const totalBacklogs = rows.reduce((a, c) => a + (byId.get(c.id)?.backlogs ?? 0), 0);
  const sumPassed = rows.reduce((a, c) => a + (byId.get(c.id)?.passed ?? 0), 0);
  const sumInc = rows.reduce((a, c) => a + (byId.get(c.id)?.in_progress ?? 0), 0);
  const overallPass = passRate(sumPassed, totalStudents, sumInc);

  return (
    <main>
      <div className="view">
        <div className="page-h"><h1>Collaborated <span className="g">Colleges</span></h1></div>
        <p className="sub">
          {rows.length} college{rows.length === 1 ? '' : 's'} · {sem?.batch ?? '2025'} · {sem?.name ?? 'Semester 1'} — synced from Google Sheets in real time.
        </p>
        <div className="livebar"><span className="ln-dot" /> Live · auto-syncs from Google Sheets every ~60&nbsp;seconds — enter data in the sheet and it appears here, no refresh needed.</div>

        <div className="kpis">
          <Kpi lab="Colleges" val={String(rows.length)} foot="live tabs tracked" />
          <Kpi lab="Students" val={totalStudents.toLocaleString()} foot="across all colleges" />
          <Kpi lab="Pass rate" val={`${overallPass}%`} foot="of graded students" grad />
          <Kpi lab="Open backlogs" val={totalBacklogs.toLocaleString()} foot="subject failures to clear" />
        </div>

        <div className="cols">
          {rows.map((c) => {
            const s = byId.get(c.id);
            const pr = s ? passRate(s.passed, s.total, s.in_progress) : 0;
            return (
              <Link key={c.id} href={`/colleges/${c.slug}`} className="col-card">
                <div className="col-top">
                  <div className="badge" style={{ background: grad(c.hue) }}>{c.code.slice(0, 2)}</div>
                  <div><h3>{c.name}</h3><div className="code">{c.code}</div></div>
                </div>
                <div className="col-mini">
                  <div><div className="n">{s?.total ?? 0}</div><div className="t">students</div></div>
                  <div><div className="n" style={{ color: 'var(--good)' }}>{pr}%</div><div className="t">pass</div></div>
                  <div><div className="n" style={{ color: (s?.backlogs ?? 0) ? 'var(--bad)' : 'var(--fg-mute)' }}>{s?.backlogs ?? 0}</div><div className="t">backlogs</div></div>
                </div>
                <div className="passbar"><i style={{ width: `${pr}%` }} /></div>
                <div className="col-foot">
                  <span>Avg CGPA <b className="mono">{cgpa(s?.avg_cgpa ?? null)}</b></span>
                  <span>{s?.in_progress ?? 0} in progress →</span>
                </div>
              </Link>
            );
          })}
          {rows.length === 0 && <div className="empty">No colleges to show yet. Run the worker backfill to import your sheet.</div>}
        </div>
      </div>
    </main>
  );
}

function Kpi({ lab, val, foot, grad }: { lab: string; val: string; foot: string; grad?: boolean }) {
  return (
    <div className="kpi">
      <div className="lab">{lab}</div>
      <div className={`val tnum${grad ? ' g' : ''}`}>{val}</div>
      <div className="foot">{foot}</div>
    </div>
  );
}
