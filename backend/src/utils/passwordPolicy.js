// Password policy applied wherever a user sets or changes their password.
// Returns null on pass, or a human-readable error message on the first failed
// rule. The same rule set is mirrored in the frontend's inline checklist
// (frontend/src/lib/passwordPolicy.ts) — keep both in sync if you edit.

const MIN_LENGTH = 10;
const MAX_LENGTH = 128;

// One character class per regex. The "symbol" class is everything that's not
// alphanumeric, which keeps the policy locale-friendly and avoids having to
// curate a finite symbol set.
const HAS_UPPER = /[A-Z]/;
const HAS_LOWER = /[a-z]/;
const HAS_DIGIT = /[0-9]/;
const HAS_SYMBOL = /[^A-Za-z0-9]/;

function validatePassword(password) {
  if (typeof password !== 'string') return 'Password is required.';
  if (password.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters.`;
  if (password.length > MAX_LENGTH) return `Password must be at most ${MAX_LENGTH} characters.`;
  if (!HAS_UPPER.test(password))  return 'Password must include at least one uppercase letter.';
  if (!HAS_LOWER.test(password))  return 'Password must include at least one lowercase letter.';
  if (!HAS_DIGIT.test(password))  return 'Password must include at least one number.';
  if (!HAS_SYMBOL.test(password)) return 'Password must include at least one symbol (e.g. ! @ # $).';
  return null;
}

module.exports = { validatePassword, MIN_LENGTH };
