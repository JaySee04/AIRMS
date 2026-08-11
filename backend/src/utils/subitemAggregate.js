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
// the body down). Mirrors SUBITEM_REGIONS in pdfDraw.js, which a Node PDF process
// needs separately; keep the two in step.
const REGIONS = [
  ['neck', 'Neck'],
  ['shoulder', 'Shoulder & Upper Limbs'],
  ['torso', 'Torso'],
  ['pelvis', 'Pelvis'],
  ['lowerLimbs', 'Lower Limbs'],
];

const CELLS = [
  ['romL', 'ROM L'],
  ['romR', 'ROM R'],
  ['stabL', 'Stability L'],
  ['stabR', 'Stability R'],
  ['sym', 'Symmetry'],
];

// A left/right gap at or above this many points is called out.
//
// 10 points is one full HoloMotion tier band (the instrument's own boundaries are
// 60/75/85, so 10 is wider than the narrowest band) — a gap that large means the
// two sides would not be described by the same word. Below that, screening noise
// and genuine handedness are not separable, and flagging them would bury the
// Thung-sized findings under everything else.
const NOTABLE_GAP = 10;

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
        if (Math.abs(l - r) >= NOTABLE_GAP) notable += 1;
      }
      const meanSigned = mean(signed);
      return {
        metric,
        n: gaps.length,
        meanGap: mean(gaps),
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
    n: rows.length, matrix, asymmetry, worstCell, worstAsymmetry, notableGap: NOTABLE_GAP,
  };
}

module.exports = {
  aggregateSubitems, REGIONS, CELLS, NOTABLE_GAP,
};
