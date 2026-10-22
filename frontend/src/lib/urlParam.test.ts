import { selectionFromSearch, selectionMatchesSearch, selectionSearch } from './selectionUrl';

// The address bar is the medical dashboard's record of WHICH ATHLETE IS OPEN.
// It was not, until 2026-10-12 — opening a record changed nothing, so the back
// button left the page and `?athlete=` outlived "Back to worklist" (§161).

describe('selectionSearch', () => {
  it('writes the open record into the query string', () => {
    expect(selectionSearch('030109371036')).toBe('?athlete=030109371036');
  });

  it('writes the WORKLIST as an empty string, never a bare "?"', () => {
    // '?' and '' are different URLs to the browser, so returning '?' would push
    // a history entry that changes nothing a reader can see — a back press that
    // appears to do nothing is worse than no entry at all.
    expect(selectionSearch(null)).toBe('');
    expect(selectionSearch(undefined)).toBe('');
    expect(selectionSearch('')).toBe('');
  });

  it('encodes the id rather than pasting it in', () => {
    // An IC is 12 digits today. This is not about ICs: it is about never
    // building a URL by concatenation, which is how one stray & silently
    // truncates an identifier.
    expect(selectionSearch('a b&c=d')).toBe('?athlete=a%20b%26c%3Dd');
  });
});

describe('selectionFromSearch', () => {
  it('reads the open record back out', () => {
    expect(selectionFromSearch('?athlete=030109371036')).toBe('030109371036');
  });

  it('round-trips an id that needed encoding', () => {
    const id = 'a b&c=d';
    expect(selectionFromSearch(selectionSearch(id))).toBe(id);
  });

  it('reads no param, an empty param and a blank param ALL as the worklist', () => {
    // `?athlete=` is the one that matters. Returned as '' it would select a
    // record whose id is the empty string: the pane opens, the fetch 404s, and
    // the clinician sits on a permanent "could not load" with no way to tell
    // that nothing was ever asked for.
    expect(selectionFromSearch('')).toBeNull();
    expect(selectionFromSearch(null)).toBeNull();
    expect(selectionFromSearch('?athlete=')).toBeNull();
    expect(selectionFromSearch('?athlete=%20%20')).toBeNull();
    expect(selectionFromSearch('?other=1')).toBeNull();
  });

  it('ignores other parameters around it', () => {
    expect(selectionFromSearch('?tab=history&athlete=123&x=2')).toBe('123');
  });
});

describe('selectionMatchesSearch', () => {
  // THE GUARD THAT STOPS THE LOOP. A back press fires popstate, which sets the
  // selection, which runs the sync effect — and without this check that effect
  // pushes the entry the user just left, so back appears not to work.
  it('is true when the address already says what the page says', () => {
    expect(selectionMatchesSearch('123', '?athlete=123')).toBe(true);
    expect(selectionMatchesSearch(null, '')).toBe(true);
  });

  it('treats the worklist and an EMPTY param as the same state', () => {
    // Otherwise landing on `?athlete=` pushes for ever: the page reads null,
    // the address reads '', they never agree.
    expect(selectionMatchesSearch(null, '?athlete=')).toBe(true);
  });

  it('is false when they disagree, in either direction', () => {
    expect(selectionMatchesSearch('123', '')).toBe(false);
    expect(selectionMatchesSearch(null, '?athlete=123')).toBe(false);
    expect(selectionMatchesSearch('123', '?athlete=456')).toBe(false);
  });

  it('agrees with the pair it guards, for every state the page can hold', () => {
    // The property that actually matters: whatever selectionSearch would write
    // is a URL selectionMatchesSearch already considers in step. If these two
    // ever disagree the page pushes a history entry on every single render.
    for (const id of [null, '', '123', '030109371036', 'a b&c=d']) {
      expect(selectionMatchesSearch(id, selectionSearch(id))).toBe(true);
    }
  });
});
