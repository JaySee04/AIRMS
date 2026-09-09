// The database-backed rate-limit store.
//
// This guards the login boundary, so the two properties that matter pull in
// opposite directions and both have to be asserted:
//
//   1. It must actually LIMIT. A store that silently never counts is this
//      project's defect class applied to brute-force protection — the docs would
//      still say "30 failures / 15 min" and nothing would enforce it.
//   2. It must FAIL OPEN. If the settings table is unreachable, a login must
//      still be possible; failing closed turns a database hiccup into "nobody at
//      ISN can sign in", which is worse and happens on demo morning.
//
// The models are mocked, so this runs without a database like the rest of the
// suite.

const mockRows = new Map();
let mockFailMode = null; // 'read' | 'write' | null

jest.mock('../src/models', () => ({
  Setting: {
    findOne: jest.fn(async ({ where }) => {
      if (mockFailMode === 'read') throw new Error('settings table unreachable');
      return mockRows.has(where.key) ? { key: where.key, value: mockRows.get(where.key) } : null;
    }),
    findOrCreate: jest.fn(async ({ where, defaults }) => {
      if (mockFailMode === 'write') throw new Error('settings table unreachable');
      if (mockRows.has(where.key)) {
        const key = where.key;
        return [{ update: async ({ value }) => mockRows.set(key, value) }, false];
      }
      mockRows.set(where.key, defaults.value);
      return [{ update: async ({ value }) => mockRows.set(where.key, value) }, true];
    }),
    destroy: jest.fn(async ({ where }) => {
      const keys = Array.isArray(where.key) ? where.key : [where.key];
      keys.forEach((k) => mockRows.delete(k));
    }),
    findAll: jest.fn(async () => [...mockRows.entries()].map(([key, value]) => ({ key, value }))),
  },
}));

const { SettingsRateLimitStore, pruneRateLimits, keyFor, PREFIX } = require('../src/utils/rateLimitStore');

beforeEach(() => { mockRows.clear(); mockFailMode = null; });

describe('it actually limits', () => {
  it('counts consecutive hits from the same address', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    const seen = [];
    for (let i = 0; i < 5; i += 1) seen.push((await store.increment('10.0.0.1')).totalHits);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });

  it('counts different addresses separately', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    await store.increment('10.0.0.1');
    await store.increment('10.0.0.1');
    const other = await store.increment('10.0.0.2');
    expect(other.totalHits).toBe(1);
  });

  it('survives a "restart" — the count is in the table, not the process', async () => {
    // The whole point of the change. A new store object over the same table must
    // continue the count, because on the hosted instance every cold start and
    // every extra serverless invocation is exactly this.
    const first = new SettingsRateLimitStore();
    first.init({ windowMs: 60_000 });
    await first.increment('10.0.0.9');
    await first.increment('10.0.0.9');

    const second = new SettingsRateLimitStore();
    second.init({ windowMs: 60_000 });
    expect((await second.increment('10.0.0.9')).totalHits).toBe(3);
  });

  it('starts a fresh window once the old one expires', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 1 });
    await store.increment('10.0.0.3');
    await new Promise((r) => { setTimeout(r, 5); });
    expect((await store.increment('10.0.0.3')).totalHits).toBe(1);
  });

  it('reports a resetTime the limiter can hand to the caller', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    const { resetTime } = await store.increment('10.0.0.4');
    expect(resetTime instanceof Date).toBe(true);
    expect(resetTime.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('skipSuccessfulRequests support', () => {
  it('decrement gives the budget back after a successful login', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    await store.increment('10.0.0.5');
    await store.increment('10.0.0.5');
    await store.decrement('10.0.0.5');
    expect((await store.increment('10.0.0.5')).totalHits).toBe(2);
  });

  it('never counts below zero', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    await store.increment('10.0.0.6');
    await store.decrement('10.0.0.6');
    await store.decrement('10.0.0.6');
    expect((await store.increment('10.0.0.6')).totalHits).toBe(1);
  });

  it('resetKey clears an address entirely', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    await store.increment('10.0.0.7');
    await store.resetKey('10.0.0.7');
    expect((await store.increment('10.0.0.7')).totalHits).toBe(1);
  });
});

describe('it fails OPEN, loudly', () => {
  it('allows the request when the table cannot be read', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    mockFailMode = 'read';
    // Must not throw — a throwing store surfaces as a 500 on /api/auth/login.
    const res = await store.increment('10.0.0.8');
    expect(res.totalHits).toBe(1);
  });

  it('allows the request when the table cannot be written', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    mockFailMode = 'write';
    await expect(store.increment('10.0.0.8')).resolves.toBeDefined();
  });
});

describe('the address is hashed, not stored', () => {
  it('never writes the raw IP as the key', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    await store.increment('203.0.113.42');
    const keys = [...mockRows.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0].startsWith(PREFIX)).toBe(true);
    // An IP is personal data under the PDPA. The stored key must not contain it.
    expect(keys[0]).not.toContain('203.0.113.42');
  });

  it('is stable for one address and different across addresses', async () => {
    expect(keyFor('1.1.1.1')).toBe(keyFor('1.1.1.1'));
    expect(keyFor('1.1.1.1')).not.toBe(keyFor('1.1.1.2'));
  });

  it('is keyed on the secret, so the hash cannot be matched against a candidate list', () => {
    const before = keyFor('8.8.8.8');
    const original = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'a-different-secret';
    const after = keyFor('8.8.8.8');
    process.env.JWT_SECRET = original;
    expect(after).not.toBe(before);
  });
});

describe('housekeeping', () => {
  it('prunes only expired counters', async () => {
    const store = new SettingsRateLimitStore();
    store.init({ windowMs: 60_000 });
    await store.increment('10.0.1.1');           // live
    mockRows.set(`${PREFIX}deadbeefdeadbeef`, { hits: 9, resetAt: Date.now() - 1000 }); // expired

    const removed = await pruneRateLimits();
    expect(removed).toBe(1);
    expect(mockRows.has(`${PREFIX}deadbeefdeadbeef`)).toBe(false);
    expect([...mockRows.keys()]).toHaveLength(1);
  });

  it('treats a malformed row as prunable rather than crashing', async () => {
    mockRows.set(`${PREFIX}garbage`, 'not-an-object');
    await expect(pruneRateLimits()).resolves.toBe(1);
  });
});
