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
const { extractFromTextLayer } = require('./textLayerExtract');
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
async function summaryFromPage1(buffer) {
  const images = await renderForExtraction(buffer, undefined, 1);
  if (!images.length) return { summary: null, usage: null };
  const { text, usage } = await visionComplete(EXTRACTION_PROMPT, images);
  const extracted = parseJsonReply(text);
  const summary = extracted && extracted.summary ? String(extracted.summary).trim() : null;
  return { summary: summary || null, usage: usage || null, pagesRead: images.map((i) => i.page) };
}

async function extractFromPdf(buffer) {
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

  if (fast.ok) {
    let summary = null;
    let usage = null;
    let summaryPages = [];
    if (isVisionConfigured()) {
      try {
        const top = await summaryFromPage1(buffer);
        summary = top.summary;
        usage = top.usage;
        summaryPages = top.pagesRead || [];
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
      method: 'text-layer',
      prescription,
      pagesRead: summaryPages,
      usage,
    };
  }

  const images = await renderForExtraction(buffer);
  if (!images.length) throw expose(new Error('Could not render any pages from the PDF'), 502);
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
  };
}

module.exports = { extractFromPdf, mapToAthlete, parseJsonReply, EXTRACTION_PROMPT };
