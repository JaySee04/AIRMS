// A rate-limit store that survives a restart and is shared between instances.
//
// WHY (2026-09-10). `express-rate-limit`'s default store is a Map in the
// process. On a laptop that is exactly right. On the hosted instance it is close
// to useless, and that is a real weakness rather than a theoretical one:
//
//   * the API is SERVERLESS, so concurrent invocations each get their own
//     memory — an attacker's attempts spread across instances and each instance
//     counts from zero;
//   * any redeploy or cold start empties the counter;
//   * so the documented "30 failures / 15 min / IP" was, hosted, a limit on how
//     fast one instance could be hit rather than on how many guesses an account
//     could receive.
//
// Backed by the `settings` table because that is where this project already
// keeps small cross-process state (see utils/lock.js, which does compare-and-swap
// on the same table). No new dependency, no new infrastructure.
//
// THE IP IS HASHED, NOT STORED. An IP address is personal data under Malaysia's
// PDPA (Act A1727, see docs/fyp/REFERENCES.md §7.1), and a rate limiter has no
// need to know which address it is refusing — only that it is the same one. A
// truncated SHA-256 keyed with JWT_SECRET means the stored value cannot be
// reversed to an address, nor matched against a list of candidate addresses by
// anyone without the secret.
const crypto = require('crypto');
const { ipKeyGenerator } = require('express-rate-limit');
const { Setting } = require('../models');
const logger = require('./logger');

const PREFIX = 'ratelimit:';

// Truncated to 16 hex chars. Collision risk across the handful of addresses a
// single institution sees is negligible, and a collision fails SAFE — two
// addresses would share a budget, tightening the limit rather than loosening it.
function keyFor(ip) {
  const secret = process.env.JWT_SECRET || 'airms-dev';
  return PREFIX + crypto.createHmac('sha256', secret).update(String(ip)).digest('hex').slice(0, 16);
}

/**
 * Store for express-rate-limit v7/v8.
 *
 * FAILS OPEN, deliberately. If the settings table cannot be read or written the
 * request is ALLOWED and the failure is logged loudly. The alternative — failing
 * closed — turns a database hiccup into "nobody at ISN can sign in", which is a
 * worse outcome than a window during which guessing is unthrottled, and it is
 * the outcome that happens on the morning of a demo. The loud log is what makes
 * the open state visible rather than silent.
 */
class SettingsRateLimitStore {
  constructor() {
    this.windowMs = 15 * 60 * 1000;
  }

  init(options) {
    if (options && options.windowMs) this.windowMs = options.windowMs;
  }

  async increment(key) {
    const now = Date.now();
    const row = await this.read(key);
    // A window that has expired starts again rather than accumulating for ever.
    const fresh = !row || !row.resetAt || row.resetAt <= now;
    // Mutation-checked: pinning this to 1 (a store that never counts) fails
    // three tests. A limiter whose store silently does not count would leave
    // every document still claiming "30 failures / 15 min" with nothing behind it.
    const hits = fresh ? 1 : Number(row.hits || 0) + 1;
    const resetAt = fresh ? now + this.windowMs : row.resetAt;
    await this.write(key, { hits, resetAt });
    return { totalHits: hits, resetTime: new Date(resetAt) };
  }

  // Part of the Store interface express-rate-limit expects, and CURRENTLY
  // UNWIRED — it is only ever called by `skipSuccessfulRequests`, which this
  // project stopped using on 2026-09-11 because it fires after the response and
  // a serverless host never completes the write (see clearRateLimit below).
  //
  // Kept because the interface declares it and a store missing a method would
  // throw if the option were ever switched back on. Said plainly rather than
  // left to look load-bearing: nothing in AIRMS calls this today.
  async decrement(key) {
    const row = await this.read(key);
    if (!row) return;
    await this.write(key, { hits: Math.max(0, Number(row.hits || 0) - 1), resetAt: row.resetAt });
  }

