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

  // Called by skipSuccessfulRequests when a request turns out to have succeeded.
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

module.exports = { SettingsRateLimitStore, pruneRateLimits, keyFor, PREFIX };
