// A cross-process lock, so "safe to run twice" is true rather than asserted.
//
// WHY THIS EXISTS
// `utils/scheduler.js` claimed its month-marker design made concurrent runs
// safe: "two instances race on the same marker, and the loser's send is skipped
// because the month is already recorded." That was true of a RESTART and false
// of genuine concurrency. `setSetting` is a read-then-write, and the marker is
// deliberately written only AFTER a successful send (so a failure retries
// rather than losing the month) — so two processes that tick at the same
// instant both read the marker as unset, both send, and both then record the
// month. Two identical monthly reports, and the trail says one.
//
// It cost nothing while exactly one process ever ticked. Moving the schedule
// out of the web process (§36) makes two tickers the NORMAL case — an OS task
// and a running dev server — so the claim has to become true.
//
// WHY RAW SQL
// Locks live in the `settings` table (no new table, no migration), namespaced
// `lock:*` so they can never collide with a real setting — `getSettings()`
// ignores any key absent from DEFAULTS, so these rows are invisible to the
// settings API and the admin page.
//
// But `Setting.value` is a **JSON** column, and that quietly breaks the obvious
// implementation. `Setting.destroy({ where: { key, value: token } })` binds the
// token as a string against a JSON column and matches nothing — so the first
// version of this file acquired locks correctly and then FAILED TO RELEASE
// THEM, leaving a row that blocked the next send until the TTL expired. It was
// caught by asserting the lock row was gone after a race, not by the race
// passing: exactly one process sent either way. Comparisons therefore go
// through `JSON_UNQUOTE`, written out as SQL so the atomicity is reviewable
// rather than inferred from an ORM's behaviour.
//
// EXPIRY, AND WHY IT IS NOT OPTIONAL
// A process that dies mid-send never releases. Without expiry that deadlocks
// the digest for ever — the exact failure the scheduler was written to avoid,
// reintroduced by its own safety mechanism. So a lock older than `ttlMs` may be
// taken over, and the takeover is a conditional UPDATE against the exact stale
// value, so two processes finding the same stale lock still produce exactly one
// winner.

const crypto = require('crypto');
const { QueryTypes, UniqueConstraintError } = require('sequelize');
const { sequelize } = require('../config/db');
const { Setting } = require('../models');

// Long enough that a slow send (the digest renders and attaches a PDF) never
// looks abandoned; short enough that a crashed process costs at most one tick.
const DEFAULT_TTL_MS = 10 * 60 * 1000;

const keyOf = (name) => `lock:${name}`;

function heldAtOf(value) {
  if (typeof value !== 'string') return null;
  const at = Date.parse(value.split('#')[0]);
  return Number.isNaN(at) ? null : at;
}

/**
 * Try to take the named lock.
 *
 * @returns {Promise<string|null>} an opaque token if this process won it, or
 *   null if somebody else holds it. Pass the token back to `release`.
 */
async function acquire(name, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  const key = keyOf(name);
  const token = `${new Date(now).toISOString()}#${crypto.randomBytes(6).toString('hex')}`;

  const rows = await sequelize.query(
    'SELECT JSON_UNQUOTE(`value`) AS v FROM `settings` WHERE `key` = ?',
    { replacements: [key], type: QueryTypes.SELECT },
  );

  if (!rows.length) {
    // `key` is the PRIMARY KEY, so this INSERT is the atomic step: a second
    // process racing to create the same lock loses on the duplicate-key error
    // rather than silently overwriting the winner.
    //
    // Through the MODEL, not raw SQL, because `settings` has NOT NULL
    // `created_at` / `updated_at` with no database defaults — a hand-written
    // INSERT omitting them fails with ER_NO_DEFAULT_FOR_FIELD.
    try {
      await Setting.create({ key, value: token });
      return token;
    } catch (e) {
      // ONLY a duplicate key means "somebody else got there first". Swallowing
      // every error here is how a broken INSERT disguises itself as permanent
      // contention: acquire would return null for ever, the lock would never be
      // taken, and the digest would silently never send again — with the lock
      // that exists to protect it as the cause. Anything else is re-thrown so it
      // surfaces as a failed tick and lands in `*_last_result`.
      if (e instanceof UniqueConstraintError) return null;
      throw e;
    }
  }

  const current = rows[0].v;
  const heldAt = heldAtOf(current);
  const abandoned = heldAt === null || (now - heldAt) > ttlMs;
  if (!abandoned) return null;

  // Take over a stale lock, but only while it still holds the exact value we
  // read — otherwise another process got there first and its work is in flight.
  const [, meta] = await sequelize.query(
    'UPDATE `settings` SET `value` = CAST(? AS JSON), `updated_at` = NOW() '
    + 'WHERE `key` = ? AND JSON_UNQUOTE(`value`) = ?',
    { replacements: [JSON.stringify(token), key, current] },
  );
  const affected = typeof meta === 'number' ? meta : (meta && meta.affectedRows) || 0;
  return affected === 1 ? token : null;
}

/** Release a lock this process holds. A token that no longer matches is a no-op. */
async function release(name, token) {
  if (!token) return false;
  const [, meta] = await sequelize.query(
    'DELETE FROM `settings` WHERE `key` = ? AND JSON_UNQUOTE(`value`) = ?',
    { replacements: [keyOf(name), token] },
  );
  const affected = typeof meta === 'number' ? meta : (meta && meta.affectedRows) || 0;
  return affected > 0;
}

/**
 * Run `fn` while holding the lock, releasing it whatever happens.
 * Returns `onBusy` (default null) without running `fn` if the lock is held.
 */
async function withLock(name, fn, { ttlMs = DEFAULT_TTL_MS, onBusy = null } = {}) {
  const token = await acquire(name, { ttlMs });
  if (!token) return onBusy;
  try {
    return await fn();
  } finally {
    // Released even on the failure path: a send that threw must be retryable on
    // the next tick, not blocked until the TTL expires.
    await release(name, token).catch(() => {});
  }
}

module.exports = {
  acquire, release, withLock, DEFAULT_TTL_MS, keyOf,
};
