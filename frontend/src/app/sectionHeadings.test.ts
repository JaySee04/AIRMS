// A grouping label is a CLAIM about what is beneath it.
//
// A SOURCE check, like app/pageWiring.test.ts and
// backend/tests/athleteDisclosure.test.js, and for the same reason: what is
// being asserted is how the page is COMPOSED, which no amount of rendering one
// component can see.
//
// THE DEFECT THIS EXISTS TO PREVENT (2026-09-13, DESIGN_DECISIONS §98.2).
//
// On /athlete/dashboard the body map draws the LATEST screening, but it sits
// AFTER the history panel. Adding a "How you have changed" heading above the
// history therefore swept the body map under a heading that misdescribes it —
// a reader would take the figure for a change view rather than a current one.
//
// It was caught while writing the headings and closed with a third one. It is
// pinned here because the failure is entirely silent: delete that heading and
// the page still renders, every other test still passes, e2e still finds 155
// body-map regions, and the only symptom is that a clinical figure is filed
// under the wrong claim. That is this project's defect class exactly — a wrong
// answer that looks like a right one — arriving through a change meant to help.

import fs from 'fs';
import path from 'path';

const APP = path.join(__dirname);

const read = (p: string) => fs.readFileSync(path.join(APP, p), 'utf8');

/** Pages that group their cards with SectionHeading. */
const GROUPED = [
  'admin/dashboard/page.tsx',
  'athlete/dashboard/page.tsx',
  'coach/dashboard/page.tsx',
];

describe('every SectionHeading import is actually used', () => {
  // The winAnsiSafe shape: an imported-but-unrendered component is not a type
  // error, is not a lint error, and changes nothing on the page.
  it.each(GROUPED)('%s renders at least one', (file) => {
    const src = read(file);
    expect(src).toContain("from '@/components/layout/SectionHeading'");
    expect(src).toMatch(/<SectionHeading[\s>]/);
  });

  it.each(GROUPED)('%s closes every heading it opens', (file) => {
    const src = read(file);
    const opens = (src.match(/<SectionHeading[\s>]/g) || []).length;
    const closes = (src.match(/<\/SectionHeading>/g) || []).length;
    expect(closes).toBe(opens);
  });
});

describe('athlete dashboard: the body map is not filed under "how you have changed"', () => {
  const src = read('athlete/dashboard/page.tsx');

  /** Character offset of the first match, or -1. */
  const at = (re: RegExp) => {
    const m = re.exec(src);
    return m ? m.index : -1;
  };

  it('the history panel and the body map are both on the page', () => {
    // If either moves or is renamed, the ordering assertion below would pass
    // vacuously on a -1. Asserted first so the real test cannot go quiet.
    expect(at(/<ScreeningHistory\b/)).toBeGreaterThan(-1);
    expect(at(/<BodyMap\b/)).toBeGreaterThan(-1);
  });

  it('the body map still comes AFTER the history panel', () => {
    // The premise of this whole suite. If somebody reorders the page so the
    // map precedes the history, the third heading is no longer load-bearing
    // and this test should be re-read rather than silently satisfied.
    expect(at(/<BodyMap\b/)).toBeGreaterThan(at(/<ScreeningHistory\b/));
  });

  it('a SectionHeading sits BETWEEN them, closing the change group', () => {
    const history = at(/<ScreeningHistory\b/);
    const bodyMap = at(/<BodyMap\b/);
    const between = src.slice(history, bodyMap);
    expect(between).toMatch(/<SectionHeading[\s>]/);
  });

  it('that heading does not itself talk about change', () => {
    const history = at(/<ScreeningHistory\b/);
    const bodyMap = at(/<BodyMap\b/);
    const between = src.slice(history, bodyMap);
    // ONLY the heading element, never the surrounding source.
    //
    // The first version of this test scanned the whole slice and failed
    // against correct code, because the SOURCE COMMENT explaining why the
    // heading is required says the words "How you have changed". Scanning a
    // region of a file for a word answers a question about the file, not about
    // the rendered page — and the thing being asserted here is what a reader
    // SEES. Left as a note because the same mistake is available to every
    // source-reading test in this repo.
    const headings = between.match(/<SectionHeading[^>]*>[\s\S]*?<\/SectionHeading>/g) || [];
    expect(headings).toHaveLength(1);
    // A closing heading that also said "changed" would reproduce the bug while
    // satisfying the test above — the group would be closed and still wrong.
    expect(headings[0]).not.toMatch(/\bchanged?\b/i);
  });

  it('speaks to the athlete, never about them', () => {
    // Same rule the OverallRiskBadge suite pins for audience="self": this page
    // addresses the reader. No \b anchors needed here because these are read
    // from SOURCE, not from concatenated textContent.
    const headings = src.match(/<SectionHeading[^>]*>[\s\S]*?<\/SectionHeading>/g) || [];
    expect(headings.length).toBeGreaterThan(0);
    for (const h of headings) {
      expect(h).not.toMatch(/this athlete|the athlete's/i);
    }
  });
});
