// WHAT ACTUALLY REACHES THE VISION PROVIDER.
//
// WHY THIS EXISTS, and it is the winAnsiSafe shape again. `reportIdentity.js`
// and `layoutFingerprint.js` are both at 100% statements and 100% branches —
// and `holomotionExtract.js`, the module that CALLS them, appeared in no
// coverage report at all: nothing required it. Five suites mention it and every
// one reads it as source TEXT.
//
// So the two gates that decide whether an arbitrary document leaves the machine
// were verified as pure functions, and the wiring was verified by hand against a
// running server. A pure function is correct whether or not anybody calls it;
// that is the defect `winAnsiSafe` is named after, where a guard shipped
// defined, exported, unit-tested and never wired.
//
// This drives the real `extractFromPdf` and asserts the DECISION TABLE — above
// all that `visionComplete` is NOT called on a document that should be refused.
// Asserting the 422 alone would pass against a version that refused AFTER
// transmitting, which is the thing the gate exists to prevent.
//
// Everything below the decision is mocked, so no PDF is opened, no canvas is
// loaded and no database is touched — it runs in CI.

const mockExtractFromTextLayer = jest.fn();
jest.mock('../src/utils/textLayerExtract', () => ({
  extractFromTextLayer: (...a) => mockExtractFromTextLayer(...a),
}));

const mockVisionComplete = jest.fn();
const mockIsVisionConfigured = jest.fn();
jest.mock('../src/utils/visionClient', () => ({
  visionComplete: (...a) => mockVisionComplete(...a),
  isVisionConfigured: (...a) => mockIsVisionConfigured(...a),
}));

const mockRenderForExtraction = jest.fn();
const mockRenderPdfPages = jest.fn();
jest.mock('../src/utils/pdfRender', () => ({
  renderForExtraction: (...a) => mockRenderForExtraction(...a),
  renderPdfPages: (...a) => mockRenderPdfPages(...a),
  DATA_PAGES: [1, 2, 3, 4, 5, 6],
}));

const mockRecoverSummary = jest.fn();
jest.mock('../src/utils/summaryRecover', () => ({ recoverSummary: (...a) => mockRecoverSummary(...a) }));

const mockGetSettings = jest.fn();
jest.mock('../src/utils/settings', () => ({ getSettings: (...a) => mockGetSettings(...a) }));

// Mocked only to keep the output readable. Unmocked it degrades correctly — the
// prescription parser needs a dynamic import() that the jest transform rewrites,
// so it throws, is caught, and the import proceeds without a prescription. That
// is the right behaviour and it printed a stack per test; a suite that shouts on
// every green run is a suite whose output stops being read.
jest.mock('../src/utils/prescription', () => ({ prescriptionFromPdf: jest.fn().mockResolvedValue(null) }));

// The fingerprint path loads the native canvas. Stubbed so this suite stays
// DB-free and binary-free; what it returns is steered by mockSignature below.
const mockLoadImage = jest.fn();
jest.mock('@napi-rs/canvas', () => ({ loadImage: (...a) => mockLoadImage(...a), createCanvas: jest.fn() }), { virtual: true });

const mockSignature = jest.fn();
const mockLooksLikeCover = jest.fn();
jest.mock('../src/utils/layoutFingerprint', () => {
  const actual = jest.requireActual('../src/utils/layoutFingerprint');
  return { ...actual, signature: (...a) => mockSignature(...a), looksLikeCover: (...a) => mockLooksLikeCover(...a) };
});

const { extractFromPdf } = require('../src/utils/holomotionExtract');

const BUF = Buffer.from('%PDF-1.4 not really a pdf');

/** A complete text-layer read — the zero-provider path. */
const GOOD_READ = {
  ok: true,
  method: 'text-layer',
  textLayerChars: 2680,
  totalPages: 38,
  nameFound: true,
  athlete: { name: '', overallActivityScore: 78, injuryRiskIndex: 14 },
  assessedAt: '2025-08-13 09:30:28',
  subitems: {},
  myodynamia: [],
  tension: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIsVisionConfigured.mockReturnValue(true);
  mockGetSettings.mockResolvedValue({ summary_vision_topup: false });
  mockRecoverSummary.mockReturnValue({ ok: true, summary: '1. Something.' });
  mockRenderPdfPages.mockResolvedValue([{ page: 1, base64: 'AAAA', mediaType: 'image/png' }]);
  mockRenderForExtraction.mockResolvedValue([{ page: 1, label: 'p1', base64: 'AAAA', mediaType: 'image/png' }]);
  mockLoadImage.mockResolvedValue({});
  mockSignature.mockReturnValue([]);
  mockLooksLikeCover.mockReturnValue({ known: true, relevant: true, distance: 0.01, why: 'ok' });
  mockVisionComplete.mockResolvedValue({ text: '{}', usage: null });
});

describe('a readable report never reaches the provider', () => {
  it('returns the text-layer read and calls nothing', async () => {
    mockExtractFromTextLayer.mockResolvedValue(GOOD_READ);
    const r = await extractFromPdf(BUF);
    expect(r.method).toBe('text-layer');
    expect(mockVisionComplete).not.toHaveBeenCalled();
    expect(r.providerCalls).toBe(0);
  });
});

