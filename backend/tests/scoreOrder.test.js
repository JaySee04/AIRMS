// ONE READING ORDER FOR THE SIX SCORES, ACROSS BOTH PACKAGES.
//
// `utils/periodScores.js` declares the order the six tracked scores are read in:
// HoloMotion's two printed scores first (§21/§50 — Total Score is the headline
// BECAUSE it is the one figure a clinician can check against the PDF in their
// hand), then the three components Total Score is the mean of, then AIRMS's own
// derived indicator last.
//
// The frontend cannot import that file — the two packages are deliberately
// self-contained, because Vercel builds them from different roots (CLAUDE.md,
// "It is a generator and not an npm workspace for a deployment reason"). So the
// order exists as a copy in each place that renders these scores, and copies of
// a decision are this codebase's signature defect. This test is the answer: it
// reads each copy as TEXT and pins its KEY order to the backend's.
//
// THE ORDER IS PINNED EVERYWHERE; THE LABELS ARE PINNED WHERE THE SURFACE IS THE
// SAME. TrendStrip and the Programme Activity panel draw the same six rows from
// the same six numbers on two admin screens, so their wording must match the
// backend's exactly — it did not, and one measure had two names ("Exercise
// risks" / "Exercise Risks", "Indicator" / "Overall indicator"), which is §33's
// band-vocabulary failure in a smaller place.
//
// ScreeningHistory is the exception and it is asserted as one rather than left
// as an absence: its sparkline cells are narrow, so they carry compact labels
// the way `BAND_SHORT` exists alongside `BAND_LABEL`. A test that simply skipped
// it could not tell "deliberately compact" from "drifted".
//
// It is a SOURCE test rather than a rendering one for the same reason
// `athleteDisclosure.test.js` is: these are plain module-level arrays, and
// mounting two React trees to read back six strings is a large brittle
// investment to assert an ordering that is right there in the file. The
// BEHAVIOUR that the renderers do not re-sort is asserted separately and
// properly — `pdfDraw.test.js` reads the drawn rows off the page, and
// `Charts.test.tsx` reads them out of the rendered markup.
const fs = require('fs');
const path = require('path');
const { PERIOD_SCORES } = require('../src/utils/periodScores');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'src');

const EXPECTED = PERIOD_SCORES.map(([k]) => k);

/**
 * Pull one array literal's entries out of a source file, in declaration order.
 *
 * Anchored on the constant's name and stopped at its own closing bracket, so a
 * later array in the same file cannot contribute entries. Returns `{ key, label }`
 * per entry; the caller asserts it found the right NUMBER before comparing
 * anything, because a scan that matches nothing otherwise reports a perfect
 * empty agreement — the exact shape of SILENT_FAILURES 3l.
 */
function entriesOf(file, constName) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf(constName);
  expect(start).toBeGreaterThanOrEqual(0); // the constant still exists
  const open = src.indexOf('[', src.indexOf('=', start));
  expect(open).toBeGreaterThanOrEqual(0);
  // Bracket-balanced, because every entry is itself a `[...]` or `{...}`.
  let depth = 0; let end = -1;
  for (let i = open; i < src.length; i += 1) {
    const c = src[i];
    if (c === '[') depth += 1;
    else if (c === ']') { depth -= 1; if (depth === 0) { end = i; break; } }
  }
  expect(end).toBeGreaterThan(open);
  const body = src.slice(open + 1, end);

  // Two shapes in use: `['totalScore', 'Total Score', true]` (TrendStrip) and
  // `{ key: 'totalScore', label: 'Total', ... }` (ScreeningHistory). Split on
  // top-level entry boundaries first, so a key and a label cannot be paired
  // across two different entries.
  const entries = [];
  let d = 0; let from = -1;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '[' || c === '{') { if (d === 0) from = i + 1; d += 1; }
    else if (c === ']' || c === '}') { d -= 1; if (d === 0) entries.push(body.slice(from, i)); }
  }

  return entries.map((e) => {
    const quoted = [...e.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    const labelled = e.match(/label:\s*'([^']*)'/);
    const keyed = e.match(/key:\s*'([^']*)'/);
    return {
      // Positional for the tuple form, named for the object form.
      key: keyed ? keyed[1] : quoted[0],
      label: labelled ? labelled[1] : quoted[1],
    };
  }).filter((x) => x.key !== undefined);
}

