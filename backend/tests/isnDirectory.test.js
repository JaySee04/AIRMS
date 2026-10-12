// The mock ISN directory is demo-critical and fails SILENTLY.
//
// The upload resolves an athlete by parsing a name out of the filename and
// looking it up (matchInIsn); it accepts only a UNIQUE hit, and on anything
// ambiguous it returns null and quietly falls back to the manual search. So a
// duplicated IC, or a name that turns out to be a substring of another, does not
// throw and does not log — it just makes the demo look like it never worked.
// These assert the properties the walkthrough depends on.
const { searchIsn, getIsnByIC, ISN_DIRECTORY } = require('../src/mock/isnDirectory');

// The names parseNameFromFilename() recovers from the reports JC will hand to
// Dr Thung and Dr Hoo, exactly as they are spelled in those filenames — one
// lowercase, one ALL CAPS. Pinned in the frontend's parser test too.
const DEMO_REPORTS = [
  { parsed: 'nurin syazwani binti rusli', ic: '080214100248', ageOnReport: 17 },
  { parsed: 'NUR BATRISYIA BINTI YUSOF', ic: '090506010576', ageOnReport: 16 },
  { parsed: 'nur aina danish', ic: '070322080314', ageOnReport: 18 },
];
const SCREENED_ON = new Date('2025-07-29T16:00:00');

function ageAt(dob, when) {
  const d = new Date(dob);
  let age = when.getFullYear() - d.getFullYear();
  const m = when.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && when.getDate() < d.getDate())) age -= 1;
  return age;
}

describe('ISN directory', () => {
  it('has a unique IC on every record', () => {
    const ics = ISN_DIRECTORY.map((r) => r.icNumber);
    expect(new Set(ics).size).toBe(ics.length);
  });

  it('gives every record a 12-digit IC', () => {
    for (const r of ISN_DIRECTORY) expect(r.icNumber).toMatch(/^\d{12}$/);
  });

  it('has no name that is a substring of another — an ambiguous hit resolves to nobody', () => {
    for (const a of ISN_DIRECTORY) {
      const others = ISN_DIRECTORY.filter((b) => b !== a);
      const swallowed = others.filter((b) => b.name.toLowerCase().includes(a.name.toLowerCase()));
      expect(swallowed.map((b) => b.name)).toEqual([]);
    }
  });
});

