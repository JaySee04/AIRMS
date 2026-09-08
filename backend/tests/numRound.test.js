// `round`, and the two coercions that were hiding under a different name.
//
// The num() unification (§54) swept for `num`. It missed `numOrNull`, which was
// the same defect spelled differently: it turned '' into 0 and a non-numeric
// string into NaN, on `totalScore` and `cohortZ` — the two figures every
// dashboard hero leads with. Renaming is all it took to escape a sweep, which
// is why this file asserts on the BEHAVIOUR rather than on the name.
const { toNum, round, mean } = require('../src/utils/num');

describe('round', () => {
  // Every cohort average, period average and subitem cell on every dashboard
  // and printed report goes through this. The rule it uses is not arbitrary.
  it('matches the toFixed it replaced, NOT multiply-and-round', () => {
    // These are different functions. 77.85 is held as 77.8499…, so toFixed(1)
    // gives 77.8 while Math.round(77.85 * 10) / 10 gives 77.9. Three modules
    // used toFixed(1); switching rule would move published averages with
    // nothing to attribute the change to.
    expect(round(77.85, 1)).toBe(77.8);
    expect(round(42.55, 1)).toBe(42.5);
    expect(Math.round(77.85 * 10) / 10).toBe(77.9); // the rule NOT used
  });

  it('agrees with toFixed across a large random sample', () => {
    // The property, not three examples. This is what proved the refactor
    // neutral before it shipped.
    for (let i = 0; i < 20000; i += 1) {
      const v = Math.round(Math.random() * 1000000) / 10000;
      expect(round(v, 1)).toBe(+v.toFixed(1));
    }
  });

  it('preserves null rather than inventing 0', () => {
    expect(round(null, 1)).toBeNull();
    expect(round('', 1)).toBeNull();
    expect(round('abc', 1)).toBeNull();
    expect(mean([])).toBeNull();
    expect(round(mean([]), 1)).toBeNull();
  });

  it('defaults to whole numbers', () => {
    expect(round(72.5)).toBe(73);
    expect(round(72.4)).toBe(72);
  });
});

