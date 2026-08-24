// Smoke coverage for the screening-report drawing toolkit.
//
// The three PDF routes need a live DB, so they were previously verified only by
// downloading a report and eyeballing it. The drawing helpers themselves are
// pure pdfkit calls, so they CAN be exercised headlessly — this catches the
// failure mode that manual checking is worst at: a helper that throws only on
// a shape it rarely sees (missing subitems, null scores, empty cohort).
//
// Added 2026-08-06 alongside the extraction of these helpers out of
// routes/screeningReports.js (see utils/pdfDraw.js header).
const { Writable } = require('stream');
const PDFDocument = require('pdfkit');
const D = require('../src/utils/pdfDraw');
const {
  capturePdfText, capturePaintOps, unrenderableIn, MUST_SURVIVE, chr,
} = require('./helpers/capturePdfText');

// Minimal stand-in for an Express response: collects the PDF bytes.
function fakeRes() {
  const chunks = [];
  const w = new Writable({
    write(chunk, _enc, cb) { chunks.push(Buffer.from(chunk)); cb(); },
  });
  w.setHeader = function setHeader(k, v) { (this.headers ||= {})[k] = v; };
  w.buffer = () => Buffer.concat(chunks);
  return w;
}

function render(draw) {
  const res = fakeRes();
  const doc = D.startDoc(res, 'test.pdf');
  draw(doc);
  return new Promise((resolve, reject) => {
    res.on('finish', () => resolve({ res, pdf: res.buffer() }));
    res.on('error', reject);
    D.finish(doc, 'Test Report');
  });
}

// One document lifecycle, two ways of watching it. `startDoc` is used rather
// than a bare PDFDocument on purpose: the guards under test are installed THERE,
// so a helper that skipped it would recreate the hole these tests exist to close.
const lifecycle = (capture) => (draw) => capture(async () => {
  const res = fakeRes();
  const doc = D.startDoc(res, 'test.pdf');
  await draw(doc);
  D.finish(doc, 'Test Report');
  await new Promise((r) => res.on('finish', r));
});

const paintOf = lifecycle(capturePaintOps);
const textOf = lifecycle(capturePdfText);

const SUBITEMS = {
  neck: { romL: 83, romR: 72, stabL: 76, stabR: 76, sym: 83 },
  shoulder: { romL: 89, romR: 85, stabL: 84, stabR: 82, sym: 89 },
  torso: { romL: 70, romR: 67, stabL: 87, stabR: 89, sym: 90 },
  pelvis: { romL: 62, romR: 71, stabL: 76, stabR: 82, sym: 86 },
  lowerLimbs: { romL: 66, romR: 68, stabL: 76, stabR: 79, sym: 91 },
};

// Values from the Nazwan 2025-08-13 HoloMotion report.
const SCREENING = {
  athleteId: '890202021001',
  totalScore: 78,
  exerciseRisks: 14,
  rom: 71,
  stability: 82,
  symmetry: 88,
  neckInjuryRisk: 14,
  shoulderInjuryRisk: 8,
  scoliosis: 12,
  spinalDiscHerniation: 16,
  lumbarPelvisInjury: 16,
  jointPain: 15,
  kneeInjuryRisk: 21,
  ankleInjuryRisk: 26,
  overallBand: 'amber',
  subitems: SUBITEMS,
  muscleFlags: {
    myodynamia: [{ muscle: 'Gluteus Medius', side: 'L' }, { muscle: 'Piriformis', side: 'B' }],
    tension: [{ muscle: 'Gluteus Maximus', side: 'B' }, { muscle: 'Iliopsoas', side: 'L' }],
  },
};

const COHORT = {
  tier: 'spg',
  n: 7,
  stats: {
    totalScore: { mean: 75, sd: 6 },
    exerciseRisks: { mean: 18, sd: 4 },
    rom: { mean: 74, sd: 7 },
    stability: { mean: 80, sd: 5 },
    symmetry: { mean: 85, sd: 6 },
  },
};

const isPdf = (buf) => buf.length > 800 && buf.slice(0, 5).toString() === '%PDF-';

