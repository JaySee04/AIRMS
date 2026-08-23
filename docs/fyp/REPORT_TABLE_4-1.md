# Report — Table 4.1 Functional Requirements (replacement text)

> **Purpose:** the paste-ready replacement for **Table 4.1** in Chapter 4
> (§4.1.1 Functional Requirements). Same five columns as the FYP I table
> (Module · Use Case · Title · Description · User Role), so it drops into the
> Word document in place of the old one.

---

## Module 2 was recast — decided 2026-08-06

**Injury & Recovery Logging no longer exists.** The HoloMotion-only cut of
2026-08-02 deleted the `Injury` and `SelfReport` models, both their routes, all
three of their pages, and the approve→promote transaction. All six of its use
cases (old UC-17–22) are gone, plus four more elsewhere that read injury data
(old UC-16, UC-34–37, UC-43).

**Module 2 is now Athlete Roster & Identity Management** — JC's decision,
2026-08-06. Two alternatives were put and rejected: dropping to five modules
(rejected for the same reason as on 2026-07-20 — a six-module FDD is the shape
of the report, and shrinking mid-project reads as scope failure rather than
scope discipline), and keeping the old name to describe the single surviving
flag (a one-use-case module invites the question "why is this a module?", whose
honest answer is "it used to be bigger").

The recast invents nothing. Athlete registration keyed by identity-card number,
roster maintenance and search, the event vocabulary, the institute-directory
lookup and the surviving clinician injury-status flag are **all built**, all
demonstrable, and all previously had **no use case anywhere** in the 44 —
master-data management was the gap in the decomposition, not a new claim.

**If a panellist asks why the module changed name:** the system's master data
always needed managing; what changed is that the injury stream it used to sit
beside was removed, which made the omission visible.

---

## What changed, and why the count went UP

The FYP I table listed **36** use cases (ACWR/Excel era). The 2026-07-20
restructure produced **44**. This revision lists **47** across the same six
modules plus General — *after* deleting an entire module.

That is the story worth telling in §4.1.1: the system did not shrink, it
re-focused. Ten injury-derived use cases left; thirteen arrived, and every one
of them is HoloMotion-derived or serves the data governing it:

| New use case | Where it came from |
|---|---|
| UC-16 View Screening History · UC-44 Review Screening History | C2 (2026-08-03) |
| UC-17 View Squad Readiness Summary | C3 (2026-08-04) |
| UC-18/19 Register & Maintain Athlete Record | Always built, never had a UC |
| UC-20 Look Up Athlete in the ISN Directory | A3 (2026-08-04) |
| UC-22 Maintain Event List | B2 groundwork, never had a UC |
| UC-23 Set Athlete Injury Status | All that survives of the old Module 2 |
| **UC-25 Redact Athlete Name On-Device** | The privacy differentiator — built 2026-07, **never had a use case** |
| UC-31 Resolve Cohort Norm Membership | B3/B4/B5 (2026-08-03) |
| UC-33 Version & Restore Cohort Norms | B1 (2026-08-03) |
| UC-39 View Cohort Trend | Screening momentum, replaces the injury trend |
| UC-41/42 split from the old combined UC-39 | Different roles per report type |
| UC-47 View Squad Focus & Needs-Attention | Coach cockpit |

**Traceability:** Appendix C below maps every UC-1–44 from the previous
numbering to this one (kept / renumbered / removed, with reasons).
`FYP2_MODULES_USECASES.md` Appendix A still maps FYP I's UC-1–36, and Appendix B
the interim 2026-07-16 UC-1–52.

**Formatting note:** the Module column is blank on continuation rows, mirroring
the vertically-merged cells in the original table — merge them in Word after
pasting.

---

## Table 4.1: Functional Requirements

