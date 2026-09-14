// A budget cap on the one endpoint that spends money per request.
//
// `POST /upload/screening/pdf/preview` ships up to six rendered pages to a
// third-party vision model, which BILLS PER CALL (~11,400 tokens per HoloMotion
// report). It is the only endpoint in AIRMS where a request costs the
// institution real money, and until 2026-09-13 it had no cap of any kind —
// express-rate-limit was mounted on /api/auth and nowhere else. See DD §97.2.
//
// NOT a brute-force control: the route sits behind auth + rbac('medical',
// 'admin') + requirePermission('uploadData'), so an anonymous caller never
// reaches it. The realistic failures are duller and likelier — a stuck retry in
// the batch uploader, a backlog-import script run twice, one careless account
// emptying the quota and taking the feature down for everybody. All three are
// indistinguishable from legitimate use at request level, which is why a cap is
// the only thing that bounds them: its job is to make the bill finite, not to
// decide who was right.
//
// The other 63 endpoints stay unthrottled and that is still correct (§48) —
// they touch this institution's own database, and rating them would ration a
// clinician's ordinary navigation.

const rateLimit = require('express-rate-limit');
const { SettingsRateLimitStore } = require('./rateLimitStore');

// 60/hour. A realistic batch is 15 PDFs, so this allows four of them — more
// than a clinic does in a day. Deliberately loose: a cap that fires during
// honest work is removed within a week and then protects nothing.
const LIMIT = 60;
const WINDOW_MS = 60 * 60 * 1000;

/**
 * The accounting key: the authenticated user, NOT the IP.
 *
 * The §48 NAT lesson. ISN's clinicians work from one building behind one
 * address, so an IP key would hand the whole institution a single budget and
 * refuse the second person to import that afternoon. Keying on the user also
 * means the limit follows the person rather than the desk.
 *
 * Fails CLOSED to one shared bucket if there is no user — the alternative, a
 * unique key per unidentified caller, gives every such request a full budget,
 * which is the same as no limit. Unreachable today; written so it stays a
 * decision rather than an accident.
 */
const visionKey = (req) => (req.user && req.user.id ? `u:${req.user.id}` : 'anon');

const visionThrottle = rateLimit({
  windowMs: WINDOW_MS,
  limit: LIMIT,
  keyGenerator: visionKey,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // The database-backed store, like the auth limiter: an in-process Map counts
  // per serverless instance, which on Vercel means it counts almost nothing
  // (SILENT_FAILURES 3r).
  store: new SettingsRateLimitStore(),
  // Addressed to a clinician mid-import, not to an attacker. Deliberately names
  // neither the provider nor the quota — that is operator information (§48).
  message: {
    message: 'Too many screening extractions in the last hour. '
      + 'Wait a few minutes and continue the batch — reports already committed are unaffected.',
  },
});

module.exports = {
  visionThrottle, visionKey, LIMIT, WINDOW_MS,
};
