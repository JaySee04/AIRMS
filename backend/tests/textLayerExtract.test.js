// The PURE half of reading a report from its text layer.
//
// WHY THE PDF ITSELF IS NOT OPENED HERE. `extractFromTextLayer` loads pdfjs
// with a dynamic `import()` of an ESM build — the same line prescription.js and
// pdfRender.js have used for months — and jest's CommonJS transform rewrites
// that to `require()`, which cannot load ESM. The first version of this file
// did open the fixtures and failed 8 of 11 for that reason alone.
//
// Fighting it would mean reconfiguring the whole suite around one util. The
// project already has the answer and states it in CLAUDE.md: "Verify any change
// to this pipeline against a real report, because no unit test can see it."
// So the PDF-dependent assertions live in scripts/verify-textlayer-extract.js,
// which runs both fixtures, diffs the payload against the existing ground truth
// and checks the refusals. This file covers what can be checked without one.
const fs = require('fs');
const path = require('path');
const { looksLetterSpaced, parseMuscle, completenessShortfall } = require('../src/utils/textLayerExtract');

// IS THE FAST PATH ACTUALLY WIRED?
//
// A pure function is correct whether or not anybody calls it — `winAnsiSafe`
// shipped defined, exported, unit-tested and never called, and every test
// passed. This extractor has exactly that shape: all the tests above would go
// on passing if `extractFromPdf` never consulted it and every import silently
// went back to costing ~11,400 vision tokens.
//
// Read as TEXT, because the alternative is mounting the whole ingestion path.
describe('the text-layer fast path is reachable from the ingestion entry point', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'utils', 'holomotionExtract.js'), 'utf8',
  );

  it('extractFromPdf consults the text layer', () => {
    expect(src).toContain("require('./textLayerExtract')");
    expect(src).toMatch(/await extractFromTextLayer\(buffer\)/);
  });

  // The order is the whole design: read first, look only if reading failed.
  it('tries the text layer BEFORE rendering pages for the model', () => {
    const fast = src.indexOf('extractFromTextLayer(buffer)');
    const render = src.indexOf('renderForExtraction(buffer)');
    expect(fast).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(-1);
    expect(fast).toBeLessThan(render);
  });

  // The compact layout carries no text at all, so the model must still be
  // reachable. A fast path that swallowed the fallback would turn a readable
  // report into an empty one.
  it('still falls back to the vision path', () => {
    expect(src).toMatch(/const images = await renderForExtraction\(buffer\);/);
    expect(src).toMatch(/method: 'vision'/);
  });

  // The Summary top-up must render ONE page, not six. Passing the limit is the
  // entire saving; dropping it would leave the fast path costing what the slow
  // path costs while reporting itself as fast.
  it('tops the Summary up from page 1 alone', () => {
    expect(src).toMatch(/renderForExtraction\(buffer, undefined, 1\)/);
  });
});

describe('the letter-spacing detector', () => {
  // §70 reproduces HoloMotion's Summary VERBATIM and attributes it to the
  // instrument. The word boundaries are NOT in the text layer — measured: every
  // one of the 44 space-runs on that line is a single space, so "According|to"
  // is encoded exactly like "A|c". An earlier version guessed and produced
  // "AccordingtoscoresofROM", which is mangled clinical text presented as the
  // instrument's own words. This detector is what makes the extractor decline.
  it('recognises the shape HoloMotion emits', () => {
    expect(looksLetterSpaced('A c c o r d i n g t o s c o r e s o f R O M')).toBe(true);
  });

  it('leaves ordinary prose alone', () => {
    expect(looksLetterSpaced('According to scores of ROM, stability and symmetry'))
      .toBe(false);
  });

  // Prose that merely CONTAINS single letters must not trip it, or a real
  // sentence would be discarded as unreadable.
  it('tolerates genuine single-letter words', () => {
    expect(looksLetterSpaced('E . G . In lower limbs symmetry and torso symmetry a lot'))
      .toBe(false);
  });

  // A short string is not evidence either way. Judging it would throw away
  // short real values; the threshold is deliberately a ratio over enough
  // tokens to mean something.
  it('declines to judge a short string', () => {
    expect(looksLetterSpaced('a b c')).toBe(false);
    expect(looksLetterSpaced('')).toBe(false);
  });
});

