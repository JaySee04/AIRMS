// Screening compliance, squad by squad (§104).
//
// The framing is the thing under guard as much as the arithmetic. This panel
// answers "which squads are keeping up with screening" and NOT "which squads
// have the most cooperative athletes" — a screening happens only when ISN
// schedules it, the coach releases the athlete, the athlete attends and the
// report is imported, and nothing in this dataset separates those.

const { sportCompliance, MIN_SQUAD } = require('../src/utils/sportCompliance');

const a = (sport, status, ageDays, athleteId) => ({
  sport, status, ageDays, athleteId,
});

describe('grouping', () => {
  it('counts each athlete into exactly one squad', () => {
    const r = sportCompliance([
      a('Badminton', 'current', 10, 'b1'),
      a('Badminton', 'overdue', 300, 'b2'),
      a('Hockey', 'current', 5, 'h1'),
    ], new Map());
    expect(r.sports.map((s) => s.sport).sort()).toEqual(['Badminton', 'Hockey']);
    expect(r.sports.reduce((n, s) => n + s.rostered, 0)).toBe(3);
  });

  it('puts an athlete with NO sport into no squad at all', () => {
    // Not into an "Unknown" bucket: a made-up squad would appear in the ranking
    // beside real ones and invite comparison against them.
    const r = sportCompliance([
      a('Hockey', 'current', 5, 'h1'),
      a(null, 'current', 5, 'x1'),
      a(undefined, 'never', null, 'x2'),
    ], new Map());
    expect(r.sports).toHaveLength(1);
    expect(r.sports[0].rostered).toBe(1);
  });

  it('survives null rows', () => {
    // A KPI must never be the reason a dashboard fails to load.
    expect(() => sportCompliance([null, undefined, a('Hockey', 'current', 1, 'h')], new Map()))
      .not.toThrow();
  });
});

describe('the states are kept apart', () => {
  it('separates never-screened from overdue', () => {
    // A first assessment is a different action from a call-back, and collapsing
    // them is the §33 reassurance failure in the other direction.
    const r = sportCompliance([
      a('Hockey', 'never', null, 'h1'),
      a('Hockey', 'overdue', 400, 'h2'),
    ], new Map());
    expect(r.sports[0]).toMatchObject({ never: 1, overdue: 1, screened: 1, rostered: 2 });
  });

  it('counts due-soon APART from current, exactly as rescreenRecall does', () => {
    // The first version of this test asserted the opposite — that due-soon rolls
    // into `current` — and the code was right and the test was wrong.
    //
    // The property that matters is not which bucket is prettier, it is that a
    // squad's slice uses the SAME four states as the institution-wide totals
    // above it. rescreenRecall branches never / overdue / due-soon / else, and
    // this must branch identically, or a sport's numbers would not sum to the
    // figures it is displayed beneath. The rescreen reminder is built on that
    // same one-computation-sliced rule.
    const r = sportCompliance([
      a('Hockey', 'current', 10, 'h1'),
      a('Hockey', 'due-soon', 150, 'h2'),
    ], new Map());
    expect(r.sports[0].current).toBe(1);
    expect(r.sports[0].dueSoon).toBe(1);
    expect(r.sports[0].currentShare).toBe(0.5);
  });

  it('every athlete lands in exactly one of the four states', () => {
    // The real guard behind the case above: a state that fell through every
    // branch would silently vanish from the squad's totals while still counting
    // toward `rostered`, so the shares would quietly stop summing.
    const r = sportCompliance([
      a('Hockey', 'current', 10, 'h1'),
      a('Hockey', 'due-soon', 150, 'h2'),
      a('Hockey', 'overdue', 400, 'h3'),
      a('Hockey', 'never', null, 'h4'),
    ], new Map());
    const s = r.sports[0];
    expect(s.current + s.dueSoon + s.overdue + s.never).toBe(s.rostered);
  });
});

