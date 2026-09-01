export type Overall = 'pass' | 'fail' | 'in_progress';
export type Role = 'super_admin' | 'ops' | 'college_staff';

export interface Profile { id: string; email: string | null; role: Role; college_id: string | null; }

export interface College { id: string; name: string; slug: string; code: string; hue: number; }

export interface CollegeOverview extends College {
  college_id: string;
  semester_id: string | null;
  total: number;
  passed: number;
  failed: number;
  in_progress: number;
  backlogs: number;
  avg_cgpa: number | null;
}

export interface Student {
  id: string; uid: string; full_name: string | null;
  university_id: string | null; bits_id: string | null;
  college_id: string | null; is_flagged: boolean; flag_reason: string | null;
}

export interface Summary {
  student_id: string; semester_id: string; college_id: string | null;
  total_cgpa: number | null; total_pct: number | null;
  subjects_failed: number | null; overall: Overall; data_complete: boolean;
}

export interface StudentRow extends Student {
  summary: Summary | null;
}

export interface Subject { id: string; position: number; name: string | null; }

export interface Result {
  subject_id: string; internal_pct: number | null; external_pct: number | null;
  total_pct: number | null; passed: boolean | null;
  score: number | null; grade: string | null;
  metrics: Record<string, string | number> | null;
}
