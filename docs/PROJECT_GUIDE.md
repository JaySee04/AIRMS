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
├── backend/                  # Node.js / Express / MySQL API (Sequelize)
├── docs/                     # All project documentation (this folder)
│   ├── stakeholder/          # Meeting transcripts
│   └── data-samples/         # ISN-provided sample files
├── frontend/                 # Next.js 14 app (App Router, TypeScript)
├── reports/                  # FYP submitted reports
├── node_modules/             # Root deps (concurrently)
├── CLAUDE.md                 # Auto-loaded by Claude Code; pointer to docs/ + commands + locked decisions
├── package.json              # Root orchestrator (npm run dev / seed / install:all)
└── README.md                 # Quick start
```

---

## 2. Backend — `backend/`

### Entry point

[backend/src/server.js](../backend/src/server.js) — boots Express, connects to MySQL via Sequelize, registers routes.

### Environment

`backend/.env` (not committed):
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

# SMTP for password-reset OTP emails (console-fallback when unset)
SMTP_HOST=... SMTP_PORT=465 SMTP_SECURE=true SMTP_USER=... SMTP_PASS=... SMTP_FROM=...

# Vision provider for HoloMotion PDF ingestion (feature self-disables when unset).
# 'openai' wire format covers OpenAI / Qwen / OpenRouter / Ollama; 'anthropic' is native.
VISION_PROVIDER=openai          # openai | anthropic
VISION_API_KEY=...
VISION_BASE_URL=...             # optional endpoint override (Qwen/OpenRouter/Ollama)
VISION_MODEL=gpt-4o-mini        # any vision-capable model id
```

### Models — `backend/src/models/`

All Sequelize models. The `index.js` registers them and wires up associations (`Athlete.hasMany(Injury)` etc.) with `athleteId` as the cross-table key.

