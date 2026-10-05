// Turns a HoloMotion screening PDF into an Athlete payload via a vision model.
//
// Flow: render data pages → ask the model for strict JSON → map the JSON onto
// the flat Athlete columns + muscle_flags rows the rest of the system expects.
//
// Fields the report does NOT contain (athleteId, sport, program, weight,
// height) are left undefined here; the upload route merges them from operator
// input at commit time. This module only extracts what is actually on the page.

const { renderForExtraction } = require('./pdfRender');
const { visionComplete, isVisionConfigured } = require('./visionClient');
const { identifyReport } = require('./reportIdentity');

/**
 * Is the Summary vision top-up permitted?
 *
 * Required lazily and defensively: this module is driven by scripts and tests
 * that have no database, and a settings read that throws must not cost an import
 * whose numbers are already extracted and exact. An unreadable setting falls
 * back to the DEFAULT rather than to "allowed" — failing closed on the path that
 * decides whether a page leaves the machine.
 */
/**
 * Does page 1 have the ink-density shape of a HoloMotion cover?
 *
 * Every failure path returns `known: false`, i.e. "no opinion", which the caller
 * treats as permission. Rendering one page at low scale, a missing reference,
 * or a canvas that will not load must never become a refusal — the gate exists
 * to stop an unrelated document leaving the machine, not to stand between a
 * clinician and a real report.
 */
async function coverLooksRight(buffer) {
  try {
    const { signature, looksLikeCover } = require('./layoutFingerprint');
    const reference = require('../fixtures/coverFingerprint.json');
    const canvasLib = require('@napi-rs/canvas');
    // renderPdfPages([1]) — EXACTLY one page — not renderForExtraction, which
    // renders the whole data section (VISION_MAX_PAGES, default 6) and captions
    // it. Measured: the extraction form did not return within ten minutes on a
    // 51-page document, while this returns in seconds. A gate that costs more
    // than the call it is preventing is not a gate.
    //
    // Scale 1 for the same reason: the signature is a 16×16 grid, so anything
    // larger is rendered and thrown away.
    const { renderPdfPages } = require('./pdfRender');
    const [page] = await renderPdfPages(buffer, [1], 1);
    if (!page || !page.base64) return { known: false, relevant: true };
    const image = await canvasLib.loadImage(Buffer.from(page.base64, 'base64'));
    return looksLikeCover(signature(image, canvasLib), reference.signature);
  } catch (err) {
    console.error('[extract] cover fingerprint unavailable, allowing:', err.message);
    return { known: false, relevant: true, why: err.message };
  }
}

async function summaryTopUpAllowed() {
  try {
    const { getSettings } = require('./settings');
    const s = await getSettings();
    return Boolean(s.summary_vision_topup);
  } catch {
    return false;
  }
}
const { extractFromTextLayer } = require('./textLayerExtract');
const { recoverSummary } = require('./summaryRecover');
const { expose } = require('./httpError');

// The model is asked to return exactly this shape. Keys mirror the HoloMotion
// report SECTION HEADINGS (not page numbers) so the target is unambiguous
// regardless of which page each section falls on — the report has more than one
// page layout (see pdfRender). Every value appears exactly once in the report.
const EXTRACTION_PROMPT = `The images are the leading pages of one HoloMotion "Report of Physical Quality and Exercise Risks". Find each value below by its SECTION HEADING (it may be on any of the pages). Every value appears exactly once. Scores are the large number printed inside a circular gauge or circle.
Respond with ONLY this JSON object — no prose, no markdown fences:

{
  "name": string,                      // "Information" section "Name"
  "age": number|null,                  // "Age"
  "gender": "Male"|"Female"|null,      // map 男=Male, 女=Female
  "assessedAt": string|null,           // the "time" value, ISO if possible
  "totalScore": number|null,           // "Total Score" gauge (top of page 1)
  "exerciseRisks": number|null,        // "Exercise Risks" gauge (the number, not the wording)
  "rom": number|null,                  // "Risk Screening Results": ROM gauge
  "stability": number|null,            // "Risk Screening Results": Stability gauge
  "symmetry": number|null,             // "Risk Screening Results": Symmetry gauge
  "summary": string|null,              // "Summary" section: the full comment text, verbatim (join the numbered points with spaces)
  "exerciseRiskScores": {              // "Exercise Risk Evaluation": the eight circles (integers)
    "neckPain": number|null,
    "shoulderPain": number|null,
    "scoliosis": number|null,
    "lumbarDiscHerniation": number|null,
    "anteriorPelvicTilt": number|null,
    "jointPain": number|null,
    "ligamentStrain": number|null,
    "ankleSprain": number|null
  },
  "subitems": {                        // "Physical Fitness Subitem Score" table: 5 rows x (ROM L, ROM R, Stability L, Stability R, Symmetry)
    "neck":        { "romL": number|null, "romR": number|null, "stabL": number|null, "stabR": number|null, "sym": number|null },
    "shoulder":    { "romL": number|null, "romR": number|null, "stabL": number|null, "stabR": number|null, "sym": number|null },  // "Shoulder and Upper Limbs" row
    "torso":       { "romL": number|null, "romR": number|null, "stabL": number|null, "stabR": number|null, "sym": number|null },
    "pelvis":      { "romL": number|null, "romR": number|null, "stabL": number|null, "stabR": number|null, "sym": number|null },
    "lowerLimbs":  { "romL": number|null, "romR": number|null, "stabL": number|null, "stabR": number|null, "sym": number|null }
  },
  "myodynamiaDeficiency": [ { "muscle": string, "side": "L"|"R"|"B" } ],  // "Muscle Imbalance": Myodynamia Deficiency list
  "muscleTension":        [ { "muscle": string, "side": "L"|"R"|"B" } ]   // "Muscle Imbalance": Muscle Tension list
}

For each muscle line like "gluteus maximus R", muscle="gluteus maximus", side="R".
A line with no L/R suffix is side "B". Copy muscle names exactly as printed.
Use null for any value you cannot read; never guess.`;