describe('a document that is NOT a screening report is refused before transmission', () => {
  it('throws 422 and does NOT call the provider', async () => {
    // The measured case: a 51-page university report. Text IS present, so this
    // is not the compact layout; almost no required field parsed.
    mockExtractFromTextLayer.mockResolvedValue({
      ok: false,
      reason: 'text-layer-incomplete',
      missing: new Array(14).fill('x'),
      textLayerChars: 3622,
      text: 'FACULTY OF COMPUTER SCIENCE AND INFORMATION TECHNOLOGY UNIVERSITI MALAYA',
    });

    await expect(extractFromPdf(BUF)).rejects.toMatchObject({ status: 422 });
    // THE ASSERTION THAT MATTERS. A 422 raised after the pages were sent would
    // satisfy the one above and defeat the entire point.
    expect(mockVisionComplete).not.toHaveBeenCalled();
    expect(mockRenderForExtraction).not.toHaveBeenCalled();
  });

  it('says so in a message the operator is allowed to read', async () => {
    mockExtractFromTextLayer.mockResolvedValue({
      ok: false, reason: 'text-layer-incomplete', missing: new Array(14).fill('x'), text: 'invoice total due',
    });
    // §48: a 4xx keeps its message; without `expose` the operator gets the
    // generic sentence and cannot tell a rejected file from a server fault.
    await expect(extractFromPdf(BUF)).rejects.toMatchObject({
      status: 422, expose: true, message: expect.stringMatching(/does not look like a HoloMotion/i),
    });
  });

  it('still falls through to vision for a REAL report the parser stumbled on', async () => {
    // The case a careless gate would break: HoloMotion's markers are present, so
    // this IS a report — it just did not parse cleanly, which is exactly what
    // the vision fallback is for.
    mockExtractFromTextLayer.mockResolvedValue({
      ok: false,
      reason: 'text-layer-incomplete',
      missing: new Array(15).fill('x'),
      text: 'Report of Physical Quality and Exercise Risks Total Score 78 Name ： someone',
    });
    await extractFromPdf(BUF).catch(() => {});
    expect(mockVisionComplete).toHaveBeenCalled();
  });
});

describe('the no-text case — the compact layout, and everything pretending to be it', () => {
  const NO_TEXT = { ok: false, reason: 'no-text-layer', textLayerChars: 0, totalPages: 12 };

  it('lets the compact layout through when the cover matches', async () => {
    mockExtractFromTextLayer.mockResolvedValue(NO_TEXT);
    mockLooksLikeCover.mockReturnValue({ known: true, relevant: true, distance: 0.0132 });
    await extractFromPdf(BUF).catch(() => {});
    expect(mockVisionComplete).toHaveBeenCalled();
  });

  it('refuses a scanned document whose cover is nothing like a report', async () => {
    mockExtractFromTextLayer.mockResolvedValue(NO_TEXT);
    mockLooksLikeCover.mockReturnValue({ known: true, relevant: false, distance: 0.91, why: 'distance 0.910' });
    await expect(extractFromPdf(BUF)).rejects.toMatchObject({ status: 422 });
    expect(mockVisionComplete).not.toHaveBeenCalled();
  });

  it('FAILS OPEN when the fingerprint cannot be computed', async () => {
    // A missing reference, an unloadable canvas or a render error must mean "no
    // opinion", never "refuse". Blocking a clinician from importing a real
    // screening is a worse outcome than the hole this closes.
    mockExtractFromTextLayer.mockResolvedValue(NO_TEXT);
    mockRenderPdfPages.mockRejectedValue(new Error('canvas unavailable'));
    await extractFromPdf(BUF).catch(() => {});
    expect(mockVisionComplete).toHaveBeenCalled();
  });

  it('judges the cover from ONE page, not the whole data section', async () => {
    // renderForExtraction renders six pages and captions them; measured, it did
    // not return within ten minutes on a 51-page document. A gate that costs
    // more than the call it prevents is not a gate.
    mockExtractFromTextLayer.mockResolvedValue(NO_TEXT);
    mockLooksLikeCover.mockReturnValue({ known: true, relevant: false, distance: 0.9 });
    await extractFromPdf(BUF).catch(() => {});
    expect(mockRenderPdfPages).toHaveBeenCalledWith(expect.anything(), [1], 1);
  });
});

describe('the Summary top-up is governed, and off by default', () => {
  it('does not call the provider for a Summary when the setting is off', async () => {
    mockExtractFromTextLayer.mockResolvedValue(GOOD_READ);
    mockRecoverSummary.mockReturnValue({ ok: false, reason: 'no-summary-marker' });
    mockGetSettings.mockResolvedValue({ summary_vision_topup: false });
    const r = await extractFromPdf(BUF);
    expect(mockVisionComplete).not.toHaveBeenCalled();
    expect(r.summaryMethod).toBe('declined:setting');
  });

  it('calls it when the institution has opted in', async () => {
    mockExtractFromTextLayer.mockResolvedValue(GOOD_READ);
    mockRecoverSummary.mockReturnValue({ ok: false, reason: 'no-summary-marker' });
    mockGetSettings.mockResolvedValue({ summary_vision_topup: true });
    await extractFromPdf(BUF).catch(() => {});
    expect(mockVisionComplete).toHaveBeenCalled();
  });

  it('fails CLOSED when the setting cannot be read', async () => {
    // An unreadable setting must not read as permission on the path that decides
    // whether a page is transmitted.
    mockExtractFromTextLayer.mockResolvedValue(GOOD_READ);
    mockRecoverSummary.mockReturnValue({ ok: false, reason: 'no-summary-marker' });
    mockGetSettings.mockRejectedValue(new Error('no database'));
    await extractFromPdf(BUF);
    expect(mockVisionComplete).not.toHaveBeenCalled();
  });
});
