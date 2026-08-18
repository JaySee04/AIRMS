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
│   └── stakeholder/          # Meeting transcripts
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

All Sequelize models. The `index.js` registers them and wires up associations — `Athlete.hasMany(MuscleFlag | AthleteDiscipline | Screening)` — with `athleteId` as the cross-table key. `User → Athlete` is a soft link via `User.athleteId` (a column, not a strict FK, to avoid seed-order problems).

> **Deleted by the HoloMotion-only cut (2026-08-02):** `Injury.js` and `SelfReport.js`, together with the self-report→injury promotion transaction. Injury state is now a single clinician-set flag on the Athlete row (`isInjured` / `injuryNote` / `injuryBy` / `injuryAt`).

| File | Schema | Notes |
|---|---|---|
| [User.js](../backend/src/models/User.js) | email, password (hashed), role, name, athleteId?, **`coachSport`** (scalar, coach only), permissions (JSON), isActive | `beforeSave` hook bcrypts the password column. `permissions` is the per-user medical-staff feature opt-out map (see middleware/permission.js). `coachSport` is the one sport a coach is assigned to (was the JSON `coachSports` array pre-2026-07-18) |
| [Athlete.js](../backend/src/models/Athlete.js) | athleteId, name, sport, programme, biometrics, 8 flat risk-indicator columns | `athleteId` (VARCHAR) is the PK and the cross-table FK; risks reassembled into a nested `risks` object by the serialiser |
| [MuscleFlag.js](../backend/src/models/MuscleFlag.js) | id, athleteId, flagType (`myodynamia`\|`tension`), muscle, side | Single table for both flag categories, discriminated by `flagType`; serialiser splits rows into the `myodynamia[]` / `tension[]` arrays the frontend expects |
| [AthleteDiscipline.js](../backend/src/models/AthleteDiscipline.js) | id, athleteId, discipline | **FYP II** events an athlete competes in (`Athlete hasMany`), unique per (athlete, discipline); serialiser folds rows into a `disciplines[]` string array. Events are admin-extensible free strings — the import combobox offers existing ones (`GET /athletes/meta/disciplines`) or a typed-in new value; [lib/disciplines.ts](../frontend/src/lib/disciplines.ts) only holds seed suggestions (badminton's 5) |
| [Screening.js](../backend/src/models/Screening.js) | **FYP II** id, athleteId, assessedAt, importedBy, headline scores (totalScore/rom/stability/symmetry/exerciseRisks), 8 risk indicators (incl. `spinalDiscHerniation`=LDH, stored not shown), subitems (JSON, 25 values), posture (JSON), summaryText, muscleFlags (JSON), overallIndicator/overallBand/escalations, override{Band,Note,By,At} | Immutable snapshot — one row per committed HoloMotion import (history). `athletes` still holds the latest; this powers progress deltas + cohort norms. Clinician-override fields auto-expire on the next import (new row, no override) |
| [CohortThreshold.js](../backend/src/models/CohortThreshold.js) | **FYP II** id, sport, programme, gender, discipline, tier (`spgd`\|`spg`\|`sg`\|`s`\|`all`), n, stats (JSON per-component {mean,sd}), overrides (JSON), status (`pending`\|`approved`), computedAt/approvedAt/approvedBy | One approved reference distribution per cohort per fallback tier. Auto-computed on import, admin-approved (pre-filled + editable). `spgd` is the discipline-level tier added by B2 (2026-08) — unique key is (sport, programme, gender, discipline, tier) |
| [CohortNormVersion.js](../backend/src/models/CohortNormVersion.js) | **FYP II** id, label, note, createdBy, snapshot (JSON) | **B1** — a NAMED, restorable snapshot of the whole cohort-norm set. `snapshot` captures every cohort row (n / stats / overrides / status) at save time; restoring upserts them back onto the live `cohort_thresholds` and re-scores everyone. **Pinnable (2026-08-11):** one version may be PINNED via `pinned_norm_version_id` in settings — while pinned, `recomputeCohorts` holds `stats`/`n` and parks what the data would say in `fresh_stats`/`fresh_n`, so imports cannot move the norms and `pinDrift()` can show how stale the held set has become. Restoring another version over a pin and deleting the pinned version both 409. See DESIGN_DECISIONS §22 |
| [Setting.js](../backend/src/models/Setting.js) | **FYP II** key, value (JSON) | Admin-tunable knobs: `min_cohort_n`, `fallback_enabled`, escalation toggles, `bottom_k`, alert toggles. See `utils/settings.js` for defaults |
| [index.js](../backend/src/models/index.js) | — | Registers models + their `hasMany` / `belongsTo` associations |

### Routes — `backend/src/routes/`

| File | Mount point | Public endpoints |
|---|---|---|
| [auth.js](../backend/src/routes/auth.js) | `/api/auth` | `POST /login`, `GET /me` |
| [users.js](../backend/src/routes/users.js) | `/api/users` | admin-only: `GET /?role=` (list medical staff **or coaches**, incl. `coachSport`), `GET /permission-meta`, `POST /` (create a coach), `PATCH /:id` (medical → permissions + active; coach → `coachSport` + active) |
| [athletes.js](../backend/src/routes/athletes.js) | `/api/athletes` | `GET /` (list, medical/admin; filters `sport`/`program`/`gender`/`discipline`/`search`), `GET /:id`, `POST /` (admin), `PATCH /:id` (incl. `disciplines`), `DELETE /:id` (soft), `PATCH /:id/injury` (medical+admin — the surviving clinician injured flag), `GET /teammates` (athlete-only, sport-scoped — **C3**), **`GET /:id/sport-context`** (medical+admin — this athlete against their own sport's screening pattern; restores the comparison the medical view lost with the injury log), `GET /meta/sports`, `GET /meta/disciplines`, `GET /analytics/screening` (admin — HoloMotion cohort: band counts per indicator, averages, top-flagged muscles; accepts athlete-level filters `sport`/`program`/`gender`/`ageMin`/`ageMax`), **`GET /analytics/periods`** (admin — screening-programme activity by `grain=month|quarter|year`, same cohort slicers plus `discipline` and `from`/`to`; returns `periods[]`, `betweenTests` and `coverage`). `/analytics/screening` also takes `discipline` and **`region`** — the latter adds a `focus` block (one indicator across every slice) without narrowing the population. **Indicator reads are shared + batched:** `INDICATOR_ATTRS` names only the ~11 columns the dashboards need (keeping `muscle_flags` / `summary_text` and the 12 raw score columns out of the row), `latestIndicator()` serves one athlete and `latestIndicatorsFor()` serves many in a **single** ordered query keyed off the `(athlete_id, assessed_at)` index — `/teammates` used one round trip per squad member before 2026-08-06 |
| [coach.js](../backend/src/routes/coach.js) | `/api/coach` | `GET /readiness` (coach only) — squad readiness for the coach's assigned sport; batches the latest screening per athlete in one query |
| [isn.js](../backend/src/routes/isn.js) | `/api/isn` | **A3, mock** `GET /athletes` (directory search), `GET /athletes/:ic` (lookup by IC). Backed by `backend/src/mock/isnDirectory.js` — swap the `searchIsn` / `getIsnByIC` seam for the real ISN DB/API when access is granted |
| [upload.js](../backend/src/routes/upload.js) | `/api/upload` | **HoloMotion PDF (sole import path):** The athlete is resolved FROM THE NAME on the local filename — roster first, then the ISN directory — so the identity is filled in automatically and the search controls are a correction rather than the first step (2026-08-08).  `GET /screening/pdf/status`, `POST /screening/pdf/preview` (render + vision-extract, no commit), `POST /screening/pdf` (commit JSON). Gated by `requirePermission('uploadData')`. Excel import retired 2026-07-12 → `archive/excel-upload/` |
| [screeningReports.js](../backend/src/routes/screeningReports.js) | `/api/screening-reports` | **FYP II** three cohort-normed HoloMotion PDFs: `GET /holistic.pdf` (admin; takes the dashboard's population filters + `region` focus + `grain`, states them on the cover and in the filename), `GET /individual/:id.pdf`, `GET /team.pdf?sport&programme&gender`. Routing + data fetching + page composition; all drawing is in [`utils/pdfDraw.js`](../backend/src/utils/pdfDraw.js) |
| [cohorts.js](../backend/src/routes/cohorts.js) | `/api/cohorts` | **FYP II** admin: `GET /` (approval queue), `POST /recompute`, `PATCH /:id` (approve/edit norms), `GET|PATCH /settings/all` (tunable min-n, bottom-k, toggles) |
| [screeningReports.js](../backend/src/routes/screeningReports.js) → `programme-activity.pdf` | `/api/screening-reports/programme-activity.pdf` | **2026-08-11** the Programme Activity KPIs as a document: coverage bar + KPI list, throughput table, within-athlete change, seasonality, and activity-by-account. Takes the same filters and grain the page is showing. admin + executive (403 for medical and coach) |
| [audit.js](../backend/src/routes/audit.js) | `/api/audit` | **FYP II 2026-08-10** read-only accountability. `GET /` (newest-first log, action/actor/date filters), `GET /staff` (per-account activity for a window plus the equal window before it). admin + executive only; 403 for medical and coach. No write endpoint exists. `ACTION_LABELS` and `staffActivity()` are exported so the PDF export shares one definition |
| [screenings.js](../backend/src/routes/screenings.js) | `/api/screenings` | **FYP II** `GET /athlete/:id` (history for progress deltas), `PATCH /:id/override` (medical clinician override of the risk band, note required) |
| [export.js](../backend/src/routes/export.js) | `/api/export` | `GET /backup.xlsx` (admin only) — streams a two-sheet Excel snapshot (**Athletes** + **MuscleFlags**) as the Excel-era data backup. The injuries sheet went with the `Injury` model (2026-08-02) |

### Middleware — `backend/src/middleware/`

| File | What it does |
|---|---|
| [auth.js](../backend/src/middleware/auth.js) | Verifies JWT from `Authorization: Bearer <token>`, attaches `req.user` |
| [rbac.js](../backend/src/middleware/rbac.js) | `rbac('athlete', 'medical')` → 403 if `req.user.role` is not in the list |
| [permission.js](../backend/src/middleware/permission.js) | `requirePermission('uploadData')` → 403 if a **medical** user has had that capability revoked by an admin (opt-out model). admin/athlete pass through untouched |

### Other backend files

- [config/db.js](../backend/src/config/db.js) — `connectDB()` opens the Sequelize connection to MySQL using the `MYSQL_*` env vars
- [utils/seeder.js](../backend/src/utils/seeder.js) — `npm run seed` from `backend/`. `sequelize.sync({ force: true })` drops the schema, then reseeds users/athletes/muscle_flags with deterministic PRNG (seed=42); also drops retired tables outright (`activities`, `recovery_baselines`, `injuries`, `self_reports` — force sync only touches tables still backed by a model). All screening values are HoloMotion-shaped (integer gauge scores, report-band indicators; weight/height null — not on the report; ~1 in 10 athletes unscreened). **Athlete keys are IC numbers since 2026-08-04** — `icFor()` derives a deterministic fake 12-digit IC per athlete and the seed run prints them. Anchors: John Doe (Module 1 demo) and Thung Jin Seng (transcribed 1:1 from the sample HoloMotion PDF — pipeline ground truth, seeded deliberately **stale** so importing the sample PDF visibly updates his dashboard)
- [utils/serialize.js](../backend/src/utils/serialize.js) — response shaper. Aliases Sequelize's numeric `id` to a stringified `_id` field and reassembles Athlete's flat columns into nested `risks`/`myodynamia[]`/`tension[]` shape
- [utils/permissions.js](../backend/src/utils/permissions.js) — per-user medical-staff feature permissions: the key catalogue (`viewRecords`, `uploadData`, `editCohortNorms` — `reviewReports` and `injuryReports` went with the features they gated on 2026-08-02), `hasPermission()`, and `sanitizePermissions()`. `GET /api/users/permission-meta` serves `PERMISSION_KEYS` + `PERMISSION_LABELS` to the admin screen, so the checkbox list cannot drift from what the backend enforces. Opt-out model — a capability is granted unless explicitly set `false`
- [utils/pdfRender.js](../backend/src/utils/pdfRender.js) — renders the leading HoloMotion PDF pages (first N, default 6 — covers both layouts) to base64 PNGs via `pdfjs-dist` + the `canvas`→`@napi-rs/canvas` npm alias. HoloMotion PDFs have no text layer (jsPDF-baked graphics), so vision is the only reliable read. **Runs `redactName` on page 1** before serialising, so the athlete's name never reaches the vision model
- [utils/redactName.js](../backend/src/utils/redactName.js) — **FYP II** on-device name redaction (privacy). A local Tesseract (`tesseract.js`, pure WASM) pass OCRs the top-left of page 1, finds the "Name" line, and blacks out just the value (age/gender/time/gauges/summary untouched). Fails **closed** — covers the whole top-left Information region if OCR can't pinpoint it. Verify with [`scripts/verify-redaction.js`](../backend/scripts/verify-redaction.js). See [`DESIGN_DECISIONS §18`](DESIGN_DECISIONS.md)
- [utils/visionClient.js](../backend/src/utils/visionClient.js) — provider-agnostic vision call. OpenAI-compatible adapter (OpenAI / Qwen / OpenRouter / Ollama) + Anthropic native adapter, selected by `VISION_*` env vars; `isVisionConfigured()` lets routes self-disable cleanly
- [utils/holomotionExtract.js](../backend/src/utils/holomotionExtract.js) — full pipeline: render → vision prompt → strict JSON → mapped onto the flat `Athlete` columns + `muscle_flags` rows. **FYP II** the prompt/mapping now also extract the 25 subitem scores, 8 posture axes, and page-1 summary text
- **FYP II** [utils/cohorts.js](../backend/src/utils/cohorts.js) — cohort-norm engine. `orientedComponents()` builds the six higher-is-better inputs (totalScore/rom/stability/symmetry + `riskGood` = negated mean of the 7 shown risks, LDH excluded + `balance` = negated L/R subitem asymmetry); `recomputeCohorts()` computes mean/SD per `(sport,programme,gender)` cohort across the four fallback tiers and upserts them (preload-into-Map + `Promise.all`/`bulkCreate`, no N+1); `resolveFromMap()`/`resolveCohortStats()` walk the `spg→sg→s→all` ladder to the first tier meeting `min_cohort_n`
- **FYP II** [utils/overallIndicator.js](../backend/src/utils/overallIndicator.js) — the overall risk indicator (Total Score of Athleticism): `computeIndicator()` averages the component z-scores, maps to a 0–100 display score, and bands by **escalation** (+1 below cohort mean, +1 in the cohort's bottom-`k` → 0/1/2 = green/amber/red); `recomputeIndicators()` re-scores every athlete's latest screening in-memory from the approved cohorts (parallel load + `Promise.all` update)
- **FYP II** [utils/settings.js](../backend/src/utils/settings.js) — `getSettings()`/`setSetting()` over the `settings` key/value table, with `DEFAULTS` (min_cohort_n 5, fallback on, both escalations on, bottom_k 3, alerts on, alert_on_band amber)
- **FYP II** [utils/alerts.js](../backend/src/utils/alerts.js) — `alertIfNeeded(athleteId)`: if the athlete's latest band ≥ `alert_on_band`, emails the medical staff + the sport's coaches (coaches whose `coachSport` equals the athlete's sport) via `utils/mailer.js`. Fired on import commit
- **FYP II** [utils/cohortFocus.js](../backend/src/utils/cohortFocus.js) — **2026-08-08** the region-focus lens. Encodes the distinction the admin analytics rest on: POPULATION filters (sport / programme / gender / age / discipline) choose *who* is in the picture, a REGION FOCUS chooses *what the picture is about* and removes nobody. `focusBreakdown(rows, key, allRows)` returns one indicator's band split across sport / gender / age group / programme (each slice ordered worst-first by the SHARE elevated, since policy follows proportion not headcount), the cohort average against the whole-institute baseline, and the ten highest readings. Also the single definition of `AGE_GROUPS` — the dashboard filter, the focus breakdown and the PDF's age table used to disagree ("18-23 (junior)" vs "21-25"). Refuses any indicator that is not shown, so LDH can never be focused. Tested in [tests/cohortFocus.test.js](../backend/tests/cohortFocus.test.js)
- **FYP II** [utils/screeningPeriods.js](../backend/src/utils/screeningPeriods.js) — the **institutional** view, added 2026-08-06. `screeningPeriods(rows, {grain})` buckets the immutable screening history by calendar period (`month`/`quarter`/`year`) into throughput (tests, distinct athletes, within-period retests), population averages, band mix, and the change against the previous period *present in the series* (an empty quarter is skipped, not read as zero). Also returns `betweenTests`: within-athlete consecutive pairs — retest interval, improved/declined/steady, band moves, and average delta per score. Pure, no DB; `PERIOD_SCORES` carries each score's orientation so exercise-risk improvements (which go DOWN) are not reported as declines. Also returns `seasonality` — every screening pooled by **quarter of the year with the year discarded**, so all Q3s land together (Dr Thung's "which quarter is the risky one"). It ranks by the *share* of flagged screenings rather than the count (throughput differs by quarter) and **names no season below two years of data** (`yearsCovered` / `sufficient` / `worst`), because with one year a worst quarter is indistinguishable from the quarter the weaker squads were screened in. Tested by [tests/screeningPeriods.test.js](../backend/tests/screeningPeriods.test.js)
- **FYP II** [utils/bands.js](../backend/src/utils/bands.js) — **2026-08-10** the single definition of the risk-band vocabulary: `BAND_RANK` (ordering for "worse than"), `BAND_LABEL` (human wording), `effectiveBand(screening)` (a clinician's override wins over the computed band) and `atLeastAsBad()`. `BAND_RANK` had stood in three files and `BAND_LABEL` in two — identical, with nothing stopping them drifting, which is the §19 failure mode: a divergent rank makes "worse than" disagree between the alert gate and the period comparison, a divergent label makes two emails name the same band differently, and neither raises an error. New code should call `effectiveBand` rather than inline `overrideBand || overallBand`, the one expression here that can be written backwards and silently ignore every override
- **FYP II** [utils/audit.js](../backend/src/utils/audit.js) + [models/AuditLog.js](../backend/src/models/AuditLog.js) — **2026-08-10** the accountability trail. `recordAudit(req, {...})` is **fire-and-forget**: a logging failure must never fail the operation it describes. The actor's name and role are **copied onto the row**, not joined from `users`, so the record says who they were when they acted. Append-only — no update or delete path exists anywhere. See `DESIGN_DECISIONS.md §20a`
- **FYP II** [utils/scheduler.js](../backend/src/utils/scheduler.js) — **2026-08-10** the monthly digest (§16). `startScheduler()` runs an hourly tick asking whether this month is still owed, against a `digest_last_sent` YYYY-MM marker in settings — **not** a cron expression, because a cron instant missed while the process is down skips the month with no error. Idempotent, self-healing, and safe under two instances. **Attaches the holistic PDF** via `renderHolisticPdf()`; `digestAttachment()` is non-fatal, so a render failure downgrades the digest to summary-only rather than losing the month, and `buildDigest(now, {attached})` words the email to match what actually got attached. Recipients are filtered through the per-user opt-out. `runDigestOnce()`, `isDue()`, `buildDigest()`, `digestAttachment()` and `monthKey()` are exported for testing; tested in [tests/scheduler.test.js](../backend/tests/scheduler.test.js)
- **FYP II** [utils/programmeActivity.js](../backend/src/utils/programmeActivity.js) — **2026-08-11** the Programme Activity KPIs, gathered once. `programmeActivityData(query)` applies the cohort filters + date window, then returns `periods` / `betweenTests` / `seasonality` (from `screeningPeriods`) plus `coverage` and a `scope` sentence. Extracted from `routes/athletes.js` when the same figures had to appear in a downloadable PDF — the page (`GET /athletes/analytics/periods`) and the report (`GET /screening-reports/programme-activity.pdf`) now read one function, so the screen and the filed document cannot quote different KPIs. `scopeLabel()` is reused for the PDF cover and the filename. Throws with `err.status = 400` on an unknown grain. Tested in [tests/programmeActivity.test.js](../backend/tests/programmeActivity.test.js) (models mocked, no DB)
- **FYP II** [utils/holisticReport.js](../backend/src/utils/holisticReport.js) — **2026-08-10** the holistic report, split into `holisticData(query)` (fetch + population filters + scope/filename) and `drawHolistic(doc, data)` (draw onto any pdfkit doc), plus `renderHolisticPdf()` which buffers one for the mailer. Extracted from its route handler because the report was composed straight onto `res`, which is exactly what made it unattachable to an email — and because two report generators meant to agree is the §19 failure mode. The extraction was verified **byte-identical** against the old handler across four query shapes. The route still streams. Tested in [tests/holisticReport.test.js](../backend/tests/holisticReport.test.js) (models mocked, no DB)
- **FYP II** [utils/indicatorPayload.js](../backend/src/utils/indicatorPayload.js) — **2026-08-11** the one shape for "the screening indicator" as the dashboards read it (`INDICATOR_ATTRS` + `toIndicator`). Built by hand in routes/athletes.js, routes/coach.js and routes/screenings.js until they drifted: the coach payload was silently dropping the clinician override, so a coach saw the generic band message where the override card had promised them the note. Carries the printed `totalScore`, the two-sided reasons, and the persisted cohort comparison (`cohortZ`/`cohortRank`/`cohortSize`/`cohortLabel`/`cohortDeltas`). **Any query feeding it must select those columns** or the hero renders an empty comparison
- **FYP II** [utils/mailPrefs.js](../backend/src/utils/mailPrefs.js) — **2026-08-10** per-user email opt-out over `users.notify_prefs`. `NOTIFY_KEYS` declares the four addressable notifications and which roles can receive each; `wantsMail`/`recipientsFor` narrow a recipient list; `sanitizePrefs` accepts only known keys the caller's role can actually receive; `prefsForUser` shapes the profile card. **Opt-out** shape (null = everything on) mirroring `User.permissions`, and only the opt-*outs* are persisted. Read/written by `GET`/`PUT /api/auth/notification-preferences`, which address `req.user` only — no account can mute another's alerts. Consulted by `alerts.js`, `notifications.js` and `scheduler.js`; **any query feeding those must select `notifyPrefs`**, or an opt-out reads as consent. Tested in [tests/mailPrefs.test.js](../backend/tests/mailPrefs.test.js)
- **FYP II** [utils/pdfDraw.js](../backend/src/utils/pdfDraw.js) — the pdfkit drawing toolkit for all three screening reports: AIRMS palette + HoloMotion band semantics, `startDoc`/`finish` (buffered pages + "page i of n" footers), page-break guard `ensure()`, and every mark the reports draw — `bar`, `zoneGauge`, `radar`, `subitemTable`, `symmetrySection`, `muscleFigure` (body figure via `utils/bodymap.js`), the squad heatmap/hotspots, and the data-driven `interpret()` / `keyFindings()` bullet generators. **2026-08-18** adds `squadMuscleFigure` — the team report's squad body map, the same licensed figure fed the group's **mean** subitems from `aggregateSubitems`, so it cannot quote a different average from the heatmap printed beside it (the group had been described anatomically twice in words and drawn never) — and `tierLegend`, extracted out of `squadSubitemHeatmap` rather than written a second time. The same pass fixed two defects that only appear on a **printed** page: `bar()` now measures its value column with `doc.widthOfString()` instead of reserving a fixed 50pt (`58 of 62 (94%)` wrapped and overprinted the row beneath), and `changeBars` folds the **dead band into the scale**, draws it as a shaded zone and **outlines** rather than fills any bar inside it — scaled to the largest delta alone, a -1.8 against a ±2 threshold drew the longest bar on the figure and labelled it `steady`, contradicting the §27 caveat printed directly above it. All three passed every unit test: they are properties of the rendered page, not of the values. See [`DESIGN_DECISIONS §30`](DESIGN_DECISIONS.md). **Extracted verbatim from `routes/screeningReports.js` on 2026-08-06** (that file held both "how a report is drawn" and "which route serves it" at ~60 KB); the move was byte-identical, and `backend/tests/pdfDraw.test.js` now renders reports headlessly against a fake `res` so PDF output has smoke coverage without a DB
- **FYP II** [utils/riskIndicators.js](../backend/src/utils/riskIndicators.js) — **2026-08-18** the single definition of the seven shown exercise-risk indicators, and of the exclusion that rides with them. Not a display detail: it encodes Dr Thung's instruction that `spinalDiscHerniation` (Lumbar Disc Herniation) is extracted and stored but **never** scored, charted, printed or named, because ISN cannot perform that assessment — so "which indicators are shown" and "LDH is excluded" are the same decision. It had been hand-maintained in **eight** places (five backend: `cohorts`, `overallIndicator`, `cohortFocus`, `routes/athletes`, `pdfDraw`; three frontend), each carrying a comment pointing at the others — `routes/athletes.js` held an inline copy *and* the shared import, using one in each of two handlers. Exports `SHOWN_RISK_KEYS`, `SHOWN_INDICATORS`, `INDICATOR_LABEL`, `REPORT_LABEL`/`REPORT_RISKS`, `isShownIndicator` and `EXCLUDED_RISK_KEYS`. **Two label vocabularies are deliberate and not synonyms:** `label` is the terse UI wording ("Knee"), `reportLabel` is HoloMotion's own printed wording ("Ligament Strain"), so a clinician can check a line against the report in their hand. `EXCLUDED_RISK_KEYS` names the exclusion as a *value* so it can be asserted rather than left as an absence nobody checks. One definition **per package** (the frontend keeps its own in `lib/screeningAlerts.ts`) because there is no shared types package — same shape as `bands.js`/`bands.ts`. Tested in [tests/riskIndicators.test.js](../backend/tests/riskIndicators.test.js); see [`DESIGN_DECISIONS §31`](DESIGN_DECISIONS.md)
- **FYP II** [utils/reliability.js](../backend/src/utils/reliability.js) — **2026-08-12** "is this change real?". Every direction-of-travel verdict in AIRMS used one hardcoded `noise = 2` that nothing derived — the most-cited weakness of traffic-light systems generally (Robertson et al., *IJSPP* 2017). Computes the **typical error** (SD of within-athlete differences ÷ √2) and **MDC95** (2.77 × TE) per score from repeat screenings, using MDC95 as the dead band. Two honesty properties, both deliberate: the repeats are months apart so they contain real change as well as measurement error, making this an **upper bound** that under-calls change rather than over-calling it; and it **declines** below `MIN_PAIRS` (20) or when a score never moved, falling back to the documented 2 and saying so on screen and in the PDF. On the seeded data it correctly declines (19 pairs, four scores identical in every pair). **Do not "fix" the decline by lowering the floor** — the threshold being either earned or labelled an assumption is the whole point. Tested in [tests/reliability.test.js](../backend/tests/reliability.test.js)
- **FYP II** [utils/periodScores.js](../backend/src/utils/periodScores.js) — `PERIOD_SCORES`: each period-level score with its orientation (`higherBetter`), so an exercise-risk improvement (which goes DOWN) is never reported as a decline. Extracted from `screeningPeriods.js` purely to break the require cycle `screeningPeriods → reliability → screeningPeriods`
- **FYP II** [utils/subitemAggregate.js](../backend/src/utils/subitemAggregate.js) — **2026-08-11** the 25-cell Physical Fitness Subitem table aggregated across a cohort. `aggregateSubitems(screenings)` returns the 5 × 5 mean `matrix`, per-region `asymmetry`, and the two headline cells (`worstCell` / `worstAsymmetry`) computed here rather than in the UI so the page and any report cannot pick differently. **Left–right asymmetry is the point**: it is the only bilateral data the instrument carries, and AIRMS collapsed it three ways. Reports the **count** of athletes with a ≥`NOTABLE_GAP` (10-point) gap rather than a mean gap, because the means are flat at 3–4 everywhere while the counts run 0–9; `weakerSide` is named for what a clinician acts on (it was `leans`, which returned "right" for a left-dominant squad). Also feeds the team report's squad body map, so the figure and the heatmap beside it cannot quote different averages. Pure — no DB. Tested in [tests/subitemAggregate.test.js](../backend/tests/subitemAggregate.test.js)
- **FYP II** [utils/postImport.js](../backend/src/utils/postImport.js) — debounces the work that must follow a screening import (cohort recompute → indicator rescore → alerts), so a batch of 15 PDFs does not trigger 15 full recomputes; an in-flight run is joined rather than queued
- [utils/passwordPolicy.js](../backend/src/utils/passwordPolicy.js) — the 10-character + complexity rule, gating **user-driven** password setting (`change-password` / `reset-password`) only; seeded fixtures deliberately do not satisfy it. Mirrored by `lib/passwordPolicy.ts` on the frontend so the form and the server agree on what is rejected
- [utils/disciplines.js](../backend/src/utils/disciplines.js) — the per-sport event vocabulary backing `AthleteDiscipline` (events are admin-extensible free strings; these are the seeds)

---

## 3. Frontend — `frontend/`

Next.js 14 App Router, TypeScript, plain CSS.

### Environment

`frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### App routes — `frontend/src/app/`

Pages mapped to the 4 roles + profile pages. **The URL hierarchy is the role boundary** — `/athlete/*`, `/medical/*`, `/admin/*`, `/coach/*`:

| Path | Role | Purpose |
|---|---|---|
| [`layout.tsx`](../frontend/src/app/layout.tsx) | — | Root App Router layout: loads `styles/globals.css`, sets the `<html>` shell and restores the persisted `data-theme` before paint so a dark-mode reload does not flash light |
| [`/`](../frontend/src/app/page.tsx) | public | Login |
| [`/athlete/dashboard`](../frontend/src/app/athlete/dashboard/page.tsx) | athlete | Module 1 — **FYP II** the cohort-normed overall risk indicator is the page's only risk verdict (hero + "regions behind this band" detail); ACWR/workload removed 2026-07-16, embedded HoloMotion screening panel. Activity Tracking (`/athlete/activity`, formerly Module 1 in the FYP I decomposition) fully removed 2026-07-20 — no more Recent Activity table |
| [`/athlete/history`](../frontend/src/app/athlete/history/page.tsx) | athlete | **C2, 2026-08** Screening History — pick a past screening by `assessedAt` and the whole dashboard shape (hero / radar / panel / body map) swaps to it via `GET /screenings/:id/full` |
| [`/athlete/squad`](../frontend/src/app/athlete/squad/page.tsx) | athlete | **C3, 2026-08** My Squad — read-only same-sport teammate readiness (programme, band, indicator). No peer clinical detail by design. `GET /athletes/teammates` |
| [`/athlete/profile`](../frontend/src/app/athlete/profile/page.tsx) | athlete | Profile |
| [`/medical/dashboard`](../frontend/src/app/medical/dashboard/page.tsx) | medical | Module 6 — athlete search/view + overall risk badge with the **clinician band-override** control (`ClinicianBandOverride` — outcome-labelled Safe / Needs-attention / Immediate-assessment choices, calculated-vs-in-force provenance, required note captured inline) + embedded HoloMotion screening panel |
| [`/medical/cohort-norms`](../frontend/src/app/medical/cohort-norms/page.tsx) | medical | **2026-08** Cohort Norms — re-export of the admin page (norm-editing only), gated by the `editCohortNorms` capability |
| [`/medical/data-upload`](../frontend/src/app/medical/data-upload/page.tsx) | medical | Module 3 — HoloMotion PDF import (batch + name-match) |
| [`/medical/profile`](../frontend/src/app/medical/profile/page.tsx) | medical | Profile |
| [`/admin/dashboard`](../frontend/src/app/admin/dashboard/page.tsx) | admin | **2026-08** Screening Analytics — HoloMotion screening cohort (stat tiles + previous-vs-latest screening trend + risk-indicator bands + muscle hotspots), filtered by sport / programme / gender / age. The injury-log analytics half was removed with the `Injury` model (2026-08-02). **E1 (2026-08-04):** all five Chart.js charts rebuilt as theme-aware HTML/CSS — Chart.js is no longer imported on this page |
| [`/admin/activity`](../frontend/src/app/admin/activity/page.tsx) | admin | **2026-08-07** Programme Activity — the administrator's own performance view, kept OFF the analytics page because they answer different questions. Screening throughput by `grain=month/quarter/year` (tested vs rostered, tests, within-period retests, population averages, change vs the previous period) + Between Successive Tests (within-athlete pairs, band moves, median retest gap). Same cohort slicers via the shared `CohortFilters` |
| [`/admin/reports`](../frontend/src/app/admin/reports/page.tsx) | admin | Module 5 — screening reports (holistic / **individual-by-name** / team downloads). The filter-driven injury PDF builder went with the `Injury` model (2026-08-02) |
| [`/admin/settings`](../frontend/src/app/admin/settings/page.tsx) | admin | **FYP II** tunable norm settings — `min_cohort_n`, fallback, escalation toggles, `bottom_k`, and the **B5** eligibility floors (`norm_min_total` / `norm_min_rom` / `norm_min_stability`, default 0 = no gate) |
| [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx) | admin | **FYP II** Cohort Norms — auto-generated + live per import, editable norm values with a "review · new data" drift flag + reset-to-computed, tunable settings, recompute. Also mounted at `/medical/cohort-norms` for norm-editing medical staff (admin-only controls hidden there) |
| [`/admin/personnel`](../frontend/src/app/admin/personnel/page.tsx) | admin | **2026-08** Personnel — create coach **or** medical accounts, assign/change a coach's sport, manage medical per-capability permissions + activation (merged the former `/admin/coaches` + `/admin/staff`) |
| [`/admin/data-upload`](../frontend/src/app/admin/data-upload/page.tsx) | admin | Module 3 — HoloMotion PDF import (batch + name-match) + Module 4 — data backup |
| [`/admin/profile`](../frontend/src/app/admin/profile/page.tsx) | admin | Profile |
| [`/coach/dashboard`](../frontend/src/app/coach/dashboard/page.tsx) | coach | **FYP II** (first-class 4th role) read-only squad readiness scoped to the coach's ONE assigned sport — all athletes' HoloMotion overall risks, sorted worst-first with the worst region named, filterable by programme / gender / event; selecting a row opens a read-only screening detail (radar + ScreeningPanel + body map) and the team report is downloadable here. Coaching-cockpit cards: **suggested focus** (the squad's top shared regions turned into training-load adjustments — a region-frequency heuristic with a caveat that it is NOT the cohort risk model), needs-attention, **squad breakdown** (muscle hotspots / readiness-by-event / momentum), per-athlete trend |
| [`/coach/reports`](../frontend/src/app/coach/reports/page.tsx) | coach | **2026-08** Reports — individual-by-name (from their squad) + team report for their sport, with a reporting window defaulting to the last 30 days (adjustable; passed as `from`/`to`) |
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
| [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx) | Athlete (dashboard + history) · Medical · Coach · import preview. Front + back silhouette, summary tile, legend, per-category flag cards. **Two modes:** *Muscle Flags* draws HoloMotion's **22 individual muscles** (from `bodymap-data/muscles.ts`, 2026-08-04) and *ROM & Stability* still draws the 5 regions — mode grain matches data grain. See [DESIGN_DECISIONS §4a](DESIGN_DECISIONS.md) |
| [WorkloadChart.tsx](../frontend/src/components/dashboard/WorkloadChart.tsx) | ⚫ **Renders on no page** since 2026-07-16. Chart.js bar (weekly load) + line (ACWR) dual-axis. Retained deliberately for the [ACWR rebuild path](fyp/ACWR_REBUILD.md) — do not delete |
| [RiskRadar.tsx](../frontend/src/components/dashboard/RiskRadar.tsx) | Athlete (dashboard + history) · Medical · Coach. Chart.js radar. Presentational only — axes, labels, order and clamping are all supplied by `RADAR_AXES` / `RADAR_LABELS` / `riskRadarSeries()` in [lib/screeningAlerts.ts](../frontend/src/lib/screeningAlerts.ts) (7 shown indicators; LDH excluded) |
| [bodymap-data/bodyFront.ts](../frontend/src/components/dashboard/bodymap-data/bodyFront.ts) | MIT-licensed path data (front view) — Sorooj Shehryar's react-muscle-highlighter. **The attribution header must stay** |
| [bodymap-data/bodyBack.ts](../frontend/src/components/dashboard/bodymap-data/bodyBack.ts) | MIT-licensed path data (back view) |
| [bodymap-data/muscles.ts](../frontend/src/components/dashboard/bodymap-data/muscles.ts) | **2026-08-04** Muscle-level partition of the SAME licensed geometry into HoloMotion's 22 muscles. 16 are recovered from sub-paths the asset already contains (it draws the three vasti / two glute heads separately and merely labels them all `quadriceps` / `gluteal`); the 6 deep ones (Piriformis, Gluteus Minimus, Iliopsoas, Internal Oblique, Rectus Capitis Anterior, Sartorius) are schematic insets derived from their parent's **measured** bounding box. Sub-paths are chosen by measured geometry, **never array index** — the asset does not order left and right limbs identically, so index slicing would mirror-swap muscles. Also exports `INERT_FRONT`/`INERT_BACK` (drawn, never flaggable), `RENDERABLE_MUSCLES` and `MUSCLE_ALIASES` (the deliberate Middle/Lateral Deltoid collapse — same anatomical head) |
| [bodymap-data/muscles.test.ts](../frontend/src/components/dashboard/bodymap-data/muscles.test.ts) | Guards the partition: every HoloMotion muscle resolves, no shape is claimed twice, and the anatomical relationships that would catch a mirror-swap hold on **both** sides (e.g. vastus medialis is medial to vastus lateralis on each leg) |
| [bodymap-data/outlines.ts](../frontend/src/components/dashboard/bodymap-data/outlines.ts) | Single-path silhouette outlines for front + back |
| [bodymap-data/types.ts](../frontend/src/components/dashboard/bodymap-data/types.ts) | `BodyPart` interface |
| [ScreeningPanel.tsx](../frontend/src/components/dashboard/ScreeningPanel.tsx) | Athlete + Medical + Coach dashboards (embedded). The latest HoloMotion report read against its thresholds — five tier-ticked score gauges, eight indicator threshold strips (OK/Watch/High zones, sport-critical regions starred via `lib/screeningAlerts.ts`), the **Physical Fitness Subitem Score** table, myodynamia/tension chips. (Posture Evaluation was removed everywhere 2026-08-01 — not required by Dr Thung.) |
| [SubitemTable.tsx](../frontend/src/components/dashboard/SubitemTable.tsx) | Shared by `ScreeningPanel` and the import preview. The 5-region ROM L/R · Stability L/R · Symmetry table as HoloMotion-tier-coloured discs |
| [ScreeningHistory.tsx](../frontend/src/components/dashboard/ScreeningHistory.tsx) | Athlete + Medical + Coach views. Report-to-report progress table (`GET /screenings/athlete/:id`, summary columns) with a "Change since first" delta row — the on-screen counterpart of the individual PDF's progress section. On the athlete dashboard its header hosts the athlete's own **Download PDF** button (self-only server-side) |
| [ScreeningAlertBanner.tsx](../frontend/src/components/dashboard/ScreeningAlertBanner.tsx) | Athlete + Medical dashboards. Renders the sport-aware screening alert (a body region critical for the athlete's sport whose HoloMotion indicator is out of range). Backed by `lib/screeningAlerts.ts`; renders nothing when there's nothing to flag |
| [OverallRiskBadge.tsx](../frontend/src/components/dashboard/OverallRiskBadge.tsx) | **FYP II** Athlete + Medical + Coach dashboards. Traffic-light badge for the cohort-normed overall indicator (0–100 score, band, escalation factors); compact + full modes. **Rebuilt 2026-08-11:** the headline is now HoloMotion's printed **Total Score**, under it a signed **per-component comparison** against the athlete's cohort (`cohortDeltas` — positive always means better than the group, on every row) and a **two-sided reason list** (why assess / why not). The derived 0-100 indicator is no longer shown but is still computed and still drives ranking, alerts, report ordering and the coach table. The reason list adds any component at or below -1 SD that no escalation rule covered — reasons and escalations are different things, and the band is unaffected. See DESIGN_DECISIONS §21. Takes **`audience`** (`'self'` on the athlete views, `'staff'` elsewhere — before 2026-08-11 the copy was second-person only, so the staff dashboards addressed the clinician as the at-risk athlete) and **`historical`** (a screening chosen by date: label becomes "Status at this screening" and the verdict stops instructing). On Medical the clinician band-override control sits beneath it, and is hidden while a past screening is displayed |
| [ClinicianBandOverride.tsx](../frontend/src/components/dashboard/ClinicianBandOverride.tsx) | **FYP II** Medical dashboard only. The band-override control under the risk hero: outcome-labelled Safe / Needs-attention / Immediate-assessment cards (colour reinforces, never the sole carrier), `In force` + `Calculated` tags so the clinician sees what they're diverging from, and the required assessment note captured inline (replaced the old bare green/amber/red buttons + `window.prompt`). PATCHes `/api/screenings/:id/override` |
| [AcwrGauge.tsx](../frontend/src/components/dashboard/AcwrGauge.tsx) | ⚫ **Renders on no page** since 2026-07-16, like `WorkloadChart`. The ACWR dial. Retained deliberately for the [ACWR rebuild path](fyp/ACWR_REBUILD.md) — do not delete |
| [ScreeningDatePicker.tsx](../frontend/src/components/dashboard/ScreeningDatePicker.tsx) | Athlete + Medical + Coach. Chooses WHICH screening the shared dashboard components describe. Selecting a past date puts every component into `historical` mode (see `screeningRef()` / `HISTORICAL_NOTE` in `lib/screeningAlerts.ts`), so the page stops speaking in the present tense and stops advising on the next session |
| [InjuryStatusControl.tsx](../frontend/src/components/dashboard/InjuryStatusControl.tsx) | Medical + Admin. The clinician's injury flag on the Athlete row (`PATCH /api/athletes/:id/injury`). Its purpose is **cohort-norm eligibility**, not an injury log — there is no injury table. Declaring an athlete injured rebuilds the norms and rescores every indicator **in the same request**, and the one-time `NormChangeNotice` discloses that the published norm moves |
| [SportContext.tsx](../frontend/src/components/dashboard/SportContext.tsx) | Supplies the viewing coach's sport to the shared dashboard components, so a sport-scoped read-only role sees its own squad's framing without each page threading the value through by hand |

### Admin analytics components — `frontend/src/components/admin/`

| File | Role |
|---|---|
| [CohortFilters.tsx](../frontend/src/components/admin/CohortFilters.tsx) | The sport / gender / programme / age slicer shared by `/admin/dashboard` and `/admin/activity`, plus the `useCohortFilters()` hook that owns the state and builds the query string. Shared rather than copied so the two pages cannot drift into slicing the population differently — a comparison between them is only meaningful if "Badminton · Female" means the same on both |
| [DistributionBar.tsx](../frontend/src/components/admin/DistributionBar.tsx) | 100%-stacked horizontal bar + counted legend; every slice carries its count and share so meaning is never colour-alone |
| [StaffActivity.tsx](../frontend/src/components/admin/StaffActivity.tsx) | **2026-08-11** the Activity Log's per-account rollup. Counts **downloads apart from changes** (`ACCESS_ACTIONS` in `routes/audit.js`) — summing them would let an account that only reads outrank the clinicians, and for `coach`/`executive`, who cannot write anything, *reading is the only auditable act* |
| [TrendStrip.tsx](../frontend/src/components/admin/TrendStrip.tsx) | Compact period-over-period strip on the admin analytics pages. Direction comes from the API's `direction` field, **never** the sign of the delta — exercise risks improve by going DOWN |
| [NormChangeNotice.tsx](../frontend/src/components/admin/NormChangeNotice.tsx) | One-time dismissible disclosure that an eligibility change (injury flag, cohort membership tick) moves the published cohort norm immediately. Shown because the exclusion used to be real in the rules and invisible in the norm |

### Upload component — `frontend/src/components/upload/`

| File | Used by |
|---|---|
| [PdfScreeningUpload.tsx](../frontend/src/components/upload/PdfScreeningUpload.tsx) | Admin + Medical data-upload pages. Batch HoloMotion PDF queue: **auto-extracts on drop** (spaced vision calls; *Retry failed* re-queues errors), roster name-match autofill (ID/sport/programme), searchable 52-sport datalist ([`lib/sports.ts`](../frontend/src/lib/sports.ts)), events via [`TagCombobox`](../frontend/src/components/ui/TagCombobox.tsx), per-file preview → confirm. Self-disables when the vision provider is unconfigured |
| [ScreeningPreview.tsx](../frontend/src/components/upload/ScreeningPreview.tsx) | The pre-import read-out inside each queued report: headline scores (tier/band), exercise-risk evaluation as banded bars, HoloMotion subitem table (tier colours); the muscle **BodyMap** hero renders beside it. Presents extracted data the way the dashboards do so the operator can verify before committing |
| [TagCombobox.tsx](../frontend/src/components/ui/TagCombobox.tsx) | Small multi-select combobox (chips + styled dropdown) — pick an existing value or type a new one. Replaces the browser-native `<datalist>`; used for events in the import step and the medical "Edit events" editor |
| [DataBackupCard.tsx](../frontend/src/components/upload/DataBackupCard.tsx) | Admin data-upload page. One-click download of the Excel-era data backup from `/api/export/backup.xlsx` |
| [IsnLookup.tsx](../frontend/src/components/upload/IsnLookup.tsx) | ISN directory lookup during roster entry — resolves an athlete against the mock institute directory (`backend/src/mock/isnDirectory.js`) so IC/name/sport are not retyped |

### Profile component — `frontend/src/components/profile/`

| File | Used by |
|---|---|
| [ProfileShell.tsx](../frontend/src/components/profile/ProfileShell.tsx) | Shared by `/athlete`, `/medical`, `/admin`, `/coach` profiles. Renders the hero (initials avatar + name + email + role chip), role-specific stat tiles, account-info card, account-actions card (change password modal + sign out) |

### Shared UI components — `frontend/src/components/ui/`

| File | Role |
|---|---|
| [AthleteSearchSelect.tsx](../frontend/src/components/ui/AthleteSearchSelect.tsx) | Attaches an imported HoloMotion report to a roster athlete by **name search**, filling Athlete ID / sport / programme from the roster. Backed by [`lib/athleteSearch.ts`](../frontend/src/lib/athleteSearch.ts). It surfaces an **`ambiguous`** warning when a query matches more than one athlete of the same name — the roster genuinely contains duplicate full names, so silently picking the first would attach a clinical report to the wrong person |
| [SportSelect.tsx](../frontend/src/components/ui/SportSelect.tsx) | Searchable 52-sport picker over [`lib/sports.ts`](../frontend/src/lib/sports.ts) |
| [TagCombobox.tsx](../frontend/src/components/ui/TagCombobox.tsx) | Multi-select chips + styled dropdown — pick an existing value or type a new one. Replaces the browser-native `<datalist>`; used for events in the import step and the medical "Edit events" editor |
| [MarkedText.tsx](../frontend/src/components/ui/MarkedText.tsx) | Highlights the matched substring in search results, so a hit shows *why* it matched |

### Chart components — `frontend/src/components/charts/`

| File | Role |
|---|---|
| [Charts.tsx](../frontend/src/components/charts/Charts.tsx) | The admin analytics chart set — the squad body map, risk-vs-movement scatter (quadrants split on cohort **medians**), indicator distribution histogram, subitem heatmap, left–right asymmetry panel, throughput columns, the two-period **change chart** and the one-period composition view. Rendered through Chart.js with the shared palette in [`lib/chartTheme.ts`](../frontend/src/lib/chartTheme.ts). Two rules run through the whole file, both learned the hard way: **non-commensurable metrics never share an axis** (a shared *value* scale collapsed four lines into overlapping pixels — the reason the change chart plots DELTAS, §26), and **direction comes from the API's `direction` field, never the sign of a delta**, because exercise risks improve by going down. See [DESIGN_DECISIONS §23–§26](DESIGN_DECISIONS.md) |
| [Charts.test.tsx](../frontend/src/components/charts/Charts.test.tsx) | Renders the set via `react-dom/server` — no jsdom needed |

### Auth components — `frontend/src/components/auth/`

| File | Role |
|---|---|
| [LoginBrand.tsx](../frontend/src/components/auth/LoginBrand.tsx) | **2026-08-18** the ISN branding panel of the split auth card (logo, tagline, institute name, postal address). This markup stood **identically in all four auth pages** — login, forgot-password, verify-OTP, reset-password — which meant the institute's address was hardcoded four times, so changing it would have updated one page and left three stale on the only screens an outside visitor sees. The split login card is a **locked Figma-derived design**, so the extraction had to be provably invisible: all four pages were screenshotted at 1280px before and after and compared byte-for-byte — **pixel-identical**. One copy instead of four, not a redesign. See [`DESIGN_DECISIONS §31a`](DESIGN_DECISIONS.md) |

### Library — `frontend/src/lib/`

| File | Exports |
|---|---|
| [api.ts](../frontend/src/lib/api.ts) | `api.get / post / patch / delete` (+ `downloadGet` / `downloadPost` for PDF blobs) — thin fetch wrapper that attaches the JWT from `localStorage` |
| [disciplines.ts](../frontend/src/lib/disciplines.ts) | `SPORT_DISCIPLINES` seed suggestions + `disciplinesForSport()` / `sportHasDisciplines()` — the per-sport event autocomplete seeds (events are otherwise admin-extensible free strings) |
| [name.ts](../frontend/src/lib/name.ts) | `getInitials()` — two-letter avatar initials, shared across Topbar / profile / coach + medical dashboards |
| [auth.ts](../frontend/src/lib/auth.ts) | `saveSession`, `getSession`, `clearSession`, `requireRole`, `SessionUser` type, plus `hasPermission()` + `PermissionKey` for the medical-staff feature opt-out (mirrors backend `utils/permissions.js`) |
| [risk.ts](../frontend/src/lib/risk.ts) | `classifyCompositeRisk()` + `computeVulnerability()` + `personalisedThresholds()` — the FYP differentiator |
| [screeningAlerts.ts](../frontend/src/lib/screeningAlerts.ts) | **The single place that decides which risk indicators are shown.** `INDICATORS` (key → region → prose label, LDH deliberately absent) + `computeBodyPartAlerts()` + `SPORT_CRITICAL_REGIONS` + `thresholdsFor()` / `highThresholdsFor()` — sport-aware alerts with per-sport per-region thresholds (critical regions tightened to 12/20, others keep the instrument's 15/25). **Radar layer (2026-08-06):** `RADAR_AXES` / `RADAR_LABELS` / `RADAR_MAX` (30 — tighter than the strips' 40, because the radar is a shape-comparison view) / `riskRadarSeries()`, which clamps values into range. **2026-08-18:** `RADAR_AXES` and the new `REPORT_RISKS` are now **derived** from `INDICATORS` rather than re-listing the seven keys. `RADAR_AXES` previously carried a comment asserting that "INDICATORS remains the one place deciding WHICH indicators are shown" — which was false precisely because `RADAR_AXES` existed. Each entry now carries three wordings, which are not synonyms to unify: `label` (prose), `axisLabel` (terser, for a chart spoke) and `reportLabel` (HoloMotion's own printed wording, for the import preview beside the source PDF). Pinned to the backend's `utils/riskIndicators.js` by [screeningAlerts.indicators.test.ts](../frontend/src/lib/screeningAlerts.indicators.test.ts), which also **asserts the LDH exclusion across every derived view**. All four dashboards import these instead of each keeping a private `RISK_KEYS` + `RISK_LABEL` copy. A **separate** layer from `risk.ts` (does not modify `classifyCompositeRisk()`). **Time framing (2026-08-11):** `screeningRef()` / `HISTORICAL_NOTE` — the wording the shared dashboard components use when they are showing a screening chosen by DATE rather than the athlete's latest. One definition because `OverallRiskBadge`, `ScreeningAlertBanner` and `ScreeningPanel` all need to agree; `recommendedAction(result, audience, historical)` returns '' in history, since advice about the next session does not survive the screening it came from |
| [trainingFocus.ts](../frontend/src/lib/trainingFocus.ts) | `buildTrainingFocus()` — the screening panel's Training Focus block: corrective exercises (HoloMotion prescription vocabulary, reps × sets · rest dosing) for up to three out-of-range regions, sport-critical first. Rule-based counterpart of the report's closing Training Prescription |
| [bands.ts](../frontend/src/lib/bands.ts) | **2026-08-10** the frontend risk-band vocabulary — `BAND_LABEL`, `BAND_SHORT`, `BAND_RANK`, `BAND_COLOR`/`BAND_BG`/`BAND_BADGE`, `bandColor`, `bandSegments`, `isBand`. Six files had their own map, and the red band was "Immediate assessment" in the risk hero but "Immediate" in the trend legend and the admin distribution bar — one clinical state, two names, on screens an admin sees side by side. Exports BOTH a full and a compact label **deliberately** (a legend has no room for the long form). [`bands.test.ts`](../frontend/src/lib/bands.test.ts) pins the full labels to the backend's `utils/bands.js` wording character for character, since no shared types package can enforce it |
| [rank.ts](../frontend/src/lib/rank.ts) | **2026-08-12** `percentileFromRank()` (mid-rank `(r-0.5)/n`), `ordinal()`, `percentilePhrase()` — the cohort standing read as a **percentile** beside the raw rank, because "12th of 58" means nothing without the denominator in mind |
| [athleteSearch.ts](../frontend/src/lib/athleteSearch.ts) | Token matching + relevance ranking for the roster search, tolerant of IC separators. Returns an **`ambiguous`** flag when a query matches multiple athletes sharing a full name — the roster contains five such duplicates, which turned the search from a convenience into a **safety** control: attaching a clinical report to the wrong same-named athlete is the failure this prevents. Tested in [athleteSearch.test.ts](../frontend/src/lib/athleteSearch.test.ts) |
| [periods.ts](../frontend/src/lib/periods.ts) | Grain labels (`month`/`quarter`/`year`) and the screening-date format, defined once for the same reason as `bands.ts` — the analytics page, the trend strip and the history table must not word a period differently |
| [holomotionTiers.ts](../frontend/src/lib/holomotionTiers.ts) | HoloMotion's own 60 / 75 / 85 subitem tiers and their colours (`tierMeta`, `TIER_MIN`). The single frontend definition, mirrored by `TIERS`/`tierOf()` in the backend's `utils/pdfDraw.js` so a 74 is the same amber on a gauge, in the heatmap and in the PDF |
| [chartTheme.ts](../frontend/src/lib/chartTheme.ts) | The shared Chart.js palette and axis defaults, so every chart inherits the §19 status palette rather than re-declaring colours |
| [passwordPolicy.ts](../frontend/src/lib/passwordPolicy.ts) | The 10-character + complexity rule as the form applies it — mirrors the backend's `utils/passwordPolicy.js` so the client and the server agree on what is rejected |
| [screeningUploadStore.ts](../frontend/src/lib/screeningUploadStore.ts) | The batch-import queue's state machine: per-file extract → preview → commit, with **sequential** vision extraction (deliberately serial — `BATCH_SPACING_MS` paces the provider) and *Retry failed* re-queueing only the errors. Tested in [screeningUploadStore.test.ts](../frontend/src/lib/screeningUploadStore.test.ts) |
| [trainingFocus.ts](../frontend/src/lib/trainingFocus.ts) | *(listed above)* |

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
npm run seed               # reseeds users, athletes, muscle flags (prints each demo athlete's IC)

# Type-check + lint
cd frontend; npx tsc --noEmit -p tsconfig.json
cd frontend; npm run lint

# Tests
cd backend;  npx jest      # 5 suites
cd frontend; npx jest      # 2 suites

# Health check
curl http://localhost:5000/api/health
```

### Test coverage — what is and isn't guarded

Jest covers the **pure logic** only. There is no linter for the backend and no route, page or end-to-end test anywhere.

| Suite | Guards |
|---|---|
| `backend/tests/cohorts.test.js` | `orientedComponents()`, the `spgd → spg → sg → s → all` fallback ladder, `isEligibleForNorms` |
| `backend/tests/overallIndicator.test.js` | z-score → 0–100 mapping and the escalation → band rules |
| `backend/tests/permissions.test.js` | the medical opt-out permission model |
| `backend/tests/rbac.test.js` | role gating incl. the coach fall-through case |
| `backend/tests/screeningPeriods.test.js` | **2026-08-06** period bucketing: quarter/month/year boundaries, throughput vs distinct athletes, direction of travel respecting each score's orientation, gap-skipping deltas, and within-athlete pairing in date order |
| `backend/tests/pdfDraw.test.js` | **2026-08-06** renders all three reports headlessly against a fake `res` — PDF changes get smoke coverage with no DB |
| `frontend/src/lib/risk.test.ts` | `classifyCompositeRisk()` — the locked composite model (no live callers, still tested) |
| `frontend/src/components/dashboard/bodymap-data/muscles.test.ts` | **2026-08-04** the 22-muscle partition: every muscle resolves, no shape claimed twice, no left/right mirror-swap |
| `backend/tests/cohortFocus.test.js` | the region-focus lens, `AGE_GROUPS`, and the refusal to focus an indicator that is not shown |
| `backend/tests/holisticReport.test.js` | filter/filename logic + drawing, with the models mocked (no DB) |
| `backend/tests/programmeActivity.test.js` | the KPI gather — coverage, throughput, rescreen recall (models mocked) |
| `backend/tests/subitemAggregate.test.js` | the 5 × 5 mean matrix and the left–right asymmetry counts |
| `backend/tests/bands.test.js` · `mailPrefs.test.js` | **silent** failure modes: a band comparison that disagrees between two call sites, and a preference that reads as consent |
| `backend/tests/alerts.test.js` · `scheduler.test.js` · `visionUsage.test.js` | alert grouping per recipient, the marker-not-cron digest schedule, token accounting |
| `backend/tests/reliability.test.js` | **2026-08-12** typical error / MDC95, and that the threshold **declines** rather than inventing one below `MIN_PAIRS` |
| `backend/tests/rescreenReminder.test.js` | **2026-08-16** the recall schedule (capped day 28, marked only after a successful send) and that a coach's per-sport slice can never disagree with the institution's about who is overdue |
| `backend/tests/riskIndicators.test.js` | **2026-08-18** the seven shown indicators, every derived view kept in step, and the **LDH exclusion asserted** — a leaked indicator would render as an ordinary row, so the constraint is checked rather than assumed |
| `frontend/src/lib/screeningAlerts.indicators.test.ts` | **2026-08-18** pins the frontend indicator list to the backend's key order and report wording, and asserts the same LDH exclusion across `INDICATORS` / `RADAR_AXES` / `REPORT_RISKS` |
| `frontend/src/lib/bands.test.ts` | pins the frontend band labels to the backend's wording character for character |
| `frontend/src/lib/athleteSearch.test.ts` · `rank.test.ts` | token/IC matching and the `ambiguous` duplicate-name flag; mid-rank percentiles |
| `frontend/src/lib/screeningUploadStore.test.ts` · `components/charts/Charts.test.tsx` | the batch queue state machine; the chart set rendered via `react-dom/server` (no jsdom) |

Counts as of 2026-08-18: **18 backend suites / 270 tests**, **8 frontend suites / 119 tests**.

**The pattern worth noticing.** The suites added since 2026-08-10 nearly all guard the same class of bug: a wrong answer that *looks like* a right one. A band that ranks differently in two files, an opt-out that reads as consent, a threshold that invents a number it has not earned, a coach's recall list that disagrees with the institution's, an excluded clinical indicator that leaks back into a display. None of these throw; all of them read as ordinary output. That is why they are tested and, say, the CRUD routes are not.

Everything else — routes, pages, the import flow — is verified by hand: `npm run dev`, log in, click the affected flow. Two further techniques have earned their place: driving a util directly against the dev database from a `node -e` script, and **rendering the PDFs and reading them as documents** — the latter found three defects in one pass that every unit test had approved, because they were properties of the rendered page rather than of the values on it (see [`DESIGN_DECISIONS §30`](DESIGN_DECISIONS.md)).

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
| athlete | `athlete@isn.gov.my` | `athlete123` | John Doe |
| athlete | `thung@isn.gov.my` | `thung123` | Thung Jin Seng (ground-truth anchor) |
| medical | `medical@isn.gov.my` | `medical123` | — |
| medical (alert inbox) | `23005005@siswa.um.edu.my` | `medical123` | — |
| coach | see `/admin/personnel` | — | sport-scoped |
| admin | `admin@isn.gov.my` | `admin123` | — |
| admin (SMTP demo) | `poseidonapollo11@gmail.com` | `admin123` | — |

> **The athlete key is the IC number since 2026-08-04 (A2)** — the `athleteId` column keeps its name internally and still serialises as `_id`, but its *values* are 12-digit ICs (e.g. `890202021001`) and the UI labels it "IC Number". The old `ATH0001` scheme is gone; `npm run seed` prints each demo athlete's IC.

The other seeded athletes all have random Malaysian-style names per the seeder PRNG. Thung Jin Seng is seeded as a deliberately **stale earlier assessment** (modelled on the worse 07-17 test shown on the sample report's own trend page), so importing the sample HoloMotion PDF visibly updates his dashboard to the printed 07-19 values. The printed values themselves are the extraction ground truth in `backend/scripts/verify-holomotion-extract.js`.

---

## 8. How to add a new page

1. Create `frontend/src/app/<role>/<slug>/page.tsx` (Next.js App Router auto-mounts it)
2. Use `<DashboardLayout allowedRoles={[...]} title="...">` as the root
3. If it needs new backend endpoints, add them to `backend/src/routes/<resource>.js` (mount in `server.js`)
4. Update the per-role nav map in [Sidebar.tsx](../frontend/src/components/layout/Sidebar.tsx)
5. Add an entry to [USER_MANUAL.md](USER_MANUAL.md)
6. If it introduces a new locked decision, update [MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md)

---

*Last updated: 2026-08-18 — **every source file in the tree is now named here.** An audit found 29 that were not: seven backend utils (`riskIndicators`, `reliability`, `periodScores`, `subitemAggregate`, `postImport`, `passwordPolicy`, `disciplines`), thirteen components and eight lib modules. Three new sections were added for directories the guide had no home for — `components/ui/`, `components/charts/` and `components/auth/` — plus the missing dashboard rows (`AcwrGauge`, `ScreeningDatePicker`, `InjuryStatusControl`, `SportContext`), admin rows (`StaffActivity`, `TrendStrip`, `NormChangeNotice`), `IsnLookup` and `app/layout.tsx`. The `pdfDraw` and `screeningAlerts` entries were updated for the squad body map / dead-band change chart (§30) and the derived indicator lists (§31), and the **Test coverage** table was rebuilt (18 backend suites / 270 tests, 8 frontend / 119) with a note on the class of bug those suites actually guard: a wrong answer that looks like a right one. Previous: 2026-08-06 — routes/pages/components/lib tables re-synced against the live tree: deleted the injury-era pages (`/athlete/injury-report`, `/medical/injury-log`, `/medical/review-reports`, `/admin/trends`), added `/athlete/history`, `/athlete/squad`, `/admin/settings`, `routes/isn.js`, `utils/pdfDraw.js` and `bodymap-data/muscles.ts`. Documented the radar single-source (`RADAR_AXES` in `screeningAlerts.ts`), the batched `latestIndicatorsFor()` on `/athletes/teammates`, the IC-number athlete key, and a new **Test coverage** section (what jest guards and what is still manual-only). Previous: 2026-06-28 — HoloMotion PDF (vision-AI) ingestion, per-user medical-staff permissions, Excel data backup; SMTP + VISION env vars.*
