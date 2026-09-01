import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSelectedSemester } from '@/lib/semester';
import type { Student, Summary, StudentRow } from '@/lib/types';
import { CollegeExplorer } from './CollegeExplorer';

export const dynamic = 'force-dynamic';

export default async function CollegePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: college } = await supabase
    .from('colleges').select('id, name, code, slug, hue').eq('slug', slug).maybeSingle();
  if (!college) notFound();

  const sem = await getSelectedSemester();

  const [{ data: students }, { data: summaries }] = await Promise.all([
    supabase.from('students')
      .select('id, uid, full_name, university_id, bits_id, college_id, is_flagged, flag_reason')
      .eq('college_id', college.id),
    supabase.from('result_summaries')
      .select('student_id, semester_id, college_id, total_cgpa, total_pct, subjects_failed, overall, data_complete')
      .eq('college_id', college.id).eq('semester_id', sem?.id ?? ''),
  ]);

  const { data: subjectStats } = await supabase.rpc('subject_stats', { p_semester: sem?.id ?? '', p_college: college.id });

  const byStudent = new Map<string, Summary>((summaries ?? []).map((s: any) => [s.student_id, s]));
  const rows: StudentRow[] = ((students ?? []) as Student[])
    .map((s) => ({ ...s, summary: byStudent.get(s.id) ?? null }))
    .sort((a, b) => (a.full_name ?? a.uid).localeCompare(b.full_name ?? b.uid));

  return (
    <main>
      <div className="view">
        <Link href="/" className="back">← All colleges</Link>
        <div className="crumbs"><Link href="/">Colleges</Link> / <span>{college.name}</span></div>
        <div className="page-h"><h1><span className="g">{college.name}</span></h1></div>
        <p className="sub">{college.code} · {rows.length} students · {sem?.batch ?? '2025'} {sem?.name ?? 'Semester 1'}</p>

        <CollegeExplorer
          collegeId={college.id}
          semesterId={sem?.id ?? ''}
          slug={college.slug}
          initial={rows}
          subjectStats={subjectStats ?? []}
        />
      </div>
    </main>
  );
}
