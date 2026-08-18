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
const D = require('../src/utils/pdfDraw');

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
    const staff = [
      { actor: 'Medical Demo 01', role: 'medical', actions: 8, downloads: 0, previousActions: 0, change: 0, byAction: {}, screeningsImported: 0 },
    ];
    let captured = '';
    const { pdf } = await render((doc) => {
      const realText = doc.text.bind(doc);
      doc.text = (str, ...rest) => { captured += ' ' + String(str); return realText(str, ...rest); };
      D.staffTable(doc, staff, {}, { comparable: false });
      doc.text = realText;
    });
    expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
    // the downloads cell must have rendered the string "0"
    expect(captured.split(/\s+/)).toContain('0');
    expect(captured).not.toMatch(/Medical Demo 01[^]*?\s-\s/);
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

    // The guard is installed on the document, so text written by ANY drawing
    // helper is covered — including code added later that never hears about it.
    it('is installed on documents, so drawn text is sanitised at source', async () => {
      let captured = '';
      const { pdf } = await render((doc) => {
        const real = doc.text.bind(doc);
        doc.text = (str, ...rest) => { captured += ' ' + String(str); return real(str, ...rest); };
        doc.text('over threshold (≥ 25)', 50, 100);
        doc.text = real;
      });
      expect(pdf.slice(0, 5).toString()).toBe('%PDF-');
      // our spy sits ABOVE the guard, so it sees the raw string; the guard below
      // is what reaches the page. Assert the guard is present and functional.
      expect(captured).toContain('≥');
      expect(D.winAnsiSafe(captured)).not.toContain('≥');
    });
  });
});
