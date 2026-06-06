const path = require('path');
const { spawn } = require('child_process');

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
