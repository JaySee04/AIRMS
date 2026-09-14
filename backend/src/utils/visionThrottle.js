// A QUOTA cap on the one endpoint that consumes a third-party allowance.
//
// CORRECTED 2026-09-14 (JC). This file originally called it a BUDGET cap and
// said the endpoint "bills per call" and "costs the institution real money".
// That was never checked against the actual configuration and is wrong: AIRMS
// runs on Gemini's FREE tier (`gemini-flash-lite-latest` through the
// OpenAI-compatible endpoint), so no call is billed. The cap is still right;
// the reason given for it was not.
//
// WHAT IS ACTUALLY AT STAKE. `POST /upload/screening/pdf/preview` ships up to
// six rendered pages to the vision provider — ~11,400 tokens per HoloMotion
// report, measured. A free tier is not an unlimited one: it carries per-minute
// and per-day request quotas, and exhausting them does not produce a bill, it
// produces an OUTAGE. Screening import stops working for everybody until the
// window resets, in the middle of a clinic or a demo.
//
// So the cost is AVAILABILITY, and it becomes money only if VISION_BASE_URL and
// VISION_MODEL are ever pointed at a paid provider — which is one env var, with
// no code change and nothing to remind anybody the cap was sized for a free
// tier. Being in place before that happens is the point.
//
// NOT a brute-force control: the route sits behind auth + rbac('medical',
// 'admin') + requirePermission('uploadData'), so an anonymous caller never
// reaches it. The realistic failures are duller and likelier — a stuck retry in
// the batch uploader, a backlog-import script run twice, one careless account
// burning the daily allowance. All three are indistinguishable from legitimate
// use at request level, which is why a cap is the only thing that bounds them:
// its job is to keep the feature ALIVE, not to decide who was right.
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
