// Refuse to start a second dev server on top of a running one.
//
// WHY THIS EXISTS, and it is a testing-integrity problem rather than a comfort one.
//
// `next dev` BUMPS to the next free port when 3000 is taken, and says so in one
// line among its startup banner. The backend already refuses (server.js prints
// "Port 5000 is already in use" and exits), so the usual result of starting a
// second `npm run dev` is: backend dead, frontend on 3001, and **the stale
// frontend still serving :3000**.
//
// Everything that verifies this project then points at the stale one:
// `npm run e2e` hardcodes localhost:3000, and so does any browser probe. On
// 2026-09-09 exactly this happened — a probe reported nine failures for a panel
// that was working, because it was reading a frontend built before the change.
// A test suite that silently validates OLD code is the worst version of this
// project's own defect class: it does not fail, it passes for the wrong reason.
//
// CLAUDE.md gotcha 1 has described the symptom for months. This makes it
// impossible to reach: if a port is occupied, `npm run dev` stops and says what
// to kill, rather than starting something that looks fine and tests nothing.
const net = require('net');
const { execSync } = require('child_process');

// The ports to guard come from the environment so this checks the pair that is
// ACTUALLY about to start. Hardcoding 3000/5000 here would have made
// `npm run dev:alt` preflight the wrong pair entirely: it would refuse to start
// on 3100 because 3000 was busy, and then not notice that 3100 already was.
// Defaults keep `npm run dev` behaving exactly as before.
const PORTS = [
  { port: Number(process.env.AIRMS_WEB_PORT) || 3000, what: 'frontend (next dev)' },
  { port: Number(process.env.AIRMS_API_PORT) || 5000, what: 'backend (express)' },
];

// CONNECT, do not try to bind.
//
// The first version of this bound 127.0.0.1 and treated EADDRINUSE as the
// signal. It reported both ports FREE while both dev servers were running,
// because `next dev` binds 0.0.0.0 and Windows lets a second socket take
// 127.0.0.1:3000 alongside it. The synthetic test passed only because the test
// held the identical address — a check that could not detect the one situation
// it exists for, which is the failure this whole file is about.
//
// Connecting asks the question that actually matters: is something already
// answering on this port? That is true regardless of which interface the holder
// bound, on every platform.
function inUse(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const done = (result) => { sock.destroy(); resolve(result); };
    sock.setTimeout(700);
    sock.once('connect', () => done(true));
    // Refused, unreachable or slow to answer: nothing is serving here.
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
    sock.connect(port, '127.0.0.1');
  });
}

// Best effort, and clearly labelled as such — the message is still useful
// without it, so a platform where this fails must not fail the check.
function holderPid(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`, {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
      });
      const pids = [...new Set(out.trim().split('\n').map((l) => l.trim().split(/\s+/).pop()))];
      return pids.filter(Boolean).join(', ');
    }
    return execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim().split('\n').join(', ');
  } catch {
    return null;
  }
}

async function main() {
  const busy = [];
  for (const p of PORTS) {
    // eslint-disable-next-line no-await-in-loop
    if (await inUse(p.port)) busy.push({ ...p, pid: holderPid(p.port) });
  }
  if (!busy.length) return;

  console.error('\nAIRMS dev server not started — a port is already in use.\n');
  for (const b of busy) {
    console.error(`  :${b.port}  ${b.what}${b.pid ? `   held by PID ${b.pid}` : ''}`);
  }
  const web = PORTS[0].port;
  const onDefaults = web === 3000 && PORTS[1].port === 5000;

  // WHICH port is held changes what goes wrong, and the message has to say the
  // right one. The first version described the stale-frontend story
  // unconditionally — so a run where only :5000 was taken was told that "the
  // OLD server on :3000" would be left behind while `next dev` moved on, which
  // was not true of anything on screen. A diagnostic that misdescribes the
  // situation costs more time than no diagnostic.
  //
  // Keep "previous build" on ONE line in every branch: the lines are wrapped by
  // hand and tests/preflightPorts.test.js matches that phrase, so a wrap
  // between the two words breaks the assertion while still reading correctly.
  const webBusy = busy.some((b) => b.port === PORTS[0].port);
  const apiBusy = busy.some((b) => b.port === PORTS[1].port);
  const api = PORTS[1].port;

  console.error('');
  if (webBusy) {
    console.error(`Starting anyway would leave the OLD frontend on :${web} while \`next dev\``);
    console.error('moved to the next free port, so you would be looking at');
    console.error('the previous build.');
  }
  if (apiBusy) {
    // The backend does NOT bump — server.js exits on EADDRINUSE. So the failure
    // is the other way round: the old backend keeps answering, and a new
    // frontend talks to it.
    console.error(`The backend does not move: it exits when :${api} is taken, so the OLD`);
    console.error('one keeps answering and anything you start would be reading');
    console.error('the previous build through it.');
  }
  if (onDefaults) {
    // Only true of the default pair — e2e and every other probe hardcode these.
    console.error(`\n\`npm run e2e\` targets :${web} and :${api}, so the suite would pass`);
    console.error('against whatever is already there. That is why this stops here.');
  }
  console.error('');

  // The second instance is the reason this is not simply "kill it". Two people
  // — or a person and an agent — working one checkout each need a pair of
  // ports, and the wrong lesson to take from a busy port is to free one that
  // somebody else is deliberately using. Offered ONLY when the default pair is
  // what is blocked; suggesting it while :3100 is the thing already in use
  // would be advice to run into the same wall.
  if (onDefaults) {
    console.error('If the holder is someone else\'s instance, run yours on its own pair:\n');
    console.error('  npm run dev:alt            (frontend :3100, backend :5100)\n');
    console.error('Otherwise free these and start again:\n');
  } else {
    console.error('Free them, or pick another pair:\n');
    console.error('  $env:AIRMS_WEB_PORT=3300; $env:AIRMS_API_PORT=5300; npm run dev\n');
  }
  const portList = PORTS.map((p) => p.port).join(',');
  if (process.platform === 'win32') {
    const pids = busy.map((b) => b.pid).filter(Boolean).join(',');
    console.error(pids
      ? `  Stop-Process -Id ${pids} -Force`
      : `  Get-NetTCPConnection -LocalPort ${portList} -State Listen | Stop-Process -Id { $_.OwningProcess } -Force`);
  } else {
    const pids = busy.map((b) => b.pid).filter(Boolean).join(' ');
    console.error(`  kill -9 ${pids || `$(lsof -ti ${PORTS.map((p) => `tcp:${p.port}`).join(',')})`}`);
  }
  console.error('');
  process.exit(1);
}

main();
