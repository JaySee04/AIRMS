// Facts that exist in BOTH packages, and the check that finds the next one.
//
// ── what changed, and what this file is now for ─────────────────────────────
//
// The nine facts this file used to COMPARE are now GENERATED into both packages
// from shared/facts.js, so they agree by construction and the comparisons that
// stood here would be asserting that a file equals itself. `sharedFacts.test.js`
// covers that half: the generated copies match the source, and each other.
//
// What survives is the half that was always the valuable one. Every individual
// pin in this project was written AFTER a drift was found — `BAND_LABEL` with
// no green key and two call sites saying "Safe" (§33), `INVITABLE_ROLES`
// accepting four roles while the form offered two (§42), `SMALL_COHORT` written
// out three times, one under a comment claiming it was read from elsewhere
// (§49). The recurring problem was never a missing assertion. It was that
// nobody noticed a new shared fact had appeared.
//
// So this file enumerates the shared names automatically and demands an answer
// for each: generated from the single source, pinned in a named test, or
// explained as a collision. A constant added to both packages tomorrow fails
// this suite until somebody decides which.
//
// Adding a name to ALREADY_PINNED or NOT_A_SHARED_FACT is meant to be an
// argument, not a shrug — each entry says where it is covered or why it is not
// the same fact.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const BE = path.join(ROOT, 'backend', 'src');
const FE = path.join(ROOT, 'frontend', 'src');

function walk(dir, exts, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x)) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

const beSrc = walk(BE, ['.js']).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
const feSrc = walk(FE, ['.ts', '.tsx']).map((p) => fs.readFileSync(p, 'utf8')).join('\n');

/** SCREAMING_CASE constants declared at the top level of a file. */
const declared = (src, prefix) => new Set(
  [...src.matchAll(new RegExp(`^${prefix}const ([A-Z][A-Z0-9_]{2,})\\b`, 'gm'))].map((m) => m[1]),
);

const beNames = declared(beSrc, '(?:module\\.exports\\s*=\\s*)?');
const feNames = declared(feSrc, 'export ');

/**
 * Read one array/object literal out of a source file, as text.
 *
 * Bracket-counted rather than regex-matched. The first version required a
 * newline before the closing bracket, which silently mismatched every
 * single-line literal — `const GENDERS = ['Male', 'Female'];` yielded a
 * fragment that then failed to parse. A reader that quietly returns the wrong
 * span is the same defect this file exists to catch.
 */
function literalOf(file, name) {
  const src = fs.readFileSync(file, 'utf8');
  const decl = src.search(new RegExp(`(^|\\n)\\s*(export )?const ${name}\\b`));
  if (decl === -1) return null;
  const eq = src.indexOf('=', decl);
  if (eq === -1) return null;
  let i = eq + 1;
  while (i < src.length && /\s/.test(src[i])) i += 1;
  const open = src[i];
  const close = open === '[' ? ']' : (open === '{' ? '}' : null);
  if (!close) return null;
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === open) depth += 1;
    else if (src[j] === close) {
      depth -= 1;
      if (depth === 0) return src.slice(i, j + 1);
    }
  }
  return null;
}

