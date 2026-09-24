// HoloMotion's written Summary, recovered from the report's own glyphs (§114).
//
// §70 reproduces this paragraph VERBATIM as the instrument's own verdict, which
// makes it the one extracted field where a plausible-looking wrong answer is
// worst: it is prose, so nothing downstream can range-check it, and a clinician
// reading it has no reason to doubt it.
//
// Behaviour against real PDFs is verified in scripts/ (jest's CJS transform
// cannot load the engine's ESM path, and these fixtures would need 13 MB of
// real athletes' reports in the repository). Measured there:
//
//   25 of 26 reports recovered, the 1 decline being the compact layout
//   which carries no text at all and correctly falls through to vision;
//   0 reports leaked the following section into the summary;
//   nazwan.pdf recovered BYTE-IDENTICALLY to what the vision model read —
//   478 characters, including HoloMotion's own oddities ("left lumbosacrum ,"
//   and the truncated "stabil" / "symme").
//
// What is pinned here is the logic that decides whether to trust a recovery.

const {
  collapseSpaced, preservesCharacters, hasStrandedLetters, pointsOnly,
} = require('../src/utils/summaryRecover');

const fs = require('fs');
const path = require('path');

describe('undoing HoloMotion letter-spacing', () => {
  it('merges a spaced-out run back into one word', () => {
    expect(collapseSpaced('scores of ROM, s t a b i l i t y, and more'))
      .toBe('scores of ROM, stability, and more');
  });

  // The lone-capital rule, exercised by a case that ACTUALLY DEPENDS ON IT.
  //
  // The obvious example does not: in "is g o o d; E.G. In lower limbs" the
  // "d;" already ends the run before the capital is reached, so that string
  // collapses identically with the rule removed — `npm run mutate` reported
  // SURVIVED against a test asserting exactly it. The rule only bites when a
  // capital follows an UNTERMINATED run.
  //
  // Measured honestly: across all 24 real reports the rule changes nothing
  // inside the kept summary (it fires only in the muscle-imbalance text that
  // `pointsOnly` discards). It is kept as protection against a layout where a
  // spaced run runs straight into a capital — "weakIn" instead of "weak In" —
  // not because today's reports need it.
  it('never merges a lone CAPITAL into an unterminated run', () => {
    expect(collapseSpaced('w e a k I n')).toBe('weak In');
  });

  it('keeps "E.G. In" intact', () => {
    expect(collapseSpaced('is g o o d; E.G. In lower limbs'))
      .toBe('is good; E.G. In lower limbs');
  });

  it('ends a run at trailing punctuation', () => {
    expect(collapseSpaced('w e a k. You have')).toBe('weak. You have');
  });

  it('leaves ordinary prose untouched', () => {
    const prose = 'You have good symmetry; But your flexibility is relatively weak.';
    expect(collapseSpaced(prose)).toBe(prose);
  });
});

describe('the safety property', () => {
  it('accepts a change that only moves whitespace', () => {
    expect(preservesCharacters('s t a b i l i t y', 'stability')).toBe(true);
  });

  it('rejects an added character', () => {
    expect(preservesCharacters('s t a b', 'stabb')).toBe(false);
  });

  it('rejects a dropped character', () => {
    expect(preservesCharacters('s t a b', 'sta')).toBe(false);
  });

  // Stated so the limit is not mistaken for a guarantee: this catches
  // corruption, never mis-segmentation.
  it('cannot tell a misplaced boundary from a correct one', () => {
    expect(preservesCharacters('lower limbs', 'lowerlimbs')).toBe(true);
  });

  it('spots a letter the collapse left stranded', () => {
    expect(hasStrandedLetters('relatively weak s trength')).toBe(true);
    expect(hasStrandedLetters('relatively weak strength')).toBe(false);
  });
});

