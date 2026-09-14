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
  visionKey, LIMIT, WINDOW_MS,
} = require('../src/utils/visionThrottle');

const UPLOAD_ROUTES = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'routes', 'upload.js'),
  'utf8',
);

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

  it('mounts it AFTER the permission gate', () => {
    const line = routeLine('/screening/pdf/preview');
    // Ordering is a real property, not style: a caller without `uploadData`
    // must be refused on permission rather than have their refusal counted
    // against a quota they were never entitled to spend.
    expect(line.indexOf("requirePermission('uploadData')"))
      .toBeLessThan(line.indexOf('visionThrottle'));
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
