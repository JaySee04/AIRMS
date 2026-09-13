import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'AIRMS — Athlete Injury Risk Management System',
  description: 'Institut Sukan Negara Malaysia athlete injury risk management platform',
  // Belt and braces with app/robots.ts. robots.txt asks a crawler not to FETCH;
  // this tells one that fetched anyway not to INDEX. Neither is a security
  // control — the real boundary is the API's auth — but an invitation-only
  // clinical system has no reason to appear in a search result, and the two
  // directives fail independently.
  robots: { index: false, follow: false },
};

// REQUIRED BY THE NONCE-BASED CSP (2026-09-13, DESIGN_DECISIONS §92) — and the
// single line to delete if the policy is ever rolled back.
//
// A nonce must differ per request, so it cannot exist in HTML built once at
// build time. With these routes statically prerendered, the served document
// carried ZERO nonce attributes against a policy demanding one, and Chrome
// blocked all 16 inline scripts plus every chunk: the page still rendered its
// server HTML and then never hydrated. That is a DEAD page that looks like a
// live one — measured, not predicted, by scripts/verify-csp.js, whose
// "rendered real content" check passed on exactly the pages whose "hydrated"
// check failed.
//
// WHAT IT COSTS, stated rather than buried: these pages are no longer served
// from the CDN as static files; each request renders the shell in a function.
// The cost is small HERE specifically because every AIRMS page is a client
// component that fetches its own data with a localStorage JWT — the shell was
// never personalised, so nothing is recomputed that used to be cached except an
// empty frame. It is a real trade all the same, and the alternative was
// script-src 'unsafe-inline', which is barely a policy at all.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
