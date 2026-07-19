# AIRMS FYP II — New Research Directions & New Modules (Draft)

> **Status:** draft for JC's assessment, 2026-07-15. Grounds a FYP II proposal on
> the screening-centred redesign already shipped (see
> [`FYP2_REDESIGN_SPEC.md`](FYP2_REDESIGN_SPEC.md)). Everything here is a
> *proposal* — nothing is built yet. Citations are anchor candidates: real,
> widely-cited works chosen for fit; **verify exact year/DOI and 5-year recency
> against the FYP reference rule before quoting them in the report.**

---

## 0. The one-paragraph thesis for FYP II

FYP I built a **descriptive** injury-risk system: it ingests a HoloMotion
screening, compares an athlete to their cohort (z-score / Total Score of
Athleticism), and shows a traffic-light band *right now*. FYP II's research
question is the next one every sports-medicine practitioner actually asks:
**"so what happens next, and does this score actually predict injury?"** The
FYP II contribution is therefore to turn AIRMS from a *snapshot* into a
**longitudinal, predictive, and validated** decision-support system — closing
the loop from *flag → predict → intervene → recover → re-screen → measure* — and
to **evaluate** whether the risk indicator holds up against real injury
outcomes. This directly answers the FYP II rubric's shift toward
implementation + deployment + **evaluation results**, and it fixes the FYP I
report's biggest weakness (overclaimed outcomes with no evaluation chapter).

---

## 1. What the current build gives us to stand on

The redesign already shipped the substrate the new research needs:

| Asset (already built) | What it unlocks for FYP II |
|---|---|
| `screenings` **immutable history** table (one snapshot per import) | Repeated-measures / time-series data → trajectory + prediction |
| **Cohort-norm engine** (z-score vs sport×programme×gender) | A defensible feature space for a predictive model |
| **Composite indicator + escalation** (transparent, factor-attributed) | An *explainable* baseline to validate and to compare ML against |
| **Injury + self-report tables** (with dates, body part, mechanism) | Ground-truth **outcome labels** to validate risk against |
| **HoloMotion vision-AI pipeline** with `verify:vision` ground truth | A ready-made **extraction-accuracy evaluation** study |
| **ACWR demoted, not deleted** | A built-in comparison arm (workload-only vs screening-composite) |

The key point for the viva: **we are not starting a new project — we are
extending a working one with the exact data structures the new research
requires.** That is the strongest possible position for the 25% "technical
implementation" item.

---

## 2. New research directions (literature clusters)

Four clusters. R1 + R2 are the recommended core (they carry the thesis and the
evaluation rubric); R3 + R4 are supporting depth.

### R1 — Predictive injury-risk modelling from longitudinal screening
**Gap:** the current indicator is cross-sectional and descriptive. The field
has moved toward *predictive* models that use repeated athlete-monitoring data.
**Question:** can screening trajectories (change over successive HoloMotion
reports) predict a future injury or a future red band better than a single
snapshot?
**Anchor literature (verify):** Van Eetvelde et al. — *systematic review of
machine learning in sports injury prediction*; Rossi et al. — *ML on training
workload to forecast injury*; Bullock et al. — *ML injury-risk in athletes*;
Claudino et al. — *current use of ML in sport injury/performance*.
**Method fit:** logistic regression / gradient-boosted trees on the snapshot
feature vector + deltas, injury-within-N-weeks as the label. Keep it
interpretable so it is defensible and modifiable live in viva.

### R2 — Prospective validation of a composite risk indicator against outcomes
**Gap:** FYP I *claimed* the risk model worked but shipped no evaluation. FYP II
must measure it.
**Question:** does the cohort-normed composite indicator discriminate injured
from non-injured athletes (AUC / sensitivity / specificity / calibration), and
does it beat ACWR-alone as a baseline?
**Anchor literature (verify):** Bahr — *why screening tests to predict injury do
not work (and how to do it right)*; Bittencourt et al. — *complex-systems
approach to injury risk (from prediction to pattern recognition)*; Impellizzeri
et al. — *critiques of the acute:chronic workload ratio*.
**Why it is defensible:** Bahr's paper is famous for warning that screening
rarely predicts injury on its own — engaging it head-on (and reporting honest
metrics, even modest ones) is far stronger than another overclaim. This cluster
also **justifies the ACWR demotion** we already did.

