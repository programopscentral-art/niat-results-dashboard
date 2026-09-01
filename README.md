# NIAT Records Platform

Real-time student-records platform for NIAT's collaborated colleges. Your ops team keeps editing
Google Sheets; every change flows into Supabase within seconds and streams live to the dashboard.

```
Google Sheets ──(onChange, HMAC webhook)──▶ Sync Worker (Railway) ──▶ Supabase Postgres
     ▲                                                                      │  (Realtime)
     └──────────────── 60s reconciliation poll ◀───────────────┘          ▼
                                                          Next.js Dashboard (Vercel)
```

- **1 spreadsheet = 1 batch·semester** · **1 tab = 1 college** · **1 row = 1 student**
- Results normalized to **one row per student · per subject** → handles variable subjects, sparse data, future semesters.
- Access: **ops/admin** see everything; **college staff** see only their own college (enforced by Postgres RLS).

📐 [System-design blueprint](docs/architecture.html) · 🖥️ [UI prototype](docs/dashboard.html)

## Repository layout

| Path | What | Deploys to |
|------|------|-----------|
| `supabase/` | Schema, RLS, realtime, aggregate view, seed | Supabase (Pro) |
| `worker/`   | Sync engine: Sheets→Supabase webhook + reconciliation cron + backfill | Railway |
| `apps-script/` | Google Sheets `onChange` bridge (paste into the sheet's Apps Script) | Google |
| `web/`      | Next.js dashboard (auth, realtime, drill-downs) | Vercel |

---

## 1 · Supabase

1. Create a project (Pro). Note the **Project URL**, **anon key**, and **service_role key** (Settings → API).
2. Run the SQL **in order** (SQL Editor, or `supabase db push` with the CLI):
   ```
   supabase/migrations/0001_core.sql
   supabase/migrations/0002_rls.sql
   supabase/migrations/0003_realtime.sql
   supabase/migrations/0004_views.sql
   supabase/seed.sql
   ```
3. Auth → Providers → enable **Google**. Add your Vercel domain + `http://localhost:3000` to redirect URLs.
4. After the first users sign in, set their roles:
   ```sql
   update profiles set role='ops' where email='you@nxtwave.in';
   -- college staff: scope them to a college
   update profiles set role='college_staff',
     college_id=(select id from colleges where code='CITY')
   where email='staff@partnercollege.edu';
   ```

## 2 · Google service account (worker reads the sheet)

1. Google Cloud Console → create a **service account** → create a **JSON key**.
2. Enable **both** the **Google Sheets API** and the **Google Drive API** for the project
   (Drive API powers auto-discovery + the modified-time skip).
3. **Share every semester spreadsheet** with the service account's email (Viewer).
   *This is also how discovery finds them — a shared sheet is a discovered sheet.*
4. Copy `client_email` → `GOOGLE_CLIENT_EMAIL`, `private_key` → `GOOGLE_PRIVATE_KEY`.

## 3 · Worker (Railway)

```bash
cd worker
cp .env.example .env      # fill in Supabase + Google + a strong SYNC_WEBHOOK_SECRET
npm install
npm run backfill          # first full import of the sheet
npm run dev               # local run (webhook on :8080, cron every minute)
```
Deploy: create a Railway service from `worker/`, add the same env vars, deploy. It exposes
`POST /webhook/sync` and `GET /health`. Copy the public URL.

## 4 · Apps Script bridge (OPTIONAL — near-instant push)

Not required. The cron (with Drive discovery) already syncs every shared sheet within ~60s, with
zero per-sheet setup. Add this only if you want ~3s latency instead of ~60s:

1. In the spreadsheet: **Extensions → Apps Script**, paste `apps-script/Code.gs`.
2. **Project Settings → Script Properties**: `WORKER_URL` = `https://<worker>.up.railway.app/webhook/sync`,
   `SYNC_SECRET` = the worker's `SYNC_WEBHOOK_SECRET`.
3. In the sheet, use the **⚙ NIAT Sync → Install triggers** menu (one click). Copies of the sheet inherit the script.

## 5 · Web (Vercel)

```bash
cd web
cp .env.example .env.local   # NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SITE_URL
npm install
npm run dev                  # http://localhost:3000
```
Deploy: import `web/` into Vercel, set the three `NEXT_PUBLIC_*` env vars (SITE_URL = your Vercel domain), deploy.

---

## Adding the next semester / batch (scales with zero SQL)

1. Ops creates the new consolidation spreadsheet — ideally **File → Make a copy** of a master sheet
   that already contains the Apps Script (the bound script travels with the copy).
2. **Share** the new sheet with the service account (Viewer).
3. **Register + backfill it with one command:**
   ```bash
   cd worker
   npm run register -- <newSpreadsheetId> "2025" "Semester 2"
   ```
   This auto-detects every tab, matches it to a college (handles `-Term-I/II`), registers the semester
   and tab mappings, flags any unknown tabs, and imports the data. (Same thing is exposed at
   `POST /admin/register-semester` for a future "+ Add Semester" button in the ops UI.)
4. In the copied sheet, click **⚙ NIAT Sync → Install triggers** once for instant push. (Optional —
   the 60s reconciliation cron already syncs every registered semester automatically.)

## How sync works (cron-only, fully dynamic)

Every minute the worker:
1. **Discovers** — lists spreadsheets shared with the service account whose title matches
   `Batch YYYY … Semester N`, and auto-registers any new ones (tabs auto-matched to colleges).
   → Onboarding a new semester = **just share the sheet with the service account.** Nothing else.
2. **Skips unchanged** — compares each file's Drive `modifiedTime` to the last one seen; untouched
   sheets are skipped with a single cheap metadata call (stays well under Sheets API quotas).
3. **Syncs changed** — reads all tabs of a changed sheet in **one** batched call, diffs by row-hash,
   upserts only what changed. **Supabase Realtime** then streams those changes to open dashboards.

- **Latency:** ≤ ~60s (the poll interval). Optional Apps Script push drops it to ~3s.
- **Deletes:** a row removed from the sheet is soft-deleted (kept for audit) and disappears from the UI.
- **New colleges:** a tab with no matching college is flagged in the logs for one-line registration.

## Edge cases handled

Junk/template tabs ignored · dirty University IDs flagged (not silently "fixed") · sparse rows marked
*in progress* · per-tab header mapping (Name vs BITS ID) · Aurora's two term-sheets · row reordering
(keyed by UID) · Pass/Fail spelling normalized · new/renamed tabs detected for ops review.

## Security notes

- `service_role` key lives **only** in the worker (server-side). Never ship it to the browser.
- The web app uses the **anon** key; all data access is gated by RLS.
- The webhook is authenticated with an HMAC shared secret.
