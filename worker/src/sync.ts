import { supa } from './supabase.js';
import { getTabValues, getTabValuesBatch, listTabs } from './sheets.js';
import { parseTab, type ParsedStudent } from './parser.js';
import { rowHash } from './hash.js';
import { config } from './config.js';

interface SheetRow {
  id: string;
  college_id: string;
  tab_name: string;
  term: string | null;
}
interface SemesterRow { id: string; spreadsheet_id: string; }

export async function resolveSemesterBySpreadsheet(spreadsheetId: string): Promise<SemesterRow | null> {
  const { data } = await supa.from('semesters').select('id, spreadsheet_id')
    .eq('spreadsheet_id', spreadsheetId).eq('is_active', true).maybeSingle();
  return data ?? null;
}

async function sheetsForSemester(semesterId: string, tabName?: string): Promise<SheetRow[]> {
  let q = supa.from('college_sheets').select('id, college_id, tab_name, term').eq('semester_id', semesterId);
  if (tabName) q = q.eq('tab_name', tabName);
  const { data } = await q;
  return (data ?? []) as SheetRow[];
}

/** Detect brand-new tabs not yet in the registry, so ops can be alerted. */
export async function detectNewTabs(sem: SemesterRow): Promise<string[]> {
  const tabs = await listTabs(sem.spreadsheet_id);
  const known = new Set((await sheetsForSemester(sem.id)).map((s) => s.tab_name));
  return tabs
    .map((t) => t.title)
    .filter((title) => title && !known.has(title) && !config.tabDenylist.includes(title));
}

function summaryKey(s: ParsedStudent) {
  return { uid: s.uid, name: s.fullName, uni: s.universityId, bits: s.bitsId,
    subs: s.subjects.map((x) => [x.internal, x.external, x.total, x.passed, x.grade, x.score]),
    cgpa: s.cgpa, tot: s.totalPct, failed: s.subjectsFailed, overall: s.overall };
}

export interface SyncResult {
  tab: string; processed: number; inserted: number; updated: number; deleted: number;
  flagged: number; warnings: string[];
}

/** Sync a single tab end-to-end (reads the tab, then delegates). */
export async function syncTab(sem: SemesterRow, sheet: SheetRow, trigger = 'webhook'): Promise<SyncResult> {
  const grid = await getTabValues(sem.spreadsheet_id, sheet.tab_name);
  return syncTabWithGrid(sem, sheet, grid, trigger);
}

