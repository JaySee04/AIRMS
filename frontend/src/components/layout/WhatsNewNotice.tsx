'use client';

// WHAT CHANGED THIS WEEK, said once, in words a clinician can act on.
//
// A lot moved in the import pipeline between 2026-09-27 and 2026-10-01, and
// every one of those changes is invisible until somebody tries the thing it
// affects: an operator who learned that a 38-page report is "too big to upload"
// has no reason to try again, and one who expects an import to take half a
// minute will not notice that it now takes under a second. A release nobody is
// told about is a release half the users never get.
//
// ONCE, AND PER USER — not per browser. localStorage is per-origin, so a key
// like `airms_whatsnew_v1` would show this to whoever opens a shared clinic
// terminal first and to nobody after. That is the §79 lesson: the "since you
// last looked" marker is keyed per user for exactly this reason, because a
// shared terminal otherwise hands one reader's "seen" to the next.
//
// VERSIONED, so the NEXT release can speak. A bare key would make this a
// one-off: dismissed in October, silent for ever. Bump VERSION and the notice
// returns, once, for everyone.
//
// IF STORAGE IS UNREADABLE IT DOES NOT SHOW AT ALL. Private browsing throws on
// localStorage, and a changelog that cannot remember being dismissed would
// reappear on every single navigation — far worse than missing it. A nag is a
// bigger failure than a silence here, so this fails to silent.
//
// NOT A FEATURE ANNOUNCEMENT FOR ITS OWN SAKE: every entry is something the
// reader's own next action depends on. Nothing about test coverage, refactors or
// documentation, which changed far more this week and changes nothing for them.

import { useEffect, useState } from 'react';
import { getSession } from '@/lib/auth';

/** Bump this when there is something new to say. */
const VERSION = 1;

type Entry = { title: string; body: string };

// Derived from what actually shipped — `git log --since` for the week, filtered
// to changes with a visible consequence. Plain language on purpose: no section
// numbers, no "text layer", no "vision provider". The reader is a physiologist
// or an administrator, not a maintainer of this repo.
const ENTRIES: Entry[] = [
  {
    title: 'Importing a report is much faster',
    body: 'AIRMS now reads the numbers straight out of the HoloMotion PDF instead of '
      + 'sending pictures of it away to be read. Most reports finish in under a second, '
      + 'and the file never leaves this computer.',
  },
  {
    title: 'Big reports no longer get rejected',
    body: 'A full-length report used to be too large to upload. AIRMS now sends only the '
      + 'pages it actually needs, so the long ones import normally. You do not have to do '
      + 'anything differently.',
  },
  {
    title: 'The wrong file is caught straight away',
    body: 'If you pick a PDF that is not a HoloMotion screening report, AIRMS says so '
      + 'immediately and does not send it anywhere. Before, it would try to read it and '
      + 'give you a confusing result.',
  },
  {
    title: 'Easier to read, especially in dark mode',
    body: 'Several labels and numbers were too faint to read — the risk bands, the squad '
      + 'charts, and your own name in the top corner. All of them have been corrected.',
  },
  {
    title: 'Import a whole session at once',
    body: 'HoloMotion saves one folder per screening session. You can now choose the '
      + 'folder instead of picking the files out of it, and AIRMS ignores anything in '
      + 'there that is not a report. Reports that it can match to an athlete by itself '
      + 'are folded away, so what is left on screen is only what needs you.',
  },
  {
    title: 'Works properly with a screen reader',
    body: 'The settings that control how athletes are scored, and the forms for adding '
      + 'staff, now announce what each field is. Previously they were read out as just '
      + '"edit text".',
  },
];

function storageKey(userId: string) {
  return `airms_whatsnew_v${VERSION}:${userId}`;
}

export default function WhatsNewNotice() {
  const [show, setShow] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    // In an effect, not during render: localStorage does not exist on the
    // server, and reading it while rendering would make the markup differ
    // between server and client and trip hydration.
    // getSession() returns { token, user } — the id is on `user`. Typed, so the
    // first attempt at `session.id` failed the build rather than silently keying
    // every user's dismissal under "undefined", which would have made this
    // per-browser again and defeated the point.
    const session = getSession();
    const id = session?.user?.id ? String(session.user.id) : null;
    if (!id) return;
    setUserId(id);
    try {
      if (window.localStorage.getItem(storageKey(id)) !== '1') setShow(true);
    } catch {
      // Unreadable storage — stay silent rather than nag on every navigation.
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    setShow(false);
    if (!userId) return;
    try { window.localStorage.setItem(storageKey(userId), '1'); } catch { /* nothing to do */ }
  };

  return (
    <div className="modal-backdrop" onClick={dismiss}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsnew-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560 }}
      >
        <div className="modal-header">
          <h2 id="whatsnew-title" style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>What&rsquo;s new in AIRMS</h2>
          <button type="button" className="modal-close" onClick={dismiss} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <p className="text-muted" style={{ marginTop: 0, fontSize: 'var(--fs-sm)' }}>
            A few things changed this week. You only see this once.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--sp-md)' }}>
            {ENTRIES.map((e) => (
              <li key={e.title}>
                <div style={{ fontWeight: 600, fontSize: 'var(--fs-md)' }}>{e.title}</div>
                <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 2 }}>{e.body}</div>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-primary" onClick={dismiss}>Got it</button>
        </div>
      </div>
    </div>
  );
}
