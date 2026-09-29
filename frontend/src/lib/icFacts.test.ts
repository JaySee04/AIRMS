// Corroborating a match against the report's own cover.
//
// The point of this module is to remove a trade-off, so the tests are mostly
// about what it REFUSES to claim: an unknown must never read as a pass, because
// a collapse that quietly meant "could not tell" is the exact silent-failure
// shape the collapse was supposed to be safe from.

import { icFacts, ageOn, checkMatch } from './icFacts';

const ON = new Date('2025-07-29T00:00:00Z'); // the demo session's date

describe('icFacts — reading the identifier the roster already returns', () => {
  it('reads date of birth and sex from a real IC', () => {
    // Nur Aina Danish, from the ISN directory: 07-03-22, final digit 4 = even.
    const f = icFacts('070322080314', ON)!;
    expect(f.dateOfBirth.toISOString().slice(0, 10)).toBe('2007-03-22');
    expect(f.sex).toBe('Female');
  });

  it('reads an odd final digit as Male', () => {
    // John Doe, seeded.
    expect(icFacts('070202021001', ON)!.sex).toBe('Male');
  });

  it('resolves the century by plausibility, not a hardcoded pivot', () => {
    // 75-02-06 is 1975 (age 50) or 2075 (unborn). Only one is sane.
    const f = icFacts('750206031061', ON)!;
    expect(f.dateOfBirth.getUTCFullYear()).toBe(1975);
    // And the other direction: 09 is 2009, because 1909 would be 116.
    expect(icFacts('090506010576', ON)!.dateOfBirth.getUTCFullYear()).toBe(2009);
  });

  it('declines anything that is not a 12-digit IC', () => {
    // Legacy keys, typos, a foreign passport. Declining is the safe answer —
    // it becomes "unchecked", never "checked and fine".
    for (const bad of ['ATH0001', '', '12345', '07032208031', 'abcdefghijkl']) {
      expect(icFacts(bad, ON)).toBeNull();
    }
  });

  it('declines an impossible date rather than letting it roll over', () => {
    // 31 February silently becomes 3 March in a Date constructor, which would
    // hand back a confident and wrong birthday.
    expect(icFacts('070231080314', ON)).toBeNull();
    expect(icFacts('071332080314', ON)).toBeNull();
  });
});

describe('ageOn', () => {
  it('counts whole years, not elapsed calendar years', () => {
    expect(ageOn(new Date('2007-03-22T00:00:00Z'), ON)).toBe(18);
  });

  it('does not count a birthday that has not happened yet', () => {
    // Born in December; at the July screening they are still the younger age.
    expect(ageOn(new Date('2007-12-01T00:00:00Z'), ON)).toBe(17);
  });
});

describe('checkMatch — what the collapsed row is allowed to claim', () => {
  const base = { athleteId: '070322080314', assessedAt: '2025-07-29 15:42:16' };

  it('AGREES when the report and the IC say the same thing', () => {
    const r = checkMatch({ ...base, reportAge: 18, reportGender: 'Female' });
    expect(r.verdict).toBe('agrees');
    expect(r.sex.ok).toBe(true);
    expect(r.age.ok).toBe(true);
  });

  it('DISAGREES on sex, and says which way round', () => {
    const r = checkMatch({ ...base, reportAge: 18, reportGender: 'Male' });
    expect(r.verdict).toBe('disagrees');
    // The wording has to be actionable: an operator must be able to tell
    // whether the report or the roster is the thing that is wrong.
    expect(r.reason).toContain('report says Male');
    expect(r.reason).toContain('IC is Female');
  });

  it('DISAGREES when the age is years out', () => {
    const r = checkMatch({ ...base, reportAge: 24, reportGender: 'Female' });
    expect(r.verdict).toBe('disagrees');
    expect(r.reason).toContain('age 24');
  });

  it('tolerates one year, because the cover prints whole years', () => {
    // A birthday either side of the screening is not an accusation.
    expect(checkMatch({ ...base, reportAge: 19, reportGender: 'Female' }).verdict).toBe('agrees');
    expect(checkMatch({ ...base, reportAge: 17, reportGender: 'Female' }).verdict).toBe('agrees');
  });

  it('compares age AT THE SCREENING DATE, not today', () => {
    // The whole reason assessedAt is threaded through. An old report is stale
    // by a year or more; comparing against today would flag every correctly
    // matched historical import, and a check that cries wolf gets ignored.
    const old = checkMatch({
      athleteId: '070322080314',
      assessedAt: '2021-07-29 10:00:00',
      reportAge: 14,
      reportGender: 'Female',
    });
    expect(old.verdict).toBe('agrees');
  });

  it('is UNKNOWN — never "agrees" — when the IC cannot be read', () => {
    const r = checkMatch({ athleteId: 'ATH0001', assessedAt: '2025-07-29 15:42:16', reportAge: 18, reportGender: 'Female' });
    expect(r.verdict).toBe('unknown');
  });

  it('is UNKNOWN when the report printed no age or no gender', () => {
    expect(checkMatch({ ...base, reportAge: null, reportGender: 'Female' }).verdict).toBe('unknown');
    expect(checkMatch({ ...base, reportAge: 18, reportGender: null }).verdict).toBe('unknown');
  });

  it('is UNKNOWN when there is no assessment date to age against', () => {
    expect(checkMatch({ athleteId: '070322080314', assessedAt: null, reportAge: 18, reportGender: 'Female' }).verdict).toBe('unknown');
  });

  it('does NOT accept one agreeing fact as corroboration', () => {
    // Half the roster is Female. Sex alone is a coin toss, so a row where the
    // age could not be read is unchecked, not confirmed — this is the
    // assertion that stops the collapse becoming a rubber stamp.
    const r = checkMatch({ ...base, reportAge: null, reportGender: 'Female' });
    expect(r.sex.ok).toBe(true);
    expect(r.verdict).toBe('unknown');
  });

  it('corroborates all three demo reports against their directory ICs', () => {
    // The end-to-end case: these are the reports handed to the stakeholders.
    const demo = [
      { athleteId: '070322080314', reportAge: 18, reportGender: 'Female' },
      { athleteId: '080214100248', reportAge: 17, reportGender: 'Female' },
      { athleteId: '090506010576', reportAge: 16, reportGender: 'Female' },
    ];
    for (const d of demo) {
      expect(checkMatch({ ...d, assessedAt: '2025-07-29 15:42:16' }).verdict).toBe('agrees');
    }
  });
});
