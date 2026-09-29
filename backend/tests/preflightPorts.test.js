// The dev-server port preflight.
//
// It exists because a stale frontend on :3000 makes `npm run e2e` test the
// PREVIOUS build and pass — the worst shape of this project's defect class,
// since nothing fails. So the preflight itself must be verified: a guard that
// cannot refuse is decoration, and one that refuses when the ports are free
// would be worse, because it would be turned off.
//
// Spawns the real script rather than importing it: the script calls
// process.exit, and the exit CODE is the whole contract with scripts/dev.js.

const net = require('net');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'preflight-ports.js');

// THE PORTS UNDER TEST ARE THE TEST'S OWN, NOT THE DEVELOPER'S (2026-09-29).
//
// These cases used to probe and hold the real 3000/5000, which made every one of
// them conditional on whether anybody had `npm run dev` up — and they skipped,
// loudly, when it was. The skip was the right call for a jest run. It was the
// WRONG call for `npm run mutate`, which breaks a guard on purpose and asks
// whether its test notices: a skipped test notices nothing, so the runner
// reported SURVIVED against a guard that is in fact perfectly well tested. That
// is a false red, and this file's own header says what happens to a guard that
// cries wolf — measured, the run said "1 of 84 NOT caught" three times in a row
// and was waved through as environmental each time. A red that is routinely
// explained away is indistinguishable from one that is real.
//
// preflight-ports.js reads AIRMS_WEB_PORT / AIRMS_API_PORT (it has to — that is
// how `npm run dev:alt` guards its own pair), so the test can simply name a pair
// nobody else is using. Nothing is skipped, nothing depends on ambient state,
// and the mutation is caught whether or not a dev server is running.
//
// High and arbitrary, and deliberately NOT 3100/5100 (`npm run dev:alt`) or 3210
// (`npm run verify:csp`) — the whole point is a pair this project never binds.
const WEB_PORT = 39417;
const API_PORT = 39418;

const run = (env = {}) => spawnSync(process.execPath, [SCRIPT], {
  encoding: 'utf8',
  env: { ...process.env, AIRMS_WEB_PORT: String(WEB_PORT), AIRMS_API_PORT: String(API_PORT), ...env },
});

// Bind ALL INTERFACES, because that is what `next dev` does — and binding the
// loopback address instead is why the first version of this test passed against
// a preflight that could not detect a running server at all.
//
// The original check tried to LISTEN on 127.0.0.1 and treated EADDRINUSE as
// "in use". Windows happily grants 127.0.0.1:3000 while another socket holds
// 0.0.0.0:3000, so the real case returned "free" — and this test agreed with it,
// because it held the identical address the check was probing. A fixture that
// mimics the wrong holder proves nothing.
const hold = (port) => new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(port, '0.0.0.0', () => resolve(srv));
});

// Is something ALREADY serving this port, independently of the test?
// There used to be an `inUse(port)` helper here, and its removal is the point of
// the change above rather than tidying.
//
// The two "describes the right failure" cases assert that one branch of the
// message appears and the OTHER does not, which is only a meaningful question
// when exactly one port is busy. A developer with `npm run dev` up has both, so
// both branches print correctly and the negative assertions fail against working
// code — and `inUse` existed to detect that and SKIP.
//
// Skipping was the right answer to the wrong question. The cases do not need to
// know whether the machine's ports are busy; they need a pair that is theirs,
// which AIRMS_WEB_PORT / AIRMS_API_PORT already allow. With the fixture owning
// its ports, "exactly one is held" is true by construction, nothing skips, and
// `npm run mutate` catches this guard whether or not a dev server is running —
// measured both ways.

describe('when the ports are free', () => {
  it('exits 0 and says nothing', () => {
    // Silence matters: a preflight that chatters on every start gets skipped,
    // and a skipped guard is worse than none.
    //
    // No longer conditional — the pair under test is this file's own, so "free"
    // is a fact about the fixture rather than a hope about the machine.
    const r = run();
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`.trim()).toBe('');
  });
});

describe('when a port is held', () => {
  let srv;
  afterEach(() => { if (srv) { srv.close(); srv = null; } });

  it('refuses, names the port, and explains the consequence', async () => {
    srv = await hold(WEB_PORT);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(String(WEB_PORT));
    // The REASON has to be in the message. "Port in use" alone gets solved by
    // starting on another port, which is the thing that causes the bug.
    expect(r.stderr).toMatch(/previous build/i);
  });

  // The `npm run e2e` sentence is gated on `onDefaults` in the script, and
  // correctly so: e2e and every browser probe hardcode 3000/5000, so on any
  // other pair the claim would be false. Asserting it on the custom pair above
  // was MY error, not the script's — it failed the moment the fixture stopped
  // using the real ports, which is the fixture doing its job.
  //
  // This is the one case that genuinely needs the default port, so it is the one
  // case that may skip. It is not what `npm run mutate` exercises: the mutation
  // flips `if (webBusy)` and is caught by the message-differentiation cases
  // below, which no longer depend on anything ambient.
  it('warns that e2e would pass against the stale server — defaults only', async () => {
    let real;
    try {
      real = await hold(3000);
    } catch {
      console.warn('[preflightPorts] :3000 is in use by something else; e2e-warning case not exercised');
      return;
    }
    try {
      const r = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/e2e/i);
      expect(r.stderr).toMatch(/previous build/i);
    } finally {
      real.close();
    }
  });

  it('refuses for the backend port too, and describes the BACKEND failure', async () => {
    // EXACTLY ONE port held, which is what makes the negative assertions below
    // mean anything — and now guaranteed by construction rather than checked and
    // skipped. A developer with `npm run dev` up holds both of THEIR ports and
    // neither of these.
    srv = await hold(API_PORT);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(String(API_PORT));
    expect(r.stderr).toMatch(/previous build/i);

    // THE BUG THIS PINS (found in real use, 2026-09-14). The message used to
    // tell the stale-frontend story unconditionally, so holding ONLY :5000
    // produced "would leave the OLD server on :3000 while `next dev` moved to
    // the next free port" — describing a frontend that was not running and a
    // port that was free.
    //
    // The two failures are genuinely different: `next dev` BUMPS to another
    // port, while the backend EXITS on EADDRINUSE (server.js), so the old
    // backend keeps answering and a new frontend reads through it. A
    // diagnostic that names the wrong one costs more time than none.
    expect(r.stderr).not.toMatch(/OLD frontend/i);
    expect(r.stderr).toMatch(/backend does not move|keeps answering/i);
  });

  it('describes the FRONTEND failure when only the web port is held', async () => {
    // The mirror of the case above — neither message may leak into the other.
    srv = await hold(WEB_PORT);
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/OLD frontend/i);
    expect(r.stderr).not.toMatch(/backend does not move/i);
  });
});
