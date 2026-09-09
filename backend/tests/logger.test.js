// The logger, and specifically what it must REFUSE to write.
//
// A log line in this system is a different object from an audit row. The audit
// trail is the deliberate, access-controlled record of who did what; a log is an
// operational artefact that lands in a platform viewer with far weaker access
// control and a much longer retention. So the interesting tests here are not
// "does it log" — they are "does an athlete's name reach the log when a careless
// caller passes a whole row".
//
// It fails CLOSED: anything it does not positively recognise as safe is replaced
// rather than serialised.

const logger = require('../src/utils/logger');

describe('logger.redact — the clinical disclosure guard', () => {
  it('drops the fields that identify an athlete', () => {
    const out = logger.redact({
      name: 'Nur Aina Danish',
      athleteId: '070202021001',
      ic: '890202021001',
      route: '/api/athletes',
    });
    expect(out.name).toBe('[redacted]');
    expect(out.athleteId).toBe('[redacted]');
    expect(out.ic).toBe('[redacted]');
    // The operational field survives — a redactor that drops everything is
    // useless and would just push people back to console.log.
    expect(out.route).toBe('/api/athletes');
  });

  it('drops clinical content, not just identifiers', () => {
    // A name is the obvious leak. A band and a score are the subtle one: they
    // are the athlete's clinical status, and paired with any other log line
    // carrying a route or a timestamp they re-identify.
    const out = logger.redact({ band: 'red', score: 41, note: 'cleared to train' });
    expect(out.band).toBe('[redacted]');
    expect(out.score).toBe('[redacted]');
    expect(out.note).toBe('[redacted]');
  });

  it('drops credentials by KEY and by SHAPE', () => {
    const out = logger.redact({
      token: 'abc',
      password: 'hunter2',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y',
      jwt: 'eyJhbGciOiJIUzI1NiJ9.aaa.bbb',
    });
    expect(out.token).toBe('[redacted]');
    expect(out.password).toBe('[redacted]');
    // `authorization` is not in the forbidden-key list, so this one is caught
    // by the VALUE shape — which is the case that protects against a key nobody
    // thought of.
    expect(out.authorization).toBe('[redacted]');
    expect(out.jwt).toBe('[redacted]');
  });

  it('refuses to serialise an object it was handed whole', () => {
    // The realistic accident: `logger.error('failed', { athlete })`. Serialising
    // that would put an entire roster row in a log line. It becomes a type name.
    const out = logger.redact({
      row: { name: 'X', ic: '900101015555', totalScore: 77 },
      rows: [{ name: 'Y' }, { name: 'Z' }],
      when: new Date('2026-07-29'),
    });
    expect(out.row).toBe('[object]');
    expect(out.rows).toBe('[array]');
    expect(out.when).toBe('[object]');
    expect(JSON.stringify(out)).not.toMatch(/900101015555|totalScore|"Y"|"Z"/);
  });

  it('truncates long strings so one line cannot carry a payload', () => {
    const out = logger.redact({ detail: 'x'.repeat(5000) });
    expect(out.detail.length).toBe(200);
  });

  it('survives a non-object without throwing', () => {
    // Logging must never be the thing that takes a request down.
    expect(logger.redact(null)).toEqual({});
    expect(logger.redact('nope')).toEqual({});
    expect(logger.redact(undefined)).toEqual({});
  });
});

describe('logger output shape', () => {
  const capture = (fn) => {
    const lines = [];
    const streams = ['log', 'warn', 'error'];
    const originals = streams.map((s) => console[s]);
    streams.forEach((s) => { console[s] = (l) => lines.push(l); });
    try { fn(); } finally { streams.forEach((s, i) => { console[s] = originals[i]; }); }
    return lines;
  };

  it('writes one parseable JSON line per event', () => {
    const [line] = capture(() => logger.info('import.committed', { count: 3 }));
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.event).toBe('import.committed');
    expect(parsed.count).toBe(3);
  });

  it('timestamps in UTC, not the institution zone', () => {
    // Deliberate divergence from utils/dates.js. Logs correlate against platform
    // timestamps and other services; screening DATES belong to ISN's calendar.
    const [line] = capture(() => logger.info('x'));
    expect(JSON.parse(line).ts).toMatch(/Z$/);
  });

  it('sends errors to stderr and info to stdout', () => {
    // The split every log collector already understands. If these ever converge,
    // severity filtering stops working in the hosted viewer.
    const seen = {};
    const originals = { log: console.log, error: console.error };
    console.log = () => { seen.stdout = true; };
    console.error = () => { seen.stderr = true; };
    try {
      logger.info('a');
      logger.error('b');
    } finally {
      console.log = originals.log;
      console.error = originals.error;
    }
    expect(seen.stdout).toBe(true);
    expect(seen.stderr).toBe(true);
  });
});
