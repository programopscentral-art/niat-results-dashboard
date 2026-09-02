import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AccessManager, type UserRow, type GrantRow, type CollegeOpt } from './AccessManager';

export const dynamic = 'force-dynamic';

export default async function AccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!me || !['ops', 'super_admin'].includes(me.role)) redirect('/');

  const [{ data: profiles }, { data: colleges }, { data: grants }] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, role, college_id').order('email'),
    supabase.from('colleges').select('id, name').eq('is_active', true).order('name'),
    supabase.from('access_grants').select('email, role, college_id, created_at').order('created_at', { ascending: false }),
  ]);

  const users: UserRow[] = (profiles ?? []).map((p: any) => ({
    id: p.id, email: p.email ?? '', name: p.full_name ?? '', role: p.role, collegeId: p.college_id,
  }));
  const opts: CollegeOpt[] = (colleges ?? []).map((c: any) => ({ id: c.id, name: c.name }));

  // Pending = pre-authorized emails that haven't logged in yet.
  const known = new Set(users.map((u) => u.email.toLowerCase()));
  const pending: GrantRow[] = (grants ?? [])
    .filter((g: any) => !known.has(String(g.email).toLowerCase()))
    .map((g: any) => ({ email: g.email, role: g.role, collegeId: g.college_id }));

  return (
    <AccessManager meEmail={user.email ?? ''} users={users} pending={pending} colleges={opts} />
  );
}
