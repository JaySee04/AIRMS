// CAN WE TELL A HOLOMOTION COVER FROM ANY OTHER PAGE, WITHOUT READING IT?
//
// reportIdentity.js refuses a PDF that has TEXT and is not a screening report.
// It cannot speak for a PDF with NO text layer — the compact 12-page layout is
// exactly that — so "no text" was a free pass to the vision model, and a scanned
// or photographed document went to a third party unchallenged.
//
// THE TECHNIQUE THE LITERATURE POINTS AT FIRST WAS MEASURED USELESS HERE, which
// is the part worth keeping. A dHash — the perceptual hash browser phishing
// detectors use against reference templates — gave:
//
//     worst same-template distance   7 / 64
//     closest unrelated document     8 / 64
//     margin                         1 bit
//
// Structural, not a tuning problem: dHash encodes brightness-gradient direction,
// and on a downscaled mostly-white A4 page nearly every cell is white, so the
// bits are noise. Ink density — where the template puts content — separates the
// same documents 0.11–0.19 against 0.86–0.91.
//
// The numbers below are the measured ones. They are asserted rather than
// described, so a change to the signature that destroyed the separation would
// fail here rather than quietly widen what reaches the model.
const { signature, distance, looksLikeCover, GRID, MAX_DISTANCE } = require('../src/utils/layoutFingerprint');
const reference = require('../src/fixtures/coverFingerprint.json');

/** A canvas stub: draws nothing, reports a flat page of the given darkness. */
function flatCanvas(darkness) {
  const n = GRID * GRID;
  const px = Math.round(255 * (1 - darkness));
  const data = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n * 4; i += 4) {
    data[i] = px; data[i + 1] = px; data[i + 2] = px; data[i + 3] = 255;
  }
  return {
    createCanvas: () => ({
      getContext: () => ({
        fillStyle: '', fillRect() {}, drawImage() {}, getImageData: () => ({ data }),
      }),
    }),
  };
}

describe('the committed reference fingerprint', () => {
  it('is the right shape for the grid it was built at', () => {
    expect(reference.grid).toBe(GRID);
    expect(reference.signature).toHaveLength(GRID * GRID);
  });

  it('is not degenerate — a flat page would match everything', () => {
    // The failure that reads as "everything is a report". If the reference were
    // all-white or all-black, distance() would collapse and the gate would
    // silently allow every document through.
    const min = Math.min(...reference.signature);
    const max = Math.max(...reference.signature);
    expect(max - min).toBeGreaterThan(0.2);
  });
});

describe('distance', () => {
  it('is 0 for a signature against itself', () => {
    expect(distance(reference.signature, reference.signature)).toBe(0);
  });

  it('is 1 — maximally different — for white against black', () => {
    const white = new Array(GRID * GRID).fill(0);
    const black = new Array(GRID * GRID).fill(1);
    expect(distance(white, black)).toBe(1);
  });

  it('refuses to compare mismatched or missing input, rather than guessing', () => {
    // Returning 0 here would read as "identical" and allow anything through.
    expect(distance([0.1], reference.signature)).toBe(1);
    expect(distance(null, reference.signature)).toBe(1);
    expect(distance([], [])).toBe(1);
  });
});

describe('signature', () => {
  it('reads a flat white page as no ink and a flat black page as all ink', () => {
    expect(signature({}, flatCanvas(0))[0]).toBeCloseTo(0, 2);
    expect(signature({}, flatCanvas(1))[0]).toBeCloseTo(1, 2);
  });

  it('produces one value per grid cell', () => {
    expect(signature({}, flatCanvas(0.5))).toHaveLength(GRID * GRID);
  });
});

describe('looksLikeCover — the gate', () => {
  it('accepts the reference itself', () => {
    const v = looksLikeCover(reference.signature, reference.signature);
    expect(v.relevant).toBe(true);
    expect(v.distance).toBe(0);
  });

  it('REFUSES a page that is nothing like a cover', () => {
    const blank = new Array(GRID * GRID).fill(0);
    const v = looksLikeCover(blank, reference.signature);
    expect(v.known).toBe(true);
    expect(v.relevant).toBe(false);
  });

  it('FAILS OPEN when there is no reference to judge against', () => {
    // A missing or malformed reference must mean "no opinion", never "refuse".
    // Blocking every compact import because a fixture went missing would be a
    // worse outcome than the hole this closes.
    for (const bad of [undefined, null, [], 'nope']) {
      const v = looksLikeCover(reference.signature, bad);
      expect(v.known).toBe(false);
      expect(v.relevant).toBe(true);
    }
  });

  it('keeps the threshold well above every report actually measured', () => {
    // thung 0.0132, nazwan 0.1049 — both REAL HoloMotion covers, one compact and
    // one expanded. The threshold must stay far enough above them that a report
    // this machine has never seen is not refused for being slightly unusual.
    expect(MAX_DISTANCE).toBeGreaterThanOrEqual(0.4);
    expect(MAX_DISTANCE).toBeLessThan(0.86); // the closest non-report measured
  });

  it('refuses a page whose ink sits everywhere the cover has none', () => {
    // The INVERSE of the reference, which is the far end of the scale by
    // construction. The first version of this filled a signature with 0.95 and
    // expected a refusal — wrong, and the test caught it: an all-dark page is
    // not automatically far from a reference that itself carries a lot of ink,
    // and the distance came out UNDER the threshold. An assertion has to be
    // built from the metric rather than from an intuition about it.
    //
    // The real unrelated document (the 51-page report that prompted all this)
    // measured 0.9106 and is checked end to end through the upload route, not
    // here: this suite is DB-free and renders no PDFs.
    const inverse = reference.signature.map((v) => 1 - v);
    const v = looksLikeCover(inverse, reference.signature);
    expect(v.known).toBe(true);
    expect(v.relevant).toBe(false);
    expect(v.distance).toBeGreaterThan(MAX_DISTANCE);
  });
});
