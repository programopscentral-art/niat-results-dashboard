import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getSelectedSemester } from '@/lib/semester';
import { grad, passRate, cgpa } from '@/lib/format';
import { LiveRefresh } from './components/LiveRefresh';
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

  // Classify each college for the selected semester:
  //   announced = declared results (pass+fail) outnumber the in-progress ones.
  //   awaiting  = zero students, OR data still (mostly) in progress → "yet to announce".
  const info = (c: College) => {
    const s = byId.get(c.id);
    const total = s?.total ?? 0;
    const graded = (s?.passed ?? 0) + (s?.failed ?? 0);
    const inprog = s?.in_progress ?? 0;
    return { s, total, graded, inprog, announced: graded > 0 && graded >= inprog };
  };

  const announced = rows.filter((c) => info(c).announced);
  // Awaiting: those with students (in progress) first, then the ones with no data at all — very last.
  const awaiting = rows
    .filter((c) => !info(c).announced)
    .sort((a, b) => (info(b).total > 0 ? 1 : 0) - (info(a).total > 0 ? 1 : 0));

  const totalStudents = rows.reduce((a, c) => a + (byId.get(c.id)?.total ?? 0), 0);
  const totalBacklogs = rows.reduce((a, c) => a + (byId.get(c.id)?.backlogs ?? 0), 0);
  const sumPassed = rows.reduce((a, c) => a + (byId.get(c.id)?.passed ?? 0), 0);
  const sumInc = rows.reduce((a, c) => a + (byId.get(c.id)?.in_progress ?? 0), 0);
  const overallPass = passRate(sumPassed, totalStudents, sumInc);

  return (
    <main>
      <LiveRefresh semesterId={sem?.id ?? null} />
      <div className="view">
        <div className="page-h"><h1>Collaborated <span className="g">Colleges</span></h1></div>
        <p className="sub">
          {rows.length} college{rows.length === 1 ? '' : 's'} · {announced.length} with results · {awaiting.length} awaiting · {sem?.batch ?? '2025'} · {sem?.name ?? 'Semester 1'} — synced from Google Sheets in real time.
        </p>
        <div className="livebar"><span className="ln-dot" /> Live · auto-syncs from Google Sheets every ~60&nbsp;seconds — results appear here the moment they're published, no refresh needed.</div>

        <div className="kpis">
          <Kpi lab="Colleges" val={String(rows.length)} foot={`${announced.length} with results · ${awaiting.length} awaiting`} />
          <Kpi lab="Students" val={totalStudents.toLocaleString()} foot="across all colleges" />
          <Kpi lab="Pass rate" val={`${overallPass}%`} foot="of graded students" grad />
          <Kpi lab="Open backlogs" val={totalBacklogs.toLocaleString()} foot="subject failures to clear" />
        </div>

        <div className="cols">
          {announced.map((c) => {
            const s = byId.get(c.id);
            const pr = s ? passRate(s.passed, s.total, s.in_progress) : 0;
            const failed = s?.failed ?? 0;       // overall-fail == students with ≥1 backlog
            const backlogs = s?.backlogs ?? 0;   // total backlog subjects
            const inprog = s?.in_progress ?? 0;
            const total = s?.total ?? 0;
            return (
              <Link key={c.id} href={`/colleges/${c.slug}`} className="col-card">
                <div className="col-top">
                  <div className="badge" style={{ background: grad(c.hue) }}>{c.code.slice(0, 2)}</div>
                  <div><h3>{c.name}</h3><div className="code">{c.code}</div></div>
                </div>
                <div className="col-mini">
                  <div><div className="n">{total}</div><div className="t">students</div></div>
                  <div><div className="n" style={{ color: 'var(--good)' }}>{pr}%</div><div className="t">pass</div></div>
                  <div><div className="n" style={{ color: backlogs ? 'var(--bad)' : 'var(--fg-mute)' }}>{backlogs}</div><div className="t">backlogs</div></div>
                </div>
                <div className="passbar"><i style={{ width: `${pr}%` }} /></div>
                <div className="col-note">
                  {failed > 0
                    ? <><b className="cn-bad">{failed}</b> student{failed === 1 ? '' : 's'} {failed === 1 ? 'has' : 'have'} backlogs · <b className="cn-bad">{failed}</b> failed overall</>
                    : total > 0
                      ? <><b className="cn-good">All {total} graded students passed</b></>
                      : <span className="cn-mute">No results yet</span>}
                </div>
                <div className="col-foot">
                  <span>Avg CGPA <b className="mono">{cgpa(s?.avg_cgpa ?? null)}</b></span>
                  <span>{inprog} awaiting results →</span>
                </div>
              </Link>
            );
          })}
          {announced.length === 0 && awaiting.length === 0 && (
            <div className="empty">No colleges to show yet. Run the worker backfill to import your sheet.</div>
          )}
        </div>

        {awaiting.length > 0 && (
          <section className="await-sec">
            <div className="await-head">
              <h2>Yet to be announced <span className="await-count">{awaiting.length}</span></h2>
              <p>These colleges haven&apos;t published their {sem?.name ?? 'semester'} results yet. They&apos;ll appear above automatically the moment they&apos;re announced — no refresh needed.</p>
            </div>
            <div className="cols">
              {awaiting.map((c) => {
                const { total } = info(c);
                return (
                  <Link key={c.id} href={`/colleges/${c.slug}`} className="await-card">
                    <div className="await-top">
                      <div className="badge muted">{c.code.slice(0, 2)}</div>
                      <div><h3>{c.name}</h3><div className="code">{c.code}</div></div>
                      <span className="await-tag">⏳ Awaiting</span>
                    </div>
                    <div className="await-msg">
                      {total > 0
                        ? <>{total.toLocaleString()} students · <b>results yet to be announced</b></>
                        : <b>Results yet to be announced</b>}
                    </div>
                    <div className="await-note">You&apos;ll receive the results here as soon as they&apos;re published.</div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}
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
