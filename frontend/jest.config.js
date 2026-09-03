// Jest via next/jest — reuses the app's SWC pipeline so TS + path aliases
// resolve exactly as they do in `next build`.
//
// The default environment stays `node`: most suites here are pure logic (the
// locked composite-risk model, band vocabulary, period grains) or render through
// react-dom/server, and neither needs a DOM. Component tests opt IN per file
// with a `@jest-environment jsdom` docblock, which keeps the fast suites fast
// and means adding a DOM did not change how anything existing runs.
//
// moduleNameMapper is explicit rather than inherited. SWC rewrites `@/…` inside
// an `import`, so those resolved all along — but `jest.mock('@/lib/api')` is
// resolved by JEST, not the compiler, and failed with "Cannot find module".
// The two paths through the alias are not the same path.
const nextJest = require('next/jest');

const createJestConfig = nextJest({ dir: './' });

module.exports = createJestConfig({
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // setupFilesAfterEnv, not setupFiles: the jest-dom matchers register onto
  // `expect`, which only exists once the test framework is installed.
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
});
