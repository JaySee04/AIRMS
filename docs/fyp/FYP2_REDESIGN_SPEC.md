# AIRMS FYP II — Screening-Centred Redesign (Design Spec)

> **Status:** agreed 2026-07-13, build in progress. This is the anchor document
> for the redesign — it captures the *entire* agreed design so work can resume
> across sessions and is defensible in viva. Update it as stages land.
>
> **Stakeholder direction (Dr Thung / ISN):** shift AIRMS from an ACWR-workload
> centre of gravity to a **HoloMotion-screening** one, with cohort-normed risk,
> clinician override, three report types, and alerting. ACWR is demoted, not
> deleted.

---

## 0. One-paragraph summary

Every athlete takes the same HoloMotion screening. AIRMS ingests each report
(batch, name-matched), stores it as an immutable **screening snapshot**, and
derives an **overall risk indicator** by z-scoring the athlete's screening
components against their **cohort** (sport + programme + gender) and averaging
them (the *Total Score of Athleticism* method). The indicator sits on a
**traffic-light** scale whose bands come from the cohort mean ± SD;
it **escalates** when the athlete is below the cohort mean (+1) and when they
are among the three worst in the cohort (+1). Amber/red or escalated → the
athlete needs assessment; a clinician who checks them can **override** to green
with a note. Cohort thresholds are **auto-computed but admin-approved**.
Imports fire **email alerts** to medical staff and the sport's coaches. Three
**PDF reports** (admin holistic, individual, team) present all of this.

---

## 1. Evidence base (why this design is defensible)

- **z-score + traffic-light** is the accepted sports-science method for
  screening an individual against a sport/sex reference group and flagging who
  needs a closer look. Global Performance Insights (z/T/STEN scores);
  z-score biomonitoring of soccer players & cyclists (arXiv 2510.01810);
  elite-athlete sport/sex normative percentiles (PMC9478009).
- **Total Score of Athleticism (TSA)** — Turner et al.: standardise each
  fitness component to a z-score against the reference group, then average with
  equal weight to get one composite. This is our overall-indicator method and
  removes arbitrary weighting (equal weighting of standardised components is the
  published default). Admin may still tune per-component weights later.
- **Cohort-normed, not absolute** — thresholds are the cohort's own
  mean/SD, so "safe" adapts to sport/programme/gender instead of a universal
  number. Matches Dr Thung's "average threshold per sport, programme, gender."

## 2. Locked decisions carried over

- HoloMotion PDF is the **sole** screening import (Excel retired, archived).
- Report is image-only → vision-AI extraction, preview-before-commit,
  provider-agnostic (Gemini free tier verified).
- Composite personalised-ACWR model (`risk.ts`) is **demoted to a secondary
  training-load view**, not deleted; its logic + rationale are preserved in
  `docs/fyp/ACWR_REBUILD.md` so it can be rebuilt identically.
- The 3-role model + coach experiment stand.

---

## 3. Data model changes

### 3.1 `screenings` — immutable snapshot per import (NEW)
One row per committed HoloMotion import. The `athletes` table keeps holding the
**latest** snapshot (dashboards already read it — backward compatible); every
import ALSO writes a `screenings` history row. History powers progress-over-time
and the individual report's report-to-report deltas.

| Field | Type | Source |
|---|---|---|
| id | PK | |
| athlete_id | VARCHAR FK | operator/match |
| assessed_at | DATE | report "time" |
| imported_by | VARCHAR | committing user |
| total_score, exercise_risks, rom, stability, symmetry | DECIMAL | gauges |
| neck_injury_risk … ankle_injury_risk (8) | DECIMAL | Exercise Risk Evaluation circles (incl. spinal_disc_herniation = LDH — **stored, hidden from displays**) |
| subitems | JSON | 5 regions × {romL,romR,stabL,stabR,sym} (25 values) |
| posture | JSON | 8 axes × {label, value} |
| summary_text | TEXT | page-1 summary comment verbatim |
| muscle_flags | JSON | myodynamia[]/tension[] snapshot |
| overall_indicator | DECIMAL | computed at commit (nullable until cohort exists) |
| overall_band | ENUM(green,amber,red) | computed |
| escalations | INT | 0–3 (was 0–2 before the per-indicator factor) |
| factors | JSON nullable | human-readable escalation reasons, shown on the badge |