describe('the 2025-07-29 demo reports', () => {
  it.each(DEMO_REPORTS)('resolves $parsed to exactly one athlete', ({ parsed, ic }) => {
    const hits = searchIsn(parsed);
    expect(hits).toHaveLength(1);          // anything else and matchInIsn returns null
    expect(hits[0].icNumber).toBe(ic);
  });

  it.each(DEMO_REPORTS)('$parsed matches on the FULL name, not merely a prefix', ({ parsed, ic }) => {
    // matchInIsn prefers an exact full-name match; this is what makes it exact.
    const rec = getIsnByIC(ic);
    expect(rec.name.toLowerCase()).toBe(parsed.toLowerCase());
  });

  it.each(DEMO_REPORTS)('$parsed was the printed age on the day of the screening', ({ ic, ageOnReport }) => {
    // Age is DERIVED from dateOfBirth, so it advances. What must hold is that the
    // birth date is consistent with the age printed on the report in the Drs' hand.
    expect(ageAt(getIsnByIC(ic).dateOfBirth, SCREENED_ON)).toBe(ageOnReport);
  });

  it('places all three in one squad, so the cohort and the coach view are exercised', () => {
    const recs = DEMO_REPORTS.map((d) => getIsnByIC(d.ic));
    expect(recs.map((r) => `${r.sport}/${r.programme}/${r.gender}`))
      .toEqual(['Badminton/PELAPIS/Female', 'Badminton/PELAPIS/Female', 'Badminton/PELAPIS/Female']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WHICH DIRECTORY IS SERVED (§162)
//
// The records above are FABRICATED, and until 2026-10-12 they were served
// unconditionally. Measured on a running instance: `GET /api/isn/athletes?q=a`
// returned all nine to a signed-in clinician, and roster entry fills Name, IC,
// date of birth, sport and programme straight from the hit — so the quickest
// way to create an athlete on an ISN server was to accept an invented person
// with an invented IC.
//
// Each case re-requires the module, because the source is resolved ONCE at
// require time: the cost of resolving per call would be a file read on every
// keystroke of an autocomplete.
// ─────────────────────────────────────────────────────────────────────────────
describe('which ISN directory is served', () => {
  const load = (env) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    let mod;
    jest.isolateModules(() => { mod = require('../src/mock/isnDirectory'); });
    process.env = saved;
    return mod;
  };

  it('serves the demo records in development, so nothing changes locally', () => {
    const m = load({ NODE_ENV: 'development', AIRMS_ISN_DIRECTORY: '' });
    expect(m.isnDirectoryStatus()).toMatchObject({ mode: 'demo', isFixture: true });
    expect(m.ISN_DIRECTORY.length).toBeGreaterThan(0);
  });

  // THE GUARD THIS SECTION EXISTS FOR. Unset in production must mean EMPTY.
  // Defaulting the other way is how nine invented people reach a clinical
  // roster, and it is silent — a plausible name with a plausible IC.
  it('FAILS CLOSED: production with nothing set serves NOBODY', () => {
    const m = load({ NODE_ENV: 'production', AIRMS_ISN_DIRECTORY: '' });
    expect(m.ISN_DIRECTORY).toEqual([]);
    expect(m.isnDirectoryStatus()).toMatchObject({ mode: 'none', count: 0, isFixture: false });
  });

  it('still serves the demo records when production ASKS for them', () => {
    // The stakeholder demo runs with NODE_ENV=production, so opting back in has
    // to be possible — the point is that it is a choice somebody made.
    const m = load({ NODE_ENV: 'production', AIRMS_ISN_DIRECTORY: 'demo' });
    expect(m.isnDirectoryStatus()).toMatchObject({ mode: 'demo', isFixture: true });
    expect(m.ISN_DIRECTORY.length).toBe(m.DEMO_DIRECTORY.length);
  });

  it('reports a fixture directory AS a fixture, which is what verify:data reads', () => {
    // isFixture is the flag `npm run verify:data` blocks on. If it ever reported
    // false for the demo set, that command would certify a fabricated install
    // as ready for real athletes.
    expect(load({ NODE_ENV: 'development' }).isnDirectoryStatus().isFixture).toBe(true);
    expect(load({ NODE_ENV: 'production', AIRMS_ISN_DIRECTORY: 'none' })
      .isnDirectoryStatus().isFixture).toBe(false);
  });

  it('refuses a malformed export rather than loading half of it', () => {
    // Half a directory loaded is a roster where some athletes autocomplete and
    // others do not, which reads as "ISN has not registered them yet".
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'isn-dir-'));
    const write = (name, body) => {
      const f = path.join(dir, name);
      fs.writeFileSync(f, body);
      return f;
    };
    const cases = [
      ['not an array', write('a.json', '{"not":"an array"}'), /must hold a JSON ARRAY/],
      ['short IC', write('b.json', '[{"icNumber":"12345","name":"X"}]'), /12-digit icNumber/],
      ['no name', write('c.json', '[{"icNumber":"990101101234","name":"  "}]'), /has no name/],
      // A duplicate makes searchIsn return two hits for one person, so the
      // importer's unique-match rule declines and that athlete silently stops
      // being findable.
      ['duplicate IC', write('d.json', '[{"icNumber":"990101101234","name":"A"},'
        + '{"icNumber":"990101101234","name":"B"}]'), /duplicate icNumber/],
      ['missing file', path.join(dir, 'nope.json'), /could not read/],
    ];
    for (const [label, file, pattern] of cases) {
      expect(() => load({ NODE_ENV: 'production', AIRMS_ISN_DIRECTORY: file }))
        .toThrow(expect.objectContaining({ message: expect.stringMatching(pattern) }));
      expect(label).toBeTruthy();
    }
  });

  it('loads a well-formed export and serves it as real, not as a fixture', () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'isn-ok-')), 'isn.json');
    fs.writeFileSync(f, JSON.stringify([{
      icNumber: '990101101234', name: 'Real Athlete', dateOfBirth: '1999-01-01',
      gender: 'Female', sport: 'Badminton', programme: 'PODIUM',
    }]));
    const m = load({ NODE_ENV: 'production', AIRMS_ISN_DIRECTORY: f });
    expect(m.isnDirectoryStatus()).toMatchObject({ mode: 'file', count: 1, isFixture: false });
    expect(m.getIsnByIC('990101101234').name).toBe('Real Athlete');
    expect(m.searchIsn('real')).toHaveLength(1);
  });
});
