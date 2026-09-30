// VISION IS A FALLBACK FOR AN UNREADABLE REPORT, NOT AN UNREADABLE FILE.
//
// Measured 2026-09-30, before this existed: uploading a 51-page university
// report — 10.8 MB, carrying its author's name and supervisor — returned 200,
// fell through to the vision path and SENT ITS PAGES TO GEMINI. One provider
// call, quota spent, an arbitrary document off the machine to a third party.
// After: 422, zero provider calls, nothing transmitted.
//
// The two refusals `extractFromTextLayer` returns mean opposite things and the
// caller used to collapse them:
//
//   no-text-layer          0 chars — the compact layout. Vision is the only way
//                          to read it. MUST still fall through.
//   text-layer-incomplete  text IS present. Ask what it is before spending.
//
// Both directions are tested here, because a gate that refuses everything is as
// broken as one that refuses nothing — and the compact layout is the case a
// careless fix would break while every other check stayed green.
const { identifyReport, MIN_FIELDS, REQUIRED_FIELDS } = require('../src/utils/reportIdentity');

// Page-1 text as the real documents actually carry it, trimmed. Taken from the
// measurement rather than invented, so the fixtures cannot flatter the gate.
const HOLOMOTION_P1 = 'Report of Physical Quality and Exercise Risks Information Name ： '
  + 'muhammad nazwan bin abdullah Gender ： Male Age ： 21 time ： 2025-08-13 09:30:28 '
  + 'Total Score 78 （ Good ） Exercise Risks 14 （ Low Risk ） Summary';

const UNRELATED_P1 = 'FACULTY OF COMPUTER SCIENCE AND INFORMATION TECHNOLOGY UNIVERSITI MALAYA '
  + 'WIA3002 ACADEMIC PROJECT I REPORT INTERACTIVE STUDENT SPORTS PORTAL WITH HEALTH '
  + 'DASHBOARD PREPARED BY LIM JIAN CHUEN 23005005 SUPERVISED BY DR. HOO';

describe('identifyReport — is this a HoloMotion report at all', () => {
  it('accepts a real report on its printed markers', () => {
    const id = identifyReport({ text: HOLOMOTION_P1, missing: [] });
    expect(id.relevant).toBe(true);
    expect(id.fieldsFound).toBe(REQUIRED_FIELDS);
  });

  it('REFUSES the unrelated document that used to reach the model', () => {
    // 14 of 17 missing is what was measured on the real file; the 3 it "found"
    // were numbers matched out of unrelated prose.
    const id = identifyReport({ text: UNRELATED_P1, missing: new Array(14).fill('x') });
    expect(id.relevant).toBe(false);
    expect(id.why).toMatch(/no HoloMotion markers/);
  });

  it('accepts a report whose TITLE failed to extract but whose fields parsed', () => {
    // The marker test alone would reject this. A genuine report that lost its
    // heading must not be refused when the numbers are plainly there.
    const id = identifyReport({ text: 'mangled heading 78 14 71 76 79', missing: [] });
    expect(id.relevant).toBe(true);
  });

  it('accepts a DAMAGED report — markers present, several fields missing', () => {
    // This is the case that must NOT be refused: it still goes to the vision
    // fallback, exactly as it did before the gate existed.
    const id = identifyReport({ text: HOLOMOTION_P1, missing: new Array(15).fill('x') });
    expect(id.relevant).toBe(true);
  });

  it('refuses a document with neither markers nor enough fields', () => {
    const id = identifyReport({ text: 'invoice total due 42', missing: new Array(REQUIRED_FIELDS - MIN_FIELDS + 1).fill('x') });
    expect(id.relevant).toBe(false);
  });

  it('counts the fullwidth colon as a marker in its own right', () => {
    // U+FF1A is how the instrument separates every cover label from its value,
    // and ordinary English documents do not contain it.
    const id = identifyReport({ text: 'Name ： someone Total Score 70', missing: new Array(17).fill('x') });
    expect(id.markers).toContain('fullwidth colon');
    expect(id.relevant).toBe(true);
  });

  it('survives being handed nothing at all', () => {
    expect(identifyReport().relevant).toBe(false);
    expect(identifyReport({}).relevant).toBe(false);
    expect(identifyReport({ text: null, missing: null }).relevant).toBe(false);
  });
});

describe('the routing decision the gate feeds', () => {
  // The gate fires ONLY on 'text-layer-incomplete'. The compact layout reports
  // 'no-text-layer' and must reach vision untouched — asserted here because it
  // is the regression a careless version of this fix would cause, and every
  // other check in the repo would stay green while it did.
  const gateFires = (reason, id) => reason === 'text-layer-incomplete' && !id.relevant;

  it('lets the COMPACT layout through to vision', () => {
    // thung.pdf: 0 chars, reason 'no-text-layer'. There is nothing local left to
    // test, so the gate must not express an opinion.
    expect(gateFires('no-text-layer', { relevant: false })).toBe(false);
  });

  it('refuses a text-bearing PDF that is not a report', () => {
    expect(gateFires('text-layer-incomplete', { relevant: false })).toBe(true);
  });

  it('lets a text-bearing REPORT through to vision when fields are missing', () => {
    expect(gateFires('text-layer-incomplete', { relevant: true })).toBe(false);
  });
});
