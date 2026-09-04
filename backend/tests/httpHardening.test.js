// What a failed request tells its caller, and what shape a query parameter has
// to be before it reaches a query.
//
// Both were measured against the running server before these existed:
//
//   GET /athletes/analytics/periods?from=not-a-date
//     -> 500  "Incorrect DATETIME value: 'Invalid date'"
//   GET /athletes?gender[$ne]=Male
//     -> 500  "Invalid value { '$ne': 'Male' }"
//   GET /athletes?sport[]=Badminton&sport[]=Athletics
//     -> 200, 28 rows   (an undocumented multi-select nobody designed)
//   GET /athletes?search=%25
//     -> 200, every athlete on the roster   (% is a LIKE wildcard)
//
// None is an injection — Sequelize parameterises, and the operator object was
// rejected rather than executed. They are all the same underlying miss: nothing
// asserted the shape of the input, so a library's defaults decided what
// happened, and a malformed REQUEST was reported as a SERVER fault while naming
// the engine that produced it.
const fs = require('fs');
const path = require('path');
const { sendError, expose, GENERIC } = require('../src/utils/httpError');
const {
  str, num, date, likeTerm, badRequest, assertPlainQuery,
} = require('../src/utils/queryParams');

const fakeRes = () => {
  const r = { statusCode: null, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.set = (k, v) => { r.headers[k] = v; return r; };
  return r;
};

describe('sendError', () => {
  const realConsoleError = console.error;
  beforeEach(() => { console.error = jest.fn(); });
  afterEach(() => { console.error = realConsoleError; });

  it('never hands a 500s internals to the caller', () => {
    const res = fakeRes();
    sendError(res, new Error("Incorrect DATETIME value: 'Invalid date'"), 'test');
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(GENERIC);
    expect(res.body.message).not.toMatch(/DATETIME|Invalid date/);
  });

  it('logs the real error server-side, so a 500 is still diagnosable', () => {
    const res = fakeRes();
    sendError(res, new Error('ER_NO_SUCH_TABLE: screenings'), 'athletes.js');
    expect(console.error).toHaveBeenCalled();
    const logged = console.error.mock.calls[0][0];
    expect(logged).toMatch(/athletes\.js/);
    expect(logged).toMatch(/ER_NO_SUCH_TABLE/);
  });

  it('passes a 4xx through, because a 4xx was written for the reader', () => {
    const res = fakeRes();
    sendError(res, badRequest('"from" must be a valid date'), 'test');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('"from" must be a valid date');
  });

  it('passes an explicitly exposed error through whatever its status', () => {
    // The operator uploading a PDF needs to know WHY it failed.
    const res = fakeRes();
    sendError(res, expose(new Error('Could not render any pages from the PDF'), 502), 'upload.js');
    expect(res.statusCode).toBe(502);
    expect(res.body.message).toMatch(/Could not render/);
  });

  it('does not log an error it chose to share — it is not a fault', () => {
    const res = fakeRes();
    sendError(res, badRequest('bad'), 'test');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('treats a nonsense status as a 500 rather than emitting it', () => {
    const res = fakeRes();
    const err = new Error('boom');
    err.status = 99;
    sendError(res, err, 'test');
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(GENERIC);
  });
});

describe('query parameter shapes', () => {
  it('accepts a plain string', () => {
    expect(str('Badminton', 'sport')).toBe('Badminton');
    expect(str('  Badminton  ', 'sport')).toBe('Badminton');
  });

  it('treats absent and empty as absent', () => {
    expect(str(undefined, 'sport')).toBeUndefined();
    expect(str('', 'sport')).toBeUndefined();
    expect(str('   ', 'sport')).toBeUndefined();
  });

  it('rejects the array Express builds from ?sport[]=', () => {
    expect(() => str(['a'], 'sport')).toThrow(/"sport" must be a single value/);
    expect(() => str(['a', 'b'], 'sport')).toThrow();
  });

  it('rejects the object Express builds from ?sport[$ne]=', () => {
    expect(() => str({ $ne: 'Male' }, 'gender')).toThrow(/"gender" must be a single value/);
  });

  it('gives those refusals a 400, not a 500', () => {
    try {
      str(['a'], 'sport');
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.status).toBe(400);
    }
  });

  it('num rejects what would otherwise reach a query as NaN', () => {
    expect(num('12', 'limit')).toBe(12);
    expect(num(undefined, 'limit')).toBeUndefined();
    expect(() => num('notanumber', 'limit')).toThrow(/"limit" must be a number/);
    expect(() => num(['1'], 'limit')).toThrow(/single value/);
  });

  it('date rejects what MySQL would answer with Incorrect DATETIME value', () => {
    expect(date('2026-01-01', 'from')).toBeInstanceOf(Date);
    expect(date(undefined, 'from')).toBeUndefined();
    expect(() => date('not-a-date', 'from')).toThrow(/"from" must be a valid date/);
  });
});

describe('likeTerm', () => {
  it('escapes the wildcards, so a search for % is a search for %', () => {
    expect(likeTerm('%')).toBe('\\%');
    expect(likeTerm('_')).toBe('\\_');
    expect(likeTerm('a%b_c')).toBe('a\\%b\\_c');
  });

  it('escapes the escape character itself', () => {
    expect(likeTerm('a\\b')).toBe('a\\\\b');
  });

  it('leaves an ordinary name alone', () => {
    expect(likeTerm('Nur Aina')).toBe('Nur Aina');
    expect(likeTerm('890202021001')).toBe('890202021001');
  });
});

// The utils are pure and pass whether or not a route calls them — the failure
// mode this repo keeps producing. These read the sources.
describe('wiring', () => {
  const read = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

  it('no route hands back a raw error message on a 500', () => {
    const dir = path.join(__dirname, '..', 'src', 'routes');
    const offenders = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      if (/res\s*\.?\s*status\(\s*(500|err\.status \|\| 500)\s*\)[^\n]*message:\s*(err|e)\.message/.test(src)) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every route file that can fail uses the boundary', () => {
    const dir = path.join(__dirname, '..', 'src', 'routes');
    const files = fs.readdirSync(dir).filter((x) => x.endsWith('.js'));
    const using = files.filter((f) => fs.readFileSync(path.join(dir, f), 'utf8').includes('sendError('));
    // Every route file in this project has at least one failable handler.
    expect(using.length).toBe(files.length);
  });

  it('the roster filters are shape-checked and the search term escaped', () => {
    const src = read('routes', 'athletes.js');
    expect(src).toMatch(/str\(req\.query\.sport, 'sport'\)/);
    expect(src).toMatch(/str\(req\.query\.gender, 'gender'\)/);
    expect(src).toMatch(/const term = likeTerm\(search\)/);
    // and the unescaped form is gone
    expect(src).not.toMatch(/Op\.like\]: `%\$\{search\}%`/);
  });

  it('programme activity validates its dates rather than passing them to the driver', () => {
    const src = read('utils', 'programmeActivity.js');
    expect(src).toMatch(/date\(from, 'from'\)/);
    expect(src).toMatch(/date\(to, 'to'\)/);
    expect(src).not.toMatch(/Op\.gte\] = new Date\(from\)/);
  });
});