| File | Schema | Notes |
|---|---|---|
| [User.js](../backend/src/models/User.js) | email, password (hashed), role, name, athleteId?, **`coachSport`** (scalar, coach only), permissions (JSON), isActive | `beforeSave` hook bcrypts the password column. `permissions` is the per-user medical-staff feature opt-out map (see middleware/permission.js). `coachSport` is the one sport a coach is assigned to (was the JSON `coachSports` array pre-2026-07-18) |
| [Athlete.js](../backend/src/models/Athlete.js) | athleteId, name, sport, programme, biometrics, 8 flat risk-indicator columns | `athleteId` (VARCHAR) is the PK and the cross-table FK; risks reassembled into a nested `risks` object by the serialiser |
| [MuscleFlag.js](../backend/src/models/MuscleFlag.js) | id, athleteId, flagType (`myodynamia`\|`tension`), muscle, side | Single table for both flag categories, discriminated by `flagType`; serialiser splits rows into the `myodynamia[]` / `tension[]` arrays the frontend expects |
| [AthleteDiscipline.js](../backend/src/models/AthleteDiscipline.js) | id, athleteId, discipline | **FYP II** events an athlete competes in (`Athlete hasMany`), unique per (athlete, discipline); serialiser folds rows into a `disciplines[]` string array. Events are admin-extensible free strings — the import combobox offers existing ones (`GET /athletes/meta/disciplines`) or a typed-in new value; [lib/disciplines.ts](../frontend/src/lib/disciplines.ts) only holds seed suggestions (badminton's 5) |
| [Injury.js](../backend/src/models/Injury.js) | id, athleteId, bodyPart, side, injuryType, severity, mechanism, date, recoveryStatus, source, notes | Enum values locked — see [MASTER_CLARIFICATIONS.md §9](MASTER_CLARIFICATIONS.md#9-locked-data-shapes-do-not-change-without-migrating-data) |
| [SelfReport.js](../backend/src/models/SelfReport.js) | id, athleteId, bodyPart, side, suspectedType, severity, onsetDate, description, status (Pending/Approved/Rejected), reviewedBy, reviewNote | Approved reports get promoted into a new `Injury` row inside a single `sequelize.transaction()` |
| [Screening.js](../backend/src/models/Screening.js) | **FYP II** id, athleteId, assessedAt, importedBy, headline scores (totalScore/rom/stability/symmetry/exerciseRisks), 8 risk indicators (incl. `spinalDiscHerniation`=LDH, stored not shown), subitems (JSON, 25 values), posture (JSON), summaryText, muscleFlags (JSON), overallIndicator/overallBand/escalations, override{Band,Note,By,At} | Immutable snapshot — one row per committed HoloMotion import (history). `athletes` still holds the latest; this powers progress deltas + cohort norms. Clinician-override fields auto-expire on the next import (new row, no override) |
| [CohortThreshold.js](../backend/src/models/CohortThreshold.js) | **FYP II** id, sport, programme, gender, tier (`spg`\|`sg`\|`s`\|`all`), n, stats (JSON per-component {mean,sd}), overrides (JSON), status (`pending`\|`approved`), computedAt/approvedAt/approvedBy | One approved reference distribution per cohort per fallback tier. Auto-computed on import, admin-approved (pre-filled + editable) |
| [Setting.js](../backend/src/models/Setting.js) | **FYP II** key, value (JSON) | Admin-tunable knobs: `min_cohort_n`, `fallback_enabled`, escalation toggles, `bottom_k`, alert toggles. See `utils/settings.js` for defaults |
| [index.js](../backend/src/models/index.js) | — | Registers models + their `hasMany` / `belongsTo` associations |

### Routes — `backend/src/routes/`

| File | Mount point | Public endpoints |
|---|---|---|
| [auth.js](../backend/src/routes/auth.js) | `/api/auth` | `POST /login`, `GET /me` |
| [users.js](../backend/src/routes/users.js) | `/api/users` | admin-only: `GET /?role=` (list medical staff **or coaches**, incl. `coachSport`), `GET /permission-meta`, `POST /` (create a coach), `PATCH /:id` (medical → permissions + active; coach → `coachSport` + active) |
| [athletes.js](../backend/src/routes/athletes.js) | `/api/athletes` | `GET /` (list, medical/admin; filters `sport`/`program`/`gender`/`discipline`/`search`), `GET /:id`, `POST /` (admin), `PATCH /:id` (incl. `disciplines`), `DELETE /:id` (soft), `GET /meta/sports`, `GET /meta/disciplines`, `GET /analytics/screening` (admin — HoloMotion cohort: band counts per indicator, averages, top-flagged muscles; accepts athlete-level filters `sport`/`program`/`gender`/`ageMin`/`ageMax`) |
| [injuries.js](../backend/src/routes/injuries.js) | `/api/injuries` | `GET /` (filtered; `?limit=N` caps payload), `GET /athlete/:id`, `POST /`, `PATCH /:id`, `GET /analytics/summary`, **`GET /analytics/trends`** (recovery / recurrence / same-sport clustering for `/admin/trends`) |
| [selfReports.js](../backend/src/routes/selfReports.js) | `/api/self-reports` | `GET /` (medical), `GET /athlete/:id`, `POST /`, `PATCH /:id/review` (approve→creates Injury) |
| [upload.js](../backend/src/routes/upload.js) | `/api/upload` | **HoloMotion PDF (sole import path):** `GET /screening/pdf/status`, `POST /screening/pdf/preview` (render + vision-extract, no commit), `POST /screening/pdf` (commit JSON). Gated by `requirePermission('uploadData')`. Excel import retired 2026-07-12 → `archive/excel-upload/` |
| [reports.js](../backend/src/routes/reports.js) | `/api/reports` | `POST /injuries-pdf` (admin only) — server-side `pdfkit` rendering of filtered injury report; streams `application/pdf` |
| [screeningReports.js](../backend/src/routes/screeningReports.js) | `/api/screening-reports` | **FYP II** three cohort-normed HoloMotion PDFs: `GET /holistic.pdf` (admin), `GET /individual/:id.pdf`, `GET /team.pdf?sport&programme&gender`. `pdfkit`, drawn bars/pills |
| [cohorts.js](../backend/src/routes/cohorts.js) | `/api/cohorts` | **FYP II** admin: `GET /` (approval queue), `POST /recompute`, `PATCH /:id` (approve/edit norms), `GET|PATCH /settings/all` (tunable min-n, bottom-k, toggles) |
| [screenings.js](../backend/src/routes/screenings.js) | `/api/screenings` | **FYP II** `GET /athlete/:id` (history for progress deltas), `PATCH /:id/override` (medical clinician override of the risk band, note required) |
| [export.js](../backend/src/routes/export.js) | `/api/export` | `GET /backup.xlsx` (admin only) — streams a multi-sheet Excel snapshot (athletes + injuries + muscle flags) as the Excel-era data backup |

### Middleware — `backend/src/middleware/`

| File | What it does |
|---|---|
| [auth.js](../backend/src/middleware/auth.js) | Verifies JWT from `Authorization: Bearer <token>`, attaches `req.user` |
| [rbac.js](../backend/src/middleware/rbac.js) | `rbac('athlete', 'medical')` → 403 if `req.user.role` is not in the list |
| [permission.js](../backend/src/middleware/permission.js) | `requirePermission('uploadData')` → 403 if a **medical** user has had that capability revoked by an admin (opt-out model). admin/athlete pass through untouched |

### Other backend files

- [config/db.js](../backend/src/config/db.js) — `connectDB()` opens the Sequelize connection to MySQL using the `MYSQL_*` env vars
- [utils/seeder.js](../backend/src/utils/seeder.js) — `npm run seed` from `backend/`. `sequelize.sync({ force: true })` drops the schema, then reseeds users/athletes/muscle_flags/injuries with deterministic PRNG (seed=42); also drops the retired `activities`/`recovery_baselines` tables outright (force sync only touches tables still backed by a model). All screening values are HoloMotion-shaped (integer gauge scores, report-band indicators; weight/height null — not on the report; ~1 in 10 athletes unscreened). Anchors: ATH0001 John Doe (Module 1 demo) and ATH0061 Thung Jin Seng (transcribed 1:1 from the sample HoloMotion PDF — pipeline ground truth)
- [utils/serialize.js](../backend/src/utils/serialize.js) — response shaper. Aliases Sequelize's numeric `id` to a stringified `_id` field and reassembles Athlete's flat columns into nested `risks`/`myodynamia[]`/`tension[]` shape
- [utils/permissions.js](../backend/src/utils/permissions.js) — per-user medical-staff feature permissions: the key catalogue (`viewRecords`, `uploadData`, `reviewReports`, `injuryReports`), `hasPermission()`, and `sanitizePermissions()`. Opt-out model — a capability is granted unless explicitly set `false`
- [utils/pdfRender.js](../backend/src/utils/pdfRender.js) — renders HoloMotion PDF pages (1–3) to base64 PNGs via `pdfjs-dist` + the `canvas`→`@napi-rs/canvas` npm alias. HoloMotion PDFs have no text layer (jsPDF-baked graphics), so vision is the only reliable read
- [utils/visionClient.js](../backend/src/utils/visionClient.js) — provider-agnostic vision call. OpenAI-compatible adapter (OpenAI / Qwen / OpenRouter / Ollama) + Anthropic native adapter, selected by `VISION_*` env vars; `isVisionConfigured()` lets routes self-disable cleanly
- [utils/holomotionExtract.js](../backend/src/utils/holomotionExtract.js) — full pipeline: render → vision prompt → strict JSON → mapped onto the flat `Athlete` columns + `muscle_flags` rows. **FYP II** the prompt/mapping now also extract the 25 subitem scores, 8 posture axes, and page-1 summary text
- **FYP II** [utils/cohorts.js](../backend/src/utils/cohorts.js) — cohort-norm engine. `orientedComponents()` builds the six higher-is-better inputs (totalScore/rom/stability/symmetry + `riskGood` = negated mean of the 7 shown risks, LDH excluded + `balance` = negated L/R subitem asymmetry); `recomputeCohorts()` computes mean/SD per `(sport,programme,gender)` cohort across the four fallback tiers and upserts them (preload-into-Map + `Promise.all`/`bulkCreate`, no N+1); `resolveFromMap()`/`resolveCohortStats()` walk the `spg→sg→s→all` ladder to the first tier meeting `min_cohort_n`
- **FYP II** [utils/overallIndicator.js](../backend/src/utils/overallIndicator.js) — the overall risk indicator (Total Score of Athleticism): `computeIndicator()` averages the component z-scores, maps to a 0–100 display score, and bands by **escalation** (+1 below cohort mean, +1 in the cohort's bottom-`k` → 0/1/2 = green/amber/red); `recomputeIndicators()` re-scores every athlete's latest screening in-memory from the approved cohorts (parallel load + `Promise.all` update)
- **FYP II** [utils/settings.js](../backend/src/utils/settings.js) — `getSettings()`/`setSetting()` over the `settings` key/value table, with `DEFAULTS` (min_cohort_n 5, fallback on, both escalations on, bottom_k 3, alerts on, alert_on_band amber)
- **FYP II** [utils/alerts.js](../backend/src/utils/alerts.js) — `alertIfNeeded(athleteId)`: if the athlete's latest band ≥ `alert_on_band`, emails the medical staff + the sport's coaches (coaches whose `coachSport` equals the athlete's sport) via `utils/mailer.js`. Fired on import commit

---

## 3. Frontend — `frontend/`

Next.js 14 App Router, TypeScript, plain CSS.

### Environment

`frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### App routes — `frontend/src/app/`

Pages mapped to the 3 roles + profile pages:

| Path | Role | Purpose |
|---|---|---|
| [`/`](../frontend/src/app/page.tsx) | public | Login |
| [`/athlete/dashboard`](../frontend/src/app/athlete/dashboard/page.tsx) | athlete | Module 1 — **FYP II** the cohort-normed overall risk indicator is the page's only risk verdict (hero + "regions behind this band" detail); ACWR/workload removed 2026-07-16, embedded HoloMotion screening panel. Activity Tracking (`/athlete/activity`, formerly Module 1 in the FYP I decomposition) fully removed 2026-07-20 — no more Recent Activity table |
| [`/athlete/injury-report`](../frontend/src/app/athlete/injury-report/page.tsx) | athlete | Module 2 — self-report form |
| [`/athlete/profile`](../frontend/src/app/athlete/profile/page.tsx) | athlete | Profile |
| [`/medical/dashboard`](../frontend/src/app/medical/dashboard/page.tsx) | medical | Module 6 — athlete search/view + overall risk badge with the **clinician band-override** control (`ClinicianBandOverride` — outcome-labelled Safe / Needs-attention / Immediate-assessment choices, calculated-vs-in-force provenance, required note captured inline) + embedded HoloMotion screening panel |
| [`/medical/injury-log`](../frontend/src/app/medical/injury-log/page.tsx) | medical | Module 2 — log official injury |
| [`/medical/review-reports`](../frontend/src/app/medical/review-reports/page.tsx) | medical | Module 2 — review athlete self-reports |
| [`/medical/data-upload`](../frontend/src/app/medical/data-upload/page.tsx) | medical | Module 3 — HoloMotion PDF import (batch + name-match) |
| [`/medical/profile`](../frontend/src/app/medical/profile/page.tsx) | medical | Profile |
| [`/admin/dashboard`](../frontend/src/app/admin/dashboard/page.tsx) | admin | Module 5 — injury analytics + Module 4 — HoloMotion screening-cohort card (both follow the athlete-level filters: sport / programme / gender / age) |
| [`/admin/trends`](../frontend/src/app/admin/trends/page.tsx) | admin | **FYP II** Recovery & Trends — recovery status, recurring problems, same-sport clustering (`GET /injuries/analytics/trends`) |
| [`/admin/reports`](../frontend/src/app/admin/reports/page.tsx) | admin | Module 5 — injury PDF report builder + **FYP II** screening reports card (holistic / individual / team downloads) |
| [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx) | admin | **FYP II** cohort-norm approval queue — tunable settings, recompute, per-cohort approve/revert + editable component means |
| [`/admin/staff`](../frontend/src/app/admin/staff/page.tsx) | admin | Medical-staff permission control + account activation |
| [`/admin/coaches`](../frontend/src/app/admin/coaches/page.tsx) | admin | **FYP II** create a coach, assign/change their one sport, activate/deactivate (coach = first-class 4th role; no reseed needed) |
| [`/admin/data-upload`](../frontend/src/app/admin/data-upload/page.tsx) | admin | Module 3 — HoloMotion PDF import (batch + name-match) + Module 4 — data backup |
| [`/admin/profile`](../frontend/src/app/admin/profile/page.tsx) | admin | Profile |
| [`/coach/dashboard`](../frontend/src/app/coach/dashboard/page.tsx) | coach | **FYP II** (first-class 4th role) read-only squad readiness scoped to the coach's ONE assigned sport — all athletes' HoloMotion overall risks, sorted worst-first with the worst region named, filterable by programme / gender / event; selecting a row opens a read-only screening detail (radar + ScreeningPanel + body map) and the team report is downloadable here. Coaching-cockpit cards: **suggested focus** (the squad's top shared regions turned into training-load adjustments — a region-frequency heuristic with a caveat that it is NOT the cohort risk model), needs-attention, **squad breakdown** (muscle hotspots / readiness-by-event / momentum), per-athlete trend |
| [`/coach/profile`](../frontend/src/app/coach/profile/page.tsx) | coach | **FYP II** Profile (reuses `ProfileShell` — assigned sport + squad vitals + change password) |

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
| [ScreeningPanel.tsx](../frontend/src/components/dashboard/ScreeningPanel.tsx) | Athlete + Medical + Coach dashboards (embedded). The latest HoloMotion report read against its thresholds — five tier-ticked score gauges, eight indicator threshold strips (OK/Watch/High zones, sport-critical regions starred via `lib/screeningAlerts.ts`), the **Physical Fitness Subitem Score** table and **Posture Evaluation** list (both render only when the report carried them), myodynamia/tension chips |
| [SubitemTable.tsx](../frontend/src/components/dashboard/SubitemTable.tsx) | Shared by `ScreeningPanel` and the import preview. The 5-region ROM L/R · Stability L/R · Symmetry table as HoloMotion-tier-coloured discs |
| [PostureList.tsx](../frontend/src/components/dashboard/PostureList.tsx) | Shared by `ScreeningPanel` and the import preview. The 8-axis Posture Evaluation as finding + signed value — no fabricated range bar (the report's per-axis reference ranges aren't part of the extraction schema) |
| [ScreeningHistory.tsx](../frontend/src/components/dashboard/ScreeningHistory.tsx) | Athlete + Medical + Coach views. Report-to-report progress table (`GET /screenings/athlete/:id`, summary columns) with a "Change since first" delta row — the on-screen counterpart of the individual PDF's progress section. On the athlete dashboard its header hosts the athlete's own **Download PDF** button (self-only server-side) |
| [ScreeningAlertBanner.tsx](../frontend/src/components/dashboard/ScreeningAlertBanner.tsx) | Athlete + Medical dashboards. Renders the sport-aware screening alert (a body region critical for the athlete's sport whose HoloMotion indicator is out of range). Backed by `lib/screeningAlerts.ts`; renders nothing when there's nothing to flag |
| [OverallRiskBadge.tsx](../frontend/src/components/dashboard/OverallRiskBadge.tsx) | **FYP II** Athlete + Medical + Coach dashboards. Traffic-light badge for the cohort-normed overall indicator (0–100 score, band, escalation factors); compact + full modes. On Medical the clinician band-override control sits beneath it |
| [ClinicianBandOverride.tsx](../frontend/src/components/dashboard/ClinicianBandOverride.tsx) | **FYP II** Medical dashboard only. The band-override control under the risk hero: outcome-labelled Safe / Needs-attention / Immediate-assessment cards (colour reinforces, never the sole carrier), `In force` + `Calculated` tags so the clinician sees what they're diverging from, and the required assessment note captured inline (replaced the old bare green/amber/red buttons + `window.prompt`). PATCHes `/api/screenings/:id/override` |

### Upload component — `frontend/src/components/upload/`

| File | Used by |
|---|---|
| [PdfScreeningUpload.tsx](../frontend/src/components/upload/PdfScreeningUpload.tsx) | Admin + Medical data-upload pages. Batch HoloMotion PDF queue: **auto-extracts on drop** (spaced vision calls; *Retry failed* re-queues errors), roster name-match autofill (ID/sport/programme), searchable 52-sport datalist ([`lib/sports.ts`](../frontend/src/lib/sports.ts)), events via [`TagCombobox`](../frontend/src/components/ui/TagCombobox.tsx), per-file preview → confirm. Self-disables when the vision provider is unconfigured |
| [ScreeningPreview.tsx](../frontend/src/components/upload/ScreeningPreview.tsx) | The pre-import read-out inside each queued report: headline scores (tier/band), exercise-risk evaluation as banded bars, HoloMotion subitem table (tier colours); the muscle **BodyMap** hero renders beside it. Presents extracted data the way the dashboards do so the operator can verify before committing |
| [TagCombobox.tsx](../frontend/src/components/ui/TagCombobox.tsx) | Small multi-select combobox (chips + styled dropdown) — pick an existing value or type a new one. Replaces the browser-native `<datalist>`; used for events in the import step and the medical "Edit events" editor |
| [DataBackupCard.tsx](../frontend/src/components/upload/DataBackupCard.tsx) | Admin data-upload page. One-click download of the Excel-era data backup from `/api/export/backup.xlsx` |

### Profile component — `frontend/src/components/profile/`

| File | Used by |
|---|---|
| [ProfileShell.tsx](../frontend/src/components/profile/ProfileShell.tsx) | Shared by `/athlete`, `/medical`, `/admin`, `/coach` profiles. Renders the hero (initials avatar + name + email + role chip), role-specific stat tiles, account-info card, account-actions card (change password modal + sign out) |

### Library — `frontend/src/lib/`

| File | Exports |
|---|---|
| [api.ts](../frontend/src/lib/api.ts) | `api.get / post / patch / delete` (+ `downloadGet` / `downloadPost` for PDF blobs) — thin fetch wrapper that attaches the JWT from `localStorage` |
| [disciplines.ts](../frontend/src/lib/disciplines.ts) | `SPORT_DISCIPLINES` seed suggestions + `disciplinesForSport()` / `sportHasDisciplines()` — the per-sport event autocomplete seeds (events are otherwise admin-extensible free strings) |
| [name.ts](../frontend/src/lib/name.ts) | `getInitials()` — two-letter avatar initials, shared across Topbar / profile / coach + medical dashboards |
| [auth.ts](../frontend/src/lib/auth.ts) | `saveSession`, `getSession`, `clearSession`, `requireRole`, `SessionUser` type, plus `hasPermission()` + `PermissionKey` for the medical-staff feature opt-out (mirrors backend `utils/permissions.js`) |
| [risk.ts](../frontend/src/lib/risk.ts) | `classifyCompositeRisk()` + `computeVulnerability()` + `personalisedThresholds()` — the FYP differentiator |
| [screeningAlerts.ts](../frontend/src/lib/screeningAlerts.ts) | `computeBodyPartAlerts()` + `SPORT_CRITICAL_REGIONS` map + `thresholdsFor()` — sport-aware screening alerts with per-sport per-region thresholds (critical regions tightened to 12/20, others keep the instrument's 15/25). A **separate** layer from `risk.ts` (does not modify `classifyCompositeRisk()`) |
| [trainingFocus.ts](../frontend/src/lib/trainingFocus.ts) | `buildTrainingFocus()` — the screening panel's Training Focus block: corrective exercises (HoloMotion prescription vocabulary, reps × sets · rest dosing) for up to three out-of-range regions, sport-critical first. Rule-based counterpart of the report's closing Training Prescription |

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
| [../CLAUDE.md](../CLAUDE.md) | Root-level Claude Code primer — auto-loaded into every session. Pointer to the docs below + commands + locked-decisions summary |
| [README_FOR_CLAUDE_CODE.md](README_FOR_CLAUDE_CODE.md) | Long-form entry point for new sessions. Reading order. Communication norms |
| [MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md) | Architectural truth. Locked decisions. Read first |
| [MODULES_STATUS.md](MODULES_STATUS.md) | Status of all 6 FDD modules, plus spec for unbuilt ones |
| [USER_MANUAL.md](USER_MANUAL.md) | End-user walk-through of every shipped feature |
| [PROJECT_GUIDE.md](PROJECT_GUIDE.md) | This file — file-level technical reference |
| [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) | Why we chose what we chose. Defensibility hooks for FYP viva |
| [FYP_RUBRICS.md](FYP_RUBRICS.md) | FYP I rubric weighting (Report 30 / Soft 10 / Viva Tech 50 / Viva Soft 10) and pre-viva priority list |
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
| athlete | `athlete@isn.gov.my` | `athlete123` | ATH0001 (John Doe) |
| medical | `medical@isn.gov.my` | `medical123` | — |
| admin | `admin@isn.gov.my` | `admin123` | — |
| admin (SMTP demo) | `poseidonapollo11@gmail.com` | `admin123` | — |

Other seeded athletes (ATH0002–ATH0060) all have random Malaysian-style names per the seeder PRNG. ATH0061 is Thung Jin Seng (`thung@isn.gov.my / thung123`) — seeded as a deliberately **stale earlier assessment** (modelled on the worse 07-17 test shown on the sample report's own trend page), so importing the sample HoloMotion PDF visibly updates his dashboard to the printed 07-19 values. The printed values themselves are the extraction ground truth in `backend/scripts/verify-holomotion-extract.js`.

---

## 8. How to add a new page

1. Create `frontend/src/app/<role>/<slug>/page.tsx` (Next.js App Router auto-mounts it)
2. Use `<DashboardLayout allowedRoles={[...]} title="...">` as the root
3. If it needs new backend endpoints, add them to `backend/src/routes/<resource>.js` (mount in `server.js`)
4. Update the per-role nav map in [Sidebar.tsx](../frontend/src/components/layout/Sidebar.tsx)
5. Add an entry to [USER_MANUAL.md](USER_MANUAL.md)
6. If it introduces a new locked decision, update [MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md)

---

*Last updated: 2026-06-28 — documented HoloMotion PDF (vision-AI) ingestion, per-user medical-staff permissions, Excel data backup, and the athlete/medical screening-report pages. Corrected demo credentials. Added SMTP + VISION env vars.*
