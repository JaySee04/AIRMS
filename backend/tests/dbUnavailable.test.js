// WHAT AN UNAUTHENTICATED CALLER LEARNS WHEN THE DATABASE IS DOWN.
//
// vercel.json rewrites EVERY path to api/index.js, so this handler — not any
// route, and not any middleware — is the first thing every caller reaches. When
// it cannot get a connection it answers before `auth` has run, which makes its
// body the most widely readable string the API produces.
//
// It used to carry `detail: err.message`, the driver's own words. Measured
// against a real MySQL 8 on 2026-09-28:
//
//   wrong password -> "Access denied for user 'root'@'localhost' (using password: YES)"
//   refused        -> "connect ECONNREFUSED 127.0.0.1:3999"
//
// Hosted, the first reads `'avnadmin'@'<the function's egress address>'`: the
// database account name and where the API connects from. Aiven's free tier
// powers the database off when idle, so an outage is a routine state for this
// deployment and not a rare one — the disclosure was reachable by curling the
// site on a quiet afternoon.
//
// Driven rather than grepped. A source check would pass on a file that is never
// invoked, and this is a response body — the thing itself is testable.
//
// See DESIGN_DECISIONS §48 (a failed request reveals nothing it was not asked
// to) and §115.

const path = require('path');

const API = path.join(__dirname, '..', 'api', 'index.js');
const DB = path.join(__dirname, '..', 'src', 'config', 'db.js');

/** Minimal Node res double — api/index.js writes to the raw response. */
function fakeRes() {
  return {
    statusCode: null,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(s) { this.body = s == null ? '' : String(s); },
  };
}

describe('the 503 when the database cannot be reached', () => {
  let res;
  let logged;

  beforeEach(() => {
    jest.resetModules();
    logged = [];
    // `connectDB` is the only thing stubbed. The handler under test is the real
    // one, and so is dbErrorMessage — stubbing the module wholesale would test
    // the double.
    const real = jest.requireActual(DB);
    jest.doMock(DB, () => ({
      ...real,
      connectDB: jest.fn().mockRejectedValue(
        Object.assign(new Error("Access denied for user 'avnadmin'@'52.12.34.56' (using password: YES)"), {
          name: 'SequelizeConnectionError',
        }),
      ),
    }));
    jest.doMock(path.join(__dirname, '..', 'src', 'utils', 'logger.js'), () => ({
      info: () => {}, warn: () => {},
      error: (event, fields) => logged.push({ event, fields }),
      redact: (x) => x,
    }));
    // The Express app is never reached on this path and is expensive to build.
    jest.doMock(path.join(__dirname, '..', 'src', 'server.js'), () => jest.fn());
    res = fakeRes();
  });

  afterEach(() => jest.resetModules());

  const call = async () => {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const handler = require(API);
    await handler({ method: 'GET', url: '/api/athletes/890202021001' }, res);
    return res;
  };

  it('answers 503', async () => {
    expect((await call()).statusCode).toBe(503);
  });

  it('says the database is unavailable', async () => {
    // The caller is told the SHAPE of the problem, which is all they can act
    // on: come back later. Removing the message entirely would be its own
    // failure — an operator who reports "it said nothing" is no use.
    expect(JSON.parse((await call()).body)).toEqual({ message: 'Database unavailable' });
  });

  it('does NOT name the database account', async () => {
    const body = (await call()).body;
    expect(body).not.toMatch(/avnadmin|Access denied|using password/i);
  });

  it('does NOT name the address the API connects from', async () => {
    // The IC number in the request path is checked at the same time: it must
    // not be echoed either, in a body or anywhere else.
    const body = (await call()).body;
    expect(body).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    expect(body).not.toContain('890202021001');
  });

  it('carries NO field beyond the message', async () => {
    // Asserted as a whole object rather than by naming `detail`: the failure
    // being guarded is "something diagnostic got added back", and a check that
    // names one field only catches that field.
    expect(Object.keys(JSON.parse((await call()).body))).toEqual(['message']);
  });

  it('LOGS the detail, so the operator is not left in the dark', async () => {
    await call();
    const row = logged.find((l) => l.event === 'request.db_unavailable');
    expect(row).toBeTruthy();
    expect(row.fields.err).toMatch(/Access denied/);
  });

  it('logs the ROUTER, never the request path', async () => {
    // A full path carries an IC number and this line goes to a third-party log
    // viewer — SILENT_FAILURES 3w, the same rule server.js's last-resort
    // handler follows.
    await call();
    const row = logged.find((l) => l.event === 'request.db_unavailable');
    expect(row.fields.context).not.toContain('890202021001');
    expect(row.fields.context).toBe('GET /api');
  });
});

describe('dbErrorMessage — a diagnostic that actually says something', () => {
  // eslint-disable-next-line global-require
  const { dbErrorMessage } = require('../src/config/db');

  it('uses the error message when there is one', () => {
    expect(dbErrorMessage(new Error('Unknown database'))).toBe('Unknown database');
  });

  it('falls back to the CODE when Sequelize wraps an empty error', () => {
    // The commonest failure of all, and the one the old code printed as
    // "MySQL connection error: " with nothing after the colon. Reproduced from
    // a real SequelizeConnectionRefusedError: the wrapper has no message and
    // the mysql2 AggregateError beneath it has none either — the detail is in
    // `.code`.
    const parent = Object.assign(new Error(''), { code: 'ECONNREFUSED', syscall: 'connect' });
    const err = Object.assign(new Error(''), { name: 'SequelizeConnectionRefusedError', parent });
    expect(dbErrorMessage(err)).toBe('ECONNREFUSED (connect)');
  });

  it('prefers the parent message over a bare name', () => {
    const parent = new Error("Access denied for user 'root'@'localhost'");
    const err = Object.assign(new Error(''), { name: 'SequelizeConnectionError', parent });
    expect(dbErrorMessage(err)).toMatch(/Access denied/);
  });

  it('never returns an empty string', () => {
    // The property that matters. Every branch must produce SOMETHING, because
    // a blank reason at boot is indistinguishable from a truncated log.
    for (const e of [null, undefined, new Error(''), { name: 'Weird' }, {}]) {
      expect(dbErrorMessage(e)).toEqual(expect.any(String));
      expect(dbErrorMessage(e).length).toBeGreaterThan(0);
    }
  });
});
