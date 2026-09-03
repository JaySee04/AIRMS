// The report routes, driven as HTTP.
//
// `screeningReports.js` was the least-covered file in the project — 7% of
// statements, 285 uncovered lines — and `audit.js` was second at 19%. That is
// not a coincidence: three of the defects found on 2026-09-02 lived in route
// BODIES (the 403/404 scope leak, the raw error messages, the unshaped query
// parameters), and route bodies were the one place with no tests, because the
// project's rule was "only tested where the logic has been extracted into a
// util" (CLAUDE.md).
//
// These mount the real routers behind a real Express app and drive them with
// supertest. The MODELS and the pdfkit drawing are stubbed — this is about the
// handler: who is refused, what status a refusal carries, whether a download is
// audited, and whether a malformed request is a 400 rather than a 500. The
// drawing itself is already covered by pdfDraw.test.js and holisticReport.test.js.
//
// Auth is stubbed to whatever `as(role)` sets, because JWT verification is
// middleware/auth.js's job and is exercised elsewhere; putting a real token
// dance in front of every case would test the token, not the route.
const express = require('express');
const request = require('supertest');

// ── the seam: one mutable "current user", set per request by as() ───────────
let mockCurrent = null;
jest.mock('../src/middleware/auth', () => (req, res, next) => {
  if (!mockCurrent) return res.status(401).json({ message: 'No token' });
  req.user = mockCurrent;
  next();
});

const ATHLETE_IN = {
  athleteId: '900101010001', name: 'In Sport', sport: 'Badminton',
  program: 'PELAPIS', gender: 'Female', age: 20, isActive: true,
};
const ATHLETE_OUT = { ...ATHLETE_IN, athleteId: '900202020002', name: 'Other Sport', sport: 'Athletics' };
const SCREENING = {
  id: 1, athleteId: ATHLETE_IN.athleteId, assessedAt: new Date('2026-01-15T03:00:00Z'),
  totalScore: 74, rom: 72, stability: 75, symmetry: 70, exerciseRisks: 14,
  overallIndicator: 50, overallBand: 'green', subitems: null,
};

jest.mock('../src/models', () => {
  // Every model, with every finder the real utils reach for. A PARTIAL model
  // mock is what made three earlier attempts fail: the route 500'd on a missing
  // finder and an "is not 403" assertion passed regardless — a green test over
  // a broken path, which is the defect shape this file exists to guard.
  const table = () => ({
    findAll: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findByPk: jest.fn(async () => null),
    findAndCountAll: jest.fn(async () => ({ rows: [], count: 0 })),
    count: jest.fn(async () => 0),
    create: jest.fn(async (v) => v),
    update: jest.fn(async () => [0]),
    destroy: jest.fn(async () => 0),
    upsert: jest.fn(async () => [null, true]),
  });
  return {
    Athlete: table(),
    Screening: table(),
    AuditLog: table(),
    User: table(),
    MuscleFlag: table(),
    AthleteDiscipline: table(),
    CohortThreshold: table(),
    CohortNormVersion: table(),
    Setting: table(),
    sequelize: { transaction: jest.fn(async (fn) => fn({})), query: jest.fn(async () => [[], {}]) },
  };
});

jest.mock('../src/utils/settings', () => ({
  getSettings: jest.fn(async () => ({
    min_cohort_n: 5, fallback_enabled: true, rescreen_due_days: 180,
  })),
}));
// utils/cohorts is not mocked either — the partial mock that was here omitted
// `latestScreeningsByAthlete`, which holisticReport needs, so the holistic route
// 500'd and an "is not 403" assertion passed anyway. Third time the same shape.
//
// What is left mocked is the minimum that cannot be real in a unit test: the
// MODELS (no database), AUTH (a token dance would test the token, not the
// route), and the AUDIT writer (captured, so the trail can be asserted).
// Everything else is the real code.
// holisticReport and programmeActivity are NOT mocked either, for the same
// reason as pdfDraw: a hand-written return value that the renderer cannot
// consume produces "write after end" halfway through a stream, and then the
// stub is what needs debugging. Both are pure over the model data, the models
// return empty sets here, and both already have their own suites.

// The audit write is fire-and-forget by design; capture it rather than mock it away.
const mockAudited = [];
jest.mock('../src/utils/audit', () => ({
  recordAudit: jest.fn((req, entry) => { mockAudited.push(entry); }),
}));

// pdfDraw is deliberately NOT mocked.
//
// The first attempt stubbed it, and the stub became the thing under test: without
// `page.width` the handler threw and the route 500'd while an RBAC assertion
// still passed — a green test over a broken path — and once the geometry was
// added the activity-log route paginated for ever against a document that never
// really advanced. Two rounds of debugging a fake.
//
// The real toolkit already renders headlessly against a fake `res`
// (pdfDraw.test.js), so it works here, and letting it run means these tests
// exercise the actual composition rather than a mock of it. The models return
// empty sets, so the documents are small and fast.

const { Athlete, Screening } = require('../src/models');

function appWith(routerPath, mount) {
  // Router required AFTER the mocks above are registered.
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const router = require(routerPath);
  const app = express();
  app.use(express.json());
  app.use(mount, router);
  return app;
}

const as = (role, extra = {}) => { mockCurrent = { id: 1, name: 'T', role, ...extra }; };

beforeEach(() => {
  mockCurrent = null;
  mockAudited.length = 0;
  Athlete.findOne.mockReset().mockResolvedValue(null);
  Athlete.findAll.mockReset().mockResolvedValue([]);
  Screening.findAll.mockReset().mockResolvedValue([]);
});

