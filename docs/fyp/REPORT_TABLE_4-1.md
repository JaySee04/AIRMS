# Report — Table 4.1 Functional Requirements (replacement text)

> **Purpose:** the paste-ready replacement for **Table 4.1** in Chapter 4
> (§4.1.1 Functional Requirements). Same five columns as the FYP I table
> (Module · Use Case · Title · Description · User Role), so it drops into the
> Word document in place of the old one.
>
> **What changed:** the FYP I table listed **36** use cases (UC-1–36) written
> around the ACWR/Excel-era system. This lists the **52** use cases the system
> actually implements. Every row was verified against the running system
> (2026-07-16/17) — nothing here is aspirational.
>
> **Traceability:** `FYP2_MODULES_USECASES.md` **Appendix A** maps every one of
> the old UC-1–36 to its disposition here (kept / changed / replaced / removed,
> with reasons) — use it if a panellist asks "what happened to your FYP I
> requirements?". Companion figures already regenerated: `fdd-updated.html`,
> `uc-general-updated.html`, `uc-datamgmt-updated.html`.
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
| **Activity Tracking & Logging (sRPE)** | UC-8 | Log Activity | Record a training session with type, date, duration (10–240 minutes), intensity (RPE 1–10) and optional notes. | Athlete |
| | UC-9 | Compute Session Load | Automatically compute and persist session load as duration × intensity (the sRPE method) at write time, with a live preview and qualitative band shown as the athlete enters values. | System |
| | UC-10 | View Activity History | View past logged sessions, filterable by activity type, showing date, type, duration, intensity and computed load. | Athlete |
| | UC-11 | Edit Activity | Update the details of a previously logged session; the session load recomputes on save. | Athlete |
| | UC-12 | Delete Activity | Remove a previously logged session after confirmation. | Athlete |
| **Athlete Dashboard & Overall Risk Indicator** | UC-13 | Compute Overall Risk Indicator | Standardise the athlete's six screening components against their approved cohort (sport × programme × gender, with a fallback ladder when a cohort is too small), average the z-scores with equal weight (the Total Score of Athleticism method), and map the result to a 0–100 indicator where 50 is the cohort average. | System |
| | UC-14 | Escalate Risk Band | Assign the risk band by escalation: +1 if the athlete is below the cohort average, and +1 if the athlete is among the cohort's worst performers (the bottom *k*, capped at 20% of the cohort). Zero, one or two escalations give Safe, Needs attention or Immediate assessment respectively. | System |
| | UC-15 | View Overall Risk Indicator | View the current risk band, the 0–100 indicator, and a plain-English statement of which escalation rules applied — or the clinician's note when an override is in force. | Athlete |
| | UC-16 | View Regions Behind the Band | When the band is amber or red, view the body regions that are out of range, each with a Watch or Elevated marker, and with the regions critical to the athlete's sport highlighted. | Athlete |
| | UC-17 | View Risk Indicator Radar | View a radar chart of the seven displayed exercise-risk indicators from the latest screening. | Athlete |
| | UC-18 | View Screening Panel | View the latest HoloMotion report read against its thresholds: five tier-marked score gauges and seven indicator strips banded Low, Watch or Elevated, tightened for the regions critical to the athlete's sport. | Athlete |
| | UC-19 | View Training Focus | View corrective exercises with repetition, set and rest dosing for the most pressing out-of-range regions, drawn from the report's own prescription vocabulary. | Athlete |
| | UC-20 | View Muscle Assessment Map | View front and back body silhouettes with flagged muscle regions, together with per-muscle deficiency and tension listings. | Athlete |
| | UC-21 | View Records | View recent training sessions and injury records, separated into Active and All History views. | Athlete |
| | UC-22 | Prompt on Sharp Training Drop | Detect a sharp week-on-week fall in training load and prompt the athlete to record the reason, linking to injury reporting. | System, Athlete |
| **Injury & Recovery Logging** | UC-23 | Log Official Injury | Record an injury against an athlete with body part, side, injury type, severity, mechanism, date and clinical notes, with the athlete's context and any recurrence surfaced during intake. | Medical Staff |
| | UC-24 | Update Recovery Status | Update a logged injury's recovery status to Recovering, Recovered or Chronic. | Medical Staff |
| | UC-25 | View Athlete Injury Records | View the full chronological injury history of an athlete, and the filtered injury list across athletes. | Medical Staff, Administrator |
| | UC-26 | Submit Self-Reported Injury | Submit an injury report with body part, side, suspected type, severity, onset date and description, which is placed in a Pending state awaiting medical review. | Athlete |
| | UC-27 | Review Self-Reported Injury | Review a pending self-report and either approve it — promoting it into an official injury record within a single transaction — or reject it, recording a reviewer note in both cases. | Medical Staff |
| | UC-28 | Track Self-Report Status | View the status of submitted self-reports (Pending, Approved or Rejected) and any note left by the reviewer. | Athlete |
| **Screening Data Management & Cohort Norms** | UC-29 | Import HoloMotion Reports | Upload one or many HoloMotion report PDFs; extraction runs sequentially, with progress shown for each file. | Administrator, Medical Staff |
| | UC-30 | Extract Screening Data | Render the report's data pages to images (the report carries no extractable text layer) and read them with a configurable vision model into structured data: headline scores, the eight risk indicators, the twenty-five physical-fitness subitem scores, posture findings, the summary text and both muscle lists. | System |
| | UC-31 | Preview & Verify Extraction | Review every extracted value against the source report before anything is written to the database. | Administrator, Medical Staff |
| | UC-32 | Match Athlete & Complete Identity | Match the extracted name against the roster to auto-fill athlete ID, sport and programme, and correct or supply the name, age, gender, sport and programme where required. | System, Administrator, Medical Staff |
| | UC-33 | Commit Import | Write the athlete's latest values, replace their muscle flags, and append an immutable screening snapshot to the athlete's history. | Administrator, Medical Staff |
| | UC-34 | Recompute Cohort Norms | Following a commit, recompute each cohort's per-component mean and standard deviation and re-score every athlete's overall risk indicator. | System |
| | UC-35 | Email Risk Alerts | On import commit, email the medical staff and the coaches assigned to the athlete's sport when an athlete falls into an alerting band. | System |
| | UC-36 | Manage Cohort Thresholds | Review the queue of automatically computed cohorts and approve, edit or revert their per-component values; only approved cohorts drive the risk indicator. | Administrator |
| | UC-37 | Tune Norming & Alert Settings | Adjust the minimum cohort size, the worst-performer count, the escalation and fallback rules, and the alerting behaviour. | Administrator |
| | UC-38 | Export Data Backup | Download a multi-sheet Excel snapshot of athletes, injuries and muscle flags. | Administrator |
| **Analytics & Reporting** | UC-39 | View Injury Overview | View organisation-wide injury indicators (total cases, athletes affected, currently recovering, sports affected) together with body-part and injury-type distribution charts. | Administrator |
| | UC-40 | Filter Injury Data | Filter the injury analytics by sport, gender, programme, body part, injury type, age group and date range. | Administrator |
| | UC-41 | View Temporal Trends | View injury counts over time, monthly or quarterly, to identify peak-risk periods. | Administrator |
| | UC-42 | View Screening Cohort Analytics | View screening coverage, the share of athletes in each band per indicator, cohort average scores, and the most frequently flagged muscles. | Administrator |
| | UC-43 | Generate Injury PDF Report | Generate a multi-page injury report from the live data against the applied filters, rendered on the server and streamed to the browser. | Administrator |
| | UC-44 | Generate Holistic Screening Report | Generate an organisation-wide screening report presenting coverage, band distribution, population averages, risk hotspots and the athletes needing attention, as visualisations suited to a non-specialist reader. | Administrator |
| | UC-45 | Generate Individual & Team Screening Reports | Generate an individual report (scores against the cohort, risk evaluation, subitem table, interpretation, and progress between successive reports) or a team report (group thresholds, athlete ranking, attention table and per-athlete snapshots). | Administrator, Medical Staff, Athlete (own report only) |
| **Clinical & Squad Monitoring** | UC-46 | Search Athlete Roster | Locate an athlete by name or identifier, filtered by sport and programme. | Medical Staff |
| | UC-47 | View Athlete Clinical Overview | View the selected athlete's risk indicator, screening panel, risk radar, body map, profile summary and full injury history, with a deep link to log an injury against them. | Medical Staff |
| | UC-48 | Override Risk Band | After assessing an athlete, set their risk band manually with a required explanatory note; the override applies across the system until the next screening is imported. | Medical Staff |
| | UC-49 | View Prevention Insight | View ranked watch points and recommended actions derived from the athlete's elevated indicators, muscle flags and recent injury history. | Medical Staff |
| | UC-50 | Track Recovery Baseline | Record the athlete's pre-elevation training state when their risk leaves the low band, and resolve it on their return, giving the clinician a return-to-training target. | System, Medical Staff |
| | UC-51 | View Sport-Level Context | View injury statistics for the athlete's sport alongside the individual view, so the athlete can be read against their sport's pattern. | Medical Staff |
| | UC-52 | View Squad Readiness | View a read-only board of every athlete in the coach's assigned sports, with each athlete's risk band mapped to Full-Go, Observation or Restricted, sorted worst-first and naming each athlete's most concerning screening region. | Coach |