| Module | Use Case | Title | Description | User Role |
|---|---|---|---|---|
| **General Module** | UC-1 | Login | Authenticate with email and password; the system issues a JWT bearer token and directs the user to their role's landing page. The error message does not reveal whether the email or the password was wrong. | Athlete, Medical Staff, Administrator, Coach |
| | UC-2 | Reset Password | Reset a forgotten password through a three-step, single-tab email OTP flow: request a six-digit code (ten-minute expiry, hashed at rest), verify it (invalidated after five wrong attempts), then set a new password using a short-lived verification token. | Athlete, Medical Staff, Administrator, Coach |
| | UC-3 | Change Password | Rotate the password in place from the profile page without leaving the application, subject to the same complexity policy as the reset flow. | Athlete, Medical Staff, Administrator, Coach |
| | UC-4 | View Profile | View personal profile details; athletes additionally see their sport, programme, age and latest screening scores. Identity fields are maintained through data import or by the administrator, not by self-service. | Athlete, Medical Staff, Administrator, Coach |
| | UC-5 | Enforce Role-Based Access Control | Restrict every route and page to its permitted roles, enforced on the server and mirrored in the client. | System |
| | UC-6 | Manage Personnel & Permissions | Create a coach or medical staff account, assign or change a coach's single sport, grant or revoke individual capabilities for a medical staff member, and activate or deactivate accounts. | Administrator |
| | UC-7 | Enforce Per-User Permissions | Block revoked capabilities on every server call and hide the corresponding features in the client, taking effect on the staff member's next navigation. | System |
| **Module 1 — Athlete Dashboard & Overall Risk Indicator** | UC-8 | Compute Overall Risk Indicator | Standardise the athlete's six screening components against their approved cohort — sport × programme × gender × discipline, with a fallback ladder to progressively broader cohorts when a group is too small — average the z-scores with equal weight (the Total Score of Athleticism method), and map the result to a 0–100 indicator where 50 is the cohort average. | System |
| | UC-9 | Escalate Risk Band | Assign the risk band by escalation: +1 if the athlete is below the cohort average, and +1 if the athlete is among the cohort's worst performers (the bottom *k*, capped at 20% of the cohort). Zero, one or two escalations give Safe, Needs attention or Immediate assessment respectively. | System |
| | UC-10 | View Overall Risk Indicator | View the current risk band, the 0–100 indicator, and a plain-English statement of which escalation rules applied — or the clinician's note when an override is in force. | Athlete |
| | UC-11 | View Regions Behind the Band | When the band is amber or red, view the body regions that are out of range, each with a Watch or Elevated marker, and with the regions critical to the athlete's sport highlighted. | Athlete |
| | UC-12 | View Risk Indicator Radar | View a radar chart of the seven displayed exercise-risk indicators from the latest screening. | Athlete |
| | UC-13 | View Screening Panel | View the latest HoloMotion report read against its thresholds: five tier-marked score gauges and seven indicator strips banded Low, Watch or Elevated, tightened for the regions critical to the athlete's sport, together with the physical-fitness subitem table and the muscle deficiency and tension listings. | Athlete |
| | UC-14 | View Training Focus | View corrective exercises with repetition, set and rest dosing for the most pressing out-of-range regions, drawn from the report's own prescription vocabulary. | Athlete |
| | UC-15 | View Muscle Assessment Map | View front and back body silhouettes with the individually flagged muscles shaded — the twenty-two muscles the screening instrument names — switchable to a five-region view for the range-of-motion and stability scores, which are themselves recorded per region. | Athlete |
| | UC-16 | View Screening History | Select any previous screening by assessment date and view the entire dashboard — indicator, radar, screening panel and muscle map — as it read at that date, alongside a report-to-report progress table showing the change since the first assessment. | Athlete |
| | UC-17 | View Squad Readiness Summary | View a read-only summary of every athlete in the same sport, showing each one's programme, risk band and overall indicator. No clinical or screening detail of another athlete is exposed. | Athlete |
| **Module 2 — Athlete Roster & Identity Management** | UC-18 | Register Athlete Record | Create an athlete on the roster, keyed by their identity-card number, with name, sport, programme, gender, age and the events they compete in. | Administrator |
| | UC-19 | Maintain Athlete Record | Update an athlete's details and events, or remove them from the active roster by soft deletion, preserving their screening history. | Administrator, Medical Staff |
| | UC-20 | Look Up Athlete in the Institute Directory | Search the institute's athlete directory by name or identity-card number and pre-fill a new roster record from the returned details, with results marked according to whether the athlete is already on the roster. | Administrator, Medical Staff |
| | UC-21 | Search Athlete Roster | Locate an athlete by name or identity-card number, filtered by sport, programme and event. | Medical Staff, Administrator |
| | UC-22 | Maintain Event List | Record the events an athlete competes in, choosing from those already in use across the roster or introducing a new one, so the event vocabulary grows with the institute rather than being fixed in code. | Administrator, Medical Staff |
| | UC-23 | Set Athlete Injury Status | Mark an athlete as currently injured, or as recovered, with an explanatory note recording who set it and when. The status is shown on the clinical view and excludes the athlete from cohort-norm computation while it is in force. | Medical Staff, Administrator |
| **Module 3 — Screening Data Ingestion** | UC-24 | Import HoloMotion Reports | Upload one or many HoloMotion report PDFs; extraction runs sequentially, with progress shown for each file and failed files individually re-queueable. | Administrator, Medical Staff |
| | UC-25 | Redact Athlete Name On-Device | Before any page image leaves the machine, locate the athlete's name on the report's first page by local optical character recognition and obscure it, so the only direct identifier the report carries is never transmitted to the extraction model. Where the name cannot be located precisely, the whole information region is obscured instead. | System |
| | UC-26 | Extract Screening Data | Render the report's data pages to images (the report carries no extractable text layer) and read them with a configurable vision model into structured data: headline scores, the eight risk indicators, the twenty-five physical-fitness subitem scores, the summary text and both muscle lists. | System |
| | UC-27 | Preview & Verify Extraction | Review every extracted value against the source report, presented as the dashboards present it, before anything is written to the database. | Administrator, Medical Staff |
| | UC-28 | Attach Report to Roster Athlete | Identify which roster athlete a report belongs to — proposed automatically from the local filename where it matches exactly one athlete, and otherwise chosen by the operator through a name search that fills in the athlete's identifier, sport and programme. | System, Administrator, Medical Staff |
| | UC-29 | Commit Import | Write the athlete's latest values, replace their muscle flags, and append an immutable screening snapshot to the athlete's history. | Administrator, Medical Staff |
| **Module 4 — Cohort Norms & Governance** | UC-30 | Recompute Cohort Norms | Following a commit, recompute each cohort's per-component mean and standard deviation across every tier of the fallback ladder, and re-score every athlete's overall risk indicator. | System |
| | UC-31 | Resolve Cohort Norm Membership | Determine which athletes contribute to a cohort's reference distribution by a single ordered rule — manually excluded, then currently injured, then below the administrator's minimum score thresholds — recording the reason in each case. Membership affects norm computation only; every athlete is still scored. | System |
| | UC-32 | Manage Cohort Thresholds | Review the automatically computed cohorts and approve, edit or revert their per-component values, with edits flagged for review when new data has since arrived; only approved cohorts drive the risk indicator. | Administrator, Medical Staff (when granted) |
| | UC-33 | Version & Restore Cohort Norms | Save the entire set of cohort norms as a named, annotated snapshot, list the saved versions, and restore one — reinstating every cohort's values and re-scoring the population. | Administrator |
| | UC-34 | Tune Norming & Alert Settings | Adjust the minimum cohort size, the worst-performer count, the norm-eligibility score thresholds, the escalation and fallback rules, and the alerting behaviour. | Administrator |
| | UC-35 | Email Risk Alerts | On import commit, email the medical staff and the coaches assigned to the athlete's sport when an athlete falls into an alerting band, and email the sport's coaches when a clinician overrides an athlete to a worse band. | System |
| | UC-36 | Export Data Backup | Download a multi-sheet Excel snapshot of the athlete roster and muscle flags. | Administrator |
| **Module 5 — Analytics & Reporting** | UC-37 | View Screening Cohort Analytics | View screening coverage, the share of athletes in each band per risk indicator, cohort average scores, and the most frequently flagged muscles. | Administrator |
| | UC-38 | Filter Cohort Analytics | Filter the analytics by sport, programme, gender and age group. | Administrator |
| | UC-39 | View Cohort Trend | Compare each athlete's latest screening against their previous one to show how the population is moving between bands. | Administrator |
| | UC-40 | Generate Holistic Screening Report | Generate an organisation-wide screening report presenting coverage, band distribution, population averages, risk hotspots and the athletes needing attention, as visualisations suited to a non-specialist reader. | Administrator |
| | UC-41 | Generate Individual Screening Report | Generate an athlete's report: scores against their cohort, risk evaluation, subitem table, muscle figure, interpretation, and progress between successive screenings. | Administrator, Medical Staff, Athlete (own report only), Coach (assigned sport only) |
| | UC-42 | Generate Team Screening Report | Generate a group report for a sport, programme or gender: group thresholds, athlete ranking, attention table, squad heat map and per-athlete snapshots. | Administrator, Medical Staff, Coach (assigned sport only) |
| **Module 6 — Clinical & Squad Monitoring** | UC-43 | View Athlete Clinical Overview | View the selected athlete's risk indicator, screening panel, risk radar, muscle map, injury status and profile summary in one working view. | Medical Staff |
| | UC-44 | Review Screening History | Select any of an athlete's previous screenings by assessment date and read the whole clinical view as it stood at that date; the band override remains bound to the current screening. | Medical Staff, Coach |
| | UC-45 | Override Risk Band | After assessing an athlete, set their risk band manually with a required explanatory note, shown alongside the calculated band so the divergence is visible; the override applies across the system until the next screening is imported. | Medical Staff |
| | UC-46 | View Squad Readiness Board | View a read-only board of every athlete in the coach's assigned sport, with each athlete's risk band mapped to Full-Go, Observation or Restricted, sorted worst-first, naming each athlete's most concerning screening region and the direction of travel since their previous screening; filterable by programme, gender and event and scoped to the coach's sport on the server. | Coach |
| | UC-47 | View Squad Focus & Needs-Attention | View the squad's shared weak regions and muscle hotspots turned into suggested training adjustments, alongside a list of the athletes requiring attention with the reason each was escalated. | Coach |
| **General Module** | UC-48 | Invite User | Create an account with no password and email the person a six-digit activation code. The password the account is created with is random, hashed and discarded unread, so nobody — including the administrator — can sign in as that user. Re-sending mints a fresh code and invalidates the previous one. | Administrator |
| | UC-49 | Activate Account | Set the first password on an invited account by entering the emailed code. The code is single-use, expires after seven days, and is invalidated after five incorrect entries. | Athlete, Medical Staff, Administrator, Coach, Executive |
| | UC-50 | Set Notification Preferences | Opt out of individual categories of system email from the profile page. The institution setting decides whether a category is sent at all; the user decides only whether they still receive it. | Athlete, Medical Staff, Administrator, Coach, Executive |
| **Module 4 — Cohort Norms & Governance** | UC-51 | Pin Cohort Norm Version | Designate one saved norm version as the norms in force, so a subsequent import holds the published statistics instead of overwriting them; what the new data would have said is parked alongside and the drift between the two surfaced. Restoring over a pin, or deleting the pinned version, is refused. | Administrator |
| | UC-52 | Send Scheduled Institutional Mail | Email the monthly institutional digest, with the holistic report attached, and the rescreen recall list naming who is overdue and who has never been screened. Driven by a persisted month marker rather than a scheduling instant, so a run missed while the host was unavailable is sent late rather than skipped, and guarded by a cross-process lock so two schedulers produce one email. | System |
| | UC-53 | Force a Scheduled Mail Run | Run a scheduled mail immediately and report the outcome, bypassing the due check but never the institution's own on/off switch for that category. | Administrator |
| **Module 5 — Analytics & Reporting** | UC-54 | View Activity Log | Read the append-only trail of actions taken in the system — imports, overrides, norm changes, settings changes, personnel changes, report downloads and data exports — filtered by action and date, with a staff activity rollup that counts reads separately from changes, and a PDF export. | Administrator, Executive |
| | UC-55 | Generate Programme Activity Report | Produce the programme KPI document covering screening coverage, throughput, within-athlete change, seasonality and activity by account, drawn from the same computation the on-screen panel reads so the screen and the document cannot quote different figures. | Administrator, Executive |

