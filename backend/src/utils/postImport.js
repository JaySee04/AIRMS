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

// Fire-and-forget from the commit route. The HTTP response does not wait.
function queuePostImport(athleteId) {
  if (athleteId) pending.add(athleteId);
  schedule();
}

// For scripts/tests: wait until everything queued so far has been processed.
async function flushNow() {
  while (pending.size || inFlight || timer) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (inFlight) await inFlight;
    else if (pending.size) await flush();
  }
}

module.exports = { queuePostImport, flushNow };
