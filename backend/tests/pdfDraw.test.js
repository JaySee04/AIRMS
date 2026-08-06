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
});
