// PLANT AN EDIT, AND PROVE IT LANDED.
//
// THE DEFECT THIS EXISTS TO MAKE IMPOSSIBLE. Half the guards in this repo work by
// deliberately breaking something and checking that a check notices. Every one of
// them rests on an assumption nobody states: that the edit was actually applied.
// When the needle is not in the text, `String.replace` returns the string
// unchanged, silently — so the run breaks nothing, the check passes, and the
// output says the guard is healthy. It is the guard's own defect class, inside
// the verification of it.
//
// It has happened at least five times, and three were in one session:
//
//   * §112.8 — a mutation edited `"overallActivityScore": 77` where the payload
//     is minified. Matched nothing, reported 330/330 values green.
//   * §121.6 — the contrast canary verified its stylesheet by searching cssText
//     for `#eef0f3`; Chrome normalises that to `rgb(238, 240, 243)`, so all 52
//     visits reported "the canary did not attach".
//   * §121.8 — a `sed` mutation anchored on two leading spaces against a
//     mid-line list entry. No-op; the suite reported 6/6 passing.
//   * §121.12 (this) — the synthetic-fixture canary replaced the literal `(74)`
//     in a PDF content stream, twice: once against Flate compression, once
//     against kerned hex strings. Both runs announced a corruption and reported
//     27/27 fields matching.
//   * and the dead-export scan that reported 113 findings because it excluded
//     backend/tests as a consumer.
//
// `scripts/mutation-check.js` already had the right discipline inline — refuse on
// zero hits, refuse on more than one — and that is the ONLY place that had it.
// This is that logic, extracted so there is one definition, and so a canary
// written next month inherits it instead of reinventing the bug.
//
// WHY `expect` IS REQUIRED AND HAS NO DEFAULT. A caller who has not thought about
// how many times the needle occurs is the caller about to plant an edit in the
// wrong place — 74 appears twice in the synthetic fixture, as Total Score and as
// a subitem cell, and a bare replace would have changed the one it did not mean.

/**
 * Replace `find` with `replace` in `text`, refusing unless the edit provably
 * landed.
 *
 * @param {string} text
 * @param {string} find needle, matched literally (not a regex)
 * @param {string} replace
 * @param {{ expect: number, label?: string, all?: boolean }} opts
 *   expect  how many times `find` must occur. Mismatch throws.
 *   all     replace every occurrence rather than the first (expect must agree).
 * @returns {{ text: string, hits: number }}
 */
function plant(text, find, replace, opts) {
  if (typeof text !== 'string') throw new TypeError('plant: text must be a string');
  if (!find) throw new TypeError('plant: `find` must be a non-empty string');
  if (!opts || typeof opts.expect !== 'number') {
    throw new TypeError('plant: `expect` is required — state how many times the needle occurs');
  }
  const what = opts.label ? `${opts.label}: ` : '';
  const hits = text.split(find).length - 1;

  if (hits !== opts.expect) {
    throw new Error(
      `${what}planted edit did NOT land as specified.\n`
      + `  needle occurs ${hits} time(s), expected ${opts.expect}\n`
      + `  needle: ${JSON.stringify(find.length > 120 ? `${find.slice(0, 120)}…` : find)}\n`
      + '  A replace that matches nothing changes nothing and reports success,\n'
      + '  which is the failure this helper exists to make impossible. Re-derive\n'
      + '  the needle from the real text rather than adjusting `expect`.',
    );
  }

  const out = opts.all ? text.split(find).join(replace) : text.replace(find, replace);

  // Belt and braces: a needle equal to its replacement would satisfy the count
  // check and still change nothing. That is a control mutation, which is a real
  // and useful thing (mutation-check entry #1 edits a comment on purpose) — but
  // it must be asked for, not arrived at by accident.
  if (out === text && find !== replace) {
    throw new Error(`${what}needle matched ${hits} time(s) but the text is unchanged — check for overlapping matches.`);
  }
  return { text: out, hits };
}

/**
 * The same guarantee for a Buffer, which is what a PDF fixture is.
 *
 * latin1 round-trips every byte 1:1, so this is safe on binary content — utf8
 * would corrupt any byte above 0x7F on the way back out, and a PDF is full of
 * them. Length is asserted unchanged, because a PDF carries byte offsets in its
 * xref table and a different-length replacement produces a file that parses
 * differently for reasons unrelated to the value under test.
 */
function plantInBuffer(buf, find, replace, opts) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('plantInBuffer: expected a Buffer');
  if (find.length !== replace.length) {
    throw new Error(
      `${opts && opts.label ? `${opts.label}: ` : ''}binary replacement must be the same length `
      + `(${find.length} vs ${replace.length}) — a PDF's xref offsets would shift.`,
    );
  }
  const { text, hits } = plant(buf.toString('latin1'), find, replace, opts);
  return { buffer: Buffer.from(text, 'latin1'), hits };
}

module.exports = { plant, plantInBuffer };
