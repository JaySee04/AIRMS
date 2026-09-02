// Query parameters are attacker-shaped until proved otherwise.
//
// Express parses `?sport[]=x` into an ARRAY and `?sport[$ne]=y` into an OBJECT,
// and both were reaching Sequelize unexamined. Measured against the running
// server before this existed:
//
//   ?sport[]=Badminton&sport[]=Athletics  ->  200, 28 rows
//        an undocumented multi-value filter nobody designed, tested or
//        described in the report
//   ?gender[$ne]=Male                     ->  500 "Invalid value { '$ne': 'Male' }"
//        Sequelize refused it, correctly — but a malformed REQUEST answered
//        with a SERVER error, and the driver's own words as the explanation
//
// Neither is an injection: Sequelize parameterises, and the object form was
// rejected rather than executed. Both are the same underlying miss, though —
// nothing asserted the SHAPE of the input, so what happened next was decided by
// a library's defaults rather than by this codebase.
//
// `str()` is the whole fix: a query parameter is a string or it is absent. A
// caller sending anything else gets a 400 naming the parameter, which is the
// truthful status — the request was malformed, the server was not.

/** A 400 that carries its own message to the caller (see utils/httpError.js). */
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

/**
 * A query parameter as a trimmed string, or undefined when absent.
 * Throws a 400 for an array or object — the shapes Express produces from
 * `?p[]=` and `?p[k]=`.
 *
 * @param {unknown} value  req.query.something
 * @param {string} name    for the error message
 */
function str(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw badRequest(`"${name}" must be a single value`);
  }
  const t = value.trim();
  return t === '' ? undefined : t;
}

/**
 * A query parameter as a finite number, or undefined.
 * Rejects arrays, objects and things like "notanumber" rather than letting
 * NaN reach a LIMIT or a comparison, where it silently means something else.
 */
function num(value, name) {
  const s = str(value, name);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!Number.isFinite(n)) throw badRequest(`"${name}" must be a number`);
  return n;
}

/**
 * A query parameter as a Date, or undefined.
 *
 * `new Date('not-a-date')` is an Invalid Date, which Sequelize passes to MySQL
 * and MySQL rejects with `Incorrect DATETIME value` — a 500 for what is plainly
 * a bad request, and one that named the engine while it did so.
 */
function date(value, name) {
  const s = str(value, name);
  if (s === undefined) return undefined;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw badRequest(`"${name}" must be a valid date`);
  return d;
}

/**
 * Escape the LIKE metacharacters in a user's search term.
 *
 * Searching for `%` matched every athlete on the roster, and `_` matches any
 * single character — so a clinician searching an IC number containing `_` got
 * quietly wrong results. Not a security hole; a correctness one, and invisible
 * because "more rows than expected" looks like a generous search.
 *
 * The escape character is declared to MySQL by the caller via ESCAPE '\\', which
 * is Sequelize's default for LIKE.
 */
function likeTerm(value) {
  return String(value).replace(/[\\%_]/g, (c) => `\\${c}`);
}

module.exports = {
  str, num, date, likeTerm, badRequest,
};