/** Evaluate a literal safely enough for test data we wrote ourselves. */
function valueOf(file, name) {
  const text = literalOf(file, name);
  if (text === null) return null;
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${text});`)();
}

// ── facts that come from the single source ──────────────────────────────────
//
// These are generated into both packages from shared/facts.js. There is nothing
// to compare — sharedFacts.test.js proves the generated copies match the source
// and each other. What IS worth asserting is that nobody has quietly written a
// second copy back into a hand-edited file, which is how every one of these got
// duplicated the first time.
const GENERATED = Object.keys(require('../src/shared/facts'));

// The generated files themselves, which necessarily contain the literals.
const GENERATED_FILES = [
  path.join(BE, 'shared', 'facts.js'),
  path.join(FE, 'lib', 'shared', 'facts.ts'),
];

// Names that agree across the boundary but are pinned somewhere else, with the
// file that does it. Listed so the completeness check below stays honest.
const ALREADY_PINNED = {
  REPORT_RISKS: 'backend/tests/riskIndicators.test.js',
};

// Names that merely COLLIDE — same identifier, different meaning. Each needs a
// reason, because "not the same fact" is exactly what somebody would claim to
// avoid writing a pin.
const NOT_A_SHARED_FACT = {
  BAND_LABEL: 'Two different vocabularies under one name. The generated BAND_LABEL '
    + 'is the green/amber/red clinical wording; lib/screeningAlerts.ts exports its '
    + 'own BAND_LABEL for the ok/watch/high RISK-STRIP bands, which is a different '
    + 'axis entirely. The shared one is covered by sharedFacts.test.js and the '
    + 'strip one by the threshold tests. Renaming either is a bigger edit than it '
    + 'looks — both are read across many components.',
};

describe('facts generated from the single source', () => {
  // A file that DERIVES from the shared source is fine and there are real
  // examples: CohortFilters prepends its filter-only "All ages" entry to
  // AGE_GROUPS, and screeningAlerts exports an unrelated BAND_LABEL for the
  // ok/watch/high strip bands. What must not exist is a file that re-types one
  // of these values having never heard of the shared source — which is how all
  // four of the historical duplications were born, and how ScreeningHistory
  // came to name the bands 'Green' / 'Amber' / 'Red' in its own private map.
  //
  // So the rule is: declare one of these names only in a file that imports from
  // shared/facts. Mutation-checked — re-adding `const BANDS = [...]` to
  // overallIndicator.js, or the old literal to ScreeningHistory.tsx, fails this.
  const readsShared = (src) => /['"](\.\.\/)*(@\/lib\/)?shared\/facts['"]|shared\/facts['"]/.test(src);

  it.each(GENERATED)('%s is not re-typed in a file that ignores the shared source', (name) => {
    const offenders = [];
    for (const file of [...walk(BE, ['.js']), ...walk(FE, ['.ts', '.tsx'])]) {
      if (GENERATED_FILES.includes(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (readsShared(src)) continue;
      // A declaration that ASSIGNS a literal, rather than one that imports or
      // destructures. `const { BANDS } = require(...)` must not trip.
      const re = new RegExp(`(^|\\n)\\s*(export )?const ${name}(\\s*:[^=]+)?\\s*=\\s*(?!require\\b)[\\[{'"\\d]`);
      if (re.test(src)) offenders.push(path.relative(ROOT, file));
    }
    // If this fails: delete the literal and import the name from
    // src/shared/facts.js (backend) or @/lib/shared/facts (frontend). If the
    // value genuinely needs to differ locally, give it a different NAME — a
    // second meaning under a shared name is the drift, not the duplication.
    expect({ [name]: offenders }).toEqual({ [name]: [] });
  });

  it('really is generated into both packages', () => {
    for (const f of GENERATED_FILES) {
      expect(fs.existsSync(f)).toBe(true);
      expect(fs.readFileSync(f, 'utf8')).toContain('GENERATED');
    }
    expect(GENERATED.length).toBeGreaterThanOrEqual(10);
  });
});

describe('the list of shared facts is complete', () => {
  // The check that makes this file worth having. Everything above is an
  // assertion somebody remembered to write; this one notices when a NEW fact
  // starts living in both packages and nobody wrote anything.
  it('every name declared in both packages is pinned or explained', () => {
    const shared = [...beNames].filter((n) => feNames.has(n)).sort();
    const covered = new Set([
      ...GENERATED,
      ...Object.keys(ALREADY_PINNED),
      ...Object.keys(NOT_A_SHARED_FACT),
    ]);
    const unaccounted = shared.filter((n) => !covered.has(n));
    // If this fails, there are three honest answers and no fourth:
    //   1. it is a shared FACT — move it into shared/facts.js and
    //      `npm run sync:shared`, which is now the default answer;
    //   2. it is already pinned — add it to ALREADY_PINNED naming that test;
    //   3. it is a name COLLISION — add it to NOT_A_SHARED_FACT with the
    //      reason the two are different things.
    expect(unaccounted).toEqual([]);
  });

  it('finds a real corpus — the walker is not silently matching nothing', () => {
    // Without this, a broken walk() would make the check above pass vacuously,
    // which is the failure mode this whole file exists to prevent.
    expect(beNames.size).toBeGreaterThan(20);
    expect(feNames.size).toBeGreaterThan(20);
    // The generated facts are exported from both packages, so they are the
    // floor: seeing fewer than that means the walk is broken, not that the
    // codebase got tidier.
    expect([...beNames].filter((n) => feNames.has(n)).length)
      .toBeGreaterThanOrEqual(GENERATED.length - Object.keys(NOT_A_SHARED_FACT).length);
  });

  it('does not claim a pin that no longer exists', () => {
    for (const [name, file] of Object.entries(ALREADY_PINNED)) {
      const p = path.join(ROOT, file);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p, 'utf8')).toContain(name);
    }
  });
});
