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
const { connectDB } = require('../src/config/db');

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
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message: 'Database unavailable', detail: err.message }));
    return;
  }
  app(req, res);
};
