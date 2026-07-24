# AIRMS — Storage Mechanisms

> **2026-07-20 — both mechanisms below no longer exist.** Activity Tracking
> (the FYP I Module 1) was fully removed at JC's request: `backend/src/routes/activities.js`
> (§1's windowed endpoint), `backend/src/models/RecoveryBaseline.js` and
> `routes/recoveryBaselines.js` (§2) are all **deleted**. There is currently
> **no storage mechanism beyond plain CRUD anywhere in AIRMS** — this file's
> original headline claim ("AIRMS never auto-deletes historical training
> data") no longer has a live subject to apply to. Kept as a **design-
> rationale reference** (the windowing pattern and the recovery-target
> reasoning are still legitimate design arguments if either mechanism is ever
> rebuilt — see `docs/fyp/ACWR_REBUILD.md`), not as a description of the
> running system.

A short reference for the two storage-related behaviours that **used to**
exist on top of plain CRUD in AIRMS, what each one did, why it was there, and
how it was defended in viva.

The headline (historical): **AIRMS never auto-deletes historical training
data.** Longitudinal records were the institutional value this part of the
system was built to deliver (Problem Statement 1). One performance mechanism
kept the dashboard request cheap without losing access to history, and one
clinical mechanism captured a recovery-target snapshot when an athlete's risk
first escalated.

---

## 1. Default time-window on activity history — removed 2026-07-20

**Where it lived:** `GET /api/activities/athlete/:id` — backend route formerly at `backend/src/routes/activities.js`, deleted along with the rest of Activity Tracking.

**What it did.** When no query parameters were supplied, the endpoint returned only the last **12 weeks** of activities for the athlete (covers the 8-week dashboard chart with a 4-week buffer). Three query parameters overrode the default:

| Query | Behaviour |
|---|---|
| `?weeks=N` | Most-recent N weeks |
| `?from=YYYY-MM-DD&to=YYYY-MM-DD` | Explicit date range |
| `?all=1` | No date constraint — full history (intended for admin audit / PDF reports) |

**Why.** The athlete dashboard rendered only an 8-week window of data, so loading 5 years of activities into the browser would have wasted bandwidth and slowed page paint on athletes with long records. Capping the default at 12 weeks kept the dashboard request cheap, while the explicit override paths preserved the option to read full history when something actually needed it (admin reports, clinician deep dives, audit).

**Why this was *not* "data deletion".** Nothing was ever removed from the database by this mechanism — it was a *view* over the data, not a destruction operation. (The `activities` table itself is gone now, but that was a deliberate 2026-07-20 schema drop when the feature was retired, not this windowing mechanism doing anything.)

**Viva defensibility (historical).** Aligned with the longitudinal-records principle in PS1: history was preserved; only the default *projection* was windowed for performance. This was a standard pagination/windowing pattern, not a data-retention compromise. If a future training-load feature is rebuilt, this is the pattern to reuse.

---

## 2. Recovery Baseline snapshot — removed 2026-07-20

**Where it lived:** `backend/src/models/RecoveryBaseline.js`, `backend/src/routes/recoveryBaselines.js`, surfaced in `frontend/src/app/medical/dashboard/page.tsx`, auto-triggered from both athlete and medical dashboards — all deleted.

**What it did.** When an athlete's composite risk first transitioned out of Low Risk (either to Moderate, High, or any Compound state), the system captured a snapshot of the pre-elevation training state — the athlete's ACWR at that moment, their chronic load, and their personalised Low band. This snapshot became the clinician-facing "return-to-play target." When the athlete returned to Low Risk, the snapshot was marked resolved.

**Schema (historical — table dropped).** One row per non-Low episode:

| Field | Stores |
|---|---|
| `athleteId` | FK to Athlete (VARCHAR "ATH0001") |
| `snapshotAcwr` | ACWR value at trigger time |
| `chronicLoad` | 4-week chronic load at trigger time (AU) |
| `targetLowMin`, `targetLowMax` | Personalised Low band at trigger time — the return target |
| `triggerCls` | `mod` / `high` / `under` — risk class that fired the trigger |
| `triggerLevel` | Display label (e.g. `Compound Moderate Risk`) — captured so future label-string changes don't break the historical record |
| `factors` | Comma-separated escalation factors at trigger time |
| `createdAt` | When the baseline opened |
| `resolvedAt` | When the athlete returned to Low — null while active |

**Auto-trigger (historical).** Both the athlete dashboard and medical dashboard fired a fire-and-forget POST to `/api/recovery-baselines` whenever the displayed composite risk was non-Low. The POST endpoint was **idempotent**: if a baseline was already open for the athlete, the existing row was returned and no duplicate created. When risk returned to Low, a PATCH to `/api/recovery-baselines/athlete/:id/resolve` closed the active baseline (no-op if none active). None of this exists now.

**Display (historical).** Medical dashboard rendered a gold-bordered "Recovery baseline" card directly under the composite risk hero whenever an active baseline existed. Showed return-to-Low band, snapshot ACWR, chronic load at snapshot, and trigger factors.

**Why (design rationale, still valid if rebuilt).** This was the clinical hook for the recovery workflow: the baseline wasn't a recovery prescription, it was a **target** the clinician could use to confirm gradual return-to-training. The athlete's pre-elevation load level was the safe return point; ramping ACWR back into the personalised Low band restored them to baseline. Without the snapshot, the clinician would have needed to manually inspect the workload chart to find the pre-elevation point each time.

**Viva defensibility (historical).** Mapped directly to the rebound-spike concept from Qin (2025) and the detraining literature: the danger after an elevation episode is the *return* spike. The baseline gave the clinician a concrete personalised target rather than relying on the textbook 0.8–1.3 band universally.

---

## What was intentionally NOT done (historical — the whole subject matter is removed)

| Option considered | Why rejected |
|---|---|
| **Auto-delete activities older than N weeks** | Contradicted PS1 (longitudinal records). Storage cost was trivial (~100 bytes/row); the actual cost would have been losing the institution's longitudinal value. |
| **Archive table for old records** | Premature optimisation. MySQL handles tens of millions of rows on a single indexed `(athlete_id, date)` lookup without any sharding. AIRMS was nowhere near that scale. |
| **Soft-delete on Activity** | Considered and rejected. Activities were athlete-owned training entries, not clinical records — a deletion should respect the athlete's intent. An audit-trail argument was stronger on the `Injury` table (which is clinician-owned) than on Activity. Deletes via `DELETE /api/activities/:id` therefore hard-removed the row. |
| **Backend cron / scheduler for baseline triggering** | Complexity not warranted at FYP scope. The frontend dashboards were the only consumers of the risk model; firing the trigger on dashboard load was sufficient and idempotent. |

---

## Quick reference for the viva (historical — if asked, lead with the 2026-07-20 removal, not these answers)

**"Does AIRMS delete data over time?"** *(historical answer, mechanism removed)*
> No, not automatically. The dashboard request was windowed to the last 12 weeks by default for performance, but `?all=1` returned full history. Athlete deletes of their own activity entries hard-removed the row — that was deliberate, because activities were athlete-owned training data and the athlete's deletion intent should be respected. **Current answer:** the mechanism this question was about (Activity Tracking) no longer exists.

**"What happens when an athlete's risk spikes?"** *(historical answer, mechanism removed)*
> A Recovery Baseline was auto-created — a snapshot of their personalised Low band and the chronic load they were sustaining before the elevation. Medical staff saw this as a "return-to-baseline target" card next to the composite risk hero. When the athlete returned to Low, the baseline auto-resolved. **Current answer:** nothing happens automatically — the composite risk model has no live caller, so there's no "spike" event to react to.

**"Why not just compute the return target on the fly?"** *(historical reasoning, kept for design-rationale value)*
> The snapshot captured the *pre-elevation* state. By the time the clinician was consulting the dashboard mid-episode, the athlete's current chronic load and personalised band would have shifted in response to the new training pattern. The snapshot preserved the target as it was at the moment the elevation began.
