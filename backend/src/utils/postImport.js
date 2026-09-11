// Post-import work queue. Committing a screening requires a cohort recompute,
// an indicator re-score, and (maybe) an alert — but the batch uploader commits
// files back-to-back, and running the full recompute once PER FILE is wasted
// work (N commits → N identical full recomputes) and holds every commit
// response open for seconds.
//
// This queue coalesces: each commit enqueues its athleteId and returns
// immediately; a short debounce window collects the burst, then ONE
// recompute + indicator pass runs and the alerts fire for every queued
// athlete. If more commits land while a flush is running, they simply queue
// the next flush — nothing is lost.
//
// Same non-fatal contract as before: a failed recompute is corrected by the
// next import or the admin "Recompute" button (routes/cohorts.js).

const { tryRecomputeAll } = require('./recompute');
const { alertMany } = require('./alerts');

const DEBOUNCE_MS = 1500; // > the uploader's inter-file spacing is NOT needed —
                          // any burst that outruns the window just flushes twice.
const BUSY_BACKOFF_MS = 5000; // another process holds the recompute lock

// DOES WORK SCHEDULED FOR AFTER THE RESPONSE ACTUALLY RUN?
//
// On a long-lived process, yes — the event loop keeps going and the debounce
// below is free efficiency. On a serverless host the invocation can be frozen
// the moment the response is flushed, and `schedule()` uses a 1.5s timer that
// is additionally `.unref()`ed, which explicitly tells Node not to stay alive
// for it. So everything this queue does — the cohort recompute AND the
// at-risk alert email — could simply never happen, with the import reporting
// success either way.
//
// That is the defect class of SILENT_FAILURES 3r, where the rate limiter's
// post-response decrement was issued on this very host and never landed. This
// one is strictly more exposed: 3r's write was scheduled on `res.finish`, and
// an unref'd timer is weaker than that.
//
// HONESTY ABOUT THE EVIDENCE: 3r was measured. THIS was not — no import has
// ever run on the hosted instance (0 `screening.import` audit rows, checked
// 2026-09-11), so there is no forensic trace to read either way. The hazard is
// UNMEASURED, not demonstrated. It is fixed anyway, because the cost of being
// wrong is asymmetric: awaiting costs ~50-200ms (a full local recompute,
// measured), and not awaiting costs a norm that never refreshed and a flagged
// athlete nobody was emailed about — discovered, if ever, in front of the
// stakeholder.
//
// `process.env.VERCEL` is already this codebase's platform test (config/db.js).
const DEFERRED_WORK_SURVIVES = !process.env.VERCEL;

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const pending = new Set(); // athleteIds awaiting the next flush
let timer = null;
let inFlight = null;       // promise of the currently-running flush

function schedule(delayMs) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, delayMs === undefined ? DEBOUNCE_MS : delayMs);
  if (timer.unref) timer.unref(); // never hold the process open for a flush
}

async function flush() {
  timer = null;
  if (inFlight) { schedule(); return; } // let the running flush finish first
  if (!pending.size) return;
  const batch = [...pending];
  pending.clear();
  let busy = false;
  inFlight = (async () => {
    try {
      // Cross-process, not just cross-flush: `inFlight` above only serialises
      // this process, and there can be more than one (§36, and the hosted API
      // may run several instances). Two passes at once can rescore athletes
      // against a thresholds table the other is halfway through rewriting.
      const ran = await tryRecomputeAll();
      if (ran === null) {
        // Somebody else is mid-recompute. Their pass covers the norms, which are
        // institution-wide — but it knows nothing about THIS batch's alerts, so
        // the athletes go back on the queue rather than being dropped. Dropping
        // them would be silent: the import succeeded, the norms are fresh, and
        // the flagged athlete simply never gets emailed about.
        busy = true;
        batch.forEach((id) => pending.add(id));
        return;
      }
      await alertMany(batch);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Post-import recompute/alert failed:', e.message);
    }
  })();
  await inFlight;
  inFlight = null;
  // Back off when the lock was held, so a long recompute elsewhere is not met
  // with a poll every 1.5s for its whole duration.
  if (pending.size) schedule(busy ? BUSY_BACKOFF_MS : undefined);
}

/**
 * Run everything queued so far NOW, inside the caller's request.
 *
 * Bounded on purpose. `flush()` handles a lock held by another instance by
 * putting the batch back on the queue, so an unbounded "keep trying until the
 * queue is empty" loop would spin against a long recompute elsewhere for as
 * long as it lasted — inside an HTTP request. Three attempts with a pause is
 * enough for an ordinary hand-off and gives up loudly rather than hanging the
 * import.
 *
 * Returns true when the queue drained.
 */
async function runPendingNow({ attempts = 3, waitMs = 750 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) await inFlight;
    if (!pending.size) return true;
    await flush();
    if (!pending.size) return true;
    if (i < attempts - 1) await sleep(waitMs);
  }
  if (pending.size) {
    // Loud, because the alternative is an import that looks complete and left
    // the norms stale. Not thrown: the screening itself committed, and failing
    // the request now would misdescribe what happened to the athlete's record.
    // eslint-disable-next-line no-console
    console.error(
      `[postImport] recompute/alert did NOT complete for ${pending.size} athlete(s)`
      + ' — another process held the lock. The next import or the admin'
      + ' "Recompute" button corrects the norms.',
    );
  }
  return !pending.size;
}

/**
 * Called by the commit route when a screening lands.
 *
 * On a long-lived process this returns immediately and the work is debounced,
 * which is what keeps a batch of N commits to ONE recompute. Where deferred
 * work is not guaranteed to run (see DEFERRED_WORK_SURVIVES) it is awaited
 * instead, so the response is a little slower and the work actually happens.
 *
 * AWAIT IT AT THE CALL SITE. It is safe to ignore the promise on a long-lived
 * process and it is the whole fix on a serverless one, so the call sites await
 * unconditionally rather than each deciding — a caller that reasoned about the
 * platform itself is how the two get out of step.
 */
async function queuePostImport(athleteId) {
  if (athleteId) pending.add(athleteId);
  if (DEFERRED_WORK_SURVIVES) {
    schedule();
    return { deferred: true, completed: false };
  }
  return { deferred: false, completed: await runPendingNow() };
}

// For scripts/tests: wait until everything queued so far has been processed.
async function flushNow() {
  while (pending.size || inFlight || timer) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) await inFlight;
    else if (pending.size) await flush();
  }
}

module.exports = {
  queuePostImport, flushNow, runPendingNow, DEFERRED_WORK_SURVIVES,
};
