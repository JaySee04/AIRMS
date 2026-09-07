import type { MetadataRoute } from 'next';

// AIRMS must not be indexed by anybody.
//
// This is the one item on a normal launch checklist that INVERTS for this
// system. A public site wants a sitemap and a permissive robots.txt so search
// engines find it. AIRMS is an invitation-only clinical tool for one institute:
// there is no audience to reach, and every route behind the login concerns a
// named athlete's health data. Being findable is a liability, not a feature.
//
// Measured 2026-09-06: the hosted instance served no robots.txt (404) and sent
// no X-Robots-Tag, so it was crawlable. The practical exposure was small —
// every protected route bounces to the sign-in screen and the API answers 401 —
// but "small" is not the standard for a system holding clinical records, and a
// crawler indexing the login page of an athlete health system is the kind of
// thing a panel asks about.
//
// Deliberately NO sitemap.ts alongside this. A sitemap exists to advertise
// routes, which is the opposite of what this file is for.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/' }],
  };
}
