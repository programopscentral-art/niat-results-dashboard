// One-off full import of every active semester. Run: `npm run backfill`
import { supa } from './supabase.js';
import { syncSemester } from './sync.js';

async function main() {
  const { data: sems, error } = await supa.from('semesters')
    .select('id, spreadsheet_id').eq('is_active', true);
  if (error) throw error;
  if (!sems?.length) return console.log('No active semesters to backfill.');

  for (const sem of sems) {
    console.log(`\n=== Backfilling ${sem.spreadsheet_id} ===`);
    const results = await syncSemester(sem as any);
    for (const r of results) {
      console.log(
        `  ${r.tab.padEnd(20)} processed=${r.processed} +${r.inserted} ~${r.updated} -${r.deleted}` +
        (r.flagged ? ` flagged=${r.flagged}` : '') +
        (r.warnings.length ? `  warnings: ${r.warnings.join('; ')}` : '')
      );
    }
  }
  console.log('\nBackfill complete.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
