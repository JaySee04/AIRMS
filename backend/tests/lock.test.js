// The cross-process lock that makes "safe to run twice" true.
//
// Both properties asserted here are bugs that were WRITTEN, shipped into a
// passing race test, and only caught by checking the state afterwards:
//
//   1. RELEASE MUST COMPARE THROUGH JSON_UNQUOTE. `Setting.value` is a JSON
//      column, so `destroy({ where: { value: token } })` binds a plain string
//      against JSON and matches nothing. The first version acquired correctly
//      and never released — leaving a row that blocked the next send until the
//      TTL expired. The race test passed either way: exactly one process sent.
//      What failed was asserting the lock row was gone.
//
//   2. ACQUIRE MUST NOT SWALLOW EVERY INSERT ERROR. `settings` has NOT NULL
//      created_at/updated_at with no database default, so a hand-written INSERT
//      threw ER_NO_DEFAULT_FOR_FIELD — which a bare `catch { return null }` read
//      as "somebody else holds the lock". Every acquire would fail for ever, and
//      the digest would silently never send again, with the lock that exists to
//      protect it as the cause. Only a duplicate key means "lost the race".
//
// Both are invisible to a test that only checks the happy path, which is why
// these assert on the SQL issued and on the error that comes back out.

const { UniqueConstraintError } = require('sequelize');

const mockQuery = jest.fn();
const mockCreate = jest.fn();

jest.mock('../src/config/db', () => ({ sequelize: { query: (...a) => mockQuery(...a) } }));
jest.mock('../src/models', () => ({ Setting: { create: (...a) => mockCreate(...a) } }));

const { acquire, release, withLock } = require('../src/utils/lock');

const NOW = Date.parse('2026-08-19T12:00:00.000Z');
const freshValue = new Date(NOW - 1000).toISOString() + '#aaaaaaaaaaaa';
const staleValue = new Date(NOW - 60 * 60 * 1000).toISOString() + '#bbbbbbbbbbbb';

// The SELECT that every acquire starts with.
const selectReturns = (rows) => mockQuery.mockImplementationOnce(async () => rows);

beforeEach(() => {
  mockQuery.mockReset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({});
});

describe('acquire', () => {
  it('takes a free lock and returns a token', async () => {
    selectReturns([]);
    const token = await acquire('digest', { now: NOW });
    expect(token).toMatch(/^2026-08-19T12:00:00.000Z#[0-9a-f]{12}$/);
    expect(mockCreate).toHaveBeenCalledWith({ key: 'lock:digest', value: token });
  });

  it('returns null when another process holds a fresh lock', async () => {
    selectReturns([{ v: freshValue }]);
    expect(await acquire('digest', { now: NOW })).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);   // the SELECT only — no write
  });

  it('treats a duplicate key as losing the race, not as an error', async () => {
    selectReturns([]);
    mockCreate.mockRejectedValueOnce(new UniqueConstraintError({}));
    expect(await acquire('digest', { now: NOW })).toBeNull();
  });

  // Bug 2. A bare catch here disguises a broken INSERT as permanent contention.
  it('RE-THROWS any other insert failure instead of reporting contention', async () => {
    selectReturns([]);
    mockCreate.mockRejectedValueOnce(new Error("Field 'created_at' doesn't have a default value"));
    await expect(acquire('digest', { now: NOW })).rejects.toThrow(/created_at/);
  });

  it('takes over a lock older than the TTL', async () => {
    selectReturns([{ v: staleValue }]);
    mockQuery.mockImplementationOnce(async () => [undefined, 1]);   // CAS won
    const token = await acquire('digest', { now: NOW });
    expect(token).not.toBeNull();

    const [sql, opts] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/^UPDATE/);
    // Conditional on the exact stale value: two processes finding the same stale
    // lock must still produce exactly one winner.
    expect(sql).toContain('JSON_UNQUOTE(`value`) = ?');
    expect(opts.replacements).toContain(staleValue);
  });

  it('loses the takeover when another process got the stale lock first', async () => {
    selectReturns([{ v: staleValue }]);
    mockQuery.mockImplementationOnce(async () => [undefined, 0]);   // CAS affected nothing
    expect(await acquire('digest', { now: NOW })).toBeNull();
  });

  // An unparseable value cannot be aged, so it must be treated as abandoned —
  // otherwise one corrupt row deadlocks the digest permanently.
  it('treats an unparseable lock value as abandoned', async () => {
    selectReturns([{ v: 'not-a-timestamp' }]);
    mockQuery.mockImplementationOnce(async () => [undefined, 1]);
    expect(await acquire('digest', { now: NOW })).not.toBeNull();
  });
});

describe('release', () => {
  // Bug 1. The JSON column is why this cannot be a plain `where: { value }`.
  it('deletes through JSON_UNQUOTE, matching only its own token', async () => {
    mockQuery.mockImplementationOnce(async () => [undefined, 1]);
    expect(await release('digest', 'tok')).toBe(true);

    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/^DELETE/);
    expect(sql).toContain('JSON_UNQUOTE(`value`) = ?');
    expect(opts.replacements).toEqual(['lock:digest', 'tok']);
  });

  it('is a no-op without a token', async () => {
    expect(await release('digest', null)).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('withLock', () => {
  it('runs the body and releases afterwards', async () => {
    selectReturns([]);
    mockQuery.mockImplementationOnce(async () => [undefined, 1]);   // the release
    const out = await withLock('digest', async () => 'done');
    expect(out).toBe('done');
    expect(mockQuery.mock.calls[1][0]).toMatch(/^DELETE/);
  });

  it('returns onBusy without running the body when the lock is held', async () => {
    // `withLock` does not take a clock, so this one is fresh against the real
    // one - a fixed timestamp would age past the TTL and become a takeover.
    selectReturns([{ v: new Date().toISOString() + '#cccccccccccc' }]);
    const ran = jest.fn();
    const out = await withLock('digest', ran, { onBusy: { sent: false } });
    expect(out).toEqual({ sent: false });
    expect(ran).not.toHaveBeenCalled();
  });

  // A send that threw must be retryable on the next tick, not blocked until the
  // TTL expires.
  it('releases even when the body throws', async () => {
    selectReturns([]);
    mockQuery.mockImplementationOnce(async () => [undefined, 1]);
    await expect(withLock('digest', async () => { throw new Error('smtp died'); }))
      .rejects.toThrow('smtp died');
    expect(mockQuery.mock.calls[1][0]).toMatch(/^DELETE/);
  });
});
