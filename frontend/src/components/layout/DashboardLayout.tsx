'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { api, isAuthError } from '@/lib/api';
import {
  getSession, saveSession, clearSession, isRole,
  sessionConfirmedRecently, markSessionConfirmed,
  SessionUser, PermissionKey, Role, hasPermission, firstPermittedPath, landingPathFor,
} from '@/lib/auth';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRoles: Role[];
  title: string;
  // When set, medical staff lacking this capability are routed to their first
  // still-permitted page — revoked features simply don't exist for them (no
  // sidebar entry, no dead-end denial page). athlete/admin are unaffected.
  requiredPermission?: PermissionKey;
}

export default function DashboardLayout({ children, allowedRoles, title, requiredPermission }: DashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  // Off-canvas navigation below the desktop breakpoint. The sidebar is a fixed
  // 256px column that the main area is margin-offset by, with no breakpoint —
  // so on a tablet the content started 256px off-screen and every page scrolled
  // sideways. Desktop is unchanged; this only governs the narrow layout.
  const [navOpen, setNavOpen] = useState(false);

  // The allowed roles as a VALUE, not as an array identity.
  //
  // Every page passes this prop as a literal — `allowedRoles={['medical',
  // 'admin']}` — so React builds a new array on every render of that page. With
  // the array itself in the effect's dependency list, the session check re-ran
  // on every parent re-render, and a dashboard re-renders several times as its
  // panels' data arrives.
  //
  // Measured against a PRODUCTION build (dev is not the number that matters —
  // StrictMode double-invokes effects on purpose): `GET /auth/me` fired THREE
  // times on /medical/dashboard, three on /athlete/dashboard and twice on
  // /coach/dashboard, for one page load each. Three identical round trips to
  // confirm one session, on a serverless API where each one can be a cold
  // start.
  //
  // Comparing by value fixes it without weakening the gate: if a page ever did
  // change which roles it allows, the string changes and the check re-runs.
  // This is the same trap DashboardLayout.test.tsx already warns about for its
  // router stub — "a router mock returning a fresh object each render loops for
  // ever" — reached here through an ordinary prop instead of a mock.
  const rolesKey = allowedRoles.join('|');

  useEffect(() => {
    // Derived from the string rather than closed over the array, so the effect
    // genuinely has no dependency on the prop's identity.
    const roles = rolesKey.split('|') as Role[];
    const session = getSession();
    if (!session) {
      // No session at all: the sign-in screen is the correct destination.
      router.replace('/');
      return;
    }
    if (!roles.includes(session.user.role)) {
      // SIGNED IN, BUT NOT FOR THIS PAGE — send them to their OWN landing page,
      // not to '/' (2026-09-16, §111).
      //
      // Both cases used to redirect to the sign-in form, which for an
      // authenticated person reads as "you have been logged out": a coach
      // opening a colleague's bookmark to /admin/dashboard was shown a password
      // prompt while holding a perfectly good session. Nobody was stuck — you
      // can sign in again — but the screen said the opposite of what happened,
      // which is this project's whole defect class.
      //
      // Guarded against redirecting a page to itself: if the landing page is the
      // one that just refused us, the role model is inconsistent and '/' is the
      // only safe answer. Unreachable today (every landing page names its own
      // role in allowedRoles) and deliberately not left to be discovered.
      // `window.location.pathname`, not the `pathname` hook, on purpose: adding
      // it to this effect's dependency list would re-run the session check —
      // and the /auth/me call with it — on navigation, which is the exact cost
      // the `rolesKey` comment above exists to have removed.
      const landing = landingPathFor(session.user.role);
      router.replace(landing === window.location.pathname ? '/' : landing);
      return;
    }
    setUser(session.user);
    const saved = localStorage.getItem('airms_theme') as 'light' | 'dark' | null;
    if (saved) setTheme(saved);

    // Confirm the session with the SERVER, for every role.
    //
    // The gate above reads `airms_user` out of localStorage, which is a
    // login-time snapshot the browser owns — on its own it answers "what does
    // this browser claim?", not "who is this?". Two consequences, and the first
    // is an ordinary bug rather than an attack:
    //
    //   A token expires after 7 days. Returning on day 8, the snapshot still
    //   said "admin", so the shell rendered and then every panel failed 401 — a
    //   broken page instead of the sign-in screen.
    //
    //   Editing that snapshot by hand rendered the shell too. No data ever came
    //   with it (every request 401s, which is the boundary that counts), but an
    //   empty admin frame is not something to hand anybody.
    //
    // Asking the server settles both. It also picks up a permission an admin
    // revoked mid-session, which is why this call already existed for medical.
    //
    // ...but not more than once a minute per tab. This component mounts on every
    // page, so the confirmation was firing on every navigation — eight calls for
    // five pages, measured. See `sessionConfirmedRecently` for what that does and
    // does not weaken (§111.7).
    if (sessionConfirmedRecently(session.token)) return;
    api.get<{ user: SessionUser }>('/auth/me')
      .then(({ user: fresh }) => {
        // A role this build does not know. The snapshot path cannot produce one
        // any more (getSession refuses it), but this value comes from the API,
        // so it is checked where it ARRIVES rather than assumed to be clean —
        // `landingPathFor` would hand the router `undefined` and blank the page.
        // Nothing here can place them, so nothing is guessed: end the session.
        if (!isRole(fresh.role)) { clearSession(); router.replace('/'); return; }
        // The server disagrees with the snapshot about this user's role — most
        // plausibly an admin changed it mid-session. They are authenticated, so
        // the same rule applies: their own landing page, not a password prompt.
        if (!roles.includes(fresh.role)) {
          const landing = landingPathFor(fresh.role);
          router.replace(landing === window.location.pathname ? '/' : landing);
          return;
        }
        saveSession(session.token, fresh);
        // Marked only on a CONFIRMED answer. A refusal or a network failure
        // leaves no marker, so the next navigation asks again rather than
        // treating "we could not check" as "we checked".
        markSessionConfirmed(session.token);
        setUser(fresh);
      })
      .catch((err) => {
        // Only a refusal ends the session. A network failure must not sign
        // somebody out — that would drop the whole institute back to the login
        // page the moment the API blinked.
        if (isAuthError(err)) { clearSession(); router.replace('/'); }
      });
  }, [rolesKey, router]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('airms_theme', theme);
  }, [theme]);

  // NO PER-PAGE BROWSER TAB TITLE HERE, AND THE ATTEMPT IS WORTH RECORDING.
  //
  // All twenty authenticated pages share one tab title, from app/layout.tsx's
  // `metadata`: "AIRMS — Athlete Injury Risk Management System". Three tabs open
  // on the roster, an athlete's record and the norms are indistinguishable,
  // which is the same as having no title at all.
  //
  // The obvious fix — `useEffect(() => { document.title = ... }, [title])` right
  // here, where the title prop already is — was written, and it DOES NOT WORK.
  // Measured, not assumed: the effect body runs (it logged), and
  // `document.title` still reads the metadata value at 0, 500, 1500 and 3000ms
  // afterwards. Next's App Router renders metadata as part of the tree and
  // re-applies it after client effects commit, so the assignment lands and is
  // immediately overwritten. A manual `document.title = 'PROBE'` from the
  // console sticks, which is what proves it is the framework and not the page.
  //
  // It was REMOVED rather than left in, because an effect that runs, looks
  // correct in review and changes nothing is this project's signature defect —
  // `winAnsiSafe` shipped defined, exported, unit-tested and never called.
  //
  // Doing it properly needs a server `layout.tsx` beside each client page,
  // exporting `metadata: { title }`, since a client component cannot export
  // metadata at all. That is ~20 small files and a second copy of every page
  // name, so it is JC's call rather than a side effect of a naming pass. See
  // DESIGN_DECISIONS §87.

  // Route away from pages whose capability has been revoked.
  const blocked = user && requiredPermission ? !hasPermission(user, requiredPermission) : false;
  useEffect(() => {
    if (user && blocked) router.replace(firstPermittedPath(user));
  }, [user, blocked, router]);

  // Navigating closes the drawer — otherwise it stays over the page the user
  // just asked for.
  useEffect(() => { setNavOpen(false); }, [pathname]);

  // Escape closes it, which is what a keyboard user expects of anything that
  // covers the page.
  useEffect(() => {
    if (!navOpen) return undefined;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setNavOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navOpen]);

  function handleLogout() {
    clearSession();
    router.push('/');
  }

  if (!user) return null;

  return (
    <div className={`app-shell${navOpen ? ' nav-open' : ''}`}>
      <Sidebar user={user} />
      {/* Tapping away from an open drawer closes it. Rendered only while open so
          it can never intercept clicks on the desktop layout. */}
      {navOpen && (
        <button
          type="button"
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setNavOpen(false)}
        />
      )}
      <div className="main-area">
        <Topbar
          user={user}
          title={title}
          theme={theme}
          navOpen={navOpen}
          onToggleNav={() => setNavOpen((o) => !o)}
          onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          onLogout={handleLogout}
        />
        <main className="page-content">
          {blocked ? null : children}
        </main>
      </div>
    </div>
  );
}