describe('bounding the summary by its own structure', () => {
  const REAL = '1. Your physical quality is good; E.G. In lower limbs symmetry, but left '
    + 'lumbosacrum ROM need enhancing. 2. You have good symmetry; But your flexibility is '
    + 'relatively weak. 3. Certain exercise risks exist in ankle sprain; Attention is advised '
    + 'to your training.';

  it('drops the lead-in, matching what the vision path produces', () => {
    const withLeadIn = 'According to scores of ROM, stability, symmetry, and subitems, '
      + 'here are the comments: ' + REAL;
    expect(pointsOnly(withLeadIn)).toBe(REAL);
  });

  // THE DEFECT THIS FUNCTION EXISTS FOR. A fixed character window ran past the
  // paragraph on nazwan.pdf and swept in the next two sections, which would
  // have been stored and rendered as the instrument's verdict on the athlete.
  it('stops at the end of the last point, not at the end of the window', () => {
    const overrun = REAL + ' Joint Illustration Wall Angel Single Leg Raises, Overhead Squat '
      + 'Muscle Imbalance Myodynamia Deficiency ： Gluteus medius L';
    expect(pointsOnly(overrun)).toBe(REAL);
  });

  it('declines when there are no numbered points at all', () => {
    expect(pointsOnly('Joint Illustration Wall Angel Single Leg Raises')).toBeNull();
  });

  it('declines when the last point never terminates', () => {
    expect(pointsOnly('1. Your physical quality is good')).toBeNull();
  });
});

// AND IT IS ACTUALLY CONSULTED, BEFORE THE MODEL IS PAID.
//
// Twice in this branch a guard passed while the thing it guarded was unwired —
// once because the test exercised a pure function nothing called, once because
// the pattern matched the function's own DEFINITION. Both are the winAnsiSafe
// defect. Anchored here on the ASSIGNMENT, which occurs only at the call site.
describe('the recovery pipeline is wired to its own guards', () => {
  const mod = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'utils', 'summaryRecover.js'), 'utf8',
  );

  // pointsOnly is what bounds the text. Tested directly above — and the direct
  // tests passed with the call site replaced by `const summary = collapsed`,
  // which ships the overrun. The behaviour needs a PDF to observe, so the call
  // is pinned as source.
  it('recoverSummary bounds its result with pointsOnly', () => {
    expect(mod).toMatch(/const summary = pointsOnly\(collapsed\);/);
  });

  it('declines when pointsOnly finds nothing to bound', () => {
    expect(mod).toMatch(/if \(!summary\) return \{ ok: false, reason: 'no-numbered-points' \};/);
  });

  it('checks characters are preserved before trusting the collapse', () => {
    expect(mod).toMatch(/if \(!preservesCharacters\(raw, collapsed\)\)/);
  });
});

describe('the extractor consults it, and does so first', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'utils', 'holomotionExtract.js'), 'utf8',
  );

  it('calls recoverSummary', () => {
    expect(src).toMatch(/const recovered = recoverSummary\(buffer\);/);
  });

  // Ordering is the whole saving. Recovering AFTER a successful model call
  // would spend the tokens and then discard the answer.
  //
  // ANCHORED ON THE CALLS, not the names. `summaryFromPage1(buffer)` also
  // matches its own `async function` declaration 40 lines earlier, so comparing
  // bare occurrences reported the wrong order against correct code — the third
  // time in this branch that a source test matched a definition instead of a
  // use. `await` and `const recovered =` occur only at the call sites.
  it('recovers before reaching for the model', () => {
    const recover = src.indexOf('const recovered = recoverSummary(buffer)');
    const vision = src.indexOf('await summaryFromPage1(buffer)');
    expect(recover).toBeGreaterThan(-1);
    expect(vision).toBeGreaterThan(-1);
    expect(recover).toBeLessThan(vision);
  });

  // The model must stay reachable: a report this technique cannot read is the
  // ordinary case, not a failure.
  it('still falls back to the vision top-up', () => {
    expect(src).toMatch(/if \(!summary && isVisionConfigured\(\)\)/);
  });

  // §70 reproduces this verbatim, so which producer supplied it is provenance
  // and has to survive to the payload.
  it('records which producer supplied the summary', () => {
    expect(src).toMatch(/summaryMethod,/);
    expect(src).toMatch(/summaryMethod = 'text-layer'/);
    expect(src).toMatch(/summaryMethod = summary \? 'vision' : null/);
  });
});
