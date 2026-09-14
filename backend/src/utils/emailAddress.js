// What counts as an email address AIRMS will send a credential to.
//
// A TYPO CATCHER, NOT AN AUTHENTICITY CHECK. No regex decides whether an
// address exists or belongs to the person named; only a round trip does, and
// AIRMS's round trip IS the activation code. The bar is "could this be
// delivered at all", and the failure it prevents is `nurin@isn.gov` reaching a
// real stranger rather than bouncing.
//
// That matters here more than it usually would. §85 shortened the invitation
// TTL to 24 hours and §88 added a confirm step, both citing an address "typed
// by an administrator and validated by nothing" — and neither validated it.
// Measured on 2026-09-13, every one of these was ACCEPTED and stored:
// "not-an-email", "jc@@isn", "a b@c.d", "<script>@x.com". See DD §97.1.
//
// RFC 5322 is deliberately not implemented: the canonical regex for it is
// ~6,000 characters, and every practical attempt either rejects real addresses
// or accepts nonsense anyway.
//
// Escaping is NOT this file's job and must not become it — React escapes by
// construction, the PDF path goes through `winAnsiSafe`, and SQL is
// parameterised by Sequelize. A validator that doubles as a sanitiser is how a
// codebase ends up with two half-answers to injection instead of one whole one.

/** The longest address we store. Matches `users.email` VARCHAR(160). */
const MAX_LENGTH = 160;

// One "@", no spaces, a dotted domain, a 2+ letter TLD, no leading/trailing/
// doubled dot. The local part keeps "+", which this project's own deliverable
// inboxes depend on (poseidonapollo11+coach@gmail.com) — a rule rejecting it
// would break three seeded accounts, which is the usual way an over-strict
// email regex is discovered.
//
// The nested quantifier `[X]+(?:\.[X]+)*` is the catastrophic-backtracking
// shape, so it was TIMED rather than assumed: 0.0003 ms/call against
// backtracking-bait inputs at the length cap. `MAX_LENGTH` is checked BEFORE
// this runs, which is what bounds it — keep that order.
const SHAPE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * Validate an email address for storage.
 *
 * Returns `null` on pass and a human-readable sentence on failure — the same
 * contract as `validatePassword`, so the two read alike where both are called.
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function validateEmail(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'Email is required.';
  const email = value.trim();
  if (email.length > MAX_LENGTH) return `Email must be at most ${MAX_LENGTH} characters.`;
  if (!SHAPE.test(email)) return 'That does not look like an email address — check for a typo.';
  return null;
}

/**
 * The form an address is STORED in: trimmed and lower-cased.
 *
 * Not cosmetic. `users.email` is UNIQUE and the sign-in lookup lower-cases what
 * it is given, so storing `Nurin@isn.gov.my` creates a row the unique index
 * treats as distinct from `nurin@isn.gov.my` while login finds neither
 * reliably — an account that exists and cannot be signed into.
 *
 * @param {string} value
 */
function normalizeEmail(value) {
  return String(value).trim().toLowerCase();
}

module.exports = { validateEmail, normalizeEmail, MAX_LENGTH };
