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
>
> **HoloMotion-only consolidation, 2026-08-01/02.** JC set the direction that
> the **HoloMotion PDF is the single source of truth** — everything on the site
> derives from it; features fed by other inputs are flagged (not removed) for a
> later keep/retire decision. This pass:
> - **Posture Evaluation removed everywhere** (extraction → model → dashboards →
>   preview → all reports); not required by Dr Thung.
> - **Cohort norms auto-generate + go live on every import**; manual edits are
>   kept and flagged "review · new data" on drift; new `norm_auto_overwrite`
>   setting; norm-editing opened to medical via the `editCohortNorms` capability
>   (`/medical/cohort-norms`).
> - **Admin `/admin/personnel`** merges the old Coaches + Staff Permissions pages.
> - **Reports overhaul** — layout bugs fixed, by-gender/by-age slicing added,
>   **individual-by-name** search, and a new **`/coach/reports`** page.
> - **Admin dashboard → "Screening Analytics"**: HoloMotion cohort leads, a
>   previous-vs-latest **screening trend**, and the injury-log analytics moved
>   below as flagged "actual outcomes" with a screening↔injury **necessity
>   bridge** (the active-injury floor's effect).
> - Email band wording made consistent; backend suite 34 → 45 tests.
> - Full scope + flag list + deferred norm-settings decision:
>   `docs/fyp/HOLOMOTION_SCOPE_2026-08.md`.
>
> **The 2026-08-03 roadmap batch (A–F), landed 2026-08-03 → 08-06.** Tracked in
> [`fyp/ROADMAP_2026-08-03.md`](fyp/ROADMAP_2026-08-03.md):
> - **A** — filename→name local autofill; **the athlete key is now the IC
>   number** (A2); a **mock ISN directory** + lookup in the import flow, built as
>   a swappable integration seam (A3).
> - **B** — cohort-norm **versioning** (named, restorable snapshots), a
>   **discipline-level `spgd` tier** at the top of the fallback ladder, and one
>   unified **norm-membership model** (manual-out → injured → below-threshold,
>   each with a reason).
> - **C** — screening **history** for all three roles; athlete **My Squad**.
> - **D** — hardened the "reader stops after idle" bug (Tesseract worker
>   timeout + recycle, MySQL keep-alive/pool/retry).
> - **E** — admin dashboard rebuilt as theme-aware HTML/CSS, Chart.js dropped
>   from that page.
> - **F** — vision cost/capacity measured (~8.25k tokens/PDF; RPD is the binding
>   free-tier limit), research only.
>
> **Consolidation pass, 2026-08-06.** No behaviour change, three
> single-source-of-truth fixes: all pdfkit drawing extracted to
> [`utils/pdfDraw.js`](../backend/src/utils/pdfDraw.js) (+ a headless render
> test); the four dashboards' duplicated radar axis/label/clamp copies replaced
> by `RADAR_AXES` / `riskRadarSeries()` in `lib/screeningAlerts.ts`; and
> `/athletes/teammates` de-N+1'd via a batched `latestIndicatorsFor()`.

---

## Quick status table

| # | Module | Role | Status | Pages | Backend route(s) |
|---|---|---|---|---|---|
| **G** | **General (auth + RBAC)** | **all** | ✅ **fully complete** | `/`, `/forgot-password`, `/verify-otp`, `/reset-password`, `<role>/profile` | `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/verify-otp`, `/api/auth/reset-password`, `/api/auth/change-password`, `/api/auth/me` |
| 1 | Athlete Dashboard & Overall Risk Indicator | athlete | ✅ **fully complete** | `/athlete/dashboard`, `/athlete/history`, `/athlete/squad` | `/api/athletes/:id`, `/api/screenings/:id/full`, `/api/athletes/teammates` |
| 2 | **Athlete Roster & Identity Management** *(recast 2026-08-06 from Injury & Recovery Logging, removed 2026-08-02)* | admin + medical | 🟢 **functional** — roster CRUD, IC-number key, ISN directory lookup, event vocabulary, injury-status flag | `/admin/personnel`, roster surfaces in `/medical/dashboard`, import flow | `/api/athletes` (incl. `PATCH /:id/injury`), `/api/isn` |
| 3 | Screening Data Ingestion | admin + medical | 🟢 **functional — HoloMotion PDF ingestion (batch + on-device name redaction + roster attach + ISN directory lookup)** | `/admin/data-upload`, `/medical/data-upload` | `/api/upload/screening/pdf[/preview\|/status]`, `/api/isn/athletes` |
| 4 | Cohort Norms & Governance | admin (+ medical via `editCohortNorms`) | 🟢 **functional — norm engine, versioning, membership model, alerts, tunable settings, data backup** | `/admin/thresholds`, `/admin/settings`, `/medical/cohort-norms` | `/api/cohorts` (incl. `/versions`, `/:id/members`), `/api/export/backup.xlsx` |
| 5 | Analytics & Reporting | admin (+ coach) | 🟢 **functional — screening-derived only** (the injury half went with the cut) | `/admin/dashboard`, `/admin/reports`, `/coach/reports` | `/api/athletes/analytics/screening`, `/api/screening-reports/*` |
| 6 | Clinical & Squad Monitoring | medical + coach | 🟢 **functional, watchlist deferred** | `/medical/dashboard`, `/coach/dashboard` | `/api/athletes`, `/api/athletes/:id`, `/api/coach/readiness` |

**Legend:**
- ✅ Fully complete — meets all FYP rubric requirements; no known gaps
- 🟢 Functional — system clicks through end-to-end; one or two minor refinements deferred
- 🟡 Infrastructure complete — full pipeline works; one external dependency unresolved

Module 1 is the FYP showcase requiring no further iteration. Activity Tracking (the FYP I Module 1) was removed 2026-07-20 — see its historical section below. Module 2 was removed 2026-08-02 by the HoloMotion-only cut and is retained as a record, not a spec. Modules 3–6 are functional end-to-end across all four roles, with each known gap tied to either an external dependency (**Module 3 → real ISN directory access**; the seam is mocked and ready) or a deferred polish item (Module 5 PODIUM-vs-PELAPIS comparison view, Module 6 watchlist).

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
- **Per-user feature permissions for medical staff (admin-controlled)** — beyond coarse RBAC, the admin can revoke individual capabilities (`viewRecords`, `uploadData`, `reviewReports`, `injuryReports`, `editCohortNorms`) from a specific medical staffer, or deactivate the account entirely. Opt-out model: every capability is granted unless explicitly revoked. Enforced server-side by [`requirePermission()`](../backend/src/middleware/permission.js) on the athlete/injury/self-report/upload routes, mirrored in the frontend so a revoked feature disappears from the sidebar and direct navigation to its URL redirects to the first still-permitted page (no dead-end error screen). The dashboard layout refreshes the session user from `/api/auth/me` on every load, so a revocation takes effect on the staffer's next navigation without re-login. Admin UI: [`/admin/personnel`](../frontend/src/app/admin/personnel/page.tsx) (merged the former `/admin/staff` + `/admin/coaches` on 2026-08-01); backend: [`/api/users`](../backend/src/routes/users.js); catalogue + helpers in [`utils/permissions.js`](../backend/src/utils/permissions.js). athlete/admin roles are never constrained by this layer.

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
- **App-level hardening (2026-07)** — `helmet` security headers (HSTS, noSniff, frameguard; CORP relaxed to cross-origin only so the frontend can fetch streamed PDFs) and an `express-rate-limit` throttle on `/api/auth` (30 **failed** attempts / 15 min / IP — `skipSuccessfulRequests`, so a demo logging in/out across roles is never blocked while brute-force is)
- **Uniform password policy** — the 10-char + complexity rule (`utils/passwordPolicy.js`) is enforced server-side on *every* account-creation path, including admin coach creation (previously a bespoke `length < 6` check)
- **Mass-assignment guard** — the athlete self-report POST whitelists its fields (was a `...req.body` spread) so an athlete cannot self-`Approve` or fabricate a reviewer on their own report; `athleteId` is always taken from the token
- **Graceful shutdown + clean EADDRINUSE handling** on the server — SIGTERM/SIGINT drain in-flight requests and release the port; a busy port logs a clear message and exits cleanly instead of an unhandled crash (matters for real deploys under a process manager)
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

**What it does:** Shows the athlete their current injury-risk picture: cohort-normed risk hero, risk indicator radar, muscle assessment body map, embedded HoloMotion screening panel — plus, since 2026-08, screening **history** and a same-sport **squad** readiness view.

**Pages:** [`/athlete/dashboard`](../frontend/src/app/athlete/dashboard/page.tsx) · [`/athlete/history`](../frontend/src/app/athlete/history/page.tsx) (C2) · [`/athlete/squad`](../frontend/src/app/athlete/squad/page.tsx) (C3)

**Sub-components:**
- [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx) — front+back silhouette. **Muscle Flags mode draws HoloMotion's 22 individual muscles** since 2026-08-04 ([`bodymap-data/muscles.ts`](../frontend/src/components/dashboard/bodymap-data/muscles.ts), test-guarded); **ROM & Stability mode still draws the 5 regions**, because the subitem score genuinely is 5 regions. Rationale: [DESIGN_DECISIONS §4a](DESIGN_DECISIONS.md)
- [RiskRadar.tsx](../frontend/src/components/dashboard/RiskRadar.tsx) — 7-axis risk radar; axes/labels/clamping come from `RADAR_AXES` in [`lib/screeningAlerts.ts`](../frontend/src/lib/screeningAlerts.ts), shared with the medical and coach dashboards
- [OverallRiskBadge.tsx](../frontend/src/components/dashboard/OverallRiskBadge.tsx) — the cohort-normed hero (band + 0–100 indicator + escalation "why" chips)
- [ScreeningPanel.tsx](../frontend/src/components/dashboard/ScreeningPanel.tsx) — the embedded HoloMotion report
- ⚫ [WorkloadChart.tsx](../frontend/src/components/dashboard/WorkloadChart.tsx) + [risk.ts](../frontend/src/lib/risk.ts) — retained, **not rendered** on this or any page since 2026-07-16

**User flow:** see [USER_MANUAL.md §4](USER_MANUAL.md#4-athlete-dashboard)

**Why it's "complete"** *(as of the 2026-07-16 redesign)*:
- **Overall risk indicator hero** — the page's only risk verdict: band in large type with a plain-English meaning, the 0–100 cohort-normed indicator (50 = cohort average), and a "why" chip naming the escalation rules that fired (or the clinician's override note)
- **"Regions behind this band"** detail renders under the hero only when the band is amber/red — the explanation of the verdict, not a second verdict
- 7-indicator radar from screening data (LDH stored, never displayed)
- Body map draws the 22 HoloMotion muscles in flags mode (regions in ROM & Stability mode); flag cards below preserve per-muscle names with sides; only assessed shapes are interactive
- Screening history: any past assessment can be selected and the whole page re-renders against it (the clinician override stays bound to the latest)
- **HoloMotion screening embedded on the dashboard** via the shared [`ScreeningPanel`](../frontend/src/components/dashboard/ScreeningPanel.tsx): five tier-ticked score gauges, the seven shown exercise-risk indicators as **threshold strips** (Low ≤15 / Watch ≤25 / Elevated >25 zones with the athlete's value marked and sport-critical regions tightened + starred), and the myodynamia/tension muscle-flag chips. There is no separate screening page — the dashboard is the single working surface

**FYP defensibility hook:** The **composite risk model** is the FYP innovation. It integrates workload + biomechanical screening + injury history into one classification, instead of the textbook Gabbett ACWR bands. See [DESIGN_DECISIONS.md §2](DESIGN_DECISIONS.md#2-composite-risk-model).

> **FYP II note (updated 2026-07-20):** the **cohort-normed overall risk indicator** is now the *only* risk verdict on this dashboard. The composite ACWR hero, the load stat tiles and the Workload Trend chart were **removed from the dashboard** on 2026-07-16 — a browser-driven layout audit showed the "secondary" ACWR card visually dominating the primary indicator (~6×) and the athlete reading three competing verdicts at once. This module is now purely screening. On 2026-07-20, Activity Tracking (`/athlete/activity`, originally Module 1) — the composite model's only training-load input — was fully removed, and with it the Recent Activity table on this dashboard, the recovery-baseline auto-trigger, and Module 6's prevention-insight card. `risk.ts` is **not** deleted (locked decision) but currently has **no live callers**. Rebuild spec: [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).

---

## Module 2 — Athlete Roster & Identity Management 🟢
### *(was Injury & Recovery Logging — removed 2026-08-02, slot recast 2026-08-06)*

*(Was Module 3 before the 2026-07-20 restructure.)*

> **This module was removed by the HoloMotion-only cut.** JC's directive was
> *"as long as it is not HoloMotion PDF related, remove"* — see
> [`fyp/HOLOMOTION_SCOPE_2026-08.md`](fyp/HOLOMOTION_SCOPE_2026-08.md). The
> section is kept (not deleted) because the FDD, Table 4.1 and the report still
> describe the old module and need a matching rewrite before viva — that rewrite
> is an open item on [`fyp/JC_CHECKLIST.md`](fyp/JC_CHECKLIST.md).

**What was removed:** the `Injury` and `SelfReport` models; `routes/injuries.js`
and `routes/selfReports.js` (including the approve→promote-to-`Injury` Sequelize
transaction); the `/athlete/injury-report`, `/medical/injury-log` and
`/medical/review-reports` pages; the injuries sheet in the Excel backup export;
and the injury-floor contribution to the overall indicator.

**What survives:** a single clinician-set flag on the Athlete row —
`isInjured`, `injuryNote`, `injuryBy`, `injuryAt` — written by
`PATCH /api/athletes/:id/injury` (medical + admin, `requirePermission('viewRecords')`).
It marks an athlete as currently injured and is surfaced on the medical
dashboard. There is **no injury table, no injury history, no self-reporting and
no recovery-status tracking**.

**Resolved 2026-08-06:** the module keeps its slot but not its name. **Module 2
is now Athlete Roster & Identity Management** — athlete registration keyed by IC
number, roster maintenance and search, the event vocabulary, the ISN directory
lookup, and the surviving injury-status flag (whose purpose is cohort-norm
eligibility). All of those were already built and none had a use case; the
recast fills a real gap in the decomposition rather than papering over one.
Table 4.1 is rewritten to UC-1–47 in
[`fyp/REPORT_TABLE_4-1.md`](fyp/REPORT_TABLE_4-1.md) and the FDD figure is
regenerated. Alternatives rejected: dropping to five modules, and keeping the
old name for a single use case.

---

## Module 3 — Screening Data Ingestion 🟢

*(Was the import half of Module 4 "Data Management" before the 2026-07-20
restructure split it in two — see Module 4 below for the governance half.)*

**What it does (full vision):** Admin (and medical) staff bring athlete screening data — injury-risk indicators, headline scores, per-muscle deficiency/tension flags — into the system by importing the **HoloMotion report PDFs** Dr Thung's real workflow produces. *(The original Excel import was retired 2026-07-12 once batch import + name-match autofill made it redundant; the code is archived in [`archive/excel-upload/`](../archive/excel-upload/README.md).)*

**Current state (functional):**

*HoloMotion PDF ingestion (the sole import path):*
- ✅ [`PdfScreeningUpload`](../frontend/src/components/upload/PdfScreeningUpload.tsx) on `/admin/data-upload` + `/medical/data-upload` — **batch-capable**: drop one or many PDFs; extraction runs sequentially with 3s spacing (one vision call per file, inside free-tier rate limits)
- ✅ **On-device name redaction (privacy)** — the athlete's name is the only direct identifier printed on the report, so a local page-1 OCR pass locates it and blacks out the value **before any image reaches the vision model** ([`redactName.js`](../backend/src/utils/redactName.js)); age/gender/time and every score stay intact, and it fails **closed** (covers the top-left Information region if OCR can't pinpoint the name). See [`DESIGN_DECISIONS §18`](DESIGN_DECISIONS.md)
- ✅ **Roster attach** — since the name is redacted, the operator attaches each report to a roster athlete via a **name-search picker** ([`AthleteSearchSelect`](../frontend/src/components/ui/AthleteSearchSelect.tsx)) that fills Athlete ID / sport / programme from the roster (clearing it undoes the whole autofill); a new athlete is entered manually, sport picked from the **searchable list of ISN's 52 sports** ([`lib/sports.ts`](../frontend/src/lib/sports.ts)). The commit backfills the name server-side from the chosen ID
- ✅ The report has **no text layer** (jsPDF bakes everything in as graphics — verified pdf-parse/pdfjs extract zero text), so the backend renders the data-bearing bands to images ([`pdfRender.js`](../backend/src/utils/pdfRender.js)) and a configurable vision model reads them ([`visionClient.js`](../backend/src/utils/visionClient.js)), returning structured JSON mapped onto `Athlete` columns + `muscle_flags` ([`holomotionExtract.js`](../backend/src/utils/holomotionExtract.js))
- ✅ Two-step flow per file: `POST /api/upload/screening/pdf/preview` (render + extract, no commit) → `POST /api/upload/screening/pdf` (commit as JSON, so no second vision call). `GET /api/upload/screening/pdf/status` lets the UI self-disable when no provider is configured
- ✅ Provider-agnostic: Gemini / OpenAI / Qwen / OpenRouter / local Ollama (OpenAI-compatible) or Anthropic, by `VISION_*` env vars. See [DESIGN_DECISIONS.md §13](DESIGN_DECISIONS.md#13-excelholomotion-pdf-ingestion-vision-ai)

**Deferred / notes:**
- ✅ **Live-verified 2026-07-12** — the full pipeline was run against the sample HoloMotion PDF on Gemini's free tier (`gemini-flash-lite-latest` via the OpenAI-compatible endpoint) and reproduced the seeded ground-truth row (ATH0061) **18/18 fields** in ~5s, muscle lists included. Re-run anytime with `npm run verify:vision -- "<sample.pdf>"` from `backend/`
- Versioning / re-upload: same-`athleteId` upserts in place (latest wins); muscle flags are replaced wholesale per import

**Prototype reference:** [airms-prototype/admin/data-upload.html](../airms-prototype/admin/data-upload.html)

**Pitch line for FYP defence:** *"Module 3 ingests screening data the way ISN actually produces it — the HoloMotion report PDF. The report is image-only, so the system renders its pages and reads them with a vision model — provider-agnostic, so any OpenAI-compatible or Anthropic key works — then maps the result onto the athlete schema. It handles a whole squad's reports in one batch, redacts the athlete's name on-device before the image ever reaches the model — so the identity never leaves the machine — and every import is preview-before-commit."*

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

**What it does (current, post-2026-08-02):** Admin cohort analytics over **screening**
data, plus the PDF report generators. The injury half of this module — KPI cards,
body-part / injury-type / monthly-cases charts and the filtered injury PDF — was
removed with the `Injury` model by the HoloMotion-only cut.

> **Removed 2026-08-02:** `routes/reports.js` (`POST /api/reports/injuries-pdf`),
> `GET /api/injuries/analytics/summary` and `/analytics/trends`, the 4 injury KPI
> cards, the body-part / injury-type / monthly-cases charts, and the injury filter
> bar (body part, injury type, date range). The FDD and Table 4.1 still describe
> these — rewrite pending, see [`fyp/JC_CHECKLIST.md`](fyp/JC_CHECKLIST.md).

**Current state (functional):**
- ✅ `/admin/dashboard` is a **screening** cohort analytics page — reads
  `GET /api/athletes/analytics/screening` (band counts per indicator, averages,
  top-flagged muscles, cohort trend, band distribution), filtered by
  `sport` / `program` / `gender` / `ageMin` / `ageMax`. Sport list from
  `GET /api/athletes/meta/sports`
- ✅ `/admin/reports` picks an athlete (`GET /api/athletes`) and downloads a
  screening PDF via `api.downloadGet` — it is a download page, not a filter-driven
  generator any more
- ✅ Three cohort-normed screening PDFs stream from
  [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js) with
  `pdfkit`, no temp files: `GET /holistic.pdf` (admin),
  `GET /individual/:id.pdf`, `GET /team.pdf?sport&programme&gender`
- ✅ `/coach/reports` — sport-scoped team + individual screening PDF download for
  coaches, off `GET /api/coach/readiness`
- ✅ Excel backup export `GET /api/export/backup.xlsx` (admin) — Athletes +
  MuscleFlags sheets

**Deferred (not blocking system use):**
- **PODIUM vs PELAPIS comparison view** — backend supports both via filters; an
  explicit side-by-side page is not built

**Prototype reference:** [airms-prototype/admin/dashboard.html](../airms-prototype/admin/dashboard.html), [airms-prototype/admin/reports.html](../airms-prototype/admin/reports.html) — *both predate the screening pivot; treat as layout reference only*

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
| **Subitem Score shown** on the athlete/medical/coach dashboards (`ScreeningPanel`), the pre-import preview, and the individual PDF report. (**Posture Evaluation was removed everywhere on 2026-08-01** — extraction, model column, dashboards, preview and all reports — as it is not required by Dr Thung; `PostureList.tsx` deleted, orphan DB column drops on next seed.) | ✅ | [`SubitemTable.tsx`](../frontend/src/components/dashboard/SubitemTable.tsx), [`ScreeningPanel.tsx`](../frontend/src/components/dashboard/ScreeningPanel.tsx), [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js) |
| **PDF reports upgraded, TMG-inspired** (2026-07-29) — using JC's TMG group/individual reports as a *formatting* reference (TMG is a different instrument, so NO contraction-time/tonus data is fabricated; the changes only re-present HoloMotion data we already extract). **Individual report:** a **Key Findings** executive callout at the top (prioritised drivers behind the band), a **Lateral Symmetry** section (region · symmetry score on HoloMotion's own 85/75/60 tiers · plain-language status · weaker side, from L vs R ROM/stability), and the Interpretation now surfaces **posture deviations** (extracted but previously never interpreted) with graded symmetry. **Team report:** a **Squad Lateral Symmetry** aggregate (per-region avg symmetry, count below the good tier, weaker-side lean) and **Squad Muscle-Flag Hotspots** (most-flagged muscles by distinct athletes) — the TMG group-page analogues | ✅ | [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js) (`keyFindings`, `symmetryFindings`, `symmetrySection`, `squadSymmetryAggregate`, `squadMuscleHotspots`, `interpret`) |
| **Cohort-norm engine** — mean/SD per `(sport,programme,gender)` cohort over 4 fallback tiers (`spg→sg→s→all`); auto-computed on import | ✅ | [`utils/cohorts.js`](../backend/src/utils/cohorts.js), [`models/CohortThreshold.js`](../backend/src/models/CohortThreshold.js) |
| **Admin approval queue + tunable settings** — pending cohorts pre-filled + editable; `min_cohort_n` / `bottom_k` / escalation & alert toggles are admin settings, not hardcoded | ✅ | [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx), [`routes/cohorts.js`](../backend/src/routes/cohorts.js), [`models/Setting.js`](../backend/src/models/Setting.js), [`utils/settings.js`](../backend/src/utils/settings.js) |
| **Overall risk indicator** — Total Score of Athleticism (average of component z-scores), 0–100 display score, **escalation** band (+1 below cohort mean, +1 in cohort's bottom-`k`, **+1 per-indicator** when one exercise-risk indicator is both Elevated ≥25 *and* a peer-outlier z ≥ 1.5 → green/amber/red). Plus an **active-injury floor** (2026-07-27): a clinically significant active injury (Moderate/Severe, or any Chronic) floors the band at amber — reconnecting the Module 2 injury stream to the score, but modelled as a *floor not a stacking +1* so it never by itself creates red (keeps red anchored to the ~25% screening verdict rather than the ~36% stacking produced). Escalation **reasons persisted + shown** on the badge; per-indicator + active-injury rules are admin toggles | ✅ | [`utils/overallIndicator.js`](../backend/src/utils/overallIndicator.js), [`utils/cohorts.js`](../backend/src/utils/cohorts.js), [`OverallRiskBadge.tsx`](../frontend/src/components/dashboard/OverallRiskBadge.tsx) |
| **Clinician override** — medical staff can move an assessed athlete to green/amber/red with a required note; auto-expires on next import | ✅ | [`routes/screenings.js`](../backend/src/routes/screenings.js), medical dashboard |
| **Three cohort-normed PDF reports** — admin holistic, individual (thresholds-vs-peers + report-to-report deltas), team/group (ranking + coach attention table). Individual + team are also downloadable from the medical dashboard's selected-athlete header (individual by ID, team scoped to that athlete's sport); both are additionally downloadable by a **coach** for their assigned sport (team from the board header, individual from the athlete detail view — sport-scope enforced server-side) | ✅ | [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js), card on [`/admin/reports`](../frontend/src/app/admin/reports/page.tsx), buttons on [`/medical/dashboard`](../frontend/src/app/medical/dashboard/page.tsx) + [`/coach/dashboard`](../frontend/src/app/coach/dashboard/page.tsx) |
| **On-screen screening history + athlete self-download (2026-07-23)** — `ScreeningHistory` table (newest-first rows + "Change since first" delta row, Ex. Risks coloured lower-is-better like the PDF) on the athlete dashboard and the medical + coach detail views; its API (`GET /screenings/athlete/:id`, previously caller-less) slimmed to summary columns and sport-scoped for coaches. The athlete dashboard's copy hosts a **Download PDF** button so athletes can pull their own individual report (UC-39 actor already permitted server-side, previously had no UI path) | ✅ | [`ScreeningHistory.tsx`](../frontend/src/components/dashboard/ScreeningHistory.tsx), [`routes/screenings.js`](../backend/src/routes/screenings.js) |
| **Post-import threshold prompt** — after a screening is committed the uploader always pops a modal to update the (now-stale) cohort norms; admin can recompute in place or deep-link into the affected cohort rows on the thresholds page, medical get an informational variant (recompute is admin-only) | ✅ | [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx), [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx) |
| **Email alerts on import commit** — to medical staff + the sport's coaches when an athlete lands amber/red or escalated | ✅ | [`utils/alerts.js`](../backend/src/utils/alerts.js) |
| **Event-driven email notifications** (2026-07-30) — a clinician **override to amber/red** emails the sport's coach(es) so squad readiness reflects it (never on a green clear). Gated by the default-on `notify_override` setting; fire-and-forget + non-fatal; same mailer (env SMTP + console/dry-run fallback). Admin-governable from Cohort Thresholds → **Email Notifications** (import-alert toggle + amber/red threshold, plus the override toggle). ⚠️ **The self-report notification (`notify_self_report`) went with `routes/selfReports.js` on 2026-08-02** — `utils/notifications.js` now exports only `notifyOverrideToCoach` | ✅ | [`utils/notifications.js`](../backend/src/utils/notifications.js), [`routes/screenings.js`](../backend/src/routes/screenings.js), [`/admin/thresholds`](../frontend/src/app/admin/thresholds/page.tsx) |
| **Coach view (FYP II — first-class 4th role)** — read-only squad readiness scoped to the coach's **one** assigned sport; athletes sorted worst-first with the worst region named, **filterable by programme / gender / event**; selecting a row opens a **read-only screening detail** (risk badge + radar + ScreeningPanel + body map + events), no clinical affordances; can download the team screening PDF for the sport and (since 2026-07-23) the individual screening PDF from the detail view, both sport-scoped. **Coaching cockpit:** a *Needs-attention* list (Restricted + injured athletes, each with its persisted escalation reason), a *Squad focus* card (common weak spots + muscle hotspots + readiness-by-event + coverage + momentum), and a per-athlete **trend** arrow vs the previous screening | ✅ | [`/coach/dashboard`](../frontend/src/app/coach/dashboard/page.tsx), [`routes/coach.js`](../backend/src/routes/coach.js) |
| ~~**Recovery & Trends (admin)**~~ — recovery-status split, recurring problems, same-sport clustering | ⚠️ **REMOVED 2026-08-02** | The `/admin/trends` page and `GET /injuries/analytics/trends` were deleted with the `Injury` model by the HoloMotion-only cut. `frontend/src/app/admin/` now contains only: `dashboard`, `data-upload`, `personnel`, `profile`, `reports`, `settings`, `thresholds` |
| **Admin personnel management** — one `/admin/personnel` page creates a coach **or** a medical account, assigns/changes a coach's one sport, and manages medical per-capability permissions + activation (merged the former `/admin/coaches` + `/admin/staff` on 2026-08-01). Coaches are fully wired into the shell: a **`/coach/profile`** page and a **`/coach/reports`** page (individual/team downloads, 30-day window) | ✅ | [`/admin/personnel`](../frontend/src/app/admin/personnel/page.tsx), [`routes/users.js`](../backend/src/routes/users.js), [`/coach/reports`](../frontend/src/app/coach/reports/page.tsx) |
| **Admin screening-cohort card follows filters** — the `/admin/dashboard` HoloMotion cohort card (stat tiles, per-indicator bands, muscle hotspots) now respects the athlete-level filters (sport / programme / gender / age), like the injury charts; injury-only filters (body part / type / date) don't apply | ✅ | [`/admin/dashboard`](../frontend/src/app/admin/dashboard/page.tsx), [`routes/athletes.js`](../backend/src/routes/athletes.js) |
| **Athlete events / disciplines** — `athlete_disciplines` join table (an athlete can hold several events, e.g. badminton Men's Singles + Men's Doubles). Set on the PDF-import identity step via a **combobox**: pick an event already on record (autocomplete from `GET /athletes/meta/disciplines`) **or type a new one**, for any sport; badminton's 5 ship as seed suggestions. Shown as chips on the medical + coach athlete views and **editable on the medical athlete header** (same combobox, PATCH `/athletes/:id`, no re-import); roster event filters are data-driven (list the events actually present), so admin-added events are immediately filterable. Seed suggestions ship for badminton + tennis + table tennis + squash | ✅ | [`models/AthleteDiscipline.js`](../backend/src/models/AthleteDiscipline.js), [`lib/disciplines.ts`](../frontend/src/lib/disciplines.ts), [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx), [`routes/athletes.js`](../backend/src/routes/athletes.js) |
| **ACWR removal from dashboards** (2026-07-16; supersedes the 07-13 "demotion") — no user-facing surface shows ACWR/workload anymore; the composite model (`risk.ts`) is **not deleted**, logic preserved for identical rebuild. **2026-07-20:** Activity Tracking's sRPE logging (the model's only training-load input) removed entirely, along with the recovery-baseline trigger and prevention insight that consumed it, and the six-module set was restructured to fill the resulting gap — `risk.ts` now has no live callers | ✅ | dashboards, [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md) |
| **Batch upload + on-device name redaction + roster-search attach + 52-sport search + editable identity.** PDFs **auto-extract on drop** (no manual "read" step; a *Retry failed* button re-queues errors). The athlete's name is redacted on-device before extraction ([`redactName.js`](../backend/src/utils/redactName.js)); the operator attaches each report to a roster athlete via the [`AthleteSearchSelect`](../frontend/src/components/ui/AthleteSearchSelect.tsx) name picker. Pre-import **preview read-out** ([`ScreeningPreview.tsx`](../frontend/src/components/upload/ScreeningPreview.tsx)): headline scores with tier/band, exercise-risk evaluation as banded bars (Low/Watch/Elevated), the HoloMotion subitem table (tier colours), and the full **muscle hero** (BodyMap) — the data column scrolls to fit beside the edit form. Events picked via the in-UI [`TagCombobox`](../frontend/src/components/ui/TagCombobox.tsx) (styled dropdown, not native datalist) | ✅ | [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx) |

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

- **Module 2 (Athlete Roster & Identity Management):** "Yes — the roster is the system's master data: athletes are registered against their IC number, which is the identifier ISN itself uses, so records reconcile directly against the institute's own directory. That directory is integrated behind a swappable seam and demonstrated against a stand-in, since access hasn't been granted yet. Roster search, the admin-extensible event vocabulary and the clinician's injury-status flag live here too — that flag is what excludes an injured athlete from shaping the cohort norms their peers are judged against." *(If asked why the module was renamed: it was Injury & Recovery Logging until 2026-08-02, when the HoloMotion-only direction removed the parallel manual injury stream. The master-data capabilities were always built but had never been enumerated as a module; removing the injury stream made that omission visible.)*
- **Module 3 (Screening Data Ingestion):** "Yes — HoloMotion PDF ingestion end-to-end, preview-before-commit: render → vision-AI extraction → confirm. It matches Dr Thung's real workflow, handles a whole squad's reports in one batch, auto-matches athletes by the printed name, and reads the muscle lists straight off the report. The old Excel import was deliberately retired once this made it redundant (code archived)."
- **Module 4 (Cohort Norms & Governance):** "Yes — every commit recomputes cohort norms and re-scores athletes, amber/red imports email medical staff and the sport's coaches, and the admin governs the norm-approval queue and every tunable setting (min cohort size, bottom-k, escalation, alerts). The Excel backup export and screening cohort analytics live here too."
- **Module 5 (Analytics & Reporting):** "Yes — the admin analytics dashboard reads the screening cohort: coverage, band share per risk indicator, cohort averages, muscle hotspots and the previous-vs-latest trend, filtered by sport, programme, gender and age. Three cohort-normed PDFs stream server-side via `pdfkit` — holistic, individual and team — and coaches can download the two that are scoped to their sport. The injury analytics half was removed on 2026-08-02 with the injury model; the deferred item is an explicit PODIUM-vs-PELAPIS comparison view."
- **Module 6 (Clinical & Squad Monitoring):** "Yes — search the roster, select an athlete, and you see the same overall-risk indicator hero, screening panel, risk radar and body map that athlete sees on their own dashboard, plus the clinician's affordances: the band override with a required note and calculated-vs-in-force provenance, the injury-status control, and a screening-date picker that replays any past assessment. The coach gets the read-only sport-scoped version — squad readiness worst-first, needs-attention with reasons, squad focus, and a per-athlete trend. The prevention-insight card and recovery baseline were retired 2026-07-20 alongside Activity Tracking (their only training-load input); the watchlist and team-summary KPI cards are deferred."

The umbrella message: *"All six FDD modules are functional. Activity Tracking (originally Module 1) was deliberately removed 2026-07-20 once its ACWR/composite-risk display had already left every dashboard — the module set was then restructured to stay at six by splitting the old Data Management module into Screening Data Ingestion and Cohort Norms & Governance. The remaining work on Modules 2–6 is either external (Dr Thung's schema lock) or deferred polish (PDF renderer, watchlist) — none of it gates the system from being used today."*

---

*Last updated: 2026-08-06 (later same day) — **Module 2 recast as Athlete Roster & Identity Management**, ratified by JC; Table 4.1 rewritten to UC-1–47 and all five report diagrams regenerated (see `fyp/REPORT_TABLE_4-1.md`). Earlier 2026-08-06: quick-status table corrected against the live routes; Module 5 is screening-derived only; Modules 3–6 gained their new pages). Module 1 section updated for the 22-muscle body map, the shared radar axes, and the new history + squad pages. The A–F roadmap batch and the 2026-08-06 consolidation pass summarised in the header. Previous: 2026-08-02 — **HoloMotion-only cut**: `Injury` + `SelfReport` models, their routes/pages, the injury analytics and `/admin/trends` all removed. Previous: 2026-07-20. **Module restructure**: Activity Tracking (Module 1) fully removed; the surviving six-module set redistributed as Module 1 — Athlete Dashboard & Overall Risk Indicator, Module 2 — Injury & Recovery Logging, Module 3 — Screening Data Ingestion, Module 4 — Cohort Norms & Governance, Module 5 — Analytics & Reporting, Module 6 — Clinical & Squad Monitoring. Full mapping: `docs/fyp/FYP2_MODULES_USECASES.md` Appendix A/B. Previous: 2026-07-14 — **FYP II — Screening-Centred Redesign** (see the dedicated section above): cohort-normed overall risk indicator (TSA z-score + escalation) is now the primary risk signal; immutable screening snapshots + history; admin-approved cohort norms + tunable settings; clinician override; three cohort-normed PDF reports; import-commit email alerts; coach role (promoted to a first-class 4th role 2026-07-19); ACWR demoted to a secondary Training-Load view. Perf pass on the cohort/indicator recompute paths (preload-into-Map + batched writes, no N+1). Earlier: 2026-07-06 — screening pages (then Modules 2 & 6, now Modules 1 & 6) folded into the dashboards as the shared `ScreeningPanel`; HoloMotion-only seed with ATH0061 (Thung Jin Seng) as pipeline ground truth; General Module revoked staff features vanish (sidebar hide + redirect + live session refresh); five-step pro-team injury intake (then Module 3, now Module 2); screening-cohort analytics (then Module 5, now Module 4). 2026-06-28 (HoloMotion ingestion + backup, then Module 4, now split across Modules 3–4; per-user permissions).*
