// WHICH CODE IS THE RUNNING PROCESS RUNNING?
//
// Twice in one day a measurement described a build that was not the code being
// read: the six-day hosted outage probed from the working tree (§113), and a
// stale local server that made an "after" reading report no change (§116.5).
// Neither failed loudly — both produced a plausible number, which is this
// repo's defect class.
//
// See utils/buildId.js, scripts/assert-fresh.js and DESIGN_DECISIONS §117.

const fs = require('fs');
const os = require('os');
const path = require('path');

const { buildId, hashTree } = require('../src/utils/buildId');
const { checkFresh, report } = require('../scripts/assert-fresh');

describe('buildId', () => {
  it('is a short opaque hex digest', () => {
    // Opaque is the disclosure argument for putting it on an UNAUTHENTICATED
    // endpoint: it says the build changed and nothing else. A version string, a
    // path or a dependency list would each say more than was asked (§48).
    expect(buildId()).toMatch(/^[0-9a-f]{12}$/);
  });

  it('is stable across calls', () => {
    // The process cannot change under itself in any way that matters — nodemon
    // restarts it — so this is computed once. A probe reading two different
    // answers from one process would be worse than no answer.
    expect(buildId()).toBe(buildId());
  });

  it('is not a constant somebody could have typed', () => {
    // Guards the degenerate implementation that would satisfy every other test
    // here: returning a literal. The digest must be derived from the tree, so
    // it cannot equal the digest of nothing.
    const crypto = require('crypto');
    expect(buildId()).not.toBe(crypto.createHash('sha256').update('').digest('hex').slice(0, 12));
    expect(buildId()).not.toMatch(/^0{12}$/);
  });
});

describe('the fingerprint tracks CONTENT, not the filesystem', () => {
  // Pointed at the REAL implementation over a temp tree. It used to re-implement
  // the hashing here, and `npm run mutate` duly reported the CRLF guard as
  // SURVIVED — correctly, because breaking buildId.js could not fail a test that
  // never called it. A test that reimplements its subject tests the copy.

  let root;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildid-'));
    fs.writeFileSync(path.join(root, 'a.js'), 'const a = 1;\n');
    fs.writeFileSync(path.join(root, 'b.js'), 'const b = 2;\n');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  // THE TWO POSITIVE CONTROLS. Everything else here asserts the fingerprint
  // does NOT move, and a hash function that returned a constant would satisfy
  // all of them. These plant a real change and require the detector to report
  // it — the rule tests/guardCanaries.test.js enforces across every scanner in
  // this repo, and it is right to: a check that can only say "no difference" is
  // indistinguishable from a broken one.
  it('POSITIVE CONTROL: a planted byte change is detected', () => {
    const before = hashTree(root);
    fs.writeFileSync(path.join(root, 'a.js'), 'const a = 2;\n');
    expect(hashTree(root)).not.toBe(before);
  });

  it('POSITIVE CONTROL: a planted RENAME is detected, with every byte intact', () => {
    // A rename changes what runs. The path is hashed alongside the content so
    // this cannot read as "no change" — which is what hashing content alone
    // would have done.
    const before = hashTree(root);
    fs.renameSync(path.join(root, 'a.js'), path.join(root, 'c.js'));
    expect(hashTree(root)).not.toBe(before);
  });

  it('does NOT change when only the line endings differ', () => {
    // THE FALSE ALARM THIS EXISTS TO PREVENT. `.gitattributes` checks this repo
    // out with eol=lf, so a Windows working copy holds CRLF while the deployed
    // bundle holds LF. Hashing raw bytes would report every local-vs-hosted
    // comparison as "stale" for a reason that has nothing to do with the code —
    // and a check that cries wolf is a check that gets switched off.
    const before = hashTree(root);
    fs.writeFileSync(path.join(root, 'a.js'), 'const a = 1;\r\n');
    fs.writeFileSync(path.join(root, 'b.js'), 'const b = 2;\r\n');
    expect(hashTree(root)).toBe(before);
  });

  it('does NOT change when only mtime changes', () => {
    // mtime is rewritten by a checkout and says nothing about content, which is
    // why it is not what gets hashed.
    const before = hashTree(root);
    const t = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(root, 'a.js'), t, t);
    expect(hashTree(root)).toBe(before);
  });
});

describe('checkFresh — the verdict a probe acts on', () => {
  const API = 'http://localhost:9/api';
  let fetchSpy;
  const answer = (body) => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ json: async () => body });
  };
  afterEach(() => { if (fetchSpy) fetchSpy.mockRestore(); });

  it('passes when the running build matches this tree', async () => {
    answer({ ok: true, build: buildId() });
    await expect(checkFresh(API)).resolves.toMatchObject({ ok: true, reason: 'match' });
  });

  it('REFUSES when it does not', async () => {
    answer({ ok: true, build: 'deadbeef1234' });
    const r = await checkFresh(API);
    expect(r).toMatchObject({ ok: false, reason: 'stale' });
    // Both sides are reported, because "stale" without the two digests leaves
    // the reader unable to tell which end moved.
    expect(r.local).toBe(buildId());
    expect(r.remote).toBe('deadbeef1234');
  });

  it('WARNS rather than refusing against a server that predates the field', async () => {
    // The hosted API is exactly this until the next deploy. A check that broke
    // every existing workflow on the day it landed would be deleted, not heeded.
    answer({ ok: true, db: 'up' });
    await expect(checkFresh(API)).resolves.toMatchObject({ ok: true, reason: 'no-build-field' });
  });

  it('WARNS when the server could not fingerprint itself', async () => {
    answer({ ok: true, build: 'unknown' });
    await expect(checkFresh(API)).resolves.toMatchObject({ ok: true, reason: 'server-could-not-fingerprint' });
  });

  it('refuses when the instance cannot be reached at all', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(checkFresh(API)).resolves.toMatchObject({ ok: false });
  });
});

describe('report — what the exit code says', () => {
  const quiet = () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  };
  afterEach(() => jest.restoreAllMocks());

  it('exits 0 on a match', () => {
    quiet();
    expect(report({ ok: true, reason: 'match', local: 'a', remote: 'a' })).toBe(0);
  });

  it('exits 1 on a mismatch', () => {
    quiet();
    expect(report({ ok: false, reason: 'stale', local: 'a', remote: 'b' })).toBe(1);
  });

  it('exits 0 when it cannot tell, and 1 under --strict', () => {
    // The whole graduation. Lenient by default so it can land; strict for CI,
    // once every instance reports the field.
    quiet();
    const cannotTell = { ok: true, reason: 'no-build-field', local: 'a', remote: null };
    expect(report(cannotTell)).toBe(0);
    expect(report(cannotTell, { strict: true })).toBe(1);
  });
});

describe('the check is actually WIRED into the probe that needs it', () => {
  // The winAnsiSafe shape once more: checkFresh is a perfectly good function
  // whether or not anything calls it, and every test above passes with the
  // probe unguarded.
  const SRC = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'verify-claims.js'), 'utf8');

  it('verify:claims checks freshness', () => {
    expect(SRC).toContain('await checkFresh(API)');
  });

  it('and does so BEFORE measuring anything', () => {
    // After the first claim it would be an annotation on a bad measurement
    // rather than a reason not to take one.
    expect(SRC.indexOf('checkFresh(API)')).toBeLessThan(SRC.indexOf("call('/health')"));
  });

  it('and exits rather than continuing', () => {
    const after = SRC.split('checkFresh(API)')[1].slice(0, 400);
    expect(after).toContain('process.exit(1)');
  });
});