---

## Notes for the surrounding text (§4.1.1)

Points worth stating around the table, each defensible and already true of the build:

1. **The General Module is cross-cutting** and is not counted among the six functional modules — the same convention as the FYP I report.
2. **Coach is a first-class fourth role** (read-only, sport-scoped), promoted in FYP II (2026-07-19) from the earlier experimental spike. Keep UC-52 and the Coach mentions in UC-1/UC-2 in Chapter 4 — the coach is part of the delivered role model (athlete / medical / administrator / coach), not future work.
3. **"System" denotes automated behaviour with no human actor** — the same convention the FYP I table used for UC-5, UC-10, UC-11, UC-13, UC-15 and UC-24.
4. **HoloMotion PDF is the sole screening import.** The Excel import (old UC-23/24) was retired on 2026-07-12 and archived; the Excel *backup export* remains as UC-38.
5. **Training load is recorded but is no longer a displayed risk verdict.** The ACWR/composite model is retained in code and still drives the recovery baseline (UC-50), but the cohort-normed overall risk indicator (UC-13/14) is the system's single risk verdict. This is the central FYP II design change.
6. **Four FYP I use cases were removed rather than reimplemented** — self-registration (accounts are provisioned for a closed elite roster), injury-record deletion (clinical records are append-and-amend), and import history/deletion (never built; the immutable screening snapshot in UC-33 covers the audit need). Appendix A of `FYP2_MODULES_USECASES.md` records each with its reason.
