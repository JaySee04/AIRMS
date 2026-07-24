# AIRMS — Modules & Use Cases (As Built, FYP II)

> **Status: restructured 2026-07-20.** Original draft (2026-07-16) had six
> functional modules; Module 1 (Activity Tracking & Logging) was fully
> removed that day, with the fallout accepted (see `MASTER_CLARIFICATIONS.md
> §4`). Rather than leave a hole at "Module 1" or drop to a 5-module system,
> JC asked to **redistribute the surviving feature set across a fresh set of
> six modules**. This file is that redistribution: six functional modules
> plus the cross-cutting General module, every use case tied to the role(s)
> that perform it, clean sequential numbering (UC-1–44, no gaps). Follows the
> exact format of FYP I Table 4.1 (Module · UC · Title · Description · User
> Role) so it can replace that table in the report rewrite.
>
> **What changed in the restructure:** the old "Screening Data Management &
> Cohort Norms" module (10 UCs — the largest) is split into two coherent
> modules: **Screening Data Ingestion** (the import/extract/preview/match/
> commit pipeline) and **Cohort Norms & Governance** (recompute, alerts,
> threshold approval, settings, backup, plus the cohort-coverage analytics
> view moved in from the old Analytics module, since it's really cohort
> reporting, not injury reporting). Every other module keeps its original
> shape and UC set, just renumbered to close the gaps left by the 8 removed
> use cases (5 from Module 1 itself, plus the sharp-drop prompt, prevention
> insight, and recovery baseline — all downstream consumers of Activity
> Tracking's data that had nothing left to read once it was gone).
>
> Appendix A maps every FYP I use case (UC-1–36, the "ACWR days") to its FYP
> II disposition. Appendix B maps the **interim 2026-07-16 numbering**
> (UC-1–52, the version some earlier report drafts and diagrams may still
> cite) to this file's final numbering, so nothing silently orphans a
> cross-reference.
>
> Every use case below was verified against the running system on 2026-07-16;
> the 2026-07-20 changes are removals and renumbering only, not new
> functionality — nothing here is aspirational. Companion docs:
> [`FYP2_SIX_MODULES.md`](FYP2_SIX_MODULES.md) (module narratives),
> [`FYP2_REDESIGN_SPEC.md`](FYP2_REDESIGN_SPEC.md) (design rationale),
> [`../USER_MANUAL.md`](../USER_MANUAL.md) (walkthroughs).

**Roles:** Athlete · Medical Staff · Administrator · Coach *(first-class 4th
role, promoted in FYP II — read-only, sport-scoped; FYP I shipped the first three)* ·
System *(automated behaviour, no human actor — same convention as FYP I)*.

---

## Functional decomposition (overview)

| # | Module | One-line charter | Primary roles | UCs |
|---|---|---|---|---|
| G | **General** | Authentication, account security, and role/permission enforcement for every other module | All + System | UC-1–7 |
| 1 | **Athlete Dashboard & Overall Risk Indicator** | The athlete's single risk verdict: the cohort-normed screening indicator, with the full screening picture behind it | Athlete + System | UC-8–16 |
| 2 | **Injury & Recovery Logging** | Official injury records, recovery tracking, and the athlete self-report → clinical review pipeline | Medical, Athlete | UC-17–22 |
| 3 | **Screening Data Ingestion** | HoloMotion PDF batch upload, vision-AI extraction, human-verified commit into an immutable history | Admin, Medical + System | UC-23–27 |
| 4 | **Cohort Norms & Governance** | The norm engine behind the indicator: recompute, threshold approval, tunable settings, import-commit alerts, cohort-coverage analytics, and data backup | Admin + System | UC-28–33 |
| 5 | **Analytics & Reporting** | Organisation-wide injury analytics and all three PDF report generators | Admin | UC-34–39 |
| 6 | **Clinical & Squad Monitoring** | The clinician's per-athlete working view (with override authority) and the coach's squad readiness board | Medical, Coach | UC-40–44 |

---

## General Module

Cross-cutting authentication and access control. Not counted among the six
functional modules (same convention as FYP I).

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-1 | Login | Sign in with email + password; the server issues a JWT (bearer token) and the client redirects to the role's landing page. The error message never reveals whether the email or the password was wrong | Athlete, Medical Staff, Administrator, Coach |
| UC-2 | Reset Password via Email OTP | Three-step, single-tab flow: request a 6-digit code by email (10-minute TTL, hash-at-rest) → verify it (invalidated after 5 wrong attempts) → set a new policy-compliant password via a short-lived verification token | Athlete, Medical Staff, Administrator, Coach |
| UC-3 | Change Password | Rotate the password in place from the profile page, without leaving the app; same complexity policy as the reset flow (10+ chars, mixed case, digit, symbol) | Athlete, Medical Staff, Administrator |
| UC-4 | View Profile | View the personal profile (athletes additionally see sport, programme, age and screening biometrics from their athlete record). Identity fields are maintained via Module 3 import / the admin, not self-service | Athlete, Medical Staff, Administrator |
| UC-5 | Enforce Role-Based Access Control | Restrict every route and page to its allowed roles — `rbac()` middleware on the server (the actual security boundary), mirrored by client-side layout gating | System |
| UC-6 | Manage Staff Permissions & Activation | Grant/revoke individual capabilities per medical staffer (view records, upload data, review self-reports, log injuries — opt-out model) and activate/deactivate accounts entirely | Administrator |
| UC-7 | Enforce Per-User Permissions | Block revoked capabilities server-side on every call; client-side the feature vanishes (sidebar link hidden, direct URL redirected) and takes effect on the staffer's next navigation without re-login | System |

## Module 1 — Athlete Dashboard & Overall Risk Indicator

The FYP differentiator surface. One verdict — the cohort-normed indicator —
with every screening detail arranged *behind* it, not beside it. (Was Module
2 before the 2026-07-20 restructure closed the gap left by Activity
Tracking's removal.)

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-8 | Compute Overall Risk Indicator | z-score the athlete's six oriented screening components (Total Score, ROM, Stability, Symmetry, inverted risk burden over the 7 shown indicators, L/R balance from the subitems) against their **approved cohort** (sport × programme × gender, falling back sport+gender → sport → all until the admin's minimum size is met), average them with equal weight (Total Score of Athleticism method), and map to 0–100 where 50 = the cohort average | System |
| UC-9 | Escalate Risk Band | Band by escalation: +1 if below the cohort average; +1 if among the cohort's worst performers — bottom-`k`, where `k` is the admin's setting capped at 20% of the cohort so it means the same thing at every squad size. 0/1/2 escalations → Safe / Needs attention / Immediate assessment; ranking is against the cohort's full membership | System |
| UC-10 | View Overall Risk Indicator | The dashboard hero: band in large type with a plain-English meaning, the 0–100 indicator, and a "why" chip stating which escalation rules fired (or the clinician's override note when one is in force) | Athlete |
| UC-11 | View Regions Behind the Band | Only when the band is amber/red: the out-of-range regions with Watch/Elevated chips, sport-critical regions starred — the explanation of the verdict, not a second verdict | Athlete |
| UC-12 | View Risk Indicator Radar | 7-axis radar of the shown exercise-risk indicators (Lumbar Disc Herniation is stored but never displayed, per the stakeholder) | Athlete |
| UC-13 | View HoloMotion Screening Panel | The latest report read against thresholds: five tier-ticked score gauges (60/75/85 boundaries) and seven indicator strips on the unified bands (Low ≤15 · Watch 16–25 · Elevated >25), tightened to 12/20 for the athlete's sport-critical regions | Athlete |
| UC-14 | View Training Focus | Corrective-exercise blocks (reps × sets · rest) for up to three most-pressing out-of-range regions, drawn from the HoloMotion prescription vocabulary; informational — medical staff remain the authority | Athlete |
| UC-15 | View Muscle Assessment Map | Front + back body silhouette with flagged regions, plus per-muscle myodynamia-deficiency and tension cards with sides | Athlete |
| UC-16 | Review Injury Records | Injury records in Active / All History tabs, with recovery-status badges | Athlete |

## Module 2 — Injury & Recovery Logging

(Was Module 3.)

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-17 | Log Official Injury | Record an injury against an athlete through the five-step pro-team intake: athlete context on selection, recurrence detection, body part/side/type/mechanism from locked enums, time-loss-anchored severity, clinical notes | Medical Staff |
| UC-18 | Update Recovery Status | Progress a logged injury through Recovering / Recovered / Chronic | Medical Staff |
| UC-19 | View Athlete Injury Records | Full chronological injury history per athlete, filterable list across athletes | Medical Staff, Administrator |
| UC-20 | Submit Self-Reported Injury | Athlete files a report (body part, side, suspected type, severity, onset, description) that lands in Pending awaiting clinical review | Athlete |
| UC-21 | Review Self-Report | Approve — which promotes the report into an official injury record in a single transaction — or reject, with a reviewer note either way | Medical Staff |
| UC-22 | Track Self-Report Status | Athlete sees each submission's status (Pending / Approved / Rejected) and any reviewer note | Athlete |

## Module 3 — Screening Data Ingestion

The **sole** screening import path (HoloMotion PDF; the Excel import was
retired 2026-07-12) — batch upload through to the immutable history commit.
(Was the first half of the old Module 4, "Screening Data Management &
Cohort Norms," before the 2026-07-20 restructure split it in two.)

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-23 | Import HoloMotion PDFs (Batch) | Drop one or many report PDFs; extraction runs sequentially per file with progress per row | Administrator, Medical Staff |
| UC-24 | Extract Screening Data (Vision AI) | Render the report's leading pages to images (it has no text layer) and read them with a configurable vision model into strict JSON: headline scores, all 8 risk indicators (incl. stored-only LDH), the 25 physical-fitness subitem scores, posture findings, the summary text and both muscle lists. Provider-agnostic (OpenAI-compatible or Anthropic, by env) | System |
| UC-25 | Preview & Verify Extraction | Review every extracted value against the source before anything is written; LDH is deliberately visible **here only**, so the operator can confirm the read | Administrator, Medical Staff |
| UC-26 | Match Athlete & Complete Identity | Unambiguous name match against the roster auto-fills Athlete ID / sport / programme; the operator can correct Name (auto Title-Cased), Age and Gender, pick from the searchable 52-sport ISN list, and set the programme for new athletes | System, Administrator, Medical Staff |
| UC-27 | Commit Import | Write the athlete's latest values, replace their muscle flags wholesale (idempotent re-import), and append an **immutable screening snapshot** to the history that powers progress deltas and cohort norms | Administrator, Medical Staff |

## Module 4 — Cohort Norms & Governance

The norm engine that every risk indicator is measured against, and its
admin controls. (Was the second half of the old Module 4, plus "View
Screening Cohort Analytics" moved in from the old Analytics & Reporting
module — cohort coverage is governance of the norm engine, not injury
reporting, so it belongs here.)

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-28 | Recompute Cohort Norms & Re-score | After each commit burst (debounced — a batch coalesces into one pass) recompute every cohort's per-component mean/SD and re-score every athlete's indicator | System |
| UC-29 | Email Risk Alerts | When a committed import leaves an athlete at amber/red, email the medical staff and the coaches assigned to that athlete's sport so the finding is assessed rather than left sitting | System |
| UC-30 | Manage Cohort Thresholds | Approval queue of auto-computed cohorts: approve, edit the per-component means (pre-filled), revert to pending, or recompute all on demand; only **approved** cohorts drive the indicator | Administrator |
| UC-31 | Tune Norming & Alert Settings | Adjust minimum cohort size, bottom-k, the two escalation toggles, fallback, and alert behaviour — the knobs the indicator and alerting run on | Administrator |
| UC-32 | Export Data Backup | Download a multi-sheet Excel snapshot of athletes, injuries and muscle flags at any time | Administrator |
| UC-33 | View Screening Cohort Analytics | HoloMotion population view: screened coverage, band share per shown indicator on the unified Low/Watch/Elevated bands, average scores, most-flagged muscles | Administrator |

## Module 5 — Analytics & Reporting

(Was Module 5; loses "View Screening Cohort Analytics" to Module 4 above,
keeps everything else.)

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-34 | View Injury Overview (KPIs) | Live KPI cards (total cases, athletes affected, currently recovering, sports affected) with distribution charts by body part and injury type | Administrator |
| UC-35 | Filter Injury Analytics | Slice everything by sport, gender, programme, body part, injury type, age group and date range; active filters carry into the PDF builder | Administrator |
| UC-36 | View Temporal Trends | Cases-over-time line with monthly/quarterly views to spot peak-risk periods | Administrator |
| UC-37 | Generate Injury PDF Report | Server-rendered multi-page injury report from the live data against the chosen filters (cover, executive summary, distributions, optional severity/recovery/trend/athlete-index sections) | Administrator |
| UC-38 | Generate Holistic Screening PDF | Organisation-wide screening report for non-experts: coverage, risk-band distribution, population averages, exercise-risk hotspots, bands by sport, flagged-athlete list | Administrator |
| UC-39 | Generate Individual & Team Screening PDFs | **Individual**: one athlete's scores vs cohort, Exercise Risk Evaluation (zone gauges + radar), subitem score table on HoloMotion tier colours, muscle flags, data-driven interpretation, and progress deltas across their screening history. **Team**: one group's thresholds, ranking, attention table and per-athlete snapshots. Modelled on the TMG report format | Administrator, Medical Staff (Individual: also Athlete, own report only) |

## Module 6 — Clinical & Squad Monitoring

(Was Module 6; loses the prevention-insight and recovery-baseline use cases,
which were removed 2026-07-20 along with their only data source.)

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-40 | Search & Filter Athlete Roster | Find athletes by name/ID with sport and programme filters; card grid selection | Medical Staff |
| UC-41 | View Athlete Clinical Overview | The selected athlete's full picture — the same indicator hero, radar, screening panel and body map the athlete sees, plus profile summary, chronological injury history, and a deep-linked "+ Log Injury" that pre-fills the intake | Medical Staff |
| UC-42 | Override Risk Band | After an actual assessment, set the athlete's band (green/amber/red) with a **required note**; the override wins on every surface until the next import, and can be cleared | Medical Staff |
| UC-43 | View Sport-Level Context | The athlete's sport's injury statistics (total cases, athletes affected) beside the individual view, so the clinician reads the athlete against their sport's pattern | Medical Staff |
| UC-44 | View Squad Readiness | Read-only board scoped to the coach's assigned sports: every athlete's indicator and band mapped to Full-Go / Observation / Restricted (the same band the medical team sees), sorted worst-first, with each athlete's worst screening region named and active-injury counts | Coach *(experimental)* |

---

## Appendix A — FYP I (ACWR-era) use cases → FYP II disposition

Every use case from FYP I Table 4.1, and where it went. **Kept** = same
behaviour (possibly renumbered) · **Changed** = same job, different mechanism ·
**Replaced** = job now done by a different design · **Removed** = no longer in
the system (with the reason). Numbers below are this file's **final**
numbering (post 2026-07-20 restructure) — see Appendix B if you're holding a
report draft or diagram cited against the interim 2026-07-16 numbers.

| FYP I | Title | Disposition |
|---|---|---|
| UC-1 | Register Account | **Removed.** No self-registration: accounts are provisioned (an elite-institute roster is closed; the FYP I report already flagged this as stale) |
| UC-2 | Login (cookies) | **Changed → UC-1.** JWT bearer token, not cookie sessions |
| UC-3 | Reset Password (token link) | **Changed → UC-2.** Email OTP flow (code + short-lived verification token), single-tab |
| UC-4 | Manage User Profile | **Changed → UC-3/UC-4.** Profile is view + change-password; identity edits moved to import/admin (single source of truth is the screening pipeline) |
| UC-5 | Role-Based Access Control | **Kept → UC-5**, extended by UC-6/UC-7 (per-user staff permissions — finer than FYP I's role-only model) |
| UC-6–UC-9 | Log / View / Edit / Delete Activity | **Kept, then removed 2026-07-20.** Lived as Module 1 (Activity Tracking) through 2026-07-16, fully removed 2026-07-20 — see `MASTER_CLARIFICATIONS.md §4` |
| UC-10 | Summarize Activity Data | **Kept, then removed 2026-07-20** (sRPE load, persisted at write). Stopped feeding a dashboard risk verdict on 2026-07-16; stopped existing at all on 2026-07-20 when Activity Tracking, the recovery baseline, and the sharp-drop prompt were removed together |
| UC-11 | Calculate Workload (ACWR) | **Demoted 2026-07-16, then removed 2026-07-20.** Computed silently (`lib/risk.ts`) for a few weeks after its display was pulled, driving the recovery baseline; once Activity Tracking (its only input) was removed, `risk.ts` lost its last caller. Formula preserved as a locked decision; full logic in `ACWR_REBUILD.md` |
| UC-12 | Display Workload Data | **Removed from dashboards 2026-07-16, module removed entirely 2026-07-20.** The workload chart and load tiles were gone first; the session history that briefly remained is gone too now |
| UC-13 | Determine Risk Level (ACWR thresholds) | **Replaced → UC-8/UC-9.** The risk verdict is now cohort-normed screening (TSA z-composite + escalation), not a workload ratio against absolute thresholds |
| UC-14 | Display Risk Level | **Replaced → UC-10** (indicator hero) |
| UC-15 | Generate Risk Alert | **Replaced → UC-11 + UC-29.** On-screen: the regions-behind-the-band detail, gated on an amber/red band (the old always-on absolute alert fired for 59/59 athletes). Off-screen: import-commit email alerts |
| UC-16–UC-18 | Log / Update / View Injury | **Kept → UC-17/18/19** (intake upgraded to the five-step workflow) |
| UC-19 | Delete Injury Record | **Removed.** Clinical records are append-and-amend (recovery status), not deletable — and no delete endpoint was ever shipped |
| UC-20–UC-22 | Self-Report pipeline | **Kept → UC-20/21/22** |
| UC-23 | Import Data (Excel) | **Replaced → UC-23–27.** HoloMotion PDF vision-AI ingestion is the sole import path (Excel import retired 2026-07-12, archived); adds batch, name-match, identity editing and the immutable snapshot |
| UC-24 | Validate Import Data | **Changed → UC-25/26.** Validation is now human-in-the-loop preview-before-commit on top of schema checks |
| UC-25 | View Import History | **Removed.** Never built (flagged as an overclaim in the FYP I review). The screening *snapshot history* (UC-27) now covers the audit need per athlete |
| UC-26 | Delete Import Record | **Removed.** Never built; snapshots are immutable by design |
| UC-27–UC-29 | Injury overview / filters / trends | **Kept → UC-34/35/36** (filters extended, incl. age group) |
| UC-30 | Generate PDF Report | **Kept → UC-37**, joined by two new screening reports (UC-38/39) |
| UC-31–UC-33 | Search athlete / profile summary / injury history | **Kept → UC-40/41** |
| UC-34 | View Individual Injury Trend | **Folded into UC-41, then the prevention-insight successor removed 2026-07-20.** No standalone trend chart; the chronological history (UC-41) carries the job alone |
| UC-35 | View Sport-Level Context | **Kept → UC-43** |
| UC-36 | View Workload History (medical) | **Removed (2026-07-16)** with the workload chart. Its 2026-07-16 successor, the recovery baseline, was itself **removed 2026-07-20** along with Activity Tracking (the raw history it read) |

**Net:** 36 FYP I use cases → 52 as-built use cases as of 2026-07-16 → **44
live use cases as of 2026-07-20**, redistributed across six modules instead
of the interim five. Nothing was lost silently: 4 were removed because they
were never built or deliberately excluded (register account, delete injury
record, view/delete import history), 3 display-side ACWR use cases were
removed with the model demoted on 2026-07-16, and 8 more were removed
outright on 2026-07-20 when Activity Tracking — and everything downstream of
the training-load data it produced — was fully retired at JC's request. The
additions that remain are the FYP II screening capabilities (cohort norms +
governance, the indicator, override, batch vision ingestion, alerts, two
screening reports, coach board, staff permissions).

---

## Appendix B — interim (2026-07-16) numbering → final (2026-07-20) numbering

For anything still citing the interim 52-UC table (early report drafts, the
pre-restructure `REPORT_TABLE_4-1.md`, old screenshots of the FDD). General
module (UC-1–7) is unchanged and omitted below.

| Interim UC (2026-07-16) | Final UC (2026-07-20) | Note |
|---|---|---|
| UC-8–12 | *(none — removed)* | Module 1, Activity Tracking, fully removed |
| UC-13 | UC-8 | |
| UC-14 | UC-9 | |
| UC-15 | UC-10 | |
| UC-16 | UC-11 | |
| UC-17 | UC-12 | |
| UC-18 | UC-13 | |
| UC-19 | UC-14 | |
| UC-20 | UC-15 | |
| UC-21 | UC-16 | |
| UC-22 | *(none — removed)* | Sharp-drop prompt, downstream of Activity Tracking |
| UC-23 | UC-17 | |
| UC-24 | UC-18 | |
| UC-25 | UC-19 | |
| UC-26 | UC-20 | |
| UC-27 | UC-21 | |
| UC-28 | UC-22 | |
| UC-29 | UC-23 | |
| UC-30 | UC-24 | |
| UC-31 | UC-25 | |
| UC-32 | UC-26 | |
| UC-33 | UC-27 | |
| UC-34 | UC-28 | |
| UC-35 | UC-29 | |
| UC-36 | UC-30 | |
| UC-37 | UC-31 | |
| UC-38 | UC-32 | |
| UC-39 | UC-34 | |
| UC-40 | UC-35 | |
| UC-41 | UC-36 | |
| UC-42 | UC-33 | Moved modules: Analytics → Cohort Norms & Governance |
| UC-43 | UC-37 | |
| UC-44 | UC-38 | |
| UC-45 | UC-39 | |
| UC-46 | UC-40 | |
| UC-47 | UC-41 | |
| UC-48 | UC-42 | |
| UC-49 | *(none — removed)* | Prevention insight, downstream of Activity Tracking |
| UC-50 | *(none — removed)* | Recovery baseline, downstream of Activity Tracking |
| UC-51 | UC-43 | |
| UC-52 | UC-44 | |

---

*Compiled 2026-07-16 from the FYP I report (Table 4.1, pp. 31–34) and the
running system; fully restructured 2026-07-20 into six modules following
Module 1's removal (see the status note at the top of this file). If a use
case here disagrees with the code, the code wins — tell Claude and this file
gets fixed.*
