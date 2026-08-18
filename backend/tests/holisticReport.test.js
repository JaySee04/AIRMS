// Coverage for the holistic screening report (utils/holisticReport.js).
//
// This report was composed inline in its route handler until 2026-08-10, which
// meant the ONE piece of it that is real logic — which athletes a filtered
// report keeps, and what the saved file is called — could only be checked by
// downloading a PDF and counting rows by eye. Extracting fetch from draw (so the
// monthly digest could attach the same bytes) also made both testable.
//
// The DRAW half gets smoke coverage in the style of pdfDraw.test.js: assert it
// produces a real PDF and does not throw on the shapes manual checking never
// reaches — an empty population, unscored athletes, null scores, a focus region.

jest.mock('../src/models', () => ({
  Athlete: { count: jest.fn() },
  Screening: { findAll: jest.fn() },
  AthleteDiscipline: { findAll: jest.fn() },
}));

// `mock`-prefixed so Babel allows the hoisted factory to close over it.
const mockLatest = jest.fn();
jest.mock('../src/utils/cohorts', () => {
  const actual = jest.requireActual('../src/utils/cohorts');
  return { ...actual, latestScreeningsByAthlete: (...a) => mockLatest(...a) };
});

const { Athlete, Screening, AthleteDiscipline } = require('../src/models');
const { holisticData, drawHolistic, renderHolisticPdf } = require('../src/utils/holisticReport');
const { bufferDoc } = require('../src/utils/pdfDraw');
const { capturePdfText, unrenderableIn } = require('./helpers/capturePdfText');

// Two athletes per sport/gender/programme combination that the filters slice on,
// so a predicate that ignores its argument cannot pass by luck.
const ROSTER = [
  ['890202021001', 'Aisyah', 'Badminton', 'PODIUM', 'Female', 22, 'red'],
  ['890202021002', 'Farid', 'Badminton', 'PELAPIS', 'Male', 17, 'amber'],
  ['890202021003', 'Chong', 'Diving', 'PODIUM', 'Male', 28, 'green'],
  ['890202021004', 'Devi', 'Diving', 'PELAPIS', 'Female', 33, null],
];

