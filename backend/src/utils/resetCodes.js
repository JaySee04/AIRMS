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
 * Seven days is the ceiling NIST SP 800-63A sets for an enrollment code, and
 * it is a ceiling rather than a target — the standing exposure of a live code
 * is the cost being paid for the convenience. What makes six digits acceptable
 * across that window is not the digits, it is MAX_ATTEMPTS below: five guesses
 * against a million values is a 1-in-200,000 chance before the code burns,
 * and it burns whether or not the attacker is the intended recipient.
 */
const INVITE_CODE_TTL_MIN = 7 * 24 * 60;

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
