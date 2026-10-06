// The two transforms that turn a squad aggregate into a body figure.
//
// §130.2 reported this file as having no test of its own and flagged it rather
// than skipping it silently. This is that debt paid. A pure function extracted
// for the explicit purpose of NOT DRIFTING should pin its own contract — the two
// dashboards exercise it, but they exercise it the same way, so a change that
// broke both identically would still look green on both.
//
// Both functions encode a DECISION, and in each case the wrong answer is the
// plausible one. That is what these cases are about, not the mapping.

import { squadFlags, squadSubitems } from './squadFigure';

describe('squadFlags', () => {
  it("marks every entry side 'B', because the count carries no side", () => {
    // utils/muscleHotspots.js merges left and right at group level on purpose:
    // "how many athletes have an iliopsoas problem" is one per ATHLETE, not one
    // per side. Emitting 'L' or 'R' here would have the figure assert a side the
    // number behind it does not carry — a wrong answer that looks like a right
    // one, which is the defect class this project exists to avoid.
    const out = squadFlags(
      [{ muscle: 'Iliopsoas', count: 9 }],
      [{ muscle: 'Piriformis', count: 6 }],
    );
    expect(out.myodynamia).toEqual([{ muscle: 'Iliopsoas', side: 'B' }]);
    expect(out.tension).toEqual([{ muscle: 'Piriformis', side: 'B' }]);
  });

  it('keeps the two kinds apart', () => {
    // Weak and tight are different findings on the same muscle and the figure
    // paints them differently. Merging them would be invisible on a squad where
    // one list happens to be empty.
    const out = squadFlags(
      [{ muscle: 'Gluteus Maximus', count: 7 }],
      [{ muscle: 'Gluteus Maximus', count: 4 }],
    );
    expect(out.myodynamia).toHaveLength(1);
    expect(out.tension).toHaveLength(1);
  });

  it('drops the COUNT, which the figure cannot draw', () => {
    // Deliberate, and §129 is the decision: the figure shows presence and the
    // ranked list beside it shows magnitude. A `count` arriving on a MuscleEntry
    // would be a silent invitation to encode it as opacity, which §129.1
    // considered and rejected.
    const [first] = squadFlags([{ muscle: 'Sartorius', count: 3 }], []).myodynamia;
    expect(Object.keys(first).sort()).toEqual(['muscle', 'side']);
  });

  it('answers with empty lists, not undefined, when a squad has no flags', () => {
    // BodyMap takes `MuscleEntry[]`. Handing it undefined is a crash on a
    // perfectly ordinary squad — one where nobody was flagged.
    expect(squadFlags(undefined, undefined)).toEqual({ myodynamia: [], tension: [] });
    expect(squadFlags([], [])).toEqual({ myodynamia: [], tension: [] });
  });
});

describe('squadSubitems', () => {
  const matrix = {
    matrix: [
      { key: 'neck', cells: [{ key: 'romL', value: 78 }, { key: 'romR', value: 77.6 }] },
      { key: 'pelvis', cells: [{ key: 'romL', value: 75.3 }, { key: 'romR', value: null }] },
    ],
  };

  it('reshapes the matrix into the per-athlete form BodyMap already reads', () => {
    expect(squadSubitems(matrix)).toEqual({
      neck: { romL: 78, romR: 77.6 },
      pelvis: { romL: 75.3, romR: null },
    });
  });

  it('keeps a null cell NULL rather than coercing it to a number', () => {
    // §54: an unknown value stays unknown. A missing reading turned into 0 is
    // not a blank — it is a number, it gets DRAWN, and 0 reads as one end of the
    // scale on a figure whose whole job is to say where to look.
    const out = squadSubitems(matrix) as unknown as Record<string, Record<string, number | null>>;
    expect(out.pelvis.romR).toBeNull();
    expect(out.pelvis.romR).not.toBe(0);
  });

  it('returns NULL for no matrix, so the mode is absent rather than empty', () => {
    // The distinction this function exists for. An empty object is a truthy
    // prop, so BodyMap would render ROM & Stability mode with no readings behind
    // it — every region painted from nothing. Null removes the mode.
    expect(squadSubitems(null)).toBeNull();
    expect(squadSubitems(undefined)).toBeNull();
    expect(squadSubitems({})).toBeNull();
    expect(squadSubitems({ matrix: [] })).toBeNull();
  });
});
