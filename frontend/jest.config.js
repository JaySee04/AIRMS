// Jest via next/jest — reuses the app's SWC pipeline so TS + path aliases
// resolve exactly as they do in `next build`. The current suite covers pure
// logic (lib/risk.ts, the locked composite-risk model), so the node
// environment is enough; switch to 'jsdom' if component tests are added.
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
});
