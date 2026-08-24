// Lateral symmetry (utils/symmetry.js).
//
// This module answers the one question in a screening a clinician acts on
// directly: which SIDE is weaker. It is consumed five times — the dashboard
// panel via indicatorPayload, and four places in pdfDraw (the individual
// report's table, the marked-asymmetry interpretation, the squad rollup and the
// team report) — so a defect here is wrong in the athlete's view and in the
// printed report at once, and the two agree with each other while both are
// wrong.
//
// It shipped with no tests and immediately earned some. Extracted from
// pdfDraw.js on 2026-08-23, the region list was retyped with `lower` in place of
// HoloMotion's `lowerLimbs`. Nothing failed: symmetryFindings deliberately
// OMITS a region with no symmetry score, on the sound principle that an absent
// measurement is not a finding of symmetry — which makes a mistyped key look
// exactly like a region the screening never captured. Lower Limbs disappeared
// from every symmetry output for every athlete, and 365 passing tests said
// nothing, because the values were never wrong; the key was.
//
// So the first test here pins the KEYS, not the behaviour.

const { symmetryFindings, SUBITEM_REGIONS, BALANCED_WITHIN } = require('../src/utils/symmetry');
const { SUBITEM_REGIONS: EXTRACTION_KEYS } = (() => {
  // The keys the vision extraction is instructed to return. If these two lists
  // disagree, the schema and the reader disagree, and the loss is silent.
  const src = require('fs').readFileSync(require('path').join(__dirname, '../src/utils/holomotionExtract.js'), 'utf8');
  const m = src.match(/const SUBITEM_REGIONS = \[([^\]]*)\]/);
  return { SUBITEM_REGIONS: m[1].match(/'([^']+)'/g).map((q) => q.slice(1, -1)) };
})();

// Nazwan's real Physical Fitness Subitem Score table, page 5 of his report.
const NAZWAN = {
  neck: { romL: 83, romR: 72, stabL: 76, stabR: 76, sym: 83 },
  shoulder: { romL: 89, romR: 85, stabL: 84, stabR: 82, sym: 89 },
  torso: { romL: 70, romR: 67, stabL: 87, stabR: 89, sym: 90 },
  pelvis: { romL: 62, romR: 71, stabL: 76, stabR: 82, sym: 86 },
  lowerLimbs: { romL: 66, romR: 68, stabL: 76, stabR: 79, sym: 91 },
};

describe('the region keys are HoloMotion’s, not ours', () => {
  it('uses exactly the keys the extraction schema promises', () => {
    expect(SUBITEM_REGIONS.map(([k]) => k)).toEqual(EXTRACTION_KEYS);
  });

  it('covers all five regions of the printed table', () => {
    expect(SUBITEM_REGIONS.map(([k]) => k))
      .toEqual(['neck', 'shoulder', 'torso', 'pelvis', 'lowerLimbs']);
  });
});

describe('a real subitem table', () => {
  const rows = symmetryFindings(NAZWAN);

  it('reports every region the report printed — Lower Limbs included', () => {
    // The regression test proper. A mistyped key drops the row silently.
    expect(rows.map((r) => r.key)).toEqual(['neck', 'shoulder', 'torso', 'pelvis', 'lowerLimbs']);
  });

  it('names the weaker side from the per-side averages', () => {
    // Neck: L (83+76)/2 = 79.5 vs R (72+76)/2 = 74 → right is weaker by 6.
    const neck = rows.find((r) => r.key === 'neck');
    expect(neck).toMatchObject({ weaker: 'Right', gap: 6 });
    // Pelvis: L (62+76)/2 = 69 vs R (71+82)/2 = 76.5 → left weaker by 8.
    expect(rows.find((r) => r.key === 'pelvis')).toMatchObject({ weaker: 'Left', gap: 8 });
  });

  it('calls sides balanced when the gap is below the threshold', () => {
    // Torso: L 78.5 vs R 78 → 1 point apart, rounding rather than a finding.
    expect(rows.find((r) => r.key === 'torso').weaker).toBe('Balanced');
  });
});

describe('a low score with level sides is a different finding', () => {
  it('says so rather than leaving two columns to contradict each other', () => {
    const [row] = symmetryFindings({ neck: { romL: 50, romR: 50, stabL: 50, stabR: 50, sym: 60 } });
    expect(row.status).toBe('Mild asymmetry (not side-to-side)');
  });

  it('does not add the qualifier when the sides genuinely differ', () => {
    const [row] = symmetryFindings({ neck: { romL: 40, romR: 60, stabL: 40, stabR: 60, sym: 60 } });
    expect(row.status).toBe('Mild asymmetry');
    expect(row.weaker).toBe('Left');
  });
});

describe('what it declines to say', () => {
  it('omits a region with no symmetry score rather than showing it empty', () => {
    const rows = symmetryFindings({ neck: { romL: 80, romR: 80 }, torso: { sym: 90 } });
    expect(rows.map((r) => r.key)).toEqual(['torso']);
  });

  it('reports the score but no side when the per-side values are missing', () => {
    const [row] = symmetryFindings({ neck: { sym: 90 } });
    expect(row).toMatchObject({ sym: 90, weaker: 'Balanced', gap: null });
  });

  it('survives absent or malformed input', () => {
    expect(symmetryFindings(null)).toEqual([]);
    expect(symmetryFindings('nonsense')).toEqual([]);
    expect(symmetryFindings({})).toEqual([]);
  });
});

describe('the balanced threshold', () => {
  it('is exclusive — a gap AT the threshold names a side', () => {
    const at = symmetryFindings({
      neck: { romL: 50 - BALANCED_WITHIN, romR: 50, stabL: 50 - BALANCED_WITHIN, stabR: 50, sym: 90 },
    })[0];
    expect(at).toMatchObject({ gap: BALANCED_WITHIN, weaker: 'Left' });
  });
});
