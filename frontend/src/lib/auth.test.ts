/**
 * @jest-environment jsdom
 */
// THE SESSION BOUNDARY — the one place browser-held data becomes a `SessionUser`.
//
// It had no test, which is awkward for the module that decides who the app
// thinks you are. Two of the three things pinned here were defects found by
// walking the app in a real browser on 2026-09-16/17 (§111):
//
//   1. `getSession()` was `JSON.parse(raw) as SessionUser` — a CAST, which
//      asserts a shape rather than checking one. A snapshot carrying a role
//      this build does not know reached `landingPathFor()`, which returned
//      `undefined`, which the router threw on: a blank page on the original
//      URL, token still present, no way out but devtools.
//   2. The topbar's role maps were `Record<string, …>` and silently missing
//      `executive`, which is why `ROLES` is now a runtime value and not only a
//      type — a closed set the code cannot enumerate is a set nothing can check.
//
// jsdom because every function here touches localStorage or sessionStorage.
import {
  ROLES, isRole, getSession, saveSession, clearSession,
  sessionConfirmedRecently, markSessionConfirmed,
  landingPathFor, hasPermission, firstPermittedPath,
  SessionUser,
} from './auth';

const ADMIN: SessionUser = { id: '1', name: 'Admin User', email: 'admin@isn.gov.my', role: 'admin' };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('the role set', () => {
  it('is the five the application ships', () => {
    expect([...ROLES]).toEqual(['athlete', 'medical', 'admin', 'coach', 'executive']);
  });

  it('accepts every role it declares', () => {
    for (const r of ROLES) expect(isRole(r)).toBe(true);
  });

  // The values actually observed in a corrupt snapshot, plus the shapes a
  // `typeof === 'string'` check alone would wave through.
  it.each([
    ['superuser', 'a role from a future build'],
    ['physio', 'a role that was renamed'],
    ['', 'an empty string'],
    ['Admin', 'the right role, wrong case'],
    [null, 'null'],
    [undefined, 'undefined'],
    [5, 'a number'],
    [{ role: 'admin' }, 'an object'],
    [['admin'], 'an array containing a real role'],
  ] as Array<[unknown, string]>)('refuses %p (%s)', (value: unknown) => {
    expect(isRole(value)).toBe(false);
  });

  it('gives every role a landing page', () => {
    for (const r of ROLES) expect(landingPathFor(r)).toMatch(/^\/\w/);
  });
});

describe('getSession', () => {
  it('returns the session it was given', () => {
    saveSession('a.b.c', ADMIN);
    expect(getSession()).toEqual({ token: 'a.b.c', user: ADMIN });
  });

  it('is null when nothing is stored', () => {
    expect(getSession()).toBeNull();
  });

  it('is null when the token is missing but the user snapshot is not', () => {
    localStorage.setItem('airms_user', JSON.stringify(ADMIN));
    expect(getSession()).toBeNull();
  });

  // THE MEASURED DEFECT. Before 2026-09-17 this returned the object as though
  // it were a SessionUser, and the blank page happened three screens later.
  it.each(['superuser', 'physio', '', 'ADMIN'])('refuses a snapshot whose role is %p', (role) => {
    localStorage.setItem('airms_token', 'a.b.c');
    localStorage.setItem('airms_user', JSON.stringify({ ...ADMIN, role }));
    expect(getSession()).toBeNull();
  });

  it('refuses a snapshot with no role at all', () => {
    localStorage.setItem('airms_token', 'a.b.c');
    localStorage.setItem('airms_user', JSON.stringify({ id: '1', name: 'X', email: 'x@y.z' }));
    expect(getSession()).toBeNull();
  });

  it('refuses a snapshot that is not JSON', () => {
    localStorage.setItem('airms_token', 'a.b.c');
    localStorage.setItem('airms_user', 'not json {');
    expect(getSession()).toBeNull();
  });

  // A snapshot it refuses must not survive. Left in place, every page load
  // re-reads it and bounces the user to sign in from a state that still looks
  // signed in — which is the stuck loop, just one screen further along.
  it('DISCARDS a snapshot it refuses, rather than ignoring it', () => {
    localStorage.setItem('airms_token', 'a.b.c');
    localStorage.setItem('airms_user', JSON.stringify({ ...ADMIN, role: 'superuser' }));
    getSession();
    expect(localStorage.getItem('airms_token')).toBeNull();
    expect(localStorage.getItem('airms_user')).toBeNull();
  });

  // Validating more than the role would force a sign-out on anyone holding a
  // session written before a field was added. `role` is the only field the app
  // branches on, and the only one whose absence from a map is silent.
  it('keeps a session that merely lacks OPTIONAL fields', () => {
    localStorage.setItem('airms_token', 'a.b.c');
    localStorage.setItem('airms_user', JSON.stringify({ role: 'coach' }));
    expect(getSession()?.user.role).toBe('coach');
  });
});

