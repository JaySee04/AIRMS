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
const { str, num, date, likeTerm, badRequest } = require('../src/utils/queryParams');

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