// ── the guard must hold on BOTH platforms ───────────────────────────────────
//
// str() catches what Express makes of a bracket locally — an array from
// `?p[]=x`, an object from `?p[k]=y`. The hosted runtime does not parse the
// bracket at all: the key arrives as the literal string `p[]`, so `req.query.p`
// is undefined, the filter is skipped, and the endpoint answers 200 with
// everything.
//
// Measured against the live API on 2026-09-03: `?gender[$ne]=Male` gave 400
// locally and 200 with all 62 athletes hosted, from the same commit. The guard
// held where it was tested and nowhere else, which is worse than no guard —
// the test reported success.
describe('assertPlainQuery — bracketed KEYS, not just parsed values', () => {
  it('accepts an ordinary query', () => {
    expect(() => assertPlainQuery({ sport: 'Badminton', gender: 'Female' })).not.toThrow();
    expect(() => assertPlainQuery({})).not.toThrow();
    expect(() => assertPlainQuery(undefined)).not.toThrow();
  });

  it('rejects the literal key the hosted runtime produces', () => {
    // This is the shape str() cannot see: the value is fine, the KEY is not.
    expect(() => assertPlainQuery({ 'sport[]': 'Badminton' })).toThrow(/"sport" must be a single value/);
    expect(() => assertPlainQuery({ 'gender[$ne]': 'Male' })).toThrow(/"gender" must be a single value/);
  });

  it('gives it a 400, because the request is what is malformed', () => {
    try {
      assertPlainQuery({ 'sport[]': 'x' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e.status).toBe(400);
    }
  });

  it('is wired into the roster route, before any filter is read', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'athletes.js'), 'utf8',
    );
    const at = src.indexOf('assertPlainQuery(req.query)');
    expect(at).toBeGreaterThan(-1);
    // and it runs BEFORE the filters are pulled out, or it guards nothing
    expect(at).toBeLessThan(src.indexOf("str(req.query.sport, 'sport')"));
  });
});

