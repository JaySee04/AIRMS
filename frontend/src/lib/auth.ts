// THE ROLE SET — a SHARED FACT since 2026-09-17 (§111.6), not a local union.
//
//   athlete   own dashboard, history, squad
//   medical   clinical view + import + norms, gated per-capability
//   admin     everything institutional
//   coach     read-only, scoped to one sport
//   executive read-only oversight: admin analytics + reports, nothing that writes
//
// It was written out at each use site until `executive` arrived and four unions
// had to be found and made to agree; it then spent a year as a bare union HERE,
// which the compiler understands and NOTHING ELSE CAN ENUMERATE. That matters
// because the role comes back from `localStorage` and from the API — places no
// type reaches — and `getSession()` below has to ask "is this one of ours?"
// against something real.
//
// Making it a runtime value is what revealed it was a shared fact at all:
// `crossPackage.test.js` saw the same name in both packages and refused to pass.
// The set now lives in `shared/facts.js` and is GENERATED into each package, so
// a role the backend accepts and this half cannot place is a failing test rather
// than a login onto a blank screen. Add one there and `npm run sync:shared`.
export { ROLES } from './shared/facts';
export type { Role } from './shared/facts';

import { ROLES } from './shared/facts';
import type { Role } from './shared/facts';

/** Runtime membership of the closed set the `Role` type describes. */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  athleteId?: string;
  // Per-feature toggles for medical staff (opt-out model). null/undefined or a
  // missing key means the capability is granted. Only `false` blocks.
  permissions?: Record<string, boolean> | null;
}

// Feature keys the admin can revoke for individual medical staff. Mirrors
// backend/src/utils/permissions.js.
export type PermissionKey = 'viewRecords' | 'uploadData' | 'editCohortNorms';

// True unless this is a medical user with the capability explicitly revoked.
// athlete/admin are never constrained by this layer.
export function hasPermission(user: SessionUser | null | undefined, key: PermissionKey): boolean {
  if (!user || user.role !== 'medical') return true;
  const perms = user.permissions;
  if (!perms) return true;
  return perms[key] !== false;
}

export function saveSession(token: string, user: SessionUser): void {
  localStorage.setItem('airms_token', token);
  localStorage.setItem('airms_user', JSON.stringify(user));
}

// THE ONE PLACE UNTRUSTED DATA BECOMES A `SessionUser`, AND IT IS CHECKED HERE
// RATHER THAN AT EVERY USE SITE (2026-09-17, §111.6).
//
// This used to be `JSON.parse(raw) as SessionUser` — a cast, which asserts a
// shape rather than establishing one. The snapshot is written by us but STORED
// BY THE BROWSER, so by the time it comes back it is input: a user can edit it,
// and a release that renames or retires a role leaves every seven-day session
// in the institute carrying a role this build has never heard of.
//
// Measured, in a real browser, with the role set to "superuser": the gate below
// correctly refused the page, called `landingPathFor('superuser')`, got
// `undefined`, and handed it to the router — which threw `Cannot read
// properties of undefined (reading 'startsWith')`. A BLANK PAGE, on the
// original URL, with the token still in localStorage and no sign-out anywhere.
// That is a worse outcome than the executive dropdown §111 was written about,
// and reloading reproduced it exactly.
//
// The fix belongs here and not in `landingPathFor`, which is the tempting
// place: a `?? '/'` there would have silenced this one crash and left every
// other reader of `session.user.role` — the sidebar's `NAV[role]`, the topbar's
// two maps — holding the same undefined. One boundary, checked once.
//
// It validates the ROLE and nothing else. Validating `id`/`email`/`name` too
// would reject sessions written by an older build that happened to omit a field
// this one added, which trades a rare crash for a routine forced sign-out.
// `role` is the only field the app BRANCHES on, and the only one whose absence
// from a map is silent.
export function getSession(): { token: string; user: SessionUser } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem('airms_token');
  const raw = localStorage.getItem('airms_user');
  if (!token || !raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearSession();
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || !isRole((parsed as { role?: unknown }).role)) {
    // Refused snapshots are DISCARDED, not merely ignored. Left in place, the
    // browser holds a credential it can never use again and every page load
    // re-reads it — the user is bounced to the sign-in screen from a state that
    // still looks signed in. Clearing it makes the next screen the true one.
    clearSession();
    return null;
  }
  return { token, user: parsed as SessionUser };
}

export function clearSession(): void {
  localStorage.removeItem('airms_token');
  localStorage.removeItem('airms_user');
}

