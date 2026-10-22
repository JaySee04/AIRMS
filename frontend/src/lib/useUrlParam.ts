'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';
import { paramFromSearch, paramMatchesSearch, paramSearch, SECTION_HOME_EVENT } from './urlParam';

// Page state that lives in the address bar (§161, extracted in §163).
//
//   const [selectedId, setSelectedId] = useUrlParam('athlete');
//
// - READ ONCE ON MOUNT. At that moment the address is the truth; afterwards the
//   page's own controls drive the state, and re-reading the URL every render
//   would fight them.
// - WRITTEN ON CHANGE. 'push' for a drill-down, so BACK steps out of it; 'replace'
//   for a filter, so changing it does not cost the reader one back press per
//   option they tried. Nothing is written until the read above has landed, or
//   the empty initial value would clobber a deep link.
// - FOLLOWS BACK/FORWARD via popstate. Without this, pushed entries are
//   addresses the page ignores — the URL moves on back and the screen does not,
//   which is worse than not pushing at all.
// - CLEARED BY THE SIDEBAR when its link points at this page (SECTION_HOME_EVENT).
//
// NOT built on `useSearchParams`: that hook forces a Suspense boundary on any
// page that calls it, and these pages are each one large client component.
//
// pushState with a null state is safe under the App Router: Next patches
// pushState to carry its own tree, and its popstate handler ignores entries it
// cannot read rather than reloading.
export function useUrlParam(
  name: string,
  mode: 'push' | 'replace' = 'push',
): [string | null, (v: SetStateAction<string | null>) => void] {
  const [value, setValue] = useState<string | null>(null);
  // Nothing is written until the address has been READ. A "skip the first run"
  // ref was tried first and is wrong under React's StrictMode, which runs mount
  // effects twice: the second pass found the ref already set and wrote the
  // still-empty value over a deep link — measured, `?athlete=X&from=Football`
  // was pushed to `/medical/dashboard`, then to `?athlete=X`, losing `from`
  // and leaving two junk history entries. `ready` is state, set in the same
  // batch as the value, so the first write can only see the value that was read.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(paramFromSearch(name, window.location.search));
    setReady(true);
  }, [name]);

  useEffect(() => {
    if (!ready) return;
    if (paramMatchesSearch(name, value, window.location.search)) return;
    const url = `${window.location.pathname}${paramSearch(name, value)}`;
    if (mode === 'push') window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, [name, value, mode, ready]);

  useEffect(() => {
    const onPop = () => setValue(paramFromSearch(name, window.location.search));
    const onHome = () => setValue(null);
    window.addEventListener('popstate', onPop);
    window.addEventListener(SECTION_HOME_EVENT, onHome);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener(SECTION_HOME_EVENT, onHome);
    };
  }, [name]);

  // '' is normalised to null so "nothing selected" has one spelling.
  const set = useCallback((v: SetStateAction<string | null>) => {
    setValue((prev) => (typeof v === 'function' ? v(prev) : v) || null);
  }, []);
  return [value, set];
}
