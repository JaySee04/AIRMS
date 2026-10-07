// Is a pair of RateLimit readings worth drawing a conclusion from? (§141)
//
// `RateLimit: limit=30, remaining=29, reset=899`
//
// verify:claims checks two properties of the deployed login throttle — a failed
// sign-in spends budget, a successful one gives it back — by reading that header
// across consecutive requests. Both assume the counter moved because WE moved it,
// and the counter is keyed per IP, so that assumption is false whenever anything
// else is calling the same host: `verify:reports --hosted` signs in 25 times,
// hosted e2e five more.
//
// It cost one run reporting 11/12 that five re-runs could not reproduce. A
// one-off that will not come back is the worst thing a check can emit — there is
// nothing to diagnose and nothing to dismiss — and the honest verdict was never
// FAIL. It was NOT MEASURABLE (rule 2, pointing the way it is usually not read:
// do not report RED off a reading you could not take either).
//
// This lives here, apart from the script, so it can be unit-tested and mutated.
// verify:claims itself needs a live hosted instance and cannot be, which is how
// a predicate that silently inverted — skipping always, so the two claims 3r
// exists for would never run again — would go unnoticed.

// The key is anchored at its START, not merely found. An unanchored `limit=`
// matches inside a hypothetical `burst-limit=5` and an unanchored `ing=` matches
// inside `remaining=29` — a parser that silently reads the wrong field is rule
// 5's "a wrong key reads as zero, and zero is the most believable wrong answer
// there is", one layer lower down. Found by a test asserting it could not.
const fieldOf = (header, key) => {
  if (!header) return null;
  const m = header.match(new RegExp(`(?:^|[^\\w-])${key}=(\\d+)`));
  return m ? Number(m[1]) : null;
};

const remainingOf = (header) => fieldOf(header, 'remaining');
const limitOf = (header) => fieldOf(header, 'limit');

// Absent `reset` reads as 0 for both headers, so it cannot manufacture a roll.
const resetOf = (header) => fieldOf(header, 'reset') ?? 0;

/**
 * Compare two consecutive failed-login readings.
 *
 * From a quiet machine the drop is exactly one. Anything else means another
 * caller spent the same budget. Separately, `reset` RISING means the 15-minute
 * window rolled between the two reads, which invalidates the comparison just as
 * surely and looks nothing like contention — a rolled window sends `remaining`
 * back UP, so without this check it reads as a negative drop.
 *
 * @returns {{ r1: number|null, r2: number|null, limit: number|null,
 *             drop: number|null, windowRolled: boolean, contended: boolean }}
 */
function readingPair(h1, h2) {
  const r1 = remainingOf(h1);
  const r2 = remainingOf(h2);
  const drop = r1 !== null && r2 !== null ? r1 - r2 : null;
  const windowRolled = resetOf(h2) > resetOf(h1);
  return {
    r1,
    r2,
    limit: limitOf(h1),
    drop,
    windowRolled,
    // A missing header gives drop === null, which is !== 1, so an unreadable
    // reading is treated as unmeasurable rather than as a violation. That is
    // the wanted behaviour and not an accident of the comparison.
    contended: drop !== 1 || windowRolled,
  };
}

module.exports = { fieldOf, remainingOf, limitOf, resetOf, readingPair };
