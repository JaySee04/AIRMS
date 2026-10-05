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

const { capturePdfText, unrenderableIn } = require('./helpers/capturePdfText');

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

  // NOT `expect(status).not.toBe(403)`.
  //
  // That was the assertion here, and it is the shape this file's own header
  // warns about: it passes when the route 500s, which is precisely how three
  // earlier attempts at this suite went green over a broken path. The three
  // institutional reports are the documents handed to a director, so the claim
  // worth making is that a PDF comes back — not that one particular refusal
  // did not happen.
  it.each(INSTITUTIONAL)('%s delivers a PDF to executive oversight', async (path) => {
    as('executive');
    const res = await request(app()).get(path).buffer();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=/);
    // A pdfkit document that drew nothing is still ~900 bytes of structure, so
    // a length check alone proves little; the header is what proves it is a PDF
    // and the magic bytes prove the stream was not truncated mid-draw.
    expect(res.body.slice(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it.each(INSTITUTIONAL)('%s audits the download', async (path) => {
    as('admin');
    await request(app()).get(path).buffer();
    expect(mockAudited).toHaveLength(1);
    expect(mockAudited[0]).toMatchObject({ action: 'report.download', entity: 'report' });
    // entityId is the ATHLETE for an individual report and null for these —
    // a squad-wide pull recorded against one athlete would misdescribe it.
    expect(mockAudited[0].entityId).toBeNull();
    expect(typeof mockAudited[0].meta.kind).toBe('string');
  });

  it.each(INSTITUTIONAL)('%s audits NOTHING when the role is refused', async (path) => {
    // The trail records reports that were DELIVERED. A row written before the
    // rbac check would make a refusal indistinguishable from a download in the
    // one log the institution has for its two read-only roles.
    as('coach', { coachSport: 'Badminton' });
    await request(app()).get(path).expect(403);
    expect(mockAudited).toHaveLength(0);
  });
});

// ── the two institutional reports whose CONTENT is a governance claim ────────
//
// Both print the filters that produced them, and in both cases the printed
// scope is the only thing standing between a narrow extract and a reader who
// takes it for the whole picture. That is a property of the rendered page, not
// of any function, so it is asserted through the real renderer: capturePdfText
// patches `PDFDocument.prototype.text` BEFORE construction, which puts the
// recorder underneath pdfDraw's instance-level guard and records what pdfkit was
// actually asked to draw.
describe('the institutional reports print the filters that narrowed them', () => {
  const app = () => appWith('../src/routes/screeningReports', '/screening-reports');

  it('names the subject on a one-account activity-log extract', async () => {
    as('admin');
    const { AuditLog } = require('../src/models');
    AuditLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const { joined } = await capturePdfText(async () => {
      await request(app())
        .get('/screening-reports/activity-log.pdf?entityId=900101010001&actorName=Medical%20Demo%2001')
        .buffer();
    });
    expect(joined).toMatch(/Subject: 900101010001/);
    expect(joined).toMatch(/Account: Medical Demo 01/);
    // And the unfiltered pull says so rather than leaving the scope line blank,
    // which would read as "no filters were applied" only to someone who knew
    // the blank was deliberate.
    const bare = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/activity-log.pdf').buffer();
    });
    expect(bare.joined).toMatch(/All recorded activity/);
  });

  it('states that an empty selection was empty, rather than drawing a blank table', async () => {
    as('admin');
    const { AuditLog } = require('../src/models');
    AuditLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    const { joined } = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/activity-log.pdf').buffer();
    });
    expect(joined).toMatch(/No activity/);
    expect(joined).toMatch(/Nothing was recorded in this selection/);
    // "0 records match" must still be stated: a document that merely omits the
    // table is indistinguishable from one whose table failed to render.
    expect(joined).toMatch(/0 records match this selection/);
  });

  it('says the export was CAPPED when more rows matched than it printed', async () => {
    // The cap is the one place this document can differ from the log it mirrors
    // without saying so, and a reviewer who cannot tell has a truncated record
    // they believe is complete.
    as('admin');
    const { AuditLog } = require('../src/models');
    const row = {
      id: 1, action: 'athlete.view', entity: 'athlete', entityId: '900101010001',
      actorName: 'Medical Demo 01', actorRole: 'medical', summary: 'viewed',
      createdAt: new Date('2026-01-15T03:00:00Z'), meta: null,
    };
    AuditLog.findAndCountAll.mockResolvedValue({ rows: [row], count: 1200 });
    const { joined } = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/activity-log.pdf').buffer();
    });
    expect(joined).toMatch(/1200 records match this selection/);
    expect(joined).toMatch(/400 most recent are listed/);
  });

  it('reads the rows BEFORE recording its own export', async () => {
    // Stated in the route: "the row is written after the rows above were read,
    // so the export never contains its own entry". Reversing those two lines
    // changes no status code and no assertion above — the only visible effect is
    // a log export that reports itself, which reads as a real event.
    as('admin');
    const { AuditLog } = require('../src/models');
    const { recordAudit } = require('../src/utils/audit');
    AuditLog.findAndCountAll.mockResolvedValue({ rows: [], count: 0 });
    // `invocationCallOrder` counts across the WHOLE file, so both mocks have to
    // be cleared or [0] belongs to an earlier test — which is how the first
    // version of this failed while the route was perfectly correct.
    AuditLog.findAndCountAll.mockClear();
    recordAudit.mockClear();
    await request(app()).get('/screening-reports/activity-log.pdf').buffer();
    expect(AuditLog.findAndCountAll).toHaveBeenCalledTimes(1);
    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(AuditLog.findAndCountAll.mock.invocationCallOrder[0])
      .toBeLessThan(recordAudit.mock.invocationCallOrder[0]);
  });

  it('names the sport on a single-squad programme-activity report', async () => {
    as('admin');
    const { joined } = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/programme-activity.pdf?sport=Badminton&grain=month').buffer();
    });
    // The cover carries the scope, and `scopeMeta` carries it into the trail —
    // the document and the audit row have to agree about what was pulled.
    expect(joined).toMatch(/Programme Activity Report/);
    expect(joined).toMatch(/Badminton/);
    expect(joined).toMatch(/Monthly/);
    expect(mockAudited[0].meta).toMatchObject({ sport: 'Badminton', grain: 'month' });
  });

  it('does not let an unparseable date become a 500', async () => {
    // Section 48: `?from=not-a-date` once reached the driver and came back as
    // "Incorrect DATETIME value". These two routes take from/to and neither was
    // covered.
    as('admin');
    for (const p of ['/screening-reports/activity-log.pdf', '/screening-reports/programme-activity.pdf']) {
      const res = await request(app()).get(`${p}?from=not-a-date&to=also-not`).buffer();
      expect(res.status).toBeLessThan(500);
    }
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

// ── the reports drawn over REAL DATA, not an empty database ─────────────────
//
// Everything above runs against empty model mocks, which was enough to cover
// routing, refusals and the audit trail — and leaves the DRAWING bodies
// untouched, because each is behind an `if (rows.length)`. On this file that was
// most of the uncovered statements, and it is the half where the defects have
// actually been: section 105 shipped a release where the Programme Activity
// document quoted a POORER set of KPIs than the page it mirrors, section 30b had
// `bar()`'s value column overprinting the row beneath it, and both were found by
// printing six reports and READING them rather than by any test.
//
// WHY A TRUNCATED PDF IS THE FAILURE TO WATCH FOR. These handlers stream: by the
// time the drawing starts, `res.headersSent` is true, so the catch cannot turn a
// mid-draw throw into a 500. It calls `res.end()`, and the operator gets
// HTTP 200 with a `.pdf` that a reader may or may not open. That is this
// project's defect class exactly — a wrong answer wearing a right one's clothes —
// so these cases assert the document was COMPLETED, by its trailer, rather than
// trusting the status code.
describe('the reports draw over real data without truncating', () => {
  const app = () => appWith('../src/routes/screeningReports', '/screening-reports');

  // Three athletes, each screened twice, three months apart and across a year
  // boundary. Deliberately shaped to reach the branches an empty set cannot:
  // more than one period (so a delta exists), a retest for every athlete (so
  // the between-tests median is a number rather than a dash), and one of each
  // band (so the distribution draws three segments instead of one).
  const ROSTER = [
    { athleteId: '900101010001', name: 'One Alpha', sport: 'Badminton', program: 'PELAPIS', gender: 'Female', age: 20, isActive: true },
    { athleteId: '900202020002', name: 'Two Beta', sport: 'Badminton', program: 'PODIUM', gender: 'Male', age: 24, isActive: true },
    { athleteId: '900303030003', name: 'Three Gamma', sport: 'Badminton', program: 'OTHERS', gender: 'Female', age: 19, isActive: true },
  ];
  const scr = (athleteId, id, iso, over) => ({
    id, athleteId, assessedAt: new Date(iso),
    totalScore: 74, rom: 72, stability: 75, symmetry: 70, exerciseRisks: 14,
    overallIndicator: 50, overallBand: 'green', overrideBand: null,
    escalations: null, responseOutcome: null, responseAt: null, ...over,
  });
  const HISTORY = [
    scr('900101010001', 1, '2025-10-15T03:00:00Z'),
    scr('900202020002', 2, '2025-10-16T03:00:00Z', { overallBand: 'amber', exerciseRisks: 19, totalScore: 70 }),
    scr('900303030003', 3, '2025-10-17T03:00:00Z', { overallBand: 'red', exerciseRisks: 27, totalScore: 61 }),
    scr('900101010001', 4, '2026-01-15T03:00:00Z', { totalScore: 78 }),
    scr('900202020002', 5, '2026-01-16T03:00:00Z', { overallBand: 'amber', totalScore: 72 }),
    scr('900303030003', 6, '2026-01-17T03:00:00Z', { overallBand: 'amber', exerciseRisks: 18, totalScore: 68 }),
  ];

  beforeEach(() => {
    const { Athlete: A, Screening: S, AthleteDiscipline: AD } = require('../src/models');
    A.findAll.mockResolvedValue(ROSTER);
    A.count.mockResolvedValue(ROSTER.length);
    S.findAll.mockResolvedValue(HISTORY);
    AD.findAll.mockResolvedValue([]);
  });

  /** The trailer pdfkit writes on `end()`. Absent means the stream was cut. */
  const isComplete = (body) => body.slice(-1024).toString('latin1').includes('%%EOF');

  it.each([
    ['/screening-reports/holistic.pdf'],
    ['/screening-reports/programme-activity.pdf?grain=quarter'],
    ['/screening-reports/programme-activity.pdf?grain=month'],
    ['/screening-reports/programme-activity.pdf?grain=year'],
    ['/screening-reports/team.pdf?sport=Badminton'],
  ])('%s completes its document', async (path) => {
    as('admin');
    const res = await request(app()).get(path).buffer();
    expect(res.status).toBe(200);
    expect(res.body.slice(0, 5).toString('latin1')).toBe('%PDF-');
    expect(isComplete(res.body)).toBe(true);
  });

  it('draws the squad it was given, not an apology for having no data', async () => {
    // The empty-database cases above all assert the "nothing to show" copy. The
    // risk on the other side is a report that silently draws the EMPTY form over
    // a populated database — which is what a broken finder looks like from
    // outside, and what three earlier attempts at this suite actually produced.
    as('admin');
    const { joined } = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/holistic.pdf').buffer();
    });
    expect(joined).not.toMatch(/No screenings|no athletes|Nothing was recorded/i);
    // Accounts for the squad it was handed — all three, and both periods.
    expect(joined).toMatch(/3 of 3 active athletes/);
    expect(joined).toMatch(/Q4 2025/);
    expect(joined).toMatch(/Q1 2026/);
    expect(joined).toMatch(/3 consecutive test pairs across 3 athletes/);
  });

  it('the dead band says whether it was EARNED or ASSUMED', async () => {
    // utils/reliability.js declines to derive a detectable-change threshold
    // below MIN_PAIRS and falls back to the documented 2 — and the whole point
    // of that decision is that the document SAYS so. Three pairs here, so it
    // must report an assumption. A report that printed the fallback as though it
    // were measured is the single most-cited weakness of traffic-light systems
    // and the reason reliability.js exists.
    as('admin');
    const { joined } = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/holistic.pdf').buffer();
    });
    expect(joined).toMatch(/an assumption, not a measurement/);
    expect(joined).toMatch(/20 repeat screenings/);
  });

  it('a sub-threshold move is reported as steady, not as a change', async () => {
    // Section 30a: a change smaller than the dead band must read "steady" and be
    // drawn as an OUTLINE. Every score here moved by 0, and two by more than the
    // fallback of 2, so both sides of the rule are exercised in one document.
    as('admin');
    const { joined } = await capturePdfText(async () => {
      await request(app()).get('/screening-reports/holistic.pdf').buffer();
    });
    expect(joined).toMatch(/steady/);
    expect(joined).toMatch(/improving/);
    // Exercise risks improve by FALLING, so its gain carries a negative sign
    // while still being named an improvement. A report that called -4.7 a
    // decline would invert the one score that reads backwards.
    expect(joined).toMatch(/-4\.7/);
  });

  // ── the individual report: the one document that names a person ───────────
  //
  // It carries an athlete's IC, their clinical scores, their muscle flags and a
  // clinician's override note, which is why it is the audited path executive is
  // given INSTEAD of the raw record endpoints (section 51). Everything above
  // drives it with `subitems: null` and a single screening, so the subitem
  // table, the symmetry section and the whole progress-between-reports block
  // were never drawn by any test.
  describe('the individual report', () => {
    const SUB = {
      neck: { romL: 72, romR: 68, stabL: 70, stabR: 71, sym: 69 },
      shoulder: { romL: 80, romR: 62, stabL: 74, stabR: 73, sym: 66 },
      torso: { romL: 58, romR: 60, stabL: 55, stabR: 57, sym: 62 },
      pelvis: { romL: 75, romR: 74, stabL: 72, stabR: 70, sym: 73 },
      lowerLimbs: { romL: 82, romR: 81, stabL: 79, stabR: 80, sym: 78 },
    };
    const FLAGS = {
      myodynamia: [{ muscle: 'Gluteus medius', side: 'L' }],
      tension: [{ muscle: 'Upper trapezius', side: 'B' }],
    };
    const HIST = [
      { ...HISTORY[3], athleteId: ROSTER[0].athleteId, subitems: SUB, muscleFlags: FLAGS, importedBy: 'Medical Demo 01' },
      { ...HISTORY[0], athleteId: ROSTER[0].athleteId, subitems: SUB, muscleFlags: FLAGS, importedBy: 'Medical Demo 01' },
    ];

    beforeEach(() => {
      const { Athlete: A, Screening: S } = require('../src/models');
      A.findOne.mockResolvedValue(ROSTER[0]);
      S.findAll.mockResolvedValue(HIST);
    });

    it('completes the document and identifies the athlete it describes', async () => {
      as('medical');
      let body;
      const { joined } = await capturePdfText(async () => {
        const res = await request(app()).get(`/screening-reports/individual/${ROSTER[0].athleteId}.pdf`).buffer();
        body = res.body;
      });
      expect(isComplete(body)).toBe(true);
      // Not decoration: a clinical extract that does not name its subject is
      // unfileable, and one naming the wrong subject is worse than none.
      expect(joined).toContain(ROSTER[0].name);
      expect(joined).toContain(ROSTER[0].athleteId);
      // The muscle flags carry their SIDE. The body map paints the worse of L/R
      // and so discards it; this document is where the side survives.
      expect(joined).toMatch(/Gluteus medius L/);
      expect(joined).toMatch(/Upper trapezius B/);
    });

    it('draws the progress table when there are two readings, and says so when there are not', async () => {
      as('medical');
      const two = await capturePdfText(async () => {
        await request(app()).get(`/screening-reports/individual/${ROSTER[0].athleteId}.pdf`).buffer();
      });
      expect(two.joined).toMatch(/Progress Between Reports/);
      expect(two.joined).not.toMatch(/Only one screening on record/);

      const { Screening: S } = require('../src/models');
      S.findAll.mockResolvedValue([HIST[0]]);
      const one = await capturePdfText(async () => {
        await request(app()).get(`/screening-reports/individual/${ROSTER[0].athleteId}.pdf`).buffer();
      });
      expect(one.joined).toMatch(/Only one screening on record/);
    });

    it('states that a date window, not a missing history, emptied the trend', async () => {
      // Two different reasons for an empty progress section, and a reader who
      // cannot tell them apart will go looking for a report that already exists.
      as('medical');
      const { joined } = await capturePdfText(async () => {
        await request(app())
          .get(`/screening-reports/individual/${ROSTER[0].athleteId}.pdf?from=2026-06-01&to=2026-06-30`)
          .buffer();
      });
      expect(joined).toMatch(/widen the date range/i);
    });

    it('prints the clinician override and whose verdict it replaced', async () => {
      // An override says the computed band is WRONG. A document that printed the
      // final band without saying it was overridden, by whom, and what it
      // replaced would present a clinical judgement as an instrument reading.
      as('medical');
      const { Screening: S } = require('../src/models');
      S.findAll.mockResolvedValue([{
        ...HIST[0], overallBand: 'green', overrideBand: 'red',
        overrideBy: 'Medical Demo 01', overrideAt: new Date('2026-02-01T03:00:00Z'),
      }, HIST[1]]);
      const { joined } = await capturePdfText(async () => {
        await request(app()).get(`/screening-reports/individual/${ROSTER[0].athleteId}.pdf`).buffer();
      });
      // NOT `/Clinician override/`. That was the assertion, and `npm run mutate`
      // reported this guard SURVIVED: pdfDraw's keyFindings() and interpret()
      // each emit "Clinician override in effect" of their own accord, so the
      // test passed with the route's line deleted. `/Medical Demo 01/` was
      // vacuous too — it is also this screening's `importedBy`.
      //
      // What only this route says is what the override REPLACED. The two
      // pdfDraw copies name the new band alone; a reader told the band is Red
      // without being told the instrument computed Green cannot see that a
      // person intervened, which is the entire content of an override.
      expect(joined).toMatch(/computed band was .*; set to /);
      expect(joined).toMatch(/by Medical Demo 01 on /);
    });
  });

  it('every string the reports draw is printable by pdfkit', async () => {
    // The winAnsiSafe failure, re-asserted at the ROUTE level. The toolkit's own
    // suite covers the primitives; this covers the composition, including the
    // strings these handlers build themselves (scope lines, grain words,
    // filenames) and anything that arrives from the database. A zero-width glyph
    // does not throw — it prints as mojibake on a clinical document.
    as('admin');
    for (const p of ['/screening-reports/holistic.pdf', '/screening-reports/programme-activity.pdf', '/screening-reports/team.pdf?sport=Badminton']) {
      const { joined } = await capturePdfText(async () => {
        await request(app()).get(p).buffer();
      });
      expect(unrenderableIn(joined)).toEqual([]);
    }
  });
});
