// Registers the @testing-library/jest-dom matcher TYPES with TypeScript.
//
// jest.setup.js makes the matchers exist at RUNTIME; this makes tsc believe in
// them. Both are needed and they fail differently: without the setup file the
// tests error with "toBeInTheDocument is not a function", and without this
// declaration they pass while `npx tsc --noEmit` reports
// "Property 'toBeInTheDocument' does not exist".
//
// A .d.ts rather than a `types` entry in tsconfig.json, because adding that key
// switches @types resolution from "everything installed" to "only what is
// listed", which would quietly drop node and react typings.
import '@testing-library/jest-dom';
