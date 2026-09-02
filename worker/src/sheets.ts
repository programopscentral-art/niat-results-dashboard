import { google } from 'googleapis';
import { config } from './config.js';

const auth = new google.auth.JWT({
  email: config.googleClientEmail,
  key: config.googlePrivateKey,
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly', // discovery + modifiedTime
  ],
});

const sheets = google.sheets({ version: 'v4', auth });
const drive = google.drive({ version: 'v3', auth });

/** Retry with exponential backoff on rate-limit (429) / quota (403) / 5xx.
 *  A transient quota blip delays a sync by a few seconds — it never breaks it,
 *  and the dashboard keeps serving the last-synced data throughout. */
async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 4): Promise<T> {
  let delay = 800;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const status = e?.code ?? e?.response?.status;
      const blob = JSON.stringify(e?.errors ?? e?.response?.data ?? e?.message ?? '');
      const retryable = status === 429 || status === 503 || status === 500 ||
        (status === 403 && /quota|rateLimit|userRateLimit/i.test(blob));
      if (!retryable || i === tries - 1) throw e;
      console.warn(`[sheets] ${label} rate-limited (${status}); retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error('unreachable');
}

export interface DiscoveredFile { id: string; title: string; modifiedTime: string; }

/** List spreadsheets the service account can access (i.e. shared with it). */
export async function listAccessibleSpreadsheets(): Promise<DiscoveredFile[]> {
  const out: DiscoveredFile[] = [];
  let pageToken: string | undefined;
  do {
    const res = await withRetry(() => drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: 'nextPageToken, files(id,name,modifiedTime)',
      pageSize: 100,
      pageToken,
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    }), 'discover');
    for (const f of res.data.files ?? []) {
      out.push({ id: f.id!, title: f.name ?? '', modifiedTime: f.modifiedTime ?? '' });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return out;
}

/** Read a spreadsheet's human title (to auto-derive batch/semester). */
export async function getSpreadsheetTitle(spreadsheetId: string): Promise<string | null> {
  try {
    const res = await withRetry(() => drive.files.get({ fileId: spreadsheetId, fields: 'name', supportsAllDrives: true }), 'title');
    return res.data.name ?? null;
  } catch { return null; }
}

/** Best-effort: the display name/email of whoever last edited the spreadsheet.
 *  Read-only Sheets/Drive can't attribute individual CELLS, so this is the file's
 *  last modifying user — a reasonable label for the batch of changes we just picked
 *  up. Returns null if Drive doesn't expose it (permissions / personal account). */
export async function getLastEditor(spreadsheetId: string): Promise<string | null> {
  try {
    const res = await withRetry(() => drive.files.get({
      fileId: spreadsheetId, fields: 'lastModifyingUser(displayName,emailAddress)', supportsAllDrives: true,
    }), 'lastEditor');
    const u = res.data.lastModifyingUser;
    if (!u) return null;
    return u.displayName || u.emailAddress || null;
  } catch { return null; }
}

/** Cheap single-file modifiedTime lookup (used to skip unchanged sheets). */
export async function getModifiedTime(spreadsheetId: string): Promise<string | null> {
  try {
    const res = await withRetry(() => drive.files.get({ fileId: spreadsheetId, fields: 'modifiedTime', supportsAllDrives: true }), 'modifiedTime');
    return res.data.modifiedTime ?? null;
  } catch {
    return null; // Drive API not enabled / no access → caller falls back to always-read
  }
}

/** Read MANY tabs of one spreadsheet in a single API call. */
export async function getTabValuesBatch(
  spreadsheetId: string, tabNames: string[],
): Promise<Map<string, string[][]>> {
  const map = new Map<string, string[][]>();
  if (!tabNames.length) return map;
  const res = await withRetry(() => sheets.spreadsheets.values.batchGet({
    spreadsheetId,
    ranges: tabNames.map((t) => `'${t.replace(/'/g, "''")}'`),
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  }), 'batchGet');
  const ranges = res.data.valueRanges ?? [];
  tabNames.forEach((tab, i) => {
    const values = (ranges[i]?.values ?? []) as unknown[][];
    map.set(tab, values.map((row) => row.map((c) => (c == null ? '' : String(c)))));
  });
  return map;
}

export interface TabInfo {
  title: string;
  sheetId: number;
  rows: number;
}

/** List every tab in the spreadsheet (used to detect new / renamed / deleted tabs). */
export async function listTabs(spreadsheetId: string): Promise<TabInfo[]> {
  const res = await withRetry(() => sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets(properties(title,sheetId,gridProperties(rowCount)))',
  }), 'listTabs');
  return (res.data.sheets ?? []).map((s) => ({
    title: s.properties?.title ?? '',
    sheetId: s.properties?.sheetId ?? 0,
    rows: s.properties?.gridProperties?.rowCount ?? 0,
  }));
}

/** Read all values of one tab as a 2D string grid. Merged cells return the
 *  value only in the top-left cell (blank elsewhere) — parser accounts for it. */
export async function getTabValues(spreadsheetId: string, tabName: string): Promise<string[][]> {
  const res = await withRetry(() => sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabName.replace(/'/g, "''")}'`,
    valueRenderOption: 'UNFORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  }), 'getTabValues');
  const values = (res.data.values ?? []) as unknown[][];
  return values.map((row) => row.map((c) => (c == null ? '' : String(c))));
}
