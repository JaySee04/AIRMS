// Structured logging, so an incident can be read by a machine.
//
// WHY THIS EXISTS (2026-09-09). An operational review found 63 `console.*` calls
// and no logger. On a laptop that is fine — a human reads the terminal. On the
// hosted instance it is not: the API runs serverless, its output goes to a
// platform log viewer, and "[athletes.js] TypeError: ..." cannot be filtered by
// severity, grouped by route, or alerted on. The failure mode is not a missing
// message; it is a message nobody can find among thousands.
//
// NO NEW DEPENDENCY, deliberately. pino or winston would each add a tree to a
// project whose whole shape is "self-contained packages, no root workspace"
// (see the shared-facts note in CLAUDE.md). One line of JSON per event is the
// part of a logging library that actually matters here, and it is forty lines.
//
// WHAT MUST NEVER BE LOGGED, and this is the rule that matters most in a
// clinical system: no athlete names, no IC numbers, no clinician notes, no
// screening scores, no tokens, no request bodies. An audit trail is the
// deliberate, access-controlled record of who did what (utils/audit.js); a log
// is an operational artefact that lands in a third-party viewer with far weaker
// access control. Log IDENTIFIERS and OUTCOMES, never the clinical content.
// `redact()` below is the enforcement, and it fails closed.

// Fields whose values are dropped wherever they appear, matched case-insensitively
// on the KEY. Names, ICs and notes are the disclosure risk; tokens and passwords
// are the security one.
const FORBIDDEN_KEY = /(name|athleteid|ic|note|token|password|secret|email|body|score|band)/i;
// NOTE `ic` is a substring match on purpose, so `nric`, `icNumber` and
// `athleteIc` are all caught. It also catches innocent keys containing "ic"
// (`metric`, `clinicId`) — over-redaction is the correct direction here, and
// the cost is a log field reading `[redacted]` rather than a disclosure.

// Values that look like a credential regardless of their key.
const SECRET_SHAPED = /^(Bearer\s|eyJ[\w-]+\.)/i;

/**
 * Strip anything that must not reach a log line.
 *
 * Fails CLOSED: an unrecognised object is replaced rather than serialised, so a
 * future caller passing a whole Sequelize row cannot leak a roster through it.
 */
function redact(fields) {
  if (!fields || typeof fields !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) {
    if (FORBIDDEN_KEY.test(k)) { out[k] = '[redacted]'; continue; }
    if (typeof v === 'string') {
      out[k] = SECRET_SHAPED.test(v) ? '[redacted]' : v.slice(0, 200);
    } else if (typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v;
    } else {
      // Arrays, dates, model instances, nested objects: not worth the risk.
      // Mutation-checked — replacing this with JSON.stringify(v) fails the
      // "handed an object whole" test, which is the realistic accident.
      out[k] = `[${Array.isArray(v) ? 'array' : typeof v}]`;
    }
  }
  return out;
}

// UTC, always. Logs are correlated against platform timestamps and other
// services, none of which are in the institution's zone — this is the one place
// in AIRMS where INSTITUTION_TZ is deliberately NOT used. Screening DATES are a
// different question and are handled in utils/dates.js.
const line = (level, event, fields) => JSON.stringify({
  ts: new Date().toISOString(),
  level,
  event,
  ...redact(fields),
});

// stdout for normal events, stderr for problems — the split every log collector
// already understands, and the reason a 500 still reaches `console.error`.
/* eslint-disable no-console */
const info = (event, fields) => console.log(line('info', event, fields));
const warn = (event, fields) => console.warn(line('warn', event, fields));
const error = (event, fields) => console.error(line('error', event, fields));
/* eslint-enable no-console */

module.exports = { info, warn, error, redact };
