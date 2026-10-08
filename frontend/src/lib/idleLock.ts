// THE IDLE LOCK: a device stays signed in, but not while nobody is there.
//
// §148. JC's decision is "log in once on a device and it stays" — the sign-in
// page redirects a live session straight to its dashboard. That is what you want
// on your own laptop and exactly what you do not want on a shared clinic
// terminal, where "stays signed in" means the next person to sit down gets a
// clinician's session with IC numbers on screen, and an IC encodes date of
// birth, birth state and sex (§43).
//
// So the 7-day token buys the convenience and this buys the safety back: after
// IDLE_MS with no interaction the session is cleared and the next screen is the
// sign-in form. OWASP's Session Management Cheat Sheet puts a normal office idle
// timeout at 15–30 minutes; published EHR guidance sits at 10–15 for clinical
// systems. 30 is the generous end of the office range, chosen because a
// clinician reading a long report is not idle in any sense that matters.
//
// WHAT THIS IS NOT. It is a CLIENT-side lock, so it is a usability-and-
// shoulder-surfing control, not a revocation: the JWT itself stays valid until
// it expires, and anyone holding a stolen copy is unaffected. Saying so plainly
// is the point — a lock described as more than it is would be worse than none.
// Real revocation needs server-side session state, which is a larger change than
// this (DESIGN_DECISIONS §148).

/** How long a device may sit untouched before the session is dropped. */
export const IDLE_MS = 30 * 60 * 1000;

/** Where the last-interaction stamp lives. Shared across tabs ON PURPOSE. */
export const IDLE_KEY = 'airms_last_active';

/**
 * Has the session gone stale?
 *
 * A MISSING OR UNREADABLE STAMP IS NOT IDLE. A session that has just been
 * created has no stamp yet, and treating "no stamp" as "expired" would log
 * every user out at the moment they signed in — the failure this predicate is
 * most likely to have, so it is the one most worth stating.
 */
export function isIdleExpired(stamp: string | null, now: number = Date.now()): boolean {
  if (!stamp) return false;
  const last = Number(stamp);
  if (!Number.isFinite(last) || last <= 0) return false;
  // A stamp in the FUTURE means a clock change, not activity from the future.
  // Treat it as fresh rather than expiring instantly on a machine whose clock
  // moved — the §51-family rule that a wrong clock must not be able to hide or
  // fabricate a verdict.
  if (last > now) return false;
  return now - last >= IDLE_MS;
}

/** Record interaction. Cheap enough to call on every event. */
export function touchIdle(now: number = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(IDLE_KEY, String(now));
  } catch {
    // Storage full or blocked: the lock degrades to "no lock" rather than
    // throwing inside an event handler on every mousemove.
  }
}

/** True when the stored stamp says this device has been left alone too long. */
export function idleExpiredNow(now: number = Date.now()): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isIdleExpired(localStorage.getItem(IDLE_KEY), now);
  } catch {
    return false;
  }
}

export function clearIdle(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(IDLE_KEY);
  } catch { /* see touchIdle */ }
}
