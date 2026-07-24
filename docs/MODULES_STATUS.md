# AIRMS — Modules Status

> Authoritative status + spec for all 6 modules from JC's FDD. **Read this after `MASTER_CLARIFICATIONS.md`** to know what's done, what's pending, and what each pending module should look like when built.
>
> **Restructured 2026-07-20.** Activity Tracking & Logging (originally
> Module 1) was fully removed that day. Rather than leave a hole or drop to
> five modules, the surviving feature set was redistributed across a fresh
> six — the old "Data Management" module (the largest) split into
> **Screening Data Ingestion** and **Cohort Norms & Governance**. See
> `MASTER_CLARIFICATIONS.md §4` and `docs/fyp/FYP2_MODULES_USECASES.md`
> (Appendix A/B) for the full before/after mapping.

---

## Quick status table

| # | Module | Role | Status | Pages | Backend route(s) |
|---|---|---|---|---|---|
| **G** | **General (auth + RBAC)** | **all** | ✅ **fully complete** | `/`, `/forgot-password`, `/verify-otp`, `/reset-password`, `<role>/profile` | `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/verify-otp`, `/api/auth/reset-password`, `/api/auth/change-password`, `/api/auth/me` |
| 1 | Athlete Dashboard & Overall Risk Indicator | athlete | ✅ **fully complete** | `/athlete/dashboard` | `/api/athletes/:id`, `/api/injuries/athlete/:id` |
| 2 | Injury & Recovery Logging | medical (+ athlete self-report) | 🟢 **functional, deferred polish** | `/medical/injury-log`, `/medical/review-reports`, `/athlete/injury-report` | `/api/injuries`, `/api/self-reports` |
| 3 | Screening Data Ingestion | admin | 🟢 **functional — HoloMotion PDF ingestion (batch + name-match)** | `/admin/data-upload`, `/medical/data-upload` | `/api/upload/screening/pdf[/preview\|/status]` |
| 4 | Cohort Norms & Governance | admin | 🟢 **functional — norm engine, alerts, tunable settings, cohort analytics, data backup** | `/admin/thresholds` | `/api/cohorts`, `/api/export/backup.xlsx` |
| 5 | Analytics & Reporting | admin | ✅ **fully complete** | `/admin/dashboard`, `/admin/reports` | `/api/injuries/analytics/summary`, `/api/injuries`, `/api/reports/injuries-pdf` |
| 6 | Clinical & Squad Monitoring | medical | 🟢 **functional, watchlist deferred** | `/medical/dashboard` | `/api/athletes`, `/api/athletes/:id` |

**Legend:**
- ✅ Fully complete — meets all FYP rubric requirements; no known gaps
- 🟢 Functional — system clicks through end-to-end; one or two minor refinements deferred
- 🟡 Infrastructure complete — full pipeline works; one external dependency unresolved

Module 1 is the FYP showcase requiring no further iteration. Activity Tracking (the FYP I Module 1) was removed 2026-07-20 — see its historical section below. Modules 2–6 are now functional enough for the system to be used end-to-end across all three roles, with each known gap explicitly tied to either an external dependency (Module 3 → ISN canonical schema) or a deferred polish item (Module 2 recovery milestones, Module 5 severity×time heatmap, Module 6 watchlist).

---

## General Module — Authentication, RBAC, Password Management ✅

**What it does:** Cross-cutting authentication and account-management capability used by every protected route in the system.

**Use cases covered:**
- **UC-1 Login (JWT)** — All three roles authenticate via [`POST /api/auth/login`](../backend/src/routes/auth.js); JWT signed HS256 with `JWT_SECRET`; bearer token persisted in `localStorage` and auto-attached by [`frontend/src/lib/api.ts`](../frontend/src/lib/api.ts). The login error message is deliberately generic — it doesn't reveal whether the email or the password was wrong, preserving the same no-enumeration property as the forgot-password endpoint.
- **UC-2 Reset Password via email OTP — 3-page flow** —
  - **Page 1 (`/forgot-password`)** — email entry. [`POST /api/auth/forgot-password`](../backend/src/routes/auth.js) issues a single-use 6-digit code, hashes it with SHA-256, stores the hash + 10-minute TTL + a per-user attempt counter on the user row, and emails the code via [`utils/mailer.js`](../backend/src/utils/mailer.js) (env-driven SMTP, falls back to a console transport when `SMTP_HOST` is unset).
  - **Page 2 (`/verify-otp`)** — code entry. [`POST /api/auth/verify-otp`](../backend/src/routes/auth.js) verifies the code; after 5 wrong entries the code is invalidated. On success the OTP hash is swapped on the user row for a 32-byte verification-token hash with a 5-minute TTL, and the raw token is returned to the client.
  - **Page 3 (`/reset-password`)** — password entry. The frontend holds the verification token in `sessionStorage` (so it never appears in any URL or browser history). [`POST /api/auth/reset-password`](../backend/src/routes/auth.js) takes email + verification token + new password; the OTP itself never travels in the reset payload. On success all reset state is cleared.
  - Whole flow runs in a single browser tab — no orphaned-tab UX. Open to all three roles.
- **UC-3 Role-Based Access Control** — Backend `rbac()` middleware on every protected route; frontend `DashboardLayout` mirrors the gate so unauthorized users can't even render the page.