describe('the six tracked scores are read in one order everywhere', () => {
  it('is headline-first: the printed scores, then the components, then ours', () => {
    // Spelled out rather than derived, so a reordering of periodScores.js is a
    // decision somebody has to make here too rather than something this suite
    // silently ratifies.
    expect(EXPECTED).toEqual([
      'totalScore', 'exerciseRisks', 'rom', 'stability', 'symmetry', 'overallIndicator',
    ]);
  });

  it('exercise risks is still the only inverted score', () => {
    // The order moved it to second; the orientation that makes every change
    // chart honest must not have travelled with it.
    const inverted = PERIOD_SCORES.filter(([, , higherBetter]) => higherBetter === false);
    expect(inverted.map(([k]) => k)).toEqual(['exerciseRisks']);
  });

  const copies = [
    ['TrendStrip.tsx', path.join(FRONTEND, 'components', 'admin', 'TrendStrip.tsx'), 'COMPARED_METRICS'],
    ['ScreeningHistory.tsx', path.join(FRONTEND, 'components', 'dashboard', 'ScreeningHistory.tsx'), 'TREND_COLS'],
  ];

  it.each(copies)('%s: %s keys match the backend order', (_name, file, constName) => {
    const found = entriesOf(file, constName);
    // The floor first. Without it an unparseable list reports [] and [] would
    // never equal EXPECTED — but a list that lost ONE entry would still fail
    // only on length, and a scan that found none would fail with a message
    // that reads like a reordering rather than like a broken scan.
    expect(found).toHaveLength(EXPECTED.length);
    expect(found.map((e) => e.key)).toEqual(EXPECTED);
  });

  // The full-width surface: TrendStrip's change chart and the one on
  // /admin/activity are the same six rows off the same six numbers, drawn on
  // two admin screens. They must say the same words.
  it('TrendStrip words the six scores exactly as the backend does', () => {
    const found = entriesOf(path.join(FRONTEND, 'components', 'admin', 'TrendStrip.tsx'), 'COMPARED_METRICS');
    expect(found).toHaveLength(PERIOD_SCORES.length);
    expect(found.map((e) => e.label)).toEqual(PERIOD_SCORES.map(([, label]) => label));
  });

  // HoloMotion's own spelling for its own two scores, asserted rather than
  // assumed: §21 rests on a clinician being able to lay the screen beside the
  // printed report, which reads worse if AIRMS renames the line.
  it('spells the two printed scores as the report prints them', () => {
    const label = Object.fromEntries(PERIOD_SCORES.map(([k, l]) => [k, l]));
    expect(label.totalScore).toBe('Total Score');
    expect(label.exerciseRisks).toBe('Exercise Risks');
  });

  // The compact surface, asserted AS an exception. Without this the suite could
  // not tell "deliberately short, because the cell is narrow" from "drifted".
  it('ScreeningHistory is compact ON PURPOSE, and each short form is named here', () => {
    const found = entriesOf(path.join(FRONTEND, 'components', 'dashboard', 'ScreeningHistory.tsx'), 'TREND_COLS');
    expect(found).toHaveLength(PERIOD_SCORES.length);
    // Named, not inferred. A rule like "must be shorter than the full wording"
    // would wave through a RENAME ("Injury Risk" is shorter than "Exercise
    // Risks"), which is the drift this exists to stop. Changing any of these
    // means changing it here too, deliberately.
    expect(Object.fromEntries(found.map((e) => [e.key, e.label]))).toEqual({
      totalScore: 'Total',
      exerciseRisks: 'Ex. Risks',
      rom: 'ROM',
      stability: 'Stability',
      symmetry: 'Symmetry',
      overallIndicator: 'Indicator',
    });
    // ...and each really is a shortening of the full wording, so this list
    // cannot quietly become a second vocabulary rather than an abbreviation of
    // the first (§33: one clinical measure, one name).
    const full = Object.fromEntries(PERIOD_SCORES.map(([k, l]) => [k, l]));
    found.forEach((e) => expect(e.label.length).toBeLessThanOrEqual(full[e.key].length));
  });
});
