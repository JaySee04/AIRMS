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
