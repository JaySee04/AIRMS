import Link from 'next/link';

// The page a wrong URL lands on.
//
// Without this, Next's stock 404 renders: unstyled, in the framework's own
// voice, naming the framework. Two reasons that is worth replacing here, and
// neither is aesthetics:
//
//   - It is reachable WITHOUT a session, so it is one of the few AIRMS screens a
//     stranger can see. It should say nothing about what exists behind the login
//     — no route list, no "you may not have permission", no hint that the
//     address was nearly right. It reads the same for a typo, a stale
//     bookmark and a probe.
//   - During a demo a stray click that produces a raw framework error page
//     reads as "the system is broken", which is a bad thirty seconds to spend in
//     front of a stakeholder.
//
// The link goes to `/` and nowhere else. Sending someone to a dashboard would
// guess at a role this page cannot know — an unauthenticated visitor has none,
// and `/` is the sign-in screen that already routes each role correctly after
// login.
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--sp-lg)',
        background: 'var(--bg)',
      }}
    >
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <p
          style={{
            fontSize: 'var(--fs-2xs)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            margin: '0 0 var(--sp-xs)',
          }}
        >
          Error 404
        </p>
        <h1 className="card-title" style={{ fontSize: 'var(--fs-xl)' }}>
          That page does not exist
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: '0 0 var(--sp-lg)' }}>
          The address may have been mistyped, or the page may have been moved.
          Sign in to reach your dashboard.
        </p>
        <Link href="/" className="btn btn-primary">
          Go to sign in
        </Link>
      </div>
    </main>
  );
}
