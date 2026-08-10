// Who gets told about whom.
//
// The rest of alertMany needs a database, but the routing decision is pure and is
// the part that would break silently: an off-by-one in the sport match either
// spams a coach with other squads' athletes or hides their own from them, and
// neither shows up as an error anywhere.
const { groupByRecipient } = require('../src/utils/alerts');

const item = (name, sport, band = 'amber') => ({
  athlete: { athleteId: name.toUpperCase(), name, sport },
  band,
  indicator: 40,
  escalations: 1,
  factors: [],
});

describe('alert grouping', () => {
  const MED = ['med1@isn.gov.my', 'med2@isn.gov.my'];
  const COACHES = [
    { email: 'badminton@isn.gov.my', coachSport: 'Badminton' },
    { email: 'swim@isn.gov.my', coachSport: 'Swimming' },
  ];

  it('gives every medical account one entry per flagged athlete', () => {
    const flagged = [item('a', 'Badminton'), item('b', 'Swimming'), item('c', 'Hockey')];
    const g = groupByRecipient(flagged, MED, COACHES);
    // ONE list per medical address, holding all three — not three separate sends.
    expect(g.get('med1@isn.gov.my')).toHaveLength(3);
    expect(g.get('med2@isn.gov.my')).toHaveLength(3);
  });

  it('gives a coach only their own sport', () => {
    const flagged = [item('a', 'Badminton'), item('b', 'Badminton'), item('c', 'Swimming')];
    const g = groupByRecipient(flagged, MED, COACHES);
    expect(g.get('badminton@isn.gov.my').map((i) => i.athlete.name)).toEqual(['a', 'b']);
    expect(g.get('swim@isn.gov.my').map((i) => i.athlete.name)).toEqual(['c']);
  });

  it('leaves out a coach whose sport nobody flagged', () => {
    const g = groupByRecipient([item('a', 'Hockey')], MED, COACHES);
    expect(g.has('badminton@isn.gov.my')).toBe(false);
    expect(g.has('swim@isn.gov.my')).toBe(false);
    // Medical still hear about it — an unassigned sport must not silence the alert.
    expect(g.get('med1@isn.gov.my')).toHaveLength(1);
  });

  it('produces one send per recipient, not one per athlete', () => {
    const flagged = Array.from({ length: 15 }, (_, i) => item(`ath${i}`, 'Badminton'));
    const g = groupByRecipient(flagged, MED, COACHES);
    // The regression this replaced: 15 athletes used to mean 15 sendMail calls.
    expect(g.size).toBe(3); // 2 medical + 1 badminton coach
    for (const items of g.values()) expect(items).toHaveLength(15);
  });

  it('never sends the same athlete to one recipient twice', () => {
    // A duplicated coach row must not double up the digest.
    const dupes = [...COACHES, { email: 'badminton@isn.gov.my', coachSport: 'Badminton' }];
    const g = groupByRecipient([item('a', 'Badminton')], [], dupes);
    expect(g.get('badminton@isn.gov.my')).toHaveLength(1);
  });

  it('skips blank addresses and malformed coach rows', () => {
    const g = groupByRecipient(
      [item('a', 'Badminton')],
      ['', null, 'med1@isn.gov.my'],
      [null, {}, { email: '', coachSport: 'Badminton' }, { email: 'x@y', coachSport: null }],
    );
    expect([...g.keys()]).toEqual(['med1@isn.gov.my']);
  });

  it('returns nothing when there is nobody to tell', () => {
    expect(groupByRecipient([item('a', 'Badminton')], [], []).size).toBe(0);
    expect(groupByRecipient([], MED, COACHES).size).toBe(0);
  });
});
