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

const concurrentlyPkg = require.resolve('concurrently/package.json');
const concurrentlyBin = path.join(
  path.dirname(concurrentlyPkg),
  'dist/bin/concurrently.js'
);

const child = spawn(
  process.execPath,
  [concurrentlyBin, 'npm run dev:backend', 'npm run dev:frontend'],
  { stdio: 'inherit' }
);

child.on('exit', (code) => process.exit(code ?? 1));
