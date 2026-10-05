// The quota cap on the one endpoint that consumes a third-party allowance.
//
// Half unit test, half WIRING test, and the second half is the point: a rate
// limiter has the `winAnsiSafe` shape exactly — `visionThrottle` is a valid
// middleware in isolation however many routes reference it, so every unit test
// passes while the guard does nothing. The route file is therefore read as TEXT
// and the mounting asserted directly, as tests/athleteDisclosure.test.js does.
//
// See utils/visionThrottle.js and DESIGN_DECISIONS §97.2.

const fs = require('fs');
const path = require('path');
const {
  visionThrottle, reserveVisionCall, visionKey, LIMIT, WINDOW_MS, store,
} = require('../src/utils/visionThrottle');

const UPLOAD_ROUTES = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'upload.js'),
  'utf8',
);
const EXTRACT_RAW = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'utils', 'holomotionExtract.js'),
  'utf8',
);

/**
 * The source with `//` comments removed.
 *
 * NOT tidiness. `npm run mutate` reported SURVIVED on the compact-layout guard,
 * and the guard was right — the COMMENT above that line read "`providerCalls: 1`
 * alone also matches summaryFromPage1", so flipping the code to
 * `providerCalls: 0` left the assertion's needle sitting in the prose. A
 * source-reading test that reads comments is asserting on documentation.
 *
 * `\r?\n`, and CRLF normalised FIRST: `.` does not match `\r`, so a stripper
 * written against LF is silently inert on every file in this repo — the exact
 * defect serverlessLifecycle.test.js records having shipped.
 */
const stripComments = (src) => src
  .replace(/\r\n/g, '\n')
  .split('\n')
  .map((l) => l.replace(/\/\/.*$/, ''))
  .join('\n');

const EXTRACT_SRC = stripComments(EXTRACT_RAW);