// Strip markdown fences / surrounding prose and parse the first JSON object.
function parseJsonReply(text) {
  if (!text) throw expose(new Error('Empty response from vision model'), 502);
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw expose(new Error('No JSON object in vision response'), 502);
  return JSON.parse(s.slice(start, end + 1));
}

const { toNum: num } = require('./num');

// Normalise a muscle list into the MuscleFlag shape, dropping unusable rows.
// Muscle names are Title-Cased because the HoloMotion report prints them
// lowercase ("gluteus maximus") while the body-map component and the rest of
// the muscle-flag vocabulary match on Title Case ("Gluteus Maximus").
const titleCase = (s) => s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

function normaliseMuscles(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((m) => ({
      muscle: titleCase(String(m?.muscle ?? '').trim()),
      side: ['L', 'R', 'B'].includes(m?.side) ? m.side : 'B',
    }))
    .filter((m) => m.muscle.length > 0);
}

const SUBITEM_REGIONS = ['neck', 'shoulder', 'torso', 'pelvis', 'lowerLimbs'];
const SUBITEM_METRICS = ['romL', 'romR', 'stabL', 'stabR', 'sym'];

// Coerce the subitem table into a clean { region: { metric: number|null } }.
// Returns null when nothing usable was extracted (older reports / read miss).
function normaliseSubitems(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  let any = false;
  for (const region of SUBITEM_REGIONS) {
    const src = raw[region] || {};
    const row = {};
    for (const metric of SUBITEM_METRICS) {
      const v = num(src[metric]);
      row[metric] = v;
      if (v !== null) any = true;
    }
    out[region] = row;
  }
  return any ? out : null;
}

// Map the extracted JSON onto the flat Athlete columns. Mechanism notes:
//   - totalScore     → overallActivityScore (0-100 conditioning composite)
//   - exerciseRisks  → injuryRiskIndex (heaviest input to computeVulnerability)
//   - rom            → mobility
//   - ligamentStrain → kneeInjuryRisk (closest knee-region mapping; documented)
//   - anteriorPelvicTilt → lumbarPelvisInjury (lumbo-pelvic region)
function mapToAthlete(extracted) {
  const e = extracted || {};
  const r = e.exerciseRiskScores || {};
  return {
    athlete: {
      name: e.name ? String(e.name).trim() : undefined,
      age: num(e.age) ?? undefined,
      gender: e.gender === 'Male' || e.gender === 'Female' ? e.gender : undefined,
      overallActivityScore: num(e.totalScore) ?? undefined,
      injuryRiskIndex: num(e.exerciseRisks) ?? undefined,
      mobility: num(e.rom) ?? undefined,
      stability: num(e.stability) ?? undefined,
      symmetry: num(e.symmetry) ?? undefined,
      neckInjuryRisk: num(r.neckPain) ?? undefined,
      shoulderInjuryRisk: num(r.shoulderPain) ?? undefined,
      scoliosis: num(r.scoliosis) ?? undefined,
      spinalDiscHerniation: num(r.lumbarDiscHerniation) ?? undefined,
      lumbarPelvisInjury: num(r.anteriorPelvicTilt) ?? undefined,
      jointPain: num(r.jointPain) ?? undefined,
      kneeInjuryRisk: num(r.ligamentStrain) ?? undefined,
      ankleInjuryRisk: num(r.ankleSprain) ?? undefined,
    },
    myodynamia: normaliseMuscles(e.myodynamiaDeficiency),
    tension: normaliseMuscles(e.muscleTension),
    assessedAt: e.assessedAt || null,
    // Screening-snapshot extras (stored on the screenings table, not the flat
    // athletes row). Null-safe when a section is unread / absent.
    summary: e.summary ? String(e.summary).trim() : null,
    subitems: normaliseSubitems(e.subitems),
  };
}

