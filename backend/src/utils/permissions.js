// Per-user feature permissions for medical staff.
//
// Model: OPT-OUT. A medical user has every capability unless the admin has
// explicitly revoked it. Permissions are stored on User.permissions as a JSON
// object of { key: boolean }; a missing key (or null permissions) means the
// capability is granted. Only `false` blocks. athlete/admin roles are never
// constrained by this layer — their access is governed by RBAC roles alone.

const PERMISSION_KEYS = ['viewRecords', 'uploadData', 'reviewReports', 'injuryReports', 'editCohortNorms'];

const PERMISSION_LABELS = {
  viewRecords: 'View athlete records',
  uploadData: 'Upload screening data',
  reviewReports: 'Review/approve self-reports',
  injuryReports: 'Log & view injuries',
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

module.exports = { PERMISSION_KEYS, PERMISSION_LABELS, hasPermission, sanitizePermissions };