---

## Notes for the surrounding text (§4.1.1)

Each of these is defensible and already true of the build:

1. **The General Module is cross-cutting** and is not counted among the six functional modules — the same convention as the FYP I report.
2. **"System" denotes automated behaviour with no human actor** — the FYP I convention, retained.
3. **Four roles ship**: athlete, medical staff, administrator and coach. The coach is a first-class role (read-only, sport-scoped), promoted in FYP II on 2026-07-19 from an earlier experimental spike. It is not future work.
4. **The HoloMotion PDF is the system's sole screening input.** The Excel import was retired 2026-07-12 and archived; the Excel *backup export* remains as UC-36.
5. **The cohort-normed overall risk indicator (UC-8/9) is the system's single risk verdict.** Training load and the composite ACWR model are not computed anywhere in the running system — see note 7.
6. **UC-25 is the privacy contribution and deserves its own paragraph in Chapter 5.** The screening report's only direct identifier is the athlete's name; it is located and obscured locally before any image is transmitted, and the process fails closed — if the name cannot be pinpointed, the entire information region is obscured rather than risking disclosure. The operator then re-attaches the report to a roster athlete locally, so the linkage never leaves the institute either.
7. **Activity Tracking was fully removed 2026-07-20** at JC's explicit request, with the fallout accepted rather than left half-wired. The composite formula (`classifyCompositeRisk()`) is retained as a locked decision but has no caller in the running system. Full history: `ACWR_REBUILD.md`.
8. **Injury logging was removed 2026-08-02** by the HoloMotion-only directive — the system derives everything from the screening instrument, so a parallel, manually maintained injury stream was inconsistent with that premise. What survives (UC-23) is a clinician-set status flag whose purpose is *norm eligibility*: an injured athlete should not shape the reference distribution their peers are judged against. Frame it that way in Chapter 4 — the flag is a governance control, not a shrunken injury log.
9. **The identity key is the athlete's identity-card number** (2026-08-04). Chapter 4 should state this plainly, and Chapter 5 or 7 should acknowledge the trade-off: it is the identifier the institute actually uses, which makes reconciliation with ISN's own records direct, but it is also sensitive personal data now serving as a foreign key. Note the mitigation asymmetry honestly — UC-25 minimises identifiers leaving the machine, while this choice increases their presence within it. **A panellist may well ask; have the answer ready.**
10. **The institute directory (UC-20) is demonstrated against a stand-in.** Say so. It is built as a swappable integration seam so the real ISN source replaces one module without touching routes or interface; the mock exists because directory access has not yet been granted, not because the integration is notional.

