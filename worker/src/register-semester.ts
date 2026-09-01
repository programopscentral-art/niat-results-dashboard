// Onboard a new semester spreadsheet, then backfill it.
// Usage: npm run register -- <spreadsheetId> "<batch>" "<name>"
//   e.g. npm run register -- 1AbC...XyZ "2025" "Semester 2"
import { registerSemester } from './register.js';
import { resolveSemesterBySpreadsheet, syncSemester } from './sync.js';

async function main() {
  const [spreadsheetId, batch, name] = process.argv.slice(2);
  if (!spreadsheetId || !batch || !name) {
    console.error('Usage: npm run register -- <spreadsheetId> "<batch>" "<name>"');
    process.exit(1);
  }
  console.log(`Registering ${batch} · ${name} (${spreadsheetId}) ...`);
  const report = await registerSemester({ spreadsheetId, batch, name });

  console.log(`\nRegistered ${report.registered.length} tab(s):`);
  report.registered.forEach((r) => console.log(`  ✓ ${r.tab.padEnd(22)} → ${r.college}${r.term ? ' · ' + r.term : ''}`));
  if (report.unmatchedTabs.length)
    console.log(`\n⚠ Unmatched tabs (add these colleges first): ${report.unmatchedTabs.join(', ')}`);
  if (report.ignored.length)
    console.log(`  (ignored: ${report.ignored.join(', ')})`);

  console.log('\nBackfilling the newly registered semester ...');
  const sem = await resolveSemesterBySpreadsheet(spreadsheetId);
  if (sem) {
    const results = await syncSemester(sem);
    results.forEach((r) => console.log(`  ${r.tab.padEnd(22)} processed=${r.processed} +${r.inserted} ~${r.updated} -${r.deleted}`));
  }
  console.log('\nDone.');
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
