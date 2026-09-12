// One-time email codes, and the rules that govern them.
//
// Extracted from routes/auth.js so the INVITE flow can mint a code without a
// second copy of the generator, the hash or the attempt limit. Two definitions
// of "what a one-time code is" is how an invitation ends up weaker than a
// password reset — same failure shape as the band vocabulary and the indicator
// list, and the reason both of those live in one module each.
//
// The code is stored as a SHA-256 hash and never in the clear: a database dump
// must not hand somebody a working credential. Hashing is unsalted and fast on
// purpose — this is a six-digit value with a five-attempt ceiling and a short
// life, so the defence is the attempt limit, not the cost of the hash. A slow
// KDF here would buy nothing and cost a second of latency per verification.
const crypto = require('crypto');

/** Reset: the user asked for this seconds ago and is sitting on the page. */
const RESET_CODE_TTL_MIN = 10;

/**
 * Invitation: the recipient did NOT ask for it and may be in a clinic, a
 * meeting, or on leave. Ten minutes would produce an invitation that is
 * expired before it is read.
 *
 * TWENTY-FOUR HOURS, WHICH IS THE STANDARD'S FIGURE (changed 2026-09-12; it was
 * 7 days, and before 2026-09-09 the comment here claimed 7 days WAS the
 * standard's figure, which was simply wrong).
 *
 * SP 800-63-4 (July 2025, superseding the 2017 Rev 3) caps a confirmation code
 * by DELIVERY CHANNEL in Vol. A §3.8: 21 days by post within the contiguous US,
 * 30 days outside it, 10 minutes by SMS or voice, and **24 hours to a validated
 * email address**. AIRMS emails it. The 7-day figure came from Rev 3, where it
 * applied to a code handed over IN PERSON — and Rev 4 does not specify an
 * in-person period at all, so the number originally cited no longer exists in
 * the standard.
 *
 * WHY THE 7-DAY DEVIATION WAS DROPPED RATHER THAN DEFENDED. Two things, one
 * measured and one read:
 *
 *   1. The usability case for it was that a clinician invited on a Friday can
 *      still act on it on Monday, and /activate said an expired code means
 *      "ask the administrator". MEASURED 2026-09-12: an invited-but-never-
 *      activated account is `isActive`, so the ordinary forgot-password flow
 *      works on it — `POST /auth/forgot-password` for such an account issues a
 *      live reset code (verified: a wrong OTP came back "4 attempts remaining",
 *      which only happens when a code is actually on the row). So the remedy
 *      for an expired invitation is self-service, already built, already
 *      hardened at 10 minutes and five attempts, and needs no administrator.
 *      The cost the deviation was buying does not exist.
 *
 *   2. The standard's 24 hours applies to a code sent to a VALIDATED email
 *      address. AIRMS's address is typed by an administrator and is validated
 *      by nothing, so a typo delivers a credential-establishing code to a
 *      stranger — and the TTL is exactly the window in which it sits there
 *      unattended. An unvalidated address argues for the SHORTER window, not a
 *      longer one. The deviation was resting on the weaker half of the
 *      comparison.
 *
 * What remains true, and is why six digits is enough: the code is single-use,
 * it grants no access on its own (until it is used the account has no working
 * password at all, so this is an ENROLMENT risk rather than an authentication
 * one), and MAX_ATTEMPTS below burns it after five wrong guesses — a
 * 1-in-200,000 chance against a million values, whoever is guessing.
 *
 * Reverting is this one constant plus the /activate copy. See
 * docs/fyp/REFERENCES.md §4 and DESIGN_DECISIONS.md §85.
 */
const INVITE_CODE_TTL_MIN = 24 * 60;

const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_VERIFY_TOKEN_TTL_MIN = 5;
const RESET_VERIFY_TOKEN_BYTES = 32;

/** A six-digit code, uniformly distributed. `randomInt` is CSPRNG-backed. */
const generateResetCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const hashResetCode = (raw) => crypto.createHash('sha256').update(String(raw)).digest('hex');

/**
 * Put a fresh code on a user and return the raw value to be emailed.
 *
 * Resets the attempt counter, because a new code that inherited the old one's
 * failed attempts could be dead on arrival — and an invitation nobody can
 * complete looks to the recipient exactly like a system that does not work.
 *
 * Does NOT save; the caller decides when to persist, so this can join a larger
 * transaction such as creating the user and inviting them in one step.
 */
function issueCode(user, { ttlMinutes = RESET_CODE_TTL_MIN } = {}) {
  const code = generateResetCode();
  user.resetTokenHash = hashResetCode(code);
  user.resetTokenExpiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  user.resetCodeAttempts = 0;
  return code;
}

module.exports = {
  generateResetCode,
  hashResetCode,
  issueCode,
  RESET_CODE_TTL_MIN,
  INVITE_CODE_TTL_MIN,
  RESET_CODE_MAX_ATTEMPTS,
  RESET_VERIFY_TOKEN_TTL_MIN,
  RESET_VERIFY_TOKEN_BYTES,
};
