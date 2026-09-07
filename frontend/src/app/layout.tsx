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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
