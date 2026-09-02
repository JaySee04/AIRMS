// One place that decides what a failed request tells its caller.
//
// Every route ended `catch (err) { res.status(500).json({ message: err.message }) }`
// — 54 of them — which hands the driver's own words to whoever asked. Measured
// against the running server:
//
//   GET /athletes/analytics/periods?from=not-a-date
//     -> 500  "Incorrect DATETIME value: 'Invalid date'"
//   GET /athletes?gender[$ne]=Male
//     -> 500  "Invalid value { '$ne': 'Male' }"
//
// Neither is dangerous on its own. Together they are a map: they confirm the
// engine, the ORM, and that a parameter reached a query unvalidated. A unique
// constraint would have volunteered its index name, a bad column its column
// name. None of it helps the person who hit the error, and all of it helps
// somebody probing.
//
// The opposite failure is worse, though, and this project has made it before: a
// blanket "Something went wrong" would also swallow the messages that were
// WRITTEN for the reader — "Could not render any pages from the PDF" is exactly
// what the operator uploading it needs to see. So the rule is about intent, not
// about status codes alone:
//
//   * a 4xx carries its message, because a 4xx is a statement about the
//     REQUEST and was shaped deliberately by whoever threw it;
//   * anything marked `expose` carries its message, for operational errors
//     (a vision provider that refused) that are genuinely the caller's business;
//   * everything else is a fault on our side. The caller gets a generic
//     sentence and the server gets the real error, with the route that produced
//     it, on stderr.
//
// The generic sentence deliberately says *where* to look rather than pretending
// nothing happened: an operator who reports "it said try again" is more useful
// than one who reports "it just didn't work".

const GENERIC = 'Something went wrong on our side. Please try again — if it keeps happening, tell an administrator.';

/**
 * Mark an error as safe to show the caller.
 * @param {Error} err
 * @param {number} [status]
 */
function expose(err, status) {
  err.expose = true;
  if (status) err.status = status;
  return err;
}

/**
 * Send `err` as an HTTP response.
 *
 * @param {import('express').Response} res
 * @param {Error} err
 * @param {string} [context] route identifier for the server-side log
 */
function sendError(res, err, context) {
  const status = Number.isInteger(err && err.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  const shareable = status < 500 || err.expose === true;

  if (!shareable) {
    // The only copy of the real error. Never dropped: an unlogged 500 is a
    // fault nobody can fix, and this file is the one place that decides the
    // caller will not see it.
    // eslint-disable-next-line no-console
    console.error(`[${context || 'request'}] ${err && err.stack ? err.stack : err}`);
  }

  return res.status(status).json({ message: shareable ? err.message : GENERIC });
}

module.exports = { sendError, expose, GENERIC };