### 3.2 `cohort_thresholds` — approved norms (NEW)
One row per (sport, programme, gender) cohort per metric-set version. Holds the
computed mean + SD per component and the approval state.

| Field | Type | Notes |
|---|---|---|
| id | PK | |
| sport, programme, gender | VARCHAR | cohort key (gender nullable for fallback tiers) |
| tier | ENUM(spg, sg, s, all) | which fallback level this row represents |
| n | INT | athletes in cohort at compute time |
| stats | JSON | per-component {mean, sd} for the composite inputs, **plus per-indicator {mean, sd}** for the 7 shown exercise-risk indicators (drives the per-indicator escalation) |
| status | ENUM(pending, approved) | admin approval |
| computed_at, approved_at, approved_by | | audit |
| overrides | JSON nullable | admin edits to mean/sd/weights |

### 3.3 `settings` — admin-tunable knobs (NEW, key/value)
Per Dr Thung's "make it a setting": `min_cohort_n` (default 5),
`fallback_enabled` (default true), `escalation_below_mean` (on),
`escalation_bottom3` (on), `bottom_k` (default 3), **`escalation_indicator`
(on, + `escalation_indicator_high` = 25, `escalation_indicator_z` = 1.5)**, alert
toggles.

### 3.4 `screenings` clinician override fields
`override_band` ENUM nullable, `override_note` TEXT, `override_by`,
`override_at`. Set by medical staff after real assessment; **auto-expires when
a newer screening is imported** (new row, no override).

### 3.5 `athletes` — identity editable on import
name (Title-Cased automatically), age, gender editable in the upload preview;
pre-filled for matched athletes, required for new ones. No schema change.

---

## 4. Extraction expansion (holomotionExtract.js)

Add to the current 8-risk + muscle-list extraction:
- **25 subitem scores** (page 5 table: Neck / Shoulder&Upper Limbs / Torso /
  Pelvis / Lower Limbs × ROM-L, ROM-R, Stability-L, Stability-R, Symmetry).
