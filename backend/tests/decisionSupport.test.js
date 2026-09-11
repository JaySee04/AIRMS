// The worklist ranking — and the clinical refusals built into it.
//
// This module orders who a clinician sees next, so its failure mode is not a
// crash: it is a defensible-looking list with the wrong athlete at the top, or
// a reassuring one that has quietly buried somebody. Every test here pins a
// decision rather than an implementation detail.

const {
  rankRoster, changesSince, headline, PRIORITY,
} = require('../src/utils/decisionSupport');

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const athlete = (id, name, over = {}) => ({ athleteId: id, name, ...over });
const screening = (band, ageDays, over = {}) => ({
  assessedAt: daysAgo(ageDays), overallBand: band, factors: [], ...over,
});

describe('ordering', () => {
  it('puts the worst band first, regardless of how recent it is', () => {
    // The question is "who needs a clinician", not "whose record is oldest".
    const out = rankRoster([
      athlete('a', 'Amber Ancient', { screening: screening('amber', 300) }),
      athlete('b', 'Red Yesterday', { screening: screening('red', 1) }),
    ], { dueDays: 180 });
    expect(out.map((r) => r.name)).toEqual(['Red Yesterday', 'Amber Ancient']);
  });

  it('breaks ties on staleness — oldest information first', () => {
    const out = rankRoster([
      athlete('a', 'Fresh', { screening: screening('amber', 5) }),
      athlete('b', 'Stale', { screening: screening('amber', 200) }),
    ], { dueDays: 180 });
    expect(out.map((r) => r.name)).toEqual(['Stale', 'Fresh']);
  });

  it('RANKS NEVER-SCREENED ABOVE GREEN, and never as a band', () => {
    // The §33 reassurance failure, applied to a worklist: an athlete nobody has
    // assessed is UNKNOWN, not low risk. Sorting them below green would bury
    // the people the programme has never looked at.
    const out = rankRoster([
      athlete('g', 'Screened Green', { screening: screening('green', 5) }),
      athlete('n', 'Never Assessed'),
    ], { dueDays: 180 });
    expect(out.map((r) => r.name)).toEqual(['Never Assessed', 'Screened Green']);
    expect(out[0].band).toBe('never');
    // 'never' must not be one of the clinical bands.
    expect(['green', 'amber', 'red']).not.toContain(out[0].band);
    expect(PRIORITY.never).toBeLessThan(PRIORITY.green);
  });

  it('honours a clinician override over the computed band', () => {
    // An override is a clinician's decision after seeing the athlete. A worklist
    // that ignored it would keep handing them back somebody they have cleared.
    const out = rankRoster([
      athlete('a', 'Computed Red, Cleared', { screening: screening('red', 10, { overrideBand: 'green' }) }),
      athlete('b', 'Plain Amber', { screening: screening('amber', 10) }),
    ], { dueDays: 180 });
    expect(out.map((r) => r.name)).toEqual(['Plain Amber', 'Computed Red, Cleared']);
  });
});

describe('reasons', () => {
  it('uses the screening\'s OWN factors, not an invented explanation', () => {
    const out = rankRoster([
      athlete('a', 'X', { screening: screening('red', 10, { factors: ['knee z=+1.8', 'below cohort mean'] }) }),
    ], { dueDays: 180 });
    expect(out[0].reasons).toEqual(expect.arrayContaining(['knee z=+1.8', 'below cohort mean']));
  });

  it('says so plainly when an athlete has never been screened', () => {
    const out = rankRoster([athlete('n', 'N')], { dueDays: 180 });
    expect(out[0].reasons).toEqual(['never screened — no assessment on record']);
  });

  it('names the override when one is in force', () => {
    const out = rankRoster([
      athlete('a', 'X', { screening: screening('red', 10, { overrideBand: 'amber' }) }),
    ], { dueDays: 180 });
    expect(out[0].reasons.join(' ')).toMatch(/override in force \(amber\)/);
  });

  it('adds recall state when the screening has aged out', () => {
    const out = rankRoster([
      athlete('a', 'X', { screening: screening('amber', 400) }),
    ], { dueDays: 180 });
    expect(out[0].reasons.join(' ')).toMatch(/overdue for rescreen/);
  });

  it('never leaves an entry unexplained', () => {
    // An unexplained row on a clinical worklist is an instruction without a
    // reason, which is the thing a clinician is entitled to refuse.
    const out = rankRoster([
      athlete('a', 'X', { screening: screening('amber', 5, { factors: [] }) }),
    ], { dueDays: 180 });
    expect(out[0].reasons.length).toBeGreaterThan(0);
  });

  it('does not require a rescreen interval to work', () => {
    // dueDays is an institution setting; if it is unset the list must still
    // rank rather than throwing or silently returning nothing.
    const out = rankRoster([athlete('a', 'X', { screening: screening('red', 10) })]);
    expect(out).toHaveLength(1);
    expect(out[0].recall).toBeNull();
  });
});

