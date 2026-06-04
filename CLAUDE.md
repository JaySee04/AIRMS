# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

AIRMS (Athlete Injury Risk Management System) is JC's Final Year Project. Stakeholder: **Dr Thung** at Institut Sukan Negara (ISN). Supervisor: **Dr Hoo Wai Lam**. This is a graded academic artifact — every architectural decision needs to be defensible in viva voce, not just shippable.

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
npm run seed               # drops + reseeds Mongo with deterministic PRNG (seed=42)

# Day-to-day
npm run dev                # backend :5000 + frontend :3000 via concurrently
npm run dev:backend        # backend only
npm run dev:frontend       # frontend only

# Frontend type-check / lint
cd frontend; npx tsc --noEmit -p tsconfig.json
cd frontend; npm run lint  # next lint

# Frontend production build
cd frontend; npm run build

# Backend has no test suite or linter configured
```

No automated test suite exists in either backend or frontend. Verification is manual: run `npm run dev`, log in with the demo credentials below, click through the affected flow.

## Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| athlete | `john.doe@isn.gov.my` | `password123` (linked to ATH0001) |
| medical | `dr.lim@isn.gov.my` | `password123` |
| admin | `admin@isn.gov.my` | `password123` |

## Architecture overview

Three-tier monorepo orchestrated by `concurrently` from the root `package.json`. There is no shared types package — frontend and backend each maintain their own type definitions.

**Backend** (`backend/`, Node + Express + Mongoose, JWT auth on every protected route):
- Entry: `backend/src/server.js` mounts routes, connects Mongo, registers CORS for both `:3000` and `:3001`
- RBAC enforced via `middleware/rbac.js` — `rbac('medical', 'admin')` style — on top of `middleware/auth.js` which verifies the `Authorization: Bearer <jwt>` header
- Models in `backend/src/models/` use Mongoose pre-save hooks to compute derived fields (e.g. `Activity.load = duration × intensity`) — derived values are persisted, not computed on read
- The canonical foreign key across collections is `athleteId` (string, e.g. `"ATH0001"`), **not** Mongo `_id`
- Module 3 has an important cross-model behaviour: approving a `SelfReport` server-side promotes it into a new `Injury` document (`routes/selfReports.js`)
- Module 5 PDF generation streams `application/pdf` directly from `routes/reports.js` using `pdfkit` (no temp files)
- Module 4 upload uses a two-step flow: `POST /api/upload/screening/preview` validates without committing; `POST /api/upload/screening` upserts

**Frontend** (`frontend/`, Next.js 14 App Router, TypeScript, plain CSS with variables):
- Pages live under `frontend/src/app/<role>/<slug>/page.tsx` — the URL hierarchy is the role-based access boundary (`/athlete/*`, `/medical/*`, `/admin/*`)
- Every authenticated page wraps its content in `<DashboardLayout allowedRoles={[...]} title="...">` (`components/layout/`). The layout enforces client-side role gating; backend RBAC is the actual security
- Auth state is JWT in `localStorage`, managed via `lib/auth.ts` (`saveSession` / `getSession` / `clearSession`). API calls go through `lib/api.ts` which auto-attaches the bearer token
- Modules 2 and 6 share the same dashboard components (`BodyMap`, `WorkloadChart`, `RiskRadar`) and the same `classifyCompositeRisk()` from `lib/risk.ts` — the medical view is "the athlete dashboard with a clinician's affordances added"
- Styling: a single `frontend/src/styles/globals.css` with CSS custom properties. Dark mode via `[data-theme="dark"]` on `<html>`. **Do not introduce CSS-in-JS, Tailwind, or component libraries.**

**The FYP differentiator — `frontend/src/lib/risk.ts`:**
This file is the *thing being graded*. It implements `classifyCompositeRisk()` which:
1. Computes a vulnerability score from the athlete's screening data (exercise risk score, mobility, stability, symmetry)
2. **Personalises** the textbook Gabbett ACWR thresholds (0.8 / 1.3 / 1.5) by ±~15% based on vulnerability
3. **Escalates** the risk band when active injuries or muscle flags align with the current workload

Do not weaken this to plain Gabbett ACWR. If a refactor touches `risk.ts`, mention it in the response and re-check against `docs/MASTER_CLARIFICATIONS.md §6`.

## Locked decisions (cannot change without discussion)

From `docs/MASTER_CLARIFICATIONS.md §12`:

- The 3-role model (athlete / medical / admin)
- The composite risk model formula
- sRPE method for load calculation (`load = duration × intensity`) — method origin Foster (2001); FYP I report cites Inoue (2022) + Yang (2024) as contemporary validators
- The body map asset source — path data adapted from MIT-licensed [`react-muscle-highlighter`](https://github.com/soroojshehryar/react-muscle-highlighter) by Sorooj Shehryar; lives in `frontend/src/components/dashboard/bodymap-data/` with MIT attribution preserved at the top of every file. **This attribution must stay in the FYP references section.**
- The aggregation policy: figure shows regions, side cards show specific muscles
- The Figma-derived UI (split login card, sidebar branding, topbar dropdown)
- The MongoDB schema for `Activity`, `Athlete`, `Injury`
- ACWR thresholds 0.8 / 1.3 / 1.5 as the baseline

Injury enums are locked (`docs/MASTER_CLARIFICATIONS.md §9`): note that `Overuse` is a **mechanism**, not an `injuryType` — confusing this is the most common seeder validation failure.

## Environment

**Backend** (`backend/.env`, not committed):
```
MONGO_URI=mongodb+srv://...      # password must be URL-encoded
JWT_SECRET=...
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000,http://localhost:3001
PORT=5000
```

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Known dev-environment gotchas

1. **Stale Next.js process holds port 3000** → new instance auto-bumps to 3001 → CORS blocks API calls. Backend allows both as a safety net, but the cleaner fix is `Stop-Process -Id <pid> -Force` and restart `npm run dev`. Never edit CORS as a workaround.
2. **MongoDB password with special characters** must be URL-encoded in `MONGO_URI`.
3. **Seeder enum errors** — when adding seed data, double-check Injury enums against the schemas in `backend/src/models/Injury.js`.
4. **The prototype folder** `airms-prototype/` is the inherited HTML reference from prior students (Shewin, Keying). It is **not deployed**, but design copy and component layouts are cherry-picked from it. Don't delete it.

## Submission workflow

This repo has a sibling clean-snapshot repo at `..\AIRMS-submission\` for academic-submission purposes (no Claude artefacts). The sync script and reference guide are both gitignored:

- [`sync-to-submission.ps1`](sync-to-submission.ps1) — idempotent mirror + scrub script. Run when JC asks to "sync to submission" or similar.
- [`SUBMISSION_WORKFLOW.md`](SUBMISSION_WORKFLOW.md) — full how-to, the safety-net warning behaviour, and when to patch the script vs. hand-edit the submission.

Commit cadences are independent — JC will commit many times in this repo between each submission sync. Never push to the submission repo without explicit instruction; treat that as a destructive-by-default action.

## Working norms for this repo

- The user (JC) writes terse messages. Soft pushback ("Erm…", "Well…") usually means he sees a problem you don't — listen, don't argue.
- Modules 1 and 2 are the FYP showcases and are audit-fixed. Touch their components (`BodyMap.tsx`, `WorkloadChart.tsx`, `RiskRadar.tsx`, `risk.ts`, the activity/dashboard pages) with the smallest possible surface.
- The 6-module FDD is the scope ceiling. Do not propose features outside it.
- Do not propose swapping the tech stack, charting library, body map asset, or styling approach without explicit discussion.
- When a memory entry mentions a specific file or function, verify it still exists before acting — memory can lag behind the code.
