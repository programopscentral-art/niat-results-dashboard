# NIAT Records Platform — project guide (read this first)

Real-time student-records platform for NIAT's collaborated colleges. Ops edit Google Sheets →
a sync worker pulls them → Supabase (Postgres + RLS + Realtime) → Next.js dashboard.

**Core model:** `1 spreadsheet = 1 batch·semester` · `1 tab = 1 college` · `1 row = 1 student`.
**Access:** ops/admin = everything; college_staff = their own college only (enforced by RLS).
**Golden rule for data:** the Google Sheets are the source of truth; the DB is fully rebuilt from them
(nothing is hand-entered), so "migrating"/re-importing is safe and cheap.

---

## Live deployment (as of 2026-09)

| Piece | Where | Notes |
|---|---|---|
| **Repo** | github.com/programopscentral-art/niat-results-dashboard | branch `main`; Railway+Vercel auto-deploy on push |
| **Web (dashboard)** | Vercel → `https://niat-results-dashboard.vercel.app` | Root Dir = `web`, region `sin1` (Singapore), Node 22 |
| **Worker (sync)** | Railway → `https://niat-results-dashboard-production.up.railway.app` | Root Dir = `worker`, Node 22, US-West; `/health` + cron |
| **Database/Auth** | Supabase project ref `eozkgugzywggopruvpnf` (Singapore, ap-southeast-1) | Postgres + Auth (Google SSO) + Realtime |
| **Google service acct** | `niat-sync@niat-records.iam.gserviceaccount.com` (GCP project `niat-records`) | read-only; sheets shared with it; Sheets API + Drive API enabled |
| **Admins** | `programopscentral@nxtwave.in`, `nalamasa.sanjay@nxtwave.co.in`, `perisetti.sunil@nxtwave.co.in` | auto-`ops` via `admin_emails` (migration 0005) |

**Registered source sheets** (in `semesters` table):
- 2025 · Semester 1 → `1BDxKE-P_-aut2EsFLovfiEVm9HJTDeqNiTcvolVpITg` (19 tabs, ~6,057 students)
- 2025 · Semester 2 → `1cQCypf03BA_e7ZaYaxo8qm9hKEnOW-j6tcMQbTLb-EE` (12 tabs, ~2,208 students; 3 colleges awaiting results)

