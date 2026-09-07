// The personal watchlist (Module 6's last deferred item).
//
// The list logic is where this can go quietly wrong: a duplicate that makes a
// row appear twice, an order that shuffles under the reader, a cap that silently
// drops the entry somebody just added, or a malformed stored value that takes
// out a dashboard. None of those throw; all of them look like a working feature.
//
// Setting is mocked, so this runs with no database — the same approach
// holisticReport.test.js takes with the models.
jest.mock('../src/models/Setting', () => {
  const store = new Map();
  return {
    __store: store,
    findByPk: jest.fn(async (key) => (store.has(key) ? { key, value: store.get(key) } : null)),
    upsert: jest.fn(async ({ key, value }) => { store.set(key, value); return [null, true]; }),
  };
});

const Setting = require('../src/models/Setting');
const {
  getWatchlist, setWatchlist, addToWatchlist, removeFromWatchlist, keyFor, MAX_ENTRIES,
} = require('../src/utils/watchlist');

beforeEach(() => { Setting.__store.clear(); });

describe('an absent list reads as empty, never as a failure', () => {
  // A personal shortcut must never be the reason a dashboard fails to load.
  it('returns [] when the user has never starred anything', async () => {
    expect(await getWatchlist(7)).toEqual([]);
  });

  it.each([null, undefined])('returns [] for a missing user id (%p)', async (id) => {
    expect(await getWatchlist(id)).toEqual([]);
  });

  it.each([
    ['a JSON object instead of an array', { a: 1 }],
    ['a bare string', 'ATH1'],
    ['a number', 42],
    ['null', null],
  ])('survives %s in storage', async (_label, stored) => {
    Setting.__store.set(keyFor(1), stored);
    expect(await getWatchlist(1)).toEqual([]);
  });

  it('drops non-string entries rather than rendering them', async () => {
    // A row like this can only arrive by hand-editing, but the cost of tolerating
    // it is one filter and the cost of not is a crash on a clinician's dashboard.
    Setting.__store.set(keyFor(1), ['890202021001', 42, null, { id: 'x' }, '070202021001']);
    expect(await getWatchlist(1)).toEqual(['890202021001', '070202021001']);
  });

  it('parses a value stored as a JSON string', async () => {
    // MySQL JSON columns come back parsed, but a driver or a hand-written row can
    // hand back the raw text. Both mean the same thing to the reader.
    Setting.__store.set(keyFor(1), JSON.stringify(['890202021001']));
    expect(await getWatchlist(1)).toEqual(['890202021001']);
  });
});

describe('adding and removing are idempotent', () => {
  // Starring twice is a double-click, not an error.
  it('adds once however many times it is called', async () => {
    await addToWatchlist(1, 'A');
    await addToWatchlist(1, 'A');
    await addToWatchlist(1, 'A');
    expect(await getWatchlist(1)).toEqual(['A']);
  });

  it('removes an id that is not there without complaining', async () => {
    await addToWatchlist(1, 'A');
    expect(await removeFromWatchlist(1, 'B')).toEqual(['A']);
    expect(await removeFromWatchlist(1, 'A')).toEqual([]);
    expect(await removeFromWatchlist(1, 'A')).toEqual([]);
  });
});

describe('the reader\'s own order survives', () => {
  it('keeps insertion order rather than sorting', async () => {
    // The list is a working note. Re-ordering it under the reader — alphabetically,
    // or by band — would move the row they were about to click.
    for (const id of ['C', 'A', 'B']) await addToWatchlist(1, id);
    expect(await getWatchlist(1)).toEqual(['C', 'A', 'B']);
  });

  it('removing from the middle does not disturb the rest', async () => {
    for (const id of ['C', 'A', 'B']) await addToWatchlist(1, id);
    await removeFromWatchlist(1, 'A');
    expect(await getWatchlist(1)).toEqual(['C', 'B']);
  });

  it('deduplicates a wholesale set, keeping the FIRST occurrence', async () => {
    expect(await setWatchlist(1, ['A', 'B', 'A', 'C', 'B'])).toEqual(['A', 'B', 'C']);
  });
});

describe('one account cannot grow an unbounded blob', () => {
  it(`refuses past ${MAX_ENTRIES}, and says so rather than silently dropping`, async () => {
    await setWatchlist(1, Array.from({ length: MAX_ENTRIES }, (_, i) => `A${i}`));
    // The failure mode this guards: an add that returns success and does nothing,
    // so the star lights up and the entry is not there on reload.
    await expect(addToWatchlist(1, 'ONE_TOO_MANY')).rejects.toThrow(/at most/i);
    expect((await getWatchlist(1)).includes('ONE_TOO_MANY')).toBe(false);
  });

  it('the refusal is exposed, so the operator sees the real sentence', async () => {
    await setWatchlist(1, Array.from({ length: MAX_ENTRIES }, (_, i) => `A${i}`));
    // utils/httpError only keeps a message when the error says it is safe to.
    await expect(addToWatchlist(1, 'X')).rejects.toMatchObject({ status: 400, expose: true });
  });
});

describe('lists are per user', () => {
  it('does not leak between accounts', async () => {
    await addToWatchlist(1, 'A');
    await addToWatchlist(2, 'B');
    expect(await getWatchlist(1)).toEqual(['A']);
    expect(await getWatchlist(2)).toEqual(['B']);
  });

  it('namespaces its key so it cannot collide with an institution setting', async () => {
    // getSettings() keeps only keys present in DEFAULTS and setSetting() refuses
    // unknown ones, so these rows are invisible to the admin Settings page. The
    // prefix is what keeps that true if a setting is ever named "watchlist".
    expect(keyFor(12)).toBe('watchlist:12');
    expect(keyFor(12).startsWith('watchlist:')).toBe(true);
  });
});
