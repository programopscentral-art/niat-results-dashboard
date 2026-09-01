# Project: NIAT Students Reports

## What this is
Real-time student-records platform for NIAT's collaborated colleges. Google Sheets (ops-edited) → sync worker → Supabase (Postgres + RLS + Realtime) → Next.js dashboard. **1 spreadsheet = 1 batch·semester · 1 tab = 1 college · 1 row = 1 student.** Access: ops = all; college_staff = own college (RLS). Source sheet id: `1XjpOv2b_cX356l-Ayk64o7l2yEntyL7dvslWpZN4Nx8`.

## Codebase layout
- `supabase/` — `migrations/0001_core.sql` (schema), `0002_rls.sql` (RLS), `0003_realtime.sql`, `0004_views.sql`; `seed.sql` (19 colleges + Sem 1).
- `worker/` — Railway sync engine (TS, ESM). Entry `src/index.ts` (webhook + cron). Core: `src/parser.ts` (sheet→normalized, handles quirks), `src/sync.ts` (diff+upsert), `src/sheets.ts`, `src/backfill.ts`. Run: `npm run backfill`, `npm run dev`.
- `apps-script/Code.gs` — Google Sheets onChange→HMAC webhook bridge.
- `web/` — Next.js 15 App Router dashboard (Vercel). Auth in `middleware.ts` + `lib/supabase/*`; pages `app/page.tsx` (overview), `app/colleges/[slug]` (live table), `app/students/[uid]`.
- `docs/architecture.html`, `docs/dashboard.html` — blueprint + prototype (also published as Artifacts).
- `README.md` — full setup/deploy guide (Supabase → Google SA → Railway → Apps Script → Vercel).

Deps are NOT installed yet (no `npm install` run). See README to stand it up.



## UI/UX Skills (installed in `.claude/skills/`)

This project has design skills installed. **Use them whenever building or changing any UI.**

### `ui-ux-pro-max` — design intelligence (from nextlevelbuilder/ui-ux-pro-max-skill)
Searchable local design data: UI styles, product color palettes, font pairings, UX guidelines, icons, GSAP motion presets, chart types, and stack-specific rules. Run its Python generator first to lock a coherent foundation:

```bash
# Full design system for a new page/product
python "./.claude/skills/ui-ux-pro-max/scripts/search.py" "<product> <keywords>" --design-system --variance 9 --motion 9 -p "Project Name"

# Targeted lookups
python "./.claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain ux        # accessibility, animation, layout, forms...
python "./.claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --stack nextjs      # stack-specific guidance
```
Requires Python 3 (`python`, else `py -3`), no external deps. Paths are project-relative — run from the project root.

### `crazy-ui` — bold animations, effects & multi-theme
Copy-paste recipes for aurora/particle backgrounds, glassmorphism, spotlight/3D-tilt cards, magnetic/shimmer buttons, animated borders/beams, scroll & text reveals, marquees, bento grids, confetti, and a light/dark/brand theme system. Details in `.claude/skills/crazy-ui/references/{effects,themes,libraries}.md`. Also documents 21st.dev + the Magic MCP.

**Order of operations:** run `ui-ux-pro-max` for palette/style/fonts → apply `crazy-ui` effects on top → keep the guardrails (reduced-motion, contrast, keyboard focus, animate only transform/opacity).

Other bundled skills: `design`, `design-system`, `ui-styling`, `brand`, `banner-design`, `slides`.
