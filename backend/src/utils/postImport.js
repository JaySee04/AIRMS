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

const { recomputeCohorts } = require('./cohorts');
const { recomputeIndicators } = require('./overallIndicator');
const { alertMany } = require('./alerts');

const DEBOUNCE_MS = 1500; // > the uploader's inter-file spacing is NOT needed —
                          // any burst that outruns the window just flushes twice.

const pending = new Set(); // athleteIds awaiting the next flush
let timer = null;
let inFlight = null;       // promise of the currently-running flush

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
  if (timer.unref) timer.unref(); // never hold the process open for a flush
}

async function flush() {
  timer = null;
  if (inFlight) { schedule(); return; } // let the running flush finish first
  if (!pending.size) return;
  const batch = [...pending];
  pending.clear();
  inFlight = (async () => {
    try {
      await recomputeCohorts();
      await recomputeIndicators();
      await alertMany(batch);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Post-import recompute/alert failed:', e.message);
    }
  })();
  await inFlight;
  inFlight = null;
  if (pending.size) schedule(); // commits that arrived mid-flush
}

// Fire-and-forget from the commit route. The HTTP response does not wait.
function queuePostImport(athleteId) {
  if (athleteId) pending.add(athleteId);
  schedule();
}

// Injury changes now affect the overall band (active-injury escalation), but an
// injury doesn't change cohort screening stats — so it needs only an indicator
// re-score, NOT a cohort recompute or an import-style alert (medical/coaches
// already know; they just logged it). Separate debounced lane so a burst of
// edits coalesces without touching the import queue's alert path.
let indTimer = null;
let indInFlight = null;
async function flushIndicators() {
  indTimer = null;
  if (indInFlight) { scheduleIndicators(); return; }
  indInFlight = (async () => {
    try {
      await recomputeIndicators();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Indicator recompute (injury change) failed:', e.message);
    }
  })();
  await indInFlight;
  indInFlight = null;
  if (indTimer) scheduleIndicators();
}
function scheduleIndicators() {
  if (indTimer) clearTimeout(indTimer);
  indTimer = setTimeout(flushIndicators, DEBOUNCE_MS);
  if (indTimer.unref) indTimer.unref();
}
function queueIndicatorRecompute() { scheduleIndicators(); }

// For scripts/tests: wait until everything queued so far has been processed.
async function flushNow() {
  while (pending.size || inFlight || timer || indTimer || indInFlight) {
    if (timer) { clearTimeout(timer); timer = null; }
    if (indTimer) { clearTimeout(indTimer); indTimer = null; }
    if (inFlight) await inFlight;
    else if (indInFlight) await indInFlight;
    else if (pending.size) await flush();
    else await flushIndicators();
  }
}

module.exports = { queuePostImport, queueIndicatorRecompute, flushNow };
