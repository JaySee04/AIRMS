# AIRMS — Modules Status

> Authoritative status + spec for all 6 modules from JC's FDD. **Read this after `MASTER_CLARIFICATIONS.md`** to know what's done, what's pending, and what each pending module should look like when built.

---

## Quick status table

| # | Module | Role | Status | Pages | Backend route(s) |
|---|---|---|---|---|---|
| 1 | Activity Tracking & Logging | athlete | ✅ **fully complete** | `/athlete/activity` | `/api/activities` |
| 2 | Athlete Dashboard / Workload | athlete | ✅ **fully complete** | `/athlete/dashboard` | `/api/athletes/:id`, `/api/activities/athlete/:id`, `/api/injuries/athlete/:id` |
| 3 | Injury & Recovery Logging | medical (+ athlete self-report) | 🟢 **functional, deferred polish** | `/medical/injury-log`, `/medical/review-reports`, `/athlete/injury-report` | `/api/injuries`, `/api/self-reports` |
| 4 | Data Management | admin | 🟡 **infrastructure complete, awaits ISN format lock** | `/admin/data-upload`, `/medical/data-upload` | `/api/upload/screening/preview`, `/api/upload/screening` |
| 5 | Injury Analytics | admin | ✅ **fully complete** | `/admin/dashboard`, `/admin/reports` | `/api/injuries/analytics/summary`, `/api/injuries`, `/api/reports/injuries-pdf` |
| 6 | Medical Dashboard | medical | 🟢 **functional, watchlist deferred** | `/medical/dashboard` | `/api/athletes`, `/api/athletes/:id` |

**Legend:**
- ✅ Fully complete — meets all FYP rubric requirements; no known gaps
- 🟢 Functional — system clicks through end-to-end; one or two minor refinements deferred
- 🟡 Infrastructure complete — full pipeline works; one external dependency unresolved

Modules 1+2 are the FYP showcases requiring no further iteration. Modules 3–6 are now functional enough for the system to be used end-to-end across all three roles, with each known gap explicitly tied to either an external dependency (Module 4 → ISN canonical schema) or a deferred polish item (Module 3 recovery milestones, Module 5 server-side PDF, Module 6 watchlist).

---

## Module 1 — Activity Tracking & Logging ✅

**What it does:** Athletes log training sessions; system computes session load via sRPE; displays history with filter and delete.

**Page:** [frontend/src/app/athlete/activity/page.tsx](../frontend/src/app/athlete/activity/page.tsx)

**Backend routes:**
- `POST /api/activities` — log a session
- `GET /api/activities/athlete/:id` — fetch history
- `DELETE /api/activities/:id` — remove a session
- `GET /api/activities/athlete/:id/acwr` — compute ACWR for athlete

