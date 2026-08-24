// Aggregating the HoloMotion Physical Fitness Subitem table across a cohort.
//
// WHY THIS EXISTS
// The subitem table is the densest thing the instrument produces: 5 body regions
// × {ROM left, ROM right, Stability left, Stability right, Symmetry} = 25 readings
// per athlete. Everything else on the report is a summary of it — Total Score is
// literally its mean (verified against three real reports, residual ≤1.2).
//
// AIRMS was using none of it at squad level. The admin dashboard aggregated only
// the 7 exercise-risk indicators; the 25-cell table appeared as raw numbers on an
// individual and in the team PDF's heatmap, and nowhere else. So the richest
// measurement in the source document had no dashboard representation at all.
//
// And the part that matters most was invisible everywhere: LEFT VS RIGHT. It is
// the only bilateral data the report carries, it is what a movement screen exists
// to find, and AIRMS collapsed it three different ways — the body map paints a
// region by the WORSE of L/R, the cohort composite averages every gap into one
// `balance` number, and the subitem table prints L and R side by side and leaves
// the subtraction to the reader. Real magnitudes from the verified reports:
// Thung's neck ROM is 95 left against 62 right, a 33-point gap; Elffie's neck 15
// and pelvis 13; Nazwan's neck 11.
//
// Pure — no DB, no Sequelize — so it is unit-testable.

// Region keys + display names, matching the report's own section order (top of
// the body down). Imported rather than mirrored: this file used to carry its own
// copy under a comment asking for the two to be kept in step by hand, which is
// exactly the arrangement that lost Lower Limbs. See utils/symmetry.js.
const { SUBITEM_REGIONS: REGIONS } = require('./symmetry');

const CELLS = [
  ['romL', 'ROM L'],
  ['romR', 'ROM R'],
  ['stabL', 'Stability L'],
  ['stabR', 'Stability R'],
  ['sym', 'Symmetry'],
];

// A left/right difference at or above this PERCENT is called out.
//
// This was 10 raw score POINTS, which made two clinically different situations
// count identically: 80 vs 70 is a 12.5% deficit in a strong limb, while 40 vs 30
// is 25% in a weak one. The inter-limb asymmetry literature expresses the measure
// as a percentage, and return-to-sport criteria are stated as a limb symmetry
// index of 85-90% — so a percentage is both more honest and directly comparable
// to a criterion a clinician already knows.
//
// 10% is retained as the figure because it is the value most commonly cited, and
// it lands close to the old points threshold across the range HoloMotion actually
// produces. It is not a hard clinical boundary: asymmetry above 10% is common in
// uninjured athletes and the threshold itself is debated in the literature. What
// changed is how the quantity is EXPRESSED, not a claim that 10 is the right cut.
//
// NOT applied to the composite indicator's `balance` term in utils/cohorts.js,
// deliberately: that term is z-scored against the athlete's cohort, and z-scoring
// already removes the scale, so normalising it would move nobody's band while
// making the code harder to follow. The threshold here is an ABSOLUTE cut-off,
// which is exactly where the un-normalised form did damage.
// See docs/DESIGN_DECISIONS.md §33.
const NOTABLE_GAP_PCT = 10;

/**
 * Inter-limb difference as a percentage of the better side, the way the
 * literature states it. Null when either side is missing or both are zero.
 */
function asymmetryPct(l, r) {
  if (l === null || r === null) return null;
  const better = Math.max(l, r);
  if (!better) return null;
  return (Math.abs(l - r) / better) * 100;
}

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const mean = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null);

/**
 * @param screenings rows carrying a `subitems` object
 *   ({ neck: { romL, romR, stabL, stabR, sym }, ... })
 * @returns {{ n, matrix, asymmetry, worstCell, worstAsymmetry }}
 */
