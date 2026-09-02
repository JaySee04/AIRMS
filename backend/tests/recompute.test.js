// Rebuilding the norms and rescoring must not run twice at once.
//
// Rebuilding rewrites `cohort_thresholds`; rescoring reads those rows back and
// writes an overallIndicator per athlete. Two overlapping passes can score an
// athlete against a table the other is halfway through replacing — an indicator
// assembled from part of one norm set and part of another. Wrong, plausible,
// and reported nowhere.
//
// postImport.js guarded this WITHIN one process, with an `inFlight` promise.
// That stopped being enough when a second process became normal (§36: the mail
// tick is its own process, and the hosted API can run several instances).
//
// The models and the two heavy passes are mocked: this is a test about
// SEQUENCING, and it must not need a database to prove one.
jest.mock('../src/utils/cohorts', () => ({ recomputeCohorts: jest.fn() }));
jest.mock('../src/utils/overallIndicator', () => ({ recomputeIndicators: jest.fn() }));
jest.mock('../src/utils/lock', () => {
  // A faithful stand-in for the real cross-process lock: one holder at a time,
  // and `waitMs` queues rather than failing.
  let held = null;
  const acquire = async () => {
    if (held) return null;
    held = Symbol('token');
    return held;
  };
  const release = async (_n, token) => {
    if (held === token) { held = null; return true; }
    return false;
  };
  const acquireWaiting = async (name, { waitMs = 0 } = {}) => {
    const deadline = Date.now() + waitMs;
    for (;;) {
      const t = await acquire();
      if (t) return t;
      if (Date.now() >= deadline) return null;
      await new Promise((r) => { setTimeout(r, 5); });
    }
  };
  const withLock = async (name, fn, { onBusy = null, waitMs = 0 } = {}) => {
    const token = waitMs > 0 ? await acquireWaiting(name, { waitMs }) : await acquire();
    if (!token) return onBusy;
    try { return await fn(); } finally { await release(name, token); }
  };
  return {
    acquire, acquireWaiting, release, withLock, DEFAULT_TTL_MS: 1000, keyOf: (n) => `lock:${n}`,
  };
});

const { recomputeCohorts } = require('../src/utils/cohorts');
const { recomputeIndicators } = require('../src/utils/overallIndicator');
const { recomputeAll, tryRecomputeAll, RecomputeBusyError } = require('../src/utils/recompute');

const defer = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  recomputeCohorts.mockReset().mockResolvedValue(49);
  recomputeIndicators.mockReset().mockResolvedValue(56);
});

describe('recomputeAll', () => {
  it('runs the norms then the rescore, in that order', async () => {
    const order = [];
    recomputeCohorts.mockImplementation(async () => { order.push('cohorts'); return 49; });
    recomputeIndicators.mockImplementation(async () => { order.push('indicators'); return 56; });
    const out = await recomputeAll();
    expect(order).toEqual(['cohorts', 'indicators']);
    expect(out).toEqual({ cohorts: 49, indicators: 56 });
  });

  it('can rescore without rebuilding, for the settings and pin routes', async () => {
    const out = await recomputeAll({ cohorts: false });
    expect(recomputeCohorts).not.toHaveBeenCalled();
    expect(out).toEqual({ cohorts: null, indicators: 56 });
  });

  it('does not overlap a pass that is already running', async () => {
    const gate = defer();
    recomputeCohorts.mockImplementation(async () => { await gate.promise; return 49; });

    const first = recomputeAll();
    await new Promise((r) => { setTimeout(r, 10); });
    // Second caller queues; it must not have started the heavy work.
    const second = recomputeAll({ waitMs: 500 });
    await new Promise((r) => { setTimeout(r, 10); });
    expect(recomputeCohorts).toHaveBeenCalledTimes(1);

    gate.resolve();
    await first;
    await second;
    expect(recomputeCohorts).toHaveBeenCalledTimes(2);
  });

  it('THROWS rather than reporting zero when it cannot get the lock', async () => {
    // The honest failure. Returning { cohorts: null } would read on the admin
    // page as "recomputed nothing", which is a different claim from "did not
    // recompute" — and the second one is true.
    const gate = defer();
    recomputeCohorts.mockImplementation(async () => { await gate.promise; return 49; });
    const first = recomputeAll();
    await new Promise((r) => { setTimeout(r, 10); });

    await expect(recomputeAll({ waitMs: 20 })).rejects.toThrow(RecomputeBusyError);
    gate.resolve();
    await first;
  });

  it('releases the lock when the pass throws', async () => {
    recomputeCohorts.mockRejectedValueOnce(new Error('boom'));
    await expect(recomputeAll()).rejects.toThrow('boom');
    // A lock left held by a failure would block every later recompute until the
    // TTL expired, turning one bad pass into an outage.
    await expect(recomputeAll()).resolves.toEqual({ cohorts: 49, indicators: 56 });
  });
});

describe('tryRecomputeAll — the background path', () => {
  it('returns null instead of waiting, so the queue can re-queue', async () => {
    const gate = defer();
    recomputeCohorts.mockImplementation(async () => { await gate.promise; return 49; });
    const first = recomputeAll();
    await new Promise((r) => { setTimeout(r, 10); });

    await expect(tryRecomputeAll()).resolves.toBeNull();
    gate.resolve();
    await first;
  });

  it('runs normally when nothing holds the lock', async () => {
    await expect(tryRecomputeAll()).resolves.toEqual({ cohorts: 49, indicators: 56 });
  });
});

// The helper is only worth anything if the recompute paths go THROUGH it.
// Reading the sources, for the reason given in athleteDisclosure.test.js: a
// route that calls the unlocked function directly is exactly as correct-looking
// as one that does not.
describe('wiring — nothing recomputes outside the lock', () => {
  const fs = require('fs');
  const path = require('path');
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

  it.each([
    ['routes', 'cohorts.js'],
    ['routes', 'athletes.js'],
    ['utils', 'postImport.js'],
  ])('%s/%s calls no recompute directly', (dir, file) => {
    const src = read(dir, file);
    // Comments may still name them; code must not call them.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/\brecomputeCohorts\s*\(/);
    expect(code).not.toMatch(/\brecomputeIndicators\s*\(/);
    expect(code).toMatch(/require\('\.\.?\/(utils\/)?recompute'\)/);
  });

  it('the import queue re-queues its batch when the lock is held', () => {
    // Dropping the batch would be silent: the import succeeded, the norms are
    // fresh, and the flagged athlete is simply never emailed about.
    const src = read('utils', 'postImport.js');
    const at = src.indexOf('if (ran === null)');
    expect(at).toBeGreaterThan(-1);
    // Wide enough to clear the explanatory comment that sits inside the branch.
    expect(src.slice(at, at + 900)).toContain('pending.add(id)');
  });
});
