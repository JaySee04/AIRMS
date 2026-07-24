# ACWR + Composite Risk Model — Rebuild Spec

> **Purpose:** this document captures the ACWR/composite-risk model's full
> logic, weights, and evidence so it can be **rebuilt identically** if it's
> ever wired back up. It also anchors the FYP I graded contribution for the
> viva. As of **2026-07-20 this is a pure rebuild spec, not a description of
> running code** — see the removal history below.
>
> ### Removal history
> - **2026-07-13 (Stage F)** — relabelled a secondary "Training Load (ACWR)"
>   view beneath the cohort indicator on the athlete + medical dashboards.
> - **2026-07-16** — **removed from the dashboards entirely**, on JC's
>   instruction, after a browser-driven layout audit showed the "secondary"
>   card visually dominating the primary indicator (~6× the weight) and the
>   athlete reading three competing verdicts at once (sport-critical alert →
>   "Immediate assessment 38" → "Compound Moderate Risk"). Removed: the ACWR
>   hero + `AcwrGauge` + load stat tiles + Workload Trend chart (athlete and
>   medical), and the ACWR / Risk-level columns + composite-derived readiness
>   (coach — readiness now maps straight off the HoloMotion band). At this
>   point the model still executed silently, driving the recovery-baseline
>   trigger and the medical prevention-insight card.
> - **2026-07-20 — Activity Tracking (the FYP I Module 1) fully removed**, at JC's
>   request, with the fallout accepted. `/athlete/activity` (frontend page +
>   Sidebar link), `backend/src/models/Activity.js` + `routes/activities.js`,
>   and `backend/src/models/RecoveryBaseline.js` + `routes/recoveryBaselines.js`
>   are all **deleted**, along with the seeder's activity-log generation. This
>   was the model's only training-load input, so the recovery-baseline
>   trigger and the medical prevention-insight card (both downstream of
>   `classifyCompositeRisk()`'s ACWR argument) were retired alongside it.
>   `WorkloadChart.tsx` / `AcwrGauge.tsx` are unchanged by this step — still
>   unrendered components, not deleted.
> - **2026-07-20, later same day — the six-module set restructured.** Rather
>   than leave a hole at "Module 1" or drop to five modules, JC asked to
>   redistribute the surviving feature set across a fresh six (the old Data
>   Management module split into Screening Data Ingestion and Cohort Norms &
>   Governance). "Module 1" now refers to Athlete Dashboard & Overall Risk
>   Indicator, not Activity Tracking — see `MASTER_CLARIFICATIONS.md §4` and
>   `docs/fyp/FYP2_MODULES_USECASES.md` Appendix B for the full mapping.
>
> ### What's left
> - [`frontend/src/lib/risk.ts`](../../frontend/src/lib/risk.ts) —
>   **kept** (the composite formula is a locked decision,
>   `MASTER_CLARIFICATIONS.md §12`) but has **zero live callers anywhere in
>   the app**. Nothing computes ACWR; nothing calls `classifyCompositeRisk()`.
> - Everything else this doc used to point to as "still runs" — the
>   `Activity` model, the `/acwr` endpoint, `RecoveryBaseline` — no longer
>   exists in the codebase. §1 and §4 below describe deleted mechanisms;
>   treat them as spec, not inventory.
>
> To rebuild: re-add a training-load input (§1, likely `Activity` reborn or a
> different source), re-wire `classifyCompositeRisk()` (§3, code unchanged in
> `risk.ts`), then re-mount `AcwrGauge` + `WorkloadChart` in the heroes
> described in §3–§5 and re-add the recovery-baseline mechanism (§4) if
> wanted. The rebuild checklist in §5 has been updated to say "re-add"
> instead of "still exists, just re-mount."
>
> Companion docs: [`DESIGN_DECISIONS.md §1–2`](../DESIGN_DECISIONS.md),
> [`SYSTEM_ALGEBRA.md`](../SYSTEM_ALGEBRA.md).

## 1. Internal training load (sRPE) — mechanism removed 2026-07-20

`Session Load (AU) = duration_minutes × RPE`, RPE on a 1–10 scale (1–10 not
0–10, to avoid zero-load entries that zero out ACWR). Was persisted, not
computed on read: a `beforeValidate` hook on the (now-deleted) `Activity`
model wrote `activity.load = activity.duration × activity.intensity` before
every save. To rebuild, this hook (or an equivalent) needs to exist on
whatever model becomes the training-load input again.

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

## 4. Recovery baselines — removed 2026-07-20

When composite risk first left Low, a `recovery_baseline` row snapshotted the
athlete's pre-elevation training state (snapshot ACWR, chronic load, the
personalised return-to-Low band, trigger class/level), auto-resolving when
the athlete returned to Low — a clinician-facing return-to-play target.
Model: `RecoveryBaseline`; route: `recoveryBaselines.js`; both **deleted**
along with the rest of Activity Tracking. To rebuild, both would need to be
re-created from scratch (no code survives to restore).

## 5. Rebuild checklist

To reconstruct identically (all five steps are now "re-add," not "re-mount" —
nothing but `risk.ts` survives):
1. Re-add an `Activity`-equivalent model with the `beforeValidate` load hook (§1).
2. Re-add ACWR computation (§2) — the athlete dashboard used to compute it
   client-side from the 8-week activity buckets; the coach route mirrored it
   server-side.
3. Re-wire `classifyCompositeRisk()` (§3) — the function itself is unchanged
   in `risk.ts`, it just has no caller. Exact weights and ±15% / escalation
   rules are all still there. `AcwrGauge` + `RiskRadar` + the risk-hero markup
   would render it.
4. Re-add the `RecoveryBaseline` model + routes (§4).
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

*Compiled 2026-07-13 for the FYP II redesign (ACWR demotion). Updated
2026-07-20 to reflect Activity Tracking's full removal — this is now purely
a rebuild spec.*