const { prescriptionFromPdf } = require('./prescription');

// Full pipeline: PDF buffer → mapped Athlete payload (+ screening extras + raw).
// Sends the first N full pages of the report (layout-robust — see pdfRender).
/**
 * HoloMotion's written Summary, and nothing else, from page 1.
 *
 * The text-layer path reads every NUMBER exactly and cannot read the Summary at
 * all: the report letter-spaces it and the word boundaries are not recoverable
 * (see utils/textLayerExtract.js). §70 reproduces that text verbatim as the
 * instrument's own verdict, so dropping it would trade a real clinical surface
 * for a saving — which is not the deal.
 *
 * So the model is still asked, but for ONE page instead of six: ~1,500 image
 * tokens against ~9,300. It reuses EXTRACTION_PROMPT and parseJsonReply rather
 * than introducing a second prompt — a summary-only prompt would be a second
 * vocabulary for the same document, and the fields it returns for the pages it
 * cannot see are simply ignored.
 *
 * Page 1 is also the page carrying the name, so redaction still runs on it
 * exactly as before — renderForExtraction does that unconditionally.
 */
async function summaryFromPage1(buffer, reserve) {
  const images = await renderForExtraction(buffer, undefined, 1);
  // Nothing rendered means nothing was SENT, so nothing is chargeable.
  if (!images.length) return { summary: null, usage: null, providerCalls: 0 };
  // CLAIM THE CALL BEFORE MAKING IT (§115.6). Refused means the caller is out of
  // quota: the numbers are already read and exact, so the report still imports —
  // it loses the Summary, which is the same degradation as having no provider
  // configured at all, and §70's renderer already handles its absence.
  if (reserve && !(await reserve())) return { summary: null, usage: null, providerCalls: 0, refused: true };
  const { text, usage } = await visionComplete(EXTRACTION_PROMPT, images);
  // PAST THIS LINE THE CALL HAS HAPPENED and the allowance is spent, so nothing
  // below may throw its way out of the accounting. A malformed reply is a lost
  // Summary, not a free call — and `parseJsonReply` throwing is exactly how a
  // caller would otherwise get one.
  let summary = null;
  try {
    const extracted = parseJsonReply(text);
    summary = extracted && extracted.summary ? String(extracted.summary).trim() : null;
  } catch (err) {
    console.error('[extract] summary reply unparseable:', err.message);
  }
  return {
    summary: summary || null,
    usage: usage || null,
    pagesRead: images.map((i) => i.page),
    // COUNTED, not inferred from `usage`. A provider that returns no usage
    // block would otherwise read as a free call, and the quota cap must never
    // under-count the thing it meters (utils/visionThrottle.js).
    providerCalls: 1,
  };
}

