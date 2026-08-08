# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

AIRMS (Athlete Injury Risk Management System) is JC's Final Year Project. Stakeholder: **Dr Thung** at Institut Sukan Negara (ISN). Supervisor: **Dr Hoo Wai Lam**. This is a graded academic artifact — every architectural decision needs to be defensible in viva voce, not just shippable.

**Mission:** *turn ISN's existing HoloMotion screening reports into a risk signal a clinician, a coach and an athlete can each act on — without any of them needing to read a PDF.* Ingest what ISN already produces (the HoloMotion PDF is the **single source of truth**), score each athlete against their real peer cohort rather than a published threshold, and deliver that one explainable verdict in four role-shaped views. Norms are institution-governed (approved, versioned, auditable); the clinician can always override with a note; the athlete's name is redacted on-device before any image leaves the machine.

Full **mission / vision / non-goals** — including the list of features that were deliberately cut and must not be revived — is at the top of [`docs/README_FOR_CLAUDE_CODE.md`](docs/README_FOR_CLAUDE_CODE.md). Read it before proposing anything new.

## Required reading before non-trivial work

The project ships its own extensive docs. Treat these as the source of truth — they win over inferences from code:

1. [`docs/README_FOR_CLAUDE_CODE.md`](docs/README_FOR_CLAUDE_CODE.md) — entry point, reading order, communication norms
2. [`docs/MASTER_CLARIFICATIONS.md`](docs/MASTER_CLARIFICATIONS.md) — locked architectural decisions; **this file wins** when other docs disagree
3. [`docs/MODULES_STATUS.md`](docs/MODULES_STATUS.md) — what's shipped vs deferred per module
4. [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md) — file-level map (models, routes, components, pages)
5. [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) — read before suggesting "improvements" that may have already been considered and rejected
6. [`docs/FYP_RUBRICS.md`](docs/FYP_RUBRICS.md) — current rubric weighting + pre-viva punch list

## Commands

