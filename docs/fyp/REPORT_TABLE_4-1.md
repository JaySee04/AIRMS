# Report — Table 4.1 Functional Requirements (replacement text)

> **Purpose:** the paste-ready replacement for **Table 4.1** in Chapter 4
> (§4.1.1 Functional Requirements). Same five columns as the FYP I table
> (Module · Use Case · Title · Description · User Role), so it drops into the
> Word document in place of the old one.
>
> **What changed:** the FYP I table listed **36** use cases (UC-1–36) written
> around the ACWR/Excel-era system. An interim version of this table
> (2026-07-16/17) listed **52** use cases across six modules including
> Activity Tracking. **On 2026-07-20, JC asked to fully remove Activity
> Tracking** (sRPE session logging), and with it the recovery-baseline,
> prevention-insight, and sharp-drop-prompt mechanisms it fed — 8 use cases
> gone. Rather than leave a gap or drop to five modules, the surviving **44**
> use cases were **redistributed across a fresh set of six modules**: the old
> "Screening Data Management & Cohort Norms" module (the largest, 10 UCs) is
> split into **Screening Data Ingestion** and **Cohort Norms & Governance**.
> This table has **clean sequential numbering, UC-1–44, no gaps**.
>
> **Traceability:** `FYP2_MODULES_USECASES.md` **Appendix A** maps every one of
> the old FYP I UC-1–36 to its disposition here (kept / changed / replaced /
> removed, with reasons) — use it if a panellist asks "what happened to your
> FYP I requirements?" **Appendix B** of that same file maps the *interim*
> 2026-07-16 UC-1–52 numbering to this table's final numbering, in case any
> earlier report draft, screenshot, or diagram still cites the interim
> numbers. Companion figure: `fdd-updated.html` (regenerate if it still shows
> the old six-module boundary).
>
> **Formatting note:** the Module column is blank on continuation rows, mirroring
> the vertically-merged cells in the original table — merge them in Word after
> pasting.
>
> ⚠ `REPORT_EDIT_PACK.md` predates the ACWR removal and is **stale**; prefer this
> file and `FYP2_MODULES_USECASES.md` for Chapter 4.

---

## Table 4.1: Functional Requirements

