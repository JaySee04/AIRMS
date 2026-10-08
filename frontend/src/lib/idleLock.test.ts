// THE IDLE LOCK'S PREDICATE (§148)
//
// A device stays signed in — that is JC's decision — so this is what stops a
// walked-away clinic terminal holding a clinician's session with IC numbers on
// screen until the 7-day token expires.
//
// Both failure directions are bad in different ways, which is why both are
// pinned here: locking too eagerly throws a clinician out mid-note and reads as
// "the login did not work"; never locking silently removes the only thing
// making "stay signed in" safe, and nothing on screen would say so.
import {
  IDLE_MS, isIdleExpired,
} from '@/lib/idleLock';

const NOW = 1_800_000_000_000;

describe('isIdleExpired', () => {
  test('a device just used is not idle', () => {
    expect(isIdleExpired(String(NOW), NOW)).toBe(false);
    expect(isIdleExpired(String(NOW - 60_000), NOW)).toBe(false);
  });

  test('a device left alone past the window IS idle', () => {
    expect(isIdleExpired(String(NOW - IDLE_MS), NOW)).toBe(true);
    expect(isIdleExpired(String(NOW - IDLE_MS - 1), NOW)).toBe(true);
    // The clinic case: closed on Friday, opened on Monday.
    expect(isIdleExpired(String(NOW - 3 * 24 * 60 * 60 * 1000), NOW)).toBe(true);
  });

  test('the boundary belongs to expired, and one millisecond inside does not', () => {
    expect(isIdleExpired(String(NOW - IDLE_MS + 1), NOW)).toBe(false);
    expect(isIdleExpired(String(NOW - IDLE_MS), NOW)).toBe(true);
  });

  test('NO STAMP IS NOT IDLE — this is the one that logs everyone out', () => {
    // A session that has just been created has no stamp yet. Treating absence
    // as expiry would sign every user out at the moment they signed in, which
    // is the most likely way to get this predicate wrong.
    expect(isIdleExpired(null, NOW)).toBe(false);
    expect(isIdleExpired('', NOW)).toBe(false);
  });

  test('an unreadable stamp is not idle either', () => {
    // localStorage is written by us but STORED BY THE BROWSER, so it comes back
    // as input (§111.6). Garbage must not be able to lock anybody out.
    for (const junk of ['abc', 'NaN', '{}', '-1', '0']) {
      expect(isIdleExpired(junk, NOW)).toBe(false);
    }
  });

  test('a stamp in the FUTURE does not expire instantly', () => {
    // A machine whose clock moved backwards would otherwise compute a huge
    // negative age... or, with a naive comparison, lock out at once. A wrong
    // clock must not be able to fabricate a verdict — the same rule
    // verify:claims pins for the change marker.
    expect(isIdleExpired(String(NOW + 60_000), NOW)).toBe(false);
    expect(isIdleExpired(String(NOW + 10 * IDLE_MS), NOW)).toBe(false);
  });

  test('the window is the documented 30 minutes', () => {
    // OWASP puts an office idle timeout at 15-30 min; EHR guidance at 10-15.
    // If this is ever retuned, the citation in §148 has to move with it.
    expect(IDLE_MS).toBe(30 * 60 * 1000);
  });
});