/** The `router.post(...)`/`router.get(...)` line for one path, as written. */
function routeLine(routePath) {
  const line = UPLOAD_ROUTES.split(/\r?\n/)
    .find((l) => l.includes(`'${routePath}'`) && /^router\.(post|get)\(/.test(l.trim()));
  if (!line) throw new Error(`no route declaration found for ${routePath}`);
  return line;
}

describe('the limiter is actually MOUNTED on the metered endpoint', () => {
  it('the preview route carries visionThrottle', () => {
    // The whole guard is this one word appearing in this one line. If a
    // refactor drops it, every unit test below still passes and the quota cap
    // is gone — which is precisely why the assertion is here and not only
    // on the middleware's behaviour.
    expect(routeLine('/screening/pdf/preview')).toContain('visionThrottle');
  });

  it('mounts it AFTER the authorisation gates', () => {
    const line = routeLine('/screening/pdf/preview');
    // Ordering is a real property, not style: a caller who is not entitled to
    // import must be refused on AUTHORISATION rather than have their refusal
    // counted against a quota they were never entitled to spend.
    //
    // This used to name `requirePermission('uploadData')`, which was the gate
    // when medical staff could import. §123 made the import admin-only and
    // removed that capability key, so `rbac` is now the whole gate — and the
    // property it guards is unchanged. Asserted against `auth` as well, because
    // an anonymous caller must not be able to move the counter either.
    expect(line.indexOf('auth')).toBeLessThan(line.indexOf('visionThrottle'));
    expect(line.indexOf('rbac(')).toBeLessThan(line.indexOf('visionThrottle'));
    expect(line.indexOf('visionThrottle')).toBeGreaterThan(-1);
  });

  it('mounts it BEFORE multer', () => {
    const line = routeLine('/screening/pdf/preview');
    // Otherwise a caller who is already over quota still causes this process
    // to buffer a 20 MB upload into memory before reaching the same answer.
    expect(line.indexOf('visionThrottle'))
      .toBeLessThan(line.indexOf('uploadPdf.single'));
  });

  it('does NOT throttle the commit route, which calls no provider', () => {
    // The commit takes the ALREADY-extracted JSON and writes it. Throttling it
    // would ration the half of the flow that draws no quota, and — worse — a
    // clinician whose extraction already succeeded could be blocked from saving it.
    expect(routeLine('/screening/pdf')).not.toContain('visionThrottle');
  });

  it('does NOT throttle the status route', () => {
    // `GET /screening/pdf/status` is what the uploader polls to decide whether
    // to show itself at all. Rationing it would disable the feature's own
    // availability check.
    expect(routeLine('/screening/pdf/status')).not.toContain('visionThrottle');
  });

  it('is the ONLY route in this file that is throttled', () => {
    const throttled = UPLOAD_ROUTES.split(/\r?\n/)
      .filter((l) => /^router\.(post|get)\(/.test(l.trim()) && l.includes('visionThrottle'));
    expect(throttled).toHaveLength(1);
  });
});

describe('visionKey — accounting is per USER, not per IP', () => {
  it('keys on the authenticated user', () => {
    expect(visionKey({ user: { id: 7 }, ip: '10.0.0.1' })).toBe('u:7');
  });

  it('gives two users at the SAME address separate budgets', () => {
    // The §48 NAT lesson. ISN's clinicians share one outbound address; an IP
    // key would mean the second person to import that afternoon is refused
    // because of the first.
    const a = visionKey({ user: { id: 1 }, ip: '203.0.113.7' });
    const b = visionKey({ user: { id: 2 }, ip: '203.0.113.7' });
    expect(a).not.toBe(b);
  });

  it('gives ONE user the same budget from two different addresses', () => {
    // The other direction: a clinician on the ward wifi and then on a laptop
    // is one person spending one budget.
    expect(visionKey({ user: { id: 5 }, ip: '10.0.0.1' }))
      .toBe(visionKey({ user: { id: 5 }, ip: '198.51.100.9' }));
  });

  it('collapses an unidentified caller into ONE shared bucket', () => {
    // Fails closed. The alternative — a unique key per unidentified request —
    // hands every such request a full budget, which is the same as no limit.
    // Unreachable today (the route is behind `auth`), asserted so it stays a
    // decision rather than an accident.
    expect(visionKey({})).toBe('anon');
    expect(visionKey({ user: {} })).toBe('anon');
    expect(visionKey({ user: null, ip: '1.2.3.4' })).toBe('anon');
    expect(visionKey({ ip: '1.2.3.4' })).toBe(visionKey({ ip: '5.6.7.8' }));
  });
});

describe('the policy is loose enough not to fire during honest work', () => {
  it('allows several realistic batches per window', () => {
    // CLAUDE.md's worked example of a real batch is 15 PDFs. A cap that fired
    // during a normal import would be removed within a week and then protect
    // nothing, so "generous" is the design, not an oversight.
    const REALISTIC_BATCH = 15;
    expect(LIMIT).toBeGreaterThanOrEqual(REALISTIC_BATCH * 3);
  });

  it('is a bounded window, not a lifetime quota', () => {
    // A cap that never resets is an outage with extra steps.
    expect(WINDOW_MS).toBeGreaterThan(0);
    expect(WINDOW_MS).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });
});

// ---------------------------------------------------------------------------
// WHAT IS COUNTED (2026-09-28). Until §112/§114 the cap counted REQUESTS, which
// was right while every preview called the provider. It is now a cap on
// PROVIDER CALLS, and these pin the difference in both directions: an expanded
// report must cost nothing, and a compact one must still cost one.
// ---------------------------------------------------------------------------

/** Minimal res double — only what the gate touches. */
function fakeRes() {
  return {
    headers: {}, statusCode: null, body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('the gate counts provider calls, not requests', () => {
  const ENV = { key: process.env.VISION_API_KEY, model: process.env.VISION_MODEL };
  let read; let increment;

  beforeEach(() => {
    // Spied, not stubbed at the module boundary, so the REAL gate runs. No
    // database is touched: every store access goes through these two.
    read = jest.spyOn(store, 'read').mockResolvedValue(null);
    increment = jest.spyOn(store, 'increment').mockResolvedValue({ totalHits: 1 });
    process.env.VISION_API_KEY = 'test-key';
    process.env.VISION_MODEL = 'test-model';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.VISION_API_KEY = ENV.key === undefined ? '' : ENV.key;
    process.env.VISION_MODEL = ENV.model === undefined ? '' : ENV.model;
  });

  const req = () => ({ user: { id: 7 }, ip: '10.0.0.1' });

  it('lets a request through WITHOUT incrementing', async () => {
    // The heart of it. Passing the gate must not spend anything, because at
    // this point nobody knows whether this report needs the provider at all —
    // multer has not even read the file yet.
    const next = jest.fn();
    await visionThrottle(req(), fakeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(increment).not.toHaveBeenCalled();
  });

  it('SKIPS entirely when no provider is configured', async () => {
    // The ISN install. With no key nothing can draw the allowance, so rationing
    // the import to 60/hour obstructed work that was free — it would have fired
    // in the middle of onboarding a squad.
    process.env.VISION_API_KEY = '';
    const next = jest.fn();
    await visionThrottle(req(), fakeRes(), next);
    expect(next).toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('refuses with 429 once the counter is at the limit', async () => {
    read.mockResolvedValue({ hits: LIMIT, resetAt: Date.now() + 60_000 });
    const res = fakeRes(); const next = jest.fn();
    await visionThrottle(req(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    // Names neither the provider nor the quota — operator information (§48).
    expect(res.body.message).toMatch(/screening extractions/i);
    expect(JSON.stringify(res.body)).not.toMatch(/gemini|openai|token|api[_ -]?key/i);
  });

  it('allows the request one short of the limit', async () => {
    read.mockResolvedValue({ hits: LIMIT - 1, resetAt: Date.now() + 60_000 });
    const next = jest.fn();
    await visionThrottle(req(), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('treats an EXPIRED window as fresh rather than accumulating', async () => {
    read.mockResolvedValue({ hits: LIMIT * 5, resetAt: Date.now() - 1 });
    const next = jest.fn();
    await visionThrottle(req(), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });

  it('FAILS OPEN when the store cannot be read', async () => {
    // Same posture as the auth limiter: a settings-table hiccup must not stop
    // an import. The cost of failing open is an unmetered window; the cost of
    // failing closed is a clinic that cannot ingest.
    read.mockRejectedValue(new Error('settings table unavailable'));
    const next = jest.fn();
    await visionThrottle(req(), fakeRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('reserveVisionCall — claimed BEFORE the call, not after', () => {
  let increment;
  beforeEach(() => { increment = jest.spyOn(store, 'increment'); });
  afterEach(() => jest.restoreAllMocks());

  const req = { user: { id: 7 } };

  it('counts the call and allows it while under the limit', async () => {
    increment.mockResolvedValue({ totalHits: 1 });
    await expect(reserveVisionCall(req)).resolves.toBe(true);
    expect(increment).toHaveBeenCalledWith('u:7');
  });

  it('allows the call that lands exactly ON the limit', async () => {
    // The 60th call in the window is the last permitted one, not the first
    // refused one. Off by one here either wastes a call a clinician paid for
    // or hands out one more than the policy says.
    increment.mockResolvedValue({ totalHits: LIMIT });
    await expect(reserveVisionCall(req)).resolves.toBe(true);
  });

  it('refuses the one after it', async () => {
    increment.mockResolvedValue({ totalHits: LIMIT + 1 });
    await expect(reserveVisionCall(req)).resolves.toBe(false);
  });

  it('counts BEFORE deciding, so a refusal is not a free retry', async () => {
    // The ordering is the whole point of §115.6. Test-then-increment would let
    // a caller sitting on the limit spend one over; increment-then-test cannot.
    increment.mockResolvedValue({ totalHits: LIMIT + 1 });
    await reserveVisionCall(req);
    expect(increment).toHaveBeenCalledTimes(1);
  });

  it('FAILS OPEN when the counter cannot be written', async () => {
    // Same posture as every other path in this file: losing the accounting must
    // not lose the operator their import.
    increment.mockRejectedValue(new Error('settings table unavailable'));
    await expect(reserveVisionCall(req)).resolves.toBe(true);
  });

  it('treats a store returning nonsense as permission, not refusal', async () => {
    // A store that answers without totalHits is broken, and a broken meter must
    // not become an outage.
    for (const v of [{}, { totalHits: undefined }, { totalHits: null }]) {
      increment.mockResolvedValue(v);
      // eslint-disable-next-line no-await-in-loop
      await expect(reserveVisionCall(req)).resolves.toBe(true);
    }
  });
});

describe('the claim is actually WIRED into the extractor', () => {
  // The `winAnsiSafe` shape again: chargeVisionQuota is a perfectly good
  // function whether or not anything calls it, so every test above passes with
  // the meter disconnected and the quota never counted.
  const previewBody = UPLOAD_ROUTES.split("router.post('/screening/pdf/preview'")[1]
    .split('router.post(')[0];

  it('the preview handler hands the extractor a way to claim a call', () => {
    // The winAnsiSafe shape: reserveVisionCall is a perfectly good function
    // whether or not anything calls it, so every behavioural test above
    // passes with the meter disconnected and the quota never counted.
    expect(previewBody).toContain('reserveProviderCall: () => reserveVisionCall(req)');
  });

  it('claims it BEFORE responding', () => {
    // Not style. Post-response work on Vercel is deferred until another request
    // thaws the instance, so an increment after res.json lands eventually and
    // never in time — SILENT_FAILURES 3r, measured.
    expect(previewBody.indexOf('reserveVisionCall'))
      .toBeLessThan(previewBody.indexOf('res.json(result)'));
  });

  it('the commit route claims nothing', () => {
    const commitBody = UPLOAD_ROUTES.split("router.post('/screening/pdf',")[1] || '';
    expect(commitBody.split('router.post(')[0]).not.toContain('reserveVisionCall');
  });


  it('BOTH provider call sites claim first', () => {
    // There are exactly two places a request is sent: the compact-layout
    // extraction and the Summary top-up. A new one added without a claim would
    // spend the allowance silently, which is the failure this whole section is
    // about — so the count is asserted, not the presence.
    const calls = (EXTRACT_SRC.match(/await visionComplete\(/g) || []).length;
    const claims = (EXTRACT_SRC.match(/await reserve(?:ProviderCall)?\(\)/g) || []).length;
    expect(calls).toBe(2);
    expect(claims).toBe(2);
  });

  it('the compact layout REFUSES when the claim fails', () => {
    // It has no text to fall back on, so being out of quota is a refusal rather
    // than a degraded read — and a 429, because the cause is this caller's own
    // rate of use rather than the server's configuration.
    const block = EXTRACT_SRC.split('reserveProviderCall && !(await reserveProviderCall())')[1] || '';
    expect(block.slice(0, 400)).toContain('429');
  });

  it('the Summary top-up DEGRADES when the claim fails', () => {
    // The numbers are already read and exact. Losing the Summary is a missing
    // section §70's renderer handles; losing the import would be worse.
    const block = EXTRACT_SRC.split('reserve && !(await reserve())')[1] || '';
    expect(block.slice(0, 200)).toContain('refused: true');
    expect(block.slice(0, 200)).not.toContain('throw');
  });

  it('the VISION path reports exactly one call', () => {
    // Anchored inside the `method: 'vision'` return rather than searched for
    // anywhere in the file: `providerCalls: 1` also appears in
    // summaryFromPage1, so a bare contains() would pass with the path that
    // actually spends the allowance reporting nothing.
    const block = EXTRACT_SRC.split("method: 'vision',")[1] || '';
    expect(block.split('};')[0]).toContain('providerCalls: 1');
  });

  it('the TEXT-LAYER path reports the running count, not a literal', () => {
    // It must be 0 for a report read end to end and 1 when the Summary needed
    // the model, so a hardcoded value here is wrong in one direction or the
    // other — and 0 would be the direction that silently stops metering.
    // Bounded by CODE at both ends — `if (fast.ok) {` opens the text-layer
    // branch and `method: 'vision'` is the first thing after it. Anchoring on a
    // comment instead would make this a test of the prose.
    const fastBranch = (EXTRACT_SRC.split('if (fast.ok) {')[1] || '').split("method: 'vision'")[0];
    // `\r?\n`, not `\n`. Every source file in this repo is CRLF, so a pattern
    // ending in a bare `\n` matches nothing and the check reports all clear —
    // the same trap serverlessLifecycle.test.js documents in its comment
    // stripper, hit again while writing this.
    expect(fastBranch).toMatch(/\r?\n\s*providerCalls,\r?\n/);
    expect(fastBranch).not.toMatch(/providerCalls: [01]/);
  });

  it('the summary top-up is charged even when the reply carries no summary', () => {
    // The call was made and the allowance is spent. Metering what came BACK
    // rather than what was SENT is how a quota cap stops bounding anything.
    expect(EXTRACT_SRC).toMatch(/providerCalls \+= top\.providerCalls/);
  });
});

describe('the comment stripper is not inert', () => {
  it('removes a // comment but keeps the code', () => {
    // The whole reason EXTRACT_SRC exists. Without this, a stripper that
    // matched nothing would leave every source assertion below reading prose
    // and reporting green — which is what happened.
    expect(stripComments('const a = 1; // providerCalls: 1')).toBe('const a = 1; ');
  });

  it('works on CRLF, which is what this repo checks out', () => {
    // Built from escapes rather than written literally: `\r\n` inside a source
    // file is the thing under test, and a literal newline in the string is a
    // syntax error — which is exactly what the first version of this line was.
    expect(stripComments(['a(); // x', 'b();'].join('\r\n'))).toBe(['a(); ', 'b();'].join('\n'));
  });

  it('actually removed something from the file under test', () => {
    // A canary for THIS file rather than for a string literal: if the stripper
    // ever stops matching, this fails instead of every guard going quiet.
    expect(EXTRACT_SRC.length).toBeLessThan(EXTRACT_RAW.length);
    expect(EXTRACT_RAW).toContain('`providerCalls: 1` alone also matches');
    expect(EXTRACT_SRC).not.toContain('`providerCalls: 1` alone also matches');
  });
});
