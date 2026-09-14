// The address an activation code is sent to.
//
// Every case in the first block is one this codebase genuinely ACCEPTED on
// 2026-09-13, measured by building a User and calling validate(). They are not
// hypothetical inputs — they are what the model stored the day before this
// file existed. See utils/emailAddress.js and DESIGN_DECISIONS §97.1.

const { validateEmail, normalizeEmail, MAX_LENGTH } = require('../src/utils/emailAddress');

describe('validateEmail — what the model used to accept', () => {
  // Recorded as a table so a regression names the exact string that came back.
  const WAS_ACCEPTED = [
    ['not-an-email', 'no @ at all'],
    ['jc@@isn', 'two @ and no TLD'],
    ['a b@c.d', 'a space in the local part'],
    ['<script>@x.com', 'markup in the local part'],
    ['@isn.gov.my', 'no local part'],
    ['nurin@', 'no domain'],
    ['nurin@isn', 'no dot in the domain'],
    ['nurin@isn.', 'a trailing dot and no TLD'],
    ['nurin@isn.g', 'a one-letter TLD'],
    ['.nurin@isn.gov.my', 'a leading dot'],
    ['nurin.@isn.gov.my', 'a trailing dot on the local part'],
    ['nurin..s@isn.gov.my', 'a doubled dot'],
    ['nurin@isn..gov.my', 'a doubled dot in the domain'],
    ['nurin @isn.gov.my', 'a trailing space in the local part'],
  ];

  it.each(WAS_ACCEPTED)('rejects %j (%s)', (input) => {
    expect(validateEmail(input)).not.toBeNull();
  });

  it('gives ONE sentence a person can act on, not a validator string', () => {
    expect(validateEmail('nurin@isn')).toMatch(/typo/i);
    // It must not name a regex, a field or a library — the reader is an
    // administrator mid-form, and §48's rule about what a failure discloses
    // applies to the ones we author too.
    expect(validateEmail('nurin@isn')).not.toMatch(/regex|pattern|validator|SHAPE/i);
  });
});

describe('validateEmail — what it must NOT break', () => {
  // These are real addresses this system already holds. A stricter rule that
  // rejected any of them would be found by an administrator, at the worst
  // possible moment, rather than here.
  const REAL = [
    'athlete@isn.gov.my',
    'admin@isn.gov.my',
    '23005005@siswa.um.edu.my', // all-digit local part
    'poseidonapollo11@gmail.com',
    // The deliverable inboxes in CLAUDE.md's credentials table. A "+" rule is
    // the classic over-strict email regex, and it would silently break the
    // rescreen-reminder demo, which is the whole reason these two exist.
    'poseidonapollo11+coach@gmail.com',
    'poseidonapollo11+exec@gmail.com',
    "o'brien@isn.gov.my", // an apostrophe is legal in a local part
    'a.b.c@sub.domain.example.museum', // a long TLD, and dots used correctly
    'x@y.co', // the shortest thing that is still plausibly deliverable
  ];

  it.each(REAL)('accepts %j', (input) => {
    expect(validateEmail(input)).toBeNull();
  });
});

describe('validateEmail — absence and length', () => {
  it.each([[undefined], [null], [''], ['   '], [42], [{}], [[]]])(
    'treats %j as missing rather than malformed',
    (input) => {
      expect(validateEmail(input)).toMatch(/required/i);
    },
  );

  it(`refuses an address longer than the ${MAX_LENGTH}-char column`, () => {
    // Silently truncating to fit is the failure this prevents: the row would
    // store a DIFFERENT address from the one typed, and the invitation would
    // go somewhere nobody chose.
    const tooLong = `${'a'.repeat(MAX_LENGTH)}@isn.gov.my`;
    expect(validateEmail(tooLong)).toMatch(/at most/i);
  });

  it('accepts one exactly at the limit', () => {
    const domain = '@isn.gov.my';
    const exact = 'a'.repeat(MAX_LENGTH - domain.length) + domain;
    expect(exact).toHaveLength(MAX_LENGTH);
    expect(validateEmail(exact)).toBeNull();
  });
});

describe('normalizeEmail', () => {
  it('trims and lower-cases, because the column is UNIQUE and login lower-cases', () => {
    expect(normalizeEmail('  Nurin@ISN.Gov.My ')).toBe('nurin@isn.gov.my');
  });

  it('is idempotent — applying it twice cannot change the answer', () => {
    const once = normalizeEmail(' Admin@ISN.gov.my ');
    expect(normalizeEmail(once)).toBe(once);
  });

  it('leaves a "+" tag alone', () => {
    // Some normalisers strip +tags to deduplicate accounts. Doing that here
    // would merge Coach Demo 02 into the personal Gmail account and silently
    // break the one-email-per-sport demo.
    expect(normalizeEmail('PoseidonApollo11+Coach@Gmail.com'))
      .toBe('poseidonapollo11+coach@gmail.com');
  });
});