**Additional capability beyond Slide 21:**
- **In-place change password** — [`POST /api/auth/change-password`](../backend/src/routes/auth.js) lets an already-logged-in user rotate their password without leaving the app. Surfaced as an inline card on `/athlete/profile` and as a modal on `/medical/profile` and `/admin/profile`. Same password policy as the reset flow.
- **Per-user feature permissions for medical staff (admin-controlled)** — beyond coarse RBAC, the admin can revoke individual capabilities (`viewRecords`, `uploadData`, `reviewReports`, `injuryReports`) from a specific medical staffer, or deactivate the account entirely. Opt-out model: every capability is granted unless explicitly revoked. Enforced server-side by [`requirePermission()`](../backend/src/middleware/permission.js) on the athlete/injury/self-report/upload routes, mirrored in the frontend so a revoked feature disappears from the sidebar and direct navigation to its URL redirects to the first still-permitted page (no dead-end error screen). The dashboard layout refreshes the session user from `/api/auth/me` on every load, so a revocation takes effect on the staffer's next navigation without re-login. Admin UI: [`/admin/staff`](../frontend/src/app/admin/staff/page.tsx); backend: [`/api/users`](../backend/src/routes/users.js); catalogue + helpers in [`utils/permissions.js`](../backend/src/utils/permissions.js). athlete/admin roles are never constrained by this layer.

**Password policy** (applied consistently by both `change-password` and `reset-password`, mirrored client-side at [`lib/passwordPolicy.ts`](../frontend/src/lib/passwordPolicy.ts) and server-side at [`utils/passwordPolicy.js`](../backend/src/utils/passwordPolicy.js)):

- Minimum 10 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one symbol (non-alphanumeric)

