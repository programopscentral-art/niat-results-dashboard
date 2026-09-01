import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),

  supabaseUrl: req('SUPABASE_URL'),
  supabaseServiceKey: req('SUPABASE_SERVICE_ROLE_KEY'),

  // Google service account with read access to the spreadsheet
  googleClientEmail: req('GOOGLE_CLIENT_EMAIL'),
  googlePrivateKey: req('GOOGLE_PRIVATE_KEY').replace(/\\n/g, '\n'),

  // Shared secret used by the Apps Script bridge to sign webhook calls
  webhookSecret: req('SYNC_WEBHOOK_SECRET'),

  // How often the reconciliation poll runs (cron expression)
  reconcileCron: process.env.RECONCILE_CRON ?? '*/1 * * * *', // every minute

  // Auto-discovery: pick up any spreadsheet shared with the service account whose
  // title matches this pattern, and auto-register it. Onboarding a new semester
  // then means simply sharing the sheet with the service account — nothing else.
  autoDiscover: process.env.AUTO_DISCOVER !== 'false', // default ON
  // Captures (batch year, semester number) from the file title.
  titleRegex: new RegExp(process.env.SHEET_TITLE_REGEX ?? 'Batch\\s*(\\d{4})[^\\d]*Semester\\s*(\\d+)', 'i'),

  // Tabs that must never be ingested even if present in the sheet
  tabDenylist: (process.env.TAB_DENYLIST ??
    'Sheet10,Sheet11,Sheet12,{University_Copy this sheet and make your subshet}')
    .split(',').map((s) => s.trim()).filter(Boolean),

  passMarkPct: Number(process.env.PASS_MARK_PCT ?? 40),
};
