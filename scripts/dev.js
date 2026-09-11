const path = require('path');
const { spawn, spawnSync } = require('child_process');

// Stop before starting anything if :3000 or :5000 is already held. `next dev`
// would otherwise bump to :3001 and leave the STALE server answering :3000 —
// which is where `npm run e2e` and every browser probe point, so the suite would
// silently test the previous build. See scripts/preflight-ports.js.
const preflight = spawnSync(
  process.execPath,
  [path.join(__dirname, 'preflight-ports.js')],
  { stdio: 'inherit' },
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

const child = spawn(
  process.execPath,
  [concurrentlyBin, 'npm run dev:backend', 'npm run dev:frontend'],
  { stdio: 'inherit' }
);

child.on('exit', (code) => process.exit(code ?? 1));