- **Posture findings** (page 4: 8 axes, each a label + signed deviation value).
- **Summary text** (page 1 comment block, verbatim).
- LDH (`spinalDiscHerniation`) still extracted + stored; **excluded from all
  risk displays** per Dr Thung (ISN facilities don't support that assessment).
Crop bands / prompt extended; `verify:vision` ground truth extended to match.

## 5. Overall risk indicator

`overallIndicator(screening, cohortStats)`:
1. Build component vector: Total Score, ROM, Stability, Symmetry (higher
   better); exercise-risk burden = mean of the **7 shown** indicators, inverted
   (lower better); asymmetry penalty = mean |L−R| across subitem regions,
   inverted.
2. z-score each component against cohort mean/SD.
3. Average z-scores (equal weight — TSA). Map to 0–100 for display.
4. **Band** by z of the composite: green ≥ cohort mean; amber within 1 SD below;
   red > 1 SD below (thresholds = settings).
5. **Escalate**: +1 if composite below cohort mean; +1 if athlete in bottom-`k`
   of cohort; +1 (per-indicator, added 2026-07-19) if one exercise-risk indicator
   is both over the Elevated threshold (≥25) and a peer-outlier on it (per-indicator
   z ≥ 1.5). Count can reach 3; **≥2 escalations → red** ("immediate assessment").
   Admin toggle `escalation_indicator` (+ `escalation_indicator_high` / `_z`);
   reasons persisted in `screenings.factors` and shown on the badge.
6. **Override**: clinician-set band wins until the next import.
Degrades gracefully: cohort with n < `min_cohort_n` → fall back a tier, or if
none, show "insufficient cohort" and skip escalation.

### 5.1 Two corrections to the bottom-`k` rule (2026-07-16)

Measured against the seeded population, **42% of athletes banded red** —
"immediate assessment" for nearly half a squad is not a triage signal. Two
distinct causes, both fixed; the rule's *intent* is unchanged.

**(a) Rank against the cohort, not the fallback stragglers.** §5 says "bottom
`k` **of cohort**", but the implementation grouped athletes by the tier they
*resolved to*. A broad cohort like `s|Athletics` is normed over all 11 Athletics
athletes, yet was ranked over only the handful who also fell back to it — two
live groups had **2 members** with `bottom_k = 3`, so *both* were automatically
"bottom 3" → auto-escalated → red. Ranking peers are now the cohort's full
membership, each peer's z recomputed against that cohort's stats so the
comparison is like-for-like. (`belongsToCohort()` in `utils/overallIndicator.js`.)

**(b) `k` is capped at a share of the cohort.** Fixing (a) alone moved red only
42% → 41%: the volume came from `bottom_k = 3` being a large *fraction* of a
small cohort. `bottom_k = 3` was chosen with real ISN cohorts (~15–30) in mind,
where it means roughly the worst 10–20%; applied literally to a 5-athlete cohort
it means the worst **60%**. So `k = min(bottom_k, max(1, ⌊n × 0.2⌋))` —
`bottom_k` remains the admin's absolute ceiling, and the rule now means the same
thing at every cohort size. (`effectiveK()`, `BOTTOM_SHARE`.)

Result: **green 51% · amber 31% · red 19%**, with the demo anchors preserved
(Thung red 42 / 2 escalations, Nazwan green, John green).

### 5.2 The sport-critical alert is a detail, not a verdict (2026-07-16)

The sport-aware screening banner fired for **59 of 59 screened athletes** —
measured. No threshold rescues it: to make it rare the sport-critical boundary
would have to sit *above* the standard one (~26 vs 25), contradicting its own
tightening-only design, and both ground-truth athletes trip it too. The deeper
issue is that it is an **absolute cut-off** — precisely what this redesign argues
against (§1) — competing with the cohort-normed indicator it duplicates.

It is therefore no longer a verdict: it renders only when the cohort-normed band
is already amber/red, sits **below** the hero, and answers *"which regions are
behind this band"*. Green athletes get no banner; their region detail lives on
the threshold strips and in Training Focus. The coach's squad-level version of
the same banner (which listed 27 of 28 athletes) was removed — the readiness
table is already sorted worst-first and now names each athlete's worst region.

## 6. Cohort-threshold engine + admin approval

- On each import commit, recompute affected cohorts' mean/SD per component.
- New/changed cohorts land as **pending** rows in an admin queue; the computed
  values are **pre-filled and editable**; admin approves or edits.
- Fallback ladder: spg → sg → s → all, first tier meeting `min_cohort_n`.
- Every view (individual + holistic) compares against the **approved** cohort
  norms.

## 7. Three PDF reports (pdfkit, extend routes/reports.js)

1. **Admin holistic** — HoloMotion-sourced, non-expert-friendly **visualisations**
   (cohort band distributions, most-flagged regions, screened coverage,
   worst/attention lists). Not raw tables.
2. **Individual** (admin-approved access) — the athlete's scores, muscle legend,
   risk levels, **thresholds vs peers**, and **deltas between HoloMotion reports**
   (progress over time from `screenings` history).
3. **Team/group** — one sport+programme+gender cohort: group thresholds,
   everyone vs threshold (**ranking**), plus an **attention table** of each
   athlete's parts needing follow-up (for the coach).

**Scale upgrade (2026-07-15, per JC):** all three rebuilt to the density of the
TMG group/individual report format JC provided (AIRMS navy/gold identity kept):
- **Exercise Risk Evaluation** in every report on HoloMotion's printed legend —
  Low 0–15 / Medium 16–55 / High 56–100 zone gauges, printed indicator names
  (Neck Pain … Ankle Sprain), radar chart; LDH still stored-not-shown.
- **Physical Fitness Subitem Score table** (5 regions × ROM L/R, Stab L/R, Sym)
  as tier-coloured score discs on HoloMotion's 60/75/85 boundaries (Below
  Average / Average / Good / Excellent) — individual report + per-athlete
  snapshot blocks for flagged athletes in the team report.
