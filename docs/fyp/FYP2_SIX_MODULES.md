# AIRMS — The Six Modules, As Built

> **Status:** rewritten clean 2026-07-16 (supersedes the 07-15 draft, which
> accumulated stale ACWR references as the removal landed mid-flight). The six
> functional modules of the shipped system, plus the cross-cutting General
> module. Names here match the use-case model exactly.
>
> **Companion:** [`FYP2_MODULES_USECASES.md`](FYP2_MODULES_USECASES.md) — the
> full FDD-style use-case model (52 UCs, roles per use case, FYP I → FYP II
> mapping); that file is the report-ready Table 4.1 replacement, this one is
> the module narratives.

---

## The list

| # | Module | UCs | Roles |
|---|---|---|---|
| G | General *(cross-cutting, not counted)* | UC-1–7 | All + System |
| 1 | **Activity Tracking & Logging (sRPE)** | UC-8–12 | Athlete |
| 2 | **Athlete Dashboard & Overall Risk Indicator** | UC-13–22 | Athlete + System |
| 3 | **Injury & Recovery Logging** | UC-23–28 | Medical, Athlete |
| 4 | **Screening Data Management & Cohort Norms** | UC-29–38 | Admin, Medical + System |
| 5 | **Analytics & Reporting** | UC-39–45 | Admin |
| 6 | **Clinical & Squad Monitoring** | UC-46–52 | Medical, Coach *(experimental)* |

**One sentence for the viva:** athletes log training (1) and read one
cohort-normed screening verdict (2); injuries flow through a clinical pipeline
(3); HoloMotion reports are ingested by vision AI under admin-governed cohort
norms (4); the organisation analyses and reports on all of it (5); and
clinicians and coaches monitor individuals and squads with override authority
where it belongs (6).

---

## General Module — Authentication & Access *(UC-1–7)*

JWT login with role-based redirect; email-OTP password reset (single-tab,
3-step); in-place change-password under the complexity policy; view profile.
RBAC enforced server-side on every route and mirrored client-side; on top of
it, per-staffer feature permissions (opt-out) that the admin manages — revoked
features vanish from the UI and are blocked at the API regardless.

## Module 1 — Activity Tracking & Logging (sRPE) *(UC-8–12)*

Athletes log sessions (type, date, duration, RPE); the system persists
`load = duration × intensity` at write time (the locked, literature-anchored
sRPE method) with a live preview and qualitative band; history is filterable
with edit and delete. **No ACWR appears here or anywhere else in the UI** — the
load history feeds the recovery baseline (Module 6) and the dashboard's
sharp-drop prompt, not a displayed verdict. The composite ACWR model itself is
retained in `lib/risk.ts` and still executes silently (see `ACWR_REBUILD.md`).

## Module 2 — Athlete Dashboard & Overall Risk Indicator *(UC-13–22)*

The FYP differentiator surface, and deliberately a **one-verdict page**. The
hero is the cohort-normed indicator: six oriented screening components z-scored
against the athlete's approved cohort (sport × programme × gender with a
fallback ladder), averaged equal-weight (Total Score of Athleticism), mapped to
0–100 (50 = cohort average), and banded by escalation — +1 below the cohort
average, +1 among the cohort's worst (bottom-k, capped at 20% of the cohort).
Behind the verdict, in explanatory order: the regions-behind-the-band detail
(amber/red only), the 7-axis risk radar (LDH stored, never shown), the
HoloMotion screening panel on the unified Low/Watch/Elevated bands with
sport-tightened thresholds, Training Focus corrective work, the muscle body
map, recent activity and injury records, and the sharp-drop prompt.

## Module 3 — Injury & Recovery Logging *(UC-23–28)*

Medical staff record official injuries through the five-step pro-team intake
(context on athlete selection, recurrence detection, enum-locked fields,
time-loss-anchored severity) and progress recovery status. Athletes submit
self-reports that land Pending; medical review either promotes them into the
official injury record in a single transaction or rejects with a note; athletes
track their submissions' status.

## Module 4 — Screening Data Management & Cohort Norms *(UC-29–38)*

The data spine. HoloMotion PDF is the **sole** screening import (Excel import
retired 2026-07-12): batch upload → vision-AI extraction of the full report
(scores, 8 risk indicators including stored-only LDH, 25 subitem scores,
posture, summary, muscle lists) → human preview/verify → name-matched,
identity-editable commit that upserts the athlete, replaces muscle flags and
appends an **immutable screening snapshot**. Each commit burst triggers one
debounced recompute of cohort norms + indicator re-score, and email alerts go
to medical staff and the sport's coaches for amber/red athletes. The admin
governs the norms (approval queue, editable means, recompute) and the knobs
(min cohort size, bottom-k, escalation/alert toggles), and can export the
Excel backup at any time.

## Module 5 — Analytics & Reporting *(UC-39–45)*

The admin's organisation-wide view: live injury KPIs with 8 filters,
distribution and temporal-trend charts, and the HoloMotion screening cohort
analytics (coverage, band share per indicator, averages, most-flagged muscles).
Four server-rendered PDF generators: the filtered injury report and the three
screening reports — holistic (admin), individual (with cohort comparison,
subitem tier table, interpretation and progress deltas; athletes may download
their own), and team/group (thresholds, ranking, attention table, per-athlete
snapshots) — modelled on the TMG report format.

## Module 6 — Clinical & Squad Monitoring *(UC-46–52)*

The human-in-the-loop surface. Medical staff search the roster and open a
per-athlete clinical overview — the same indicator hero, radar, screening panel
and body map the athlete sees, plus the chronological injury history, the
prevention-insight card, sport-level context, the recovery baseline, and a
pre-filled "+ Log Injury" deep link. Their decisive affordance is the
**clinician override**: set the band green/amber/red with a required note; it
wins everywhere until the next import. The **coach** (FYP II first-class 4th role)
gets a read-only squad-readiness board scoped to their one admin-assigned sport:
every athlete's indicator mapped to Full-Go / Observation / Restricted (the
same band medical sees), sorted worst-first with the worst screening region
named. No in-page filters; coaches edit nothing.

---

## Original FDD → as-built (what a panellist would ask)

| # | FYP I name | As-built name | Main alteration |
|---|---|---|---|
| 1 | Activity Tracking & Logging | Activity Tracking & Logging (sRPE) | unchanged surface; sole training-load view — ACWR removed from all dashboards 2026-07-16 (still computed silently for the recovery baseline) |
| 2 | Athlete Dashboard / Workload | Athlete Dashboard & Overall Risk Indicator | the verdict changed: cohort-normed screening indicator instead of ACWR workload bands; ACWR hero, load tiles and workload chart removed |
| 3 | Injury & Recovery Logging | *(unchanged)* | intake upgraded to the five-step workflow; no record deletion (clinical records are append-and-amend) |
| 4 | Data Management | Screening Data Management & Cohort Norms | Excel import → HoloMotion vision-AI pipeline; + immutable history, cohort-norm governance, import-commit alerts; backup export stays |
| 5 | Admin Injury Analytics | Analytics & Reporting | + screening cohort analytics and the three screening PDFs |
| 6 | Medical Staff Dashboard | Clinical & Squad Monitoring | + clinician override, prevention insight, recovery baseline; the coach (first-class 4th role) has its own read-only squad board |

*Rewritten 2026-07-16. If this file disagrees with `FYP2_MODULES_USECASES.md`
or the code, those win — tell Claude and this gets fixed.*