/** Sync a single tab from an already-fetched grid (used by the batched cron). */
export async function syncTabWithGrid(
  sem: SemesterRow, sheet: SheetRow, grid: string[][], trigger = 'cron',
): Promise<SyncResult> {
  const run = await startRun(sem.id, sheet.college_id, trigger);
  const warnings: string[] = [];
  let inserted = 0, updated = 0, deleted = 0, flagged = 0;

  try {
    const parsed = parseTab(grid);
    warnings.push(...parsed.warnings);

    // Dedupe students by UID — some tabs list a student twice (keep the last row).
    // Without this, a single upsert batch hits "ON CONFLICT ... cannot affect row twice".
    const byUid = new Map<string, (typeof parsed.students)[number]>();
    for (const s of parsed.students) byUid.set(s.uid, s);
    const students = [...byUid.values()];
    const dupes = parsed.students.length - students.length;
    if (dupes > 0) warnings.push(`${dupes} duplicate UID row(s) collapsed`);

    // 1) Upsert subjects for this (semester, college); map position -> subject_id
    const subjectRows = parsed.subjectNames.map((name, i) => ({
      semester_id: sem.id, college_id: sheet.college_id, college_sheet_id: sheet.id, position: i + 1, name,
    }));
    let posToSubjectId = new Map<number, string>();
    if (subjectRows.length) {
      const { data: subs, error } = await supa.from('subjects')
        .upsert(subjectRows, { onConflict: 'college_sheet_id,position' })
        .select('id, position');
      if (error) throw error;
      posToSubjectId = new Map((subs ?? []).map((s: any) => [s.position, s.id]));
    }

    // 2) Existing hashes for change-detection
    const { data: existingRows } = await supa.from('sync_rows')
      .select('uid, row_hash, deleted_at').eq('semester_id', sem.id).eq('college_id', sheet.college_id);
    const prevHash = new Map<string, { hash: string; deleted: boolean }>();
    (existingRows ?? []).forEach((r: any) => prevHash.set(r.uid, { hash: r.row_hash, deleted: !!r.deleted_at }));

    // 3) Upsert all students (identity) to obtain ids
    const studentRows = students.map((s) => ({
      uid: s.uid, full_name: s.fullName, university_id: s.universityId, bits_id: s.bitsId,
      college_id: sheet.college_id, is_flagged: s.flagged, flag_reason: s.flagReason,
    }));
    const uidToId = new Map<string, string>();
    if (studentRows.length) {
      const { data: studs, error } = await supa.from('students')
        .upsert(studentRows, { onConflict: 'uid' }).select('id, uid');
      if (error) throw error;
      (studs ?? []).forEach((s: any) => uidToId.set(s.uid, s.id));
    }
    flagged = students.filter((s) => s.flagged).length;

    // 4) Write results + summaries for CHANGED rows only
    const resultUpserts: any[] = [];
    const summaryUpserts: any[] = [];
    const syncRowUpserts: any[] = [];
    const currentUids = new Set<string>();

    for (const s of students) {
      currentUids.add(s.uid);
      const hash = rowHash(summaryKey(s));
      syncRowUpserts.push({
        semester_id: sem.id, college_id: sheet.college_id, uid: s.uid,
        row_hash: hash, raw: s.raw, deleted_at: null,
      });
      const prev = prevHash.get(s.uid);
      const changed = !prev || prev.hash !== hash || prev.deleted;
      if (!changed) continue;
      if (prev) updated++; else inserted++;

      const studentId = uidToId.get(s.uid)!;
      for (const sub of s.subjects) {
        const subjectId = posToSubjectId.get(sub.position);
        if (!subjectId) continue;
        resultUpserts.push({
          student_id: studentId, semester_id: sem.id, subject_id: subjectId,
          internal_pct: sub.internal, external_pct: sub.external, total_pct: sub.total, passed: sub.passed,
          score: sub.score, grade: sub.grade, metrics: sub.metrics,
        });
      }
      summaryUpserts.push({
        student_id: studentId, semester_id: sem.id, college_id: sheet.college_id,
        total_cgpa: s.cgpa, total_pct: s.totalPct, subjects_failed: s.subjectsFailed,
        overall: s.overall, data_complete: s.dataComplete,
      });
    }

    if (resultUpserts.length) {
      const { error } = await supa.from('results')
        .upsert(resultUpserts, { onConflict: 'student_id,semester_id,subject_id' });
      if (error) throw error;
    }
    if (summaryUpserts.length) {
      const { error } = await supa.from('result_summaries')
        .upsert(summaryUpserts, { onConflict: 'student_id,semester_id' });
      if (error) throw error;
    }
    if (syncRowUpserts.length) {
      const { error } = await supa.from('sync_rows')
        .upsert(syncRowUpserts, { onConflict: 'semester_id,college_id,uid' });
      if (error) throw error;
    }

    // 5) Soft-delete rows that vanished from the sheet
    for (const [uid, meta] of prevHash) {
      if (meta.deleted || currentUids.has(uid)) continue;
      const { data: st } = await supa.from('students').select('id').eq('uid', uid).maybeSingle();
      if (st?.id) {
        await supa.from('results').delete().eq('student_id', st.id).eq('semester_id', sem.id);
        await supa.from('result_summaries').delete().eq('student_id', st.id).eq('semester_id', sem.id);
      }
      await supa.from('sync_rows').update({ deleted_at: new Date().toISOString() })
        .eq('semester_id', sem.id).eq('college_id', sheet.college_id).eq('uid', uid);
      deleted++;
    }

    // 6) Update sheet metadata
    await supa.from('college_sheets').update({
      row_count: students.length, last_synced_at: new Date().toISOString(),
      header_map: { subjects: parsed.subjectNames }, format: parsed.format,
    }).eq('id', sheet.id);

    await finishRun(run, 'success', parsed.students.length, inserted, updated, deleted, warnings);
    return { tab: sheet.tab_name, processed: parsed.students.length, inserted, updated, deleted, flagged, warnings };
  } catch (err: any) {
    warnings.push(String(err?.message ?? err));
    await finishRun(run, 'error', 0, inserted, updated, deleted, warnings);
    throw err;
  }
}

/** Sync every tab in the semester. Reads ALL tabs in one batched API call. */
export async function syncSemester(sem: SemesterRow, trigger = 'cron'): Promise<SyncResult[]> {
  const sheets = await sheetsForSemester(sem.id);
  if (!sheets.length) return [];
  const grids = await getTabValuesBatch(sem.spreadsheet_id, sheets.map((s) => s.tab_name));
  const out: SyncResult[] = [];
  for (const sheet of sheets) {
    try { out.push(await syncTabWithGrid(sem, sheet, grids.get(sheet.tab_name) ?? [], trigger)); }
    catch (e) { console.error(`[sync] ${sheet.tab_name} failed:`, e); }
  }
  // Combine multi-tab colleges (e.g. Aurora terms) into one correct summary per student.
  await supa.rpc('recompute_summaries', { p_semester: sem.id });
  return out;
}

export async function syncOneTab(sem: SemesterRow, tabName: string): Promise<SyncResult | null> {
  const [sheet] = await sheetsForSemester(sem.id, tabName);
  if (!sheet) return null; // unknown/denylisted tab
  return syncTab(sem, sheet);
}

// ---- run log helpers ----
async function startRun(semId: string, collegeId: string, trigger: string): Promise<string> {
  const { data } = await supa.from('sync_runs')
    .insert({ semester_id: semId, college_id: collegeId, trigger }).select('id').single();
  return data!.id as string;
}
async function finishRun(id: string, status: string, processed: number, ins: number, upd: number, del: number, errors: string[]) {
  await supa.from('sync_runs').update({
    status, rows_processed: processed, inserted: ins, updated: upd, deleted: del,
    errors, finished_at: new Date().toISOString(),
  }).eq('id', id);
}
