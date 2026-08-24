// Lateral symmetry per body region: the score, what it means, and which side is
// weaker.
//
// Extracted from utils/pdfDraw.js (2026-08-23) because it existed ONLY on paper:
// the individual PDF printed a Lateral Symmetry table while no dashboard showed
// side-to-side anything, so the one line naming what to train reached whoever
// downloaded a report and nobody else.
//
// Server-side rather than reimplemented in the frontend, for the reason the band
// vocabulary and the indicator list each have one module: two definitions of
// "which side is weaker" would eventually name different sides for one athlete,
// and a clinician acts on the side.
//
// HoloMotion prints a per-region symmetry score AND per-side ROM/stability, which
// can legitimately disagree — a low score with level sides means the imbalance is
// real but not side-to-side. The status text says so rather than leaving two
// columns to contradict each other.

// Local rather than imported: this module has exactly one numeric concern and a
// shared numbers util does not exist. Same coercion pdfDraw uses.
const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * The five regions HoloMotion reports, in the order its own table uses (top of
 * the body down).
 *
 * The ONE definition. pdfDraw.js and subitemAggregate.js import it from here;
 * they each had their own copy, and subitemAggregate's carried a comment asking
 * whoever came next to keep them in step by hand. That is what went wrong: this
 * list was retyped during the 2026-08-23 extraction with `lower` for
 * `lowerLimbs`, and because a region with no symmetry score is deliberately
 * OMITTED rather than shown empty, the wrong key was indistinguishable from a
 * screening that never measured the region. Lower Limbs silently vanished from
 * the dashboard panel and from the printed Lateral Symmetry table for every
 * athlete — the region that matters most in most sports, missing from the one
 * output whose entire purpose is naming a side to act on.
 *
 * The keys are HoloMotion's, as they arrive from extraction
 * (utils/holomotionExtract.js) and as every consumer stores them. They are not
 * ours to shorten.
 */
const SUBITEM_REGIONS = [
  ['neck', 'Neck'],
  ['shoulder', 'Shoulder & Upper Limbs'],
  ['torso', 'Torso'],
  ['pelvis', 'Pelvis'],
  ['lowerLimbs', 'Lower Limbs'],
];

/**
 * Below this many points of difference the sides are called balanced.
 *
 * Deliberately small and deliberately NOT the composite's asymmetry threshold:
 * this compares two averages on the same instrument at the same session, where
 * a 1–2 point gap is rounding rather than a finding. It is not a claim about
 * clinical significance, only about what is distinguishable here.
 */
const BALANCED_WITHIN = 3;

/** HoloMotion's own tier boundaries for a symmetry score. */
const symStatus = (sym) => (sym >= 85 ? 'Good symmetry'
  : sym >= 75 ? 'Acceptable'
    : sym >= 60 ? 'Mild asymmetry' : 'Marked asymmetry');

/**
 * @returns one row per region that HAS a symmetry score:
 *   { key, label, sym, status, weaker: 'Left'|'Right'|'Balanced', gap }
 * Regions the screening did not capture are omitted rather than shown empty —
 * an absent measurement is not a finding of symmetry.
 */
function symmetryFindings(subitems) {
  if (!subitems || typeof subitems !== 'object') return [];
  const sideAvg = (a, b) => {
    const v = [num(a), num(b)].filter((x) => x !== null);
    return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null;
  };

  const out = [];
  for (const [key, label] of SUBITEM_REGIONS) {
    const r = subitems[key] || {};
    const sym = num(r.sym);
    if (sym === null) continue;

    const l = sideAvg(r.romL, r.stabL);
    const rr = sideAvg(r.romR, r.stabR);
    let weaker = 'Balanced';
    let gap = null;
    if (l !== null && rr !== null) {
      gap = Math.round(Math.abs(l - rr));
      weaker = gap < BALANCED_WITHIN ? 'Balanced' : l < rr ? 'Left' : 'Right';
    }

    let status = symStatus(sym);
    // A low score with level sides is not a contradiction, it is a different
    // finding: the imbalance is not left-versus-right. Saying so beats leaving
    // the reader to reconcile "Mild asymmetry" with "Balanced" from a footnote.
    if (sym < 75 && weaker === 'Balanced') status += ' (not side-to-side)';

    out.push({ key, label, sym, status, weaker, gap });
  }
  return out;
}

module.exports = { symmetryFindings, SUBITEM_REGIONS, BALANCED_WITHIN };
