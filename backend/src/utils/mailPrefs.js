// Per-user email opt-out.
//
// AIRMS had exactly one control over who gets mailed: the admin's institution-wide
// switches (`alerts_enabled`, `notify_override`, `notify_injury`,
// `digest_enabled`). So a physio who wanted fewer import alerts could only ask an
// admin to turn them off — for everyone. The realistic outcome of that is not an
// admin edit; it is an inbox rule, and a filtered alert is worse than no alert
// because the system still believes it was delivered.
//
// TWO GATES, and the order matters:
//   1. the institution setting decides whether AIRMS sends this kind of mail AT ALL;
//   2. this file decides which individuals still want it.
// A user cannot opt IN to something the institution has switched off. That keeps
// the admin switch meaningful as governance rather than a default.
//
// OPT-OUT, not opt-in: `notify_prefs` is null for every existing user and null
// means "everything on", mirroring User.permissions. An opt-in default would have
// silently stopped every alert in the system the moment the column was added —
// the worst possible migration for a clinical notification.

// The addressable notifications, with the roles that can actually receive each.
// `roles` drives the UI so nobody is offered a toggle for mail they never get.
const NOTIFY_KEYS = [
  {
    key: 'import_alerts',
    label: 'Screening import alerts',
    detail: 'When an imported HoloMotion report leaves an athlete at Needs attention or Immediate assessment.',
    roles: ['medical', 'coach'],
  },
  {
    key: 'override',
    label: 'Clinical band changes',
    detail: 'When the medical team sets one of your athletes to Needs attention or Immediate assessment.',
    roles: ['coach'],
  },
  {
    key: 'injury',
    label: 'Injury declarations and clearances',
    detail: 'When one of your athletes is declared injured, or cleared to train.',
    roles: ['coach'],
  },
  {
    key: 'digest',
    label: 'Monthly summary',
    detail: 'The institute-wide monthly screening summary, with the holistic report attached.',
    roles: ['admin', 'executive'],
  },
];

const KEY_SET = new Set(NOTIFY_KEYS.map((k) => k.key));

// Which toggles this role should be shown. An empty list means "this role
// receives no email from AIRMS", which is true of athletes today.
function keysForRole(role) {
  return NOTIFY_KEYS.filter((k) => k.roles.includes(role)).map((k) => k.key);
}

// Does this user still want `key`? Anything that is not an explicit `false` is a
// yes — an unrecognised or corrupted prefs blob must not silence a clinical alert.
function wantsMail(user, key) {
  const prefs = user && user.notifyPrefs;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return true;
  return prefs[key] !== false;
}

// Narrow a list of user rows to those who want `key`. Rows must carry
// `notifyPrefs`, so every query feeding this has to select it — see the callers.
function recipientsFor(users, key) {
  return users.filter((u) => wantsMail(u, key));
}

// Accept only known keys and real booleans, and store only the opt-OUTs. Keeping
// `{ digest: false }` rather than every key means a notification added later
// defaults to on for users who have already saved preferences, instead of
// inheriting a stale `true` that was never a real choice.
function sanitizePrefs(input, role) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const allowed = new Set(keysForRole(role));
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (!KEY_SET.has(k) || !allowed.has(k)) continue;
    if (v === false) out[k] = false;
  }
  return Object.keys(out).length ? out : null;
}

// What the profile page renders: every toggle this role can receive, with its
// current state resolved through the same wantsMail the mailer uses.
function prefsForUser(user) {
  return NOTIFY_KEYS
    .filter((k) => k.roles.includes(user.role))
    .map(({ key, label, detail }) => ({
      key, label, detail, enabled: wantsMail(user, key),
    }));
}

module.exports = {
  NOTIFY_KEYS, keysForRole, wantsMail, recipientsFor, sanitizePrefs, prefsForUser,
};
