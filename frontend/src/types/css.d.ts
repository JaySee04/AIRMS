// Side-effect stylesheet imports (`import '@/styles/globals.css'`).
//
// TypeScript 6 checks side-effect imports for a declaration and errors with
// TS2882 when there is none; 5.9 did not look. Next's own `next-env.d.ts`
// declares CSS *modules* (`*.module.css`) through `next/types/global`, but not
// a bare stylesheet, and that file carries "should not be edited" — so the
// declaration goes here instead of being patched into a generated file that
// `next dev` rewrites.
//
// Declared as `{}` rather than `any`: the import contributes no value, and
// giving it one would let `import styles from '@/styles/globals.css'` type-check
// against a bundler setup that returns nothing for a plain stylesheet.
declare module '*.css';
