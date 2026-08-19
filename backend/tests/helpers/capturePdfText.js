// Capture every string pdfkit ACTUALLY receives while a document is drawn.
//
// WHY THIS EXISTS
// `winAnsiSafe` was written, exported, unit-tested and never wired in. The
// wiring edit silently matched nothing (LF replacement strings against a CRLF
// file), so `guardText` was dead code — and every test still passed, because
// they asserted `winAnsiSafe(input) === expected`. A pure function is correct
// whether or not anybody calls it. Only re-rendering the report and seeing the
// same mojibake caught it.
//
// The fix for the test suite is to stop asserting on the helper and start
// asserting on the OUTPUT. `guardText` replaces `text` on the document INSTANCE,
// so a spy attached after construction sits ABOVE the guard and sees the raw
// string — which is exactly the useless assertion that shipped. Patching
// `PDFDocument.prototype.text` BEFORE the document is constructed puts the spy
// UNDERNEATH the guard: what it records is what pdfkit was actually asked to
// draw, post-sanitisation.
//
// So a guard that is not installed fails these tests, which is the property the
// original ones lacked.
const PDFDocument = require('pdfkit');

// Characters pdfkit's built-in WinAnsi Helvetica cannot draw: they measure zero
// width and print as mojibake, silently. Kept as codepoints so this file stays
// ASCII and cannot itself become the thing it is testing for.
const UNRENDERABLE = [
  0x2265, // >=
  0x2264, // <=
  0x2260, // !=
  0x2248, // ~=
  0x2192, // ->
  0x2190, // <-
  0x2194, // <->
  0x2212, // true minus
  0x2500, // box drawing
  0xfeff, // BOM
  0x2261, // identical to
  0x221a, // sqrt
];

// Deliberately excluded from the list above because they DO render and carry
// meaning in these reports: em-dash, middot, multiplication, plus-minus,
// en-dash, ellipsis, curly quotes. Asserting their survival is as important as
// asserting the others' removal — a sanitiser that stripped them would quietly
// wreck "Badminton · PODIUM" and every "sport × programme × gender" caption.
const MUST_SURVIVE = [0x2014, 0x00b7, 0x00d7, 0x00b1, 0x2013, 0x201c, 0x201d, 0x2019];

/**
 * Run `draw` with pdfkit's prototype text method instrumented.
 * @param {(deps: {PDFDocument: any}) => any} draw  may return a promise
 * @returns {Promise<{ strings: string[], joined: string }>}
 */
async function capturePdfText(draw) {
  const original = PDFDocument.prototype.text;
  const strings = [];
  PDFDocument.prototype.text = function patched(str, ...rest) {
    if (typeof str === 'string') strings.push(str);
    return original.call(this, str, ...rest);
  };
  try {
    await draw({ PDFDocument });
  } finally {
    PDFDocument.prototype.text = original;
  }
  return { strings, joined: strings.join('\n') };
}

/** Codepoints from UNRENDERABLE that appear anywhere in the captured text. */
function unrenderableIn(joined) {
  return UNRENDERABLE
    .filter((cp) => joined.includes(String.fromCodePoint(cp)))
    .map((cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'));
}

const chr = (cp) => String.fromCodePoint(cp);

/**
 * Record the PAINT operations a draw performs, not its text.
 *
 * Some decisions in this toolkit are geometric rather than textual, and the one
 * that matters most is section 30a: a change smaller than the detectable-change
 * threshold must be drawn as an OUTLINE (stroke) and never as a solid bar
 * (fill), because a filled bar asserts a real move. Nothing in the text of the
 * page records that choice, so a test that only reads strings cannot see it — and
 * a well-meant "simplification" back to a fill would pass every existing test
 * while silently restoring the defect.
 *
 * `rect()` returns the document for chaining, so the fill/stroke that follows is
 * what commits the paint. Recording those two is enough to tell the cases apart.
 */
async function capturePaintOps(draw) {
  const PD = PDFDocument.prototype;
  const NAMES = ['fill', 'stroke', 'fillAndStroke', 'rect', 'roundedRect', 'path'];
  const originals = {};
  for (const n of NAMES) originals[n] = PD[n];
  const ops = [];
  for (const n of NAMES) {
    PD[n] = function patched(...a) { ops.push({ op: n, args: a }); return originals[n].apply(this, a); };
  }
  try {
    await draw({ PDFDocument });
  } finally {
    Object.assign(PD, originals);
  }
  return {
    ops,
    count: (op) => ops.filter((o) => o.op === op).length,
    // Geometry of every rect drawn, as { x, y, w, h } — how `bar()`'s value
    // column is checked for the overflow described in section 30b.
    rects: () => ops
      .filter((o) => o.op === 'rect' || o.op === 'roundedRect')
      .map((o) => ({ x: o.args[0], y: o.args[1], w: o.args[2], h: o.args[3] })),
  };
}

module.exports = {
  capturePdfText, capturePaintOps, unrenderableIn, UNRENDERABLE, MUST_SURVIVE, chr,
};
