// A piece of page state expressed as ONE query parameter — the one definition,
// used in both directions (§161, generalised in §163).
//
// §161 built this for the medical dashboard's `?athlete=`, after opening a
// record turned out to change nothing in the address bar, which made three
// things wrong at once and all of them read as "there is no back button":
//
//   1. Opening an athlete was not addressable — no bookmark, no reload, nothing
//      to send a colleague.
//   2. The browser's back button left the PAGE instead of stepping back,
//      because opening a record pushed no history entry.
//   3. `?athlete=<IC>` survived "Back to worklist", so a reload threw the
//      clinician straight back into the record they had just left.
//
// §163 found the same fault on two more pages — the coach's squad drill-down
// and Sport Assessment's sport picker — so the helpers take the parameter's
// NAME rather than hard-coding `athlete`. One definition, three call sites,
// instead of three copies drifting.
//
// Kept apart from the hook (useUrlParam.ts) so it can be tested without
// React or a browser.

// The search string the state SHOULD have. Returns '' for "nothing selected",
// never '?' — an empty query string with a bare '?' is a different URL to the
// browser and would push a history entry that changes nothing.
//
// Writes ONLY this parameter. A page's address carries one piece of state; a
// one-shot hint that arrived with a deep link (`from=`) is read once on mount
// and is not meant to follow the reader around.
export function paramSearch(name: string, value: string | null | undefined): string {
  if (!value) return '';
  return `?${name}=${encodeURIComponent(value)}`;
}

// The value an address says is selected. Blank and whitespace-only read as
// NOTHING rather than as the empty string — `?athlete=` would otherwise select
// a record that cannot exist and the pane would sit on a permanent "could not
// load".
export function paramFromSearch(name: string, search: string | null | undefined): string | null {
  if (!search) return null;
  const v = new URLSearchParams(search).get(name);
  if (v === null) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

// Does the address already say what the page says? Guards the write, and it is
// what stops the loop: a popstate sets the state, the sync effect runs, and
// without this it would push the entry the user just went back from.
export function paramMatchesSearch(
  name: string,
  value: string | null | undefined,
  search: string | null | undefined,
): boolean {
  return paramFromSearch(name, search) === (value || null);
}

// Fired by the sidebar when its link points at the page already open (§163).
// A Next <Link> to the SAME pathname does not remount the page, so the page
// never learns it was asked to go home: measured, the address changed to the
// worklist while the record stayed open — the address bar and the screen
// disagreeing, which is §161's defect reached by a different door.
export const SECTION_HOME_EVENT = 'airms:section-home';
