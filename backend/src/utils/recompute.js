// The ONE place the norms are rebuilt and the indicators rescored.
//
// Rebuilding the norms rewrites `cohort_thresholds`; rescoring reads those rows
// back and writes an `overallIndicator` per athlete. Run two of those sequences
// at once and the second can score athletes against a table the first is still
// halfway through replacing — a published indicator computed from part of one
// norm set and part of another. It is wrong, it is plausible, and nothing
// anywhere reports it, which is the defect class this repo keeps producing
// (docs/SILENT_FAILURES.md).
//
// `postImport.js` already prevented that WITHIN one process, with an `inFlight`
// promise. That was enough while one process existed. It is not enough now:
// §36 made a second ticker normal, the hosted API can run more than one lambda,
// and `npm run mail:tick` is a separate process by design.
//
// So the sequence takes the same cross-process lock the scheduled mail does
// (`utils/lock.js`, compare-and-swap in `settings`, expiry so a crashed process
// cannot deadlock it).
//
// It is a FUNCTION rather than a lock taken at ten call sites, because ten call
// sites is how `riskIndicators` came to be maintained in eight places (§31) and
// how the role lists drifted (§42). A recompute that forgets the lock looks
// exactly like one that takes it.
//
// Not used by the seeder: it drops and recreates the database in a single
// process, so there is nothing to race, and a stale lock row left by a crashed
// server would block a reseed for its whole TTL.
const { recomputeCohorts } = require('./cohorts');
const { recomputeIndicators } = require('./overallIndicator');
const { withLock } = require('./lock');

const LOCK_NAME = 'recompute';

// Long enough for the full pass on a real roster, short enough that a crashed
// process costs one wait rather than an afternoon.
const TTL_MS = 3 * 60 * 1000;

// How long a user-initiated recompute queues before giving up. An administrator
// pressing Recompute will wait a few seconds; they will not wait three minutes,
// and an honest error beats a spinner.
const WAIT_MS = 20 * 1000;

class RecomputeBusyError extends Error {
  constructor() {
    super('Another norm recompute is already running. Wait for it to finish and try again.');
    this.name = 'RecomputeBusyError';
    this.status = 409;
  }
}

async function run({ cohorts, indicators }) {
  const c = cohorts ? await recomputeCohorts() : null;
  const i = indicators ? await recomputeIndicators() : null;
  return { cohorts: c, indicators: i };
}

/**
 * Rebuild the norms and rescore, waiting for any pass already running.
 *
 * Throws RecomputeBusyError if it cannot get the lock in time — deliberately,
 * because every caller of this reports a count back to somebody looking at a
 * screen. Returning zeros on a lock timeout would say "recomputed nothing"
 * when the truth is "did not recompute", and those are different answers.
 *
 * @param {{cohorts?: boolean, indicators?: boolean, waitMs?: number}} opts
 */
async function recomputeAll({ cohorts = true, indicators = true, waitMs = WAIT_MS } = {}) {
  const BUSY = Symbol('busy');
  const out = await withLock(LOCK_NAME, () => run({ cohorts, indicators }), {
    ttlMs: TTL_MS, waitMs, onBusy: BUSY,
  });
  if (out === BUSY) throw new RecomputeBusyError();
  return out;
}

/**
 * The same sequence for background work that can simply try again.
 *
 * Returns null when another pass holds the lock. The caller must RE-QUEUE
 * rather than move on: the running pass rebuilds the norms institution-wide,
 * but it knows nothing about this batch's alerts.
 */
async function tryRecomputeAll({ cohorts = true, indicators = true } = {}) {
  return withLock(LOCK_NAME, () => run({ cohorts, indicators }), {
    ttlMs: TTL_MS, onBusy: null,
  });
}

module.exports = {
  recomputeAll, tryRecomputeAll, RecomputeBusyError, LOCK_NAME, TTL_MS, WAIT_MS,
};
