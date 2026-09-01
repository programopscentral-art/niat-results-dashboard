import cron from 'node-cron';
import { config } from './config.js';
import { supa } from './supabase.js';
import { syncSemester } from './sync.js';
import { registerSemester, parseTitle } from './register.js';
import { listAccessibleSpreadsheets, getModifiedTime, type DiscoveredFile } from './sheets.js';

let running = false;

// ---------------------------------------------------------------------------
// The heart of the "cron-only, fully dynamic" design:
//   1. DISCOVER  — find spreadsheets shared with the service account whose title
//                  matches the batch/semester pattern; auto-register new ones.
//                  → Onboarding a new semester = just share the sheet. Nothing else.
//   2. SKIP      — for each registered semester, compare Drive modifiedTime to the
//                  last value we saw; unchanged files are skipped (one cheap call).
//   3. SYNC      — changed files are read in ONE batched call, diffed by row-hash,
//                  and upserted. Supabase Realtime then streams changes to the UI.
// Worst-case staleness = the cron interval (default 60s).
// ---------------------------------------------------------------------------

export function startReconcileCron() {
  cron.schedule(config.reconcileCron, tick);
  console.log(`[worker] reconciliation cron active: ${config.reconcileCron} (autoDiscover=${config.autoDiscover})`);
}

async function tick() {
  if (running) return; // never overlap
  running = true;
  try {
    // Map of spreadsheetId -> modifiedTime, filled by discovery when available.
    const modTimes = new Map<string, string>();

    // ---- 1. DISCOVER ----
    if (config.autoDiscover) {
      let files: DiscoveredFile[] = [];
      try {
        files = await listAccessibleSpreadsheets();
      } catch (e: any) {
        console.warn('[reconcile] discovery unavailable (enable Drive API?):', e?.message ?? e);
      }
      const { data: known } = await supa.from('semesters').select('spreadsheet_id');
      const knownIds = new Set((known ?? []).map((s: any) => s.spreadsheet_id));

      for (const f of files) {
        if (f.modifiedTime) modTimes.set(f.id, f.modifiedTime);
        const parsed = parseTitle(f.title);
        if (!parsed) continue;                 // not a NIAT results sheet
        if (knownIds.has(f.id)) continue;      // already registered
        try {
          const report = await registerSemester({ spreadsheetId: f.id, batch: parsed.batch, name: parsed.name });
          await supa.from('semesters').update({ source_title: f.title }).eq('id', report.semesterId);
          console.log(`[reconcile] NEW semester auto-registered: "${f.title}" → ${report.registered.length} tabs`
            + (report.unmatchedTabs.length ? ` (unmatched: ${report.unmatchedTabs.join(', ')})` : ''));
        } catch (e) {
          console.error(`[reconcile] failed to register "${f.title}":`, e);
        }
      }
    }

    // ---- 2 + 3. SKIP unchanged, SYNC changed ----
    const { data: sems } = await supa.from('semesters')
      .select('id, spreadsheet_id, last_modified_seen').eq('is_active', true);

    for (const sem of sems ?? []) {
      const mod = modTimes.get(sem.spreadsheet_id) ?? (await getModifiedTime(sem.spreadsheet_id));
      if (mod && sem.last_modified_seen && new Date(mod) <= new Date(sem.last_modified_seen)) {
        continue; // unchanged since last sync — skip entirely
      }
      const results = await syncSemester(sem as any);
      const touched = results.filter((r) => r.inserted || r.updated || r.deleted);
      if (touched.length) console.log('[reconcile] changes:', touched.map((t) => `${t.tab}(+${t.inserted}~${t.updated}-${t.deleted})`).join(' '));
      await supa.from('semesters')
        .update({ last_modified_seen: mod ?? new Date().toISOString() })
        .eq('id', sem.id);
    }
  } catch (e) {
    console.error('[reconcile] error:', e);
  } finally {
    running = false;
  }
}