describe('shares, not counts', () => {
  it('ranks on SHARE so squad size does not decide the order', () => {
    // Badminton has more current athletes in absolute terms and a worse share.
    // Ranking on the count would sort by squad size and call it compliance —
    // the same mistake §71 avoids by ranking seasonality on share.
    const r = sportCompliance([
      ...Array.from({ length: 4 }, (_, i) => a('Badminton', 'current', 10, `b${i}`)),
      ...Array.from({ length: 6 }, (_, i) => a('Badminton', 'overdue', 300, `bo${i}`)),
      ...Array.from({ length: 3 }, (_, i) => a('Hockey', 'current', 10, `h${i}`)),
    ], new Map());
    expect(r.sports[0].sport).toBe('Badminton');
    expect(r.sports[0].current).toBeGreaterThan(r.sports[1].current);
    expect(r.sports[0].currentShare).toBeLessThan(r.sports[1].currentShare);
  });

  it('orders worst first', () => {
    const r = sportCompliance([
      a('Good', 'current', 5, 'g1'),
      a('Bad', 'overdue', 400, 'x1'),
    ], new Map());
    expect(r.sports.map((s) => s.sport)).toEqual(['Bad', 'Good']);
  });
});

describe('the repeat rate', () => {
  it('is a share of those EVER SCREENED, not of the roster', () => {
    // Asking what share of an unscreened squad came back twice is a question
    // with no meaning, and dividing by the roster would punish a squad for
    // athletes who have not had a first assessment yet.
    const r = sportCompliance([
      a('Hockey', 'current', 10, 'h1'),
      a('Hockey', 'current', 10, 'h2'),
      a('Hockey', 'never', null, 'h3'),
      a('Hockey', 'never', null, 'h4'),
    ], new Map([['h1', 2], ['h2', 1]]));
    expect(r.sports[0].screened).toBe(2);
    expect(r.sports[0].repeat).toBe(1);
    expect(r.sports[0].repeatShare).toBe(0.5);
  });

  it('is null, not 0, for a squad nobody has screened', () => {
    // 0% would rank an unscreened squad as the worst returner, which describes
    // nothing that happened.
    const r = sportCompliance([a('Hockey', 'never', null, 'h1')], new Map());
    expect(r.sports[0].repeatShare).toBeNull();
    expect(r.sports[0].coverage).toBe(0);
  });
});

describe('small squads', () => {
  it('marks a squad below the floor rather than dropping it', () => {
    // A squad omitted from a comparison is a squad nobody asks about.
    const r = sportCompliance(
      Array.from({ length: MIN_SQUAD - 1 }, (_, i) => a('Tiny', 'current', 5, `t${i}`)),
      new Map(),
    );
    expect(r.sports).toHaveLength(1);
    expect(r.sports[0].small).toBe(true);
  });

  it('does not mark a squad at the floor', () => {
    const r = sportCompliance(
      Array.from({ length: MIN_SQUAD }, (_, i) => a('Ok', 'current', 5, `o${i}`)),
      new Map(),
    );
    expect(r.sports[0].small).toBe(false);
  });
});

describe('the caveat', () => {
  it('travels in the PAYLOAD, so no surface can draw the table without it', () => {
    const r = sportCompliance([a('Hockey', 'current', 5, 'h1')], new Map());
    expect(typeof r.caveat).toBe('string');
    expect(r.caveat.length).toBeGreaterThan(40);
  });

  it('says the measure cannot separate scheduling from attendance', () => {
    // THE point. Without this sentence the table reads as a league table of
    // athlete cooperation, which the data cannot support.
    const r = sportCompliance([], new Map());
    expect(r.caveat).toMatch(/schedul/i);
    expect(r.caveat).toMatch(/cannot separate|never booked/i);
  });

  it('never claims to measure cooperation or compliance of PEOPLE', () => {
    const r = sportCompliance([], new Map());
    expect(r.caveat).not.toMatch(/cooperat|lazy|willing|attitude/i);
  });
});
