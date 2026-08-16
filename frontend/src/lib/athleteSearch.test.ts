import { searchAthletes, tokenise } from './athleteSearch';

// Shapes taken from the seeded roster, including the duplicate-name pairs that
// actually exist on it.
const ROSTER = [
  { athleteId: '030606061005', name: 'Adam Ismail', sport: 'Athletics' },
  { athleteId: '050226261025', name: 'Adam Karim', sport: 'Swimming' },
  { athleteId: '030121491048', name: 'Adam Kumar', sport: 'Hockey' },
  { athleteId: '951107351034', name: 'Adam Kumar', sport: 'Football' },
  { athleteId: '050113131012', name: 'Faris Ahmad', sport: 'Football' },
  { athleteId: '961010101009', name: 'Faris Ahmad', sport: 'Hockey' },
  { athleteId: '070202021001', name: 'John Doe', sport: 'Badminton' },
  { athleteId: '070517171016', name: 'Aina Othman', sport: 'Badminton' },
];

const names = (q: string) => searchAthletes(ROSTER, q).map((h) => h.athlete.name);
const ids = (q: string) => searchAthletes(ROSTER, q).map((h) => h.athlete.athleteId);

describe('athlete search — finding the right person', () => {
  it('returns the whole roster untouched for an empty query', () => {
    expect(searchAthletes(ROSTER, '').map((h) => h.athlete.athleteId))
      .toEqual(ROSTER.map((a) => a.athleteId));
    expect(searchAthletes(ROSTER, '   ')).toHaveLength(ROSTER.length);
  });

  // The headline fix: the old substring match returned nothing for this.
  it('matches a name typed in the WRONG WORD ORDER', () => {
    expect(names('ahmad faris')).toEqual(['Faris Ahmad', 'Faris Ahmad']);
    expect(names('ismail adam')).toEqual(['Adam Ismail']);
  });

  it('narrows as more words are typed, rather than widening', () => {
    expect(names('adam')).toHaveLength(4);
    expect(names('adam k')).toEqual(['Adam Karim', 'Adam Kumar', 'Adam Kumar']);
    expect(names('adam kum')).toEqual(['Adam Kumar', 'Adam Kumar']);
  });

  it('drops an athlete when any one token fails', () => {
    // "adam" matches four people; "zzz" matches nobody, so the pair does too.
    expect(names('adam zzz')).toEqual([]);
  });

  it('finds an IC typed with the separators printed on the form', () => {
    expect(ids('070202-02-1001')).toEqual(['070202021001']);
    expect(ids('070202 02 1001')).toEqual(['070202021001']);
  });

  // The dashed and bare forms of one IC must be the same query, or the athlete
  // ranks first when it is typed one way and mid-list when typed the other.
  it('scores a dashed IC identically to the same IC typed bare', () => {
    const dashed = searchAthletes(ROSTER, '070202-02-1001')[0];
    const bare = searchAthletes(ROSTER, '070202021001')[0];
    expect(dashed.athlete.athleteId).toBe(bare.athlete.athleteId);
    expect(dashed.score).toBe(bare.score);
  });

  it('does not let a dashed IC fragment match its digits twice over', () => {
    // 0705-17 against 070517171016: "17" recurs, and splitting on the dash used
    // to mark 07051717 as matched when only 070517 was typed.
    const [hit] = searchAthletes(ROSTER, '0705-17');
    expect(hit.athlete.athleteId).toBe('070517171016');
    expect(hit.idSegments.filter((s) => s.hit).map((s) => s.text).join('')).toBe('070517');
  });

  it('matches an IC prefix, which is how a birth date is read off', () => {
    expect(ids('0301')).toEqual(['030121491048']);
  });

  it('ranks an IC PREFIX above an IC that merely contains the digits', () => {
    // "03" starts the two 2003 births and also sits inside 9511073510*34*.
    const hits = ids('03');
    expect(hits.slice(0, 2)).toEqual(['030606061005', '030121491048']);
    expect(hits).toContain('951107351034'); // still a hit, just a weaker one
  });

  // Ranking is the safety property: an exact IC is the only unique handle.
  it('puts an exact IC first, above any name evidence', () => {
    const hits = searchAthletes(ROSTER, '951107351034');
    expect(hits[0].athlete.athleteId).toBe('951107351034');
    expect(hits[0].athlete.sport).toBe('Football');
  });

  it('ranks a name-start above a mid-word match', () => {
    // "am" starts nothing but sits inside Adam / Ismail; "ad" starts Adam.
    const start = searchAthletes(ROSTER, 'ad')[0];
    expect(start.athlete.name.startsWith('Ad')).toBe(true);
  });

  it('orders equal-scoring hits alphabetically so they do not reshuffle', () => {
    expect(names('adam k')).toEqual(['Adam Karim', 'Adam Kumar', 'Adam Kumar']);
  });

  it('flags the duplicate names that share a person-facing label', () => {
    const hits = searchAthletes(ROSTER, 'adam kumar');
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.ambiguous)).toBe(true);
    // Different people, different records.
    expect(new Set(hits.map((h) => h.athlete.athleteId)).size).toBe(2);
  });

  it('does not flag a unique name as ambiguous', () => {
    expect(searchAthletes(ROSTER, 'john')[0].ambiguous).toBe(false);
  });

  // Ambiguity is about what is on screen to be MIS-picked.
  it('judges ambiguity against the results, not the whole roster', () => {
    // Narrowing to one of the two Adam Kumars leaves nothing to confuse it with.
    const one = searchAthletes(ROSTER, '030121491048');
    expect(one).toHaveLength(1);
    expect(one[0].ambiguous).toBe(false);
  });

  it('is case- and accent-insensitive', () => {
    expect(names('ADAM ISMAIL')).toEqual(['Adam Ismail']);
    expect(names('ádam')).toHaveLength(4);
  });
});

describe('highlight segments', () => {
  it('marks the matched part of the name and nothing else', () => {
    const [hit] = searchAthletes(ROSTER, 'ada');
    expect(hit.nameSegments.filter((s) => s.hit).map((s) => s.text)).toEqual(['Ada']);
    // Segments always reassemble into the original string.
    expect(hit.nameSegments.map((s) => s.text).join('')).toBe(hit.athlete.name);
  });

  it('marks IC digits even when the query carried separators', () => {
    const [hit] = searchAthletes(ROSTER, '070202-02');
    expect(hit.idSegments.map((s) => s.text).join('')).toBe('070202021001');
    expect(hit.idSegments.filter((s) => s.hit).map((s) => s.text).join('')).toBe('07020202');
  });

  it('leaves everything unmarked when the query is empty', () => {
    const [hit] = searchAthletes(ROSTER, '');
    expect(hit.nameSegments.every((s) => !s.hit)).toBe(true);
  });
});

describe('tokenise', () => {
  it('separates numeric IC fragments from name words', () => {
    expect(tokenise('adam 9511')).toEqual([
      { raw: 'adam', numeric: false },
      { raw: '9511', numeric: true },
    ]);
  });

  it('reads an all-digits query as ONE IC, separators and all', () => {
    expect(tokenise('070202-02-1001')).toEqual([{ raw: '070202021001', numeric: true }]);
    expect(tokenise('0705 17')).toEqual([{ raw: '070517', numeric: true }]);
  });

  it('treats apostrophes and hyphens as word breaks', () => {
    expect(tokenise("nur'ain abd-rahman").map((t) => t.raw))
      .toEqual(['nur', 'ain', 'abd', 'rahman']);
  });
});
