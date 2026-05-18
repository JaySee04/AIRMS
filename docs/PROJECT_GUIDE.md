# AIRMS — Project Guide (Technical Reference)

> File-level map of the codebase. Updated whenever files are added, moved, or significantly restructured.
>
> Read this when you need to find *where* a thing lives, not *what* it does.

---

## 1. Top-level structure

```
AIRMS (JC FYP)/
├── airms-prototype/          # Original HTML prototype from prior students
├── assets/                   # Original source logos (logo1, logo2, logofull)
├── backend/                  # Node.js / Express / MongoDB API
├── docs/                     # All project documentation (this folder)
│   ├── stakeholder/          # Meeting transcripts
│   └── data-samples/         # ISN-provided sample files
├── frontend/                 # Next.js 14 app (App Router, TypeScript)
├── reports/                  # FYP submitted reports
├── node_modules/             # Root deps (concurrently)
├── package.json              # Root orchestrator (npm run dev / seed / install:all)
└── README.md                 # Quick start
```

---

## 2. Backend — `backend/`

### Entry point

[backend/src/server.js](../backend/src/server.js) — boots Express, connects to MongoDB, registers routes.

### Environment

`backend/.env` (not committed):
```
MONGO_URI=mongodb+srv://...      # URL-encoded password
JWT_SECRET=...
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000,http://localhost:3001
PORT=5000
```

### Models — `backend/src/models/`