// ── the temporary migration endpoint ────────────────────────────────────────
//
// routes/migrate.js exists because the hosted database's credentials are
// write-only in Vercel, so the index could not be applied from a development
// machine (DEPLOY.md). It alters schema, which is not something this system
// should carry permanently, and the safety argument for adding it rests
// entirely on it being short-lived.
//
// "Temporary" written in a comment is a wish. This is the thing that makes it
// true: the endpoint must be admin-only while it exists, and it must be gone
// once REMOVE_AFTER passes. A forgotten endpoint is precisely the silent
// failure this project keeps finding — nothing breaks, it just quietly stays.
describe('the temporary migration endpoint', () => {
  const fs = require('fs');
  const path = require('path');
  const routeFile = path.join(__dirname, '..', 'src', 'routes', 'migrate.js');
  const serverFile = path.join(__dirname, '..', 'src', 'server.js');

  // The index was applied to the hosted database on 2026-09-04. There is no
  // second use for this endpoint, so the deadline is short on purpose.
  const REMOVE_AFTER = new Date('2026-09-11T00:00:00Z');

  const exists = fs.existsSync(routeFile);

  it('is gone, or has not yet outstayed its welcome', () => {
    if (!exists) return; // removed — which is the desired end state
    // If this fails: delete backend/src/routes/migrate.js, its two lines in
    // server.js, and this describe block. The migration is already applied;
    // keeping the endpoint buys nothing and costs a schema-mutating route.
    expect({ removeBy: REMOVE_AFTER.toISOString(), stillPresent: Date.now() < REMOVE_AFTER.getTime() })
      .toEqual({ removeBy: REMOVE_AFTER.toISOString(), stillPresent: true });
  });

  it('is admin-only on both verbs while it does exist', () => {
    if (!exists) return;
    const src = fs.readFileSync(routeFile, 'utf8');
    const routes = [...src.matchAll(/router\.(get|post)\(/g)];
    expect(routes.length).toBeGreaterThan(0);
    // Every route in the file carries auth + rbac('admin'). Asserted by
    // counting rather than by reading one of them, so a third route added
    // without a guard cannot hide behind two that have one.
    expect((src.match(/auth, rbac\('admin'\)/g) || []).length).toBe(routes.length);
  });

  it('runs the shared migration util, not its own copy of the SQL', () => {
    if (!exists) return;
    const src = fs.readFileSync(routeFile, 'utf8');
    expect(src).toContain("require('../utils/screeningUniqueIndex')");
    // The route file contains NO SQL of its own — every statement lives in the
    // shared util, which is idempotent and refuses rather than half-applying.
    //
    // Asserted as "no query call" rather than "no dangerous keyword": the
    // keyword version matched this file's own comment saying it contains no
    // DROP or DELETE, and matched the audit action `settings.update`. A check
    // that fires on prose is a check that gets deleted.
    const code = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/sequelize\.query\s*\(/);
    expect(code).not.toMatch(/ALTER\s+TABLE/i);
  });

  it('is mounted and unmounted together — no orphan require', () => {
    const server = fs.readFileSync(serverFile, 'utf8');
    const required = server.includes("require('./routes/migrate')");
    const mounted = server.includes("app.use('/api/migrate'");
    expect({ required, mounted, file: exists }).toEqual({ required: exists, mounted: exists, file: exists });
  });
});
