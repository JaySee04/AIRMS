// Per-user permission layer (opt-out model for medical staff).
const {
  hasPermission, sanitizePermissions, PERMISSION_KEYS,
  isForeignAthleteRequest, canDownloadIndividualReport,
} = require('../src/utils/permissions');
const rbacModule = require('../src/middleware/rbac');
const reportRoutePath = require.resolve('../src/routes/screeningReports.js');

describe('hasPermission', () => {
  test('non-medical roles are never constrained by this layer', () => {
    for (const role of ['admin', 'athlete', 'coach']) {
      expect(hasPermission({ role, permissions: { viewRecords: false } }, 'viewRecords')).toBe(true);
    }
  });

  test('medical staff are granted by default (missing key = granted)', () => {
    expect(hasPermission({ role: 'medical', permissions: {} }, 'viewRecords')).toBe(true);
    expect(hasPermission({ role: 'medical', permissions: null }, 'uploadData')).toBe(true);
  });

  test('only an explicit false revokes, and only the named capability', () => {
    const user = { role: 'medical', permissions: { viewRecords: false } };
    expect(hasPermission(user, 'viewRecords')).toBe(false);
    expect(hasPermission(user, 'uploadData')).toBe(true); // untouched key still granted
  });

  test('defensive against malformed input', () => {
    expect(hasPermission(null, 'viewRecords')).toBe(true);
    expect(hasPermission({ role: 'medical', permissions: 'nope' }, 'viewRecords')).toBe(true);
  });
});

describe('sanitizePermissions', () => {
  test('keeps only known keys with boolean values', () => {
    const out = sanitizePermissions({ viewRecords: false, uploadData: true, bogus: true, injuryReports: 'yes' });
    expect(out).toEqual({ viewRecords: false, uploadData: true });
  });

  test('non-object input normalises to an empty map', () => {
    expect(sanitizePermissions(null)).toEqual({});
    expect(sanitizePermissions('x')).toEqual({});
    expect(sanitizePermissions(undefined)).toEqual({});
  });

  test('never emits a key outside the known set', () => {
    const out = sanitizePermissions(Object.fromEntries(PERMISSION_KEYS.concat('sneaky').map((k) => [k, true])));
    expect(Object.keys(out).sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});

// ── UC-41 individual-report access ─────────────────────────────────────────
//
// These exist because the rule was RIGHT and UNREACHABLE. The self-scope check
// lived in the route while `athlete` was missing from its rbac() list, so an
// athlete pressing Download PDF on their own dashboard got "insufficient role"
// and the check never ran. Testing the predicate alone would not have caught
// that, so the last describe block asserts the WIRING as well.

const ATH = { role: 'athlete', athleteId: '070202021001' };
const OTHER = { athleteId: '890202021001', sport: 'Badminton' };
const MINE = { athleteId: '070202021001', sport: 'Badminton' };

describe('isForeignAthleteRequest', () => {
  test('an athlete asking for their own report is not foreign', () => {
    expect(isForeignAthleteRequest(ATH, '070202021001')).toBe(false);
  });

  test('an athlete asking for somebody else is refused before any lookup', () => {
    expect(isForeignAthleteRequest(ATH, '890202021001')).toBe(true);
  });

  test('an athlete account with no linked profile cannot request anything', () => {
    expect(isForeignAthleteRequest({ role: 'athlete', athleteId: null }, '070202021001')).toBe(true);
    // ...and specifically not by passing the same empty value in the URL.
    expect(isForeignAthleteRequest({ role: 'athlete', athleteId: null }, '')).toBe(true);
  });

  test('ids compare as strings, so a numeric athleteId still matches', () => {
    expect(isForeignAthleteRequest({ role: 'athlete', athleteId: 70202021001 }, '70202021001')).toBe(false);
  });

  test('non-athletes are never foreign by this rule (their scope is decided later)', () => {
    for (const role of ['admin', 'medical', 'coach', 'executive']) {
      expect(isForeignAthleteRequest({ role, coachSport: 'Badminton' }, 'anything')).toBe(false);
    }
  });
});

describe('canDownloadIndividualReport', () => {
  test('admin, medical and executive may download any athlete', () => {
    for (const role of ['admin', 'medical', 'executive']) {
      expect(canDownloadIndividualReport({ role }, OTHER)).toBe(true);
    }
  });

  test('an athlete may download their own report and only their own', () => {
    expect(canDownloadIndividualReport(ATH, MINE)).toBe(true);
    expect(canDownloadIndividualReport(ATH, OTHER)).toBe(false);
  });

  test('a coach is scoped to their one assigned sport', () => {
    expect(canDownloadIndividualReport({ role: 'coach', coachSport: 'Badminton' }, MINE)).toBe(true);
    expect(canDownloadIndividualReport({ role: 'coach', coachSport: 'Squash' }, MINE)).toBe(false);
  });

  test('a coach with no sport assigned gets nothing, rather than everything', () => {
    expect(canDownloadIndividualReport({ role: 'coach', coachSport: null }, MINE)).toBe(false);
    // THE case, and the reason the predicate spells out `Boolean(user.coachSport)`
    // instead of leaning on the comparison: an unassigned coach meeting an athlete
    // row that carries no sport makes both sides `undefined`, and `undefined ===
    // undefined` is TRUE. Without the guard that is a coach with no squad reading
    // any athlete whose sport happens to be blank. Written first as `coachSport:
    // null`, which is a different value from `undefined` and let the mutant live.
    expect(canDownloadIndividualReport({ role: 'coach' }, { athleteId: 'x' })).toBe(false);
    expect(canDownloadIndividualReport({ role: 'coach', coachSport: undefined }, { athleteId: 'x', sport: undefined })).toBe(false);
    expect(canDownloadIndividualReport({ role: 'coach', coachSport: '' }, { athleteId: 'x', sport: '' })).toBe(false);
  });

  test('it is an allow-list — an unknown role is denied, not defaulted in', () => {
    expect(canDownloadIndividualReport({ role: 'physio' }, MINE)).toBe(false);
    expect(canDownloadIndividualReport(null, MINE)).toBe(false);
    expect(canDownloadIndividualReport({ role: 'admin' }, null)).toBe(false);
  });
});

describe('UC-41 wiring — the predicate must be REACHABLE', () => {
  // The original defect in one assertion. A correct rule behind a gate that
  // rejects the role first is indistinguishable, from the outside, from no rule
  // at all; every predicate test above passed while the feature was broken.
  test("the individual-report route admits 'athlete' to rbac", () => {
    const admitted = [];
    jest.isolateModules(() => {
      jest.doMock('../src/middleware/rbac', () => (...roles) => {
        admitted.push(roles);
        return (req, res, next) => next();
      });
      require(reportRoutePath);
    });
    jest.dontMock('../src/middleware/rbac');

    const individual = admitted.find((roles) => roles.includes('coach') && roles.includes('executive')
      && roles.includes('medical') && roles.includes('admin'));
    expect(individual).toBeDefined();
    expect(individual).toContain('athlete');
  });

  test('rbac itself still refuses a role it was not given', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    rbacModule('medical')({ user: { role: 'athlete' } }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
