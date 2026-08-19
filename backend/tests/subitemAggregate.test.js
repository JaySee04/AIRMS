// Aggregating the HoloMotion subitem table (utils/subitemAggregate.js).
//
// Fixtures are the THREE 1:1-verified real reports, not invented numbers, because
// the whole point of this module is to surface what those reports actually
// contain — most importantly the left/right gaps that no dashboard was showing:
// Thung's neck ROM is 95 left against 62 right.

const { aggregateSubitems, asymmetryPct, NOTABLE_GAP_PCT } = require('../src/utils/subitemAggregate');

// [romL, romR, stabL, stabR, sym] → the object shape the extractor stores.
const toSubitems = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [
  k, {
    romL: v[0], romR: v[1], stabL: v[2], stabR: v[3], sym: v[4],
  },
]));

const THUNG = toSubitems({
  neck: [95, 62, 81, 60, 58],
  shoulder: [86, 90, 59, 57, 77],
  torso: [96, 85, 84, 82, 78],
  pelvis: [89, 85, 60, 78, 68],
  lowerLimbs: [90, 90, 72, 74, 92],
});
const NAZWAN = toSubitems({
  neck: [83, 72, 76, 76, 83],
  shoulder: [89, 85, 84, 82, 89],
  torso: [70, 67, 87, 89, 90],
  pelvis: [62, 71, 76, 82, 86],
  lowerLimbs: [66, 68, 76, 79, 91],
});
const ELFFIE = toSubitems({
  neck: [86, 71, 74, 75, 76],
  shoulder: [89, 87, 86, 86, 90],
  torso: [80, 75, 88, 89, 93],
  pelvis: [53, 66, 73, 82, 80],
  lowerLimbs: [60, 61, 80, 73, 79],
});
const ALL = [{ subitems: THUNG }, { subitems: NAZWAN }, { subitems: ELFFIE }];

const region = (a, key) => a.matrix.find((r) => r.key === key);
const cell = (a, key, cellKey) => region(a, key).cells.find((c) => c.key === cellKey);
const gap = (a, key, metric) => a.asymmetry.find((r) => r.key === key).metrics.find((m) => m.metric === metric);

describe('the 5 × 5 matrix', () => {
  it('keeps both axes: five regions, five measures each', () => {
    const a = aggregateSubitems(ALL);
    expect(a.matrix.map((r) => r.key)).toEqual(['neck', 'shoulder', 'torso', 'pelvis', 'lowerLimbs']);
    expect(a.matrix[0].cells.map((c) => c.key)).toEqual(['romL', 'romR', 'stabL', 'stabR', 'sym']);
    expect(a.n).toBe(3);
  });

  it('averages each cell across the cohort', () => {
    const a = aggregateSubitems(ALL);
    // Neck ROM left: (95 + 83 + 86) / 3 = 88
    expect(cell(a, 'neck', 'romL').value).toBe(88);
    // Neck ROM right: (62 + 72 + 71) / 3 = 68.3
    expect(cell(a, 'neck', 'romR').value).toBeCloseTo(68.3, 1);
  });

  it('names the weakest cell, which is what a reader should act on', () => {
    const a = aggregateSubitems(ALL);
    // Pelvis ROM LEFT: (89 + 62 + 53) / 3 = 68.0 — the lowest of all 25 cells,
    // ahead of neck ROM right (68.3) and pelvis stability left (69.7).
    expect(a.worstCell.region).toBe('Pelvis');
    expect(a.worstCell.label).toBe('ROM L');
    expect(a.worstCell.value).toBeCloseTo(68, 1);
    // And it really is the minimum, not merely a low one.
    const every = a.matrix.flatMap((r) => r.cells.map((c) => c.value)).filter((v) => v !== null);
    expect(a.worstCell.value).toBe(Math.min(...every));
  });

  it('counts only the athletes who actually had that cell read', () => {
    const partial = [{ subitems: THUNG }, { subitems: { neck: { romL: 80 } } }];
    const a = aggregateSubitems(partial);
    expect(cell(a, 'neck', 'romL').n).toBe(2);
    // Only Thung has a neck romR reading.
    expect(cell(a, 'neck', 'romR').n).toBe(1);
    expect(cell(a, 'neck', 'romR').value).toBe(62);
  });
});

