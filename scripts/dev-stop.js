// `npm run dev:stop` — stop every AIRMS dev server, including the alternate pair.
//
// WHY THIS EXISTS (2026-09-14), and the mechanism was REPRODUCED rather than
// guessed at — the first explanation written here was wrong.
//
// Killing the process that HOLDS the port does not stop the dev server. It
// stops the server; nodemon, its PARENT, survives and prints
//
//     [nodemon] app crashed - waiting for file changes before starting...
//
// The port really is free at that moment, which is what makes this confusing.
// Nodemon then restarts the server the instant ANY watched file changes — and
// `backend/src/**` is what it watches.
//
// So the resurrection trigger is not the kill, it is the next edit under
// backend/src. `npm run mutate` is exactly that: it breaks a guard file, runs
// jest, restores it, 52 times. Running the mutation suite therefore brings back
// every orphaned dev server on the machine AT ONCE — which is why two orphans
// were found carrying identical creation timestamps, and why a port reported
// free five minutes earlier was occupied again with nobody having started
// anything.
//
// Measured: kill the listener -> :5000 free, nodemon idle. Rewrite
// backend/src/utils/num.js byte-identically -> :5000 back within seconds.
//
// `taskkill /T` does not help either: /T kills a process's CHILDREN, and
// nodemon is the parent.
//
// So: find the tree ROOTS (`scripts/dev.js`, `scripts/dev-alt.js`, and any bare
// `nodemon src/server.js`) and kill those with their subtrees. Nothing is left
// to respawn anything.
//
// SCOPE, deliberately narrow. It matches only command lines that name THIS
// project's dev entry points — not every node process, not every `next dev` on
// the machine. A stop command that is too eager takes down an unrelated editor
// server, and then nobody runs it.

const { execSync } = require('child_process');

const PORTS = [3000, 3100, 5000, 5100];

/** Command lines that identify a dev tree root owned by this project. */
const ROOT_PATTERNS = [
  /scripts[\\/]dev\.js/,
  /scripts[\\/]dev-alt\.js/,
  /nodemon\s+src[\\/]server\.js/,
];

// A SHELL is never a dev-tree root here — the roots are node.exe and the cmd.exe
// wrappers npm creates. This exclusion is not theoretical: while testing this
// script, `Get-CimInstance ... -match 'nodemon src/server'` matched the very
// PowerShell process running the query, because the pattern appeared in its own
// command line. Searching command lines for a string finds every process that
// merely MENTIONS it, including the terminal somebody is typing in and the
// editor task that spawned it. Killing one of those is a far worse outcome than
// leaving a dev server up.
const SHELL_NAMES = /^(bash|sh|zsh|powershell|pwsh|wsl|conhost|WindowsTerminal)(\.exe)?$/i;
const isShell = (p) => SHELL_NAMES.test(String(p.name || ''))
  // Belt and braces for platforms where the name is not available: a `-c` /
  // `-Command` payload means the pattern is an ARGUMENT being passed along,
  // not the command this process is running.
  || /\s-(c|Command)\s/i.test(p.cmd);

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

/** Every running process as { pid, name, cmd }. */
function processes() {
  if (process.platform !== 'win32') {
    return sh('ps -eo pid=,comm=,args=').split('\n').map((l) => {
      const m = l.trim().match(/^(\d+)\s+(\S+)\s+(.*)$/);
      return m ? { pid: m[1], name: m[2].split('/').pop(), cmd: m[3] } : null;
    }).filter(Boolean);
  }
  // CIM rather than `wmic`: wmic is removed on current Windows 11 builds and
  // fails with "not recognized", which reads as a broken script.
  const out = sh(
    'powershell -NoProfile -Command "Get-CimInstance Win32_Process '
    + '| Where-Object { $_.CommandLine } '
    + '| ForEach-Object { \\"$($_.ProcessId)`t$($_.Name)`t$($_.CommandLine)\\" }"',
  );
  return out.split(/\r?\n/).map((l) => {
    const parts = l.split('\t');
    return parts.length >= 3
      ? { pid: parts[0].trim(), name: parts[1].trim(), cmd: parts.slice(2).join('\t') }
      : null;
  }).filter(Boolean);
}

function listening() {
  const held = new Map();
  const out = sh(process.platform === 'win32' ? 'netstat -ano -p tcp' : 'lsof -nP -iTCP -sTCP:LISTEN');
  for (const line of out.split(/\r?\n/)) {
    for (const port of PORTS) {
      const re = process.platform === 'win32'
        ? new RegExp(`TCP\\s+\\S+:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)
        : new RegExp(`:${port}\\s+\\(LISTEN\\)`);
      const m = line.match(re);
      if (m) held.set(port, process.platform === 'win32' ? m[1] : line.trim().split(/\s+/)[1]);
    }
  }
  return held;
}

const before = listening();
const roots = processes().filter(
  (p) => ROOT_PATTERNS.some((re) => re.test(p.cmd))
    && !isShell(p)
    && String(p.pid) !== String(process.pid),
);

if (!roots.length && !before.size) {
  console.log('No AIRMS dev server is running.');
  process.exit(0);
}

for (const r of roots) {
  const short = r.cmd.length > 64 ? `${r.cmd.slice(0, 64)}…` : r.cmd;
  console.log(`  stopping tree at pid ${r.pid}  ${short}`);
  sh(process.platform === 'win32'
    ? `taskkill /PID ${r.pid} /T /F`
    : `kill -9 -${r.pid} 2>/dev/null || kill -9 ${r.pid}`);
}

// Re-check rather than trust the kill. A port still held after this means
// something OUTSIDE the patterns above owns it — which is worth saying plainly,
// because the alternative is a "stopped" message and a port that is still busy.
const after = listening();
if (after.size) {
  console.error('\nStill listening after stopping every known dev tree:\n');
  for (const [port, pid] of after) console.error(`  :${port}  pid ${pid}`);
  console.error('\nThat is not a process this script started. Inspect it before killing it:\n');
  console.error(process.platform === 'win32'
    ? `  Get-CimInstance Win32_Process -Filter "ProcessId=${[...after.values()][0]}" | Select-Object CommandLine`
    : `  ps -o args= -p ${[...after.values()][0]}`);
  console.error('');
  process.exit(1);
}

console.log(`\nAll AIRMS dev servers stopped — ${PORTS.join(', ')} are free.`);
