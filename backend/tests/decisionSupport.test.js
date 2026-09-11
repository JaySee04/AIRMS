// The worklist ranking — and the clinical refusals built into it.
//
// This module orders who a clinician sees next, so its failure mode is not a
// crash: it is a defensible-looking list with the wrong athlete at the top, or
// a reassuring one that has quietly buried somebody. Every test here pins a
// decision rather than an implementation detail.

const {
  rankRoster, changesSince, resolveCutoff, headline, PRIORITY, MAX_LOOKBACK_MS,
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

// "Since you last looked", with the marker held by the CALLER.
//
// It is the caller's because storing it server-side is a write and `coach` is
// read-only by a locked decision — so these tests pin the properties that make
// accepting a client-supplied timestamp safe, and the failure directions that
// keep a bad one from hiding a clinical change.
describe('the caller-held "since" marker', () => {
  const NOW = Date.parse('2026-09-11T00:00:00.000Z');
  const ago = (days) => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

  it('honours the caller\'s marker over the window', () => {
    const { cutoff, basis } = resolveCutoff({ windowDays: 7, since: ago(30), now: NOW });
    expect(basis).toBe('since');
    expect(cutoff).toBe(Date.parse(ago(30)));
  });

  it('reaches further back than the window when asked to', () => {
    // The point of the feature: a reader away for a fortnight still sees the
    // fortnight, where the 7-day window would have silently dropped half of it.
    const pairs = [
      { athleteId: 'a', name: 'Recent', previous: { assessedAt: ago(99), overallBand: 'green' }, latest: { assessedAt: ago(2), overallBand: 'red' } },
      { athleteId: 'b', name: 'Older', previous: { assessedAt: ago(99), overallBand: 'green' }, latest: { assessedAt: ago(14), overallBand: 'red' } },
    ];
    expect(changesSince(pairs, { windowDays: 7, now: NOW }).map((c) => c.name)).toEqual(['Recent']);
    expect(changesSince(pairs, { windowDays: 7, since: ago(30), now: NOW }).map((c) => c.name))
      .toEqual(['Recent', 'Older']);
  });

  it('CLAMPS a stale marker to the 90-day floor rather than reading everything', () => {
    // A browser store that has sat untouched for two years must not turn one
    // request into a full-history scan.
    const { cutoff, basis } = resolveCutoff({ since: ago(900), now: NOW });
    expect(basis).toBe('clamped');
    expect(cutoff).toBe(NOW - MAX_LOOKBACK_MS);
  });

  it('falls back to the window on a garbage marker instead of throwing or emptying', () => {
    // The failure direction matters: a corrupt store must show MORE than
    // needed, never less. An exception would take the panel down; treating the
    // value as "now" would blank a clinical list and look correct doing it.
    for (const bad of ['not a date', '', '   ', null, undefined, 'NaN']) {
      const { basis, cutoff } = resolveCutoff({ windowDays: 7, since: bad, now: NOW });
      expect(basis).toBe('window');
      expect(cutoff).toBe(NOW - 7 * 24 * 60 * 60 * 1000);
    }
  });

  it('does not let a FUTURE marker hide a change', () => {
    // A machine with a wrong clock sends tomorrow's timestamp. That must not
    // silence today's worsening — which is what a naive `>= since` would do.
    const pairs = [{
      athleteId: 'a', name: 'Worsened',
      previous: { assessedAt: ago(99), overallBand: 'green' },
      latest: { assessedAt: ago(1), overallBand: 'red' },
    }];
    const out = changesSince(pairs, { windowDays: 7, since: ago(-5), now: NOW });
    expect(out.map((c) => c.name)).toEqual(['Worsened']);
    // ...and the panel is told the window was used, so it cannot print "moved
    // since you last looked" over a list the marker never touched.
    expect(resolveCutoff({ windowDays: 7, since: ago(-5), now: NOW }).basis).toBe('window');
  });

  it('treats the marker as inclusive of its own instant', () => {
    // Off-by-one at the boundary is invisible and directional: excluding the
    // instant would drop a screening committed in the same second the reader
    // pressed "mark as read".
    const at = ago(3);
    const out = changesSince([{
      athleteId: 'a', name: 'Exactly then',
      previous: { assessedAt: ago(99), overallBand: 'green' },
      latest: { assessedAt: at, overallBand: 'red' },
    }], { since: at, now: NOW });
    expect(out.map((c) => c.name)).toEqual(['Exactly then']);
  });
});