describe('muscle flags carry their side', () => {
  // MuscleFlag.side is an enum of L | R | B, and the body map paints the WORSE
  // of left and right — so a side dropped here is not a missing detail, it is a
  // flag painted on the wrong limb.
  it('splits the printed name from its side', () => {
    expect(parseMuscle('Gluteus medius L')).toEqual({ muscle: 'Gluteus Medius', side: 'L' });
    expect(parseMuscle('Piriformis R')).toEqual({ muscle: 'Piriformis', side: 'R' });
    expect(parseMuscle('Iliopsoas B')).toEqual({ muscle: 'Iliopsoas', side: 'B' });
  });

  // Title-cased to match how every other path in AIRMS stores a muscle name;
  // the report prints "Gluteus medius" and the ground truth says
  // "Gluteus Maximus".
  it('title-cases the muscle name', () => {
    expect(parseMuscle('gluteus maximus L').muscle).toBe('Gluteus Maximus');
  });

  // A line with no side is not a muscle flag — it is a heading, a colon, or
  // something this parser has not seen. Returning null drops it; guessing a
  // side would invent a clinical finding.
  it('refuses a line with no side rather than guessing one', () => {
    expect(parseMuscle('Muscle Tension')).toBeNull();
    expect(parseMuscle('Gluteus medius')).toBeNull();
    expect(parseMuscle('')).toBeNull();
  });
});

