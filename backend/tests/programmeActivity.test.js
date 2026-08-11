// Programme Activity data gathering (utils/programmeActivity.js).
//
// Extracted from routes/athletes.js so the page and the downloadable KPI PDF read
// from ONE function — two paths computing "the programme's KPIs" would be free to
// disagree, and the PDF is the artefact that gets filed or signed off.
//
// Tested here: the scope sentence (it goes on the PDF cover AND into the
// filename, so a saved report says what it covers), grain validation, and the
// empty-roster path — which the report has to survive, because "no athletes match
// these filters" is a normal thing for an admin to ask for.

jest.mock('../src/models', () => ({
  Screening: { findAll: jest.fn() },
  Athlete: { findAll: jest.fn() },
  AthleteDiscipline: { findAll: jest.fn() },
}));

const { Athlete, Screening, AthleteDiscipline } = require('../src/models');
const { programmeActivityData, scopeLabel } = require('../src/utils/programmeActivity');

beforeEach(() => {
  jest.clearAllMocks();
  Athlete.findAll.mockResolvedValue([]);
  Screening.findAll.mockResolvedValue([]);
  AthleteDiscipline.findAll.mockResolvedValue([]);
});

describe('scopeLabel', () => {
  it('says so plainly when nothing is filtered', () => {
    expect(scopeLabel({})).toBe('Whole institute, all time');
  });

  it('reads as a sentence, in a stable order', () => {
    expect(scopeLabel({
      sport: 'Badminton', program: 'PODIUM', gender: 'Male', discipline: "Men's Singles",
    })).toBe("Badminton · PODIUM · Male · Men's Singles");
  });

  it('renders an open-ended age range without pretending to a bound', () => {
    expect(scopeLabel({ ageMin: 18 })).toBe('age 18-+');
    expect(scopeLabel({ ageMax: 23 })).toBe('age 0-23');
  });

  it('includes the date window, since coverage is measured against it', () => {
    // An admin reading "58 of 62 tested" needs to know it means "in this window".
    expect(scopeLabel({ from: '2026-01-01', to: '2026-06-30' }))
      .toBe('from 2026-01-01 to 2026-06-30');
    expect(scopeLabel({ from: '2026-01-01' })).toBe('from 2026-01-01');
  });
});

describe('programmeActivityData', () => {
  it('rejects an unknown grain with a 400-able error', async () => {
    // The PDF route turns err.status into the response code; without this the
    // report would render an empty "Quarterly" document for a typo.
    await expect(programmeActivityData({ grain: 'fortnight' })).rejects.toThrow(/grain must be one of/);
    await programmeActivityData({ grain: 'fortnight' }).catch((e) => expect(e.status).toBe(400));
  });

  it.each(['month', 'quarter', 'year'])('accepts grain %s', async (grain) => {
    const d = await programmeActivityData({ grain });
    expect(d.grain).toBe(grain);
  });

  it('returns a usable empty shape when no athlete matches the filters', async () => {
    const d = await programmeActivityData({ sport: 'Sepak Takraw' });
    expect(d.coverage).toEqual({ rostered: 0, tested: 0, untested: 0, tests: 0 });
    expect(d.periods).toEqual([]);
    expect(d.betweenTests).toBeNull();
    expect(d.scope).toBe('Sepak Takraw');
    // No roster means no point querying screenings at all.
    expect(Screening.findAll).not.toHaveBeenCalled();
  });

  it('counts coverage against the roster, and tests against the window', async () => {
    Athlete.findAll.mockResolvedValue([{ athleteId: 'a' }, { athleteId: 'b' }, { athleteId: 'c' }]);
    Screening.findAll.mockResolvedValue([
      { id: 1, athleteId: 'a', assessedAt: '2026-02-01', totalScore: 70, overallBand: 'green' },
      { id: 2, athleteId: 'a', assessedAt: '2026-05-01', totalScore: 74, overallBand: 'green' },
      { id: 3, athleteId: 'b', assessedAt: '2026-05-02', totalScore: 66, overallBand: 'amber' },
    ]);
    const d = await programmeActivityData({});
    // 3 tests across 2 distinct athletes, on a roster of 3 → one never tested.
    expect(d.coverage).toEqual({ rostered: 3, tested: 2, untested: 1, tests: 3 });
  });

  it('narrows the roster by discipline before touching screenings', async () => {
    AthleteDiscipline.findAll.mockResolvedValue([{ athleteId: 'b' }]);
    Athlete.findAll.mockResolvedValue([{ athleteId: 'b' }]);
    Screening.findAll.mockResolvedValue([]);
    const d = await programmeActivityData({ discipline: "Men's Singles" });
    expect(AthleteDiscipline.findAll).toHaveBeenCalledTimes(1);
    expect(d.coverage.rostered).toBe(1);
    expect(d.scope).toContain("Men's Singles");
  });

  it('carries the periods/betweenTests/seasonality that screeningPeriods produces', async () => {
    Athlete.findAll.mockResolvedValue([{ athleteId: 'a' }]);
    Screening.findAll.mockResolvedValue([
      { id: 1, athleteId: 'a', assessedAt: '2026-02-01', totalScore: 70, overallBand: 'green' },
      { id: 2, athleteId: 'a', assessedAt: '2026-05-01', totalScore: 76, overallBand: 'green' },
    ]);
    const d = await programmeActivityData({ grain: 'quarter' });
    expect(d.periods).toHaveLength(2);
    expect(d.betweenTests.pairs).toBe(1);
    // Seasonality rides along so the report does not have to recompute it.
    expect(d.seasonality.buckets).toHaveLength(4);
  });
});