| Module | Use Case | Title | Description | User Role |
|---|---|---|---|---|
| **General Module** | UC-1 | Login | Authenticate with email and password; the system issues a JWT bearer token and directs the user to their role's landing page. The error message does not reveal whether the email or the password was wrong. | Athlete, Medical Staff, Administrator, Coach |
| | UC-2 | Reset Password | Reset a forgotten password through a three-step, single-tab email OTP flow: request a six-digit code (ten-minute expiry, hashed at rest), verify it (invalidated after five wrong attempts), then set a new password using a short-lived verification token. | Athlete, Medical Staff, Administrator, Coach |
| | UC-3 | Change Password | Rotate the password in place from the profile page without leaving the application, subject to the same complexity policy as the reset flow. | Athlete, Medical Staff, Administrator |
| | UC-4 | View Profile | View personal profile details; athletes additionally see their sport, programme, age and latest screening scores. Identity fields are maintained through data import or by the administrator, not by self-service. | Athlete, Medical Staff, Administrator |
| | UC-5 | Enforce Role-Based Access Control | Restrict every route and page to its permitted roles, enforced on the server and mirrored in the client. | System |
| | UC-6 | Manage Staff Permissions | Grant or revoke individual capabilities (view records, upload data, review self-reports, log injuries) for a medical staff member, and activate or deactivate accounts. | Administrator |
| | UC-7 | Enforce Per-User Permissions | Block revoked capabilities on every server call and hide the corresponding features in the client, taking effect on the staff member's next navigation. | System |
| **Module 1 — Athlete Dashboard & Overall Risk Indicator** | UC-8 | Compute Overall Risk Indicator | Standardise the athlete's six screening components against their approved cohort (sport × programme × gender, with a fallback ladder when a cohort is too small), average the z-scores with equal weight (the Total Score of Athleticism method), and map the result to a 0–100 indicator where 50 is the cohort average. | System |
| | UC-9 | Escalate Risk Band | Assign the risk band by escalation: +1 if the athlete is below the cohort average, and +1 if the athlete is among the cohort's worst performers (the bottom *k*, capped at 20% of the cohort). Zero, one or two escalations give Safe, Needs attention or Immediate assessment respectively. | System |
| | UC-10 | View Overall Risk Indicator | View the current risk band, the 0–100 indicator, and a plain-English statement of which escalation rules applied — or the clinician's note when an override is in force. | Athlete |
| | UC-11 | View Regions Behind the Band | When the band is amber or red, view the body regions that are out of range, each with a Watch or Elevated marker, and with the regions critical to the athlete's sport highlighted. | Athlete |
| | UC-12 | View Risk Indicator Radar | View a radar chart of the seven displayed exercise-risk indicators from the latest screening. | Athlete |
| | UC-13 | View Screening Panel | View the latest HoloMotion report read against its thresholds: five tier-marked score gauges and seven indicator strips banded Low, Watch or Elevated, tightened for the regions critical to the athlete's sport; a screening-history table beneath it shows every prior report with the change since the first. | Athlete |
| | UC-14 | View Training Focus | View corrective exercises with repetition, set and rest dosing for the most pressing out-of-range regions, drawn from the report's own prescription vocabulary. | Athlete |
| | UC-15 | View Muscle Assessment Map | View front and back body silhouettes with flagged muscle regions, together with per-muscle deficiency and tension listings. | Athlete |
| | UC-16 | View Records | View injury records, separated into Active and All History views. | Athlete |
| **Module 2 — Injury & Recovery Logging** | UC-17 | Log Official Injury | Record an injury against an athlete with body part, side, injury type, severity, mechanism, date and clinical notes, with the athlete's context and any recurrence surfaced during intake. | Medical Staff |
| | UC-18 | Update Recovery Status | Update a logged injury's recovery status to Recovering, Recovered or Chronic. | Medical Staff |
| | UC-19 | View Athlete Injury Records | View the full chronological injury history of an athlete, and the filtered injury list across athletes. | Medical Staff, Administrator |
| | UC-20 | Submit Self-Reported Injury | Submit an injury report with body part, side, suspected type, severity, onset date and description, which is placed in a Pending state awaiting medical review. | Athlete |
| | UC-21 | Review Self-Reported Injury | Review a pending self-report and either approve it — promoting it into an official injury record within a single transaction — or reject it, recording a reviewer note in both cases. | Medical Staff |
| | UC-22 | Track Self-Report Status | View the status of submitted self-reports (Pending, Approved or Rejected) and any note left by the reviewer. | Athlete |
| **Module 3 — Screening Data Ingestion** | UC-23 | Import HoloMotion Reports | Upload one or many HoloMotion report PDFs; extraction runs sequentially, with progress shown for each file. | Administrator, Medical Staff |
| | UC-24 | Extract Screening Data | Render the report's data pages to images (the report carries no extractable text layer) and read them with a configurable vision model into structured data: headline scores, the eight risk indicators, the twenty-five physical-fitness subitem scores, posture findings, the summary text and both muscle lists. | System |
| | UC-25 | Preview & Verify Extraction | Review every extracted value against the source report before anything is written to the database. | Administrator, Medical Staff |
| | UC-26 | Match Athlete & Complete Identity | Match the extracted name against the roster to auto-fill athlete ID, sport and programme, and correct or supply the name, age, gender, sport and programme where required. | System, Administrator, Medical Staff |
| | UC-27 | Commit Import | Write the athlete's latest values, replace their muscle flags, and append an immutable screening snapshot to the athlete's history. | Administrator, Medical Staff |
| **Module 4 — Cohort Norms & Governance** | UC-28 | Recompute Cohort Norms | Following a commit, recompute each cohort's per-component mean and standard deviation and re-score every athlete's overall risk indicator. | System |
| | UC-29 | Email Risk Alerts | On import commit, email the medical staff and the coaches assigned to the athlete's sport when an athlete falls into an alerting band. | System |
| | UC-30 | Manage Cohort Thresholds | Review the queue of automatically computed cohorts and approve, edit or revert their per-component values; only approved cohorts drive the risk indicator. | Administrator |
| | UC-31 | Tune Norming & Alert Settings | Adjust the minimum cohort size, the worst-performer count, the escalation and fallback rules, and the alerting behaviour. | Administrator |
| | UC-32 | Export Data Backup | Download a multi-sheet Excel snapshot of athletes, injuries and muscle flags. | Administrator |
| | UC-33 | View Screening Cohort Analytics | View screening coverage, the share of athletes in each band per indicator, cohort average scores, and the most frequently flagged muscles. | Administrator |
| **Module 5 — Analytics & Reporting** | UC-34 | View Injury Overview | View organisation-wide injury indicators (total cases, athletes affected, currently recovering, sports affected) together with body-part and injury-type distribution charts. | Administrator |
| | UC-35 | Filter Injury Data | Filter the injury analytics by sport, gender, programme, body part, injury type, age group and date range. | Administrator |
| | UC-36 | View Temporal Trends | View injury counts over time, monthly or quarterly, to identify peak-risk periods. | Administrator |
| | UC-37 | Generate Injury PDF Report | Generate a multi-page injury report from the live data against the applied filters, rendered on the server and streamed to the browser. | Administrator |
| | UC-38 | Generate Holistic Screening Report | Generate an organisation-wide screening report presenting coverage, band distribution, population averages, risk hotspots and the athletes needing attention, as visualisations suited to a non-specialist reader. | Administrator |
| | UC-39 | Generate Individual & Team Screening Reports | Generate an individual report (scores against the cohort, risk evaluation, subitem table, interpretation, and progress between successive reports) or a team report (group thresholds, athlete ranking, attention table and per-athlete snapshots). | Administrator, Medical Staff, Athlete (own report only), Coach (assigned sport only) |
| **Module 6 — Clinical & Squad Monitoring** | UC-40 | Search Athlete Roster | Locate an athlete by name or identifier, filtered by sport and programme. | Medical Staff |
| | UC-41 | View Athlete Clinical Overview | View the selected athlete's risk indicator, screening panel, screening history, risk radar, body map, profile summary and full injury history, with a deep link to log an injury against them. | Medical Staff |
| | UC-42 | Override Risk Band | After assessing an athlete, set their risk band manually with a required explanatory note; the override applies across the system until the next screening is imported. | Medical Staff |
| | UC-43 | View Sport-Level Context | View injury statistics for the athlete's sport alongside the individual view, so the athlete can be read against their sport's pattern. | Medical Staff |
| | UC-44 | View Squad Readiness | View a read-only board of every athlete in the coach's assigned sport, with each athlete's risk band mapped to Full-Go, Observation or Restricted, sorted worst-first and naming each athlete's most concerning screening region; selecting an athlete opens a read-only screening detail view (panel, radar, body map, screening history) with the athlete's individual report downloadable, all scoped to the coach's sport on the server. | Coach |