### R3 — Normative reference reliability for small elite cohorts
**Gap:** our own known limitation — the "bottom-3 of ~6" red-heavy distribution.
Elite squads are inherently small; z-scores over small n are unstable.
**Question:** what is the minimum cohort size for stable norms, and do
shrinkage / hierarchical-Bayesian pooling across the fallback tiers
(spg→sg→s→all) give more stable bands than raw per-cohort mean/SD?
**Anchor literature (verify):** normative reference values for elite athletes
(sport/sex percentiles); small-sample reliability / partial-pooling methods.
**Method fit:** extends the existing `min_cohort_n` setting and fallback ladder
into a principled shrinkage estimator — a self-contained, high-value chapter.

### R4 — Trustworthy document-AI: validating vision-LM clinical extraction
**Gap:** the HoloMotion pipeline reads clinical numbers with a vision model;
hallucination in that step is a patient-safety concern nobody in the compared
products addresses.
**Question:** how accurate/reliable is OCR-free vision-LM extraction of an
image-only clinical PDF, and what guardrails (preview-before-commit,
field-level confidence, cross-checks) bound the error?
**Anchor literature (verify):** document understanding / OCR-free VLM extraction;
LLM hallucination in structured extraction; human-in-the-loop clinical AI.
**Why it is defensible:** we already have `verify:vision` and a ground-truth
athlete — turn it into a real accuracy study (field-level agreement across a
batch of reports, per-provider). This is an *unclaimed differentiator*: none of
Kitman Labs / Teamworks / Catapult / ATS ingest image-only clinical PDFs by AI.

---

## 3. New proposed modules

Numbered continuing from the FDD's 6. **M7 + M8 + M10 are the recommended core**
(they carry R1/R2 and the evaluation rubric); M9 is a strong stretch; M11 is
optional/experimental.

### M7 — Injury-Risk Forecasting (longitudinal trajectory) — *carries R1*
- Reads each athlete's `screenings` history + injury labels; trains an
  interpretable model to output a **forecast band / probability for the next
  N weeks**, alongside the current descriptive indicator.
- UI: a trajectory chart (indicator over successive reports) + a "projected
  risk" chip; medical/coach surfaces show the trend arrow.
- Defensibility: turns descriptive → predictive; model is transparent and
  live-modifiable; ACWR-only model sits alongside as the baseline arm.

### M8 — Model Evaluation & Validation dashboard — *carries R2, serves the rubric*
- An admin/research surface that computes the indicator's discrimination against
  recorded injuries: **ROC/AUC, sensitivity/specificity at each band boundary,
  calibration curve, confusion matrix**, plus the extraction-accuracy report
  from R4.
- Produces the **evaluation results** the FYP II report needs — this is the
  single highest-leverage module for the new rubric, and it is mostly
  computation over data we already store.
- Includes an honest "screening-alone has limited predictive power (Bahr)"
  framing so the numbers read as science, not marketing.

### M9 — Closed-Loop Intervention & Adherence — *closes flag→act→re-measure*
- The `ScreeningPanel` already surfaces "Training Focus" corrective exercises.
  M9 lets medical/coach **prescribe** those, the athlete **logs adherence**, and
  the next screening **re-measures** — showing whether the intervention moved the
  band.
- Gives the system a genuine feedback loop and generates the very before/after
  data M8 needs to evaluate. Also completes Module 3's deferred "structured
  treatment plan."

### M10 — Return-to-Play & Recovery Milestones — *completes deferred Module 3*
- The FYP I report flagged recovery-milestone tracking as unbuilt because
  Dr Thung had not specified the schema. FYP II proposes a **criteria-based RTP
  workflow**: phased recovery (acute → sub-acute → return-to-train →
  return-to-play), with **clearance gated on a re-screen** meeting thresholds and
  a **clinician sign-off**. Ties the injury table back to the screening engine —
  the loop's final edge.

