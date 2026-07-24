# AIRMS — The Six Modules, As Built

> **Status: restructured 2026-07-20.** Module 1 (Activity Tracking & Logging)
> was fully removed that day, with the fallout accepted (see
> `MASTER_CLARIFICATIONS.md §4`). Rather than leave a hole or drop to five
> modules, JC asked to redistribute the surviving feature set across a fresh
> set of six. The old "Screening Data Management & Cohort Norms" module (the
> largest, 10 UCs) is split into **Screening Data Ingestion** and **Cohort
> Norms & Governance**; every other module keeps its shape, just renumbered.
> Names here match the use-case model in `FYP2_MODULES_USECASES.md` exactly —
> that file is the source of truth (including Appendix B, the interim → final
> UC-number mapping) if this one and it ever disagree.
>
> **Companion:** [`FYP2_MODULES_USECASES.md`](FYP2_MODULES_USECASES.md) — the
> full FDD-style use-case model (44 live UCs, clean UC-1–44 numbering, roles
> per use case, FYP I → FYP II mapping); that file is the report-ready Table
> 4.1 replacement, this one is the module narratives.

---

## The list

| # | Module | UCs | Roles |
|---|---|---|---|
| G | General *(cross-cutting, not counted)* | UC-1–7 | All + System |
| 1 | **Athlete Dashboard & Overall Risk Indicator** | UC-8–16 | Athlete + System |
| 2 | **Injury & Recovery Logging** | UC-17–22 | Medical, Athlete |
| 3 | **Screening Data Ingestion** | UC-23–27 | Admin, Medical + System |
| 4 | **Cohort Norms & Governance** | UC-28–33 | Admin + System |
| 5 | **Analytics & Reporting** | UC-34–39 | Admin |
| 6 | **Clinical & Squad Monitoring** | UC-40–44 | Medical, Coach *(experimental)* |

**One sentence for the viva:** athletes read one cohort-normed screening
verdict (1); injuries flow through a clinical pipeline (2); HoloMotion
reports are ingested by vision AI (3) under an admin-governed norm engine
(4); the organisation analyses and reports on all of it (5); and clinicians
and coaches monitor individuals and squads with override authority where it
belongs (6). Module 1 (Activity Tracking) was fully removed 2026-07-20; the
gap it left was closed by splitting the old data-management module in two
rather than dropping to a five-module system — see the status note above.

---

## General Module — Authentication & Access *(UC-1–7)*

JWT login with role-based redirect; email-OTP password reset (single-tab,
3-step); in-place change-password under the complexity policy; view profile.
RBAC enforced server-side on every route and mirrored client-side; on top of
it, per-staffer feature permissions (opt-out) that the admin manages — revoked
features vanish from the UI and are blocked at the API regardless.

## Module 1 — Athlete Dashboard & Overall Risk Indicator *(UC-8–16)*

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
map, and injury records.

*(Was Module 2 before the 2026-07-20 restructure. Activity Tracking — the old
Module 1 — was fully removed that day: its ACWR/composite-risk display had
already left this dashboard on 2026-07-16, and once nothing was left to
surface the training-load data it produced, the recent-activity table and the
sharp-drop prompt on this page went with it, along with the module itself.
`classifyCompositeRisk()` is unchanged in `lib/risk.ts` — the formula is a
locked decision — but has zero live callers now. Full history:
`ACWR_REBUILD.md`.)*

## Module 2 — Injury & Recovery Logging *(UC-17–22)*

Medical staff record official injuries through the five-step pro-team intake
(context on athlete selection, recurrence detection, enum-locked fields,
time-loss-anchored severity) and progress recovery status. Athletes submit
self-reports that land Pending; medical review either promotes them into the
official injury record in a single transaction or rejects with a note; athletes
track their submissions' status.

*(Was Module 3; unchanged in substance, renumbered.)*

## Module 3 — Screening Data Ingestion *(UC-23–27)*

The **sole** screening import path (HoloMotion PDF; Excel import retired
2026-07-12): batch upload → vision-AI extraction of the full report (scores,
8 risk indicators including stored-only LDH, 25 subitem scores, posture,
summary, muscle lists) → human preview/verify → name-matched,
identity-editable commit that upserts the athlete, replaces muscle flags and
appends an **immutable screening snapshot**.

