# AIRMS — Modules & Use Cases (As Built, FYP II)

> **Status:** drafted 2026-07-16 for JC. The complete functional decomposition of
> the system **as it stands today** — six functional modules plus the
> cross-cutting General module, every use case tied to the role(s) that perform
> it. Follows the exact format of FYP I Table 4.1 (Module · UC · Title ·
> Description · User Role) so it can replace that table in the report rewrite.
> Appendix A maps every FYP I use case (UC-1–36, the "ACWR days") to its FYP II
> disposition, so nothing is silently lost.
>
> Every use case below was verified against the running system on 2026-07-16 —
> nothing here is aspirational. Companion docs: [`FYP2_SIX_MODULES.md`](FYP2_SIX_MODULES.md)
> (module narratives), [`FYP2_REDESIGN_SPEC.md`](FYP2_REDESIGN_SPEC.md) (design
> rationale), [`../USER_MANUAL.md`](../USER_MANUAL.md) (walkthroughs).

**Roles:** Athlete · Medical Staff · Administrator · Coach *(experimental 4th
role — read-only; excluded from FYP I artifacts per the locked 3-role model)* ·
System *(automated behaviour, no human actor — same convention as FYP I)*.

---

## Functional decomposition (overview)

| # | Module | One-line charter | Primary roles |
|---|---|---|---|
| G | **General** | Authentication, account security, and role/permission enforcement for every other module | All + System |
| 1 | **Activity Tracking & Load Monitoring** | Athletes log training sessions; the system computes internal load (sRPE) | Athlete |
| 2 | **Athlete Dashboard & Overall Risk Indicator** | The athlete's single risk verdict: the cohort-normed screening indicator, with the full screening picture behind it | Athlete + System |
| 3 | **Injury & Recovery Logging** | Official injury records, recovery tracking, and the athlete self-report → clinical review pipeline | Medical, Athlete |
| 4 | **Screening Data Management & Cohort Norms** | HoloMotion PDF ingestion (vision AI), the immutable screening history, cohort-norm governance, alerts, and backup | Admin, Medical + System |
| 5 | **Analytics & Reporting** | Organisation-wide injury + screening analytics and all four PDF report generators | Admin |
| 6 | **Clinical & Squad Monitoring** | The clinician's per-athlete working view (with override authority) and the coach's squad readiness board | Medical, Coach |

---

## General Module

Cross-cutting authentication and access control. Not counted among the six
functional modules (same convention as FYP I).

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-1 | Login | Sign in with email + password; the server issues a JWT (bearer token) and the client redirects to the role's landing page. The error message never reveals whether the email or the password was wrong | Athlete, Medical Staff, Administrator, Coach |
| UC-2 | Reset Password via Email OTP | Three-step, single-tab flow: request a 6-digit code by email (10-minute TTL, hash-at-rest) → verify it (invalidated after 5 wrong attempts) → set a new policy-compliant password via a short-lived verification token | Athlete, Medical Staff, Administrator, Coach |
| UC-3 | Change Password | Rotate the password in place from the profile page, without leaving the app; same complexity policy as the reset flow (10+ chars, mixed case, digit, symbol) | Athlete, Medical Staff, Administrator |
| UC-4 | View Profile | View the personal profile (athletes additionally see sport, programme, age and screening biometrics from their athlete record). Identity fields are maintained via Module 4 import / the admin, not self-service | Athlete, Medical Staff, Administrator |
| UC-5 | Enforce Role-Based Access Control | Restrict every route and page to its allowed roles — `rbac()` middleware on the server (the actual security boundary), mirrored by client-side layout gating | System |
| UC-6 | Manage Staff Permissions & Activation | Grant/revoke individual capabilities per medical staffer (view records, upload data, review self-reports, log injuries — opt-out model) and activate/deactivate accounts entirely | Administrator |
| UC-7 | Enforce Per-User Permissions | Block revoked capabilities server-side on every call; client-side the feature vanishes (sidebar link hidden, direct URL redirected) and takes effect on the staffer's next navigation without re-login | System |

## Module 1 — Activity Tracking & Load Monitoring

The sole training-load surface. Since 2026-07-16 load is recorded and shown
**here only** — it feeds the recovery baseline (UC-50) and the sharp-drop
prompt (UC-22), not a dashboard verdict.

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-8 | Log Activity | Record a training session: type, date, duration (10–240 min), intensity (RPE 1–10), optional notes | Athlete |
| UC-9 | Compute Session Load (sRPE) | Persist `load = duration × RPE` at write time via a model hook, with a live preview and qualitative band (Light → Very High) shown as the athlete types | System |
| UC-10 | View & Filter Activity History | List all logged sessions with type filter; shows date, type, duration, intensity and computed load | Athlete |
| UC-11 | Edit Activity | Update a previously logged session in a modal; the load re-computes on save | Athlete |
| UC-12 | Delete Activity | Remove a logged session after a confirmation prompt | Athlete |

