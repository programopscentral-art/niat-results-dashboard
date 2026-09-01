import { supa } from './supabase.js';
import { listTabs } from './sheets.js';
import { config } from './config.js';

// ---------------------------------------------------------------------------
// Onboard a NEW semester spreadsheet with zero SQL:
//   - verifies the service account can read the file (lists its tabs)
//   - auto-matches each tab to a college (by name or code; strips term suffix)
//   - registers the semester + college_sheets
//   - reports unmatched tabs so ops can add missing colleges
// Future semesters/batches drop in with one call — this is what makes the
// system scale across sheets without code changes.
// ---------------------------------------------------------------------------

export interface RegisterReport {
  semesterId: string;
  registered: { tab: string; college: string; term: string | null }[];
  unmatchedTabs: string[];   // tabs with no matching college → ops must add the college
  ignored: string[];         // denylisted / template tabs
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Extract { batch, name } from a spreadsheet title using the configured pattern. */
export function parseTitle(title: string): { batch: string; name: string } | null {
  const m = title.match(config.titleRegex);
  if (!m) return null;
  return { batch: m[1], name: `Semester ${m[2]}` };
}

/** Pull a "Term I/II/III" (or 1/2/3) suffix out of a tab name → { base, term }. */
function splitTerm(tab: string): { base: string; term: string | null } {
  const m = tab.match(/[\s-]*term[\s-]*(i{1,3}|1|2|3)\s*$/i);
  if (!m) return { base: tab.trim(), term: null };
  const roman = m[1].toUpperCase();
  const map: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', I: 'I', II: 'II', III: 'III' };
  return { base: tab.slice(0, m.index).replace(/[\s-]+$/, '').trim(), term: `Term ${map[roman] ?? roman}` };
}

export async function registerSemester(input: {
  spreadsheetId: string; batch: string; name: string;
}): Promise<RegisterReport> {
  // 1) Verify readability
  const tabs = await listTabs(input.spreadsheetId);
  if (!tabs.length) throw new Error('Service account cannot read this spreadsheet (share it as Viewer?).');

  // 2) Load college registry
  const { data: colleges } = await supa.from('colleges').select('id, name, code');
  const byName = new Map((colleges ?? []).map((c: any) => [norm(c.name), c]));
  const byCode = new Map((colleges ?? []).map((c: any) => [norm(c.code), c]));

  // 3) Upsert the semester
  const { data: sem, error: semErr } = await supa.from('semesters')
    .upsert({ batch: input.batch, name: input.name, spreadsheet_id: input.spreadsheetId, is_active: true },
      { onConflict: 'batch,name' })
    .select('id').single();
  if (semErr) throw semErr;
  const semesterId = sem!.id as string;

  const registered: RegisterReport['registered'] = [];
  const unmatchedTabs: string[] = [];
  const ignored: string[] = [];
  const rows: any[] = [];

  for (const t of tabs) {
    const title = t.title;
    if (!title || config.tabDenylist.includes(title) || /copy this sheet|mention subject name/i.test(title)) {
      ignored.push(title); continue;
    }
    const { base, term } = splitTerm(title);
    const college = byName.get(norm(base)) || byCode.get(norm(base));
    if (!college) { unmatchedTabs.push(title); continue; }
    rows.push({ semester_id: semesterId, college_id: college.id, tab_name: title, term });
    registered.push({ tab: title, college: college.name, term });
  }

  if (rows.length) {
    const { error } = await supa.from('college_sheets')
      .upsert(rows, { onConflict: 'semester_id,tab_name' });
    if (error) throw error;
  }

  return { semesterId, registered, unmatchedTabs, ignored };
}