describe('how often the server is asked to confirm a session', () => {
  it('has not confirmed anything before it is told so', () => {
    expect(sessionConfirmedRecently('a.b.c')).toBe(false);
  });

  it('reports a fresh confirmation', () => {
    markSessionConfirmed('a.b.c');
    expect(sessionConfirmedRecently('a.b.c')).toBe(true);
  });

  // Keyed by token, so signing out and in as somebody else cannot inherit the
  // previous person's confirmation.
  it('does not confirm a DIFFERENT token', () => {
    markSessionConfirmed('a.b.c');
    expect(sessionConfirmedRecently('x.y.z')).toBe(false);
  });

  it('expires, so a session is re-confirmed rather than trusted for ever', () => {
    const realNow = Date.now;
    try {
      Date.now = () => 1_000_000;
      markSessionConfirmed('a.b.c');
      Date.now = () => 1_000_000 + 59_000;
      expect(sessionConfirmedRecently('a.b.c')).toBe(true);
      Date.now = () => 1_000_000 + 61_000;
      expect(sessionConfirmedRecently('a.b.c')).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });

  // `Number(null)` is 0, which is a finite number and 56 years in the past —
  // a naive `Date.now() - at < TTL` would read a MISSING marker as one written
  // in 1970 and, being far outside the window, get the right answer by luck.
  // This pins the answer rather than the luck: garbage is never "confirmed".
  it.each(['', 'null', 'not-a-number', '0', '-1'])('treats a %p marker as unconfirmed', (raw) => {
    sessionStorage.setItem('airms_me:a.b.c', raw);
    expect(sessionConfirmedRecently('a.b.c')).toBe(false);
  });

  // The whole credential must not be copied into a second storage area.
  it('does not store the token itself', () => {
    const token = 'header.payloadpayloadpayloadpayload.signature';
    markSessionConfirmed(token);
    expect(JSON.stringify(sessionStorage)).not.toContain(token);
  });

  it('is forgotten when the session ends', () => {
    saveSession('a.b.c', ADMIN);
    markSessionConfirmed('a.b.c');
    clearSession();
    // A new sign-in mints a new token, so the old marker can never be read
    // again — but the session it belonged to is gone either way.
    expect(getSession()).toBeNull();
  });
});

describe('capabilities', () => {
  it('constrains only medical staff', () => {
    for (const role of ROLES) {
      const user = { ...ADMIN, role, permissions: { uploadData: false } };
      expect(hasPermission(user, 'uploadData')).toBe(role !== 'medical');
    }
  });

  it('grants what has not been explicitly revoked', () => {
    expect(hasPermission({ ...ADMIN, role: 'medical', permissions: {} }, 'uploadData')).toBe(true);
    expect(hasPermission({ ...ADMIN, role: 'medical', permissions: null }, 'viewRecords')).toBe(true);
  });

  // The dead-end this exists to prevent: a medical account with everything
  // revoked still needs somewhere to be, and profile is never gated.
  it('sends fully-revoked medical staff to a page that still exists', () => {
    const stripped = {
      ...ADMIN,
      role: 'medical' as const,
      permissions: { viewRecords: false, editCohortNorms: false, uploadData: false },
    };
    expect(firstPermittedPath(stripped)).toBe('/medical/profile');
  });
});