## Module 2 — Athlete Dashboard & Overall Risk Indicator

The FYP differentiator surface. One verdict — the cohort-normed indicator —
with every screening detail arranged *behind* it, not beside it.

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-13 | Compute Overall Risk Indicator | z-score the athlete's six oriented screening components (Total Score, ROM, Stability, Symmetry, inverted risk burden over the 7 shown indicators, L/R balance from the subitems) against their **approved cohort** (sport × programme × gender, falling back sport+gender → sport → all until the admin's minimum size is met), average them with equal weight (Total Score of Athleticism method), and map to 0–100 where 50 = the cohort average | System |
| UC-14 | Escalate Risk Band | Band by escalation: +1 if below the cohort average; +1 if among the cohort's worst performers — bottom-`k`, where `k` is the admin's setting capped at 20% of the cohort so it means the same thing at every squad size. 0/1/2 escalations → Safe / Needs attention / Immediate assessment; ranking is against the cohort's full membership | System |
| UC-15 | View Overall Risk Indicator | The dashboard hero: band in large type with a plain-English meaning, the 0–100 indicator, and a "why" chip stating which escalation rules fired (or the clinician's override note when one is in force) | Athlete |
| UC-16 | View Regions Behind the Band | Only when the band is amber/red: the out-of-range regions with Watch/Elevated chips, sport-critical regions starred — the explanation of the verdict, not a second verdict | Athlete |
| UC-17 | View Risk Indicator Radar | 7-axis radar of the shown exercise-risk indicators (Lumbar Disc Herniation is stored but never displayed, per the stakeholder) | Athlete |
| UC-18 | View HoloMotion Screening Panel | The latest report read against thresholds: five tier-ticked score gauges (60/75/85 boundaries) and seven indicator strips on the unified bands (Low ≤15 · Watch 16–25 · Elevated >25), tightened to 12/20 for the athlete's sport-critical regions | Athlete |
| UC-19 | View Training Focus | Corrective-exercise blocks (reps × sets · rest) for up to three most-pressing out-of-range regions, drawn from the HoloMotion prescription vocabulary; informational — medical staff remain the authority | Athlete |
| UC-20 | View Muscle Assessment Map | Front + back body silhouette with flagged regions, plus per-muscle myodynamia-deficiency and tension cards with sides | Athlete |
| UC-21 | Review Recent Activity & Injury Records | Recent sessions table and injury records in Active / All History tabs, with recovery-status badges | Athlete |
| UC-22 | Prompt on Sharp Training Drop | When acute load drops sharply vs the prior week, prompt the athlete to add context ("Were you ill or injured?") deep-linking to injury reporting | System, Athlete |

## Module 3 — Injury & Recovery Logging

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-23 | Log Official Injury | Record an injury against an athlete through the five-step pro-team intake: athlete context on selection, recurrence detection, body part/side/type/mechanism from locked enums, time-loss-anchored severity, clinical notes | Medical Staff |
| UC-24 | Update Recovery Status | Progress a logged injury through Recovering / Recovered / Chronic | Medical Staff |
| UC-25 | View Athlete Injury Records | Full chronological injury history per athlete, filterable list across athletes | Medical Staff, Administrator |
| UC-26 | Submit Self-Reported Injury | Athlete files a report (body part, side, suspected type, severity, onset, description) that lands in Pending awaiting clinical review | Athlete |
| UC-27 | Review Self-Report | Approve — which promotes the report into an official injury record in a single transaction — or reject, with a reviewer note either way | Medical Staff |
| UC-28 | Track Self-Report Status | Athlete sees each submission's status (Pending / Approved / Rejected) and any reviewer note | Athlete |

## Module 4 — Screening Data Management & Cohort Norms

The data spine: the **sole** screening import path (HoloMotion PDF; the Excel
import was retired 2026-07-12), the immutable history, and the governance of
the norms every indicator is measured against.

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-29 | Import HoloMotion PDFs (Batch) | Drop one or many report PDFs; extraction runs sequentially per file with progress per row | Administrator, Medical Staff |
| UC-30 | Extract Screening Data (Vision AI) | Render the report's leading pages to images (it has no text layer) and read them with a configurable vision model into strict JSON: headline scores, all 8 risk indicators (incl. stored-only LDH), the 25 physical-fitness subitem scores, posture findings, the summary text and both muscle lists. Provider-agnostic (OpenAI-compatible or Anthropic, by env) | System |
| UC-31 | Preview & Verify Extraction | Review every extracted value against the source before anything is written; LDH is deliberately visible **here only**, so the operator can confirm the read | Administrator, Medical Staff |
| UC-32 | Match Athlete & Complete Identity | Unambiguous name match against the roster auto-fills Athlete ID / sport / programme; the operator can correct Name (auto Title-Cased), Age and Gender, pick from the searchable 52-sport ISN list, and set the programme for new athletes | System, Administrator, Medical Staff |
| UC-33 | Commit Import | Write the athlete's latest values, replace their muscle flags wholesale (idempotent re-import), and append an **immutable screening snapshot** to the history that powers progress deltas and cohort norms | Administrator, Medical Staff |
| UC-34 | Recompute Cohort Norms & Re-score | After each commit burst (debounced — a batch coalesces into one pass) recompute every cohort's per-component mean/SD and re-score every athlete's indicator | System |
| UC-35 | Email Risk Alerts | When a committed import leaves an athlete at amber/red, email the medical staff and the coaches assigned to that athlete's sport so the finding is assessed rather than left sitting | System |
| UC-36 | Manage Cohort Thresholds | Approval queue of auto-computed cohorts: approve, edit the per-component means (pre-filled), revert to pending, or recompute all on demand; only **approved** cohorts drive the indicator | Administrator |
| UC-37 | Tune Norming & Alert Settings | Adjust minimum cohort size, bottom-k, the two escalation toggles, fallback, and alert behaviour — the knobs the indicator and alerting run on | Administrator |
| UC-38 | Export Data Backup | Download a multi-sheet Excel snapshot of athletes, injuries and muscle flags at any time | Administrator |

## Module 5 — Analytics & Reporting

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-39 | View Injury Overview (KPIs) | Live KPI cards (total cases, athletes affected, currently recovering, sports affected) with distribution charts by body part and injury type | Administrator |
| UC-40 | Filter Injury Analytics | Slice everything by sport, gender, programme, body part, injury type, age group and date range; active filters carry into the PDF builder | Administrator |
| UC-41 | View Temporal Trends | Cases-over-time line with monthly/quarterly views to spot peak-risk periods | Administrator |
| UC-42 | View Screening Cohort Analytics | HoloMotion population view: screened coverage, band share per shown indicator on the unified Low/Watch/Elevated bands, average scores, most-flagged muscles | Administrator |
| UC-43 | Generate Injury PDF Report | Server-rendered multi-page injury report from the live data against the chosen filters (cover, executive summary, distributions, optional severity/recovery/trend/athlete-index sections) | Administrator |
| UC-44 | Generate Holistic Screening PDF | Organisation-wide screening report for non-experts: coverage, risk-band distribution, population averages, exercise-risk hotspots, bands by sport, flagged-athlete list | Administrator |
| UC-45 | Generate Individual & Team Screening PDFs | **Individual**: one athlete's scores vs cohort, Exercise Risk Evaluation (zone gauges + radar), subitem score table on HoloMotion tier colours, muscle flags, data-driven interpretation, and progress deltas across their screening history. **Team**: one group's thresholds, ranking, attention table and per-athlete snapshots. Modelled on the TMG report format | Administrator, Medical Staff (Individual: also Athlete, own report only) |

## Module 6 — Clinical & Squad Monitoring

| UC | Title | Description | User Role |
|---|---|---|---|
| UC-46 | Search & Filter Athlete Roster | Find athletes by name/ID with sport and programme filters; card grid selection | Medical Staff |
| UC-47 | View Athlete Clinical Overview | The selected athlete's full picture — the same indicator hero, radar, screening panel and body map the athlete sees, plus profile summary, chronological injury history, and a deep-linked "+ Log Injury" that pre-fills the intake | Medical Staff |
| UC-48 | Override Risk Band | After an actual assessment, set the athlete's band (green/amber/red) with a **required note**; the override wins on every surface until the next import, and can be cleared | Medical Staff |
| UC-49 | View Prevention Insight | Ranked "watch points" with recommended actions, cross-referencing elevated indicators, muscle flags and the last 12 months of injuries — the stakeholder's "what is likely to happen here, and what do we advise?" | Medical Staff |
| UC-50 | Track Recovery Baseline | The system snapshots the athlete's pre-elevation training state when composite risk leaves Low and resolves it on return; medical staff read it as a return-to-training target | System, Medical Staff |
| UC-51 | View Sport-Level Context | The athlete's sport's injury statistics (total cases, athletes affected) beside the individual view, so the clinician reads the athlete against their sport's pattern | Medical Staff |
| UC-52 | View Squad Readiness | Read-only board scoped to the coach's assigned sports: every athlete's indicator and band mapped to Full-Go / Observation / Restricted (the same band the medical team sees), sorted worst-first, with each athlete's worst screening region named and active-injury counts | Coach *(experimental)* |

---

## Appendix A — FYP I (ACWR-era) use cases → FYP II disposition

Every use case from FYP I Table 4.1, and where it went. **Kept** = same
behaviour (possibly renumbered) · **Changed** = same job, different mechanism ·
**Replaced** = job now done by a different design · **Removed** = no longer in
the system (with the reason).

| FYP I | Title | Disposition |
|---|---|---|
| UC-1 | Register Account | **Removed.** No self-registration: accounts are provisioned (an elite-institute roster is closed; the FYP I report already flagged this as stale) |
| UC-2 | Login (cookies) | **Changed → UC-1.** JWT bearer token, not cookie sessions |
| UC-3 | Reset Password (token link) | **Changed → UC-2.** Email OTP flow (code + short-lived verification token), single-tab |
| UC-4 | Manage User Profile | **Changed → UC-3/UC-4.** Profile is view + change-password; identity edits moved to import/admin (single source of truth is the screening pipeline) |
| UC-5 | Role-Based Access Control | **Kept → UC-5**, extended by UC-6/UC-7 (per-user staff permissions — finer than FYP I's role-only model) |
| UC-6–UC-9 | Log / View / Edit / Delete Activity | **Kept → UC-8/10/11/12** |
| UC-10 | Summarize Activity Data | **Kept → UC-9** (sRPE load, persisted at write). No longer feeds a dashboard risk verdict — it feeds the recovery baseline (UC-50) and the sharp-drop prompt (UC-22) |
| UC-11 | Calculate Workload (ACWR) | **Demoted.** Still computed (`lib/risk.ts` executes on every dashboard load) but displayed nowhere; drives UC-50. Full logic preserved in `ACWR_REBUILD.md` |
| UC-12 | Display Workload Data | **Removed from dashboards (2026-07-16).** The workload chart and load tiles are gone; session history remains in Module 1 |
| UC-13 | Determine Risk Level (ACWR thresholds) | **Replaced → UC-13/UC-14.** The risk verdict is now cohort-normed screening (TSA z-composite + escalation), not a workload ratio against absolute thresholds |
| UC-14 | Display Risk Level | **Replaced → UC-15** (indicator hero) |
| UC-15 | Generate Risk Alert | **Replaced → UC-16 + UC-35.** On-screen: the regions-behind-the-band detail, gated on an amber/red band (the old always-on absolute alert fired for 59/59 athletes). Off-screen: import-commit email alerts |
| UC-16–UC-18 | Log / Update / View Injury | **Kept → UC-23/24/25** (intake upgraded to the five-step workflow) |
| UC-19 | Delete Injury Record | **Removed.** Clinical records are append-and-amend (recovery status), not deletable — and no delete endpoint was ever shipped |
| UC-20–UC-22 | Self-Report pipeline | **Kept → UC-26/27/28** |
| UC-23 | Import Data (Excel) | **Replaced → UC-29–33.** HoloMotion PDF vision-AI ingestion is the sole import path (Excel import retired 2026-07-12, archived); adds batch, name-match, identity editing and the immutable snapshot |
| UC-24 | Validate Import Data | **Changed → UC-31/32.** Validation is now human-in-the-loop preview-before-commit on top of schema checks |
| UC-25 | View Import History | **Removed.** Never built (flagged as an overclaim in the FYP I review). The screening *snapshot history* (UC-33) now covers the audit need per athlete |
| UC-26 | Delete Import Record | **Removed.** Never built; snapshots are immutable by design |
| UC-27–UC-29 | Injury overview / filters / trends | **Kept → UC-39/40/41** (filters extended, incl. age group) |
| UC-30 | Generate PDF Report | **Kept → UC-43**, joined by three new screening reports (UC-44/45) |
| UC-31–UC-33 | Search athlete / profile summary / injury history | **Kept → UC-46/47** |
| UC-34 | View Individual Injury Trend | **Folded into UC-47/UC-49.** No standalone trend chart; the chronological history plus the prevention insight carry the job |
| UC-35 | View Sport-Level Context | **Kept → UC-51** |
| UC-36 | View Workload History (medical) | **Removed (2026-07-16)** with the workload chart; the recovery baseline (UC-50) is the clinical view of load, and Module 1 holds the raw history |

**Net:** 36 FYP I use cases → 52 as-built use cases. Nothing was lost silently:
4 were removed because they were never built or deliberately excluded (UC-1,
19, 25, 26), 3 display-side ACWR use cases were removed with the model demoted
but still executing (UC-11/12/36), and the additions are the FYP II screening
capabilities (cohort norms + governance, the indicator, override, batch vision
ingestion, alerts, three screening reports, coach board, staff permissions).

*Compiled 2026-07-16 from the FYP I report (Table 4.1, pp. 31–34) and the
running system. If a use case here disagrees with the code, the code wins —
tell Claude and this file gets fixed.*
