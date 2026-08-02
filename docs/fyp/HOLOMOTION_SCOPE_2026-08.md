# HoloMotion-only scope + open decisions (2026-08-01)

This captures the direction JC set on 2026-08-01 and the decisions still open,
so we can pick them up after this session's to-do list is done.

## The directive

> "The current mission of the website should be to process everything given the
> data of the HoloMotion PDFs only. There should be nothing else that powers the
> website. Injury concerns generated from the insights of data from the
> HoloMotion PDF should be given the green light. Any other aspect that does not
> involve the HoloMotion PDF input should be flagged (not removed yet)."

So: HoloMotion PDF is the single source of truth. Anything derived from it
(scores, ROM/stability/symmetry, the 7 exercise-risk indicators, muscle
imbalance, cohort norms, the overall indicator) stays. Anything fed by another
input is flagged below for JC to decide on — **nothing in this list has been
removed.**

## ✅ RESOLVED 2026-08-02 — all of the below were REMOVED

JC decided: *"remove both. as long as it is not HoloMotion PDF related, remove
it."* Every flagged feature below was **fully deleted** (code, models, DB
tables, seeder, UI) — HoloMotion PDF is now the sole data source. The admin
dashboard was rebuilt chart-first as "Screening Analytics". This gutted FDD
Module 2 (Injury & Recovery Logging) and the injury half of Module 5, so the
report/FDD/viva narrative + CLAUDE.md need a matching pass (JC's call). The
dormant ACWR/locked files (`lib/risk.ts`, `AcwrGauge`, `WorkloadChart`) were
KEPT — non-HoloMotion but locked per CLAUDE.md §12 with no live callers.

## 🚩 The features that were flagged, then removed (2026-08-02)

| # | Feature | Where it lives | Note |
|---|---------|----------------|------|
| 1 | **Athlete self-reporting** | `athlete/injury-report`, `SelfReport` model, `routes/selfReports.js`, `medical/review-reports`, `notify_self_report` email | Athlete-typed, no PDF involved |
| 2 | **Manual injury logging** | `medical/injury-log`, `Injury` model, `routes/injuries.js` | Hand-entered. NOTE: the PDF's *Exercise Risk Evaluation* (Ankle Sprain, Ligament Strain, LDH, …) IS HoloMotion-derived and stays — only the manual CRUD is flagged |
| 3 | **Active-injury floor on the indicator** | `overallIndicator.js` (`escalation_injury`) | Depends on the hand-logged injuries in #2, so it inherits the flag |
| 4 | **Non-PDF roster metadata** | Sport, programme, disciplines/events | **Needed** for Dr Thung's slicing by sport. Age + gender come from the PDF; sport/programme/events are operator-assigned. Flagged for awareness only |
| 5 | **Injury-framed labels** | Sidebar "Injury Analytics", "Recovery & Trends" | Reframe (not remove) toward HoloMotion as the admin dashboard is rebuilt |

**Decision needed:** for each of #1–3, keep / hide from UI but keep code / remove
entirely. Recommendation: keep #4 (needed), reframe #5, and decide #1–3 together
once the HoloMotion-centric admin dashboard + reports land (they may make the
manual streams redundant, or you may keep self-report as the between-sessions
channel — see `memory/self-report-purpose`).

## ✅ RESOLVED 2026-08-02 — Cohort Norm settings

JC decided to **keep** the norming knobs but **move them off the Cohort Norms
page** onto a dedicated admin **Settings** page (`admin/settings`), reached via a
"Settings" button on the Cohort Norms page (admin-only; medical norm-editors
never see it). The Cohort Norms page now shows only the norm *values* table +
Recompute. Two **dead** tiles were removed in the process: the **Active-injury
floor** (its `escalation_injury` setting was deleted with the injury features on
2026-08-02) and **Self-report → medical** (its `notify_self_report` setting went
with self-reporting). Both had been writing settings the backend no longer reads.
The surviving knobs (min-n, bottom-k, below-mean, per-indicator, fallback,
auto-overwrite) and the three live notification toggles all stay. The plain-terms
table below is retained for the viva rationale.

The **Cohort Norms** page (`admin/thresholds`) had a settings card separate from
the norm values. JC asked whether these are necessary. Here's each knob in plain
terms:

| Setting | What it does | Keep? |
|---------|--------------|-------|
| **Min cohort size (n)** | A cohort needs at least this many athletes before its norm is used; smaller cohorts fall back a tier (sport+prog+gender → sport+gender → sport → all). Default 5. | Likely keep — stops a 2-athlete "cohort" from defining the average |
| **Bottom-k escalation** | The worst *k* athletes in a cohort get +1 escalation (a locked FYP decision, capped at 20% of the cohort). Default 3. | Keep (locked) — but the *number* is tunable |
| **Below-mean escalation** | +1 escalation when an athlete is below the cohort average. | Keep — core of the indicator |
| **Per-indicator escalation** | +1 when one exercise-risk indicator is Elevated AND the athlete is a peer-outlier on it. | Keep |
| **Active-injury floor** | Floors the band at amber for a significant active injury. | **Tied to flagged item #3** — decide with the injury streams |
| **Fallback ladder** | Enables the tier fallback described above. | Keep |
| **Auto-overwrite manual norms** (NEW 2026-08-01) | OFF (default): an import keeps your edited norm and flags it "review · new data". ON: an import replaces your edit with the freshly computed norm. | New — your call on the default |

**Recommendation:** keep the four escalation/fallback toggles (they tune the
HoloMotion-derived indicator, so they're in-scope), decide the active-injury
floor alongside the injury streams (#3), and consider hiding "Min cohort size"
and "Bottom-k" behind an "Advanced" disclosure rather than removing them — they
are rarely touched but defensible in the viva. Nothing here is removed yet.

## What changed this session (2026-08-01)

- **Email band wording** made consistent (semantic labels everywhere, not raw amber/red). Email delivery re-verified.
- **Posture Evaluation removed** from the whole pipeline (extraction, model, upload, reports, dashboards). Orphan DB column drops on next `npm run seed`.
- **Personnel page** merges the old Coaches + Staff Permissions pages; admins can now create coach *and* medical accounts in one place.
- **Cohort norms auto-generate + go live on every import**; manual edits are kept and flagged when data drifts; medical staff with the new `editCohortNorms` capability can edit norms via the API. New `norm_auto_overwrite` setting.