// WHAT MAKES A PARSE GOOD ENOUGH TO SUPPRESS THE VISION FALLBACK.
//
// The fast path's `ok` used to mean only "this PDF has more than 400 characters
// of text in it". Measured against two text-bearing PDFs in this repository:
// AIRMS-System-Guide.pdf (21,017 chars) and reports/FYP-I-Report.pdf (3,622)
// both returned ok:true with EVERY value null — and ok:true is what stops the
// model running, so the path that would have read a real report correctly never
// executed. An operator picking the wrong file got a confident empty preview.
//
// The live hazard is not a dissertation. The page numbers and label wordings
// this file parses are read off the layouts ISN produces today; a HoloMotion
// release that keeps its text layer and moves the data would land exactly here.
//
// Verified after the gate: all 24 real reports still take the fast path (no
// false negatives), and both non-reports fall through to vision.
describe('the fast path is only taken when the report was actually read', () => {
  const full = () => ({
    cover: { overallActivityScore: 78, injuryRiskIndex: 14, assessedAt: '2025-07-29T00:00:00.000Z' },
    screening: { mobility: 72, stability: 75, symmetry: 80 },
    risks: {
      neckInjuryRisk: 10, shoulderInjuryRisk: 12, scoliosis: 8, spinalDiscHerniation: 5,
      lumbarPelvisInjury: 15, jointPain: 9, kneeInjuryRisk: 21, ankleInjuryRisk: 11,
    },
  });

  it('accepts a complete parse', () => {
    expect(completenessShortfall(full())).toEqual([]);
  });

  it.each([
    ['totalScore', (p) => { p.cover.overallActivityScore = null; }],
    ['exerciseRisks', (p) => { p.cover.injuryRiskIndex = null; }],
    ['assessedAt', (p) => { p.cover.assessedAt = null; }],
    ['mobility', (p) => { p.screening.mobility = null; }],
    ['stability', (p) => { p.screening.stability = null; }],
    ['symmetry', (p) => { p.screening.symmetry = null; }],
    ['kneeInjuryRisk', (p) => { p.risks.kneeInjuryRisk = null; }],
  ])('refuses the fast path when %s is missing', (label, break_) => {
    const payload = full();
    break_(payload);
    expect(completenessShortfall(payload)).toContain(label);
  });

  // LDH is stored and never displayed (§31). That makes its absence evidence
  // about the PARSE rather than about the report, so it is checked even though
  // nothing renders it — and it is absent from RISK_INDICATORS, so a loop over
  // that list alone would miss it.
  it('requires the excluded LDH indicator too, because it is evidence about the parse', () => {
    const payload = full();
    payload.risks.spinalDiscHerniation = null;
    expect(completenessShortfall(payload)).toContain('spinalDiscHerniation');
  });

  // §54: an unknown value stays unknown, and 0 is not unknown. A real 0 on any
  // of these is a reading, and a falsy test would send a perfectly-read report
  // to the vision model — or worse, teach the gate that 0 means missing.
  it('treats a real 0 as a reading, not as missing', () => {
    const payload = full();
    payload.cover.overallActivityScore = 0;
    payload.risks.kneeInjuryRisk = 0;
    payload.screening.symmetry = 0;
    expect(completenessShortfall(payload)).toEqual([]);
  });

  it('names every missing field, so the reason is diagnosable after the fact', () => {
    const shortfall = completenessShortfall({ cover: {}, screening: {}, risks: {} });
    expect(shortfall).toContain('totalScore');
    expect(shortfall).toContain('spinalDiscHerniation');
    // 2 headline + assessedAt + 3 movement + 7 shown indicators + LDH
    expect(shortfall).toHaveLength(14);
  });

  // Subitems are deliberately NOT required: they sit on the same page as the
  // movement trio, which already covers that page, and the dashboards degrade
  // without them. Pinned so "be stricter" is a decision rather than a drift.
  it('does not require subitems', () => {
    expect(completenessShortfall(full())).toEqual([]);
  });

  // AND THE GATE IS ACTUALLY WIRED IN.
  //
  // Everything above tests the pure function, and all of it passed while the
  // call site was replaced with `const shortfall = []` — `npm run mutate`
  // reported SURVIVED. That is the winAnsiSafe defect exactly: a function
  // defined, exported, unit-tested and not consulted. The tests were checking
  // that the rule is correct, not that anything obeys it.
  //
  // Read as SOURCE because a real check needs a PDF, and jest's CJS transform
  // rewrites the dynamic `import()` this module needs for pdfjs — the same
  // reason the wiring guard at the top of this file reads text. Behaviour
  // against real documents is verified in scripts/.
  describe('and the extractor actually consults it', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'utils', 'textLayerExtract.js'), 'utf8',
    );

    // ANCHORED ON THE ASSIGNMENT, not on the bare call text.
    //
    // The obvious pattern — /completenessShortfall\(\{ cover, screening, risks \}\)/
    // — matches the function's own DEFINITION, because the parameter is a
    // destructured object with the same property names:
    //
    //   function completenessShortfall({ cover, screening, risks }) {   <- matches
    //   const shortfall = completenessShortfall({ cover, screening, risks });
    //
    // So it passed with the call site replaced by `const shortfall = []`, and
    // `npm run mutate` reported SURVIVED — the winAnsiSafe defect inside the
    // test written to catch the winAnsiSafe defect. `const shortfall =` appears
    // only at the call.
    it('calls completenessShortfall on the parsed payload', () => {
      expect(src).toMatch(/const shortfall = completenessShortfall\(\{ cover, screening, risks \}\);/);
    });

    it('refuses the fast path when the shortfall is non-empty', () => {
      expect(src).toMatch(/if \(shortfall\.length\)/);
      expect(src).toMatch(/reason: 'text-layer-incomplete'/);
    });

    // The refusal must come BEFORE the success return, or it refuses nothing.
    //
    // Anchored on `    ok: true,` — the indented, comma-terminated RETURN
    // property. The first version searched for the bare string `ok: true` and
    // failed against correct code, because the comment above the gate discusses
    // `ok: true` and comments come first. A source-reading test has to match
    // code rather than prose about the code.
    it('decides before declaring the parse good', () => {
      const refusal = src.indexOf('if (shortfall.length)');
      const success = src.indexOf('\n    ok: true,');
      expect(refusal).toBeGreaterThan(-1);
      expect(success).toBeGreaterThan(-1);
      expect(refusal).toBeLessThan(success);
    });

    // Naming what was missing is what makes a future layout change diagnosable
    // rather than just "it went to vision again".
    it('reports WHICH fields were missing', () => {
      expect(src).toMatch(/missing: shortfall/);
    });
  });
});
