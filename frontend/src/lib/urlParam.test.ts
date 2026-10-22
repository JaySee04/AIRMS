import { paramFromSearch, paramMatchesSearch, paramSearch } from './urlParam';

// The address bar is the medical dashboard's record of WHICH ATHLETE IS OPEN.
// It was not, until 2026-10-12 — opening a record changed nothing, so the back
// button left the page and `?athlete=` outlived "Back to worklist" (§161).
// §163 made the helpers take the parameter's name, so the coach's drill-down
// and Sport Assessment's sport ride on the same definition; the cases below
// are §161's, run against the name the medical page uses.
const A = 'athlete';

describe('paramSearch', () => {
  it('writes the open record into the query string', () => {
    expect(paramSearch(A, '030109371036')).toBe('?athlete=030109371036');
  });

  it('writes the WORKLIST as an empty string, never a bare "?"', () => {
    // '?' and '' are different URLs to the browser, so returning '?' would push
    // a history entry that changes nothing a reader can see — a back press that
    // appears to do nothing is worse than no entry at all.
    expect(paramSearch(A, null)).toBe('');
    expect(paramSearch(A, undefined)).toBe('');
    expect(paramSearch(A, '')).toBe('');
  });

  it('encodes the id rather than pasting it in', () => {
    // An IC is 12 digits today. This is not about ICs: it is about never
    // building a URL by concatenation, which is how one stray & silently
    // truncates an identifier.
    expect(paramSearch(A, 'a b&c=d')).toBe('?athlete=a%20b%26c%3Dd');
  });
});

describe('paramFromSearch', () => {
  it('reads the open record back out', () => {
    expect(paramFromSearch(A, '?athlete=030109371036')).toBe('030109371036');
  });

  it('round-trips an id that needed encoding', () => {
    const id = 'a b&c=d';
    expect(paramFromSearch(A, paramSearch(A, id))).toBe(id);
  });

  it('reads no param, an empty param and a blank param ALL as the worklist', () => {
    // `?athlete=` is the one that matters. Returned as '' it would select a
    // record whose id is the empty string: the pane opens, the fetch 404s, and
    // the clinician sits on a permanent "could not load" with no way to tell
    // that nothing was ever asked for.
    expect(paramFromSearch(A, '')).toBeNull();
    expect(paramFromSearch(A, null)).toBeNull();
    expect(paramFromSearch(A, '?athlete=')).toBeNull();
    expect(paramFromSearch(A, '?athlete=%20%20')).toBeNull();
    expect(paramFromSearch(A, '?other=1')).toBeNull();
  });

  it('ignores other parameters around it', () => {
    expect(paramFromSearch(A, '?tab=history&athlete=123&x=2')).toBe('123');
  });
});

describe('paramMatchesSearch', () => {
  // THE GUARD THAT STOPS THE LOOP. A back press fires popstate, which sets the
  // selection, which runs the sync effect — and without this check that effect
  // pushes the entry the user just left, so back appears not to work.
  it('is true when the address already says what the page says', () => {
    expect(paramMatchesSearch(A, '123', '?athlete=123')).toBe(true);
    expect(paramMatchesSearch(A, null, '')).toBe(true);
  });

  it('treats the worklist and an EMPTY param as the same state', () => {
    // Otherwise landing on `?athlete=` pushes for ever: the page reads null,
    // the address reads '', they never agree.
    expect(paramMatchesSearch(A, null, '?athlete=')).toBe(true);
  });

  it('is false when they disagree, in either direction', () => {
    expect(paramMatchesSearch(A, '123', '')).toBe(false);
    expect(paramMatchesSearch(A, null, '?athlete=123')).toBe(false);
    expect(paramMatchesSearch(A, '123', '?athlete=456')).toBe(false);
  });

  it('agrees with the pair it guards, for every state the page can hold', () => {
    // The property that actually matters: whatever paramSearch would write
    // is a URL paramMatchesSearch already considers in step. If these two
    // ever disagree the page pushes a history entry on every single render.
    for (const id of [null, '', '123', '030109371036', 'a b&c=d']) {
      expect(paramMatchesSearch(A, id, paramSearch(A, id))).toBe(true);
    }
  });
});

describe('the parameter NAME is respected (§163)', () => {
  // Generalising from `athlete` is only safe if one page's state cannot be read
  // as another's. Sport Assessment's `?sport=` must not open a record on the
  // medical dashboard, and a medical deep link must not pick a sport.
  it('reads only the parameter it is asked for', () => {
    expect(paramFromSearch('sport', '?athlete=123')).toBeNull();
    expect(paramFromSearch('athlete', '?sport=Football')).toBeNull();
    expect(paramFromSearch('sport', '?athlete=123&sport=Football')).toBe('Football');
  });

  it('writes under the name it is given', () => {
    expect(paramSearch('sport', 'Track & Field')).toBe('?sport=Track%20%26%20Field');
    expect(paramFromSearch('sport', paramSearch('sport', 'Track & Field'))).toBe('Track & Field');
  });
});