*(Was the first half of the old Module 4, "Screening Data Management & Cohort
Norms" — split 2026-07-20 into a pure ingestion pipeline and the governance
module below, since the two are genuinely different jobs: getting data in,
vs. administering the norms it feeds.)*

## Module 4 — Cohort Norms & Governance *(UC-28–33)*

Each commit burst triggers one debounced recompute of cohort norms +
indicator re-score, and email alerts go to medical staff and the sport's
coaches for amber/red athletes. The admin governs the norms (approval queue,
editable means, recompute) and the knobs (min cohort size, bottom-k,
escalation/alert toggles), reads the HoloMotion screening cohort analytics
(coverage, band share per indicator, averages, most-flagged muscles), and can
export the Excel backup at any time.

*(Was the second half of the old Module 4, plus "View Screening Cohort
Analytics" moved in from the old Analytics & Reporting module — cohort
coverage is reporting on the norm engine's own health, which belongs with
governance rather than injury analytics.)*

## Module 5 — Analytics & Reporting *(UC-34–39)*

The admin's organisation-wide injury view: live injury KPIs with 8 filters,
distribution and temporal-trend charts. Three server-rendered PDF
generators: the filtered injury report and two screening reports — holistic
(admin) and individual/team (with cohort comparison, subitem tier table,
interpretation and progress deltas; athletes may download their own
individual report) — modelled on the TMG report format.

*(Was Module 5; loses screening cohort analytics to Module 4 above, keeps
everything else.)*

## Module 6 — Clinical & Squad Monitoring *(UC-40–44)*

The human-in-the-loop surface. Medical staff search the roster and open a
per-athlete clinical overview — the same indicator hero, radar, screening panel
and body map the athlete sees, plus the chronological injury history,
sport-level context, and a pre-filled "+ Log Injury" deep link. Their
decisive affordance is the **clinician override**: set the band
green/amber/red with a required note; it wins everywhere until the next
import. The **coach** (FYP II first-class 4th role) gets a read-only
squad-readiness board scoped to their one admin-assigned sport: every
athlete's indicator mapped to Full-Go / Observation / Restricted (the same
band medical sees), sorted worst-first with the worst screening region named.
No in-page filters; coaches edit nothing.

*(Was Module 6. The prevention-insight card and the recovery baseline were
removed 2026-07-20 along with Activity Tracking, their only data source.)*

---

## Original FDD → as-built (what a panellist would ask)

| FYP I # | FYP I name | As-built module (2026-07-20) | Main alteration |
|---|---|---|---|
| 1 | Activity Tracking & Logging | **Removed entirely; not renumbered into any module** | ACWR display removed from all dashboards 2026-07-16; with nothing left to surface its output, the module — logging page, backend models/routes, recovery baseline, prevention insight, sharp-drop prompt — was removed 2026-07-20 at JC's request. The gap this left in the module count was closed by splitting Data Management (below) into two, not by reviving this one |
| 2 | Athlete Dashboard / Workload | Module 1 — Athlete Dashboard & Overall Risk Indicator | the verdict changed: cohort-normed screening indicator instead of ACWR workload bands; ACWR hero, load tiles and workload chart removed 2026-07-16; recent-activity table and sharp-drop prompt removed 2026-07-20 |
| 3 | Injury & Recovery Logging | Module 2 — Injury & Recovery Logging | intake upgraded to the five-step workflow; no record deletion (clinical records are append-and-amend) |
| 4 | Data Management | Module 3 — Screening Data Ingestion, **split 2026-07-20 into** Module 4 — Cohort Norms & Governance | Excel import → HoloMotion vision-AI pipeline; the ingestion pipeline and the norm-governance/alerting/analytics half were one module through 2026-07-16, split in two on 2026-07-20 to fill the slot Module 1's removal left |
| 5 | Admin Injury Analytics | Module 5 — Analytics & Reporting | + the three screening PDFs (now two, after individual/team merged); loses screening cohort analytics to Module 4 |
| 6 | Medical Staff Dashboard | Module 6 — Clinical & Squad Monitoring | + clinician override; the coach (first-class 4th role) has its own read-only squad board. Prevention insight + recovery baseline removed 2026-07-20 (their only data source, Activity Tracking, was removed) |

*Rewritten 2026-07-16; fully restructured 2026-07-20 following Activity
Tracking's removal (six modules preserved by splitting Data Management
rather than dropping to five). If this file disagrees with
`FYP2_MODULES_USECASES.md` or the code, those win — tell Claude and this
gets fixed.*
