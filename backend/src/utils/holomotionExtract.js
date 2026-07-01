// Turns a HoloMotion screening PDF into an Athlete payload via a vision model.
//
// Flow: render data pages → ask the model for strict JSON → map the JSON onto
// the flat Athlete columns + muscle_flags rows the rest of the system expects.
//
// Fields the report does NOT contain (athleteId, sport, program, weight,
// height) are left undefined here; the upload route merges them from operator
// input at commit time. This module only extracts what is actually on the page.

const { renderPdfPages } = require('./pdfRender');
const { visionComplete } = require('./visionClient');

// The model is asked to return exactly this shape. Keys mirror the HoloMotion
// report labels so the model has an unambiguous target; mapping to DB columns
// happens in mapToAthlete() below.
const EXTRACTION_PROMPT = `You are reading a HoloMotion "Report of Physical Quality and Exercise Risks".
Extract the following fields and respond with ONLY a JSON object, no prose, no markdown fences.

{
  "name": string,                      // from "Name"
  "age": number|null,                  // from "Age"
  "gender": "Male"|"Female"|null,      // map 男=Male, 女=Female
  "assessedAt": string|null,           // the "time" value, ISO if possible
  "totalScore": number|null,           // the "Total Score" gauge (0-100)
  "exerciseRisks": number|null,        // the "Exercise Risks" gauge
  "rom": number|null,                  // Risk Screening Results: ROM gauge
  "stability": number|null,            // Risk Screening Results: Stability gauge
  "symmetry": number|null,             // Risk Screening Results: Symmetry gauge
  "exerciseRiskScores": {              // "Exercise Risk Evaluation" circles (integers)
    "neckPain": number|null,
    "shoulderPain": number|null,
    "scoliosis": number|null,
    "lumbarDiscHerniation": number|null,
    "anteriorPelvicTilt": number|null,
    "jointPain": number|null,
    "ligamentStrain": number|null,
    "ankleSprain": number|null
  },
  "myodynamiaDeficiency": [ { "muscle": string, "side": "L"|"R"|"B" } ],  // "Myodynamia Deficiency" list
  "muscleTension":        [ { "muscle": string, "side": "L"|"R"|"B" } ]   // "Muscle Tension" list
}

For each muscle line like "gluteus maximus R", muscle="gluteus maximus", side="R".
A line with no L/R suffix is side "B". Use null for any value you cannot read.`;

// Strip markdown fences / surrounding prose and parse the first JSON object.
function parseJsonReply(text) {
  if (!text) throw new Error('Empty response from vision model');
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in vision response');
  return JSON.parse(s.slice(start, end + 1));
}

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Normalise a muscle list into the MuscleFlag shape, dropping unusable rows.
function normaliseMuscles(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((m) => ({
      muscle: String(m?.muscle ?? '').trim(),
      side: ['L', 'R', 'B'].includes(m?.side) ? m.side : 'B',
    }))
    .filter((m) => m.muscle.length > 0);
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
  };
}

// Full pipeline: PDF buffer → mapped Athlete payload (+ raw extraction for UI).
async function extractFromPdf(buffer) {
  const images = await renderPdfPages(buffer);
  if (!images.length) throw new Error('Could not render any pages from the PDF');
  const reply = await visionComplete(EXTRACTION_PROMPT, images);
  const extracted = parseJsonReply(reply);
  const mapped = mapToAthlete(extracted);
  return { ...mapped, raw: extracted, pagesRead: images.map((i) => i.page) };
}

module.exports = { extractFromPdf, mapToAthlete, parseJsonReply, EXTRACTION_PROMPT };
