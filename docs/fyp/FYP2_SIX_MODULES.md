# AIRMS — The Six Modules, As Built (Draft)

> **Status:** draft for JC, 2026-07-15. Takes the **original six FDD modules**
> (login/General excluded) and rewrites each so its definition matches the system
> **as it actually stands now**, after the screening-centred redesign. No new
> build work — this is the six we have, re-described to fit reality. Each entry
> lists what the module *is now* and **what changed vs the original FDD**.
> The count stays six; the coach view and the redesign features fold into the
> existing modules rather than adding a seventh.

---

## Module 1 — Activity Tracking & Load Monitoring
*Role: Athlete · pages: `/athlete/activity`*

**What it is now:** Athletes log training sessions; the system computes internal
load via **sRPE** (`load = duration × intensity`, Sequelize hook), with a live
load-band preview, filterable history, delete, and an 8-week workload trend that
feeds the ACWR calculation.

**What changed vs the FDD:** functionally intact, but as of **2026-07-16 this page
is the *only* place training load appears**. ACWR was removed from every
dashboard (it was out-shouting the primary screening indicator), so Module 1 no
longer feeds a dashboard verdict — it feeds the recovery baseline and the
sharp-drop prompt. sRPE stays as the locked, showcased method, and the composite
model is retained in `lib/risk.ts` (rebuild spec: `ACWR_REBUILD.md`).

---

## Module 2 — Athlete Dashboard & Injury-Risk Indicator
*Role: Athlete · pages: `/athlete/dashboard`*

**What it is now:** The athlete's risk picture, led by the **cohort-normed overall
risk indicator** — a traffic-light badge (green/amber/red, 0–100) derived by
z-scoring the athlete's HoloMotion screening against their cohort (sport ×
programme × gender) and averaging (Total Score of Athleticism), then escalating
when they fall below the cohort mean or into its bottom-*k*. Below it: the
embedded **HoloMotion screening panel** (tier-ticked gauges + eight indicator
threshold strips + muscle-flag chips), the **body map**, the **risk radar**, the
**secondary composite ACWR / Training-Load hero**, recent activity, and injury
records.

**What changed vs the FDD:** the dashboard's headline moved from the ACWR
composite to the **screening-based overall indicator** — this is now the FYP
differentiator surface. As of **2026-07-16 the ACWR composite hero, the load
stat tiles and the Workload Trend chart are gone from the dashboard entirely**
(not merely demoted): they were visually dominating the primary indicator and
gave the athlete three competing verdicts. Module 2 is now **purely screening** —
indicator hero + radar + screening panel + body map + records. The composite
model is retained in `lib/risk.ts` and still executes (recovery baselines,
prevention insight); training load lives on Module 1.

---

## Module 3 — Injury & Recovery Logging
*Role: Medical (+ Athlete self-report) · pages: `/medical/injury-log`, `/medical/review-reports`, `/athlete/injury-report`*

**What it is now:** Medical staff record official injuries against athlete records
(enum-locked intake, five-step pro-team workflow, recurrence detection,
time-loss-anchored severity); athletes submit self-reports that medical
**reviews and, on approval, promotes into an official `Injury` record** inside a
single transaction.

**What changed vs the FDD:** essentially unchanged — this module already matched
the shipped system. Recovery-status tracking remains `Recovering / Recovered /
Chronic`; structured milestone tracking is still deferred (Dr Thung's schema not
locked).

---

## Module 4 — Screening Data Management & Cohort Norms
*Role: Admin / Medical · pages: `/admin/data-upload`, `/medical/data-upload`, `/admin/thresholds`*

**What it is now:** The data governance spine. **HoloMotion PDF vision-AI
ingestion** is the sole import path — batch-capable, name-match autofill against
the roster, searchable 52-sport list, editable identity (name Title-Cased, age,
gender), preview→commit. Each commit writes an **immutable screening snapshot**
and then, in one pass: **recomputes the cohort norms**, and **fires email alerts**
to medical staff + the sport's coaches for any athlete who lands amber/red or
escalated. The admin **cohort-threshold approval queue** (`/admin/thresholds`)
lets the admin approve or edit the auto-computed per-cohort mean/SD and tune the
settings (min cohort size, bottom-*k*, escalation/alert toggles). The Excel
**backup export** remains.

**What changed vs the FDD:** grew from "Data Management (import + backup)" into the
module that also **owns the cohort-norm engine, its admin approval, and the
import-commit alerting** — because all three are driven by the import. The Excel
*import* was retired (archived); the Excel *backup* stays.

---

## Module 5 — Analytics & Reporting
*Role: Admin · pages: `/admin/dashboard`, `/admin/reports`*

**What it is now:** The admin analytics + reporting surface. The **injury analytics
dashboard** (4 KPI cards, body-part / injury-type distribution charts, monthly
trend, 8 filters incl. age group) plus a **live PDF report generator**: the
existing multi-page **injury report**, and the three **cohort-normed screening
reports** — *holistic* (organisation-wide visualisations), *individual*
(scores + muscle legend + thresholds-vs-peers + report-to-report progress
deltas), and *team/group* (group thresholds + athlete ranking + a coach
attention table).

**What changed vs the FDD:** "Injury Analytics" widened to **Analytics &
Reporting** to include the three screening PDF reports that the redesign added —
so the module now reports on both the injury record *and* the screening cohort.

---

## Module 6 — Clinical & Squad Monitoring Dashboard
*Role: Medical / Coach · pages: `/medical/dashboard`, `/coach/dashboard`*

**What it is now:** The human-in-the-loop monitoring surface. Medical staff
search/filter the roster and open a per-athlete view that mirrors the athlete's
own dashboard (same risk indicator, screening panel, workload chart, risk radar,
body map, injury history) plus clinician affordances: the **prevention-insight
card**, a deep-linked "+ Log Injury", and — new — the **clinician override**,
which lets an assessed athlete be moved to green/amber/red with a required note
(auto-expires on the next import). The **coach** gets a read-only, sport-scoped
**squad-readiness view**: all athletes in their sport(s) with their overall-risk
badges side by side, filterable by sport + programme.

**What changed vs the FDD:** "Medical Dashboard" broadened to **Clinical & Squad
Monitoring** — it now carries the **clinician override** affordance and absorbs
the read-only **coach squad view** as a second role on the same monitoring
surface, rather than spawning a separate module.

---

## At a glance — original → as-built

| # | Original FDD name | As-built name | Main alteration |
|---|---|---|---|
| 1 | Activity Tracking & Logging | Activity Tracking & Load Monitoring | ACWR/workload reframed as the *secondary* training-load signal |
| 2 | Athlete Dashboard / Workload | Athlete Dashboard & Injury-Risk Indicator | headline = cohort-normed screening indicator; ACWR demoted to secondary |
| 3 | Injury & Recovery Logging | *(unchanged)* | already matched the shipped system |
| 4 | Data Management | Screening Data Management & Cohort Norms | + cohort-norm engine, admin approval, import-commit alerts; Excel import retired |
| 5 | Injury Analytics | Analytics & Reporting | + the three cohort-normed screening PDF reports |
| 6 | Medical Dashboard | Clinical & Squad Monitoring Dashboard | + clinician override + read-only coach squad view |

Login / General (auth + RBAC + password management) is unchanged and is **not**
counted among the six.

---

*Compiled 2026-07-15. Rename any of the six freely — the point is that all six
now describe the system that actually exists. Pair with
[`FYP2_REDESIGN_SPEC.md`](FYP2_REDESIGN_SPEC.md) (the redesign detail) and
[`../MODULES_STATUS.md`](../MODULES_STATUS.md) (per-module status).*
