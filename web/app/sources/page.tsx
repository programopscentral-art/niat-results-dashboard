import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SourcesList, type Source } from './SourcesList';

export const dynamic = 'force-dynamic';

export default async function SourcesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || !['ops', 'super_admin'].includes(profile.role)) redirect('/');

  const [{ data: sems }, { data: stats }] = await Promise.all([
    supabase.from('semesters').select('id, batch, name, spreadsheet_id, source_title, created_at').order('created_at', { ascending: false }),
    supabase.rpc('semester_sources'),
  ]);
  const statById = new Map<string, any>((stats ?? []).map((s: any) => [s.semester_id, s]));

  const sources: Source[] = (sems ?? []).map((s: any) => {
    const st = statById.get(s.id) ?? {};
    return {
      id: s.id, batch: s.batch, name: s.name, title: s.source_title,
      spreadsheetId: s.spreadsheet_id,
      url: `https://docs.google.com/spreadsheets/d/${s.spreadsheet_id}/edit`,
      tabs: st.tabs ?? 0, colleges: st.colleges ?? 0, students: st.students ?? 0,
      awaiting: st.awaiting ?? 0, lastSynced: st.last_synced ?? null,
    };
  });

  return (
    <main>
      <div className="view">
        <div className="page-h"><h1>Source <span className="g">Sheets</span></h1></div>
        <p className="sub">Every semester's Google Sheet, synced read-only every ~60 seconds. New semesters appear here automatically.</p>
        <SourcesList sources={sources} serviceAccount="niat-sync@niat-records.iam.gserviceaccount.com" />
      </div>
    </main>
  );
}
