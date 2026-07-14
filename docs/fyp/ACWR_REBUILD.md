# ACWR + Composite Risk Model — Rebuild Spec

> **Purpose:** the FYP II redesign **demotes** the ACWR/composite-risk model to
> a secondary "Training Load" view (the HoloMotion cohort-normed overall
> indicator is now primary). It is **not deleted** — the code remains in the
> repo. This document captures the model's full logic, weights, and evidence so
> it can be **rebuilt identically** from scratch if the code is ever removed.
> It also anchors the FYP I graded contribution for the viva.
>
> Live code (as of this writing): [`frontend/src/lib/risk.ts`](../../frontend/src/lib/risk.ts),
> the `Activity` model hook, [`routes/recoveryBaselines.js`](../../backend/src/routes/recoveryBaselines.js).
> Companion docs: [`DESIGN_DECISIONS.md §1–2`](../DESIGN_DECISIONS.md),
> [`SYSTEM_ALGEBRA.md`](../SYSTEM_ALGEBRA.md).

## 1. Internal training load (sRPE)

`Session Load (AU) = duration_minutes × RPE`, RPE on a 1–10 scale (1–10 not
0–10, to avoid zero-load entries that zero out ACWR). Persisted, not computed
on read: a `beforeValidate` hook on the `Activity` model writes
`activity.load = activity.duration × activity.intensity` before every save.

**Evidence:** Inoue et al. (2022) — sRPE scale-reliability meta-analysis (27
studies; no significant athlete–coach difference). Yang et al. (2024) — sRPE ↔
HR-TRIMP physiological correspondence in elite endurance athletes.

## 2. ACWR

- **Acute load** = sum of session load over the last **7 days**.
- **Chronic load** = average weekly load over the last **28 days** (4-week
  rolling), i.e. `chronic28dayTotal / 4`.
- **ACWR** = `acute / chronic` (coupled — acute is included in chronic, the
  Gabbett-standard method). ACWR = 0 when chronic is 0.
- Windows are computed by day-offset from today, NOT ISO week keys, so a
  Dec/Jan boundary doesn't drop sessions into mismatched weeks.

**Baseline thresholds (Gabbett):** 0.8 / 1.3 / 1.5. The 0.8–1.3 band is the
"sweet spot" (lowest injury incidence). **Evidence:** Qin et al. (2025) — ACWR
systematic review/meta-analysis quantifying the 0.8–1.3 band (56% incidence);
Michailidis (2024) — motivates *personalised* over universal thresholds.

## 3. Composite risk model (the FYP I differentiator)

`classifyCompositeRisk(acwr, athlete, activeInjuries)` in `risk.ts`:

**Step 1 — vulnerability score (0–1)** from the athlete's screening data,
weighted sum of normalised deficits (higher = more vulnerable):
- `injuryRiskIndex` — weight **0.30** (ISN's own direct injury-risk composite)
- `overallActivityScore` deficit — weight **0.20**
- `mobility` deficit — weight **0.20**
- `stability` deficit — weight **0.15**
- `symmetry` deficit — weight **0.15**

(The two composite inputs total 0.50; the three movement-quality inputs total
0.50.) Missing fields fall back to the median (0.5) so the model degrades
gracefully to near-textbook Gabbett behaviour.

**Step 2 — personalise the thresholds** by ±~15% inversely proportional to
vulnerability: a more vulnerable athlete gets *tighter* bands (flagged sooner);
a robust athlete gets *wider* bands. At median vulnerability the numbers are
almost exactly the textbook Gabbett values. 15% is deliberately small — it
personalises without contradicting the well-established baseline.

**Step 3 — classify** the ACWR against the personalised thresholds into
Low / Optimal / Elevated / High (with an "undertrained" low-ACWR case).

**Step 4 — escalate** the band by exactly one step (capped at High) when active
injuries or muscle flags align with the current workload — specifically ≥1
active (non-Recovered) injury, or a muscle-flag pile-up (≥5 flags). Multiple
triggers still escalate by one (they reinforce, don't compound).

**Output:** `{ cls, level, msg, personalisedRange, escalated, baseCls, factors }`
— the risk hero card surfaces the band, the personalised range, an escalation
badge, and modifier chips.

**Evidence for personalisation:** Michailidis (2024). The ±15% modifier and the
escalation rules are the project's own contribution (disclosed as such — not
over-claimed as literature).

## 4. Recovery baselines

When composite risk first leaves Low, a `recovery_baseline` row snapshots the
athlete's pre-elevation training state (snapshot ACWR, chronic load, the
personalised return-to-Low band, trigger class/level). Auto-resolves when the
athlete returns to Low. Acts as a clinician-facing return-to-play target.
Model: `RecoveryBaseline`; route: `recoveryBaselines.js`; created fire-and-forget
from the athlete dashboard.

## 5. Rebuild checklist

To reconstruct identically:
1. `Activity` model with the `beforeValidate` load hook (§1).
2. ACWR computation (§2) — the athlete dashboard computes it client-side from
   the 8-week activity buckets; the coach route mirrors it server-side.
3. `classifyCompositeRisk()` (§3) with the exact weights and ±15% / escalation
   rules. `AcwrGauge` + `RiskRadar` + the risk-hero markup render it.
4. `RecoveryBaseline` model + routes (§4).
5. Lit-review anchors: Inoue 2022, Yang 2024 (load); Qin 2025, Michailidis 2024
   (ACWR/personalisation). Gabbett 2016 is the threshold origin (cited via Qin).

## 6. Relationship to the FYP II overall indicator

The two are **complementary axes**, not duplicates:
- **Composite ACWR risk** (this doc) personalises *workload* thresholds by an
  athlete's own vulnerability — a longitudinal, training-load signal.
- **Overall HoloMotion indicator** (FYP II) z-scores an athlete's *screening*
  against their *cohort* — a cross-sectional, peer-relative signal.

FYP II makes the HoloMotion indicator primary and keeps ACWR as the secondary
Training Load view. The viva framing: *"FYP I personalised workload thresholds
by individual vulnerability; FYP II extends the same normed-threshold
philosophy to the screening domain, normed against the cohort."*

*Compiled 2026-07-13 for the FYP II redesign (ACWR demotion).*