const rows = () => ROSTER.map(([athleteId, name, sport, program, gender, age, band]) => ({
  athlete: {
    athleteId, name, sport, program, gender, age,
  },
  screening: {
    athleteId,
    assessedAt: '2026-07-15',
    totalScore: 70 + age % 10,
    rom: 68,
    stability: 80,
    symmetry: 88,
    exerciseRisks: 18,
    kneeInjuryRisk: 27,
    ankleInjuryRisk: 12,
    overallIndicator: band === 'red' ? 31 : 64,
    overallBand: band,
    overrideBand: null,
    // Real escalation factors, as `overallIndicator.js` writes them. The third
    // string carries a genuine U+2265 — the character that printed as mojibake
    // in the flagged list until the drawing boundary started sanitising. Written
    // as an escape so this fixture cannot itself be mangled by an editor.
    factors: band === 'red'
      ? [
        'below cohort average \u2014 Symmetry 11.7 worse than the group',
        'bottom 1 of 9 in cohort',
        'Shoulder 27 \u2014 over threshold (\u226525) and worse than cohort (z=1.62)',
      ]
      : band === 'amber' ? ['bottom 1 of 5 in cohort'] : null,
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockLatest.mockResolvedValue(rows());
  Athlete.count.mockResolvedValue(10);
  Screening.findAll.mockResolvedValue(rows().map((r) => r.screening));
  AthleteDiscipline.findAll.mockResolvedValue([]);
});

const names = (data) => data.kept.map((k) => k.athlete.name).sort();

describe('holisticData — population filters', () => {
  test('no filters keeps everyone and says so', async () => {
    const d = await holisticData({});
    expect(names(d)).toEqual(['Aisyah', 'Chong', 'Devi', 'Farid']);
    expect(d.scope).toBe('All athletes');
    expect(d.parts).toEqual([]);
    // Unfiltered reports must not pick up a filter slug, or every month's saved
    // file would claim a scope it does not have.
    expect(d.nameBits).toEqual(['AIRMS_Holistic']);
  });

  test('each filter narrows on its own field', async () => {
    expect(names(await holisticData({ sport: 'Diving' }))).toEqual(['Chong', 'Devi']);
    expect(names(await holisticData({ program: 'PODIUM' }))).toEqual(['Aisyah', 'Chong']);
    expect(names(await holisticData({ gender: 'Female' }))).toEqual(['Aisyah', 'Devi']);
  });

  test('filters combine as AND, not OR', async () => {
    expect(names(await holisticData({ sport: 'Badminton', gender: 'Female' }))).toEqual(['Aisyah']);
  });

  test('age bounds are inclusive at both ends', async () => {
    // Farid is 17 and Devi 33 — the boundary athletes are the ones an off-by-one
    // silently drops from an institute report.
    expect(names(await holisticData({ ageMin: 17, ageMax: 33 })))
      .toEqual(['Aisyah', 'Chong', 'Devi', 'Farid']);
    expect(names(await holisticData({ ageMin: 18, ageMax: 32 }))).toEqual(['Aisyah', 'Chong']);
  });

  test('a discipline filter keeps only that discipline\'s owners', async () => {
    AthleteDiscipline.findAll.mockResolvedValue([{ athleteId: '890202021003' }]);
    const d = await holisticData({ discipline: 'Springboard' });
    expect(names(d)).toEqual(['Chong']);
    expect(AthleteDiscipline.findAll).toHaveBeenCalledTimes(1);
  });

  test('no discipline filter means no extra query', async () => {
    await holisticData({});
    expect(AthleteDiscipline.findAll).not.toHaveBeenCalled();
  });

  test('allRows stays unfiltered so a focus can compare against the institute', async () => {
    const d = await holisticData({ sport: 'Badminton' });
    expect(d.kept).toHaveLength(2);
    expect(d.allRows).toHaveLength(4);
  });
});

describe('holisticData — scope and filename', () => {
  test('scope reads as a sentence and slugs into the filename', async () => {
    const d = await holisticData({ sport: 'Badminton', gender: 'Female', ageMin: 18 });
    expect(d.scope).toBe('Badminton · Female · age 18-+');
    expect(d.nameBits.join('_')).toBe('AIRMS_Holistic_Badminton_Female_age_18-');
  });

  test('a focus region is named in the file, an unknown one is ignored', async () => {
    expect((await holisticData({ region: 'kneeInjuryRisk' })).focused).toBe('kneeInjuryRisk');
    // Never displayed (LDH), so it must not become a focus even if asked for.
    expect((await holisticData({ region: 'spinalDiscHerniation' })).focused).toBeNull();
    expect((await holisticData({ region: 'nonsense' })).focused).toBeNull();
  });

  test('grain defaults to quarter and rejects anything else', async () => {
    expect((await holisticData({})).grain).toBe('quarter');
    expect((await holisticData({ grain: 'month' })).grain).toBe('month');
    expect((await holisticData({ grain: 'fortnight' })).grain).toBe('quarter');
  });
});

// ── draw ────────────────────────────────────────────────────────────────────
async function draw(data) {
  const { doc, done } = bufferDoc();
  drawHolistic(doc, data, '2026-08-10');
  return done;
}

const isPdf = (buf) => buf.slice(0, 5).toString() === '%PDF-';
const pageCount = (buf) => (buf.toString('latin1').match(/\/Type \/Page[^s]/g) || []).length;

describe('drawHolistic', () => {
  test('renders a multi-page PDF for a normal population', async () => {
    const pdf = await draw(await holisticData({}));
    expect(isPdf(pdf)).toBe(true);
    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  test('renders with a focus region', async () => {
    const pdf = await draw(await holisticData({ region: 'kneeInjuryRisk' }));
    expect(isPdf(pdf)).toBe(true);
  });

  test('survives an empty population', async () => {
    // A filter that matches nobody must produce a report that says so, not a 500.
    mockLatest.mockResolvedValue([]);
    Screening.findAll.mockResolvedValue([]);
    const pdf = await draw(await holisticData({ sport: 'Sepak Takraw' }));
    expect(isPdf(pdf)).toBe(true);
  });

  test('survives null scores and a missing band', async () => {
    mockLatest.mockResolvedValue([{
      athlete: {
        athleteId: '1', name: 'Nulls', sport: null, program: null, gender: null, age: null,
      },
      screening: { athleteId: '1', assessedAt: '2026-07-15' },
    }]);
    const pdf = await draw(await holisticData({}));
    expect(isPdf(pdf)).toBe(true);
  });

  test('renders an athlete whose band is overridden', async () => {
    // Smoke only. That the override WINS is bands.test.js' job — the PDF stream is
    // compressed, so asserting a count from these bytes is not something this test
    // can honestly claim to do.
    const one = rows().slice(0, 1);
    one[0].screening.overallBand = 'green';
    one[0].screening.overrideBand = 'red';
    mockLatest.mockResolvedValue(one);
    const d = await holisticData({});
    expect(isPdf(await draw(d))).toBe(true);
  });
});

describe('renderHolisticPdf', () => {
  test('buffers the report and stamps the filename', async () => {
    const { buffer, filename } = await renderHolisticPdf({ grain: 'month' }, '2026-08');
    expect(isPdf(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(filename).toBe('AIRMS_Holistic_2026-08.pdf');
  });
});

// The flagged list is where both of this session's report defects actually
// surfaced: a verdict with no reason, and a stored character the PDF could not
// draw. Asserting on the DRAWN text closes the loop that unit-testing
// `winAnsiSafe` in isolation left open.
describe('drawHolistic — the flagged list says why, and says it in printable characters', () => {
  const draw = async (query = {}) => {
    const data = await holisticData(query);
    return capturePdfText(async () => {
      const { doc, done } = bufferDoc();
      // drawHolistic calls finish(), which ends the stream — no doc.end() here.
      drawHolistic(doc, data, '2026-08-18');
      await done;
    });
  };

  test('prints the escalation that set each flagged athlete\'s band', async () => {
    const { joined } = await draw();
    // The red athlete's three factors must all reach the page: showing only the
    // first was considered and rejected, because the per-indicator outlier is
    // usually the actionable one.
    expect(joined).toContain('below cohort average');
    expect(joined).toContain('bottom 1 of 9 in cohort');
    expect(joined).toContain('over threshold');
    // ...and the caveat that makes an above-average flagged athlete legible.
    expect(joined).toMatch(/band follows how MANY rules fired/i);
  });

  // THE REGRESSION. This is the assertion whose absence let the mojibake ship:
  // the factor text is stored with a real U+2265, and only the rendered output
  // can show whether the reader ever sees a usable character.
  test('renders the stored >= as printable text, not mojibake', async () => {
    const { joined } = await draw();
    expect(unrenderableIn(joined)).toEqual([]);
    expect(joined).toContain('over threshold (>=25)');
  });

  test('says so rather than falling silent when an athlete has no factors', async () => {
    mockLatest.mockResolvedValue(rows().map((r) => (
      r.screening.overallBand === 'amber'
        ? { ...r, screening: { ...r.screening, factors: null } }
        : r)));
    const { joined } = await draw();
    expect(joined).toContain('no escalation recorded');
  });

  test('attributes a clinician override rather than blaming a missing rule', async () => {
    mockLatest.mockResolvedValue(rows().map((r) => (
      r.screening.overallBand === 'amber'
        ? { ...r, screening: { ...r.screening, factors: null, overrideBand: 'red' } }
        : r)));
    const { joined } = await draw();
    expect(joined).toContain('clinician override');
  });

  // A whole-report sweep, not just the flagged list: every caption, table and
  // note this report draws has to be printable too.
  test('no section of the report emits a glyph the PDF cannot draw', async () => {
    for (const query of [{}, { sport: 'Badminton' }, { region: 'kneeInjuryRisk' }, { grain: 'month' }]) {
      const { joined } = await draw(query);
      expect(unrenderableIn(joined)).toEqual([]);
    }
  });
});
