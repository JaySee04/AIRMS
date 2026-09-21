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
const { looksLetterSpaced, parseMuscle } = require('../src/utils/textLayerExtract');

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
