const path = require('path');
const { spawn, spawnSync } = require('child_process');

// ── Which pair of ports is this instance using? ──────────────────────────────
//
// Defaults are the documented 3000/5000 and nothing about `npm run dev` changes.
// `npm run dev:alt` sets these to 3100/5100 so a SECOND instance can run beside
// the first — two people, or a person and an agent, on one checkout.
//
// THREE values have to move together or the second instance is subtly broken
// rather than plainly broken:
//
//   PORT                 the backend listens here
//   FRONTEND_URL         the backend's CORS allow-list must name the web origin
//   NEXT_PUBLIC_API_URL  the browser must call the right backend
//
// Miss the second and every page renders its shell with empty panels — which
// looks exactly like the CSP failure mode CLAUDE.md warns about, and is not it.
// Miss the third and the alternate frontend quietly drives the PRIMARY backend,
// so two instances share one database session and neither person can trust what
// they are inspecting.
//
// This is NOT the CORS workaround gotcha 1 forbids. That rule is about widening
// CORS to paper over a stale server still holding :3000. Here the second origin
// is real, deliberate and running right now.
const WEB_PORT = Number(process.env.AIRMS_WEB_PORT) || 3000;
const API_PORT = Number(process.env.AIRMS_API_PORT) || 5000;

const env = {
  ...process.env,
  AIRMS_WEB_PORT: String(WEB_PORT),
  AIRMS_API_PORT: String(API_PORT),
  // Backend. dotenv does NOT override an already-set variable, so these beat
  // backend/.env — verified rather than assumed.
  PORT: String(API_PORT),
  FRONTEND_URL: `http://localhost:${WEB_PORT}`,
  // Frontend. Next's loadEnvConfig likewise lets a real environment variable
  // win over .env.local — also verified. `next dev` would otherwise read
  // .env.local and point this instance at the OTHER backend.
  NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}/api`,
};

// Stop before starting anything if either port is already held. `next dev`
// would otherwise bump to the next free port and leave the STALE server
// answering — which is where `npm run e2e` and every browser probe point, so
// the suite would silently test the previous build. See preflight-ports.js.
const preflight = spawnSync(
  process.execPath,
  [path.join(__dirname, 'preflight-ports.js')],
  { stdio: 'inherit', env },
);
if (preflight.status !== 0) process.exit(preflight.status ?? 1);

// Ask the package where its executable is, rather than hardcoding the path.
//
// This used to point straight at `dist/bin/concurrently.js`, and concurrently 10
// renamed it to `dist/bin/index.js` — so `npm run dev` died with a bare
// MODULE_NOT_FOUND naming a file inside an installed package, which reads like a
// broken install rather than a renamed entry point. The `bin` field is the
// package's own declaration and survives that kind of move.
const concurrentlyPkg = require.resolve('concurrently/package.json');
const pkg = require(concurrentlyPkg);
const declaredBin = typeof pkg.bin === 'string' ? pkg.bin : (pkg.bin && pkg.bin.concurrently);
if (!declaredBin) {
  console.error('concurrently does not declare a `bin` — cannot start the dev servers.');
  process.exit(1);
}
const concurrentlyBin = path.join(path.dirname(concurrentlyPkg), declaredBin);

// ONE shared environment serves both children, which only works because the two
// packages ignore each other's variables — the backend reads PORT, and the
// frontend is given `-p` explicitly, and an explicit `-p` beats the PORT
// variable in `next dev`. Without that flag both would try to listen on
// API_PORT. (concurrently passes its own env to both commands, so per-child
// environments are not available here.)
//
// It calls the frontend package DIRECTLY rather than via the root
// `dev:frontend` script, and that is not tidiness. `dev:frontend` is itself
// `npm --prefix frontend run dev`, so going through it puts TWO npm layers
// between here and `next`, and a single `--` only survives one: npm ate
// `--port` as its own config ("Unknown cli config --port") and handed next a
// bare `3100`, which `next dev` read as a DIRECTORY. The result was a frontend
// that started, logged no error, and listened on 3000 — the port this whole
// command exists to avoid. Same family as CLAUDE.md's note that
// `npm exec --prefix` does not change the working directory.
const frontendCmd = `npm --prefix frontend run dev -- --port ${WEB_PORT}`;

if (WEB_PORT !== 3000 || API_PORT !== 5000) {
  console.log(`\nAIRMS dev on an alternate pair — frontend :${WEB_PORT}, backend :${API_PORT}`);
  console.log(`  browser        http://localhost:${WEB_PORT}`);
  console.log(`  API            http://localhost:${API_PORT}/api`);
  // Said out loud because it is the trap: every verification command in this
  // repo targets the DEFAULT pair unless told otherwise.
  console.log('\n  npm run e2e / audit:access / verify:claims still target :3000 and :5000.');
  console.log(`  For this instance:  E2E_WEB=http://localhost:${WEB_PORT} E2E_API=http://localhost:${API_PORT}/api npm run e2e\n`);
}

const child = spawn(
  process.execPath,
  [concurrentlyBin, 'npm run dev:backend', frontendCmd],
  { stdio: 'inherit', env },
);

child.on('exit', (code) => process.exit(code ?? 1));