function aggregateSubitems(screenings) {
  const rows = (screenings || []).filter((s) => s && s.subitems && typeof s.subitems === 'object');

  // ── The 5 × 5 matrix: cohort mean per cell ────────────────────────────────
  const matrix = REGIONS.map(([key, label]) => ({
    key,
    label,
    cells: CELLS.map(([cellKey, cellLabel]) => {
      const vals = rows
        .map((s) => num(s.subitems[key] && s.subitems[key][cellKey]))
        .filter((v) => v !== null);
      return {
        key: cellKey, label: cellLabel, value: mean(vals), n: vals.length,
      };
    }),
  }));

  // ── Asymmetry per region ──────────────────────────────────────────────────
  // Signed means are reported as well as absolute ones, and they answer different
  // questions. The mean |gap| says how asymmetric the squad is; the mean SIGNED
  // gap says whether it leans the same way for everyone. A squad where half are
  // left-dominant and half right-dominant has a large mean |gap| and a signed mean
  // near zero — that is a screening/technique story, not a shared weakness, and
  // reporting only one of the two numbers would hide the difference.
  const asymmetry = REGIONS.map(([key, label]) => {
    const pairs = [['rom', 'romL', 'romR'], ['stab', 'stabL', 'stabR']].map(([metric, lKey, rKey]) => {
      const gaps = [];
      const pcts = [];
      const signed = [];
      let notable = 0;
      for (const s of rows) {
        const reg = s.subitems[key];
        if (!reg) continue;
        const l = num(reg[lKey]);
        const r = num(reg[rKey]);
        if (l === null || r === null) continue;
        signed.push(l - r);
        gaps.push(Math.abs(l - r));
        const pct = asymmetryPct(l, r);
        if (pct !== null) {
          pcts.push(pct);
          if (pct >= NOTABLE_GAP_PCT) notable += 1;
        }
      }
      const meanSigned = mean(signed);
      return {
        metric,
        n: gaps.length,
        // Kept: the raw point gap is what the printed HoloMotion table shows, so a
        // clinician can still reconcile it against the report in their hand.
        meanGap: mean(gaps),
        // Added: the same difference as the literature states it.
        meanGapPct: mean(pcts),
        // Mean of (left − right). Positive = the left side SCORES HIGHER, and
        // since every subitem is "higher is better", that means the RIGHT side is
        // the weaker one.
        meanSigned,
        // Named for what a clinician acts on: which side is WEAKER. This was
        // called `leans` and it was genuinely ambiguous — "leans left" reads as
        // either "left is stronger" or "the deficit is on the left", and the two
        // are opposites. A test written against the real reports caught it
        // pointing the wrong way.
        //
        // Only claimed when the squad actually tips: a signed mean inside the
        // noise band is "no consistent side", not "slightly right".
        weakerSide: meanSigned === null || Math.abs(meanSigned) < 2 ? null : (meanSigned > 0 ? 'right' : 'left'),
        notable,
        meanLeft: mean(rows.map((s) => num(s.subitems[key] && s.subitems[key][lKey])).filter((v) => v !== null)),
        meanRight: mean(rows.map((s) => num(s.subitems[key] && s.subitems[key][rKey])).filter((v) => v !== null)),
      };
    });
    return { key, label, metrics: pairs };
  });

  // The two headlines a reader should take away, computed here rather than in the
  // UI so the page and any future report cannot pick differently.
  const allCells = matrix.flatMap((r) => r.cells
    .filter((c) => c.value !== null)
    .map((c) => ({ region: r.label, ...c })));
  const worstCell = allCells.length
    ? allCells.reduce((a, b) => (b.value < a.value ? b : a))
    : null;

  const allGaps = asymmetry.flatMap((r) => r.metrics
    .filter((m) => m.meanGap !== null)
    .map((m) => ({ region: r.label, ...m })));
  const worstAsymmetry = allGaps.length
    ? allGaps.reduce((a, b) => (b.meanGap > a.meanGap ? b : a))
    : null;

  return {
    n: rows.length, matrix, asymmetry, worstCell, worstAsymmetry,
    notableGapPct: NOTABLE_GAP_PCT,
  };
}

module.exports = {
  aggregateSubitems, asymmetryPct, REGIONS, CELLS, NOTABLE_GAP_PCT,
};