describe('the coercions that were named differently', () => {
  // THE SWEEP THAT KEEPS MISSING ONE. §54 searched for the name `num` and missed
  // `numOrNull` (§57). This guard was then written naming the TWO files that had
  // one — which is the same mistake one level up, and it duly missed a THIRD:
  // routes/coach.js declared `numOrZero` and shipped the eight risk indicators
  // and five headline scores through it.
  //
  // So the file list is gone. The scan below reads EVERY non-test source file in
  // both packages and looks for the SHAPE of a private coercion — a function
  // body that calls Number() with a null/undefined guard around it — wherever it
  // appears and whatever it is called. A nineteenth copy under a nineteenth name
  // fails here without anyone having to think of the name first.
  const fs = require('fs');
  const path = require('path');

  it('indicatorPayload does not carry its own coercion', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'indicatorPayload.js'), 'utf8');
    expect(src).toMatch(/require\('\.\/num'\)/);
    // The old body, which returned 0 for '' and NaN for a non-numeric string.
    expect(src).not.toMatch(/v === null \|\| v === undefined \? null : Number\(v\)/);
  });

  it('BodyMap does not carry its own coercion', () => {
    const p = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'dashboard', 'BodyMap.tsx');
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/from '@\/lib\/num'/);
    expect(src).not.toMatch(/Number\.isNaN\(Number\(v\)\) \? null : Number\(v\)/);
  });

  it('no source file declares its own Number()-based coercion', () => {
    const ROOT = path.join(__dirname, '..', '..');
    const walk = (dir, acc = []) => {
      if (!fs.existsSync(dir)) return acc;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (/\.(js|ts|tsx)$/.test(e.name) && !/\.test\.[jt]sx?$/.test(e.name)) acc.push(full);
      }
      return acc;
    };
    const files = [
      ...walk(path.join(ROOT, 'backend', 'src')),
      ...walk(path.join(ROOT, 'frontend', 'src')),
    // `[\\/]` covers both separators — on Windows these are absolute paths with
    // backslashes, so a `/`-only class would fail to exempt the real helpers and
    // report them as offenders against themselves.
    ].filter((f) => !/[\\/](num\.js|num\.ts)$/.test(f));

    // A floor, so a broken walk cannot pass by scanning nothing.
    expect(files.length).toBeGreaterThan(80);

    // The pattern lives in a STRING, and the canary below proves it works.
    //
    // The first version of this scan was a regex literal, and it was inert: the
    // editing pass that produced it turned the `\b` word boundaries into literal
    // BACKSPACE bytes (0x08). A regex containing a raw backspace matches a
    // literal backspace, which never occurs in source — so the pattern could not
    // match anything, the guard reported "no offenders", and it was green while
    // two real offenders sat in the tree.
    //
    // It is invisible in every tool that would normally show it: `grep`, `sed`
    // and an editor all render 0x08 as nothing or as `\b`, identical to the
    // intended escape. It took `od -c` to see.
    //
    // Hence the canary: a synthetic line the scanner MUST flag. A pattern that
    // has been broken — by mangling, by a bad edit, by a rewrite that no longer
    // matches anything — fails there rather than passing silently. Same
    // principle as the timezone suite's meta-assertion (§62): a scanner must
    // first prove it can find what it is looking for.
    // WIDENED 2026-09-06, because the first version was too narrow and said so
    // only when asked a second time. It required an `=>` and stopped at `{`, so
    // it caught a private HELPER (`const f = (v) => (v == null ? 0 : Number(v))`)
    // and missed the same coercion written inline — in an object literal, or in
    // a block-bodied arrow. `routes/athletes.js` had four of those and
    // `routes/cohorts.js` a fifth, sitting in the tree while this reported clear.
    //
    // The shape is now what a defect actually IS: a null/undefined guard that
    // PRODUCES a value through `? … : Number(…)`. That deliberately excludes the
    // guard idioms, which are correct code and must not be flagged —
    // `Number.isNaN(Number(x))`, `Number.isFinite(Number(x))`, and the
    // `exec(…) !== null` loop. Each of those was a false positive of the naive
    // widening, and calibrating against them is why the list below is trustworthy
    // rather than merely long.
    const COERCION_SHAPE = '(?:==\\s*null|===\\s*null|===\\s*undefined)[^;\\n]{0,120}?\\?[^;\\n]{0,40}?:\\s*Number\\s*\\(';

    // The canary, both ways. A pattern that has been broken fails the first; a
    // pattern widened until it flags correct code fails the rest.
    const MUST_CATCH = [
      'const numOrZero = (v) => (v == null ? 0 : Number(v));',
      'totalScore: sc.totalScore === null || sc.totalScore === undefined ? null : Number(sc.totalScore),',
    ];
    const MUST_NOT_CATCH = [
      'const total = numOr(v, 0) + 1;',
      "if (d === null || d === undefined || d === '' || Number.isNaN(Number(d))) return;",
      "const ok = p !== null && p !== '' && Number.isFinite(Number(p));",
      'while ((m = RE.exec(s)) !== null) marks.push({ day: Number(m[1]) });',
    ];
    expect({
      catches: MUST_CATCH.map((c) => new RegExp(COERCION_SHAPE).test(c)),
      ignores: MUST_NOT_CATCH.map((c) => new RegExp(COERCION_SHAPE).test(c)),
    }).toEqual({ catches: [true, true], ignores: [false, false, false, false] });

    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
      // Shape-based rather than name-based - that is the whole point: an arrow
      // whose body guards null/undefined and then calls Number(), whatever it
      // happens to be called.
      if (new RegExp(COERCION_SHAPE).test(src)) offenders.push(path.relative(ROOT, f));
    }
    // If this fails: use toNum for "unknown stays unknown", or numOr(v, 0) where
    // a number is genuinely required so the fabrication is visible. Do not add a
    // local helper, whatever you call it.
    expect(offenders).toEqual([]);
  });

  it('the behaviour they used to get wrong', () => {
    // '' was 0 in both, and 'abc' was NaN in the backend's — on totalScore and
    // cohortZ, so a hero could read "0" for a score nobody measured.
    expect(toNum('')).toBeNull();
    expect(toNum('  ')).toBeNull();
    expect(toNum('abc')).toBeNull();
    expect(Number.isNaN(toNum('abc'))).toBe(false);
  });
});

describe('the canvas loader is not a require cycle', () => {
  // pdfRender already requires redactName, so putting the loader in either of
  // them makes a cycle — under which the second module sees a half-built
  // exports object and fails with "loadCanvas is not a function" at redaction
  // time, which says nothing about canvas. Its own module, like periodScores.
  const fs = require('fs');
  const path = require('path');
  const u = (n) => fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', n), 'utf8');

  it('both consumers read it from canvasLoader, not from each other', () => {
    expect(u('pdfRender.js')).toMatch(/require\('\.\/canvasLoader'\)/);
    expect(u('redactName.js')).toMatch(/require\('\.\/canvasLoader'\)/);
    expect(u('redactName.js')).not.toMatch(/require\('\.\/pdfRender'\)/);
  });

  it('loads without a circular-dependency warning', () => {
    // Requiring both in one process is what surfaced the cycle originally.
    expect(() => {
      require('../src/utils/redactName');
      require('../src/utils/pdfRender');
    }).not.toThrow();
    expect(typeof require('../src/utils/canvasLoader').loadCanvas).toBe('function');
  });

  it('explains which feature is unavailable when canvas is missing', () => {
    // A raw MODULE_NOT_FOUND leaves an operator guessing. The message names the
    // half that stops working and the half that does not.
    const src = u('canvasLoader.js');
    expect(src).toMatch(/Screening import needs it/);
    expect(src).toMatch(/expose/); // so httpError keeps the sentence on a 500
  });
});
