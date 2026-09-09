// splitSummaryPoints — the one transformation AIRMS applies to somebody else's
// clinical text, so the tests are about what it must REFUSE to do.
//
// The failure that matters here is not a crash. It is a split that silently
// drops a clause, so a clinician reads four of the instrument's five findings
// and has no way to know a fifth existed. Every "declines" case below is that
// failure being prevented.

import { splitSummaryPoints } from './reportSummary';

describe('splitSummaryPoints', () => {
  describe('splits a real numbered summary', () => {
    const raw = '1. Cervical mobility is limited in rotation. 2. Left shoulder stability is below the group. 3. Ankle dorsiflexion restricted bilaterally.';

    it('finds every point', () => {
      const pts = splitSummaryPoints(raw);
      expect(pts).toHaveLength(3);
      expect(pts.map((p) => p.marker)).toEqual(['1', '2', '3']);
    });

    it('strips the marker from the text but keeps the sentence whole', () => {
      const pts = splitSummaryPoints(raw);
      expect(pts[0].text).toBe('Cervical mobility is limited in rotation.');
      expect(pts[2].text).toBe('Ankle dorsiflexion restricted bilaterally.');
    });

    it('loses not one word of the original', () => {
      // The property that matters most: every word in, every word out.
      const pts = splitSummaryPoints(raw);
      const wordsOut = pts.flatMap((p) => p.text.split(/\s+/)).join(' ');
      const wordsIn = raw.replace(/(?:^|\s)\d{1,2}\.\s+/g, ' ').trim().replace(/\s+/g, ' ');
      expect(wordsOut).toBe(wordsIn);
    });

    it('accepts the "1)" marker style too', () => {
      const pts = splitSummaryPoints('1) First finding. 2) Second finding.');
      expect(pts.map((p) => p.text)).toEqual(['First finding.', 'Second finding.']);
    });
  });

  describe('DECLINES rather than mangling', () => {
    it('leaves decimals alone — "12.5 degrees" is not point 12', () => {
      // A decimal has no space after its point, which is exactly why the
      // pattern requires one. If this ever splits, a measurement becomes a
      // heading and the sentence carrying it is truncated.
      const raw = '1. Left shoulder is 12.5 degrees short of the right. 2. Retest in 1.5 months.';
      const pts = splitSummaryPoints(raw);
      expect(pts).toHaveLength(2);
      expect(pts[0].text).toBe('Left shoulder is 12.5 degrees short of the right.');
      expect(pts[1].text).toBe('Retest in 1.5 months.');
    });

    it('declines when the markers are out of order', () => {
      // Out-of-order markers mean the pattern caught something that is not a
      // list. Rendering it as a list would reorder a clinician's findings.
      expect(splitSummaryPoints('1. First. 5. Fifth. 2. Second.')).toEqual([]);
    });

    it('declines when text precedes the first marker', () => {
      // A preamble is clinical content. A split that starts at "1." would
      // silently discard it, which is the exact failure this guard exists for.
      const raw = 'Overall the athlete presents well. 1. Minor neck restriction. 2. Good stability.';
      expect(splitSummaryPoints(raw)).toEqual([]);
    });

    it('declines on a single marker', () => {
      expect(splitSummaryPoints('1. Only one finding here.')).toEqual([]);
    });

    it('declines on unnumbered prose that mentions a number', () => {
      expect(splitSummaryPoints('Grade 2. sprain history noted in the left ankle.')).toEqual([]);
    });

    it('declines on back-to-back markers with nothing between them', () => {
      // NAMED CAREFULLY. This was called "declines on an empty point" until
      // mutation testing showed it never exercises one: the marker pattern
      // consumes trailing whitespace greedily, so "1. 2." yields a single
      // match and the case is refused for having fewer than two markers. An
      // empty point is in fact UNREACHABLE — two adjacent markers always have
      // a non-space character between them — which is why the check that
      // claimed to catch it was deleted rather than kept as reassurance.
      expect(splitSummaryPoints('1. 2. Something.')).toEqual([]);
    });
  });

  describe('absent and blank input', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty', ''],
      ['whitespace', '   \n  '],
    ])('%s gives no points', (_label, value) => {
      expect(splitSummaryPoints(value as string | null | undefined)).toEqual([]);
    });

    it('a non-string never throws', () => {
      // The payload is JSON from a server; a wrong type is a bug elsewhere, but
      // it must not take the dashboard down.
      expect(splitSummaryPoints(42 as unknown as string)).toEqual([]);
      expect(splitSummaryPoints({} as unknown as string)).toEqual([]);
    });
  });

  // MUTATION RESULTS, 2026-09-09 — recorded because the first pass was wrong.
  //
  // The implementation originally carried four guards. Disabling any one of
  // three of them changed NO test result: the explicit preamble check, the
  // rejoin check and an empty-point check all overlapped, and two were
  // unreachable outright. Rather than write tests to pin unreachable branches,
  // the redundant ones were DELETED, which left the rejoin check genuinely
  // load-bearing.
  //
  // Every remaining branch now fails under mutation:
  //   - marker's trailing \s+ relaxed to \s*  -> 2 failures (the decimal cases)
  //   - ordered-markers check disabled        -> 1 failure
  //   - rejoin check disabled                 -> 1 failure (the preamble case)
  //   - fewer-than-two-markers check disabled -> see the back-to-back case above
  describe('the rejoin guard is real, not decorative', () => {
    it('holds for every case it accepts', () => {
      // Whatever we accept must rebuild to the input, ignoring only whitespace
      // runs and the "1." / "1)" marker style. This is the invariant the
      // implementation checks; asserting it here means a future relaxation of
      // the pattern cannot quietly weaken it.
      const inputs = [
        '1. Alpha. 2. Beta. 3. Gamma.',
        '1) Alpha finding. 2) Beta finding.',
        '1. Left shoulder is 12.5 degrees short. 2. Retest in 1.5 months.',
        '1. A point with, commas; and: punctuation. 2. Another — with a dash.',
      ];
      for (const raw of inputs) {
        const pts = splitSummaryPoints(raw);
        expect(pts.length).toBeGreaterThan(1);
        const rebuilt = pts.map((p) => `${p.marker}. ${p.text}`).join(' ');
        const norm = (s: string) => s.replace(/(\d{1,2})\)/g, '$1.').replace(/\s+/g, ' ').trim();
        expect(norm(rebuilt)).toBe(norm(raw));
      }
    });
  });
});
