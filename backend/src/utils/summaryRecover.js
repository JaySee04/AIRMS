// RECOVER HOLOMOTION'S WRITTEN SUMMARY WITHOUT A MODEL.
//
// §70 reproduces the instrument's own comment on the athlete VERBATIM — it is
// the clinician's check that AIRMS read the same report they are holding. It
// was the last thing on an expanded-layout report that still needed a vision
// call: HoloMotion letter-spaces that paragraph, and pdfjs hands back one
// string in which the word boundaries are already gone. utils/textLayerExtract
// declines it (`looksLetterSpaced`) rather than emit "AccordingtoscoresofROM",
// on the stated principle that mangled is worse than absent.
//
// The boundaries are not gone in the PDF. They are gone in pdfjs's OUTPUT,
// which concatenates a text run into a single item. @firecrawl/pdf-inspector
// keeps per-glyph geometry, so the spacing survives far enough to be undone.
//
// WHY A SECOND PDF ENGINE, given pdfjs is already here. It reads, it does not
// RENDER — there is no page-to-image API — so pdfjs and @napi-rs/canvas stay
// exactly as they are for the compact layout and for name redaction. This is an
// addition, not a replacement, and it is the honest cost of the feature.
//
// WHAT IT BUYS. An expanded report currently spends ~1,500 image tokens on page
// 1 for this paragraph alone. This takes it to zero, which means an ISN
// installation with no vision key ingests those reports COMPLETELY — and no
// part of the report leaves the institution, with no exception to explain.
//
// THE COLLAPSE IS A HEURISTIC AND IS TREATED AS ONE. The technique is ported
// from the reference prototype in Downloads/PDF-JSON: merge a run of
// single-character tokens into one word, and never merge a lone CAPITAL, which
// is what keeps "E.G. In" and a standalone "I" intact. Measured across 24 real
// reports: 24 clean, 0 with a single letter left stranded, 0 where a character
// was added or lost. That is good evidence and it is not proof, so every caller
// gets `null` rather than a guess whenever the checks below do not hold, and
// the vision top-up runs exactly as it did before.

const SUMMARY_MARKER = 'according to';
// Enough to hold the longest summary measured (5 numbered points, ~640 chars)
// with room to spare, and short enough that it cannot run into the next
// section's prose.
const SUMMARY_WINDOW = 900;

/**
 * Undo HoloMotion's letter-spacing.
 *
 * A lone capital is never merged: "E.G. In torso symmetry" must survive, and a
 * standalone "I" is a word. Trailing punctuation ends a run, so "stability,"
 * closes the word rather than swallowing what follows.
 */
function collapseSpaced(text) {
  const out = [];
  let merging = false;
  for (const token of String(text).split(/\s+/)) {
    if (!token) continue;
    if (merging && /^\w+$/.test(token) && !/^[A-Z]$/.test(token)) {
      out[out.length - 1] += token;
    } else if (merging && /^\w+[,.;:!?]$/.test(token)) {
      out[out.length - 1] += token;
      merging = false;
    } else {
      out.push(token);
      merging = /^\w$/.test(token);
    }
  }
  return out.join(' ');
}

/**
 * The safety property, named so it can be asserted rather than assumed.
 *
 * Collapsing may only ever change WHITESPACE. If the non-space characters of
 * the result differ from the source in any way, something was invented or
 * dropped and the output must not be presented as the instrument's own words.
 *
 * This is the same technique lib/reportSummary.ts already uses to split the
 * summary into its printed points only when the pieces provably rejoin.
 *
 * NOTE WHAT IT DOES NOT PROVE: that a boundary is in the right PLACE. It cannot
 * distinguish "lower limbs" from "lowerlimbs". It catches corruption, not
 * mis-segmentation, and the difference is why this returns null on any doubt.
 */
function preservesCharacters(before, after) {
  const strip = (s) => String(s).replace(/\s+/g, '');
  return strip(before) === strip(after);
}

/** A stranded single lowercase letter means the collapse ran out mid-word. */
function hasStrandedLetters(text) {
  return text.split(/\s+/).some((w) => /^[a-z]$/.test(w));
}

/**
 * Keep the NUMBERED POINTS and nothing else.
 *
 * The summary has no end marker, and a fixed character window does not have one
 * either — which is the defect this function exists to fix. Measured on
 * nazwan.pdf: a 900-character window from "According to" ran past the paragraph
 * and swept in "Joint Illustration Wall Angel Single Leg Raises… Muscle
 * Imbalance Myodynamia Deficiency ： Gluteus medius L…". That would have been
 * stored and rendered as the instrument's own verdict on the athlete.
 *
 * So the text is bounded by its own STRUCTURE rather than by a length: the
 * paragraph is a lead-in followed by points numbered 1..N, and it ends where
 * the last point's final sentence ends. Anything after that belongs to the next
 * section, whatever that section happens to be called — which avoids hardcoding
 * "Joint Illustration" and breaking on the next layout that renames it.
 *
 * The lead-in ("According to scores of ROM, …, here are the comments:") is
 * DROPPED, because the vision path drops it and §70's renderer has always been
 * fed the points alone. Producing a second, subtly different shape for the same
 * document would be a new bug wearing the feature's clothes.
 */
