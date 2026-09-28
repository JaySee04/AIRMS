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

// WHAT IS COUNTED CHANGED ON 2026-09-28, AND THIS IS THE WHOLE FIX.
//
// Until now the cap counted REQUESTS to /preview, which was exactly right while
// every preview shipped six rendered pages to the provider. Since §112/§114 it
// is no longer true of most reports, and had become wrong in two directions:
//
//   * ON AN ISN INSTALL there is no key, so NOTHING can draw a quota — and the
//     limiter still rationed the import to 60/hour. A cap protecting an
//     allowance that does not exist is pure obstruction, and it would have
//     fired in the middle of onboarding a squad.
//   * WITH A KEY CONFIGURED, an expanded report costs ZERO tokens (measured:
//     the three demo reports answer 200 with `usage: null` on both instances,
//     DD 112.8). Counting those against the quota rations honest work for no
//     protective benefit.
//
// So the cap now counts PROVIDER CALLS, which is what it was always for. The
// accounting is split in two, and both halves run INSIDE the request:
//
//   visionThrottle(req,res,next)   the GATE. Reads the counter and refuses at
//                                  the limit. Does NOT increment.
//   chargeVisionQuota(req, calls)  the CHARGE. Incremented only when the
//                                  provider was actually called, AWAITED by the
//                                  route before it responds.
//
// SPLITTING IT THIS WAY IS FORCED BY THE PLATFORM, not a preference. The
// obvious shape — count on the way in, refund on the way out — is exactly
// `skipSuccessfulRequests`, which decrements from a `res.on('finish')` handler,
// i.e. after the response. On Vercel that work is deferred until another
// request thaws the instance, so the refund lands eventually and never in time.
// That is SILENT_FAILURES 3r, measured on the hosted API, and the reason
// tests/serverlessLifecycle.test.js forbids the pattern outright. Charging
// after the fact instead means a caller sitting exactly on the limit can spend
// one call over it. That is the honest cost of the trade and it is bounded at
// one.
const { isVisionConfigured } = require('./visionClient');
const { SettingsRateLimitStore } = require('./rateLimitStore');
const logger = require('./logger');

// 60/hour. A realistic batch is 15 PDFs, so this allows four of them — more
// than a clinic does in a day. Deliberately loose: a cap that fires during
// honest work is removed within a week and then protects nothing. Now that only
// provider calls are counted it is looser still, which is the intended
// direction: a compact-layout report costs one, an expanded one costs none.
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

// The database-backed store, like the auth limiter: an in-process Map counts
// per serverless instance, which on Vercel means it counts almost nothing
// (SILENT_FAILURES 3r). `init` is what sets the window — its own default is the
// auth limiter's 15 minutes, and a store quietly running a quarter of the
// documented window is the kind of disagreement this project keeps finding.
const store = new SettingsRateLimitStore();
store.init({ windowMs: WINDOW_MS });

// Addressed to a clinician mid-import, not to an attacker. Deliberately names
// neither the provider nor the quota — that is operator information (§48).
const OVER_LIMIT_MESSAGE = {
  message: 'Too many screening extractions in the last hour. '
    + 'Wait a few minutes and continue the batch — reports already committed are unaffected.',
};

/** What the counter says right now, without touching it. */
async function readQuota(key, now = Date.now()) {
  const row = await store.read(key);
  // `read` FAILS OPEN — it returns null when the settings table cannot be read
  // and logs loudly. A fresh window allows the request, which is the same
  // posture as the auth limiter: a database hiccup must not stop an import.
  const fresh = !row || !row.resetAt || row.resetAt <= now;
  return {
    hits: fresh ? 0 : Number(row.hits || 0),
    resetAt: fresh ? now + WINDOW_MS : row.resetAt,
  };
}

/**
 * The gate. Refuses at the limit; never increments.
 *
 * Skipped entirely when no provider is configured, because then no request can
 * possibly draw the allowance this exists to protect. That is not a loosening
 * — it is the cap finally matching what it is a cap ON.
 */
async function visionThrottle(req, res, next) {
  try {
    if (!isVisionConfigured()) return next();
    const key = visionKey(req);
    const { hits, resetAt } = await readQuota(key);
    const resetSeconds = Math.max(0, Math.ceil((resetAt - Date.now()) / 1000));
    // draft-7 shape, as express-rate-limit emitted before, so anything reading
    // these headers sees the same thing.
    res.setHeader('RateLimit-Policy', `${LIMIT};w=${Math.round(WINDOW_MS / 1000)}`);
    res.setHeader(
      'RateLimit',
      `limit=${LIMIT}, remaining=${Math.max(0, LIMIT - hits)}, reset=${resetSeconds}`,
    );
    if (hits >= LIMIT) return res.status(429).json(OVER_LIMIT_MESSAGE);
    return next();
  } catch (err) {
    // Fails open like every other path in this file. An import must not be lost
    // to the accounting for it.
    logger.error('vision_quota.gate_failed', { err: err.message });
    return next();
  }
}

/**
 * Claim one provider call, BEFORE it is made. Returns whether it may proceed.
 *
 * WHY THIS REPLACED A POST-HOC CHARGE. The first version of this counted after
 * the extraction returned, which left a caller sitting exactly on the limit able
 * to spend one call over it — documented and bounded, but avoidable. Counting
 * FIRST and testing the result removes it: the 61st claim in a window sees 61
 * and is refused before anything is sent.
 *
 * It is increment-then-test rather than test-then-increment for the same reason
 * every such counter is: the read and the write are two operations, and the
 * order that fails safe is the one where the write happens first.
 *
 * WHAT IT DOES NOT FIX, said plainly: `SettingsRateLimitStore.increment` is a
 * read-modify-write in JavaScript, so two truly simultaneous claims can still
 * lose an update and both see the same total. That is a property of the store,
 * shared with the auth limiter, and is a different problem from the ordering one
 * this addresses.
 *
 * FAILS OPEN, like everything else in this file: if the counter cannot be
 * written the call proceeds. A settings-table hiccup must not stop an import.
 */
async function reserveVisionCall(req) {
  const key = visionKey(req);
  try {
    const { totalHits } = (await store.increment(key)) || {};
    const n = Number(totalHits);
    // A store that answers without a usable total is BROKEN, not a refusal.
    // `Number(undefined) <= LIMIT` is false, so the obvious expression turns a
    // malformed reply into a hard outage for every import — the same fail-open
    // rule as the catch below, and it needs saying because the wrong answer
    // here looks like arithmetic rather than like a policy.
    if (!Number.isFinite(n)) return true;
    return n <= LIMIT;
  } catch (err) {
    logger.error('vision_quota.reserve_failed', { err: err.message });
    return true;
  }
}

module.exports = {
  visionThrottle, reserveVisionCall, readQuota, visionKey, LIMIT, WINDOW_MS, store,
};
