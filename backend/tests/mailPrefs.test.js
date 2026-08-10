// Per-user email opt-out (utils/mailPrefs.js).
//
// Tested closely because both directions of failure are silent and asymmetric:
// treating an opt-out as consent mails someone who asked not to be mailed, and
// treating a missing preference as an opt-out silences a clinical alert nobody
// knows was owed. The second is the dangerous one, so the default has to be ON
// for every shape of input, including a corrupted column.

const {
  NOTIFY_KEYS, keysForRole, wantsMail, recipientsFor, sanitizePrefs, prefsForUser,
} = require('../src/utils/mailPrefs');

describe('wantsMail — defaults', () => {
  test.each([
    ['null prefs (every existing user)', null],
    ['undefined (column not selected)', undefined],
    ['empty object', {}],
    ['a string, somehow', 'nope'],
    ['an array, somehow', []],
  ])('%s means yes', (_label, notifyPrefs) => {
    expect(wantsMail({ notifyPrefs }, 'import_alerts')).toBe(true);
  });

  test('a missing user is still a yes rather than a crash', () => {
    expect(wantsMail(null, 'digest')).toBe(true);
    expect(wantsMail(undefined, 'digest')).toBe(true);
  });

  test('only an explicit false opts out', () => {
    expect(wantsMail({ notifyPrefs: { digest: false } }, 'digest')).toBe(false);
    expect(wantsMail({ notifyPrefs: { digest: true } }, 'digest')).toBe(true);
    // Truthy-but-not-true values must not read as an opt-out.
    expect(wantsMail({ notifyPrefs: { digest: 0 } }, 'digest')).toBe(true);
    expect(wantsMail({ notifyPrefs: { digest: null } }, 'digest')).toBe(true);
  });

  test('opting out of one notification does not affect the others', () => {
    const u = { notifyPrefs: { digest: false } };
    expect(wantsMail(u, 'digest')).toBe(false);
    expect(wantsMail(u, 'import_alerts')).toBe(true);
    expect(wantsMail(u, 'injury')).toBe(true);
  });
});

describe('recipientsFor', () => {
  const users = [
    { email: 'a@isn.gov.my', notifyPrefs: null },
    { email: 'b@isn.gov.my', notifyPrefs: { import_alerts: false } },
    { email: 'c@isn.gov.my', notifyPrefs: { digest: false } },
  ];

  test('drops only the users who opted out of that key', () => {
    expect(recipientsFor(users, 'import_alerts').map((u) => u.email))
      .toEqual(['a@isn.gov.my', 'c@isn.gov.my']);
    expect(recipientsFor(users, 'digest').map((u) => u.email))
      .toEqual(['a@isn.gov.my', 'b@isn.gov.my']);
  });

  test('an empty recipient list is possible and is not an error', () => {
    // The callers must handle this: alertMany reports "no recipients" and the
    // scheduler still marks the month so it does not retry hourly.
    expect(recipientsFor([{ notifyPrefs: { digest: false } }], 'digest')).toEqual([]);
  });
});

describe('keysForRole', () => {
  test('each role is offered only the mail it can receive', () => {
    expect(keysForRole('medical')).toEqual(['import_alerts']);
    expect(keysForRole('coach')).toEqual(['import_alerts', 'override', 'injury']);
    expect(keysForRole('admin')).toEqual(['digest']);
    expect(keysForRole('executive')).toEqual(['digest']);
  });

  test('athletes receive no AIRMS email, so they get no toggles', () => {
    // The profile card is hidden on an empty list — an empty "Email
    // notifications" card would read as a fault.
    expect(keysForRole('athlete')).toEqual([]);
  });

  test('every declared key belongs to at least one role', () => {
    // A key no role can receive would render nowhere and silence nothing.
    for (const k of NOTIFY_KEYS) expect(k.roles.length).toBeGreaterThan(0);
  });
});

describe('sanitizePrefs', () => {
  test('keeps only the opt-outs', () => {
    expect(sanitizePrefs({ digest: false, other: true }, 'admin')).toEqual({ digest: false });
  });

  test('all-on collapses back to null', () => {
    // Storing {digest:true} would freeze today's default into the row, so a
    // notification added later would inherit a choice the user never made.
    expect(sanitizePrefs({ digest: true }, 'admin')).toBeNull();
    expect(sanitizePrefs({}, 'admin')).toBeNull();
  });

  test('refuses keys the caller\'s role cannot receive', () => {
    // A coach must not be able to write a `digest` preference, and an admin must
    // not write `injury` — the column would then disagree with the UI.
    expect(sanitizePrefs({ digest: false }, 'coach')).toBeNull();
    expect(sanitizePrefs({ injury: false }, 'admin')).toBeNull();
  });

  test('refuses unknown keys and non-boolean values', () => {
    expect(sanitizePrefs({ nonsense: false }, 'admin')).toBeNull();
    expect(sanitizePrefs({ digest: 'false' }, 'admin')).toBeNull();
    expect(sanitizePrefs({ digest: 0 }, 'admin')).toBeNull();
  });

  test('refuses a non-object body', () => {
    expect(sanitizePrefs(null, 'admin')).toBeNull();
    expect(sanitizePrefs('digest=false', 'admin')).toBeNull();
    expect(sanitizePrefs([{ digest: false }], 'admin')).toBeNull();
  });

  test('a partial body only mutes what it names', () => {
    const saved = sanitizePrefs({ import_alerts: false, injury: false }, 'coach');
    expect(saved).toEqual({ import_alerts: false, injury: false });
    expect(wantsMail({ notifyPrefs: saved }, 'override')).toBe(true);
  });
});

describe('prefsForUser', () => {
  test('returns every toggle for the role with its resolved state', () => {
    const prefs = prefsForUser({ role: 'coach', notifyPrefs: { injury: false } });
    expect(prefs.map((p) => p.key)).toEqual(['import_alerts', 'override', 'injury']);
    expect(prefs.map((p) => p.enabled)).toEqual([true, true, false]);
    // The UI renders these directly, so both strings have to be present.
    for (const p of prefs) {
      expect(p.label).toBeTruthy();
      expect(p.detail).toBeTruthy();
    }
  });

  test('is empty for a role that receives no email', () => {
    expect(prefsForUser({ role: 'athlete', notifyPrefs: null })).toEqual([]);
  });
});
