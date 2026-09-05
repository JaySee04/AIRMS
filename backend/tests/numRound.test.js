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
  // indicatorPayload and BodyMap both had a `numOrNull` that the `num` sweep
  // did not see. Both now delegate to toNum; these pin the behaviour that
  // differed, so re-introducing either private copy fails here.
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
