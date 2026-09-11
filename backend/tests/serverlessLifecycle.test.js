// WORK SCHEDULED FOR AFTER THE RESPONSE — the defect class, guarded as a class.
//
// SILENT_FAILURES 3r was one instance: `express-rate-limit`'s
// `skipSuccessfulRequests` un-counts a success from a `res.on('finish')`
// handler, i.e. after the response is flushed. On a long-lived process that
// write completes. On the hosted serverless API it did not, and the deployed
// limiter counted successes for weeks while its own header said otherwise.
//
// THE MECHANISM, measured 2026-09-11 with a temporary diagnostic endpoint and
// then reverted. It is NOT "the work is discarded", which is what three
// documents here asserted before anybody checked:
//
//   Post-response work is DEFERRED until the instance is thawed by a later
//   request. It runs eventually; it does not run in time.
//
// Which is worse than losing it, because it looks fine in a log. Anything that
// must be visible to the NEXT request is reliably too late: that request reads
// the counter before the previous decrement has been applied, and the store's
// read-modify-write then writes over it.
//
// The control that settles it — same limiter, same store, same code, six
// successful requests three seconds apart:
//
//   local   remaining 999 999 999 999 999 999   (decrement always in time)
//   hosted  remaining 999 998 997 997 996 995   (mostly too late; #4 caught up)
//
// The specific bug is fixed and separately tested. What THIS file guards is the
// SHAPE, because the shape is what will come back: a correct component wired to
// a lifecycle hook the platform does not promise to run. Unit tests assert the
// component, integration tests assert the wiring, and neither asserts the host
// is still alive when the callback fires. Only a deployed request shows it,
// which means it is found late or not at all.
//
// So the hazard is named here as a value, and every occurrence must be either
// absent or deliberately accounted for.
//
// WHAT IS SAFE, AND WHY THE DISTINCTION IS NOT PEDANTRY. Measured on the hosted
// API 2026-09-11:
//
//   * `recordAudit()` fires `AuditLog.create(...)` WITHOUT awaiting — and the
//     row LANDS, promptly. It is started DURING the handler, so the query is
//     already in flight when the reply goes out.
//   * a write issued from a `res.on('finish')` handler also landed — 3ms after
//     the request. So the hook fires and its I/O completes.
//   * an unref'd `setTimeout(…, 1500)` landed 7.25 SECONDS later, when the next
//     request thawed the instance. Not lost — late, by an unbounded amount.
//
// So the line is about WHEN, not whether: work started before the response is
// in flight and completes; work that needs the event loop AFTER the response
// waits for the next invocation. Anything whose value depends on being ready
// before the next request cannot be scheduled that way.
//
// That is why `postImport`'s 1.5s timer had to go: a cohort recompute and an
// at-risk alert email that run "whenever somebody next calls the API" are not
// a queue, they are a coin toss.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const FILES = jsFiles(SRC);
const rel = (f) => path.relative(SRC, f).replace(/\\/g, '/');

/**
 * Source with comments stripped, so a file DISCUSSING the hazard is not read as
 * an instance of it.
 *
 * THE `\r` NORMALISATION IS LOAD-BEARING, and left this scanner silently inert
 * on first run. This repository holds a mix of line endings — files committed
 * on Windows are CRLF, files written this session are LF. After `split('\n')`
 * a CRLF line still ends in `\r`, and in JavaScript `.` matches any character
 * EXCEPT a line terminator, which includes `\r`. So `^\s*\/\/.*$` could not
 * match a comment on any CRLF line, and every pre-existing file went through
 * unstripped.
 *
 * The canary below did not catch it, because the file it checked was one I had
 * just written — in LF, the single format where the stripper worked. A control
 * that only exercises the happy path is not a control, which is the same
 * lesson as SILENT_FAILURES 3l one layer out: the guard was fine, its
 * VERIFICATION picked the wrong subject.
 */
function code(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/.*$/, ''))
    .join('\n');
}

