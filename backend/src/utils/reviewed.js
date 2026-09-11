// "I have dealt with this one" — the state that turns a list into a worklist.
//
// Modelled deliberately on utils/watchlist.js, including its two hard-won
// decisions, because this is the same shape of thing and a second pattern would
// be a second set of mistakes:
//
//   * Stored as `settings` rows keyed `reviewed:<userId>`, NOT a `users`
//     column. A User attribute is selected on every user query including
//     /auth/login, so adding one would break any database that has not been
//     migrated — and the hosted credentials are write-only (DEPLOY.md).
//   * NOT AUDITED. Marking an athlete reviewed is a working note about the
//     reader — where they have got to in their own list — not an act on the
//     institution's data. Opening the record is still `athlete.view`, and that
//     is the row the trail needs. Auditing a checkbox would bury the reads that
//     matter under the ticks that do not.
//
// WHAT IT IS NOT: a clinical record. "Reviewed" means "I have looked at this
// athlete in my worklist", nothing more. A clinician's actual finding is the
// band override, which IS audited, carries a required note, and is attributed.
// The wording on screen must never let those two be confused.
const { Setting } = require('../models');

// Reviewing is scoped to ONE screening, not to the athlete. A new import is new
// information, so it should return to the worklist — otherwise a tick taken in
// July silences an athlete whose September screening went red.
const keyFor = (userId) => `reviewed:${userId}`;

// The same ceiling the watchlist uses, for the same reason: a settings row is
// not a table, and an unbounded JSON blob in one is somebody's future outage.
const MAX_ENTRIES = 400;

function safeParse(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

/**
 * What this user has marked, as `{ [athleteId]: screeningId }`.
 *
 * Returns {} rather than throwing on an absent or malformed row: an empty
 * worklist state and a missing one are the same thing to a reader, and a
 * personal marker must never be the reason a dashboard fails to load.
 */
async function getReviewed(userId) {
  if (userId === null || userId === undefined) return {};
  const row = await Setting.findByPk(keyFor(userId), { raw: true });
  if (!row) return {};
  const v = typeof row.value === 'string' ? safeParse(row.value) : row.value;
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}

async function setReviewed(userId, map) {
  const clean = {};
  let n = 0;
  for (const [athleteId, screeningId] of Object.entries(map || {})) {
    if (typeof athleteId !== 'string' || !athleteId.trim()) continue;
    if (screeningId === null || screeningId === undefined) continue;
    clean[athleteId] = String(screeningId);
    n += 1;
    if (n >= MAX_ENTRIES) break;
  }
  await Setting.upsert({ key: keyFor(userId), value: clean });
  return clean;
}

/** Mark one athlete reviewed AT a given screening. */
async function markReviewed(userId, athleteId, screeningId) {
  const cur = await getReviewed(userId);
  cur[athleteId] = String(screeningId ?? '');
  return setReviewed(userId, cur);
}

async function clearReviewed(userId, athleteId) {
  const cur = await getReviewed(userId);
  delete cur[athleteId];
  return setReviewed(userId, cur);
}

/**
 * Is this worklist entry already dealt with?
 *
 * False whenever the screening has MOVED ON, which is the whole point of
 * keying on the screening rather than the athlete: a tick is a statement about
 * information the reader has seen, and new information has not been seen.
 */
function isReviewed(reviewedMap, athleteId, screeningId) {
  if (!reviewedMap || screeningId === null || screeningId === undefined) return false;
  return reviewedMap[athleteId] === String(screeningId);
}

module.exports = {
  getReviewed, setReviewed, markReviewed, clearReviewed, isReviewed, keyFor, MAX_ENTRIES,
};