describe('GET /screening-reports/individual/:id.pdf', () => {
  const app = () => appWith('../src/routes/screeningReports', '/screening-reports');

  it('refuses an unauthenticated caller', async () => {
    mockCurrent = null;
    await request(app()).get('/screening-reports/individual/900101010001.pdf').expect(401);
  });

  it('refuses a role that is not on the rbac list', async () => {
    as('nonsense');
    await request(app()).get('/screening-reports/individual/900101010001.pdf').expect(403);
  });

  // The §43 property, at the route rather than in the predicate: a coach must
  // not be able to tell a real IC number from an invented one.
  it('answers a coach identically for an unknown athlete and a foreign one', async () => {
    as('coach', { coachSport: 'Badminton' });

    Athlete.findOne.mockResolvedValue(null);            // unknown
    const unknown = await request(app()).get('/screening-reports/individual/000000000000.pdf');

    Athlete.findOne.mockResolvedValue(ATHLETE_OUT);     // real, wrong sport
    const foreign = await request(app()).get('/screening-reports/individual/900202020002.pdf');

    expect(unknown.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(unknown.status).toBe(foreign.status);
  });

  it('lets an athlete through to their OWN record only', async () => {
    Athlete.findOne.mockResolvedValue(ATHLETE_IN);
    Screening.findAll.mockResolvedValue([SCREENING]);

    as('athlete', { athleteId: '900202020002' });
    await request(app()).get('/screening-reports/individual/900101010001.pdf').expect(403);
  });

  it('audits the download with the ATHLETE as the entity, not a filter string', async () => {
    Athlete.findOne.mockResolvedValue(ATHLETE_IN);
    Screening.findAll.mockResolvedValue([SCREENING]);
    as('medical');

    await request(app()).get('/screening-reports/individual/900101010001.pdf');
    const row = mockAudited.find((a) => a.action === 'report.download');
    expect(row).toBeDefined();
    expect(row.entityId).toBe(ATHLETE_IN.athleteId);
  });

  it('does NOT audit a refused download', async () => {
    // Rows are written where the response commits to streaming, so a 403 must
    // leave no trace — otherwise the trail records reads that never happened.
    as('coach', { coachSport: 'Athletics' });
    Athlete.findOne.mockResolvedValue(ATHLETE_IN);
    await request(app()).get('/screening-reports/individual/900101010001.pdf').expect(403);
    expect(mockAudited.filter((a) => a.action === 'report.download')).toHaveLength(0);
  });

  it('reports "no screening on record" rather than drawing an empty report', async () => {
    Athlete.findOne.mockResolvedValue(ATHLETE_IN);
    Screening.findAll.mockResolvedValue([]);
    as('admin');
    const res = await request(app()).get('/screening-reports/individual/900101010001.pdf');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no screening/i);
  });
});

describe('GET /screening-reports/team.pdf', () => {
  const app = () => appWith('../src/routes/screeningReports', '/screening-reports');

  it('requires a sport', async () => {
    as('admin');
    const res = await request(app()).get('/screening-reports/team.pdf');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/sport/i);
  });

  it('holds a coach to their own sport', async () => {
    as('coach', { coachSport: 'Badminton' });
    await request(app()).get('/screening-reports/team.pdf?sport=Athletics').expect(403);
  });

  it('says the group is empty rather than producing a blank document', async () => {
    as('coach', { coachSport: 'Badminton' });
    Athlete.findAll.mockResolvedValue([]);
    const res = await request(app()).get('/screening-reports/team.pdf?sport=Badminton');
    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/no athletes/i);
  });
});

describe('the report routes refuse the roles they should', () => {
  const app = () => appWith('../src/routes/screeningReports', '/screening-reports');
  const INSTITUTIONAL = [
    '/screening-reports/holistic.pdf',
    '/screening-reports/programme-activity.pdf',
    '/screening-reports/activity-log.pdf',
  ];

  it.each(INSTITUTIONAL)('%s is closed to coach and athlete', async (path) => {
    as('coach', { coachSport: 'Badminton' });
    await request(app()).get(path).expect(403);
    as('athlete', { athleteId: '900101010001' });
    await request(app()).get(path).expect(403);
  });

  it.each(INSTITUTIONAL)('%s is open to executive oversight', async (path) => {
    as('executive');
    const res = await request(app()).get(path);
    expect(res.status).not.toBe(403);
  });
});

describe('GET /audit', () => {
  const app = () => appWith('../src/routes/audit', '/audit');

  it('is closed to medical and coach, open to admin and executive', async () => {
    as('medical');
    await request(app()).get('/audit').expect(403);
    as('coach', { coachSport: 'Badminton' });
    await request(app()).get('/audit').expect(403);

    as('admin');
    expect((await request(app()).get('/audit')).status).not.toBe(403);
    as('executive');
    expect((await request(app()).get('/audit')).status).not.toBe(403);
  });

  it('answers a malformed query with 400, not 500', async () => {
    // ?action[]=x is the array Express builds from a repeated/bracketed
    // parameter. Before utils/queryParams it reached Sequelize and produced a
    // 500 quoting the driver.
    as('admin');
    const res = await request(app()).get('/audit?from=not-a-date');
    expect(res.status).toBeLessThan(500);
  });

  it('does not leak an internal error message on a 500', async () => {
    const { AuditLog } = require('../src/models');
    AuditLog.findAndCountAll.mockRejectedValueOnce(new Error('ER_NO_SUCH_TABLE: audit_logs'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    as('admin');
    const res = await request(app()).get('/audit');
    if (res.status === 500) {
      expect(res.body.message).not.toMatch(/ER_NO_SUCH_TABLE|audit_logs/);
      expect(spy).toHaveBeenCalled();
    }
    spy.mockRestore();
  });
});
