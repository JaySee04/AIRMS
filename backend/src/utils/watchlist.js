// A clinician's personal watchlist: the athletes they are keeping an eye on.
//
// Module 6's last deferred item. It is a WORKING NOTE, not institutional data —
// starring an athlete says something about the person looking, not about the
// athlete — and every design decision below follows from that.
//
// ── where it is stored, and the honest reason ───────────────────────────────
//
// The natural home is a `users.watchlist` JSON column beside `permissions` and
// `notify_prefs`, which are the same shape and the same idea. It is not there,
// and the reason is deployment rather than taste.
//
// Adding an attribute to the User model makes Sequelize select it on EVERY user
// query, including the one behind `/auth/login`. Until the column exists in a
// database, every login there fails with "Unknown column". The hosted database's
// credentials are marked Sensitive in Vercel and are write-only — they cannot be
// read from this machine (DEPLOY.md) — so the migration cannot be applied in the
// same change that needs it. Shipping the column would mean the deployed
// instance is broken between the deploy and a migration nobody can run from
// here.
//
// So this uses the `settings` table, which already exists everywhere: key/value
// with a JSON value, and a STRING(64) primary key. Rows are namespaced
// `watchlist:<userId>`, and they are invisible to the institution's own settings
// because `getSettings()` keeps only keys present in DEFAULTS
// (`if (r.key in DEFAULTS)`) and `setSetting()` refuses to write anything else.
// The admin Settings page therefore cannot see or edit these, which is correct:
// they are not institution settings.
//
// The trade is real and is recorded rather than hidden: a key/value table is
// being used for per-user data. If the schema is ever migrated with proper
// access to both databases, `users.watchlist` is the better home and this module
// is the only thing that would change. See DESIGN_DECISIONS.md §66.
//
// ── why it is not audited ───────────────────────────────────────────────────
//
// `AuditLog` records acts on the institution's data (§20). Starring an athlete
// changes nothing an athlete or the institute would recognise; it is the digital
// equivalent of a clinician's own list. Reading the record IS audited
// (`athlete.view`, §51) and that is unaffected — the watchlist is a shortcut to
// records whose opening is logged exactly as before.

const Setting = require('../models/Setting');

// A ceiling, so one account cannot grow an unbounded JSON blob in a shared
// table. Far above any real caseload; a watchlist of 200 is not a watchlist.
const MAX_ENTRIES = 200;

const keyFor = (userId) => `watchlist:${userId}`;

/**
 * The athlete IDs this user is watching, oldest first. Always an array.
 *
 * Returns [] rather than throwing when the row is absent or malformed: an empty
 * watchlist and a missing one are the same thing to a reader, and a personal
 * shortcut must never be the reason a dashboard fails to load.
 */
async function getWatchlist(userId) {
  if (userId === null || userId === undefined) return [];
  const row = await Setting.findByPk(keyFor(userId), { raw: true });
  if (!row) return [];
  const v = typeof row.value === 'string' ? safeParse(row.value) : row.value;
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

/** Replace the whole list. Deduplicated, order preserved, capped. */
async function setWatchlist(userId, ids) {
  const clean = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== 'string' || !id.trim()) continue;
    if (clean.includes(id)) continue; // first occurrence wins, so order is stable
    clean.push(id);
    if (clean.length >= MAX_ENTRIES) break;
  }
  await Setting.upsert({ key: keyFor(userId), value: clean });
  return clean;
}

/** Add one. Idempotent — starring twice is not an error, it is a no-op. */
async function addToWatchlist(userId, athleteId) {
  const cur = await getWatchlist(userId);
  if (cur.includes(athleteId)) return cur;
  if (cur.length >= MAX_ENTRIES) {
    const err = new Error(`A watchlist holds at most ${MAX_ENTRIES} athletes. Remove one first.`);
    err.status = 400;
    err.expose = true;
    throw err;
  }
  return setWatchlist(userId, [...cur, athleteId]);
}

/** Remove one. Also idempotent, for the same reason. */
async function removeFromWatchlist(userId, athleteId) {
  const cur = await getWatchlist(userId);
  if (!cur.includes(athleteId)) return cur;
  return setWatchlist(userId, cur.filter((id) => id !== athleteId));
}

module.exports = {
  getWatchlist, setWatchlist, addToWatchlist, removeFromWatchlist, keyFor, MAX_ENTRIES,
};
