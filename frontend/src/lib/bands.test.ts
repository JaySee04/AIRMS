// The frontend band vocabulary (lib/bands.ts).
//
// This module exists because six files declared their own version and the same
// red band was labelled "Immediate assessment" in the risk hero and "Immediate"
// in the trend legend and the admin distribution bar — one clinical state, two
// names, on screens an admin sees side by side.
//
// The assertion that matters most is the last one: the FULL labels must match the
// backend's `utils/bands.js` BAND_LABEL character for character, because the same
// band is named by emails and PDFs from there and by the UI from here. Nothing
// enforces that across the two packages (there is no shared types package by
// design), so it is pinned here where a change will trip a test.

import {
  BANDS, BAND_BADGE, BAND_BG, BAND_COLOR, BAND_GLYPH, BAND_LABEL, BAND_RANK,
  BAND_SHORT, bandColor, bandSegments, isBand,
} from './bands';

describe('band vocabulary', () => {
  it('covers exactly the three Screening.overallBand enum values', () => {
    expect(BANDS).toEqual(['green', 'amber', 'red']);
    for (const map of [BAND_LABEL, BAND_SHORT, BAND_COLOR, BAND_BG, BAND_BADGE, BAND_RANK]) {
      expect(Object.keys(map).sort()).toEqual(['amber', 'green', 'red']);
    }
  });

  it('matches the BACKEND wording exactly (utils/bands.js BAND_LABEL)', () => {
    // Change these only by changing the backend at the same time — emails, PDFs
    // and the UI must name a band identically or a clinician sees two verdicts.
    // Green is deliberately NOT 'Safe' — a screen that cannot predict injury cannot
    // certify its absence, and green is where a false reassurance would land.
    expect(BAND_LABEL.green).toBe('No indicators flagged');
    expect(BAND_LABEL.green).not.toMatch(/safe/i);
    expect(BAND_SHORT.green).not.toMatch(/safe/i);
    expect(BAND_LABEL.amber).toBe('Needs attention');
    expect(BAND_LABEL.red).toBe('Immediate assessment');
  });

  it('keeps the compact form genuinely shorter, and only where it needs to be', () => {
    expect(BAND_SHORT.red).toBe('Immediate');
    expect(BAND_SHORT.red.length).toBeLessThan(BAND_LABEL.red.length);
    // Green needs a compact form too since it stopped being 'Safe': a legend cell
    // has no room for 'No indicators flagged'. Both forms must still refuse to
    // call the athlete safe, which is the property that matters.
    expect(BAND_SHORT.green.length).toBeLessThan(BAND_LABEL.green.length);
    // Amber is already short enough; a second spelling there would be
    // gratuitous drift.
    expect(BAND_SHORT.amber).toBe(BAND_LABEL.amber);
  });

  it('orders green < amber < red', () => {
    expect(BAND_RANK.green).toBeLessThan(BAND_RANK.amber);
    expect(BAND_RANK.amber).toBeLessThan(BAND_RANK.red);
  });

  it('uses only theme tokens, never a hard-coded hex', () => {
    // A literal hex would not follow dark mode — this is how the radar's
    // threshold red got stranded once before (DESIGN_DECISIONS §19).
    for (const c of [...Object.values(BAND_COLOR), ...Object.values(BAND_BG)]) {
      expect(c).toMatch(/^var\(--/);
    }
  });
});

describe('isBand / bandColor', () => {
  it('recognises the three bands and nothing else', () => {
    expect(isBand('amber')).toBe(true);
    expect(isBand('purple')).toBe(false);
    expect(isBand(null)).toBe(false);
    expect(isBand(undefined)).toBe(false);
  });

  it('falls back to MUTED for an absent band, not to a status colour', () => {
    // An unscored athlete drawn in green would read as "safe" when the truth is
    // "we do not know".
    expect(bandColor(null)).toBe('var(--text-muted)');
    expect(bandColor('nonsense')).toBe('var(--text-muted)');
    expect(bandColor('red')).toBe(BAND_COLOR.red);
  });
});

describe('bandSegments', () => {
  it('returns all three bands in fixed order, with the full labels by default', () => {
    const segs = bandSegments({ green: 41, amber: 13, red: 4 });
    expect(segs.map((s) => s.label)).toEqual(['No indicators flagged', 'Needs attention', 'Immediate assessment']);
    expect(segs.map((s) => s.value)).toEqual([41, 13, 4]);
  });

  it('uses the compact labels on request', () => {
    expect(bandSegments({ green: 1 }, { short: true }).map((s) => s.label))
      .toEqual(['None flagged', 'Needs attention', 'Immediate']);
  });

  it('treats a missing band as zero rather than dropping the segment', () => {
    // The legend should still list a band with no athletes in it — "0 immediate"
    // is information; a missing row is ambiguous.
    const segs = bandSegments({ green: 5 });
    expect(segs).toHaveLength(3);
    expect(segs[2].value).toBe(0);
  });
});

describe('BAND_GLYPH — the non-colour channel', () => {
  // Red/amber/green is the textbook colour-only failure: the hues collapse for
  // a red-green deficiency and a screen reader announces none of them. The
  // glyphs are what carries the band when the colour does not, so the property
  // that matters is that they are DISTINCT — three identical shapes in three
  // colours would pass a "has a glyph" check and fix nothing.
  it('gives every band a glyph', () => {
    expect(Object.keys(BAND_GLYPH).sort()).toEqual([...BANDS].sort());
    BANDS.forEach((b) => expect(BAND_GLYPH[b]).toBeTruthy());
  });

  it('uses a DIFFERENT shape per band, not one shape in three colours', () => {
    const glyphs = BANDS.map((b) => BAND_GLYPH[b]);
    expect(new Set(glyphs).size).toBe(BANDS.length);
  });

  it('stays out of the WinAnsi range pdfkit can print, so it cannot leak into a report', () => {
    // DESIGN_DECISIONS §30f: a character outside WinAnsi measures zero width in
    // pdfkit's Helvetica and prints as mojibake, silently. These are web-only by
    // construction; the assertion is here so a future "let's reuse the glyph in
    // the PDF" edit fails loudly rather than shipping an unreadable report.
    BANDS.forEach((b) => expect(BAND_GLYPH[b].codePointAt(0)).toBeGreaterThan(0xFF));
  });
});