describe('left–right asymmetry — the bilateral signal nothing else showed', () => {
  it('counts athletes whose sides differ by a full band or more', () => {
    const a = aggregateSubitems(ALL);
    // Neck ROM gaps: Thung 33, Nazwan 11, Elffie 15 — all three are notable.
    expect(gap(a, 'neck', 'rom').notable).toBe(3);
    // Neck stability gaps: 21, 0, 1 — only Thung.
    expect(gap(a, 'neck', 'stab').notable).toBe(1);
  });

  it('reports the mean ABSOLUTE gap, so opposite-sided athletes do not cancel out', () => {
    const a = aggregateSubitems(ALL);
    // |33| + |11| + |15| = 59 / 3 = 19.7 — a cancelling mean would read ~19.7 too
    // here because all three lean the same way, so use a case where they do not:
    const mixed = aggregateSubitems([
      { subitems: toSubitems({ neck: [90, 70, 0, 0, 0] }) }, // +20
      { subitems: toSubitems({ neck: [70, 90, 0, 0, 0] }) }, // -20
    ]);
    expect(mixed.asymmetry.find((r) => r.key === 'neck').metrics[0].meanGap).toBe(20);
    expect(mixed.asymmetry.find((r) => r.key === 'neck').metrics[0].meanSigned).toBe(0);
    expect(a.asymmetry.find((r) => r.key === 'neck').metrics[0].meanGap).toBeCloseTo(19.7, 1);
  });

  it('names the WEAKER side, not the dominant one', () => {
    // The distinction this pins down: all three real athletes score HIGHER on the
    // left at the neck (95/62, 83/72, 86/71), so the weaker side is the RIGHT.
    // The field was called `leans` and returned "right" for exactly this data,
    // which reads as "leans right" — the opposite of the truth.
    expect(gap(aggregateSubitems(ALL), 'neck', 'rom').weakerSide).toBe('right');
    const rightStrong = aggregateSubitems([{ subitems: toSubitems({ neck: [60, 90, 0, 0, 0] }) }]);
    expect(gap(rightStrong, 'neck', 'rom').weakerSide).toBe('left');
  });

  it('claims no side when the squad does not tip', () => {
    // Both directions equally represented → a real gap but no shared side.
    // Calling that a weak side would invent a squad-wide finding out of a mix.
    const mixed = aggregateSubitems([
      { subitems: toSubitems({ neck: [90, 70, 0, 0, 0] }) },
      { subitems: toSubitems({ neck: [70, 90, 0, 0, 0] }) },
    ]);
    expect(gap(mixed, 'neck', 'rom').weakerSide).toBeNull();
  });

  it('names the most asymmetric region/metric across the whole table', () => {
    const a = aggregateSubitems(ALL);
    expect(a.worstAsymmetry.region).toBe('Neck');
    expect(a.worstAsymmetry.metric).toBe('rom');
  });

  it('flags a difference by its PERCENTAGE, not its raw points', () => {
    // 10 points — wider than the narrowest of the instrument's own 60/75/85
    // bands, so the two sides would not be described by the same word.
    expect(NOTABLE_GAP_PCT).toBe(10);
    // Expressed as a PERCENTAGE of the better side, the way the inter-limb
    // asymmetry literature states it. As raw points, 80-vs-70 (12.5% in a strong
    // limb) and 40-vs-30 (25% in a weak one) counted identically.
    expect(asymmetryPct(80, 70)).toBeCloseTo(12.5, 1);
    expect(asymmetryPct(40, 30)).toBeCloseTo(25.0, 1);
    expect(asymmetryPct(70, 80)).toBeCloseTo(12.5, 1); // order-independent
    expect(asymmetryPct(80, 80)).toBe(0);
    // Refuses to divide by nothing rather than returning a misleading 0 or NaN.
    expect(asymmetryPct(0, 0)).toBeNull();
    expect(asymmetryPct(null, 70)).toBeNull();
    expect(asymmetryPct(70, null)).toBeNull();
    // The boundary is now 10% OF THE BETTER SIDE, so at 80 it falls at 8 points.
    const justUnder = aggregateSubitems([{ subitems: toSubitems({ neck: [80, 73, 0, 0, 0] }) }]);
    const justOver = aggregateSubitems([{ subitems: toSubitems({ neck: [80, 72, 0, 0, 0] }) }]);
    expect(gap(justUnder, 'neck', 'rom').notable).toBe(0); // 7 pts = 8.75%
    expect(gap(justOver, 'neck', 'rom').notable).toBe(1);  // 8 pts = 10.0%

    // The whole point of the change, stated as a test: a SMALLER absolute gap in a
    // weak limb now flags where a LARGER gap in a strong limb does not. Under the
    // old points rule this was backwards — both of these counted the same way.
    const weakLimb = aggregateSubitems([{ subitems: toSubitems({ neck: [40, 36, 0, 0, 0] }) }]);
    const strongLimb = aggregateSubitems([{ subitems: toSubitems({ neck: [95, 88, 0, 0, 0] }) }]);
    expect(gap(weakLimb, 'neck', 'rom').notable).toBe(1);   // 4 pts, but 10.0%
    expect(gap(strongLimb, 'neck', 'rom').notable).toBe(0); // 7 pts, only 7.4%

    // And the percentage travels with the payload, beside the raw points the
    // printed HoloMotion table shows.
    expect(gap(justOver, 'neck', 'rom').meanGapPct).toBeCloseTo(10.0, 1);
    expect(gap(justOver, 'neck', 'rom').meanGap).toBeCloseTo(8, 1);
  });
});

describe('degenerate input', () => {
  it('returns a usable empty shape rather than throwing', () => {
    for (const input of [[], null, undefined, [{}], [{ subitems: null }]]) {
      const a = aggregateSubitems(input);
      expect(a.n).toBe(0);
      expect(a.matrix).toHaveLength(5);
      expect(a.worstCell).toBeNull();
      expect(a.worstAsymmetry).toBeNull();
    }
  });

  it('skips a side that was not read instead of treating it as zero', () => {
    // A missing right reading must not become a 90-point gap.
    const a = aggregateSubitems([{ subitems: { neck: { romL: 90, romR: null } } }]);
    expect(gap(a, 'neck', 'rom').n).toBe(0);
    expect(gap(a, 'neck', 'rom').meanGap).toBeNull();
  });
});
