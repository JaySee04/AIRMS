// WHEN IS A RATE-LIMIT READING WORTH A VERDICT? (§141)
//
// verify:claims checks two properties of the deployed login throttle by reading
// the `RateLimit` header across consecutive requests. The counter is keyed per
// IP, so anything else calling the same host moves it: one run reported 11/12
// and five re-runs could not reproduce it, because `verify:reports --hosted`
// was signing in 25 times alongside.
//
// The predicate deciding "measurable or not" cannot be tested through the script
// — that needs a live hosted instance — which is precisely how an inverted one
// would hide. Inverted, it skips ALWAYS, and the two claims that exist because
// SILENT_FAILURES 3r happened would never run again, reporting "not measurable
// here" for ever in a way nobody would question.

const {
  fieldOf, remainingOf, limitOf, resetOf, readingPair,
} = require('../scripts/lib/rateLimitReading');

const H = (remaining, reset = 899, limit = 30) => `limit=${limit}, remaining=${remaining}, reset=${reset}`;

describe('rate-limit header parsing', () => {
  test('reads all three fields off a real header', () => {
    const h = 'limit=30, remaining=29, reset=899';
    expect(limitOf(h)).toBe(30);
    expect(remainingOf(h)).toBe(29);
    expect(resetOf(h)).toBe(899);
  });

  test('a zero is a reading, not an absence', () => {
    // The counter at zero is exactly when these claims matter most. `?? 0` on
    // reset and a falsy check anywhere else would erase it.
    expect(remainingOf('limit=30, remaining=0, reset=12')).toBe(0);
  });

  test('an absent header is null, never a number', () => {
    expect(remainingOf(null)).toBeNull();
    expect(limitOf(undefined)).toBeNull();
    expect(fieldOf('limit=30', 'remaining')).toBeNull();
  });

  test('reset defaults to 0 so a missing one cannot manufacture a roll', () => {
    expect(resetOf(null)).toBe(0);
    expect(readingPair('limit=30, remaining=29', 'limit=30, remaining=28').windowRolled).toBe(false);
  });

  test('does not match a field whose name is a suffix of another', () => {
    // `remaining=` must not be found by looking for `aining=`, and more to the
    // point a future `reset-after=` must not be read as `reset`.
    expect(fieldOf('limit=30, remaining=29', 'ing')).toBeNull();
  });
});

describe('readingPair: a quiet machine', () => {
  test('exactly one failed sign-in spent is measurable', () => {
    const p = readingPair(H(29), H(28));
    expect(p.drop).toBe(1);
    expect(p.windowRolled).toBe(false);
    expect(p.contended).toBe(false);
    expect(p.limit).toBe(30);
  });

  test('carries the limit forward, because a cleared counter is limit-1', () => {
    // The old assertion was `rAfter >= r1`, which a HALF-cleared counter passes.
    // Checking a clear needs to know what cleared looks like.
    expect(readingPair(H(14), H(13)).limit).toBe(30);
  });
});

describe('readingPair: the reading is not ours', () => {
  test('a drop of two means somebody else spent budget', () => {
    // The measured case: a second paced caller alongside the check took
    // `remaining 24 -> 22`, and both claims correctly reported NOT MEASURABLE.
    const p = readingPair(H(24), H(22));
    expect(p.drop).toBe(2);
    expect(p.contended).toBe(true);
  });

  test('no drop at all is contention too, not a passed property', () => {
    expect(readingPair(H(29), H(29)).contended).toBe(true);
  });

  test('a RISING remaining is contention, not a negative drop to reason about', () => {
    expect(readingPair(H(20), H(27)).contended).toBe(true);
  });

  test('a rolled window invalidates a reading that otherwise looks perfect', () => {
    // This is the one a drop test alone cannot see. The contender log caught it
    // live: reset 815 -> 899 with remaining back at 29. Here the drop IS one,
    // so only the reset comparison separates it from a clean reading.
    const p = readingPair(H(29, 815), H(28, 899));
    expect(p.drop).toBe(1);
    expect(p.windowRolled).toBe(true);
    expect(p.contended).toBe(true);
  });

  test('a FALLING reset is the window ticking down, which is normal', () => {
    // Guards the comparison direction. `!==` instead of `>` would call every
    // ordinary pair of requests a rolled window and skip for ever.
    const p = readingPair(H(29, 899), H(28, 897));
    expect(p.windowRolled).toBe(false);
    expect(p.contended).toBe(false);
  });

  test('an unreadable header is unmeasurable, never a violation', () => {
    const p = readingPair(null, H(28));
    expect(p.drop).toBeNull();
    expect(p.contended).toBe(true);
  });
});