| File | Schema | Notes |
|---|---|---|
| [User.js](../backend/src/models/User.js) | email, password (hashed), role, name, athleteId? | Mongoose pre-save hook bcrypts password |
| [Athlete.js](../backend/src/models/Athlete.js) | athleteId, name, sport, programme, biometrics, screening scores, risks (8 indicators), myodynamia[], tension[] | `athleteId` is the canonical FK (NOT `_id`) |
| [Activity.js](../backend/src/models/Activity.js) | athleteId, date, type, duration, intensity, load, notes | Pre-save: auto-computes `load = duration × intensity` |
| [Injury.js](../backend/src/models/Injury.js) | athleteId, bodyPart, side, injuryType, severity, mechanism, date, recoveryStatus, source, notes | Enum values locked — see [MASTER_CLARIFICATIONS.md §9](MASTER_CLARIFICATIONS.md#9-locked-data-shapes-do-not-change-without-migrating-data) |
| [SelfReport.js](../backend/src/models/SelfReport.js) | athleteId, bodyPart, side, suspectedType, severity, onsetDate, description, status (Pending/Approved/Rejected), reviewedBy, reviewNote | Approved reports get promoted into an `Injury` document |

### Routes — `backend/src/routes/`

| File | Mount point | Public endpoints |
|---|---|---|
| [auth.js](../backend/src/routes/auth.js) | `/api/auth` | `POST /login`, `GET /me` |
| [athletes.js](../backend/src/routes/athletes.js) | `/api/athletes` | `GET /` (list, medical/admin), `GET /:id`, `POST /` (admin), `PATCH /:id`, `DELETE /:id` (soft), `GET /meta/sports` |
| [activities.js](../backend/src/routes/activities.js) | `/api/activities` | `GET /athlete/:id`, `GET /athlete/:id/acwr`, `POST /`, `PUT /:id`, `DELETE /:id` |
| [injuries.js](../backend/src/routes/injuries.js) | `/api/injuries` | `GET /` (filtered), `GET /athlete/:id`, `POST /`, `PATCH /:id`, `GET /analytics/summary` |
| [selfReports.js](../backend/src/routes/selfReports.js) | `/api/self-reports` | `GET /` (medical), `GET /athlete/:id`, `POST /`, `PATCH /:id/review` (approve→creates Injury) |
| [upload.js](../backend/src/routes/upload.js) | `/api/upload` | `POST /screening/preview` (parse + validate, no commit), `POST /screening` (upsert) |
| [reports.js](../backend/src/routes/reports.js) | `/api/reports` | `POST /injuries-pdf` (admin only) — server-side `pdfkit` rendering of filtered injury report; streams `application/pdf` |

### Middleware — `backend/src/middleware/`

| File | What it does |
|---|---|
| [auth.js](../backend/src/middleware/auth.js) | Verifies JWT from `Authorization: Bearer <token>`, attaches `req.user` |
| [rbac.js](../backend/src/middleware/rbac.js) | `rbac('athlete', 'medical')` → 403 if `req.user.role` is not in the list |

### Other backend files

- [config/db.js](../backend/src/config/db.js) — `connectDB()` using `mongoose.connect(MONGO_URI)`
- [utils/seeder.js](../backend/src/utils/seeder.js) — `npm run seed` from `backend/`. Drops + reseeds users/athletes/activities/injuries with deterministic PRNG (seed=42)

---

## 3. Frontend — `frontend/`

Next.js 14 App Router, TypeScript, plain CSS.

### Environment

`frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### App routes — `frontend/src/app/`

13 pages mapped to the 3 roles + 3 profile pages:

| Path | Role | Purpose |
|---|---|---|
| [`/`](../frontend/src/app/page.tsx) | public | Login |
| [`/athlete/dashboard`](../frontend/src/app/athlete/dashboard/page.tsx) | athlete | Module 2 — composite risk dashboard |
| [`/athlete/activity`](../frontend/src/app/athlete/activity/page.tsx) | athlete | Module 1 — activity tracking |
| [`/athlete/injury-report`](../frontend/src/app/athlete/injury-report/page.tsx) | athlete | Module 3 — self-report form |
| [`/athlete/profile`](../frontend/src/app/athlete/profile/page.tsx) | athlete | Profile |
| [`/medical/dashboard`](../frontend/src/app/medical/dashboard/page.tsx) | medical | Module 6 — athlete search/view |
| [`/medical/injury-log`](../frontend/src/app/medical/injury-log/page.tsx) | medical | Module 3 — log official injury |
| [`/medical/review-reports`](../frontend/src/app/medical/review-reports/page.tsx) | medical | Module 3 — review athlete self-reports |
| [`/medical/data-upload`](../frontend/src/app/medical/data-upload/page.tsx) | medical | Module 4 — screening upload |
| [`/medical/profile`](../frontend/src/app/medical/profile/page.tsx) | medical | Profile |
| [`/admin/dashboard`](../frontend/src/app/admin/dashboard/page.tsx) | admin | Module 5 — injury analytics |
| [`/admin/reports`](../frontend/src/app/admin/reports/page.tsx) | admin | Module 5 — PDF report builder |
| [`/admin/data-upload`](../frontend/src/app/admin/data-upload/page.tsx) | admin | Module 4 — screening upload |
| [`/admin/profile`](../frontend/src/app/admin/profile/page.tsx) | admin | Profile |

### Layout components — `frontend/src/components/layout/`

| File | Role |
|---|---|
| [DashboardLayout.tsx](../frontend/src/components/layout/DashboardLayout.tsx) | Wraps every authenticated page. Guards via `allowedRoles` prop. Renders Sidebar + Topbar + `<main>` with the page content. Manages theme state |
| [Sidebar.tsx](../frontend/src/components/layout/Sidebar.tsx) | 256px navy nav rail with branding block, per-role NAV map, active-link gold highlight, footer version string |
| [Topbar.tsx](../frontend/src/components/layout/Topbar.tsx) | 60px top bar: title left, role info + theme toggle + initials avatar with dropdown menu (My Profile + Sign out) |

### Dashboard components — `frontend/src/components/dashboard/`

| File | Used by |
|---|---|
| [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx) | Athlete dashboard + Medical dashboard. Renders the front + back silhouette with flagged muscle regions, summary tile, legend, and per-category flag cards |
| [WorkloadChart.tsx](../frontend/src/components/dashboard/WorkloadChart.tsx) | Athlete dashboard + Medical dashboard. Chart.js bar (weekly load) + line (ACWR) dual-axis |
| [RiskRadar.tsx](../frontend/src/components/dashboard/RiskRadar.tsx) | Athlete dashboard + Medical dashboard. Chart.js radar of 8 injury-risk indicators |
| [bodymap-data/bodyFront.ts](../frontend/src/components/dashboard/bodymap-data/bodyFront.ts) | MIT-licensed path data (front view) — Sorooj Shehryar's react-muscle-highlighter |
| [bodymap-data/bodyBack.ts](../frontend/src/components/dashboard/bodymap-data/bodyBack.ts) | MIT-licensed path data (back view) |
| [bodymap-data/outlines.ts](../frontend/src/components/dashboard/bodymap-data/outlines.ts) | Single-path silhouette outlines for front + back |
| [bodymap-data/types.ts](../frontend/src/components/dashboard/bodymap-data/types.ts) | `BodyPart` interface |

### Upload component — `frontend/src/components/upload/`

| File | Used by |
|---|---|
| [ScreeningUpload.tsx](../frontend/src/components/upload/ScreeningUpload.tsx) | Admin + Medical data-upload pages. Drag-drop + preview + commit flow against `/api/upload/screening` |

### Profile component — `frontend/src/components/profile/`

| File | Used by |
|---|---|
| [ProfileShell.tsx](../frontend/src/components/profile/ProfileShell.tsx) | `/medical/profile` + `/admin/profile`. Renders the hero (initials avatar + name + email + role chip), role-specific stat tiles, account-info card, account-actions card (change password modal + sign out) |

### Library — `frontend/src/lib/`

| File | Exports |
|---|---|
| [api.ts](../frontend/src/lib/api.ts) | `api.get / post / patch / delete` — thin fetch wrapper that attaches the JWT from `localStorage` |
| [auth.ts](../frontend/src/lib/auth.ts) | `saveSession`, `getSession`, `clearSession`, `requireRole`, `SessionUser` type |
| [risk.ts](../frontend/src/lib/risk.ts) | `classifyCompositeRisk()` + `computeVulnerability()` + `personalisedThresholds()` — the FYP differentiator |

### Styles

[frontend/src/styles/globals.css](../frontend/src/styles/globals.css) — single global stylesheet. Uses CSS variables for theming (`--brand-navy`, `--brand-gold`, `--risk-*`, `--bodymap-*`, etc.). Dark mode via `[data-theme="dark"]` attribute on `<html>`.

---

## 4. The prototype — `airms-prototype/`

The original HTML prototype from prior students Shewin and Keying. **Not deployed — kept as a design reference.** The Next.js implementation cherry-picks from these for component design and copy.

Useful files:
- [airms-prototype/assets/css/main.css](../airms-prototype/assets/css/main.css) — original CSS, source of much styling
- [airms-prototype/assets/js/mockdata.js](../airms-prototype/assets/js/mockdata.js) — mock data structure
- [airms-prototype/assets/js/bodymap.js](../airms-prototype/assets/js/bodymap.js) — original primitive-shapes body map (superseded by the MIT silhouette in Next.js)
- Per-role HTML pages — design reference when building or polishing the equivalent Next.js page

---

## 5. Documentation — `docs/`

| File | Purpose |
|---|---|
| [README_FOR_CLAUDE_CODE.md](README_FOR_CLAUDE_CODE.md) | Entry point for new sessions. Reading order. Communication norms |
| [MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md) | Architectural truth. Locked decisions. Read first |
| [MODULES_STATUS.md](MODULES_STATUS.md) | Status of all 6 FDD modules, plus spec for unbuilt ones |
| [USER_MANUAL.md](USER_MANUAL.md) | End-user walk-through of every shipped feature |
| [PROJECT_GUIDE.md](PROJECT_GUIDE.md) | This file — file-level technical reference |
| [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) | Why we chose what we chose. Defensibility hooks for FYP viva |
| [ATHLETE_ASSESSMENT_FIELDS.md](ATHLETE_ASSESSMENT_FIELDS.md) | Every field in the ISN spreadsheet explained |
| [stakeholder/meeting-2026-04-24-dr-thung.txt](stakeholder/meeting-2026-04-24-dr-thung.txt) | Full transcript of stakeholder meeting |
| [data-samples/isn-csv-template.xlsx](data-samples/isn-csv-template.xlsx) | Canonical ISN screening data sample |

---

## 6. How to run / build / seed

From project root:

```powershell
# First-time setup
npm install                # installs concurrently at root
npm run install:all        # installs deps in root + backend + frontend

# Day-to-day
npm run dev                # backend (5000) + frontend (3000) together
npm run dev:backend        # backend only
npm run dev:frontend       # frontend only

# Database
npm run seed               # reseeds users, athletes, activities, injuries

# Type-check
cd frontend && npx tsc --noEmit -p tsconfig.json

# Health check
curl http://localhost:5000/api/health
```

### Common ports

| Port | What |
|---|---|
| 3000 | Next.js dev server |
| 3001 | Next.js fallback if 3000 is held by a stale process |
| 5000 | Express API |

If port 3000 is held: kill the stale process (`Stop-Process -Id <pid> -Force` in PowerShell) and restart. CORS already allows both 3000 and 3001 as a safety net.

---

## 7. Demo credentials

| Role | Email | Password | Athlete linked |
|---|---|---|---|
| athlete | `john.doe@isn.gov.my` | `password123` | ATH0001 |
| medical | `dr.lim@isn.gov.my` | `password123` | — |
| admin | `admin@isn.gov.my` | `password123` | — |

Other seeded athletes (ATH0002–ATH0060) all have random Malaysian-style names per the seeder PRNG.

---

## 8. How to add a new page

1. Create `frontend/src/app/<role>/<slug>/page.tsx` (Next.js App Router auto-mounts it)
2. Use `<DashboardLayout allowedRoles={[...]} title="...">` as the root
3. If it needs new backend endpoints, add them to `backend/src/routes/<resource>.js` (mount in `server.js`)
4. Update the per-role nav map in [Sidebar.tsx](../frontend/src/components/layout/Sidebar.tsx)
5. Add an entry to [USER_MANUAL.md](USER_MANUAL.md)
6. If it introduces a new locked decision, update [MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md)

---

*Last updated: 2026-05-17.*
