// Facts that exist in BOTH packages, and the check that finds the next one.
//
// There is no shared types package — frontend and backend each keep their own
// definitions — so every fact that has to agree across the boundary agrees by
// discipline rather than by construction. That has failed repeatedly and
// identically: `BAND_LABEL` had no green key and two call sites grew private
// copies saying "Safe" (§33); `INVITABLE_ROLES` accepted four roles while the
// form offered two (§42); `SMALL_COHORT` was written out three times, one of
// them under a comment claiming it was read from elsewhere (§49).
//
// Individual pins were added each time, in whichever file the fault appeared.
// This one is different in the part that matters: **it enumerates the shared
// names automatically**, so a constant added to both packages tomorrow either
// gets pinned here or fails this suite. The recurring problem was never a
// missing assertion, it was nobody noticing a new shared fact had appeared.
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

// ── the shared facts, and what "agreeing" means for each ────────────────────
const SHARED = [
  {
    name: 'BANDS',
    be: path.join(BE, 'utils', 'overallIndicator.js'),
    fe: path.join(FE, 'lib', 'bands.ts'),
    why: 'The band vocabulary and its ORDER. Order matters: BAND_RANK indexes it, '
       + 'so a reordering would silently invert "worse than".',
    compare: (a, b) => expect(b).toEqual(a),
  },
  {
    name: 'GENDERS',
    be: path.join(BE, 'utils', 'seeder.js'),
    fe: path.join(FE, 'components', 'admin', 'CohortFilters.tsx'),
    why: 'Also the Athlete.gender enum. A filter offering a value the column '
       + 'rejects returns nothing and looks like an empty cohort.',
    compare: (a, b) => expect(b).toEqual(a),
  },
  {
    name: 'RISK_AXIS_MAX',
    be: path.join(BE, 'utils', 'pdfDraw.js'),
    fe: path.join(FE, 'lib', 'screeningAlerts.ts'),
    why: 'The display axis for every risk strip. If the printed report and the '
       + 'screen scale differently, the same score draws at two lengths.',
    read: (file, name) => {
      const m = fs.readFileSync(file, 'utf8').match(new RegExp(`const ${name}\\s*=\\s*(\\d+)`));
      return m ? Number(m[1]) : null;
    },
    compare: (a, b) => expect(b).toBe(a),
  },
  {
    name: 'AGE_GROUPS',
    be: path.join(BE, 'utils', 'cohortFocus.js'),
    fe: path.join(FE, 'components', 'admin', 'CohortFilters.tsx'),
    why: 'The age bands the focus breakdown and the PDF report bucket by. The '
       + 'frontend carries one EXTRA leading entry — "All ages", a filter option '
       + 'rather than a band — so the shared tail is what must agree.',
    compare: (a, b) => {
      const feBands = b.filter((g) => g.min !== undefined || g.max !== undefined);
      expect(feBands).toEqual(a);
    },
  },
];

// Names that agree across the boundary but are pinned somewhere else, with the
// file that does it. Listed so the completeness check below stays honest.
const ALREADY_PINNED = {
  BAND_LABEL: 'frontend/src/lib/bands.test.ts',
  BAND_RANK: 'frontend/src/lib/bands.test.ts',
  GRAINS: 'frontend/src/lib/periods.test.ts',
  INSTITUTION_TZ: 'frontend/src/lib/periods.test.ts',
  REPORT_RISKS: 'backend/tests/riskIndicators.test.js',
};

// Names that merely COLLIDE — same identifier, different meaning. Each needs a
// reason, because "not the same fact" is exactly what somebody would claim to
// avoid writing a pin.
const NOT_A_SHARED_FACT = {};

describe.each(SHARED)('$name agrees across the packages', (fact) => {
  const read = fact.read || valueOf;

  it('is declared in both packages', () => {
    expect(read(fact.be, fact.name)).not.toBeNull();
    expect(read(fact.fe, fact.name)).not.toBeNull();
  });

  it(`agrees — ${''}`, () => {
    const a = read(fact.be, fact.name);
    const b = read(fact.fe, fact.name);
    fact.compare(a, b);
  });
});

describe('the list of shared facts is complete', () => {
  // The check that makes this file worth having. Everything above is an
  // assertion somebody remembered to write; this one notices when a NEW fact
  // starts living in both packages and nobody wrote anything.
  it('every name declared in both packages is pinned or explained', () => {
    const shared = [...beNames].filter((n) => feNames.has(n)).sort();
    const covered = new Set([
      ...SHARED.map((f) => f.name),
      ...Object.keys(ALREADY_PINNED),
      ...Object.keys(NOT_A_SHARED_FACT),
    ]);
    const unaccounted = shared.filter((n) => !covered.has(n));
    // If this fails: add the name to SHARED with a comparison, or to
    // ALREADY_PINNED naming the test that covers it, or to NOT_A_SHARED_FACT
    // with the reason the two are different things.
    expect(unaccounted).toEqual([]);
  });

  it('finds a real corpus — the walker is not silently matching nothing', () => {
    // Without this, a broken walk() would make the check above pass vacuously,
    // which is the failure mode this whole file exists to prevent.
    expect(beNames.size).toBeGreaterThan(20);
    expect(feNames.size).toBeGreaterThan(20);
    expect([...beNames].filter((n) => feNames.has(n)).length).toBeGreaterThanOrEqual(SHARED.length);
  });

  it('does not claim a pin that no longer exists', () => {
    for (const [name, file] of Object.entries(ALREADY_PINNED)) {
      const p = path.join(ROOT, file);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.readFileSync(p, 'utf8')).toContain(name);
    }
  });
});
