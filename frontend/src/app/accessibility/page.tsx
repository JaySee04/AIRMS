import Link from 'next/link';

// THE ACCESSIBILITY STATEMENT (2026-10-14, JC, DESIGN_DECISIONS §164).
//
// Modelled on the UK Health Security Agency's data dashboard statement, whose
// structure — what works, what does not, how it was tested, how to report a
// problem — is the one UK public-sector sites are required to publish. Malaysia's
// Pekeliling Pendigitalan Perkhidmatan Awam Bil. 1 Tahun 2025 asks agency sites to
// provide for users with disabilities and to follow the latest WCAG; a statement
// is how a reader finds out whether this one does.
//
// PUBLIC, like the sign-in and recovery pages: somebody who cannot use the
// system must be able to read why, and how to say so, without signing in first.
//
// EVERY CLAIM HERE IS A MEASUREMENT, and each names the check that made it, so it
// can be re-run rather than trusted. A statement that over-claims is worse than
// none — it is the one page a disabled reader opens to decide whether to bother.
// Hence "partially conforms", the known gaps stated before anybody finds them,
// and "not yet done" for the testing a script cannot do.

export const metadata = { title: 'Accessibility statement · SPIRiT' };

const REVIEWED = '14 October 2026';

export default function AccessibilityPage() {
  return (
    <main className="statement">
      <p><Link href="/">&larr; Back to sign in</Link></p>

      <h1>Accessibility statement for SPIRiT</h1>
      <p>
        SPIRiT (Sports Performance, Injury Risk & Technology) is used by Institut Sukan
        Negara staff, coaches and athletes to read HoloMotion screening results. We
        want as many people as possible to be able to use it. This page says what
        works, what does not yet, and how to tell us when something gets in your way.
      </p>

      <h2>What you should be able to do</h2>
      <ul>
        <li>
          <strong>Use every page with a keyboard.</strong> The first <kbd>Tab</kbd> on
          any page offers <em>Skip to main content</em>; every control shows a visible
          focus ring; the Medical Dashboard&rsquo;s athlete search opens with <kbd>/</kbd>.
        </li>
        <li>
          <strong>Hear what happens.</strong> Errors are announced to screen readers
          immediately; confirmations such as &ldquo;Saved&rdquo; are announced when
          the reader is free.
        </li>
        <li>
          <strong>Read every chart as text.</strong> Charts whose values are drawn
          rather than written have a <em>Show as table</em> link beneath them, and the
          risk radar announces each indicator and its Elevated line.
        </li>
        <li>
          <strong>Never rely on colour alone.</strong> Every risk level is written in
          words as well as shown in colour.
        </li>
        <li>
          <strong>Zoom to 400%</strong> without the page running off the side of the
          screen, and enlarge text with your browser&rsquo;s own zoom.
        </li>
        <li>
          <strong>Choose a light or dark theme</strong> from the button at the top of
          every page. Both are checked for contrast.
        </li>
        <li>
          <strong>Go back the way you expect.</strong> Your browser&rsquo;s Back button
          closes an open athlete record, and the athlete you opened stays in the
          address bar so it can be bookmarked.
        </li>
      </ul>

      <h2>What does not work yet</h2>
      <ul>
        <li>
          <strong>Body map targets are small.</strong> 63 of the 87 tappable regions on
          the muscle map are smaller than the 24&times;24 pixel minimum in WCAG 2.2
          (success criterion 2.5.8). Every finding on the map is also listed in words
          in the cards beside it, so nothing can be reached only by tapping a small
          region.
        </li>
        <li>
          <strong>English only.</strong> SPIRiT is not yet available in Bahasa Melayu.
        </li>
        <li>
          <strong>PDF reports are not tagged.</strong> The downloadable reports are
          drawn for printing and are not structured for screen readers. The same
          information is on the dashboards, which are.
        </li>
        <li>
          <strong>Not yet tested with disabled users.</strong> All the checks below are
          automated or carried out by the developer. SPIRiT has not yet been tested with
          a screen reader by someone who relies on one, or with disabled staff.
        </li>
      </ul>

      <h2>Compliance status</h2>
      <p>
        SPIRiT <strong>partially conforms</strong> with the Web Content Accessibility
        Guidelines (WCAG) 2.2 at level AA, because of the issues listed above.
      </p>

      <h2>How this was checked</h2>
      <p>On {REVIEWED}, in a real Chrome browser, against every signed-in page:</p>
      <ul>
        <li>contrast of every piece of text, in both themes;</li>
        <li>names, labels, headings, language and unique ids (the WCAG checks a program can decide);</li>
        <li>that no page scrolls sideways at four widths, down to 320 pixels — the width a page has at 400% zoom;</li>
        <li>keyboard, focus and back-button behaviour, by an automated walk through each role&rsquo;s pages.</li>
      </ul>
      <p>
        Each check is a script in the SPIRiT source code and can be re-run. A clean
        result from a script is not the same as a page that is easy to use, which is
        why testing with disabled users is listed above as not yet done.
      </p>

      <h2>Reporting a problem</h2>
      <p>
        If something on SPIRiT is hard or impossible for you to use, please tell your
        SPIRiT administrator at Institut Sukan Negara, saying which page you were on and
        what you were trying to do. If you need information from SPIRiT in another
        format, ask them too.
      </p>

      <p className="statement-meta">This statement was last reviewed on {REVIEWED}.</p>
    </main>
  );
}
