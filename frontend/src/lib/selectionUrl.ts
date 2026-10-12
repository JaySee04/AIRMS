// Which athlete is open, expressed as a URL — the one definition, used in both
// directions (2026-10-12, DESIGN_DECISIONS §161).
//
// The medical dashboard opens a record WITHOUT changing the address, which made
// three things wrong at once and all of them read as "there is no back button":
//
//   1. Opening an athlete was not addressable. You could not bookmark the record
//      you were reading, or send it to a colleague, or reload it.
//   2. The browser's back button did not step back to the worklist, because
//      opening a record pushed no history entry. It left the PAGE — measured, it
//      went out to `/` and bounced back in as a fresh load, which happens to
//      land on the worklist and so looks like it worked.
//   3. `?athlete=<IC>` survived "Back to worklist". The selection cleared, the
//      URL did not, and a reload threw the clinician straight back into the
//      record they had just explicitly left.
//
// (3) is the one that matters clinically: the address bar asserted a record was
// open when it was not, and the next reload believed the address bar.
//
// Kept apart from the page so it can be tested without mounting it — that page
// is 1274 lines and makes a dozen fetches, which is the "large brittle
// investment" the testing notes warn about. The page keeps the parts only a
// browser can own: when to push, and listening for popstate.
//
// NOT built on `useSearchParams`. That hook forces a Suspense boundary on any
// page that calls it and this page is one large client component — the same
// reason the original deep-link read used `window.location` directly.

const PARAM = 'athlete';

// The search string an open record SHOULD have. Returns '' for the worklist,
// never '?' — an empty query string with a bare '?' is a different URL to the
// browser and would push a history entry that changes nothing.
export function selectionSearch(athleteId: string | null | undefined): string {
  if (!athleteId) return '';
  return `?${PARAM}=${encodeURIComponent(athleteId)}`;
}

// The record an address says is open. Blank and whitespace-only read as the
// worklist rather than as an athlete whose IC is the empty string — `?athlete=`
// would otherwise select a record that cannot exist and the pane would sit on a
// permanent "could not load".
export function selectionFromSearch(search: string | null | undefined): string | null {
  if (!search) return null;
  const id = new URLSearchParams(search).get(PARAM);
  if (id === null) return null;
  const trimmed = id.trim();
  return trimmed === '' ? null : trimmed;
}

// Does the address already say what the page says? Guards the push, and it is
// what stops the loop: a popstate sets the selection, the selection effect runs,
// and without this it would push the entry the user just went back from.
export function selectionMatchesSearch(
  athleteId: string | null | undefined,
  search: string | null | undefined,
): boolean {
  return selectionFromSearch(search) === (athleteId || null);
}
