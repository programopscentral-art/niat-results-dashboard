import express from 'express';
import { config } from './config.js';
import { verify } from './hmac.js';
import { resolveSemesterBySpreadsheet, syncOneTab, syncSemester } from './sync.js';
import { registerSemester, parseTitle } from './register.js';
import { listTabs, getSpreadsheetTitle } from './sheets.js';
import { startReconcileCron } from './cron.js';

const app = express();

// Capture the raw body so we can verify the HMAC signature over exact bytes.
app.use(express.json({
  verify: (req, _res, buf) => { (req as any).rawBody = buf.toString('utf8'); },
}));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Per-tab debounce: coalesce a burst of edits into one sync.
const pending = new Map<string, NodeJS.Timeout>();

app.post('/webhook/sync', async (req, res) => {
  const raw = (req as any).rawBody ?? '';
  if (!verify(raw, req.header('x-signature'))) {
    return res.status(401).json({ error: 'invalid signature' });
  }
  const { spreadsheetId, tabName } = req.body ?? {};
  if (!spreadsheetId || !tabName) return res.status(400).json({ error: 'spreadsheetId and tabName required' });
  if (config.tabDenylist.includes(tabName)) return res.json({ skipped: 'denylisted tab' });

  // ACK immediately; do the work after a short debounce window.
  res.json({ accepted: true, tabName });

  const key = `${spreadsheetId}::${tabName}`;
  clearTimeout(pending.get(key));
  pending.set(key, setTimeout(async () => {
    pending.delete(key);
    try {
      const sem = await resolveSemesterBySpreadsheet(spreadsheetId);
      if (!sem) return console.warn(`[webhook] unknown spreadsheet ${spreadsheetId}`);
      const result = await syncOneTab(sem, tabName);
      console.log(`[webhook] synced ${tabName}:`, result ?? 'unknown tab');
    } catch (e) {
      console.error(`[webhook] sync failed for ${tabName}:`, e);
    }
  }, 1500));
});

// Onboard a new semester spreadsheet (ops action). HMAC-protected.
// Auto-derives batch/semester from the sheet title, loads all tabs, and returns
// a clear per-tab report (loaded / awaiting results / unknown college / format problem).
app.post('/admin/register-semester', async (req, res) => {
  const raw = (req as any).rawBody ?? '';
  if (!verify(raw, req.header('x-signature'))) return res.status(401).json({ error: 'invalid signature' });
  let { spreadsheetId, batch, name } = req.body ?? {};
  if (!spreadsheetId) return res.status(400).json({ error: 'spreadsheetId required' });

  try {
    // Verify read access up front, with a clear message if not shared.
    let tabs;
    try { tabs = await listTabs(spreadsheetId); }
    catch { return res.status(400).json({ error: `Cannot read this sheet. Share it with the service account (Viewer): ${config.googleClientEmail}` }); }
    if (!tabs.length) return res.status(400).json({ error: 'The sheet has no tabs.' });

    // Derive batch + semester name from the title if not provided.
    if (!batch || !name) {
      const title = await getSpreadsheetTitle(spreadsheetId);
      const parsed = title ? parseTitle(title) : null;
      if (!parsed) return res.status(400).json({
        error: `Could not read the batch/semester from the sheet title${title ? ` ("${title}")` : ''}. Rename it to include e.g. "Batch 2025 … Semester 2", or it doesn't match the expected format.`,
      });
      batch = parsed.batch; name = parsed.name;
    }

    const reg = await registerSemester({ spreadsheetId, batch, name });
    const sem = await resolveSemesterBySpreadsheet(spreadsheetId);
    const results = sem ? await syncSemester(sem, 'manual') : [];

    const registered = results.filter((r) => r.processed > 0).map((r) => ({ tab: r.tab, students: r.processed }));
    const awaiting = results.filter((r) => r.processed === 0).map((r) => r.tab);
    const problems = results.flatMap((r) => r.warnings
      .filter((w) => !/no data rows|has no data/i.test(w))
      .map((w) => `${r.tab}: ${w}`));

    res.json({ ok: true, report: {
      semester: `${batch} · ${name}`,
      registered, awaiting, unmatchedTabs: reg.unmatchedTabs, problems,
    }});
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message ?? e) });
  }
});

app.listen(config.port, () => {
  console.log(`[worker] listening on :${config.port}`);
  startReconcileCron();
});