describe('headline', () => {
  it('returns null when there is nothing to act on', () => {
    // Deliberate: the panel disappears rather than printing "0 need attention",
    // which reads as an all-clear the screening cannot certify (§33).
    const out = rankRoster([athlete('g', 'G', { screening: screening('green', 5) })], { dueDays: 180 });
    expect(headline(out, 'medical')).toBeNull();
  });

  it('counts the three actionable groups separately', () => {
    const out = rankRoster([
      athlete('r', 'R', { screening: screening('red', 5) }),
      athlete('a', 'A', { screening: screening('amber', 5) }),
      athlete('n', 'N'),
      athlete('g', 'G', { screening: screening('green', 5) }),
    ], { dueDays: 180 });
    const h = headline(out, 'medical');
    expect(h.count).toBe(3); // green excluded
    expect(h.parts.join(' | ')).toMatch(/1 needing immediate assessment/);
    expect(h.parts.join(' | ')).toMatch(/1 never screened/);
  });

  it('speaks to the role — a coach selects, a clinician sees', () => {
    const out = rankRoster([athlete('r', 'R', { screening: screening('red', 5) })], { dueDays: 180 });
    expect(headline(out, 'medical').verb).toBe('See next');
    expect(headline(out, 'coach').verb).toBe('Review before selecting');
  });
});

describe('what changed', () => {
  const pair = (id, name, from, to, ageDays) => ({
    athleteId: id,
    name,
    previous: from ? { assessedAt: daysAgo(ageDays + 90), overallBand: from } : null,
    latest: { assessedAt: daysAgo(ageDays), overallBand: to },
  });

  it('lists worsening before improving', () => {
    const out = changesSince([
      pair('a', 'Improved', 'red', 'green', 2),
      pair('b', 'Worsened', 'green', 'red', 2),
    ], { windowDays: 7 });
    expect(out.map((c) => c.name)).toEqual(['Worsened', 'Improved']);
    expect(out[0].direction).toBe('worse');
  });

  it('ignores anything outside the window', () => {
    const out = changesSince([pair('a', 'Old news', 'green', 'red', 60)], { windowDays: 7 });
    expect(out).toEqual([]);
  });

  it('reports a first screening as new, not as an improvement', () => {
    const out = changesSince([pair('a', 'First', null, 'amber', 1)], { windowDays: 7 });
    expect(out[0].direction).toBe('new');
    expect(out[0].from).toBeNull();
  });

  it('says nothing when the band did not move', () => {
    const out = changesSince([pair('a', 'Same', 'amber', 'amber', 1)], { windowDays: 7 });
    expect(out).toEqual([]);
  });

  it('applies the override when deciding what the band became', () => {
    const out = changesSince([{
      athleteId: 'a',
      name: 'Cleared',
      previous: { assessedAt: daysAgo(90), overallBand: 'red' },
      latest: { assessedAt: daysAgo(1), overallBand: 'red', overrideBand: 'green' },
    }], { windowDays: 7 });
    expect(out[0].to).toBe('green');
    expect(out[0].direction).toBe('better');
  });

  it('survives an empty or missing input', () => {
    expect(changesSince([])).toEqual([]);
    expect(changesSince(null)).toEqual([]);
  });
});