describe('pdfDraw toolkit', () => {
  it('exports every helper the report routes call', () => {
    const undef = Object.keys(D).filter((k) => D[k] === undefined);
    expect(undef).toEqual([]);
    expect(Object.keys(D).length).toBeGreaterThanOrEqual(38);
  });

  it('renders a full individual-style report without throwing', async () => {
    const { res, pdf } = await render((doc) => {
      D.cover(doc, 'Individual Screening Report', 'Test Athlete · Badminton');
      D.sectionTitle(doc, 'Headline Scores');
      D.SCORE_ROWS.forEach(([key, label]) => {
        D.bar(doc, label, D.num(SCREENING[key]) ?? 0, 100, D.GOLD);
      });
      D.sectionTitle(doc, 'Exercise Risk Evaluation');
      D.riskLegend(doc);
      D.RISKS.forEach(([key, label]) => D.zoneGauge(doc, label, D.num(SCREENING[key]) ?? 0));
      D.sectionTitle(doc, 'Physical Fitness Subitem Score');
      D.subitemTable(doc, SUBITEMS);
      D.subitemPriorities(doc, SUBITEMS);
      D.sectionTitle(doc, 'Lateral Symmetry');
      D.symmetrySection(doc, SUBITEMS);
      D.sectionTitle(doc, 'Muscle Map');
      D.muscleFigure(doc, SUBITEMS);
      D.sectionTitle(doc, 'Interpretation');
      D.bullets(doc, D.interpret(SCREENING, COHORT, SUBITEMS));
      D.keyFindingsBox(doc, D.keyFindings(SCREENING, SUBITEMS));
      D.radar(doc, D.RISKS.map(([k, label]) => ({ label, value: D.num(SCREENING[k]) ?? 0 })));
      D.bandPill(doc, 'amber', 50, doc.y);
    });

    expect(isPdf(pdf)).toBe(true);
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Content-Disposition']).toContain('test.pdf');
  });

  it('renders squad/team sections without throwing', async () => {
    const members = [
      { a: { athleteId: '890202021001', name: 'A', sport: 'Badminton' }, s: SCREENING, subitems: SUBITEMS },
      { a: { athleteId: '900101015002', name: 'B', sport: 'Badminton' }, s: SCREENING, subitems: SUBITEMS },
    ];
    const { pdf } = await render((doc) => {
      D.cover(doc, 'Team Report', 'Badminton');
      D.bandTable(doc, [{ label: 'Squad', band: 'amber', value: 2 }]);
      D.hotspotBar(doc, 'Ankle', 1, 1, 2);
      D.squadSubitemHeatmap(doc, members);
      D.squadSymmetrySection(doc, members);
    });
    expect(isPdf(pdf)).toBe(true);
    expect(Array.isArray(D.squadMuscleHotspots(members))).toBe(true);
  });

  it('renders the programme-activity sections without throwing', async () => {
    const { screeningPeriods } = require('../src/utils/screeningPeriods');
    const activity = screeningPeriods([
      { id: 1, athleteId: 'A', assessedAt: new Date('2026-01-10T00:00:00Z'), overallIndicator: 48, exerciseRisks: 22, totalScore: 70, rom: 74, stability: 68, symmetry: 71, overallBand: 'amber' },
      { id: 2, athleteId: 'B', assessedAt: new Date('2026-02-02T00:00:00Z'), overallIndicator: 55, exerciseRisks: 18, totalScore: 76, rom: 80, stability: 72, symmetry: 75, overallBand: 'green' },
      { id: 3, athleteId: 'A', assessedAt: new Date('2026-05-11T00:00:00Z'), overallIndicator: 61, exerciseRisks: 14, totalScore: 80, rom: 85, stability: 76, symmetry: 78, overallBand: 'green' },
    ], { grain: 'quarter' });

    const { pdf } = await render((doc) => {
      D.cover(doc, 'Holistic Screening Report', 'All athletes');
      D.sectionTitle(doc, 'Screening Programme Activity (Quarterly)');
      D.periodTable(doc, activity.periods);
      D.sectionTitle(doc, 'Change Between Successive Tests', 120);
      D.betweenTestsBlock(doc, activity.betweenTests);
    });
    expect(isPdf(pdf)).toBe(true);
  });

  // A brand-new institution: a roster, but nobody screened twice yet.
  it('renders programme activity with no periods and no retests', async () => {
    const { pdf } = await render((doc) => {
      D.periodTable(doc, []);
      D.betweenTestsBlock(doc, null);
      D.betweenTestsBlock(doc, {
        pairs: 0, athletesWithRetest: 0, improved: 0, declined: 0, steady: 0,
        intervalDays: { median: null, min: null, max: null },
        bandMoves: { better: 0, worse: 0, same: 0 }, deltas: [],
      });
    });
    expect(isPdf(pdf)).toBe(true);
  });

  // The shapes manual eyeballing never covers: a screening with nothing in it.
  it('survives null / empty screening data', async () => {
    const empty = { athleteId: 'x' };
    const { pdf } = await render((doc) => {
      D.cover(doc, 'Individual Screening Report', undefined);
      D.subitemTable(doc, null);
      D.symmetrySection(doc, null);
      D.muscleFigure(doc, null);
      D.bullets(doc, D.interpret(empty, null, null));
      D.keyFindingsBox(doc, D.keyFindings(empty, null));
      D.radar(doc, D.RISKS.map(([, label]) => ({ label, value: 0 })));
    });
    expect(isPdf(pdf)).toBe(true);
  });

  it('formats filenames and dates predictably', () => {
    expect(D.fileSlug('Thung Jin Seng / Badminton')).toBe('Thung_Jin_Seng_Badminton');
    expect(D.fileSlug('')).toBe('report');
    expect(D.fmtDate(null)).toBe('—');
    expect(D.fmtDate('2025-08-13T09:30:28Z')).toBe('2025-08-13');
    expect(D.todayStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(D.num('12.5')).toBe(12.5);
    expect(D.num(null)).toBeNull();
  });

  // The activity-log export. Its risk is not arithmetic but layout: a long
  // summary must wrap without colliding with the next row, and a run longer
  // than one page must repeat the header rather than orphan its columns.
  it('renders the activity log, wrapping long detail and paging cleanly', async () => {
    const LABELS = { 'screening.import': 'Screening imported', 'athlete.injury': 'Injury status changed' };
    const rows = Array.from({ length: 60 }, (_, i) => ({
      createdAt: new Date(2026, 6, (i % 28) + 1),
      actorName: i % 3 === 0 ? 'Medical Demo 01' : 'Admin User',
      action: i % 2 ? 'screening.import' : 'athlete.injury',
      summary: i % 5 === 0
        ? 'Marked a very long athlete name INJURED - excluded from norm calculation, with a note that runs on well past the width of its column so the row has to grow'
        : 'Updated an athlete from a HoloMotion import',
    }));
    const { pdf } = await render((doc) => {
      D.cover(doc, 'Activity Log', 'All recorded activity');
      D.sectionTitle(doc, 'Recorded actions');
      D.auditTable(doc, rows, LABELS);
    });
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('survives an empty log and rows missing every optional field', async () => {
    const { pdf } = await render((doc) => {
      D.auditTable(doc, [], {});
      // No actor, no summary, no label for the action — all real possibilities
      // for a row written by an older build or a background job.
      D.auditTable(doc, [{ action: 'unknown.thing' }, {}], {});
    });
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  it('renders the staff activity table, including rows with no breakdown', async () => {
    const LABELS = { 'screening.import': 'Screening imported', 'athlete.injury': 'Injury status changed' };
    const staff = [
      { actor: 'Medical Demo 01', role: 'medical', actions: 12, previousActions: 4, change: 8,
        byAction: { 'screening.import': 9, 'athlete.injury': 3 }, screeningsImported: 9 },
      // No actions and no breakdown — a pre-logging importer. Must not collapse
      // the row or throw on the empty byAction.
      { actor: 'Old Importer', role: null, actions: 0, previousActions: 0, change: 0,
        byAction: {}, screeningsImported: 31 },
      // Long name plus a negative change, which is the narrowest column.
      { actor: 'A Very Long Staff Account Name That Runs On', role: 'admin', actions: 2,
        previousActions: 40, change: -38, byAction: { 'athlete.injury': 2 }, screeningsImported: 0 },
    ];
    const { pdf } = await render((doc) => {
      D.cover(doc, 'Activity Log', 'All recorded activity');
      D.sectionTitle(doc, 'Activity by account');
      D.staffTable(doc, staff, LABELS);
    });
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('survives an empty or malformed staff list', async () => {
    const { pdf } = await render((doc) => {
      D.staffTable(doc, [], {});
      D.staffTable(doc, undefined, {});
      D.staffTable(doc, [{}], {});
    });
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  // The read-only roles reach the paper trail only through this column, and the
  // layout shifts when the "vs prev" column is dropped — both variants must draw.
  it('draws downloads, with and without the comparison column', async () => {
    const LABELS = { 'report.download': 'Report downloaded', 'export.backup': 'Backup exported' };
    const staff = [
      { actor: 'Datuk Executive', role: 'executive', actions: 0, downloads: 12, previousActions: 0, change: 0, byAction: { 'report.download': 12 }, screeningsImported: 0 },
      { actor: 'Coach Demo 01', role: 'coach', actions: 0, downloads: 3, previousActions: 1, change: -1, byAction: { 'report.download': 3 }, screeningsImported: 0 },
    ];
    for (const comparable of [true, false]) {
      const { pdf } = await render((doc) => {
        D.sectionTitle(doc, 'Activity by account');
        D.staffTable(doc, staff, LABELS, { comparable });
      });
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    }
  });

  // The squad had no anatomical view: the group's body was described only by a
  // hotspot bullet list and a numeric grid, in a product whose whole vocabulary
  // is body regions. Fed by aggregateSubitems so the figure cannot quote a
  // different average from the heatmap printed beside it.
  describe('squad body map', () => {
    const member = (base) => ({
      a: { athleteId: String(base), name: 'A' + base },
      s: {
        subitems: {
          neck: { romL: base + 30, romR: base - 5, stabL: base, stabR: base, sym: base },
          shoulder: { romL: base, romR: base, stabL: base, stabR: base, sym: base },
          torso: { romL: base - 20, romR: base - 22, stabL: base - 18, stabR: base - 20, sym: base },
          pelvis: { romL: base + 10, romR: base + 8, stabL: base + 9, stabR: base + 7, sym: base },
          lowerLimbs: { romL: base + 20, romR: base + 21, stabL: base + 19, stabR: base + 20, sym: base },
        },
      },
    });

    it('draws the group figure and reports that it drew', async () => {
      let drew;
      const { pdf } = await render((doc) => {
        drew = D.squadMuscleFigure(doc, [member(62), member(70), member(55), member(80)]);
        D.tierLegend(doc);
      });
      expect(drew).toBe(true);
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(1000);
    });

    // A group with nothing to draw must say so rather than throw mid-stream:
    // the response has already committed to being a PDF by this point.
    it('declines cleanly when no member carries subitems', async () => {
      const results = [];
      const { pdf } = await render((doc) => {
        results.push(D.squadMuscleFigure(doc, []));
        results.push(D.squadMuscleFigure(doc, [{ a: {}, s: {} }]));
        results.push(D.squadMuscleFigure(doc, [{ a: {}, s: { subitems: {} } }]));
      });
      expect(results).toEqual([false, false, false]);
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    });
  });

  // Scaled to the largest delta alone, a -1.8 against a +-2 dead band drew the
  // LONGEST bar on the figure and labelled it "steady" — the chart asserting a
  // change the threshold says is indistinguishable from noise. The scale must
  // therefore include the dead band even when no delta reaches it.
  it('never lets a sub-threshold change draw the full-width bar', async () => {
    const allTiny = [
      { label: 'Overall indicator', avgDelta: -1.8, higherBetter: true, direction: 'steady', deadBand: 2 },
      { label: 'Total Score', avgDelta: 0.4, higherBetter: true, direction: 'steady', deadBand: 2 },
    ];
    const { pdf } = await render((doc) => D.changeBars(doc, allTiny, { note: 'x' }));
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');

    // Mixed: a real move present alongside sub-threshold ones.
    const { pdf: mixed } = await render((doc) => D.changeBars(doc, [
      ...allTiny,
      { label: 'ROM', avgDelta: -5.2, higherBetter: true, direction: 'declining', deadBand: 2 },
      { label: 'Exercise risks', avgDelta: -4.5, higherBetter: false, direction: 'improving', deadBand: 2 },
    ], { note: 'x' }));
    expect(mixed.slice(0, 5).toString()).toBe('%PDF-');
    expect(mixed.length).toBeGreaterThan(1000);
  });

  // Rows with no dead band at all (the threshold declined and nothing was
  // passed) must still draw rather than divide by a missing number.
  it('draws change bars when no dead band is supplied', async () => {
    const { pdf } = await render((doc) => D.changeBars(doc, [
      { label: 'Total Score', avgDelta: 3.1, higherBetter: true, direction: 'improving' },
    ], { note: 'x' }));
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
  });

  // Found by printing the Activity Log and reading it: one row showed three
  // treatments of the same value — actions 0, downloads '-', screenings 0 —
  // because 0 is falsy. On an accountability document '-' reads as "not
  // tracked", and "we hold no record" is a different claim from "we hold a
  // record of none".
  it('prints a zero download count as 0, not a dash', async () => {
    // Asserted on the DRAWN text rather than on a spy above the guard, for the
    // same reason as the WinAnsi tests below: what matters is what reached the
    // page. A count of zero rendering as '-' made one row show three treatments
    // of the same value, and on an accountability document '-' reads as "not
    // tracked" rather than "none".
    const { strings } = await textOf(async (doc) => {
      D.staffTable(doc, [{
        actor: 'Medical Demo 01', role: 'medical', actions: 8, downloads: 0,
        previousActions: 0, change: 0, byAction: {}, screeningsImported: 0,
      }], {}, { comparable: false });
    });
    // Three cells: actions 8, downloads 0, screenings 0 — and no bare dash.
    expect(strings).toContain('8');
    expect(strings.filter((x) => x === '0')).toHaveLength(2);
    expect(strings).not.toContain('-');
  });
  // pdfkit's Helvetica is WinAnsi. A character outside that set does not warn,
  // does not throw and does not draw — it measures ZERO WIDTH and prints as
  // mojibake. The escalation factors stored on `screenings.factors` contain a
  // real >= sign and the coach-sport audit summary contains a real arrow, so
  // this is about data the reports receive, not text they author.
  describe('WinAnsi safety', () => {
    it('substitutes every character pdfkit cannot draw', () => {
      const cases = [
        ['over threshold (≥ 25)', 'over threshold (>= 25)'],
        ['sport Badminton → Hockey', 'sport Badminton -> Hockey'],
        ['z ≤ 1.5', 'z <= 1.5'],
        ['a ≠ b', 'a != b'],
        ['− 3', '- 3'],
      ];
      for (const [input, expected] of cases) {
        expect(D.winAnsiSafe(input)).toBe(expected);
      }
    });

    it('leaves WinAnsi characters the reports rely on untouched', () => {
      // These DO render (measured widths are non-zero) and carry meaning in the
      // reports — an em-dash separator, the middot in "Badminton · PODIUM",
      // the multiplication sign in "sport x programme x gender".
      const keep = 'Badminton · PODIUM — sport × gender ± 2 – ok';
      expect(D.winAnsiSafe(keep)).toBe(keep);
    });

    it('passes non-strings through untouched', () => {
      expect(D.winAnsiSafe(null)).toBe(null);
      expect(D.winAnsiSafe(undefined)).toBe(undefined);
      expect(D.winAnsiSafe(42)).toBe(42);
      expect(D.winAnsiSafe('')).toBe('');
    });

    // THE TEST THAT WAS MISSING.
    //
    // The first version of this asserted `winAnsiSafe(input) === expected` and a
    // spy attached to the document after construction. Both passed while
    // `guardText` was never called: a pure function is correct whether or not
    // anybody invokes it, and an instance-level spy sits ABOVE the guard, so it
    // records the raw string either way. The bug shipped and was caught only by
    // re-rendering the report by hand.
    //
    // Patching the PROTOTYPE before construction puts the spy underneath the
    // guard, so what it records is what pdfkit was actually asked to draw. Revert
    // the `guardText(doc)` call in startDoc or bufferDoc and this fails.
    it('installs the guard on startDoc, so pdfkit never receives a bad glyph', async () => {
      const { joined } = await textOf(async (doc) => {
        doc.text(`over threshold (${chr(0x2265)} 25)`, 50, 100);
        doc.text(`sport Badminton ${chr(0x2192)} Hockey`, 50, 130);
      });
      expect(unrenderableIn(joined)).toEqual([]);
      expect(joined).toContain('over threshold (>= 25)');
      expect(joined).toContain('sport Badminton -> Hockey');
    });

    // bufferDoc is the path the monthly DIGEST uses to attach the holistic PDF.
    // It was wired by the same failed edit, so it needs its own assertion — one
    // covering the other would have hidden this.
    it('installs the guard on bufferDoc, the path the emailed report uses', async () => {
      const { joined } = await capturePdfText(async () => {
        const { doc, done } = D.bufferDoc();
        doc.text(`z ${chr(0x2264)} 1.5 and a ${chr(0x2260)} b`, 50, 100);
        D.finish(doc, 'Test Report');
        await done;
      });
      expect(unrenderableIn(joined)).toEqual([]);
      expect(joined).toContain('z <= 1.5 and a != b');
    });

    // A sanitiser that over-reached would quietly wreck "Badminton | PODIUM" and
    // every "sport x programme x gender" caption. Assert survival as firmly as
    // assert removal.
    it('leaves the glyphs the reports depend on intact, end to end', async () => {
      const keep = MUST_SURVIVE.map(chr).join(' ');
      const { joined } = await textOf(async (doc) => {
        doc.text(keep, 50, 100);
      });
      for (const cp of MUST_SURVIVE) expect(joined).toContain(chr(cp));
    });

    // The net over everything else. Every helper is driven with hostile input at
    // once, so a NEW drawing function that bypasses the guard — or a future
    // producer that starts emitting a fresh bad glyph — trips here rather than in
    // a printed report.
    it('no toolkit helper can put an unrenderable glyph on the page', async () => {
      const bad = `${chr(0x2265)}25 ${chr(0x2192)} ${chr(0x2264)} ${chr(0x2212)}3 ${chr(0x2500)}`;
      const { joined } = await textOf(async (doc) => {
        D.cover(doc, `Report ${bad}`, `subtitle ${bad}`);
        D.sectionTitle(doc, `Section ${bad}`);
        D.bar(doc, `Label ${bad}`, 42, 100, '#0f2c4a', { valueText: `42 ${bad}` });
        D.zoneGauge(doc, `Gauge ${bad}`, 18);
        D.keyFindingsBox(doc, [`finding ${bad}`]);
        D.staffTable(doc, [{
          actor: `Actor ${bad}`, role: 'admin', actions: 3, downloads: 0,
          previousActions: 0, change: 0, byAction: { 'report.download': 3 }, screeningsImported: 0,
        }], { 'report.download': `Downloaded ${bad}` }, { comparable: false });
        D.auditTable(doc, [{
          createdAt: '2026-08-18', actorName: `Who ${bad}`, action: 'report.download',
          summary: `Detail ${bad}`,
        }], { 'report.download': 'Report downloaded' });
        D.changeBars(doc, [
          { label: `ROM ${bad}`, avgDelta: -5.2, higherBetter: true, direction: 'declining', deadBand: 2 },
        ], { note: `note ${bad}` });
      });
      expect(unrenderableIn(joined)).toEqual([]);
    });
 });

  // Section 30a, asserted on the PAINT rather than on the page text.
  //
  // The defect was a chart whose longest bar was a sub-threshold move labelled
  // "steady": scaled to the largest delta alone, a -1.8 against a +-2 dead band
  // filled half the track. The fix draws such a bar as an OUTLINE. Nothing in the
  // text records that, so the existing "it produces a PDF" test could not see it,
  // and neither could a string assertion — a future simplification back to a
  // solid fill would pass both.
  describe('change bars: the dead band is drawn, not just documented', () => {
    const row = (label, avgDelta, direction) => ({
      label, avgDelta, higherBetter: true, direction, deadBand: 2,
    });

    // Baseline: a real move fills. Without this the outline assertion below
    // could pass simply because nothing was ever filled.
    it('fills a bar that clears the threshold', async () => {
      const { count } = await paintOf(async (doc) => {
        D.changeBars(doc, [row('ROM', -5.2, 'declining')], { note: 'x' });
      });
      expect(count('fill')).toBeGreaterThan(0);
    });

    // The regression guard, asserted on the fill COLOUR rather than on counts.
    //
    // Counting fills alone proved useless and the first version of this test
    // failed on it: the dead-band zone is itself a filled rect, so a chart that
    // outlines two bars and shades two zones performs exactly as many fills (4)
    // as one that fills two bars and shades nothing. The counts coincide while
    // the meaning is opposite.
    //
    // `fill(tone)` carries the colour, so the precise question is answerable: does
    // any fill use the BAR tone? Drawing the identical magnitudes with the dead
    // band removed produces that tone and pins it, so the colour is derived from
    // the toolkit rather than hardcoded here.
    it('outlines rather than fills a bar smaller than its own dead band', async () => {
      const rows = [row('Overall indicator', -1.8, 'steady'), row('Total score', 0.4, 'steady')];
      const paint = (rs) => paintOf(async (doc) => {
        D.changeBars(doc, rs, { note: 'x' });
      });

      const noBand = await paint(rows.map((r) => ({ ...r, deadBand: 0 })));
      const withBand = await paint(rows);

      const fillColours = (p) => p.ops.filter((o) => o.op === 'fill').map((o) => o.args[0]);
      // With no dead band these are real moves, so a tone appears that the track
      // and zone greys never use. That tone is what a filled bar looks like.
      const barTone = fillColours(noBand).find((c) => !fillColours(withBand).includes(c));
      expect(barTone).toBeTruthy();

      // ...and with the dead band in force, nothing on the page is painted in it.
      expect(fillColours(withBand)).not.toContain(barTone);
      // The outlines replace those fills, so strokes go up as fills-in-tone go to
      // zero — the two halves of the same change.
      expect(withBand.count('stroke')).toBeGreaterThan(noBand.count('stroke'));
    });

    // A zero delta is neither a gain nor a loss and must not paint a bar at all.
    it('paints no bar for a delta of zero', async () => {
      const zero = await paintOf(async (doc) => {
        D.changeBars(doc, [row('ROM', 0, 'steady')], { note: 'x' });
      });
      const moved = await paintOf(async (doc) => {
        D.changeBars(doc, [row('ROM', 6, 'improving')], { note: 'x' });
      });
      expect(moved.count('fill')).toBeGreaterThan(zero.count('fill'));
    });
  });

  // The individual report's "Progress Between Reports" row. This rule shipped
  // wrong: it printed "+0" in green, because 0 satisfies both `d >= 0` and
  // `d <= 0`. Four of five columns claimed an improvement that had not happened,
  // on the report a clinician actually reads.
  describe('changeCell: three cases, never two', () => {
    const MUTED = '#6b7280';

    it('reports a delta of zero as neutral, not as a gain', () => {
      const c = D.changeCell(0, true);
      expect(c.text).toBe('0');          // not "+0"
      expect(c.moved).toBe(false);
      expect(c.color).toBe(MUTED);       // not green
      // ...and in the inverted orientation too, where 0 also passed `d <= 0`.
      const r = D.changeCell(0, false);
      expect(r.text).toBe('0');
      expect(r.moved).toBe(false);
      expect(r.color).toBe(MUTED);
    });

    it('signs and colours a real move by its orientation', () => {
      expect(D.changeCell(3, true)).toMatchObject({ text: '+3', moved: true });
      expect(D.changeCell(3, true).color).not.toBe(MUTED);
      // Exercise risks improve by FALLING, so -4 is the good direction and +4 the
      // bad one — the same colour, opposite signs, which is the rule that makes
      // this worth having in one place.
      const better = D.changeCell(-4, false);
      const worse = D.changeCell(4, false);
      expect(better.text).toBe('-4');
      expect(worse.text).toBe('+4');
      expect(better.color).not.toBe(worse.color);
      expect(better.color).toBe(D.changeCell(4, true).color);
    });

    it('distinguishes "no data" from "no change"', () => {
      // An em-dash, and never a zero: a score we never measured and a score that
      // did not move are different claims.
      for (const empty of [null, undefined, '', NaN]) {
        const c = D.changeCell(empty, true);
        expect(c.moved).toBe(false);
        expect(c.color).toBe(MUTED);
        expect(c.text).not.toBe('0');
      }
      expect(D.changeCell(0, true).text).toBe('0');
    });

    // Output-level: the em-dash it emits must survive the WinAnsi guard, since a
    // sanitiser that over-reached would turn "no data" into a hyphen.
    it('emits a dash that actually renders', async () => {
      const { joined } = await textOf(async (doc) => {
        doc.text(D.changeCell(null, true).text, 50, 100);
      });
      expect(unrenderableIn(joined)).toEqual([]);
      expect(joined).toContain(chr(0x2014));
    });
  });

  // Section 30b. `bar()` reserved a fixed 50pt for its value, so
  // "58 of 62 (94%)" (about 70pt at 9pt bold) ran past its slot and the second
  // line landed on the row beneath. The fix measures the text and gives the bar
  // whatever is left. Nothing in the page TEXT records that, so this asserts the
  // geometry: whatever the value says, it still has to fit on the page.
  describe('bar: a long value shortens the bar instead of colliding', () => {
    const drawBar = (valueText) => paintOf(async (doc) => {
      D.bar(doc, 'Roster covered', 58, 62, '#3d7c47', { valueText });
    });

    // Width of the value as it is actually drawn: 9pt Helvetica-Bold.
    const valueWidth = (text) => {
      const probe = new PDFDocument();
      probe.font('Helvetica-Bold').fontSize(9);
      return probe.widthOfString(text);
    };

    it('keeps the value inside the page however long it is', async () => {
      const PAGE_W = 595.28; // A4 portrait, the size startDoc uses
      const RIGHT_MARGIN = 50;
      for (const text of ['1.3', '58 of 62 (94%)', '58 of 62 on the roster', '1234 of 5678 (99.9%) recorded']) {
        const paint = await drawBar(text);
        // The widest rect on the row is the bar track; its right edge is where
        // the value column begins (plus an 8pt gap in the drawing code).
        const track = paint.rects().reduce((a, b) => (b.w > a.w ? b : a));
        const valueRight = track.x + track.w + 8 + valueWidth(text);
        expect(valueRight).toBeLessThanOrEqual(PAGE_W - RIGHT_MARGIN + 1);
      }
    });

    it('shortens the bar as the value grows, rather than overlapping it', async () => {
      const short = await drawBar('1.3');
      const long = await drawBar('1234 of 5678 (99.9%) recorded');
      const widest = (p) => p.rects().reduce((a, b) => (b.w > a.w ? b : a)).w;
      expect(widest(long)).toBeLessThan(widest(short));
    });
  });

  // Section 30c. The squad body map was smoke-tested only — "returns true and
  // produces a PDF" passes just as well if the figure never draws a single
  // muscle. muscleFigure paints each path with fillAndStroke, so counting those
  // distinguishes a drawn figure from an empty frame.
  describe('squad body map actually draws a body', () => {
    const member = (base) => ({
      a: { athleteId: String(base), name: 'A' + base },
      s: {
        subitems: {
          neck: { romL: base, romR: base - 5, stabL: base, stabR: base, sym: base },
          shoulder: { romL: base, romR: base, stabL: base, stabR: base, sym: base },
          torso: { romL: base - 20, romR: base - 22, stabL: base - 18, stabR: base - 20, sym: base },
          pelvis: { romL: base + 10, romR: base + 8, stabL: base + 9, stabR: base + 7, sym: base },
          lowerLimbs: { romL: base + 20, romR: base + 21, stabL: base + 19, stabR: base + 20, sym: base },
        },
      },
    });
    const paintFigure = (members) => paintOf(async (doc) => {
      D.squadMuscleFigure(doc, members);
    });

    it('paints the licensed geometry, front and back', async () => {
      const paint = await paintFigure([member(62), member(70), member(55), member(80)]);
      // Two views of a couple of dozen regions each: a real figure is dozens of
      // painted paths, not a handful.
      expect(paint.count('path')).toBeGreaterThan(30);
      expect(paint.count('fillAndStroke')).toBeGreaterThan(30);
    });

    it('paints nothing when the group has no subitems to colour', async () => {
      const paint = await paintFigure([{ a: {}, s: {} }]);
      expect(paint.count('fillAndStroke')).toBe(0);
    });
  });
});

// The Lateral Symmetry table is the report's answer to "which side do I train".
// Its region list is no longer defined in this file — it is imported from
// utils/symmetry.js, which is the right shape but means a defect over there
// prints here. It already did once: the list was retyped with `lower` for
// `lowerLimbs` during an extraction, and because symmetryFindings omits a region
// with no symmetry score, Lower Limbs simply stopped being printed. Nothing
// failed, because every value that WAS printed was correct.
//
// Asserted on the rendered page rather than on symmetryFindings, deliberately:
// the module has its own suite, and this one exists to catch the row going
// missing between a correct module and the paper.
describe('the Lateral Symmetry table names every region', () => {
  let text;
  beforeAll(async () => { ({ joined: text } = await textOf((doc) => D.symmetrySection(doc, SUBITEMS))); });

  it.each([['Neck'], ['Shoulder & Upper Limbs'], ['Torso'], ['Pelvis'], ['Lower Limbs']])(
    'prints %s',
    (label) => { expect(text).toContain(label); },
  );

  it('prints a side for a region whose sides differ', () => {
    expect(text).toMatch(/Left|Right/);
  });
});
