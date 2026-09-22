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
const { looksLetterSpaced, parseMuscle } = require('../src/utils/textLayerExtract');

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
