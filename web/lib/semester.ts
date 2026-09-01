import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';

export interface Semester { id: string; batch: string; name: string; label: string; }

/** All active semesters, oldest → newest. */
export async function getSemesters(): Promise<Semester[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('semesters').select('id, batch, name, created_at')
    .eq('is_active', true).order('created_at', { ascending: true });
  return (data ?? []).map((s: any) => ({ id: s.id, batch: s.batch, name: s.name, label: `${s.batch} · ${s.name}` }));
}

/** The semester the viewer has selected (cookie), else the latest. */
export async function getSelectedSemester(): Promise<Semester | null> {
  const sems = await getSemesters();
  if (!sems.length) return null;
  const ck = (await cookies()).get('sel_sem')?.value;
  return sems.find((s) => s.id === ck) ?? sems[sems.length - 1];
}
