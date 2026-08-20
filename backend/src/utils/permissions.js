// Per-user feature permissions for medical staff.
//
// Model: OPT-OUT. A medical user has every capability unless the admin has
// explicitly revoked it. Permissions are stored on User.permissions as a JSON
// object of { key: boolean }; a missing key (or null permissions) means the
// capability is granted. Only `false` blocks. athlete/admin roles are never
// constrained by this layer — their access is governed by RBAC roles alone.

const PERMISSION_KEYS = ['viewRecords', 'uploadData', 'editCohortNorms'];

const PERMISSION_LABELS = {
  viewRecords: 'View athlete records',
  uploadData: 'Upload screening data',
  editCohortNorms: 'Edit cohort norms',
};

// True unless this user is a medical staffer with the capability explicitly
// revoked. Defensive against malformed stored values.
function hasPermission(user, key) {
  if (!user || user.role !== 'medical') return true;
  const perms = user.permissions;
  if (!perms || typeof perms !== 'object') return true;
  return perms[key] !== false;
}

// ── Individual-report access ────────────────────────────────────────────────
//
// UC-41's actors are "Administrator, Medical Staff, Athlete (own report only),
// Coach (assigned sport only)" (REPORT_TABLE_4-1.md). Three of those four ride
// on rbac() alone; the two SCOPED ones do not, and the scoping is what these
// two predicates hold.
//
// They are here, pure and tested, because the previous arrangement failed
// silently: the route wrote the athlete self-scope check inline, but never
// added `athlete` to its rbac() list, so the check sat two middlewares behind a
// gate that rejected every athlete before reaching it. It was correct, and
// unreachable, for weeks — the same shape as the `winAnsiSafe` guard that was
// defined, exported, tested and never called. An authorisation rule nobody can
// reach looks exactly like an authorisation rule that works.
//
// Deliberately TWO functions rather than one that takes an optional athlete.
// The self-scope decision needs no database row and the coach one does, so a
// single function would have to return "allow" while undecided — a helper that
// fails OPEN when handed less than it needs is the wrong thing to leave lying
// around, however careful its current callers are.

// An athlete asking for somebody else's report. Answerable from the URL alone,
// so the route can refuse BEFORE it looks the athlete up: a 404 for an unknown
// id and a 403 for a known one would tell an athlete probing IC numbers which
// ones are on the roster.
function isForeignAthleteRequest(user, requestedAthleteId) {
  if (!user || user.role !== 'athlete') return false;
  return !user.athleteId || String(user.athleteId) !== String(requestedAthleteId);
}

// The full decision, once the athlete row is loaded. Unknown roles are denied:
// this is an allow-list, so a role added later has to be named here on purpose
// rather than inheriting access by omission.
function canDownloadIndividualReport(user, athlete) {
  if (!user || !athlete) return false;
  switch (user.role) {
    case 'admin':
    case 'executive':
    case 'medical':
      return true;
    case 'athlete':
      return !isForeignAthleteRequest(user, athlete.athleteId);
    case 'coach':
      return Boolean(user.coachSport) && user.coachSport === athlete.sport;
    default:
      return false;
  }
}

// Normalise an arbitrary input object to a clean { key: boolean } map limited
// to known keys — used when the admin saves a permission set.
function sanitizePermissions(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const key of PERMISSION_KEYS) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  return out;
}

module.exports = {
  PERMISSION_KEYS, PERMISSION_LABELS, hasPermission, sanitizePermissions,
  isForeignAthleteRequest, canDownloadIndividualReport,
};
