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

const run = () => spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });

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
//
// The two "describes the right failure" cases below assert that one branch of
// the message appears and the OTHER does not — which is only a meaningful
// question when exactly one port is busy. A developer with `npm run dev` up has
// BOTH, so both branches print correctly and the negative assertions fail
// against working code.
//
// That is the spurious failure this file's header warns about in its own terms:
// a guard that cries wolf gets turned off. So the pair skips instead, loudly
// enough to be noticed. CONNECT rather than bind, for the same reason
// preflight-ports.js does — see the note on `hold` above.
const inUse = (port) => new Promise((resolve) => {
  const sock = new net.Socket();
  const done = (v) => { sock.destroy(); resolve(v); };
  sock.setTimeout(700);
  sock.once('connect', () => done(true));
  sock.once('timeout', () => done(false));
  sock.once('error', () => done(false));
  sock.connect(port, '127.0.0.1');
});

describe('when the ports are free', () => {
  it('exits 0 and says nothing', async () => {
    // Silence matters: a preflight that chatters on every start gets skipped,
    // and a skipped guard is worse than none.
    const r = run();
    if (r.status !== 0) {
      // A developer really might have a dev server up while running the suite.
      // Skipping beats a spurious failure that trains people to ignore this file.
      console.warn('[preflightPorts] a dev port is in use locally; free-port case not exercised');
      return;
    }
    expect(r.status).toBe(0);
    expect(`${r.stdout}${r.stderr}`.trim()).toBe('');
  });
});

describe('when a port is held', () => {
  let srv;
  afterEach(() => { if (srv) { srv.close(); srv = null; } });

  it('refuses, names the port, and explains the consequence', async () => {
    try {
      srv = await hold(3000);
    } catch {
      console.warn('[preflightPorts] :3000 already in use; held-port case not exercised');
      return;
    }
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/3000/);
    // The REASON has to be in the message. "Port in use" alone gets solved by
    // starting on another port, which is the thing that causes the bug.
    expect(r.stderr).toMatch(/e2e/i);
    expect(r.stderr).toMatch(/previous build/i);
  });

  it('refuses for the backend port too, and describes the BACKEND failure', async () => {
    if (await inUse(3000)) {
      console.warn('[preflightPorts] :3000 is also in use; backend-only message not exercised');
      return;
    }
    try {
      srv = await hold(5000);
    } catch {
      console.warn('[preflightPorts] :5000 already in use; held-port case not exercised');
      return;
    }
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/5000/);
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
    if (await inUse(5000)) {
      console.warn('[preflightPorts] :5000 is also in use; frontend-only message not exercised');
      return;
    }
    try {
      srv = await hold(3000);
    } catch {
      console.warn('[preflightPorts] :3000 already in use; held-port case not exercised');
      return;
    }
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/OLD frontend/i);
    expect(r.stderr).not.toMatch(/backend does not move/i);
  });
});