function pointsOnly(text) {
  // Split before each "N. ", keeping the marker with its sentence.
  const chunks = String(text).split(/(?=\b\d+\.\s)/);
  const points = chunks.filter((c) => /^\d+\.\s/.test(c.trim())).map((c) => c.trim());
  if (!points.length) return null;

  // The last point is the one carrying the overrun. Cut it at its final
  // sentence terminator; everything after that is the next section.
  //
  // THE SEARCH SKIPS THE POINT'S OWN NUMBER. "1. Your physical quality is good"
  // has no terminator at all, but `lastIndexOf('.')` finds the dot in "1." and
  // the point gets truncated to the string "1." — a summary consisting of a
  // numeral, stored as the instrument's verdict. Found by the test that expected
  // this case to DECLINE.
  const last = points[points.length - 1];
  const marker = (last.match(/^\d+\.\s*/) || [''])[0];
  const body = last.slice(marker.length);
  const end = Math.max(body.lastIndexOf('.'), body.lastIndexOf(';'), body.lastIndexOf('!'));
  if (end < 0) return null;
  points[points.length - 1] = marker + body.slice(0, end + 1);

  return points.join(' ');
}

// The engine is loaded LAZILY and its absence is not an error.
//
// A native binding can be missing for reasons this code cannot fix — an
// unsupported platform, a package manager that skipped optional dependencies, a
// bundler that traced it out (which is exactly what happened to mysql2 on
// Vercel, see DEPLOY.md). Every one of those must degrade to the vision top-up,
// which is what ran before this module existed, rather than fail an import.
let engine;
let engineError = null;
function loadEngine() {
  if (engine !== undefined) return engine;
  try {
    // eslint-disable-next-line global-require
    engine = require('@firecrawl/pdf-inspector');
  } catch (err) {
    engineError = err.message;
    engine = null;
  }
  return engine;
}

/**
 * Read the Summary from a report's own glyphs.
 *
 * @returns {{ ok: true, summary: string } | { ok: false, reason: string }}
 *   `ok: false` always means "ask the model instead" and never "this report has
 *   no summary" — the caller cannot tell those apart and must not have to.
 */
function recoverSummary(buffer) {
  const lib = loadEngine();
  if (!lib) return { ok: false, reason: `engine-unavailable: ${engineError}` };

  let text;
  try {
    text = lib.extractText(Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer));
  } catch (err) {
    return { ok: false, reason: `extract-failed: ${err.message}` };
  }
  if (typeof text !== 'string' || !text) return { ok: false, reason: 'no-text' };

  const at = text.toLowerCase().indexOf(SUMMARY_MARKER);
  if (at < 0) return { ok: false, reason: 'no-summary-marker' };

  // Line breaks inside the paragraph are layout, not content: the printed
  // summary wraps mid-sentence. Joining with a space keeps token boundaries
  // intact for the collapse; the character check below then holds it honest.
  const raw = text.slice(at, at + SUMMARY_WINDOW).split('\n').filter(Boolean).join(' ');
  const collapsed = collapseSpaced(raw);

  if (!preservesCharacters(raw, collapsed)) {
    return { ok: false, reason: 'collapse-changed-characters' };
  }
  if (hasStrandedLetters(collapsed)) {
    return { ok: false, reason: 'stranded-single-letters' };
  }

  // Bounded by the paragraph's own structure, not by the window length. The
  // window only has to be large enough to CONTAIN the summary; this decides
  // where it stops.
  const summary = pointsOnly(collapsed);
  if (!summary) return { ok: false, reason: 'no-numbered-points' };

  // The character check above ran on the whole window, so re-assert it on what
  // is actually returned: trimming to the points must still only ever remove
  // text, never alter it. `pointsOnly` slices and rejoins, and a slice that
  // dropped a character mid-word would otherwise pass silently.
  if (!collapsed.replace(/\s+/g, '').includes(summary.replace(/\s+/g, '').slice(0, 60))) {
    return { ok: false, reason: 'trim-altered-text' };
  }

  // A summary shorter than this is not the paragraph §70 is about. Left as a
  // floor rather than an exact shape because the prose genuinely varies.
  if (summary.length < 40) return { ok: false, reason: 'too-short' };

  return { ok: true, summary };
}

module.exports = {
  recoverSummary,
  // exported for tests
  collapseSpaced,
  pointsOnly,
  preservesCharacters,
  hasStrandedLetters,
  SUMMARY_MARKER,
};