describe('the scan can see the code it claims to check', () => {
  // Floors first. A scanner that silently matched nothing would report this
  // whole hazard class as absent, which is the failure it exists to prevent —
  // and this project has shipped exactly that (SILENT_FAILURES 3l).
  it('reads a real corpus', () => {
    expect(FILES.length).toBeGreaterThan(40);
    expect(FILES.some((f) => rel(f) === 'utils/postImport.js')).toBe(true);
    expect(FILES.some((f) => rel(f) === 'utils/audit.js')).toBe(true);
  });

  it('strips comments in BOTH line-ending styles', () => {
    // Two subjects on purpose, and the second is the one that matters.
    //
    // authThrottle.js (LF, written 2026-09-11) and routes/auth.js (CRLF,
    // committed earlier) both DISCUSS `res.on('finish')` in comments and use it
    // nowhere. The first version of this control checked only the LF file and
    // passed while the stripper was inert on every CRLF file in the repo.
    for (const f of [['utils', 'authThrottle.js'], ['routes', 'auth.js']]) {
      const full = path.join(SRC, ...f);
      expect(fs.readFileSync(full, 'utf8')).toContain("res.on('finish')"); // it IS in the file
      expect(code(full)).not.toContain("res.on('finish')"); // ...and only in a comment
    }
  });

  it('still sees real code on a CRLF file', () => {
    // The mirror of the above: a stripper aggressive enough to remove comments
    // must not also remove the statements around them, or every check here
    // passes by finding nothing.
    expect(code(path.join(SRC, 'routes', 'auth.js'))).toMatch(/router\.post\('\/login'/);
  });
});

describe('nothing waits for the response to finish before doing its work', () => {
  it('registers no post-response hooks anywhere', () => {
    const offenders = [];
    for (const f of FILES) {
      const src = code(f);
      if (/\bres(?:ponse)?\s*\.\s*on\s*\(\s*['"](finish|close)['"]/.test(src)) offenders.push(rel(f));
    }
    // If a future change genuinely needs one, it must ALSO ensure the work is
    // complete BEFORE the next request needs its result — deferral to the next
    // thaw is the measured behaviour, not loss — and this test is where that
    // reasoning gets written down, rather than silently added.
    expect(offenders).toEqual([]);
  });

  it('does not re-enable skipSuccessfulRequests', () => {
    // The exact option that caused 3r. It looks harmless and reads as an
    // optimisation, which is why naming it is worth more than a comment.
    const offenders = FILES.filter((f) => /skipSuccessfulRequests\s*:/.test(code(f))).map(rel);
    expect(offenders).toEqual([]);
  });
});

// Asserted by BEHAVIOUR, not by grepping for the identifier.
//
// A source scan can only say the word `DEFERRED_WORK_SURVIVES` appears, which
// stays true if the branch is inverted, the constant is unused, or the work is
// skipped entirely. What matters is whether the recompute has actually happened
// by the time the commit route's promise resolves — so these load the module
// twice, under each platform, and watch.
describe('deferred post-import work is not assumed to run', () => {
  const RECOMPUTE = path.join(SRC, 'utils', 'recompute.js');
  const ALERTS = path.join(SRC, 'utils', 'alerts.js');
  const MODULE = path.join(SRC, 'utils', 'postImport.js');

  function loadWith({ serverless }) {
    jest.resetModules();
    const calls = { recompute: 0, alert: 0 };
    jest.doMock(RECOMPUTE, () => ({
      tryRecomputeAll: async () => { calls.recompute += 1; return true; },
    }));
    jest.doMock(ALERTS, () => ({
      alertMany: async () => { calls.alert += 1; },
    }));
    const had = process.env.VERCEL;
    if (serverless) process.env.VERCEL = '1'; else delete process.env.VERCEL;
    // eslint-disable-next-line global-require
    const mod = require(MODULE);
    if (had === undefined) delete process.env.VERCEL; else process.env.VERCEL = had;
    return { mod, calls };
  }

  afterEach(() => { jest.resetModules(); jest.dontMock(RECOMPUTE); jest.dontMock(ALERTS); });

  it('does the work INSIDE the call where deferring is unsafe', async () => {
    // The whole fix. If this resolves before the recompute ran, then on the
    // hosted instance an import would report success having refreshed no norms
    // and emailed nobody — and nothing would say so.
    const { mod, calls } = loadWith({ serverless: true });
    expect(mod.DEFERRED_WORK_SURVIVES).toBe(false);

    await mod.queuePostImport('070202021001');

    expect(calls.recompute).toBe(1);
    expect(calls.alert).toBe(1);
  });

  it('still defers on a long-lived process, so a batch stays ONE recompute', async () => {
    // The optimisation must survive the fix. N commits in a burst must not
    // become N full recomputes locally.
    const { mod, calls } = loadWith({ serverless: false });
    expect(mod.DEFERRED_WORK_SURVIVES).toBe(true);

    await mod.queuePostImport('a');
    await mod.queuePostImport('b');
    await mod.queuePostImport('c');
    expect(calls.recompute).toBe(0); // nothing has run yet — it is debounced

    await mod.flushNow();
    expect(calls.recompute).toBe(1); // and the three coalesced into one
  });

  it('bounds the in-request work instead of looping until the queue drains', async () => {
    // flush() puts the batch BACK on the queue when another process holds the
    // recompute lock. An unbounded "drain the queue" loop would then spin
    // inside an HTTP request for as long as the other recompute lasted, which
    // is a hang rather than a slow import.
    jest.resetModules();
    let attempts = 0;
    jest.doMock(RECOMPUTE, () => ({
      tryRecomputeAll: async () => { attempts += 1; return null; }, // always busy
    }));
    jest.doMock(ALERTS, () => ({ alertMany: async () => {} }));
    const had = process.env.VERCEL;
    process.env.VERCEL = '1';
    // eslint-disable-next-line global-require
    const mod = require(MODULE);
    if (had === undefined) delete process.env.VERCEL; else process.env.VERCEL = had;

    const done = await mod.queuePostImport('070202021001');

    expect(done.completed).toBe(false);       // gave up rather than hanging
    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(attempts).toBeLessThanOrEqual(5);  // bounded
  }, 15000);

  it('is AWAITED at every call site', () => {
    // The fix is worth nothing if a caller drops the promise, and dropping a
    // promise is invisible: no error, no warning, and correct behaviour on the
    // machine the developer is using.
    const callers = FILES.filter((f) => /queuePostImport\s*\(/.test(code(f)) && rel(f) !== 'utils/postImport.js');
    expect(callers.length).toBeGreaterThanOrEqual(2); // floor: the scan found the call sites

    const unawaited = [];
    for (const f of callers) {
      for (const line of code(f).split('\n')) {
        if (/queuePostImport\s*\(/.test(line) && !/\brequire\b/.test(line) && !/await\s+queuePostImport/.test(line)) {
          unawaited.push(`${rel(f)}: ${line.trim()}`);
        }
      }
    }
    expect(unawaited).toEqual([]);
  });
});

describe('what IS allowed to be fire-and-forget, and why', () => {
  it('audit writes start during the handler, not after the response', () => {
    // Measured on the hosted API: the row lands. recordAudit issues the create
    // while the handler is still running, so it is in flight before the reply
    // goes out — a different thing from scheduling work for afterwards.
    //
    // It must stay non-blocking for the reason audit.js argues at length: a
    // broken audit table must not be able to refuse a physiotherapist an
    // athlete's record at 8am. This pins that it is not converted into a
    // post-response hook in an attempt to "make it reliable".
    const audit = code(path.join(SRC, 'utils', 'audit.js'));
    expect(audit).toMatch(/AuditLog\.create\(/);
    expect(audit).not.toMatch(/res\s*\.\s*on\s*\(/);
  });
});
