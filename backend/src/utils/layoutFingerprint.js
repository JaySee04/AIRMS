// IS THIS PAGE THE SHAPE OF A HOLOMOTION COVER?
//
// THE HOLE THIS CLOSES. utils/reportIdentity.js refuses a PDF that has TEXT but
// is not a screening report — the measured defect, a 51-page university report
// reaching Gemini. It cannot speak for a PDF with NO text layer: at 0 characters
// there is nothing to read. The compact 12-page HoloMotion layout is exactly
// that, so "no text" was a free pass to the model, and a scanned document or a
// photographed page went straight out to a third party.
//
// WHY NOT OCR, which is the obvious answer. The redaction pass already runs
// tesseract over page 1, and its own history says why its result cannot be a
// GATE: tesseract 6 and 7 return `fallback:name-not-found` on REAL reports,
// which is why this project pins 5 (gotcha 6). A refusal built on it would
// reject genuine clinical imports the day that dependency moves.
//
// WHAT WAS TRIED AND REJECTED, because the rejected one is the one the
// literature points at first.
//
// A dHash — the technique browser phishing detectors use, a perceptual hash of a
// downscaled screenshot matched to reference templates by Hamming distance — was
// built first and MEASURED USELESS here:
//
//     worst same-template distance   7 / 64
//     closest unrelated document     8 / 64
//     margin                         1 bit
//
// The reason is structural rather than a tuning problem: dHash encodes the
// direction of brightness gradients, and on a downscaled, mostly-white A4 page
// almost every cell is white, so the bits are near-noise. Raising the resolution
// does not fix a signal that is not there. A one-bit margin would have refused
// real reports the first time an athlete had a longer name.
//
// INK DENSITY is the signal that works: the fraction of dark pixels in each cell
// of a grid, which is literally "where does this template put content". Measured
// on the same documents:
//
//     thung perturbed (simulated other athletes)   0.14 – 0.19
//     nazwan — a different, REAL HoloMotion cover  0.11
//     an unrelated 51-page report                  0.86
//     a plain pdfkit page                          0.89
//
// Same family at or below 0.19, not-a-report at or above 0.86 — a 4.5x margin
// where the hash had 1 bit. Note nazwan is an EXPANDED report and still lands at
// 0.11: the instrument's cover furniture is common to both layouts, which is the
// property being keyed on and is why one reference serves.
//
// NO NEW DEPENDENCY, and that is a requirement rather than a preference: pdfjs
// and @napi-rs/canvas are COUPLED and pinned (gotcha 6), and adding an image
// library beside them is how that pairing gets disturbed. @napi-rs/canvas is
// already here for pdfRender and does all of this.

/** Grid resolution. 16 measured as well as 32 and no worse; 16 is cheaper. */
const GRID = 16;

/**
 * REFUSAL THRESHOLD, deliberately far above anything a report has measured.
 *
 * Observed: same family <= 0.19, not-a-report >= 0.86. 0.50 sits 2.6x above the
 * worst report and 1.7x below the closest non-report, so a compact layout this
 * machine has never seen would have to be THREE TIMES less like a HoloMotion
 * cover than any sample before it is refused.
 *
 * Biased hard toward letting things through on purpose: a false refusal blocks a
 * clinician's import of a real screening, while a false accept costs one
 * provider call on a document that was already being sent before this existed.
 * The failure modes are not symmetric and neither is the threshold.
 */
const MAX_DISTANCE = 0.5;

/**
 * Ink-density signature of a rendered page: GRID×GRID cells, each the mean
 * darkness of that cell, 0 (white) to 1 (black).
 *
 * @param {any} image anything @napi-rs/canvas can draw
 * @param {any} canvasLib the loaded @napi-rs/canvas module
 * @returns {number[]} GRID*GRID values
 */
function signature(image, canvasLib) {
  const canvas = canvasLib.createCanvas(GRID, GRID);
  const ctx = canvas.getContext('2d');
  // White ground FIRST. A page rendered with transparency would otherwise
  // compare black against black and every document would look identical — the
  // failure that reads as "everything matches", which is the worst direction
  // for a gate.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, GRID, GRID);
  ctx.drawImage(image, 0, 0, GRID, GRID);
  const { data } = ctx.getImageData(0, 0, GRID, GRID);

  const out = [];
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 601 luma, inverted: the report is white-on-dark in places and
    // dark-on-white in others, so channel weighting matters.
    out.push(1 - ((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255));
  }
  return out;
}

/** Mean absolute difference between two signatures, 0 (identical) to 1. */
function distance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/**
 * Does this page look like a HoloMotion cover?
 *
 * Fails OPEN on a missing reference — an absent fingerprint file means "we
 * cannot judge", and refusing every compact import because a reference is
 * missing would be a worse outcome than the hole this closes.
 */
function looksLikeCover(pageSignature, reference, max = MAX_DISTANCE) {
  if (!Array.isArray(reference) || !reference.length) {
    return { known: false, relevant: true, distance: null, why: 'no reference fingerprint' };
  }
  const d = distance(pageSignature, reference);
  return {
    known: true,
    relevant: d <= max,
    distance: Number(d.toFixed(4)),
    why: `ink-density distance ${d.toFixed(3)} against ${max} (report samples measured 0.11–0.19)`,
  };
}

module.exports = {
  signature, distance, looksLikeCover, GRID, MAX_DISTANCE,
};
