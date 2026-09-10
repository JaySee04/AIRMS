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

const PORTS = [
  { port: 3000, what: 'frontend (next dev)' },
  { port: 5000, what: 'backend (express)' },
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
  console.error('\nStarting anyway would leave the OLD server on :3000 while `next dev`');
  console.error('moved to :3001 — and `npm run e2e` targets :3000, so the suite would');
  console.error('test the previous build and pass. That is why this stops here.\n');
  console.error('Free them, then start again:\n');
  if (process.platform === 'win32') {
    const pids = busy.map((b) => b.pid).filter(Boolean).join(',');
    console.error(pids
      ? `  Stop-Process -Id ${pids} -Force`
      : '  Get-NetTCPConnection -LocalPort 3000,5000 -State Listen | Stop-Process -Id { $_.OwningProcess } -Force');
  } else {
    console.error(`  kill -9 ${busy.map((b) => b.pid).filter(Boolean).join(' ') || '$(lsof -ti tcp:3000,tcp:5000)'}`);
  }
  console.error('');
  process.exit(1);
}

main();