### Secrets — where they live (NOT in this repo)
- `worker/.env` (gitignored): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_EMAIL`,
  `GOOGLE_PRIVATE_KEY` (one line, `\n`-escaped, quoted), `SYNC_WEBHOOK_SECRET`, tuning vars.
- `web/.env.local` (gitignored): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `NEXT_PUBLIC_SITE_URL`, `WORKER_URL`, `SYNC_WEBHOOK_SECRET` (must match worker).
- Same vars are set in the **Railway** (worker) and **Vercel** (web) dashboards. `service_role` +
  Google key live ONLY in Railway; Vercel gets the anon key + WORKER_URL + SYNC_WEBHOOK_SECRET.
- DB direct connection (for admin SQL): pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432`,
  user `postgres.eozkgugzywggopruvpnf`, DB password from Supabase dashboard. Use the `pg` npm client
  (PostgREST/supabase-js can't run DDL). NOTE: PostgREST `.select()` caps at **1000 rows** — paginate with `.range()`.

---

## Architecture / data flow (cron-only, dynamic)

```
Google Sheets ──(read-only)──▶ Worker (Railway, node-cron every 60s) ──▶ Supabase Postgres
     ▲                                                                        │ Realtime
     └────────── ops edit any cell; appears in dashboard within ~60s ◀────────┘
                                                                    Next.js dashboard (Vercel)
```

The worker's cron (`worker/src/cron.ts`) every 60s:
1. **Discover** — Drive API lists spreadsheets shared with the service account whose title matches
   `Batch YYYY … Semester N`; auto-registers new ones (tabs auto-matched to colleges). *Onboarding a
   new semester = just share the sheet with the service account.* (Discovery via `files.list` can be
   flaky for "shared with me"; the registered-semester path always works. UI "+ Add semester" also works.)
2. **Skip** unchanged sheets via Drive `modifiedTime`.
3. **Sync** changed sheets: `batchGet` all tabs in one call → `parseTab` → diff by row-hash → upsert
   only changed rows → `recompute_summaries()` (combines multi-tab colleges) → `flag_cross_college_uids()`.
Apps Script push (`apps-script/Code.gs`) is OPTIONAL (drops latency 60s→~3s); not required.

---

## Codebase layout

- `supabase/migrations/0001…0012` — schema, RLS, realtime, views, RPCs. `seed.sql` = 18 colleges + Sem 1
  registration. `setup_all.sql` = all migrations + seed concatenated (paste once into SQL Editor for a fresh project).
- `worker/` — Railway sync engine (TypeScript, ESM, Node 22). Key files:
  - `src/index.ts` — express server: `/health`, `/webhook/sync` (HMAC), `/admin/register-semester` (HMAC).
  - `src/cron.ts` — the 60s discover→skip→sync loop.
  - `src/sheets.ts` — Google Sheets + Drive clients (`getTabValues`, `getTabValuesBatch`, `listAccessibleSpreadsheets`, `getModifiedTime`, `getSpreadsheetTitle`); all wrapped in `withRetry` (429/quota backoff).
  - `src/parser.ts` — **the brain**: universal grid → students/subjects/results (see rules below).
  - `src/sync.ts` — read→parse→dedupe→diff→upsert; `syncSemester` calls recompute + cross-college flag.
  - `src/register.ts` + `register-semester.ts` — onboard a semester (CLI: `npm run register -- <id> "2025" "Semester N"`).
  - `src/backfill.ts` — `npm run backfill` (re-import all active semesters).
- `apps-script/Code.gs` — optional onChange→HMAC bridge, with a "⚙ NIAT Sync" sheet menu.
- `web/` — Next.js 15 (App Router, React 19, Node 22) on Vercel. `vercel.json` pins region `sin1`.
  - `middleware.ts` + `lib/supabase/{server,client,middleware}.ts` — auth (Google SSO, @supabase/ssr).
  - `lib/semester.ts` — selected semester via `sel_sem` cookie. `lib/format.ts`, `lib/csv.ts`, `lib/types.ts`.
  - `app/page.tsx` (overview), `app/colleges/[slug]` (CollegeExplorer → StudentsClient + SubjectExplorer),
    `app/students/[uid]` (detail + cross-semester timeline + Print/PDF), `app/sources` (ops Sheets list),
    `app/access` (ops-only Access Management: grant roles/college by email; AccessManager.tsx),
    `app/login`, `app/auth/callback/route.ts`, `app/api/semesters/route.ts` (ops-only add-semester),
    `app/api/access/route.ts` (ops-only grant/revoke access).
  - `app/components/` — TopBar (logo, semester switcher, GlobalSearch, Sheets link, theme, sign out),
    SemesterSwitcher, AddSemesterModal, GlobalSearch, Footer.
  - `app/globals.css` — NIAT design tokens + all component styles.
  - `public/niat-logo.png` — the official NIAT logo (used in topbar/login/footer).
- `docs/architecture.html`, `docs/dashboard.html` — early blueprint + prototype (also published as Artifacts).

---

## Data model (Supabase)

`colleges` (registry) · `semesters` (batch, name, spreadsheet_id, last_modified_seen, source_title) ·
`college_sheets` (tab↔college per semester, term, format, row_count, last_synced_at) ·
`students` (keyed by **uid**, global; is_flagged, flag_reason) ·
`subjects` (per **college_sheet**, position, name — so Aurora Term-I/II don't collide; migration 0008) ·
**`results`** (one row per student·per subject: internal_pct, external_pct, total_pct, passed, score, grade, **metrics jsonb** = all raw cells) ·
`result_summaries` (per student·semester: total_cgpa, subjects_failed, overall, data_complete) ·
`sync_rows` (row-hash audit + raw jsonb, soft-delete) · `sync_runs` (observability) ·
`profiles` (role, college_id) · `admin_emails` (auto-ops allowlist) ·
`access_grants` (email→role/college pre-authorization; migration 0013).

**Access model:** on first login, `handle_new_user()` sets the role: in `admin_emails` ⇒ `ops`;
else a matching `access_grants` row ⇒ its role/college; else `college_staff` with NO college (= sees
nothing until granted). Ops manage this from **/access** (grant by email — works before or after first
login; change role/college; revoke). RLS lets ops UPDATE profiles + CRUD access_grants (migration 0013);
all other writes remain service-role only.
Views/RPCs: `v_college_overview`, `subject_stats(sem,college)`, `subject_students(subject)`,
`semester_sources()`, `recompute_summaries(sem)`, `flag_cross_college_uids()`.
Numeric cols widened to `(8,2)` (messy source values). RLS: ops all; college_staff own college.

---

## Parser rules (`worker/src/parser.ts`) — hard-won, DO NOT regress

Colleges use **5+ different sheet formats** (marks / CIA-ESE / grade-points [Aurora] / MID-based [CDU] /
theory-IA). The parser is generic:
1. Detects 1- or 2-row headers; identity columns (UID via label OR value pattern — some tabs have a blank
   "UID" column with the real UID elsewhere; AMET's ID is in Roll/Reg No).
2. Subject groups from the merged row-0 names; each subject stores ALL raw cells in `metrics` (JSONB) +
   normalized `total_pct`, `passed`, `grade`, `score`.
3. **Pass/fail per subject** (order): explicit Pass/Fail column(s) → grade → total≥40. Fractions (0.79) are
   ×100 when the label is a %. **Multiple Pass/Fail columns (ADYPU): use the LAST/authoritative one**
   (adjacent to the Total), NOT "all must pass" — verified vs the sheet (Applied Physics = 97 fails).
4. **0/blank with no Pass/Fail/grade → `passed=null` (in progress), NEVER a fail** (handles VGU's NCC/
   community-service columns). A Total column that EXISTS but is blank ⇒ not graded (don't synthesize).
5. Skip rows whose UID is a spreadsheet error (`#N/A`, `#REF!`, `#VALUE!`, …) or blank.
6. **Overall is derived from ACTUAL subjects, ignoring the sheet's stale summary columns:** 0 failed
   subjects = PASS; ≥1 = FAIL; no graded subjects = IN_PROGRESS. (`recompute_summaries` recomputes this
   from `results` across ALL tabs so multi-term colleges like Aurora combine correctly.) A passing student
   with source CGPA exactly 0 → shown blank (not 0.00).
7. Dedupe duplicate UIDs within a tab; `flag_cross_college_uids()` flags a UID that appears in >1 college tab.

---

## Common operations

```bash
# Worker (from worker/, needs worker/.env)
npm run backfill                                   # re-import all active semesters
npm run register -- <spreadsheetId> "2025" "Semester 3"   # onboard + load a new semester
npm run dev            # local: express :8080 + cron
npm run build && npm start                          # prod (Railway)

# Web (from web/, needs web/.env.local)
npm run dev            # http://localhost:3000
npm run build          # what Vercel runs

# Add a semester in the UI: top bar → "+ Add semester" → paste sheet URL (ops only).
# Deploy: git push origin main  → Railway (worker) + Vercel (web) auto-deploy.
```

Fresh Supabase project: run `supabase/setup_all.sql` in the SQL Editor, enable Google auth provider,
add the Vercel domain to Auth URL config + Google OAuth authorized origins, then `npm run backfill`.

---

## Gotchas learned (so you don't repeat them)

- **Node 22 required** everywhere (`engines.node: "22.x"`): `@supabase/supabase-js` realtime needs native WebSocket.
- **Railway/Vercel Root Directory** must be `worker`/`web` (monorepo) or the build fails.
- **Next.js**: keep it patched (Vercel blocks known-CVE versions — we're on 15.5.x + React 19 stable).
- **PostgREST caps `.select()` at 1000 rows** — paginate with `.range()` when auditing/reading in bulk.
- **Performance**: co-locate compute with the DB (Vercel `sin1` = Singapore, same as Supabase). Scroll
  smoothness = no sticky-header `backdrop-filter`, GPU-isolate fixed bg layers, `content-visibility:auto`
  on big tables/cards (1000+ row colleges).
- **Design**: NIAT brand — primary maroon `#991B1B`, accent amber `#B45309`, cream, Satoshi (Fontshare)
  + Inter (Google) + JetBrains Mono. Light-first; Light/Dark themes. `public/niat-logo.png`.

---

## Verified state (pin-to-pin audit, 2026-09-02)

Re-read every sheet tab and compared to the DB per student, both semesters × all 17 colleges (~8,265 records):
**counts match the sheets, 0 missing, 0 extra, 0 pass/fail mismatches, 0 backlog mismatches.**

**Only open item (source-sheet error, needs ops):** UID `b0d59496-8912-4f4e-89a4-49f7ea983c6a`
(University ID `2102508692`) appears in BOTH the **CDU** and **Svyasa** Sem-1 tabs → attributed to one
college, so CDU shows 1,312 vs 1,313. It's auto-flagged ⚑. Fix = remove the duplicate UUID from the wrong tab.

---

## Pending / optional

- **Mumbai migration** (lower latency for India): create a new Supabase project in `ap-south-1`, run
  `setup_all.sql`, re-point keys (Vercel + Railway) + move Vercel to `bom1`, `npm run backfill`. Railway
  has no Mumbai region → keep it Singapore (it's background only). User was mid-decision on this.
- Optional features discussed but not built: at-risk watchlist, analytics dashboard, subject-failure
  heatmap, semester comparison, access-management UI, student self-view, scheduled email digests.
