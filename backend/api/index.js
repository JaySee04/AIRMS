// Vercel serverless entry point for the AIRMS API.
//
// Vercel does not run `npm start`. It builds each file under /api into its own
// function and hands it the raw request; there is no port and no process that
// outlives a request. This file adapts the existing Express app to that model
// WITHOUT forking it — src/server.js is imported, not copied, so a route added
// there is live here and the two can never describe different APIs.
//
// Two things a long-running process gets for free and a function does not:
//
//   1. A connected database. `start()` awaits connectDB() once at boot; here
//      every cold start begins with no pool at all. The promise is cached on
//      the module scope, which Vercel reuses for the life of a warm instance,
//      so the handshake happens once per instance rather than once per request.
//
//   2. Somewhere to fail. On boot, a bad DATABASE_URL should stop the process.
//      In a function it must surface as a 503 on THIS request and leave the
//      next one free to retry — see the VERCEL branch in config/db.js.
//
// The scheduled mail is not started here on purpose. An interval inside a
// function that is frozen between invocations would never fire; Vercel Cron
// calls /api/cron/mail-tick instead, which runs the identical tick() the CLI
// and the in-process ticker run. See vercel.json and docs/DEPLOY.md.

const app = require('../src/server');
const { connectDB, dbErrorMessage } = require('../src/config/db');
const logger = require('../src/utils/logger');

let ready = null;
function ensureDb() {
  // Cached across invocations on a warm instance; rebuilt after a failure so a
  // transient outage cannot poison the instance for its whole lifetime.
  if (!ready) ready = connectDB().catch((err) => { ready = null; throw err; });
  return ready;
}

module.exports = async (req, res) => {
  try {
    await ensureDb();
  } catch (err) {
    // THE DETAIL IS LOGGED, NOT RETURNED (2026-09-28).
    //
    // This used to answer `{ message, detail: err.message }`, and `detail` is
    // the driver's own words on an endpoint that EVERY unauthenticated caller
    // reaches — the rewrite in vercel.json sends all traffic here, so this is
    // the first thing anyone gets when the database is unreachable, before any
    // auth middleware has run.
    //
    // Measured against a real MySQL 8:
    //   wrong password   -> "Access denied for user 'root'@'localhost' (using password: YES)"
    //   refused          -> "connect ECONNREFUSED 127.0.0.1:3999"
    // Hosted, the first of those reads `'avnadmin'@'<the function's egress
    // address>'` — the database account name and where the API connects from,
    // handed to anyone who curls the site during an outage. Aiven's free tier
    // powers the database off when idle, so "during an outage" is a routine
    // state for this deployment rather than a rare one.
    //
    // Same decision `/api/health` already made and for the same reason (§48:
    // a failed request reveals nothing it was not asked to). The operator is
    // not left in the dark — the detail goes to the platform log, which is
    // where they are already looking when the site is down.
    logger.error('request.db_unavailable', {
      // The ROUTER, never req.url: a full path carries an IC number, and this
      // line goes to a third-party log viewer (SILENT_FAILURES 3w).
      context: `${req.method} /api`,
      err: dbErrorMessage(err),
    });
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Database unavailable' }));
    return;
  }
  app(req, res);
};