**Security design notes** (for viva):
- OTP entropy: 6 decimal digits generated with `crypto.randomInt` — uniform across the 1M-code space
- OTP at rest: SHA-256 hash only — DB compromise leaks no active codes
- OTP TTL: 10 minutes, cleared on verification (single-use)
- Brute-force mitigation: code invalidated after 5 wrong entries via the `reset_code_attempts` counter on the user row
- Verification token: 32 bytes from `crypto.randomBytes` (256-bit), SHA-256 hashed at rest, 5-minute TTL, single-use, held client-side in `sessionStorage` (per-tab, ephemeral) so it never appears in any URL or browser history
- Generic responses on both `/forgot-password` (no user enumeration) and `/login` (doesn't reveal whether email or password was wrong)
- Fire-and-forget mail send — client response time doesn't depend on SMTP latency
- bcrypt password hashing via existing `User.beforeSave` hook (work factor 12)
- Defense in depth — every client-side rule re-checked server-side
- Outstanding reset codes cleared on in-place change-password success
- Single-tab UX: the whole forgot-password flow happens in one tab, removing the cross-tab synchronisation that a link-based reset would require
- Direct-navigation protection: `/verify-otp` bounces to `/forgot-password` if no email is supplied; `/reset-password` bounces if no verification token is held in `sessionStorage`

**FYP defensibility hook:** All three UC-1/2/3 use cases ship as a complete, security-defensible auth surface. The email-reset flow runs against any SMTP provider (Gmail, Mailtrap, SendGrid) by env config, with a console-mailer fallback so the system works end-to-end without credentials.

---

## Historical: Activity Tracking & Logging (was Module 1) ⚫ removed 2026-07-20

> This was **Module 1** in the original FYP I decomposition. That number now
> belongs to a different, live module (Athlete Dashboard & Overall Risk
> Indicator, below) — the module set was redistributed across a fresh six
> when this one was removed, rather than left as a gap. See
> `MASTER_CLARIFICATIONS.md §4`.

**What it did:** Athletes logged training sessions; system computed session load via sRPE; displayed history with filter and delete.

JC asked to fully remove this module — its ACWR/composite-risk *display* had
already been pulled from every dashboard on 2026-07-16 (see Module 1's FYP II
note below), and with nothing left to surface its output, JC judged the
logging page itself not worth keeping. This was an explicit, informed
decision with the fallout accepted, not a bug fix or a scope cut under
pressure — see `MASTER_CLARIFICATIONS.md §4` for the full record.

**Removed:**
- Frontend page (`frontend/src/app/athlete/activity/page.tsx`) and its Sidebar nav link
- Backend `Activity` model + `routes/activities.js` (`POST/GET/DELETE /api/activities*`, including the ACWR endpoint)
- Backend `RecoveryBaseline` model + `routes/recoveryBaselines.js` — this was Activity Tracking's only consumer once ACWR's dashboard display was already gone (the recovery-baseline auto-trigger and the Module 6 prevention-insight card both keyed off it), so it was retired alongside rather than left as dead code
- Seeder's activity-log + recovery-baseline generation

**Kept:** `frontend/src/lib/risk.ts` (`classifyCompositeRisk()`) — the composite
risk model formula is a locked decision independent of this module — but it
now has **no live callers anywhere in the app**. Its rebuild path, if the
formula is ever wired back up to a different training-load input, is
[`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).

**FYP defensibility hook (historical):** this module was the canonical demonstration of the **sRPE method**, cited via its contemporary validators — Inoue et al. (2022) for scale reliability and Yang et al. (2024) for physiological correspondence. The formula stays citable in the FYP report; see [DESIGN_DECISIONS.md §1](DESIGN_DECISIONS.md#1-srpe-for-internal-load).

---

## Module 1 — Athlete Dashboard & Overall Risk Indicator ✅

*(Was Module 2 before the 2026-07-20 restructure.)*

**What it does:** Shows the athlete their current injury-risk picture: cohort-normed risk hero, risk indicator radar, muscle assessment body map, injury records.

**Page:** [frontend/src/app/athlete/dashboard/page.tsx](../frontend/src/app/athlete/dashboard/page.tsx)

**Sub-components:**
- [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx) — front+back silhouette with flagged regions
- [WorkloadChart.tsx](../frontend/src/components/dashboard/WorkloadChart.tsx) — bar+line dual-axis chart
- [RiskRadar.tsx](../frontend/src/components/dashboard/RiskRadar.tsx) — 8-axis risk radar
- [risk.ts](../frontend/src/lib/risk.ts) — composite risk model logic

**User flow:** see [USER_MANUAL.md §4](USER_MANUAL.md#4-athlete-dashboard)

**Why it's "complete"** *(as of the 2026-07-16 redesign)*:
- **Overall risk indicator hero** — the page's only risk verdict: band in large type with a plain-English meaning, the 0–100 cohort-normed indicator (50 = cohort average), and a "why" chip naming the escalation rules that fired (or the clinician's override note)
- **"Regions behind this band"** detail renders under the hero only when the band is amber/red — the explanation of the verdict, not a second verdict
- 7-indicator radar from screening data (LDH stored, never displayed)
- Body map shows muscle flags aggregated by region; flag cards below preserve per-muscle granularity; only ISN-scoped regions are interactive
- Tabbed injury records (Active / All History)
- **HoloMotion screening embedded on the dashboard** via the shared [`ScreeningPanel`](../frontend/src/components/dashboard/ScreeningPanel.tsx): five tier-ticked score gauges, the seven shown exercise-risk indicators as **threshold strips** (Low ≤15 / Watch ≤25 / Elevated >25 zones with the athlete's value marked and sport-critical regions tightened + starred), and the myodynamia/tension muscle-flag chips. There is no separate screening page — the dashboard is the single working surface

**FYP defensibility hook:** The **composite risk model** is the FYP innovation. It integrates workload + biomechanical screening + injury history into one classification, instead of the textbook Gabbett ACWR bands. See [DESIGN_DECISIONS.md §2](DESIGN_DECISIONS.md#2-composite-risk-model).

> **FYP II note (updated 2026-07-20):** the **cohort-normed overall risk indicator** is now the *only* risk verdict on this dashboard. The composite ACWR hero, the load stat tiles and the Workload Trend chart were **removed from the dashboard** on 2026-07-16 — a browser-driven layout audit showed the "secondary" ACWR card visually dominating the primary indicator (~6×) and the athlete reading three competing verdicts at once. This module is now purely screening. On 2026-07-20, Activity Tracking (`/athlete/activity`, originally Module 1) — the composite model's only training-load input — was fully removed, and with it the Recent Activity table on this dashboard, the recovery-baseline auto-trigger, and Module 6's prevention-insight card. `risk.ts` is **not** deleted (locked decision) but currently has **no live callers**. Rebuild spec: [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).

---

## Module 2 — Injury & Recovery Logging 🟢

*(Was Module 3 before the 2026-07-20 restructure.)*

**What it does (full vision):** Medical staff record official injuries against athlete records, track recovery status, and review athlete-submitted self-reports before promoting them into official records.

**Current state (functional):**
- ✅ Athlete submits a self-report at `/athlete/injury-report` — full form, validates, lists their own past submissions with status badges
- ✅ Medical logs official injury at `/medical/injury-log` — datalist-based athlete picker, all enum dropdowns wired, accepts `?athleteId=ATH0001` query param for deep-linking from Medical Dashboard
- ✅ Medical reviews self-reports at `/medical/review-reports` — tabbed Pending/Approved/Rejected, modal review with reviewer-note textarea, Approve promotes to official `Injury` record (server-side via `selfReports.js:50`)
- ✅ Backend routes complete: `POST /api/injuries`, `GET /api/injuries/athlete/:id`, `PATCH /api/injuries/:id`, `GET /api/self-reports`, `GET /api/self-reports/mine`, `POST /api/self-reports`, `PATCH /api/self-reports/:id/review`
- ✅ Body part + injury type + side + mechanism + severity dropdowns lock to the `Injury` model enums
- ✅ Last 8 entries appear inline on `/medical/injury-log` for quick context

**Deferred (not blocking system use):**
- **Recovery milestone tracking** — Dr Thung has not specified the milestone schema (e.g. "phases: acute → sub-acute → return-to-play"). Currently we have `recoveryStatus: Recovering | Recovered | Chronic` which is editable on entry
- **Structured treatment plan** — single free-text Clinical Notes field for now; could be split into sections once ISN provides a template
- **Return-to-play clearance signature** — single recoveryStatus toggle for now

**Prototype reference:** [airms-prototype/medical/injury-log.html](../airms-prototype/medical/injury-log.html), [review-reports.html](../airms-prototype/medical/review-reports.html), [athlete/injury-report.html](../airms-prototype/athlete/injury-report.html)

---

## Module 3 — Screening Data Ingestion 🟢

*(Was the import half of Module 4 "Data Management" before the 2026-07-20
restructure split it in two — see Module 4 below for the governance half.)*

**What it does (full vision):** Admin (and medical) staff bring athlete screening data — injury-risk indicators, headline scores, per-muscle deficiency/tension flags — into the system by importing the **HoloMotion report PDFs** Dr Thung's real workflow produces. *(The original Excel import was retired 2026-07-12 once batch import + name-match autofill made it redundant; the code is archived in [`archive/excel-upload/`](../archive/excel-upload/README.md).)*

**Current state (functional):**

*HoloMotion PDF ingestion (the sole import path):*
- ✅ [`PdfScreeningUpload`](../frontend/src/components/upload/PdfScreeningUpload.tsx) on `/admin/data-upload` + `/medical/data-upload` — **batch-capable**: drop one or many PDFs; extraction runs sequentially with 3s spacing (one vision call per file, inside free-tier rate limits)
- ✅ **Name-match autofill** — each extracted athlete name is matched (trimmed, case-insensitive, must be unambiguous) against the roster: a match auto-fills Athlete ID / sport / programme; new names are entered manually, with the sport picked from a **searchable list of ISN's 52 sports** ([`lib/sports.ts`](../frontend/src/lib/sports.ts)) and the Athlete ID field offering the roster as a datalist
- ✅ The report has **no text layer** (jsPDF bakes everything in as graphics — verified pdf-parse/pdfjs extract zero text), so the backend renders the data-bearing bands to images ([`pdfRender.js`](../backend/src/utils/pdfRender.js)) and a configurable vision model reads them ([`visionClient.js`](../backend/src/utils/visionClient.js)), returning structured JSON mapped onto `Athlete` columns + `muscle_flags` ([`holomotionExtract.js`](../backend/src/utils/holomotionExtract.js))
- ✅ Two-step flow per file: `POST /api/upload/screening/pdf/preview` (render + extract, no commit) → `POST /api/upload/screening/pdf` (commit as JSON, so no second vision call). `GET /api/upload/screening/pdf/status` lets the UI self-disable when no provider is configured
- ✅ Provider-agnostic: Gemini / OpenAI / Qwen / OpenRouter / local Ollama (OpenAI-compatible) or Anthropic, by `VISION_*` env vars. See [DESIGN_DECISIONS.md §13](DESIGN_DECISIONS.md#13-excelholomotion-pdf-ingestion-vision-ai)

**Deferred / notes:**
- ✅ **Live-verified 2026-07-12** — the full pipeline was run against the sample HoloMotion PDF on Gemini's free tier (`gemini-flash-lite-latest` via the OpenAI-compatible endpoint) and reproduced the seeded ground-truth row (ATH0061) **18/18 fields** in ~5s, muscle lists included. Re-run anytime with `npm run verify:vision -- "<sample.pdf>"` from `backend/`
- Versioning / re-upload: same-`athleteId` upserts in place (latest wins); muscle flags are replaced wholesale per import

**Prototype reference:** [airms-prototype/admin/data-upload.html](../airms-prototype/admin/data-upload.html)

**Pitch line for FYP defence:** *"Module 3 ingests screening data the way ISN actually produces it — the HoloMotion report PDF. The report is image-only, so the system renders its pages and reads them with a vision model — provider-agnostic, so any OpenAI-compatible or Anthropic key works — then maps the result onto the athlete schema. It handles a whole squad's reports in one batch, matches athletes by the name printed on each report, and every import is preview-before-commit."*

---

## Module 4 — Cohort Norms & Governance 🟢

*(Was the governance half of Module 4 "Data Management," plus "View Screening
Cohort Analytics" moved in from the old Injury Analytics module — see Module 3
above for the ingestion half. Recompute, alerts, threshold approval and
tunable settings are documented in full in the "FYP II — Screening-Centred
Redesign" section below; this section covers the pieces not detailed there.)*

**What it does:** Governs the norm engine every risk indicator is measured
against (approval queue, editable per-component means, recompute-on-demand,
tunable min-cohort-size/bottom-k/escalation/fallback/alert settings — see the
FYP II table below for the full feature list), plus the data-backup export.

**Current state (functional):**
- ✅ [`DataBackupCard`](../frontend/src/components/upload/DataBackupCard.tsx) on `/admin/data-upload` → `GET /api/export/backup.xlsx` streams a multi-sheet workbook (athletes + injuries + muscle flags) — the dataset snapshot path, unaffected by the import retirement
- ✅ Cohort-norm engine, admin approval queue, tunable settings, import-commit email alerts, and screening cohort analytics — see the "FYP II — Screening-Centred Redesign" section below for the detailed feature table

---

## Module 5 — Analytics & Reporting ✅

*(Was "Injury Analytics" before the 2026-07-20 restructure; loses "View
Screening Cohort Analytics" to Module 4 above, keeps everything else.)*

**What it does (full vision):** Admin dashboard with filterable injury KPIs and breakdown charts: total cases, athletes affected, currently recovering, sports affected, distribution by body part / injury type / severity / month. Backed by a PDF report generator for ISN management.

**Current state (functional):**
- ✅ Page at `/admin/dashboard` renders the filter bar — sport, gender, programme, body part, injury type, **age group**, date range — all POST through to the backend
- ✅ Backend `GET /api/injuries/analytics/summary` extended to accept all 8 filter params including `ageMin`/`ageMax` (driven from age-group dropdown) for Dr Thung's "by age group" ask
- ✅ 4 KPI cards (Total Cases / Athletes Affected / Currently Recovering / Sports Affected) re-fetch live on filter change
- ✅ Body part distribution bar chart (Chart.js, navy) — uses canonical ordering, fills missing categories with 0
- ✅ Active dashboard filters (sport, gender, programme, body part, injury type, age group, date range) carry into `/admin/reports` via URL query params on the "Generate PDF Report" link, so the analyst doesn't re-enter what they already chose
- ✅ Injury type distribution bar chart (Chart.js, gold) — same pattern
- ✅ Monthly cases line chart — Chart.js, smooth curve, fed by Sequelize `GROUP BY YEAR(date), MONTH(date)` aggregation
- ✅ "Generate PDF Report" button navigates to `/admin/reports`
- ✅ `/admin/reports` page is a **live PDF generator**: the same filter inputs as the analytics dashboard (report type, period, sport, programme, gender, body part, injury type, age group, plus section toggles for severity/recovery, monthly trend, athlete index). Submitting POSTs to `/api/reports/injuries-pdf` and streams a fresh PDF straight to the browser as a download. Server-side rendering via `pdfkit`
- ✅ Backend `POST /api/reports/injuries-pdf` (admin only) reads the live `Injury` table against the filters and assembles a multi-page PDF: cover with AIRMS branding, executive summary table, body-part distribution chart, injury-type distribution chart, optional severity + recovery breakdowns, optional monthly trend, optional athlete index (paginated), appendix with filter context. Page numbers in the footer

**Deferred (not blocking system use):**
- **Severity × time heatmap** — designed in prototype, not yet built
- **PODIUM vs PELAPIS comparison view** — backend supports both via filters; explicit side-by-side comparison page is not built

**Prototype reference:** [airms-prototype/admin/dashboard.html](../airms-prototype/admin/dashboard.html), [airms-prototype/admin/reports.html](../airms-prototype/admin/reports.html)

---

## Module 6 — Clinical & Squad Monitoring 🟢

*(Was "Medical Dashboard" before the 2026-07-20 restructure; loses the
prevention-insight card and the composite-risk-hero reuse, both removed
2026-07-20 along with Activity Tracking, their only data source.)*

**What it does (full vision):** Medical staff's home page. Search/filter athletes, click into a per-athlete view that mirrors the athlete's own dashboard but adds "+ Log Injury" affordance and clinical metadata. This is essentially **the athlete dashboard, viewed by a clinician**.

**Current state (functional):**
- ✅ Page at `/medical/dashboard` loads the roster from `GET /api/athletes`
- ✅ Search bar (name + ID), Sport / Programme / Gender / Event filter dropdowns
- ✅ Athlete card grid with avatar + name + sport/programme + ID; click selects (active card has gold border)
- ✅ On selection, fetches the full athlete record + injuries in parallel
- ✅ Renders the **same Overall Risk Indicator hero** as Module 1 — the cohort-normed verdict, with clinician-only band-override buttons (Green/Amber/Red + required note) underneath
- ✅ Profile header card with key biometrics, events editor, and "Download PDF" / "Team PDF" buttons
- ✅ "+ Log Injury" button deep-links to `/medical/injury-log?athleteId=ATH0001` (auto-fills the athlete picker)
- ✅ Reuses [`RiskRadar`](../frontend/src/components/dashboard/RiskRadar.tsx) and [`BodyMap`](../frontend/src/components/dashboard/BodyMap.tsx) from Module 1
- ✅ Sport-context card comparing the athlete's injury pattern to their sport's overall pattern
- ✅ Full injury history list at the bottom with severity-coloured status badges
- ✅ **HoloMotion screening embedded in the per-athlete view** — the same shared [`ScreeningPanel`](../frontend/src/components/dashboard/ScreeningPanel.tsx) the athlete sees (gauges + threshold strips + muscle-flag chips) renders inside the selected-athlete pane, so the clinician reads the report in the same context as the injury picture. The former `/medical/screening` page was folded in here

**Deferred (not blocking system use):**
- **Watchlist / starred athletes** — designed in prototype, not built
- **Team-level summary card** ("5 athletes high-risk, 3 with active injuries") — not built
- **Direct screening edit** — medical reads screening data; editing is via Module 3 re-upload only

**Removed 2026-07-20** (both consumed data only Activity Tracking produced, and were retired alongside it): the **Prevention insight card** (`buildPreventionInsight()`), the **recovery baseline** card, and the **Recent Activity** table. See `MASTER_CLARIFICATIONS.md §4`.

**Prototype reference:** [airms-prototype/medical/dashboard.html](../airms-prototype/medical/dashboard.html)

---

## FYP II — Screening-Centred Redesign (2026-07-13) 🟢

A cross-module layer added on Dr Thung's direction to shift AIRMS from an
ACWR-workload centre of gravity to a **HoloMotion-screening** one. Anchor spec:
[`docs/fyp/FYP2_REDESIGN_SPEC.md`](fyp/FYP2_REDESIGN_SPEC.md) (all stages A–F
built); design rationale in [`DESIGN_DECISIONS.md §16`](DESIGN_DECISIONS.md);
demoted-logic rebuild spec in [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).
Items left for JC to eyeball are in [`docs/fyp/JC_CHECKLIST.md`](fyp/JC_CHECKLIST.md).

| Piece | Status | Where |
|---|---|---|
| **Immutable screening snapshots** — one history row per import; extractor expanded to 25 subitem scores + 8 posture axes + summary text (LDH extracted, stored, hidden from all displays per Dr Thung / ISN facilities) | ✅ | [`models/Screening.js`](../backend/src/models/Screening.js), [`utils/holomotionExtract.js`](../backend/src/utils/holomotionExtract.js) |
| **Subitem Score + Posture Evaluation actually shown** — extracted and stored since FYP II, but were dark data until this pass: rendered nowhere except the PDF export (subitems only; posture nowhere at all). Now on the athlete/medical/coach dashboards (`ScreeningPanel`), the pre-import preview, **and** the individual PDF report (posture added there too). Posture shows finding + signed value only — no fabricated range bar, since the report's per-axis reference ranges aren't part of the extraction schema | ✅ | [`SubitemTable.tsx`](../frontend/src/components/dashboard/SubitemTable.tsx), [`PostureList.tsx`](../frontend/src/components/dashboard/PostureList.tsx), [`ScreeningPanel.tsx`](../frontend/src/components/dashboard/ScreeningPanel.tsx), [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js) |
| **Cohort-norm engine** — mean/SD per `(sport,programme,gender)` cohort over 4 fallback tiers (`spg→sg→s→all`); auto-computed on import | ✅ | [`utils/cohorts.js`](../backend/src/utils/cohorts.js), [`models/CohortThreshold.js`](../backend/src/models/CohortThreshold.js) |
| **Admin approval queue + tunable settings** — pending cohorts pre-filled + editable; `min_cohort_n` / `bottom_k` / escalation & alert toggles are admin settings, not hardcoded | ✅ | [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx), [`routes/cohorts.js`](../backend/src/routes/cohorts.js), [`models/Setting.js`](../backend/src/models/Setting.js), [`utils/settings.js`](../backend/src/utils/settings.js) |
| **Overall risk indicator** — Total Score of Athleticism (average of component z-scores), 0–100 display score, **escalation** band (+1 below cohort mean, +1 in cohort's bottom-`k`, **+1 per-indicator** when one exercise-risk indicator is both Elevated ≥25 *and* a peer-outlier z ≥ 1.5 → green/amber/red). Escalation **reasons persisted + shown** on the badge; per-indicator rule is an admin toggle | ✅ | [`utils/overallIndicator.js`](../backend/src/utils/overallIndicator.js), [`utils/cohorts.js`](../backend/src/utils/cohorts.js), [`OverallRiskBadge.tsx`](../frontend/src/components/dashboard/OverallRiskBadge.tsx) |
| **Clinician override** — medical staff can move an assessed athlete to green/amber/red with a required note; auto-expires on next import | ✅ | [`routes/screenings.js`](../backend/src/routes/screenings.js), medical dashboard |
| **Three cohort-normed PDF reports** — admin holistic, individual (thresholds-vs-peers + report-to-report deltas), team/group (ranking + coach attention table). Individual + team are also downloadable from the medical dashboard's selected-athlete header (individual by ID, team scoped to that athlete's sport); both are additionally downloadable by a **coach** for their assigned sport (team from the board header, individual from the athlete detail view — sport-scope enforced server-side) | ✅ | [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js), card on [`/admin/reports`](../frontend/src/app/admin/reports/page.tsx), buttons on [`/medical/dashboard`](../frontend/src/app/medical/dashboard/page.tsx) + [`/coach/dashboard`](../frontend/src/app/coach/dashboard/page.tsx) |
| **On-screen screening history + athlete self-download (2026-07-23)** — `ScreeningHistory` table (newest-first rows + "Change since first" delta row, Ex. Risks coloured lower-is-better like the PDF) on the athlete dashboard and the medical + coach detail views; its API (`GET /screenings/athlete/:id`, previously caller-less) slimmed to summary columns and sport-scoped for coaches. The athlete dashboard's copy hosts a **Download PDF** button so athletes can pull their own individual report (UC-39 actor already permitted server-side, previously had no UI path) | ✅ | [`ScreeningHistory.tsx`](../frontend/src/components/dashboard/ScreeningHistory.tsx), [`routes/screenings.js`](../backend/src/routes/screenings.js) |
| **Post-import threshold prompt** — after a screening is committed the uploader always pops a modal to update the (now-stale) cohort norms; admin can recompute in place or deep-link into the affected cohort rows on the thresholds page, medical get an informational variant (recompute is admin-only) | ✅ | [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx), [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx) |
| **Email alerts on import commit** — to medical staff + the sport's coaches when an athlete lands amber/red or escalated | ✅ | [`utils/alerts.js`](../backend/src/utils/alerts.js) |
| **Coach view (FYP II — first-class 4th role)** — read-only squad readiness scoped to the coach's **one** assigned sport; athletes sorted worst-first with the worst region named, **filterable by programme / gender / event**; selecting a row opens a **read-only screening detail** (risk badge + radar + ScreeningPanel + body map + events), no clinical affordances; can download the team screening PDF for the sport and (since 2026-07-23) the individual screening PDF from the detail view, both sport-scoped. **Coaching cockpit:** a *Needs-attention* list (Restricted + injured athletes, each with its persisted escalation reason), a *Squad focus* card (common weak spots + muscle hotspots + readiness-by-event + coverage + momentum), and a per-athlete **trend** arrow vs the previous screening | ✅ | [`/coach/dashboard`](../frontend/src/app/coach/dashboard/page.tsx), [`routes/coach.js`](../backend/src/routes/coach.js) |
| **Recovery & Trends (admin)** — recovery-status split + recovery rate, athletes fully recovered vs still affected, recurring problems (2+ injuries in the same body part, plus recurrent-mechanism + chronic), and same-sport clustering (injuries + distinct athletes + active per sport); sport filter | ✅ | [`/admin/trends`](../frontend/src/app/admin/trends/page.tsx), `GET /injuries/analytics/trends` in [`routes/injuries.js`](../backend/src/routes/injuries.js) |
| **Admin coach management** — create a coach, assign/change their one sport (searchable ISN-sport input), and activate/deactivate — no reseed needed (was seed-only). Coaches are fully wired into the shell: a **`/coach/profile`** page (change password + squad vitals) and topbar role label / profile link | ✅ | [`/admin/coaches`](../frontend/src/app/admin/coaches/page.tsx), [`routes/users.js`](../backend/src/routes/users.js), [`/coach/profile`](../frontend/src/app/coach/profile/page.tsx) |
| **Admin screening-cohort card follows filters** — the `/admin/dashboard` HoloMotion cohort card (stat tiles, per-indicator bands, muscle hotspots) now respects the athlete-level filters (sport / programme / gender / age), like the injury charts; injury-only filters (body part / type / date) don't apply | ✅ | [`/admin/dashboard`](../frontend/src/app/admin/dashboard/page.tsx), [`routes/athletes.js`](../backend/src/routes/athletes.js) |
| **Athlete events / disciplines** — `athlete_disciplines` join table (an athlete can hold several events, e.g. badminton Men's Singles + Men's Doubles). Set on the PDF-import identity step via a **combobox**: pick an event already on record (autocomplete from `GET /athletes/meta/disciplines`) **or type a new one**, for any sport; badminton's 5 ship as seed suggestions. Shown as chips on the medical + coach athlete views and **editable on the medical athlete header** (same combobox, PATCH `/athletes/:id`, no re-import); roster event filters are data-driven (list the events actually present), so admin-added events are immediately filterable. Seed suggestions ship for badminton + tennis + table tennis + squash | ✅ | [`models/AthleteDiscipline.js`](../backend/src/models/AthleteDiscipline.js), [`lib/disciplines.ts`](../frontend/src/lib/disciplines.ts), [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx), [`routes/athletes.js`](../backend/src/routes/athletes.js) |
| **ACWR removal from dashboards** (2026-07-16; supersedes the 07-13 "demotion") — no user-facing surface shows ACWR/workload anymore; the composite model (`risk.ts`) is **not deleted**, logic preserved for identical rebuild. **2026-07-20:** Activity Tracking's sRPE logging (the model's only training-load input) removed entirely, along with the recovery-baseline trigger and prevention insight that consumed it, and the six-module set was restructured to fill the resulting gap — `risk.ts` now has no live callers | ✅ | dashboards, [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md) |
| **Batch upload + name-match + 52-sport search + editable identity.** PDFs **auto-extract on drop** (no manual "read" step; a *Retry failed* button re-queues errors). Pre-import **preview read-out** ([`ScreeningPreview.tsx`](../frontend/src/components/upload/ScreeningPreview.tsx)): headline scores with tier/band, exercise-risk evaluation as banded bars (Low/Watch/Elevated), the HoloMotion subitem table (tier colours), and the full **muscle hero** (BodyMap) — the data column scrolls to fit beside the edit form. Events picked via the in-UI [`TagCombobox`](../frontend/src/components/ui/TagCombobox.tsx) (styled dropdown, not native datalist) | ✅ | [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx) |

**Defensibility:** the indicator is cohort-normed (z-score + traffic-light is the
accepted sports-science screening method; TSA equal-weight averaging removes
arbitrary weighting) rather than an absolute cut-off, so "safe" adapts to
sport/programme/gender. Escalation encodes Dr Thung's rule that a good raw score
can still warrant assessment if the athlete is below their peers.

**Left for JC to verify:** open the three PDFs in a real viewer, click through the
traffic-light surfaces / thresholds page / override flow, decide whether the
red-heavy seed distribution (bottom-3 of ~6 = half a small cohort) needs a larger
demo cohort, and provide the test Gmail for a live alert send.

---

## How module status changes

When a module ships (status `⏳` → `✅`):

1. Update the status table at top of this file
2. Move the "Current state (partial)" content into a "Why it's complete" section
3. Add the user flow to [USER_MANUAL.md](USER_MANUAL.md)
4. If new locked decisions were made, update [MASTER_CLARIFICATIONS.md §12](MASTER_CLARIFICATIONS.md)
5. If the FYP defensibility hook changed, update [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)

---

## Stakeholder traceability — Dr Thung (2026-04-24 meeting)

Mapping of Dr Thung's stated requirements (transcript: [stakeholder/meeting-2026-04-24-dr-thung.txt](stakeholder/meeting-2026-04-24-dr-thung.txt)) to where each is satisfied in the system.

| Dr Thung's ask | Where it lives |
|---|---|
| Two distinct dashboards — admin (holistic) + medical (individual) | Module 5 — Analytics & Reporting (`/admin/dashboard`) + Module 6 — Clinical & Squad Monitoring (`/medical/dashboard`) |
| Admin: cohort summary with filters/slicers (sport, gender, **age group**) | 8-filter strip on `/admin/dashboard` (sport, gender, programme, body part, injury type, age group, date range) |
| Admin: body region breakdown (upper/lower, left/right) | Body part dropdown covers all 10 regions (Neck/Shoulder/Spine/Lumbar-Pelvis/Knee/Ankle/Hip/Elbow/Wrist/Other); side stored on every `Injury` (Left / Right / Both / N/A). An earlier upper/trunk/lower chip row was prototyped and removed after UX review — the dropdown already covered the same query with less visual clutter |
| Admin: time-series trend (year-to-year, quarter-to-quarter) | "Cases Over Time" monthly line chart |
| Medical: per-athlete history "trace through" view | `/medical/dashboard` injury list + workload trend + body map |
| Medical: surface prominent likely injuries + prevention advice | **Prevention insight card** on `/medical/dashboard` |
| Easy upload pipeline auto-populating dashboards | Module 3 preview + commit → all analytics auto re-fetch |
| Cover all sports, not just swimming | Sport is a free-form field; seeded across multiple sports |
| Standard / automatic PDF report generation | `/admin/reports` builder + structural preview (server-side render deferred) |

Anything blocked or out-of-scope (NDA, force-plate data, multi-year continuation, ISN local hosting, semester-break stipend, KeYing module deployment) is operational, not a code gap.

---

## Demo-defensibility cheat sheet (for FYP viva)

Worst-case question: *"Are modules 2–6 working?"*

Best answer per module:

- **Module 2 (Injury & Recovery Logging):** "Yes — athletes submit self-reports, medical reviews them, approved reports promote to the official injury record, medical logs injuries directly. End-to-end. Recovery milestone tracking is deferred because Dr Thung has not specified the standardised recovery phase schema yet."
- **Module 3 (Screening Data Ingestion):** "Yes — HoloMotion PDF ingestion end-to-end, preview-before-commit: render → vision-AI extraction → confirm. It matches Dr Thung's real workflow, handles a whole squad's reports in one batch, auto-matches athletes by the printed name, and reads the muscle lists straight off the report. The old Excel import was deliberately retired once this made it redundant (code archived)."
- **Module 4 (Cohort Norms & Governance):** "Yes — every commit recomputes cohort norms and re-scores athletes, amber/red imports email medical staff and the sport's coaches, and the admin governs the norm-approval queue and every tunable setting (min cohort size, bottom-k, escalation, alerts). The Excel backup export and screening cohort analytics live here too."
- **Module 5 (Analytics & Reporting):** "Yes — 7-filter live analytics dashboard with KPI cards, body part + injury type distribution charts, and monthly trend. The report builder generates the PDF server-side via `pdfkit` (cover, executive summary, distribution charts, optional severity/recovery/monthly sections, athlete index). Deferred polish: the severity×time heatmap and an explicit PODIUM-vs-PELAPIS comparison view."
- **Module 6 (Clinical & Squad Monitoring):** "Yes — search/filter the athlete roster, select an athlete, and you see the same overall-risk indicator hero, screening panel, risk radar, body map, and injury history as that athlete sees on their own dashboard — plus the clinician's affordances: the band override with a required note, sport-context comparison, and a deep-linked '+ Log Injury' button. The prevention-insight card and recovery baseline were retired 2026-07-20 alongside Activity Tracking (their only training-load input); the watchlist and team-summary KPI cards are deferred."

The umbrella message: *"All six FDD modules are functional. Activity Tracking (originally Module 1) was deliberately removed 2026-07-20 once its ACWR/composite-risk display had already left every dashboard — the module set was then restructured to stay at six by splitting the old Data Management module into Screening Data Ingestion and Cohort Norms & Governance. The remaining work on Modules 2–6 is either external (Dr Thung's schema lock) or deferred polish (PDF renderer, watchlist) — none of it gates the system from being used today."*

---

*Last updated: 2026-07-20. **Module restructure**: Activity Tracking (Module 1) fully removed; the surviving six-module set redistributed as Module 1 — Athlete Dashboard & Overall Risk Indicator, Module 2 — Injury & Recovery Logging, Module 3 — Screening Data Ingestion, Module 4 — Cohort Norms & Governance, Module 5 — Analytics & Reporting, Module 6 — Clinical & Squad Monitoring. Full mapping: `docs/fyp/FYP2_MODULES_USECASES.md` Appendix A/B. Previous: 2026-07-14 — **FYP II — Screening-Centred Redesign** (see the dedicated section above): cohort-normed overall risk indicator (TSA z-score + escalation) is now the primary risk signal; immutable screening snapshots + history; admin-approved cohort norms + tunable settings; clinician override; three cohort-normed PDF reports; import-commit email alerts; coach role (promoted to a first-class 4th role 2026-07-19); ACWR demoted to a secondary Training-Load view. Perf pass on the cohort/indicator recompute paths (preload-into-Map + batched writes, no N+1). Earlier: 2026-07-06 — screening pages (then Modules 2 & 6, now Modules 1 & 6) folded into the dashboards as the shared `ScreeningPanel`; HoloMotion-only seed with ATH0061 (Thung Jin Seng) as pipeline ground truth; General Module revoked staff features vanish (sidebar hide + redirect + live session refresh); five-step pro-team injury intake (then Module 3, now Module 2); screening-cohort analytics (then Module 5, now Module 4). 2026-06-28 (HoloMotion ingestion + backup, then Module 4, now split across Modules 3–4; per-user permissions).*
