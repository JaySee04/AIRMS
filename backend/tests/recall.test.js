// Whether what we hold on an athlete is still current (utils/recall.js).
//
// This rule was inline in `rescreenRecall`, a DB-backed roster aggregate. The
// dashboards needed the same answer for ONE athlete, and the failure mode of
// copying it is specific: the hero calls an athlete current while the monthly
// recall email calls them overdue. Extracting it means there is one rule; these
// tests pin the boundary so the extraction cannot have moved anybody.

const { screeningAgeDays, recallState, RECALL_LABEL, DUE_SOON_SHARE } = require('../src/utils/recall');

const DAY = 86400000;
const now = Date.UTC(2026, 7, 19); // 2026-08-19

describe('screeningAgeDays', () => {
  it('counts whole days back to the assessment', () => {
    expect(screeningAgeDays(new Date(now - 10 * DAY).toISOString(), now)).toBe(10);
    expect(screeningAgeDays(new Date(now).toISOString(), now)).toBe(0);
  });

  it('never reports a negative age for a future date', () => {
    // A mistyped import date must not read as "screened in 30 days".
    expect(screeningAgeDays(new Date(now + 30 * DAY).toISOString(), now)).toBe(0);
  });

  it('returns null rather than 0 when there is no usable date', () => {
    // Null means "we do not know"; 0 would mean "screened today".
    for (const bad of [null, undefined, '', 'not-a-date']) {
      expect(screeningAgeDays(bad, now)).toBeNull();
    }
  });
});

describe('recallState', () => {
  const DUE = 180;

  // The boundary rescreenRecall already applied was `ageDays >= dueDays`. If the
  // extraction had used `>` instead, every athlete sitting exactly on the
  // interval would silently move from overdue to current — a change the recall
  // email would report and the dashboard would not.
  it('treats the interval boundary as overdue, matching the original rule', () => {
    expect(recallState(DUE - 1, DUE)).not.toBe('overdue');
    expect(recallState(DUE, DUE)).toBe('overdue');
    expect(recallState(DUE + 1, DUE)).toBe('overdue');
  });

  it('warns in the last fifth of the interval', () => {
    const soon = DUE * DUE_SOON_SHARE; // 144
    expect(recallState(soon - 1, DUE)).toBe('current');
    expect(recallState(soon, DUE)).toBe('due-soon');
    expect(recallState(DUE - 1, DUE)).toBe('due-soon');
  });

  it('counts "never screened" apart from "overdue"', () => {
    // Not an extreme of overdue: it calls for a first assessment, not a
    // call-back, and the recall email lists the two separately for that reason.
    expect(recallState(null, DUE)).toBe('never');
    expect(recallState(undefined, DUE)).toBe('never');
    expect(recallState(9999, DUE)).toBe('overdue');
  });

  it('does not invent an interval when none is configured', () => {
    // A missing or nonsensical setting must not make every athlete overdue.
    for (const bad of [null, undefined, 0, -30, NaN, 'x']) {
      expect(recallState(500, bad)).toBe('current');
    }
  });

  it('names every state it can return', () => {
    const states = ['current', 'due-soon', 'overdue', 'never'];
    for (const st of states) expect(RECALL_LABEL[st]).toBeTruthy();
    expect(Object.keys(RECALL_LABEL).sort()).toEqual([...states].sort());
    // The wording must not call the athlete safe or cleared — it describes only
    // whether the DATA is current, which is a different claim from the band.
    for (const st of states) expect(RECALL_LABEL[st]).not.toMatch(/safe|cleared|fit/i);
  });
});