### M11 — Coach / Team Readiness (promote the experimental role) — *optional*
- **Done (2026-07-19):** promoted `/coach/dashboard` into a first-class FYP II
  role — squad-readiness board with programme/gender/event filters, a read-only
  per-athlete screening detail, team-report download, admin coach management
  (`/admin/coaches`), and the coach↔medical import-commit alert flow. FYP I kept
  its 3 roles; the coach is the FYP II addition.

---

## 4. How it all interlocks (the closed loop)

```
   HoloMotion PDF ──▶ (vision-AI, R4) ──▶ screening snapshot ──▶ cohort-norm indicator (built)
        ▲                                        │
        │                                        ▼
   re-screen (M10)                     forecast band (M7, R1)
        ▲                                        │
        │                                        ▼
   recovery / RTP (M10) ◀── injury outcome ── prescribe + track adherence (M9)
        ▲                        │
        │                        ▼
        └──────────  evaluate indicator vs outcomes (M8, R2)  ──────────┘
```

Everything new consumes or produces data the current build already models. That
is the coherence story for the viva.

---

## 5. Recommended FYP II objectives (measurable, proposal-ready)

Phrased to satisfy the "clearly described, relevant, **measurable**" rubric:

1. **Predict**: develop an interpretable model that forecasts an athlete's risk
   band over the next *N* weeks from screening trajectory, and report its
   accuracy against held-out data (M7 / R1).
2. **Validate**: evaluate the cohort-normed composite indicator against recorded
   injury outcomes (AUC, sensitivity, specificity, calibration) and benchmark it
   against an ACWR-only baseline (M8 / R2).
3. **Close the loop**: implement a prescribe→adhere→re-screen intervention cycle
   and a criteria-based return-to-play workflow, and demonstrate a measurable
   band change across an intervention (M9 + M10).
4. *(supporting)* **Quantify** vision-AI extraction accuracy field-by-field
   against ground truth across a batch of reports (R4).

---

## 6. Scope guardrails & risks (be honest in the proposal)

- **Data volume for ML (R1/M7):** a real predictive model needs many
  athlete-time points and injury events. ISN's real dataset may be small →
  frame M7 honestly as a *pilot / proof-of-method* on seeded + available data,
  not a clinically deployable predictor. Bahr (R2) gives cover to report modest
  numbers as legitimate science.
- **ISN facility constraints:** keep proposals within what ISN can actually
  measure (the same reason LDH is excluded and force-plate data is out). No new
  hardware dependencies (wearables, force plates) — everything rides on the
  HoloMotion report we already ingest.
- **Ethics / data:** predicting injury on named elite athletes raises
  consent/NDA questions — cite the existing Dr Thung LOI and keep an ethics
  paragraph. Human-in-the-loop (clinician override already built) is the
  safety argument.
- **Locked FYP I decisions still hold:** the composite formula, sRPE, body-map
  asset, and MySQL schema are locked; new modules **extend**, they don't rewrite.
  The role model is the one deliberate change — M11 (coach) is **promoted to a
  first-class 4th role in FYP II** (FYP I shipped 3 roles).
- **Don't overclaim (the FYP I lesson):** M8 exists precisely so FYP II reports
  *measured* outcomes, not aspirational ones.

---

## 7. Suggested minimal viable FYP II (if time-boxed)

If scope has to shrink, the defensible core is **M8 (evaluation) + M7
(forecasting) with R1/R2 literature**: it delivers the "predictive + validated"
thesis and the evaluation-results the rubric rewards, entirely over data
structures already built. M9/M10 are the loop-closing stretch; M11 is optional.

---

*Compiled 2026-07-15 for JC's assessment. Amend freely — this is a proposal
menu, not a locked spec. Pair with [`FYP2_REDESIGN_SPEC.md`](FYP2_REDESIGN_SPEC.md)
(what's built) and [`../FYP_RUBRICS.md`](../FYP_RUBRICS.md) (what's assessed).*