**User flow:** see [USER_MANUAL.md §3](USER_MANUAL.md#3-activity-tracking)

**Why it's "complete":**
- Form validates all fields (type, date, duration 10–240, intensity 1–10)
- Live load preview with qualitative band ("Light / Moderate / High / Very High")
- History table with type filter and delete with confirm
- Error and success states surfaced inline
- ACWR feeds Module 2 dashboard via the shared backend route

**FYP defensibility hook:** This module is the canonical demonstration of the **sRPE method** (Foster et al., 2001). The live load preview teaches the formula to the user. See [DESIGN_DECISIONS.md §1](DESIGN_DECISIONS.md#1-srpe-for-internal-load).

---

## Module 2 — Athlete Dashboard / Workload ✅

**What it does:** Shows the athlete their current injury-risk picture: composite risk hero, workload stats, workload trend chart, risk indicator radar, muscle assessment body map, recent activity, injury records.

**Page:** [frontend/src/app/athlete/dashboard/page.tsx](../frontend/src/app/athlete/dashboard/page.tsx)

**Sub-components:**
- [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx) — front+back silhouette with flagged regions
- [WorkloadChart.tsx](../frontend/src/components/dashboard/WorkloadChart.tsx) — bar+line dual-axis chart
- [RiskRadar.tsx](../frontend/src/components/dashboard/RiskRadar.tsx) — 8-axis risk radar
- [risk.ts](../frontend/src/lib/risk.ts) — composite risk model logic

**User flow:** see [USER_MANUAL.md §4](USER_MANUAL.md#4-athlete-dashboard)

**Why it's "complete":**
- Composite risk hero shows personalised threshold band (e.g. "0.77 – 1.39" for John Doe)
- Escalation badge and modifier chips appear when active injuries or muscle flags trigger
- Sharp-dip detection prompts athlete to add a note linking to injury reporting
- 8-week workload trend with ACWR overlay
- 8-indicator radar from screening data
- Body map shows muscle flags aggregated by region; flag cards below preserve per-muscle granularity; only ISN-scoped regions are interactive
- Recent activity table + tabbed injury records (Active / All History)

**FYP defensibility hook:** The **composite risk model** is the FYP innovation. It integrates workload + biomechanical screening + injury history into one classification, instead of the textbook Gabbett ACWR bands. See [DESIGN_DECISIONS.md §2](DESIGN_DECISIONS.md#2-composite-risk-model).

---

## Module 3 — Injury & Recovery Logging 🟢

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

## Module 4 — Data Management (CSV upload) 🟡

**What it does (full vision):** Admin (and medical) staff upload the ISN screening Excel file containing athlete biometrics, injury risk indicators, and per-muscle deficiency/tension flags. System validates against schema, shows preview with row-by-row errors, commits on confirm.

**Current state (infrastructure complete, awaits ISN format lock):**
- ✅ Upload page at `/admin/data-upload` and `/medical/data-upload`, both wrapping the shared [`ScreeningUpload`](../frontend/src/components/upload/ScreeningUpload.tsx) component
- ✅ Drag-drop and click-to-browse file picker with name + size feedback
- ✅ Backend `POST /api/upload/screening/preview` parses + validates the workbook (column-name tolerant), returns row-by-row preview with `action: create|update` and per-row error list. Does NOT commit
- ✅ Frontend shows preview table with row counts, valid/invalid breakdown, and red highlight on rows with errors
- ✅ Backend `POST /api/upload/screening` performs the actual upsert with the same normalisation + validation logic. Frontend prompts confirm when committing with any invalid rows
- ✅ Validation enforces required fields (Athlete ID, Name, Sport) and known enums (Gender, Program)

**Awaiting ISN input (the one external dependency):**
- **Canonical column structure** — Dr Thung has not yet finalised the column order, exact field names, or how muscle deficiency/tension flags will be laid out. The sample we have ([docs/data-samples/isn-csv-template.xlsx](data-samples/isn-csv-template.xlsx)) is one row (John Doe). We need 2–3 real screening sessions across different athletes before we can lock the parser's muscle-flag column handling
- **Date column format expectation** — currently any ISO-parseable string; ISN may use DD/MM/YYYY
- **Versioning / re-upload semantics** — currently same-`athleteId` uploads update in place (latest wins). If ISN wants history, we'd add a `screeningHistory` sub-document

**Prototype reference:** [airms-prototype/admin/data-upload.html](../airms-prototype/admin/data-upload.html)

**Pitch line for FYP defence (re: ISN dependency):** *"The infrastructure is complete — upload, parse, validate, preview, confirm-commit, upsert. Module 4 doesn't depend on ISN to function; only the muscle-flag column expansion is gated on Dr Thung delivering 2–3 confirmed screening exports so we can lock that part of the schema. Building it against a draft sample would create technical debt the moment the real format arrives."*

---

## Module 5 — Injury Analytics ✅

**What it does (full vision):** Admin dashboard with filterable injury KPIs and breakdown charts: total cases, athletes affected, currently recovering, sports affected, distribution by body part / injury type / severity / month. Backed by a PDF report generator for ISN management.

**Current state (functional):**
- ✅ Page at `/admin/dashboard` renders the filter bar — sport, gender, programme, body part, injury type, **age group**, date range — all POST through to the backend
- ✅ Backend `GET /api/injuries/analytics/summary` extended to accept all 8 filter params including `ageMin`/`ageMax` (driven from age-group dropdown) for Dr Thung's "by age group" ask
- ✅ **Body region chip row** above the filter strip (Upper body / Trunk / Lower body) — quick slicer that complements the body-part dropdown, addressing Dr Thung's "by region (upper/lower)" preference
- ✅ 4 KPI cards (Total Cases / Athletes Affected / Currently Recovering / Sports Affected) re-fetch live on filter change
- ✅ Body part distribution bar chart (Chart.js, navy) — uses canonical ordering, fills missing categories with 0; honours body-region chip filtering
- ✅ Injury type distribution bar chart (Chart.js, gold) — same pattern
- ✅ Monthly cases line chart — Chart.js, smooth curve, fed by Mongo aggregation by year+month
- ✅ "Generate PDF Report" button navigates to `/admin/reports`
- ✅ `/admin/reports` page is a **live PDF generator**: the same filter inputs as the analytics dashboard (report type, period, sport, programme, gender, body part, injury type, age group, plus section toggles for severity/recovery, monthly trend, athlete index). Submitting POSTs to `/api/reports/injuries-pdf` and streams a fresh PDF straight to the browser as a download. Server-side rendering via `pdfkit`
- ✅ Backend `POST /api/reports/injuries-pdf` (admin only) reads the live `Injury` collection against the filters and assembles a multi-page PDF: cover with AIRMS branding, executive summary table, body-part distribution chart, injury-type distribution chart, optional severity + recovery breakdowns, optional monthly trend, optional athlete index (paginated), appendix with filter context. Page numbers in the footer

**Deferred (not blocking system use):**
- **Severity × time heatmap** — designed in prototype, not yet built
- **PODIUM vs PELAPIS comparison view** — backend supports both via filters; explicit side-by-side comparison page is not built

**Prototype reference:** [airms-prototype/admin/dashboard.html](../airms-prototype/admin/dashboard.html), [airms-prototype/admin/reports.html](../airms-prototype/admin/reports.html)

---

## Module 6 — Medical Dashboard 🟢

**What it does (full vision):** Medical staff's home page. Search/filter athletes, click into a per-athlete view that mirrors the athlete's own dashboard but adds "+ Log Injury" affordance and clinical metadata. This is essentially **the athlete dashboard, viewed by a clinician**.

**Current state (functional):**
- ✅ Page at `/medical/dashboard` loads the roster from `GET /api/athletes`
- ✅ Search bar (name + ID), Sport filter dropdown (populated from `GET /api/athletes/meta/sports`), Programme filter dropdown (auto-derived from roster)
- ✅ Athlete card grid with avatar + name + sport/programme + ID; click selects (active card has gold border)
- ✅ On selection, fetches the full athlete record + activities + injuries in parallel
- ✅ Renders the **same composite risk hero** as Module 2 — fully reuses [`classifyCompositeRisk`](../frontend/src/lib/risk.ts), so the medical view shows identical thresholds, escalation badges, and risk modifier chips
- ✅ Profile summary card with key biometrics + screening scores (Overall Activity, Mobility, Stability, Symmetry, Injury Risk Index)
- ✅ "+ Log Injury" button deep-links to `/medical/injury-log?athleteId=ATH0001` (auto-fills the athlete picker)
- ✅ Reuses [`WorkloadChart`](../frontend/src/components/dashboard/WorkloadChart.tsx), [`RiskRadar`](../frontend/src/components/dashboard/RiskRadar.tsx), and [`BodyMap`](../frontend/src/components/dashboard/BodyMap.tsx) from Module 2 verbatim
- ✅ **Prevention insight card** — addresses Dr Thung's hard requirement *"this spot, what are the prominent kind of injury and when going to happen? So you can also give them a good advice."* Cross-references composite risk + elevated risk indicators (>15) + muscle flags + prior injuries (last 12 months) into a ranked "watch points" list plus recommended actions. Implementation: `buildPreventionInsight()` in [medical/dashboard/page.tsx](../frontend/src/app/medical/dashboard/page.tsx) using `MUSCLE_REGION` + `RISK_REGION` mappings
- ✅ Full injury history list at the bottom with severity-coloured status badges

**Deferred (not blocking system use):**
- **Watchlist / starred athletes** — designed in prototype, not built
- **Team-level summary card** ("5 athletes high-risk, 3 with active injuries") — not built
- **Direct screening edit** — medical reads screening data; editing is via Module 4 re-upload only

**Prototype reference:** [airms-prototype/medical/dashboard.html](../airms-prototype/medical/dashboard.html)

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
| Two distinct dashboards — admin (holistic) + medical (individual) | Module 5 (`/admin/dashboard`) + Module 6 (`/medical/dashboard`) |
| Admin: cohort summary with filters/slicers (sport, gender, **age group**) | Filter bar + body region chips on `/admin/dashboard` |
| Admin: body region breakdown (upper/lower, left/right) | Body region chips + side stored on every `Injury` (Left / Right / Both / N/A) |
| Admin: time-series trend (year-to-year, quarter-to-quarter) | "Cases Over Time" monthly line chart |
| Medical: per-athlete history "trace through" view | `/medical/dashboard` injury list + workload trend + body map |
| Medical: surface prominent likely injuries + prevention advice | **Prevention insight card** on `/medical/dashboard` |
| Easy upload pipeline auto-populating dashboards | Module 4 preview + commit → all analytics auto re-fetch |
| Cover all sports, not just swimming | Sport is a free-form field; seeded across multiple sports |
| Standard / automatic PDF report generation | `/admin/reports` builder + structural preview (server-side render deferred) |

Anything blocked or out-of-scope (NDA, force-plate data, multi-year continuation, ISN local hosting, semester-break stipend, KeYing module deployment) is operational, not a code gap.

---

## Demo-defensibility cheat sheet (for FYP viva)

Worst-case question: *"Are modules 3–6 working?"*

Best answer per module:

- **Module 3:** "Yes — athletes submit self-reports, medical reviews them, approved reports promote to the official injury record, medical logs injuries directly. End-to-end. Recovery milestone tracking is deferred because Dr Thung has not specified the standardised recovery phase schema yet."
- **Module 4:** "Yes — file drop, parse, validate, row-by-row preview with errors, confirm-and-commit, with create/update detection. The only ISN-gated piece is the muscle-flag column expansion, which needs 2–3 confirmed screening exports to lock."
- **Module 5:** "Yes — 7-filter live analytics dashboard with KPI cards, body part + injury type distribution charts, and monthly trend. Report builder fully captures configuration with a structural preview. The only thing missing is server-side PDF rendering, which is ~half a day."
- **Module 6:** "Yes — search/filter the athlete roster, select an athlete, and you see the same composite-risk hero, workload chart, risk radar, body map, and injury history as that athlete sees on their own dashboard, plus a deep-linked '+ Log Injury' button. The watchlist and team-summary KPI cards are deferred."

The umbrella message: *"All six modules are functional. The remaining work on Modules 3–6 is either external (Dr Thung's schema lock) or deferred polish (PDF renderer, watchlist) — none of it gates the system from being used today."*

---

*Last updated: 2026-05-25. Module statuses unchanged since 2026-05-18 (live PDF generation via pdfkit on Module 5; functional Medical + Admin profile pages). Recent: report + slides drafts (2026-05-25) close the pre-viva rubric gaps — see `docs/FYP_RUBRICS.md` §5.*