// HOW OFTEN THE SERVER IS ASKED TO CONFIRM A SESSION (2026-09-17, §111.7).
//
// `DashboardLayout` calls `GET /auth/me` on mount, and it mounts on every page
// — so the confirmation fired once per navigation. MEASURED against the dev
// server: eight calls for one admin opening five pages. §80.2 had already taken
// this from three per page load to one by comparing `allowedRoles` as a value;
// what it could not remove is that moving between pages is a fresh mount.
//
// This is not free on the deployed instance. The API is serverless, each call
// can be a cold start, and it sits in front of the paint — so the cost lands as
// latency on the clinician's next click, repeatedly, to re-answer a question
// answered seconds ago.
//
// WHAT THE CACHE MUST NOT WEAKEN. The call exists to catch a token that has
// expired, a role an admin changed, and a capability an admin revoked. The
// guarantee today is "within one navigation" — and it is already unbounded for
// anyone who stays on one page, which is most of a clinic's day. A 60-second
// ceiling does not loosen that worst case; it removes the repeats inside it.
// The backend re-reads the user row on EVERY request regardless, which is the
// boundary that actually stops a deactivated account (CLAUDE.md, middleware/auth).
//
// Kept in `sessionStorage`, not a module variable, for two reasons: it is
// per-tab, so a second tab confirms for itself; and it is inspectable, so this
// is debuggable from the console rather than only from a React devtool.
// Keyed by TOKEN so that signing out and back in as somebody else can never
// reuse the previous person's confirmation.
// MEASURED, A/B, against a PRODUCTION build with this value as the only
// variable — dev is not the number that matters, because StrictMode
// double-invokes effects on purpose. One admin opening five admin pages:
//
//                        before   after
//   five full page loads    7       2
//   five in-app clicks      6       2
//
// The residual two are the tab's first confirmation plus one race — the marker
// is written when the answer ARRIVES, so a second mount that starts before the
// first reply lands asks again. Correct, and not worth a lock: the cost of the
// race is one duplicate request, the cost of a lock is a page that waits on a
// request it does not need.
const CONFIRM_TTL_MS = 60_000;

function confirmKey(token: string): string {
  // Last 24 chars: enough to distinguish tokens, and it keeps a whole JWT —
  // which is a credential — out of a second storage area and out of any
  // screenshot of devtools.
  return `airms_me:${token.slice(-24)}`;
}

/** True when this tab confirmed THIS token with the server inside the TTL. */
export function sessionConfirmedRecently(token: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const at = Number(sessionStorage.getItem(confirmKey(token)));
    // `Number('')` is 0 and `Number(null)` is 0, so a missing marker fails the
    // window test rather than reading as "confirmed in 1970".
    return Number.isFinite(at) && at > 0 && Date.now() - at < CONFIRM_TTL_MS;
  } catch {
    return false;
  }
}

export function markSessionConfirmed(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(confirmKey(token), String(Date.now()));
  } catch {
    // Storage can be full or blocked. Failing to record a confirmation costs an
    // extra round trip; it must never cost the page.
  }
}

// WHERE EACH ROLE LANDS. One definition, typed `Record<Role, …>` so adding a
// sixth role fails the build here rather than at runtime (2026-09-16, §111).
//
// This used to live in app/page.tsx as the login redirect alone, typed
// `Record<string, string>` with an `?? '/athlete/dashboard'` fallback — which
// for an unrecognised role sent the user to a page that immediately bounces
// them back to the sign-in form, i.e. a login that appears to fail silently.
// There is no fallback now because the type makes an unhandled role
// impossible.
//
// `executive` lands on the admin analytics dashboard deliberately: the role has
// no pages of its own, it reads the admin ones it is permitted to see.
const LANDING: Record<Role, string> = {
  athlete: '/athlete/dashboard',
  medical: '/medical/dashboard',
  admin: '/admin/dashboard',
  coach: '/coach/dashboard',
  executive: '/admin/dashboard',
};

export function landingPathFor(role: Role): string {
  return LANDING[role];
}

// First page a medical staffer is still permitted to see — used to route them
// away from a revoked page instead of showing a dead-end denial message.
// Profile is the unconditional fallback (never permission-gated).
const MEDICAL_PAGES: Array<{ path: string; perm: PermissionKey }> = [
  { path: '/medical/dashboard', perm: 'viewRecords' },
  { path: '/medical/cohort-norms', perm: 'editCohortNorms' },
  { path: '/medical/data-upload', perm: 'uploadData' },
];

export function firstPermittedPath(user: SessionUser): string {
  if (user.role !== 'medical') return '/';
  const open = MEDICAL_PAGES.find((p) => hasPermission(user, p.perm));
  return open ? open.path : '/medical/profile';
}