  async resetKey(key) {
    try {
      await Setting.destroy({ where: { key: keyFor(key) } });
    } catch (e) {
      logger.error('ratelimit.store_unavailable', { op: 'resetKey', err: e.message });
    }
  }

  async read(key) {
    try {
      const row = await Setting.findOne({ where: { key: keyFor(key) }, raw: true });
      // `value` is a JSON column; an older row or a hand-edit could be anything.
      const v = row && row.value;
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch (e) {
      // The fail-open path. Returning null makes the caller treat this as a
      // fresh window, which allows the request.
      logger.error('ratelimit.store_unavailable', { op: 'read', err: e.message });
      return null;
    }
  }

  async write(key, value) {
    try {
      const k = keyFor(key);
      const [row, created] = await Setting.findOrCreate({ where: { key: k }, defaults: { key: k, value } });
      if (!created) await row.update({ value });
    } catch (e) {
      logger.error('ratelimit.store_unavailable', { op: 'write', err: e.message });
    }
  }
}

/**
 * Delete expired counters.
 *
 * Without this the table grows one row per distinct address for ever. Called
 * from the scheduler's existing hourly tick rather than on the request path,
 * because a login is the wrong moment to pay for housekeeping.
 */
async function pruneRateLimits(now = Date.now()) {
  try {
    const rows = await Setting.findAll({ where: { key: { [require('sequelize').Op.like]: `${PREFIX}%` } }, raw: true });
    const stale = rows.filter((r) => {
      const v = r.value;
      return !v || typeof v !== 'object' || !v.resetAt || v.resetAt <= now;
    }).map((r) => r.key);
    if (stale.length) await Setting.destroy({ where: { key: stale } });
    return stale.length;
  } catch (e) {
    logger.error('ratelimit.prune_failed', { err: e.message });
    return 0;
  }
}

/**
 * The throttle key, defined ONCE and shared by the limiter and the reset.
 *
 * Two definitions is how a reset ends up clearing a counter nobody reads — it
 * would forgive nothing, silently, while the sign-in it was meant to reward
 * still counted against the caller. It lives here rather than in server.js
 * because routes/auth.js needs it too, and requiring server.js from a route
 * would close a cycle.
 *
 * `ipKeyGenerator` is the library's own helper: it normalises IPv6 to a subnet,
 * so a caller holding a /64 cannot buy 30 fresh attempts per address.
 */
const authThrottleKey = (req) => ipKeyGenerator(req.ip);

/**
 * Clear the throttle counter for one key, AWAITED by the caller.
 *
 * This is how a successful sign-in forgives the failures before it, and it
 * exists because the obvious mechanism does not survive serverless.
 *
 * `skipSuccessfulRequests` works by decrementing from a `res.on('finish')`
 * handler — that is, AFTER the response has been flushed. On a long-lived
 * process the write completes; on Vercel the instance is frozen once the
 * response is out, so the decrement is issued and never lands. Measured against
 * the hosted API on 2026-09-11: five consecutive SUCCESSFUL logins took
 * `remaining` 28 → 27 → 26 → 25 → 24 and it never recovered. The documented
 * policy said "30 failures / 15 min"; the deployed behaviour was "30 requests",
 * and a clinic behind one NAT address would have locked itself out.
 *
 * Doing the work inside the request instead — awaited, before the response —
 * depends on nothing the platform may decline to run.
 */
async function clearRateLimit(key) {
  try {
    await Setting.destroy({ where: { key: keyFor(key) } });
  } catch (e) {
    // Fails open like every other path here: a settings-table hiccup must not
    // become "nobody at ISN can sign in". The cost of failing is that earlier
    // failures are not forgiven yet, which is the safe direction.
    logger.error('ratelimit.store_unavailable', { op: 'clearRateLimit', err: e.message });
  }
}

module.exports = {
  SettingsRateLimitStore, pruneRateLimits, keyFor, clearRateLimit, authThrottleKey, PREFIX,
};
