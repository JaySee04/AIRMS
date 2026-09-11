// WHICH auth endpoints the brute-force throttle applies to.
//
// THE DEFECT THIS EXISTS TO FIX (2026-09-11, SILENT_FAILURES 3r).
//
// The limiter was mounted on the whole `/api/auth` router, which quietly
// included the endpoints that already require a valid JWT. `DashboardLayout`
// calls `GET /auth/me` on EVERY page mount to confirm the session against the
// server, so ordinary navigation consumed the brute-force budget. Measured
// against the deployed API: four successful `/auth/me` calls took `remaining`
// 29 → 28 → 27 → 26, forgiven by nothing.
//
// Thirty page views in fifteen minutes — a clinician working through a squad,
// no password typed, nothing unusual — and the whole site starts refusing them.
// That is a worse outcome than the bug it was found next to, because it needs
// no mistake by anybody to trigger.
//
// THE RULE: throttle what an UNAUTHENTICATED caller can hit repeatedly, which
// is what brute-force and credential-stuffing actually are. An endpoint behind
// `authMiddleware` already demands a signed token; rate-limiting it protects
// nothing and rations normal use.
//
// WHY AN EXEMPT LIST RATHER THAN AN INCLUDE LIST. Both drift when somebody adds
// a route, so the question is which direction the drift goes:
//
//   * exempt-list (this): a NEW route is throttled unless named. Forgetting to
//     name an authenticated one costs navigation budget — visible, annoying,
//     harmless.
//   * include-list: a new route is UNthrottled unless named. Forgetting to name
//     an unauthenticated one silently removes brute-force protection from it,
//     and nothing anywhere would say so.
//
// The second is this project's defect class. So: throttle by default.
//
// `tests/authThrottle.test.js` reads `routes/auth.js` as text and pins the two
// lists to each other in both directions, so neither can drift unnoticed.

const rateLimit = require('express-rate-limit');
const { SettingsRateLimitStore, authThrottleKey } = require('./rateLimitStore');

/**
 * Paths under `/api/auth` that are NOT throttled, because they already require
 * a valid token. Written without the `/api/auth` prefix — `req.path` inside a
 * mounted router is relative to the mount point.
 */
const AUTHENTICATED_AUTH_PATHS = new Set([
  '/me',
  '/change-password',
  '/notification-preferences',
]);

/**
 * Should this request count toward the brute-force limit?
 *
 * Unknown paths return true: a request for something that does not exist is
 * still an unauthenticated caller poking at the auth surface, and a 404 probe
 * loop is exactly the shape worth capping.
 */
function shouldThrottle(path) {
  return !AUTHENTICATED_AUTH_PATHS.has(String(path || '').replace(/\/+$/, '') || '/');
}

// LOOPBACK IS NOT RATE-LIMITED, and this is a workflow fix with a real reason.
//
// `npm run audit:access` calls every endpoint as four roles and EXPECTS most of
// them to be refused; `npm run e2e` signs in repeatedly. Both are deliberate
// streams of 4xx from the same machine, and with a persistent store those now
// accumulate across runs instead of dying with the process — so the two commands
// that gate a commit would lock the developer out of their own API. A request
// from 127.0.0.1 is this machine talking to itself, not a remote attacker.
//
// Hosted, requests arrive through Vercel's proxy and never appear as loopback,
// so this exempts nothing in production.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// THE POLICY: 30 failures / 15 min / IP, and a SUCCESSFUL SIGN-IN FORGIVES THE
// FAILURES BEFORE IT.
//
// What it is for: a demo runs off one laptop (one IP) and signs in and out
// across five roles many times, all SUCCESSFULLY; those must never be
// throttled. Brute-force and credential-stuffing are a stream of FAILURES,
// which is what we cap. 30 leaves room for a fat-fingered password while still
// stopping automated guessing.
//
// WHY NOT `skipSuccessfulRequests` (removed 2026-09-11). It decrements from a
// `res.on('finish')` handler — after the response is flushed. On a long-lived
// process that write completes. On Vercel it is DEFERRED until the instance is
// thawed by a later request — so it lands eventually, and never in time: the
// next request reads the counter first, and the store's read-modify-write then
// writes over the late decrement. Measured against
// the hosted API: five consecutive SUCCESSFUL logins took `remaining` 28 → 27 →
// 26 → 25 → 24, never recovering. The deployed limiter was therefore
// "30 REQUESTS / 15 min" while its own RateLimit header and every doc said
// "30 failures". The forgiveness now happens INSIDE the request instead —
// `routes/auth.js` awaits `clearRateLimit()` on a successful sign-in, before
// responding — so it depends on nothing the platform may decline to run
// afterwards.
//
// The key comes from `authThrottleKey`, shared with that reset: a reset
// computed against a different key than the limiter counts on would forgive
// nothing, silently.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  keyGenerator: authThrottleKey,
  skip: (req) => LOOPBACK.has(req.ip),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new SettingsRateLimitStore(),
  message: { message: 'Too many failed attempts. Please wait a few minutes and try again.' },
});

/**
 * Router-level middleware: throttle the unauthenticated half only.
 *
 * It lives HERE rather than at the `app.use('/api/auth', ...)` mount, and that
 * is not a style choice. Wrapping the mount in an inline arrow function made
 * `npm run map` stop recognising the router: the endpoint inventory silently
 * dropped all eight auth routes and rendered a perfectly plausible table
 * reading 57 instead of 65. That is DESIGN_DECISIONS §56.3 happening a second
 * time to the same parser, and the systemMap test caught it. Keeping the mount
 * in its plain form keeps the generated inventory honest.
 */
function authThrottle(req, res, next) {
  return shouldThrottle(req.path) ? limiter(req, res, next) : next();
}

module.exports = {
  AUTHENTICATED_AUTH_PATHS, shouldThrottle, authThrottle, LOOPBACK,
};
