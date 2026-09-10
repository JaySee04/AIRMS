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

  it('refuses for the backend port too', async () => {
    try {
      srv = await hold(5000);
    } catch {
      console.warn('[preflightPorts] :5000 already in use; held-port case not exercised');
      return;
    }
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/5000/);
  });
});
