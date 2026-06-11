# AIRMS — System Algebra Reference

Every numeric quantity the system computes, where it lives in code, what the formula is, and a worked example using seeded demo data. Intended as the single source of truth for explaining the math in viva.

If a number on a dashboard or report cannot be traced back to one of the sections in this document, that number is either decorative or a bug.

---

## 1. Session Load (sRPE)

The foundational metric — every higher-level derivation eventually traces back to this.

**Formula**

```
session_load (AU) = duration_minutes × intensity_RPE
```

- `duration_minutes` — integer in `[10, 240]`, validated on input
- `intensity_RPE` — integer in `[1, 10]` on the modified Borg CR-10 scale
- `session_load` — Arbitrary Units (AU). No physical interpretation; comparable within an athlete over time

**Why 1–10 (not 0–10):** The original CR-10 starts at 0, but AIRMS clamps to 1 so a logged session never produces zero load — that would make the chronic average drift toward zero and bring ACWR with it. The lower bound only matters when an athlete logged a session; the absence of sessions is what zeros acute load.

**Citation lineage:** Inoue (2022) confirmed scale reliability across athletes vs coaches (meta-analysis of 27 studies); Yang (2024) re-validated physiological correspondence (sRPE vs HR-based TRIMP).

**Where it lives:** `Activity` model hook at [backend/src/models/Activity.js:48–65](../backend/src/models/Activity.js#L48-L65). Computed at write time, persisted to the `load` column, so the value is always consistent with the inputs it derived from.

**Worked example.** A 75-minute strength session at RPE 8 → `session_load = 75 × 8 = 600 AU`.

---

## 2. Acute Load

The athlete's most-recent week of training, summed.

**Formula**

```
acute_load = Σ session_load over the last 7 calendar days
```

**Worked example.** John Doe (ATH0001) at snapshot time had 6 sessions in the last 7 days summing to 2,860 AU. After soft-deleting those 6 sessions, his acute load drops to 0 AU.

**Where it lives:** computed inline in two places:
- Backend: [backend/src/routes/activities.js:57–90](../backend/src/routes/activities.js#L57-L90) (the `/acwr` endpoint)
- Frontend: `computed` block in [athlete dashboard](../frontend/src/app/athlete/dashboard/page.tsx) and the `workload` memo in [medical dashboard](../frontend/src/app/medical/dashboard/page.tsx)

The frontend recomputation produces an 8-week trend that the backend single-value endpoint cannot.

---

## 3. Chronic Load

A rolling 4-week average of weekly load — proxy for the athlete's current training fitness.

**Formula**

```
weekly_load_i = Σ session_load within calendar-week i
chronic_load  = (weekly_load_1 + weekly_load_2 + weekly_load_3 + weekly_load_4) / 4
```

where `weekly_load_1` is the most recent week and `weekly_load_4` is the oldest of the four.

**Important property.** Acute is included in chronic — this is **coupled ACWR**, the protocol Qin (2025) reports as dominant in pooled studies (~95%). Uncoupled (excluding acute from chronic) is statistically cleaner but lags real fitness changes.

**Minimum data.** The chronic average is only academically meaningful after **4 weeks of continuous logging**. With less, you are averaging across an incomplete window. Practical stability arrives at **6–8 weeks** as the chronic baseline matures. AIRMS displays an 8-week trend on the dashboard, deliberately covering both the stability threshold and the 4-week chronic memory.

**Worked example.** John's 4 weekly loads (2,860 + 1,830 + 2,160 + 1,925) sum to 8,775 AU → chronic_load = 8,775 / 4 = 2,194 AU.

---

## 4. ACWR (Acute:Chronic Workload Ratio)

The ratio that the entire risk pipeline is built on.

**Formula**

```
ACWR = acute_load / chronic_load
```

Output is unitless. The textbook Gabbett (2016) safe-zone is **0.8 – 1.3**, validated empirically by Qin (2025) which found the lowest pooled injury incidence (56%) within this band.

**Worked example.** John at snapshot time: acute = 2,860 AU, chronic = 2,194 AU → `ACWR = 2,860 / 2,194 ≈ 1.30`.

**Edge cases.**
- `chronic_load = 0` → ACWR forced to 0 to avoid divide-by-zero (athlete has no chronic history yet)
- ACWR is clamped at the display layer to `[0, 2.0]` for gauge rendering — the underlying value is unbounded but extreme highs all read as "well above 1.5" anyway

**Where it lives:** `classifyACWR` at [risk.ts:122](../frontend/src/lib/risk.ts#L122).

---

## 5. Vulnerability Score

The AIRMS contribution that personalises ACWR thresholds. Single scalar derived from screening data, range `[0, 1]` — 0 robust, 1 highly vulnerable.

The five inputs are the screening columns ISN actually captures per athlete: two composite indicators (`injuryRiskIndex`, `overallActivityScore`) and three movement-quality components (`mobility`, `stability`, `symmetry`).

**Formula**

```
iriNorm = clamp(injuryRiskIndex / 40, 0, 1)
overDef = clamp(1 − overallActivityScore / 100, 0, 1)
mobDef  = clamp(1 − mobility  / 100, 0, 1)
stbDef  = clamp(1 − stability / 100, 0, 1)
symDef  = clamp(1 − symmetry  / 100, 0, 1)

vulnerability = 0.30 × iriNorm
              + 0.20 × overDef
              + 0.20 × mobDef
              + 0.15 × stbDef
              + 0.15 × symDef
```

**Why these weights.**

- `injuryRiskIndex` is ISN's own direct composite injury-risk metric — the strongest single predictor signal in the screening dataset. It carries the largest individual weight (0.30).
- `overallActivityScore` is the conditioning composite; its deficit (`1 − score/100`) corresponds to poorer recoverability and absorption of workload variation. Weight 0.20.
- `mobility`, `stability`, `symmetry` are the three movement-quality components; their deficits drive vulnerability. Together they sum to 0.50, with mobility weighted slightly higher because mobility deficits correlate most directly with injury onset in the screening literature.
- The two composite inputs together (`iriNorm` + `overDef`) carry 0.50, the three movement-quality inputs the other 0.50 — the structural shape "composites carry half, movement quality the other half" is preserved.

**Why 40 as the cap on `injuryRiskIndex`.** The seeded synthetic athletes draw from `rfloat(8, 35)`; the real ISN sample (John) sits at 10.4. Capping the normalisation at 40 gives genuine outliers headroom without saturating the score at the synthetic maximum.

**Where it lives:** `computeVulnerability` at [risk.ts:91–104](../frontend/src/lib/risk.ts#L91-L104).

**Worked example.**

| Input | John (live, ISN-anchor) | Normalised deficit | Weight | Contribution |
|---|---|---|---|---|
| `injuryRiskIndex` = 10.4 | iriNorm = 10.4 / 40 = 0.260 | 0.260 | 0.30 | 0.078 |
| `overallActivityScore` = 80.28 | overDef = 0.197 | 0.197 | 0.20 | 0.039 |
| `mobility` = 79.94 | mobDef = 0.201 | 0.201 | 0.20 | 0.040 |
| `stability` = 77.62 | stbDef = 0.224 | 0.224 | 0.15 | 0.034 |
| `symmetry` = 82.49 | symDef = 0.175 | 0.175 | 0.15 | 0.026 |
| | | | **vulnerability** | **0.217** |

(Under the previous formula using a misattributed `exerciseRiskScore = 5.49`, John's vulnerability computed to 0.238. The refactored formula gives a near-identical value while sourcing every input from a real Excel column.)

---

## 6. Personalised Thresholds

Vulnerability shifts the textbook Gabbett bands per athlete. Modifier is intentionally clamped — the personalised band must stay recognisably close to the published literature.

**Formula**

```
raw    = 1 + (vulnerability − 0.4) × 0.4
factor = clamp(raw, 0.85, 1.15)

lowMin = 0.80 × factor      // multiplied so higher vulnerability widens the lower bound
lowMax = 1.30 / factor      // divided so higher vulnerability tightens the upper bound
modMax = 1.50 / factor
```

The constant **0.4** is the population-baseline vulnerability (an "average" athlete). At `vulnerability = 0.4`, `raw = 1.0` and the bands collapse onto the textbook `0.80 / 1.30 / 1.50`.

The ±15% clamp prevents the model from drifting so far from Gabbett that the literature stops applying — a hard guarantee that the personalised band is always within 15% of the published thresholds.

**Where it lives:** `personalisedThresholds` at [risk.ts:110–120](../frontend/src/lib/risk.ts#L110-L120).

**Worked examples.**

| Athlete | vulnerability | raw | factor (clamped) | lowMin | lowMax | modMax |
|---|---|---|---|---|---|---|
| Population baseline | 0.40 | 1.000 | 1.000 | 0.80 | 1.30 | 1.50 |
| John (live, ISN-anchor) | 0.217 | 0.927 | 0.927 | 0.74 | 1.40 | 1.62 |
| Vulnerable demo (iri=35, ovr=40, mob=30, stb=30, sym=30) | 0.85 | 1.180 | **1.150** (clamped) | 0.92 | 1.13 | 1.30 |

Notice the band visibly tightens for the high-vulnerability case (`0.92 – 1.13`) vs John's ISN-anchored case (`0.74 – 1.40`). Same band-derivation logic, different screening data, materially different tolerance window.

---

## 7. Base ACWR Classification

Pure-workload band — no escalation applied.

**Formula**

```
if ACWR > modMax  → "high"
if ACWR > lowMax  → "mod"
if ACWR ≥ lowMin  → "low"
otherwise          → "under"   (Detraining Risk)
```

The four bands are exhaustive and disjoint. **Detraining Risk is the only band below `lowMin`** and is treated as a forward-looking warning (the danger is the rebound spike when training resumes), not an injury-risk present-state.

**Where it lives:** `classifyACWR` at [risk.ts:122–127](../frontend/src/lib/risk.ts#L122-L127).

---

## 8. Composite Escalation

The AIRMS differentiator. Two escalation gates layer on top of the base ACWR class. Each can bump the band up one step (`low → mod`, `mod → high`). Detraining and clearly-Low workloads are excluded by design.

### 8.1 Injury Gate

```
if injuryCount > 0
   AND (baseCls === "mod"
        OR (baseCls === "low" AND ACWR > 1.0))
then escalate(cls)
```

**Reading:** an active injury escalates the band when the workload is already at or above the borderline. A safely-low workload (ACWR ≤ 1.0) doesn't escalate, because there's no spike for the injury context to amplify.

### 8.2 Muscle-Flag Gate

```
if muscleFlagCount ≥ 5
   AND (cls === "mod"
        OR (cls === "low" AND ACWR > 1.1))
then escalate(cls)
```

The muscle-flag gate fires **after** the injury gate, on the post-injury-gate cls. This means double-escalation is possible (low → mod → high) when both gates fire — which is the only way `cls === "high"` can result from a `baseCls === "low"` start.

### 8.3 The escalate function

```
escalate("low")   → "mod"
escalate("mod")   → "high"
escalate("high")  → "high"   (no further escalation)
escalate("under") → "under"  (no escalation from Detraining)
```

**Where it lives:** `classifyCompositeRisk` at [risk.ts:135–173](../frontend/src/lib/risk.ts#L135-L173).

**Worked example.** John (original screening) at ACWR 1.30, with 5 active injuries and 4 muscle flags:
1. Base classification → `low` (1.30 < lowMax 1.40, ≥ lowMin 0.74)
2. Injury gate: 5 active injuries AND ACWR (1.30) > 1.0 → escalate → `mod`. Factors include "5 active injury records".
3. Muscle-flag gate: 4 muscle flags is NOT ≥ 5 → gate does not fire.
4. Final: `cls = "mod"`, `baseCls = "low"`, `escalated = true` → **"Compound Moderate Risk"**.

If John ever picked up a 5th muscle flag at his next screening, the second gate would also fire (since `cls === "mod"` after step 2) and the final classification would become **"Compound High Risk"** — a worked example of how double-escalation `low → mod → high` can land.

---

## 9. Final Risk Label + Message

The `cls` after escalation determines the band, but the **label and message** displayed depend on whether escalation actually fired.

```
escalated = (cls !== baseCls)

level = escalated ? COMPOUND_LABEL[cls] : LEVEL_LABEL[cls]
msg   = escalated ? COMPOUND_MSG[cls]   : LEVEL_MSG[cls]
```

| cls | escalated=false (label) | escalated=true (label) |
|---|---|---|
| `under` | Detraining Risk | (n/a — under cannot escalate) |
| `low` | Low Risk | (n/a — low never lands on low after escalation) |
| `mod` | Moderate Risk | **Compound Moderate Risk** |
| `high` | High Risk | **Compound High Risk** |

The compound message text is deliberately worded to **not** claim workload alone is elevated — because compound escalation can fire when raw ACWR was Low, and saying "your workload is elevated" would be factually wrong in that case.

**Where it lives:** `LEVEL_LABEL` / `COMPOUND_LABEL` / `LEVEL_MSG` / `COMPOUND_MSG` and selection logic at [risk.ts:50–173](../frontend/src/lib/risk.ts#L50-L173).

---

## 10. Cumulative ACWR Trend (8-week chart)

The dashboard chart plots an ACWR per week using a rolling chronic window, so the trend reads correctly at each point.

**Formula** (for each week index `i` from 0 to 7, where 7 is most recent):

```
weeklyLoad_i = Σ session_load within week i
acuteSlice_i = weeklyLoads[max(0, i−3) … i]   // up to 4 most-recent weeks ending at i
chronic_i    = mean(acuteSlice_i)
ACWR_i       = (chronic_i > 0) ? weeklyLoad_i / chronic_i : 0
```

This produces a per-week ACWR that respects causality (each week's chronic only includes data available at that week, not future weeks).

**Where it lives:** the `cumACWR` block in [athlete dashboard](../frontend/src/app/athlete/dashboard/page.tsx) and [medical dashboard](../frontend/src/app/medical/dashboard/page.tsx).

---

## 11. Recovery Baseline Snapshot

Not a derivation per se, but a record of the algebra state at the moment of an escalation event.

**Captured fields** (one row per non-Low episode):

| Field | Source |
|---|---|
| `snapshotAcwr` | ACWR at trigger time |
| `chronicLoad` | Chronic 4-week average at trigger time (AU) |
| `targetLowMin` | The athlete's `lowMin` at trigger time |
| `targetLowMax` | The athlete's `lowMax` at trigger time |
| `triggerCls` | Composite cls that fired the snapshot (`mod`/`high`) |
| `triggerLevel` | Display label at trigger time (e.g. "Compound Moderate Risk") |
| `factors` | Escalation factors (comma-separated) |

**Interpretation.** The snapshot defines the return-to-play target: bring ACWR back into `[targetLowMin, targetLowMax]` at roughly `chronicLoad` AU of weekly training. Gradual ramp-up is the mitigation for the rebound-spike risk that Qin (2025) flags.

**Where it lives:** model at [backend/src/models/RecoveryBaseline.js](../backend/src/models/RecoveryBaseline.js), auto-trigger in the dashboards' useEffect hooks.

---

## 12. Prevention Insight Scoring (medical dashboard)

A small scoring loop ranks body regions where multiple risk signals converge. Used to populate the "watch points" list on the Prevention Insight card.

**Formula** (per region):

```
score = (1 if elevated_risk_indicator else 0)
      + (1 if muscle_flag         else 0)
      + (1 if prior_injury_last_12mo else 0)
```

Regions are then sorted by score descending; the top 3 are surfaced. The interesting clinical signal is **convergence** — a region with score 2 or 3 has multiple independent indicators pointing at the same anatomical area.

**Where it lives:** `buildPreventionInsight` at top of [frontend/src/app/medical/dashboard/page.tsx](../frontend/src/app/medical/dashboard/page.tsx).

---

## 13. Data-Window Defaults (storage-side math)

Two defaults that show up as design constants in the system, both anchored to the ACWR algebra.

**Default activity history window: 12 weeks.**
```
12 = 8 (dashboard chart) + 4 (chronic-load memory buffer)
```
Anything inside this window can be re-rendered into the dashboard chart and still produce correct ACWR values. Older data is preserved in MySQL but is not loaded into the dashboard request by default ([STORAGE_MECHANISMS.md](STORAGE_MECHANISMS.md) §1).

**Delete behaviour:** `DELETE /api/activities/:id` removes the row outright. Activities are athlete-owned training data, so deletion is honoured rather than tombstoned. ACWR and chronic-load calculations therefore read the data as the athlete sees it in their history table.

---

## 14. Things this document does NOT cover

- **Admin analytics aggregations** (counts grouped by sport / body part / etc.) — these are SQL COUNT queries, not algebra
- **Risk Radar values** — direct projection of screening columns; no derivation
- **Body map flag rendering** — a lookup-table mapping (muscle → region slug), no math
- **Sport Context card numbers** — direct projections of the analytics summary endpoint, no math
- **Date arithmetic** in window cutoffs — `new Date(Date.now() − N × 86_400_000)`, standard millisecond math

If a number on the dashboard isn't covered here and isn't in the list above, it's worth tracking down — either it belongs in this document or it shouldn't be displayed.

---

## Worked Walk-Through: John Doe end-to-end

Putting it all together with the actual seeded numbers.

**Athlete state (live ISN-anchor screening):**
- `injuryRiskIndex = 10.4`, `overallActivityScore = 80.28`
- `mobility = 79.94`, `stability = 77.62`, `symmetry = 82.49`
- ⇒ vulnerability = 0.217
- ⇒ factor = 0.927
- ⇒ personalised bands: `lowMin = 0.74`, `lowMax = 1.40`, `modMax = 1.62`

**Workload state (6 sessions in last 7d, seeded):**
- weeklyLoads (newest → oldest) = `[2860, 1830, 2160, 1925]`, summing to 8,775 AU
- acute = 2,860 AU (sum of week-now: Match + Strength + Speed + Endurance + Skill + Recovery)
- chronic = 8,775 / 4 = 2,194 AU
- ACWR = 2,860 / 2,194 = **1.30**

**Context:** 5 active injury records, 4 muscle flags.

**Classification:**
- baseCls: 1.30 ≥ 0.74 AND 1.30 ≤ 1.40 → `low`
- Injury gate: 5 active injuries AND ACWR (1.30) > 1.0 → escalate → `mod`
- Muscle-flag gate: 4 flags is NOT ≥ 5 → does not fire
- Final: `cls = "mod"`, baseCls = "low", escalated = true → **"Compound Moderate Risk"**

**Recovery baseline opens** with `snapshotAcwr = 1.30`, `chronicLoad = 2,194`, `targetLowMin = 0.74`, `targetLowMax = 1.40`. The baseline auto-resolves whenever John's composite returns to Low.

Every number on John's dashboard, from the gauge marker position to the message text, traces directly back to one of the formulas above.
