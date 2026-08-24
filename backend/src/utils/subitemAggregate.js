// Aggregating the HoloMotion Physical Fitness Subitem table across a cohort.
//
// The densest thing the instrument produces: 5 regions x {ROM L/R, Stability
// L/R, Symmetry} = 25 readings per athlete, and Total Score is literally its
// mean (verified on three real reports, residual <=1.2).
//
// LEFT VS RIGHT is why it is aggregated here. It is the only bilateral data the
// report carries and what a movement screen exists to find, yet every other view
// collapses it: the body map paints the WORSE of L/R, the composite averages
// every gap into `balance`, and the subitem table leaves the subtraction to the
// reader. Real magnitudes: Thung's neck ROM 95 left against 62 right (33 points);
// Elffie's neck 15, pelvis 13; Nazwan's neck 11.
//
// Pure — no DB, no Sequelize — so it is unit-testable.

// Region keys + display names, in the report's own section order (top of the body
// down). Imported from utils/symmetry.js, never mirrored — a hand-kept second
// copy is what lost Lower Limbs.
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
// A percentage, not raw points: 80 vs 70 is a 12.5% deficit in a strong limb
// while 40 vs 30 is 25% in a weak one, and points count those the same. The
// inter-limb asymmetry literature uses percentages, and return-to-sport criteria
// are stated as a limb symmetry index of 85-90%.
//
// 10% is the most commonly cited figure. It is not a hard boundary — asymmetry
// above 10% is common in uninjured athletes and the cut is debated.
//
// NOT applied to the composite's `balance` term in utils/cohorts.js: that is
// z-scored against the cohort, which already removes the scale, so normalising it
// would move nobody's band. This threshold is an ABSOLUTE cut-off, which is where
// the un-normalised form did damage.
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