async function extractFromPdf(buffer, { reserveProviderCall } = {}) {
  // THE FAST PATH: read the report rather than look at it (2026-09-22, §112).
  //
  // Tried FIRST and gated on its own answer. `{ ok: false }` means the compact
  // layout, which carries no text at all and always needs the model — so this
  // is a fast path with a fallback, never a replacement.
  const fast = await extractFromTextLayer(buffer).catch((err) => {
    // A reader that throws must not cost the operator their import. Fall
    // through to vision, which is what would have happened anyway.
    console.error('[extract] text-layer read failed, using vision:', err.message);
    return { ok: false, reason: 'text-layer-error' };
  });

  // VISION IS A FALLBACK FOR AN UNREADABLE REPORT, NOT FOR AN UNREADABLE FILE
  // (2026-09-30). `extractFromTextLayer` returns two different refusals and this
  // caller used to collapse them, which is how a 51-page university report was
  // accepted, rendered and SENT TO GEMINI — measured, one provider call, an
  // arbitrary document off the machine.
  //
  //   no-text-layer          the compact layout. Nothing local left to read, so
  //                          vision is the only path. Falls through below.
  //   text-layer-incomplete  text IS present. Ask whether it is a HoloMotion
  //                          report before spending anything on it.
  //
  // Refused here rather than after the render: the point is that nothing leaves
  // the machine, so the decision has to precede the transmission.
  // THE NO-TEXT CASE, which reportIdentity cannot speak for (2026-09-30).
  //
  // At 0 characters there is nothing to read, so a scanned document or a
  // photographed page used to reach the model unchallenged — the same hole as
  // the university report, just entered a different way. The compact HoloMotion
  // layout is a fixed template, so the question "is this page even that shape?"
  // is answerable locally from an ink-density signature. See layoutFingerprint:
  // a perceptual hash was tried first and measured a ONE-BIT margin.
  //
  // Refuses only at 2.6x the worst distance any real report has measured, and
  // fails OPEN if the render or the reference is unavailable: a clinician
  // blocked from importing a real screening is a worse outcome than one provider
  // call on a document that was being sent anyway before this existed.
  if (!fast.ok && fast.reason === 'no-text-layer') {
    const verdict = await coverLooksRight(buffer);
    if (verdict.known && !verdict.relevant) {
      const err = new Error(
        'This PDF has no readable text and does not look like a HoloMotion '
        + `screening report (${verdict.why}). Nothing was sent to the extraction `
        + 'service. Check the file, or import the report exported by HoloMotion.',
      );
      err.status = 422;
      err.expose = true;
      throw err;
    }
  }

  if (!fast.ok && fast.reason === 'text-layer-incomplete') {
    const id = identifyReport({ text: fast.text, missing: fast.missing });
    if (!id.relevant) {
      const err = new Error(
        'This PDF does not look like a HoloMotion screening report '
        + `(${id.why}). Nothing was sent to the extraction service. `
        + 'Check the file, or import the report exported by HoloMotion.',
      );
      err.status = 422;
      err.expose = true;   // the operator needs to read this one (§48)
      throw err;
    }
  }

  if (fast.ok) {
    let summary = null;
    let usage = null;
    let summaryPages = [];
    let summaryMethod = null;
    // How many times a provider was actually called. On an expanded report with
    // a recoverable Summary this stays 0 — measured on the three demo reports
    // and on nazwan.pdf (DD 112.8) — which is what the quota cap now counts.
    let providerCalls = 0;

    // READ THE SUMMARY BEFORE PAYING FOR IT (§114).
    //
    // The numbers already came from the text layer; this was the last thing on
    // an expanded report that still needed the model, and it needed it only
    // because pdfjs collapses a letter-spaced run into one item with the word
    // boundaries already lost. A per-glyph engine keeps them.
    //
    // Tried FIRST and silently: a failure here is not an error, it is the
    // ordinary case for any report this technique cannot read, and the vision
    // top-up below is exactly what ran before. Ordering matters — attempting
    // this after a successful model call would spend the tokens anyway.
    const recovered = recoverSummary(buffer);
    if (recovered.ok) {
      summary = recovered.summary;
      summaryMethod = 'text-layer';
    }

    // GOVERNED BY THE INSTITUTION, DEFAULT OFF (2026-09-30).
    //
    // This is the one path that spends a provider call on a report the text
    // layer already read — the single exception to §112's "the PDF never leaves
    // the machine", and it was both invisible and un-opt-out-able. The setting
    // makes it a decision somebody took rather than a surprise, and off by
    // default makes the zero-provider guarantee true without an asterisk.
    //
    // Read from settings rather than an env var so it sits with the other
    // institution switches on the admin page, and so the answer is the same for
    // every deployment of the same build.
    const allowTopUp = await summaryTopUpAllowed();
    if (!summary && !allowTopUp) summaryMethod = 'declined:setting';

    if (!summary && allowTopUp && isVisionConfigured()) {
      try {
        const top = await summaryFromPage1(buffer, reserveProviderCall);
        summary = top.summary;
        usage = top.usage;
        summaryPages = top.pagesRead || [];
        summaryMethod = summary ? 'vision' : null;
        // Charged even when the reply carried no summary: the call was made and
        // the quota was spent. Metering what was SENT rather than what came
        // back is the only version that bounds the allowance.
        providerCalls += top.providerCalls || 0;
      } catch (err) {
        // The numbers are already read and exact. Losing the Summary is a
        // missing section, which §70's renderer already handles — losing the
        // import would be worse.
        console.error('[extract] summary top-up failed:', err.message);
      }
    }
    let prescription = null;
    try {
      prescription = await prescriptionFromPdf(buffer);
    } catch (err) {
      console.error('[extract] prescription parse failed:', err.message);
    }
    return {
      athlete: fast.athlete,
      myodynamia: fast.myodynamia,
      tension: fast.tension,
      assessedAt: fast.assessedAt,
      summary,
      // Through the SAME normaliser the vision path uses, so the two producers
      // cannot hand the commit route two different shapes for one document —
      // it fills every region and metric, nulling what is absent, and returns
      // null when nothing was read at all.
      subitems: normaliseSubitems(fast.subitems),
      raw: { method: 'text-layer', textLayerChars: fast.textLayerChars },
      // Carried for the route to match on, and stripped there.
      readName: fast.readName || null,
      method: 'text-layer',
      // WHICH producer the Summary came from. §70 reproduces it verbatim as the
      // instrument's own verdict, so "read from the glyphs" and "read by a
      // model" are different provenance and are distinguishable after the fact
      // rather than merged into one field nobody can audit.
      summaryMethod,
      prescription,
      pagesRead: summaryPages,
      usage,
      providerCalls,
    };
  }

  // THE ONLY POINT AT WHICH A VISION PROVIDER IS ACTUALLY REQUIRED.
  //
  // Checked here rather than at the route, because only here is it known that
  // this particular report cannot be read. The route used to refuse every
  // import when no key was set, which since §112 refuses work that needs no key
  // at all.
  //
  // The message names what went wrong WITH THIS FILE. "PDF ingestion is not
  // configured" told an operator holding a perfectly readable 38-page report
  // that the feature was off, which was both discouraging and untrue.
  if (!isVisionConfigured()) {
    throw expose(new Error(
      'This report carries no readable text layer — the compact 12-page HoloMotion '
      + 'layout is rendered graphics — so it needs a vision provider to be read. '
      + 'Set VISION_API_KEY and VISION_MODEL in the backend environment. Reports in '
      + 'the expanded 28- and 38-page layouts are read directly and need no provider.',
    ), 503);
  }
  const images = await renderForExtraction(buffer);
  if (!images.length) throw expose(new Error('Could not render any pages from the PDF'), 502);
  // CLAIM THE CALL BEFORE MAKING IT (§115.6). Unlike the Summary top-up there is
  // no degraded result to fall back on here — this layout carries no text at all
  // — so being out of quota is a refusal, and it is a 429 rather than a 503
  // because the cause is this caller's own rate of use.
  if (reserveProviderCall && !(await reserveProviderCall())) {
    throw expose(new Error(
      'Too many screening extractions in the last hour. This report is the compact '
      + '12-page layout, which has no text to read and so needs the vision provider. '
      + 'Wait a few minutes and continue the batch — reports already committed are unaffected.',
    ), 429);
  }
  const { text, usage } = await visionComplete(EXTRACTION_PROMPT, images);
  const extracted = parseJsonReply(text);
  const mapped = mapToAthlete(extracted);
  // `usage` answers "what does one report cost to ingest?" — carried through to
  // the preview response so the operator sees it per file, and logged.
  // The training prescription rides along from the PDF's TEXT layer — no model,
  // no tokens, no extra pages sent anywhere. It is read after the vision call so
  // a failure here cannot cost the operator the extraction they paid for.
  let prescription = null;
  try {
    prescription = await prescriptionFromPdf(buffer);
  } catch (err) {
    console.error('[extract] prescription parse failed:', err.message);
  }

  return {
    ...mapped,
    raw: extracted,
    // Which reader produced this. Carried to the preview response so the
    // operator — and the Activity Log — can tell an exact read from a
    // model-read one, rather than the two being indistinguishable after the
    // fact.
    method: 'vision',
    prescription,
    pagesRead: images.map((i) => i.page),
    usage: usage || null,
    // The compact layout: one call, always. This is the case the quota cap was
    // written for and the only one that still spends the allowance. The trailing
    // comment makes this line unique in the file, so the mutation registry can
    // target it on ONE line — `providerCalls: 1` alone also matches
    // summaryFromPage1 above.
    providerCalls: 1, // the compact layout always costs exactly one
  };
}

module.exports = { extractFromPdf, mapToAthlete, parseJsonReply, EXTRACTION_PROMPT };