---

## Notes for the surrounding text (§4.1.1)

Points worth stating around the table, each defensible and already true of the build:

1. **The General Module is cross-cutting** and is not counted among the six functional modules — the same convention as the FYP I report.
2. **Coach is a first-class fourth role** (read-only, sport-scoped), promoted in FYP II (2026-07-19) from the earlier experimental spike. Keep UC-44 and the Coach mentions in UC-1/UC-2 in Chapter 4 — the coach is part of the delivered role model (athlete / medical / administrator / coach), not future work.
3. **"System" denotes automated behaviour with no human actor** — the same convention the FYP I table used.
4. **HoloMotion PDF is the sole screening import.** The Excel import (old FYP I UC-23/24) was retired on 2026-07-12 and archived; the Excel *backup export* remains as UC-32.
5. **The cohort-normed overall risk indicator (UC-8/9) is the system's single risk verdict.** Training load and the composite ACWR model are no longer computed anywhere — see note 6 for the full removal.
6. **Activity Tracking was fully removed 2026-07-20**, at JC's explicit request, with the fallout accepted rather than left half-wired. Its ACWR/composite-risk *display* had already left every dashboard on 2026-07-16; with nothing left to surface its output, the logging module itself (5 UCs), the sharp-training-drop prompt, the prevention-insight card, and the recovery baseline (8 UCs total) were removed. The composite formula itself (`classifyCompositeRisk()` in `frontend/src/lib/risk.ts`) is kept as a locked decision but has no caller in the running system. Full history: `docs/fyp/ACWR_REBUILD.md`.
7. **The module structure was redesigned 2026-07-20** to stay at six modules despite Activity Tracking's removal, rather than drop to five: the old "Screening Data Management & Cohort Norms" module (10 UCs, the largest) was split into **Module 3 — Screening Data Ingestion** (the import/extract/preview/match/commit pipeline) and **Module 4 — Cohort Norms & Governance** (recompute, alerts, threshold approval, settings, backup, plus the cohort-coverage analytics view moved in from Analytics & Reporting). Every other module kept its original shape. This is a **44-use-case, six-module system**; if the report's Chapter 4 narrative still cites "52 use cases" or the pre-restructure module boundaries, update it — Appendix A/B of `FYP2_MODULES_USECASES.md` has the full before/after mapping.
