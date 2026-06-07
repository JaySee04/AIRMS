# AIRMS — Storage Mechanisms

A short reference for the two storage-related behaviours that exist on top of plain CRUD in AIRMS, what each one does, why it's there, and how to defend each in viva.

The headline: **AIRMS never auto-deletes historical training data.** Longitudinal records are the institutional value the system is being built to deliver (Problem Statement 1). One performance mechanism keeps the dashboard request cheap without losing access to history, and one clinical mechanism captures a recovery-target snapshot when an athlete's risk first escalates.

---

## 1. Default time-window on activity history

**Where:** `GET /api/activities/athlete/:id` — backend route at [`backend/src/routes/activities.js`](../backend/src/routes/activities.js).

**What it does.** When no query parameters are supplied, the endpoint returns only the last **12 weeks** of activities for the athlete (covers the 8-week dashboard chart with a 4-week buffer). Three query parameters override the default:

| Query | Behaviour |
|---|---|
| `?weeks=N` | Most-recent N weeks |
| `?from=YYYY-MM-DD&to=YYYY-MM-DD` | Explicit date range |
| `?all=1` | No date constraint — full history (intended for admin audit / PDF reports) |

**Why.** The athlete dashboard renders only an 8-week window of data, so loading 5 years of activities into the browser would waste bandwidth and slow page paint on athletes with long records. Capping the default at 12 weeks keeps the dashboard request cheap, while the explicit override paths preserve the option to read full history when something actually needs it (admin reports, clinician deep dives, audit).

**Why this is *not* "data deletion".** Nothing is ever removed from the database by this mechanism. The endpoint is a *view* over the data, not a destruction operation. Older rows remain queryable through `?from=`, `?all=1`, or any direct query.

**Viva defensibility.** Aligned with the longitudinal-records principle in PS1: history is preserved; only the default *projection* is windowed for performance. This is a standard pagination/windowing pattern, not a data-retention compromise.

---

## 2. Recovery Baseline snapshot

**Where:** [`backend/src/models/RecoveryBaseline.js`](../backend/src/models/RecoveryBaseline.js), [`backend/src/routes/recoveryBaselines.js`](../backend/src/routes/recoveryBaselines.js), surfaced in [`frontend/src/app/medical/dashboard/page.tsx`](../frontend/src/app/medical/dashboard/page.tsx), and auto-triggered from both athlete and medical dashboards.

**What it does.** When an athlete's composite risk first transitions out of Low Risk (either to Moderate, High, or any Compound state), the system captures a snapshot of the pre-elevation training state — the athlete's ACWR at that moment, their chronic load, and their personalised Low band. This snapshot becomes the clinician-facing "return-to-play target." When the athlete returns to Low Risk, the snapshot is marked resolved.

**Schema.** One row per non-Low episode:

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

**Auto-trigger.** Both the athlete dashboard ([`frontend/src/app/athlete/dashboard/page.tsx`](../frontend/src/app/athlete/dashboard/page.tsx)) and medical dashboard ([`frontend/src/app/medical/dashboard/page.tsx`](../frontend/src/app/medical/dashboard/page.tsx)) fire a fire-and-forget POST to `/api/recovery-baselines` whenever the displayed composite risk is non-Low. The POST endpoint is **idempotent**: if a baseline is already open for the athlete, the existing row is returned and no duplicate is created. When risk returns to Low, a PATCH to `/api/recovery-baselines/athlete/:id/resolve` closes the active baseline (no-op if none active).

**Display.** Medical dashboard renders a gold-bordered "Recovery baseline" card directly under the composite risk hero whenever an active baseline exists. Shows return-to-Low band, snapshot ACWR, chronic load at snapshot, and trigger factors.

**Why.** This is the clinical hook for the recovery workflow: the baseline isn't a recovery prescription, it's a **target** the clinician can use to confirm gradual return-to-training. The athlete's pre-elevation load level is the safe return point; ramping ACWR back into the personalised Low band restores them to baseline. Without the snapshot, the clinician would need to manually inspect the workload chart to find the pre-elevation point each time.

**Viva defensibility.** Maps directly to the rebound-spike concept from Qin (2025) and the detraining literature: the danger after an elevation episode is the *return* spike. The baseline gives the clinician a concrete personalised target rather than relying on the textbook 0.8–1.3 band universally.

---

## What is intentionally NOT done

| Option considered | Why rejected |
|---|---|
| **Auto-delete activities older than N weeks** | Contradicts PS1 (longitudinal records). Storage cost is trivial (~100 bytes/row); the actual cost would be losing the institution's longitudinal value. |
| **Archive table for old records** | Premature optimisation. MySQL handles tens of millions of rows on a single indexed `(athlete_id, date)` lookup without any sharding. AIRMS is nowhere near that scale. |
| **Soft-delete on Activity** | Considered and rejected. Activities are athlete-owned training entries, not clinical records — a deletion should respect the athlete's intent. An audit-trail argument is stronger on the `Injury` table (which is clinician-owned) than on Activity. Deletes via `DELETE /api/activities/:id` therefore hard-remove the row. |
| **Backend cron / scheduler for baseline triggering** | Complexity not warranted at FYP scope. The frontend dashboards are the only consumers of the risk model; firing the trigger on dashboard load is sufficient and idempotent. |

---

## Quick reference for the viva

**"Does AIRMS delete data over time?"**
> No, not automatically. The dashboard request is windowed to the last 12 weeks by default for performance, but `?all=1` returns full history. Athlete deletes of their own activity entries hard-remove the row — that's deliberate, because activities are athlete-owned training data and the athlete's deletion intent should be respected.

**"What happens when an athlete's risk spikes?"**
> A Recovery Baseline is auto-created — a snapshot of their personalised Low band and the chronic load they were sustaining before the elevation. Medical staff see this as a "return-to-baseline target" card next to the composite risk hero. When the athlete returns to Low, the baseline auto-resolves.

**"Why not just compute the return target on the fly?"**
> The snapshot captures the *pre-elevation* state. By the time the clinician is consulting the dashboard mid-episode, the athlete's current chronic load and personalised band have shifted in response to the new training pattern. The snapshot preserves the target as it was at the moment the elevation began.
