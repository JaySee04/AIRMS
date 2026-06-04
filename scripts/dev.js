// VS Code's integrated terminal can leak ELECTRON_RUN_AS_NODE=1 into child
// processes. When Node inherits it on Windows, the OpenSSL initialisation
// path changes and TLS to MongoDB Atlas fails with alert 80 at handshake.
// Strip the var here before launching the dev servers.
delete process.env.ELECTRON_RUN_AS_NODE;

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