---

## Appendix C — UC-1–44 (2026-07-20 numbering) → UC-1–55 (this table)

| Was | Now | Disposition |
|---|---|---|
| UC-1–5 | UC-1–5 | Unchanged |
| UC-6 Manage Staff Permissions | UC-6 | **Broadened** — the page now creates coach and medical accounts and assigns a coach's sport (`/admin/personnel`, merged 2026-08-01) |
| UC-7 | UC-7 | Unchanged |
| UC-8 Compute Overall Risk Indicator | UC-8 | **Extended** — discipline added as the most specific cohort tier (B2) |
| UC-9–14 | UC-9–14 | Unchanged |
| UC-15 View Muscle Assessment Map | UC-15 | **Extended** — the figure now draws the twenty-two individually named muscles, with the five-region view retained for the subitem scores |
| UC-16 View Records *(injury)* | — | **REMOVED** — the injury record it read no longer exists |
| — | UC-16 View Screening History | **NEW** (C2) |
| — | UC-17 View Squad Readiness Summary | **NEW** (C3) |
| UC-17 Log Official Injury | — | **REMOVED**; the status flag that replaces it is UC-23 |
| UC-18 Update Recovery Status | — | **REMOVED** |
| UC-19 View Athlete Injury Records | — | **REMOVED** |
| UC-20 Submit Self-Reported Injury | — | **REMOVED** |
| UC-21 Review Self-Reported Injury | — | **REMOVED** |
| UC-22 Track Self-Report Status | — | **REMOVED** |
| — | UC-18–22 | **NEW module** — roster and identity management: register, maintain, directory lookup, search, event list |
| — | UC-23 Set Athlete Injury Status | **NEW** — all that survives of the old Module 2 (B4) |
| UC-23 Import HoloMotion Reports | UC-24 | Renumbered |
| — | UC-25 Redact Athlete Name On-Device | **NEW as a use case** — built 2026-07, never previously enumerated |
| UC-24 Extract Screening Data | UC-26 | **Narrowed** — posture removed from extraction 2026-08-01 |
| UC-25 Preview & Verify Extraction | UC-27 | Renumbered |
| UC-26 Match Athlete & Complete Identity | UC-28 | **Extended** — filename-derived proposal added (A1) |
| UC-27 Commit Import | UC-29 | Renumbered |
| UC-28 Recompute Cohort Norms | UC-30 | **Extended** — full fallback ladder incl. discipline (B2) |
| — | UC-31 Resolve Cohort Norm Membership | **NEW** (B3/B4/B5) |
| UC-30 Manage Cohort Thresholds | UC-32 | **Extended** — drift flag, and medical access when granted the capability |
| — | UC-33 Version & Restore Cohort Norms | **NEW** (B1) |
| UC-31 Tune Norming & Alert Settings | UC-34 | **Extended** — norm-eligibility thresholds added (B5) |
| UC-29 Email Risk Alerts | UC-35 | **Extended** — override-to-coach notification folded in; the self-report notification went with the cut |
| UC-32 Export Data Backup | UC-36 | **Narrowed** — the injuries sheet is gone; athletes and muscle flags remain |
| UC-33 View Screening Cohort Analytics | UC-37 | **Moved** from Module 4 to Module 5 — it is the admin analytics surface now that the injury analytics are gone |
| UC-35 Filter Injury Data | UC-38 | **Replaced** — the same filter bar now filters cohort analytics |
| UC-36 View Temporal Trends *(injury)* | UC-39 | **Replaced** by the screening cohort trend |
| UC-34 View Injury Overview | — | **REMOVED** |
| UC-37 Generate Injury PDF Report | — | **REMOVED** |
| UC-38 Generate Holistic Screening Report | UC-40 | Renumbered |
| UC-39 Generate Individual & Team Reports | UC-41, UC-42 | **Split** — the two reports have different role scopes |
| UC-40 Search Athlete Roster | UC-21 | **Moved** to the roster module |
| UC-41 View Athlete Clinical Overview | UC-43 | **Narrowed** — the injury-history half is gone |
| — | UC-44 Review Screening History | **NEW** (C2, clinician and coach side) |
| UC-42 Override Risk Band | UC-45 | **Extended** — calculated-versus-in-force provenance and inline note |
| UC-43 View Sport-Level Context *(injury)* | — | **REMOVED** |
| UC-44 View Squad Readiness | UC-46 | **Extended** — per-athlete trend arrow added |
| — | UC-47 View Squad Focus & Needs-Attention | **NEW** — coach cockpit cards |

**Totals:** 44 → 47. Ten removed, thirteen added, six modules throughout.

---

*Revised 2026-08-06 for the HoloMotion-only cut (2026-08-02) and the 2026-08-03 roadmap batch. Supersedes the 2026-07-20 44-use-case table, which described injury logging, self-reports and injury analytics — all since deleted. **Module 2's recast to Athlete Roster & Identity Management was ratified by JC on 2026-08-06**; the alternatives considered are recorded at the top so the choice is defensible rather than merely made.*