All commands run from project root (PowerShell on Windows; backtick is the line-continuation char, not `\`):

```powershell
# First-time setup
npm install                # root deps (concurrently)
npm run install:all        # installs root + backend + frontend
npm run seed               # drops + reseeds MySQL with deterministic PRNG (seed=42)

# Day-to-day
npm run dev                # backend :5000 + frontend :3000 via concurrently
npm run dev:backend        # backend only
npm run dev:frontend       # frontend only

# Frontend type-check / lint
cd frontend; npx tsc --noEmit -p tsconfig.json
cd frontend; npm run lint  # next lint

# Frontend production build
cd frontend; npm run build

# Unit tests (jest, in both packages — no linter configured for the backend)
cd backend; npx jest      # 5 suites: cohorts, overallIndicator, permissions, rbac, pdfDraw
cd frontend; npx jest     # 2 suites: lib/risk.ts, bodymap-data/muscles.ts
```

Jest covers the pure logic: scoring/permissions (`backend/tests/`), the PDF
drawing toolkit (`backend/tests/pdfDraw.test.js` — renders reports headlessly
against a fake `res`, no DB needed), the composite risk model
(`frontend/src/lib/risk.test.ts`) and the body-map muscle partition
(`frontend/src/components/dashboard/bodymap-data/muscles.test.ts`).

There are still no route, page, or end-to-end tests. Anything touching routes,
pages or the import flow is verified manually: run `npm run dev`, log in with the
demo credentials below, click through the affected flow.

## Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| athlete | `athlete@isn.gov.my` | `athlete123` (John Doe — the athlete key is now the IC number, e.g. `890202021001`; `npm run seed` prints each demo athlete's IC) |
| athlete | `thung@isn.gov.my` | `thung123` (Thung Jin Seng — seeded as a deliberately STALE earlier assessment so importing the sample HoloMotion PDF visibly updates his dashboard to the printed values; extraction ground truth lives in `backend/scripts/verify-holomotion-extract.js`) |
| medical | `medical@isn.gov.my` | `medical123` (Medical Demo 01) |
| medical (alert inbox) | `23005005@siswa.um.edu.my` | `medical123` (Medical Demo 02 — real deliverable inbox; import-commit alerts land here so the email feature demos against a checkable inbox) |
| admin | `admin@isn.gov.my` | `admin123` |
| admin (SMTP demo) | `poseidonapollo11@gmail.com` | `admin123` (real-Gmail account so the email-reset flow demos against an inbox you can check) |
| executive | `executive@isn.gov.my` | `executive123` (Datuk Executive — **read-only oversight**: admin analytics + PDF reports, and nothing that writes) |

Seeded passwords intentionally do not satisfy the 10-char + complexity password policy — the policy gates user-driven password setting via `change-password` / `reset-password`, not seeded fixtures.

## Architecture overview

Three-tier monorepo orchestrated by `concurrently` from the root `package.json`. There is no shared types package — frontend and backend each maintain their own type definitions.

**Backend** (`backend/`, Node + Express + Sequelize on MySQL, JWT auth on every protected route):
- Entry: `backend/src/server.js` mounts routes, connects to MySQL via Sequelize, registers CORS for both `:3000` and `:3001`
- RBAC enforced via `middleware/rbac.js` — `rbac('medical', 'admin')` style — on top of `middleware/auth.js` which verifies the `Authorization: Bearer <jwt>` header
- Models in `backend/src/models/` use Sequelize hooks for derived/computed behaviour (e.g. `User`'s `beforeSave` hashes a changed password) — derived values are persisted, not computed on read
- The canonical foreign key across tables is `athleteId` (VARCHAR) — its VALUES are now the athlete's **IC number** (12 digits, e.g. `"890202021001"`), replacing the old `ATH0001` scheme (A2, 2026-08-04). The column name stays `athleteId` (internal) and is serialised as `_id`; the UI labels it "IC Number". Engine-level FKs are defined in `models/index.js`
- Every response goes through `utils/serialize.js`, which aliases the numeric `id` to a stringified `_id` field and reassembles Athlete's flat columns into the nested `risks` / `myodynamia[]` / `tension[]` shape the frontend reads
- Module 2 is **Athlete Roster & Identity Management** (athlete CRUD keyed by IC number, roster search, event vocabulary, ISN directory lookup, clinician injury-status flag). It was **Injury & Recovery Logging** until the HoloMotion-only cut (2026-08-02) deleted the `Injury` and `SelfReport` models, `routes/injuries.js`, `routes/selfReports.js` and the self-report→injury promotion transaction. There is no injury table, no injury history and no athlete self-reporting; what survives is a single clinician-set flag on the Athlete row (`isInjured` / `injuryNote` / `injuryBy` / `injuryAt`), written by `PATCH /api/athletes/:id/injury` (medical + admin), whose purpose is cohort-norm eligibility. **The recast was ratified by JC on 2026-08-06** along with the UC-1–47 rewrite in `docs/fyp/REPORT_TABLE_4-1.md` — that file is the authority for Chapter 4. Module numbering is now settled; **still do not renumber or rename modules on your own**
- Module 5 (Analytics & Reporting) PDF generation streams `application/pdf` directly from `routes/screeningReports.js` using `pdfkit` (no temp files). Its injury-analytics half went with the same cut; what remains is screening-derived reporting (holistic / individual / team). **All pdfkit drawing (palette, gauges, radar, tables, body figure, the interpretation generator) lives in `utils/pdfDraw.js`** — the route file is routing, data fetching and page composition only. `backend/tests/pdfDraw.test.js` renders reports headlessly against a fake `res`, so PDF changes have smoke coverage without a DB
- Module 3 (Screening Data Ingestion) is **HoloMotion PDF only** (the Excel import was retired 2026-07-12; code archived in `archive/excel-upload/`). Two-step flow: `POST /api/upload/screening/pdf/preview` (render + vision-extract, no commit) → `POST /api/upload/screening/pdf` (commit the previewed JSON). The uploader is batch-capable (sequential extraction). **The athlete's name is redacted on-device (page-1 OCR locates it, blacks out the value) before any image reaches the vision model** — so the sole direct identifier never leaves the machine (`utils/redactName.js`; see `docs/DESIGN_DECISIONS.md §18`). The operator then attaches each report to a roster athlete by **name search** (`AthleteSearchSelect`), which fills Athlete ID/sport/programme from the roster; the commit backfills the name server-side. The Excel **backup export** (`GET /api/export/backup.xlsx`, Module 4 — Cohort Norms & Governance) remains

**Frontend** (`frontend/`, Next.js 14 App Router, TypeScript, plain CSS with variables):
- Pages live under `frontend/src/app/<role>/<slug>/page.tsx` — the URL hierarchy is the role-based access boundary (`/athlete/*`, `/medical/*`, `/admin/*`)
- Every authenticated page wraps its content in `<DashboardLayout allowedRoles={[...]} title="...">` (`components/layout/`). The layout enforces client-side role gating; backend RBAC is the actual security
- Auth state is JWT in `localStorage`, managed via `lib/auth.ts` (`saveSession` / `getSession` / `clearSession`). API calls go through `lib/api.ts` which auto-attaches the bearer token
- Modules 1 and 6 (Athlete Dashboard & Overall Risk Indicator, Clinical & Squad Monitoring) share the same dashboard components (`BodyMap`, `WorkloadChart`, `RiskRadar`, `ScreeningPanel` — the embedded HoloMotion report with threshold strips; there are no standalone screening pages) and the same `classifyCompositeRisk()` from `lib/risk.ts` — the medical view is "the athlete dashboard with a clinician's affordances added"
- Styling: a single `frontend/src/styles/globals.css` with CSS custom properties. Dark mode via `[data-theme="dark"]` on `<html>`. **Do not introduce CSS-in-JS, Tailwind, or component libraries.**

**The FYP differentiator — `frontend/src/lib/risk.ts`:**

> **Status change 2026-07-16 — read this first.** ACWR / composite risk is no
> longer shown on ANY dashboard. JC removed it: the "SECONDARY · Training Load"
> card visually dominated the primary cohort-normed indicator, and the athlete
> was reading three competing verdicts at once. Removed from athlete + medical
> (hero, ACWR gauge, load stat tiles, Workload Trend chart) and from coach
> (readiness now derives from the HoloMotion band; ACWR + Risk-level columns
> gone).
>
> **Status change 2026-07-20.** Activity Tracking (the FYP I Module 1 — sRPE
> session logging, `/athlete/activity`) was **fully removed** — frontend page,
> Sidebar link, `Activity`/`RecoveryBaseline` backend models + routes, seeder
> data all deleted. It was `risk.ts`'s only training-load input, so the
> recovery-baseline auto-trigger and the medical prevention-insight card (both
> of which depended on `classifyCompositeRisk()`'s ACWR argument) were retired
> alongside it. **`risk.ts` is NOT deleted** — the composite risk model
> formula is a locked decision — but it currently has **no live callers
> anywhere in the app**. The full rebuild spec (and this feature's fuller
> history) is `docs/fyp/ACWR_REBUILD.md`. Do not "restore" the ACWR heroes or
> Activity Tracking without asking; do not delete `risk.ts` either.
>
> **Restructure, same day.** Rather than leave a hole at "Module 1" or drop to
> five modules, JC asked to redistribute the surviving feature set across a
> fresh six — the old Data Management module split into **Screening Data
> Ingestion** and **Cohort Norms & Governance**. Every "Module N" reference
> elsewhere in this file uses the **current** numbering (Module 1 = Athlete
> Dashboard & Overall Risk Indicator, ..., Module 6 = Clinical & Squad
> Monitoring). Full mapping: `docs/fyp/FYP2_MODULES_USECASES.md` Appendix A/B.

It implements `classifyCompositeRisk()` which:
1. Computes a vulnerability score from the athlete's screening data (injury risk index, overall activity score, mobility, stability, symmetry)
2. **Personalises** the textbook Gabbett ACWR thresholds (0.8 / 1.3 / 1.5) by ±~15% based on vulnerability
3. **Escalates** the risk band when active injuries or muscle flags align with the current workload

Do not weaken this to plain Gabbett ACWR. If a refactor touches `risk.ts`, mention it in the response and re-check against `docs/MASTER_CLARIFICATIONS.md §6`.

## Locked decisions (cannot change without discussion)

From `docs/MASTER_CLARIFICATIONS.md §12`:

- The role model: FYP I shipped **3 roles** (athlete / medical / admin); **FYP II promotes `coach` to a first-class 4th role** (read-only, sport-scoped — squad readiness, team-report download, athlete screening detail, individual screening-PDF download for their sport's athletes). **A 5th role, `executive`, was added on JC's instruction 2026-08-08** — read-only institutional oversight (admin analytics + the three PDF reports) with no write access anywhere: no import, no norm edits, no roster or personnel changes, no settings, no backup export. It is deliberately NOT a "super admin": it has strictly fewer powers than `admin`, and naming it super-admin would misdescribe it. Adding *further* roles still needs discussion.
- The composite risk model formula
- sRPE method for load calculation (`load = duration × intensity`) — validated by Inoue (2022) for scale reliability and Yang (2024) for physiological correspondence. **Retired 2026-07-20** along with Activity Tracking (the only thing that computed it) — the formula itself stays locked/citable for the FYP report, it's just not implemented anywhere right now
- The body map asset source — path data adapted from MIT-licensed [`react-muscle-highlighter`](https://github.com/soroojshehryar/react-muscle-highlighter) by Sorooj Shehryar; lives in `frontend/src/components/dashboard/bodymap-data/` with MIT attribution preserved at the top of every file. **This attribution must stay in the FYP references section.**
- ~~The aggregation policy: figure shows regions, side cards show specific muscles~~ — **changed 2026-08-04.** The body map's Muscle Flags mode now draws HoloMotion's 22 individual muscles (`bodymap-data/muscles.ts` partitions the licensed geometry; 16 come from sub-paths the asset already had, 6 deep ones are insets). ROM & Stability mode still draws regions — the subitem score is genuinely 5 regions. Side cards unchanged. The **asset source + MIT attribution stay locked**; only the grain changed. See `docs/DESIGN_DECISIONS.md §4a`
- The Figma-derived UI (split login card, sidebar branding, topbar dropdown)
- The MySQL schema for `Athlete` and `Screening` (Sequelize models in `backend/src/models/`). ~~`Injury`~~ — that model was deleted by the HoloMotion-only cut (2026-08-02); the lock no longer has a subject
- ACWR thresholds 0.8 / 1.3 / 1.5 as the baseline

The live models are exactly: `User`, `Athlete`, `AthleteDiscipline`, `Screening`, `MuscleFlag`, `CohortThreshold`, `CohortNormVersion`, `Setting` (see `backend/src/models/index.js`).

~~Injury enums are locked (`docs/MASTER_CLARIFICATIONS.md §9`)~~ — **no longer applicable.** The `Injury` model and its enums are gone, so the old "`Overuse` is a mechanism, not an `injuryType`" seeder trap cannot occur. `MASTER_CLARIFICATIONS.md §9` is retained as a historical record of the FYP I schema.

## Environment

**Backend** (`backend/.env`, not committed):
```
PORT=5000
JWT_SECRET=...
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000,http://localhost:3001

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD='...'             # wrap in single quotes if it contains # $ % ^
MYSQL_DATABASE=airms

# SMTP for the password-reset emails (UC-2). If unset the mailer falls back
# to a console transport that prints the email body to the backend terminal.
SMTP_HOST=smtp.gmail.com         # leave blank for the console-fallback dev mode
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=...@gmail.com          # any provider works; Gmail / Mailtrap / SendGrid all tested
SMTP_PASS=...                    # for Gmail use a 16-char App Password (NOT your normal password)
SMTP_FROM='AIRMS <...@gmail.com>'

# Vision provider for HoloMotion PDF (Module 3 — Screening Data Ingestion) ingestion — the sole screening
# import path (Excel import retired; archive/excel-upload/). If unset, the PDF
# uploader self-disables (backup export unaffected). Provider-agnostic:
# the 'openai' wire format covers OpenAI / Gemini / Qwen (DashScope) /
# OpenRouter / Ollama; 'anthropic' is the native format. Switch with env only.
# Gemini free tier (AI Studio key) via its OpenAI-compatible endpoint:
#   VISION_PROVIDER=openai
#   VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
#   VISION_MODEL=gemini-flash-lite-latest   # verified 18/18 vs ground truth 2026-07-12
#   (gemini-2.0-flash has zero free quota; gemini-2.5-flash-lite is closed
#   to new users — use the -latest aliases)
# Ground-truth test once a key is set (from backend/):
#   npm run verify:vision -- "<path to thung jin seng_0122663031.pdf>"
VISION_PROVIDER=openai           # openai | anthropic
VISION_API_KEY=...               # leave blank to disable PDF ingestion
VISION_BASE_URL=                 # optional endpoint override (Qwen/OpenRouter/Ollama)
VISION_MODEL=gpt-4o-mini         # any vision-capable model id
VISION_MAX_PAGES=                # leading pages sent to the model (default 6 — covers
                                 # both compact & expanded HoloMotion layouts). Extraction
                                 # renders full pages of the data section (layout-robust),
                                 # not fixed crops — HoloMotion ships >1 page layout.
VISION_RENDER_SCALE=             # render scale 1-4 (default 2); lower = fewer tokens
```

When you change `SMTP_*` values, restart the backend — the mailer transport is built once and cached.

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Known dev-environment gotchas

1. **Stale Next.js process holds port 3000** → new instance auto-bumps to 3001 → CORS blocks API calls. Backend allows both as a safety net, but the cleaner fix is `Stop-Process -Id <pid> -Force` and restart `npm run dev`. Never edit CORS as a workaround.
2. **MySQL password with special characters** (`#`, `$`, `%`, `^`) must be wrapped in single quotes in `backend/.env` so `dotenv` doesn't interpret them.
3. **Seeder enum errors** — the classic offender (`Injury` enums) went with the model. The live enums to check seed data against are:
   - `User.role` — `athlete` | `medical` | `admin` | `coach` | `executive` (adding a value needs an `ALTER TABLE users MODIFY COLUMN role ENUM(...)` on an existing dev DB; a fresh clone gets it from `npm run seed`)
   - `Athlete.gender` — `Male` | `Female`; `Athlete.sex` — `M` | `F` (two separate columns)
   - `Athlete.program` — `PODIUM` | `PELAPIS` | `OTHERS`
   - `MuscleFlag.flagType` — `myodynamia` | `tension`; `MuscleFlag.side` — `L` | `R` | `B`
   - `Screening.overallBand` / `overrideBand` — `green` | `amber` | `red`
   - `CohortThreshold.tier` — `spgd` | `spg` | `sg` | `s` | `all`; `CohortThreshold.status` — `pending` | `approved`
4. **`Access denied for user 'root'@'localhost'`** during seed/boot means either the password is wrong or MySQL isn't running. Confirm with `Get-NetTCPConnection -LocalPort 3306`.
5. **The prototype folder** `airms-prototype/` is the inherited HTML reference from prior students (Shewin, Keying). It is **not deployed**, but design copy and component layouts are cherry-picked from it. Don't delete it.
6. **HoloMotion PDF rendering uses a `canvas` npm alias** → `@napi-rs/canvas` (prebuilt, declared in `backend/package.json`). Do **not** `npm install canvas` (node-canvas) — it needs a native compiler and fails on this Windows/Node setup. The alias is what lets `pdfjs` render the image-only HoloMotion PDFs. See [docs/DESIGN_DECISIONS.md §13](docs/DESIGN_DECISIONS.md).
7. **`Error: UNKNOWN, read (errno -4094)` from `next build` / `next lint`** — the repo lives inside OneDrive, and OneDrive's "Free up space" converts `node_modules` files into cloud reparse points that Node's ESM loader cannot read (even after hydration; plain `fs` reads work, the ESM fast path doesn't). Diagnose with `dir /s /a:l /b node_modules | find /c ":"` (counts reparse files); fix with `npm ci` in the affected package (rewrites plain files). It recurs whenever OneDrive frees space again — the durable fix is keeping OneDrive from dehydrating the project (right-click → "Always keep on this device") or moving the repo out of OneDrive.

## Submission workflow

This repo has a sibling clean-snapshot repo at `..\AIRMS-submission\` for academic-submission purposes (no Claude artefacts). The sync script and reference guide are both gitignored:

- [`sync-to-submission.ps1`](sync-to-submission.ps1) — idempotent mirror + scrub script. Run when JC asks to "sync to submission" or similar.
- [`SUBMISSION_WORKFLOW.md`](SUBMISSION_WORKFLOW.md) — full how-to, the safety-net warning behaviour, and when to patch the script vs. hand-edit the submission.

Commit cadences are independent — JC will commit many times in this repo between each submission sync. Never push to the submission repo without explicit instruction; treat that as a destructive-by-default action.

## Working norms for this repo

- The user (JC) writes terse messages. Soft pushback ("Erm…", "Well…") usually means he sees a problem you don't — listen, don't argue.
- Module 1 (Athlete Dashboard & Overall Risk Indicator) is an FYP showcase and is audit-fixed. Touch its components (`BodyMap.tsx`, `WorkloadChart.tsx`, `RiskRadar.tsx`, `risk.ts`, the dashboard pages) with the smallest possible surface. **`WorkloadChart.tsx` no longer renders on any dashboard** as of 2026-07-16 (see the risk.ts status note above) — it is retained for the ACWR rebuild path. **Activity Tracking (the FYP I Module 1) was fully removed 2026-07-20**, and the six-module set restructured the same day to fill the gap — there is no longer an activity page to protect.
- The 6-module FDD is the scope ceiling. Do not propose features outside it.
- Do not propose swapping the tech stack, charting library, body map asset, or styling approach without explicit discussion.
- When a memory entry mentions a specific file or function, verify it still exists before acting — memory can lag behind the code.
