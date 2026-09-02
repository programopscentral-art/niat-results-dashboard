import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ActivityFeed, type Event, type CollegeOpt } from './ActivityFeed';

export const dynamic = 'force-dynamic';

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isOps = !!me && ['ops', 'super_admin'].includes(me.role);

  const [{ data: rows }, { data: colleges }] = await Promise.all([
    supabase.from('change_events')
      .select('id, uid, student_name, op, changes, editor, trigger, detected_at, college_id, colleges(name, slug), semesters(batch, name)')
      .order('detected_at', { ascending: false })
      .limit(200),
    supabase.from('colleges').select('id, name, slug').eq('is_active', true).order('name'),
  ]);

  const events: Event[] = (rows ?? []).map((r: any) => ({
    id: r.id, uid: r.uid, studentName: r.student_name, op: r.op,
    changes: Array.isArray(r.changes) ? r.changes : [],
    editor: r.editor, trigger: r.trigger, detectedAt: r.detected_at,
    collegeId: r.college_id,
    collegeName: r.colleges?.name ?? '—', collegeSlug: r.colleges?.slug ?? null,
    semester: r.semesters ? `${r.semesters.batch} · ${r.semesters.name}` : null,
  }));
  const opts: CollegeOpt[] = (colleges ?? []).map((c: any) => ({ id: c.id, name: c.name }));

  return <ActivityFeed initial={events} colleges={opts} isOps={isOps} />;
}