- **Interpretation section** (individual): data-driven bullets — composite z vs
  cohort, below-average components, beyond-Low risks, marked L/R gaps, muscle
  flags, any clinician override.
- Holistic adds screened coverage, exercise-risk hotspots, bands-by-sport.
- Page footers with page numbers; verified by rendering every page to PNG.
- Seeder now generates plausible subitems for the whole screened population
  (Nazwan keeps his real page-5 table) so the tables and the `balance`
  component have real signal.

## 8. Coach view

- Read-only, sport-scoped, HoloMotion-based squad readiness.
- **Comparison of all athletes' HoloMotion risks** in the coach's sports.
- Filter by sport + programme.

## 9. Email alerts (reuse utils/mailer.js)

- Fire on **import commit** (that's when new data arrives → assess immediately,
  don't let it sit).
- Recipients: medical staff + the sport's assigned coaches.
- Trigger: athlete lands amber/red or escalated.
- Uses existing env-driven SMTP (dedicated test Gmail to be provided; console
  fallback meanwhile).

## 10. ACWR demotion

- `classifyCompositeRisk` + ACWR workload remain as a **secondary "Training
  Load" panel**, not the primary risk surface.
- Activity logging stays (feeds training load).
- Full logic + evidence preserved in `docs/fyp/ACWR_REBUILD.md` (rebuild-identical spec).

---

## 11. Build sequence — ALL STAGES BUILT (2026-07-13)

- **A. ✅ Foundation** — `screenings` snapshot model; layout-robust extractor
  (subitems/posture/summary; verified 25/25 live); commit writes history;
  Thung stale snapshot + nazwan 2nd ground-truth seeded.
- **B. ✅ Cohort engine** — `cohort_thresholds` + `settings`; compute-on-import;
  admin approval queue (`/admin/thresholds`) + tunable settings. 40 cohorts.
- **C. ✅ Indicator** — TSA z-score composite + escalation band + clinician
  override; traffic-light on athlete/medical/coach.
- **D. ✅ Reports** — holistic / individual / team PDFs (`routes/screeningReports.js`),
  triggered from the admin PDF Reports page.
- **E. ✅ Alerts** — import-commit email to medical + the sport's coaches
  (`utils/alerts.js`).
- **F. ✅ ACWR demotion** — dashboards label the ACWR hero "Secondary · Training
  Load"; overall indicator is primary; `ACWR_REBUILD.md` written; docs updated.

**Remaining (JC to verify, see `JC_CHECKLIST.md`):** eyeball the three PDFs in a
real viewer, the traffic-light surfaces, the admin thresholds page, and the
override flow; decide on the small-cohort band distribution; provide the test
Gmail for live alert mail.

## 12. Open confirmations (resolved 2026-07-13)

1. z-score TSA composite + traffic-light — ✅
2. cohort fallback + **min-n as admin setting** — ✅ (settings, not hardcoded)
3. extract subitems + posture + summary; LDH stored not shown — ✅
4. alerts reuse SMTP, fire on commit; dedicated test Gmail incoming — ✅
5. seed nazwan as 2nd ground-truth athlete — ✅

## 13. Test assets

- `thung jin seng_0122663031.pdf` — ground-truth athlete ATH0061.
- `rpt_2025-08-13_muhammad nazwan bin abdullah_*.pdf` — 2nd genuine HoloMotion
  (Total 78, ExRisks 14, ROM 71 / Stab 82 / Sym 88; subitems on page 5; risks
  Neck 14 / Shoulder 8 / Scoliosis 12 / LDH 16 / AntPelvic 16 / Joint 15 /
  Ligament 21 / Ankle 26). Provided in-chat — use for batch demo + ground truth.
- **File-access rule:** only use PDFs the user attaches in chat; do not browse
  the user's folders.

*Compiled 2026-07-13. Amend as stages land.*
