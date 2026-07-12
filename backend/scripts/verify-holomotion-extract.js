// Ground-truth verification for the HoloMotion vision-ingestion pipeline.
//
// The seeder plants ATH0061 (Thung Jin Seng) transcribed 1:1 from the sample
// HoloMotion PDF. This script runs the real extraction pipeline against that
// PDF and diffs every field the system persists against the known values —
// a correct end-to-end run must reproduce the seeded row exactly.
//
// Usage (from backend/):
//   node scripts/verify-holomotion-extract.js <path-to-sample.pdf>
//   node scripts/verify-holomotion-extract.js --json <extraction.json>
//
// The --json form diffs a previously saved extraction payload (e.g. copied
// from the upload preview response) without calling the vision API — useful
// for re-checking without spending a request.
//
// Requires VISION_API_KEY + VISION_MODEL in backend/.env for the PDF form.
// Works with any supported provider — e.g. Gemini via its OpenAI-compatible
// endpoint (see CLAUDE.md env reference).

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');

const { extractFromPdf, mapToAthlete } = require('../src/utils/holomotionExtract');
const { isVisionConfigured, visionConfig } = require('../src/utils/visionClient');

// ── Ground truth: the sample report's printed values (= seeder ATH0061) ─────
const EXPECTED = {
  athlete: {
    name: 'thung jin seng',        // compared case-insensitively
    age: 51,
    gender: 'Male',
    overallActivityScore: 77,      // Total Score gauge
    injuryRiskIndex: 12,           // Exercise Risks gauge
    mobility: 88,                  // ROM
    stability: 72,
    symmetry: 75,
    neckInjuryRisk: 23,
    shoulderInjuryRisk: 11,
    scoliosis: 11,
    spinalDiscHerniation: 17,
    lumbarPelvisInjury: 17,
    jointPain: 3,
    kneeInjuryRisk: 18,
    ankleInjuryRisk: 19,
  },
  myodynamia: [
    { muscle: 'Sartorius', side: 'R' },
    { muscle: 'Gluteus Maximus', side: 'L' },
    { muscle: 'Gluteus Maximus', side: 'R' },
  ],
  tension: [
    { muscle: 'Biceps Brachii', side: 'L' },
    { muscle: 'Pectoralis Major', side: 'R' },
    { muscle: 'Pectoralis Major', side: 'L' },
  ],
};

function normName(s) { return String(s ?? '').trim().toLowerCase(); }
function muscleKey(m) { return `${normName(m.muscle)}|${m.side}`; }

function compare(mapped) {
  const rows = [];
  let failures = 0;
  const check = (field, got, want, ok) => {
    if (!ok) failures++;
    rows.push({ field, expected: String(want), got: String(got), result: ok ? 'PASS' : 'FAIL' });
  };

  const a = mapped.athlete ?? {};
  check('name', a.name, EXPECTED.athlete.name, normName(a.name) === EXPECTED.athlete.name);
  for (const key of Object.keys(EXPECTED.athlete)) {
    if (key === 'name') continue;
    const want = EXPECTED.athlete[key];
    const got = key in a ? a[key] : (mapped.athlete?.[key]);
    check(key, got, want, Number(got) === Number(want) || String(got) === String(want));
  }

  for (const [listName, wantList] of [['myodynamia', EXPECTED.myodynamia], ['tension', EXPECTED.tension]]) {
    const gotList = mapped[listName] ?? [];
    const gotSet = new Set(gotList.map(muscleKey));
    const wantSet = new Set(wantList.map(muscleKey));
    const missing = wantList.filter((m) => !gotSet.has(muscleKey(m))).map((m) => `${m.muscle} ${m.side}`);
    const extra = gotList.filter((m) => !wantSet.has(muscleKey(m))).map((m) => `${m.muscle} ${m.side}`);
    check(
      `${listName} (${wantList.length} entries)`,
      extra.length ? `extra: ${extra.join(', ')}` : `${gotList.length} entries`,
      missing.length ? `missing: ${missing.join(', ')}` : 'all present',
      missing.length === 0 && extra.length === 0,
    );
  }
  return { rows, failures };
}

function printReport({ rows, failures }) {
  const w = Math.max(...rows.map((r) => r.field.length));
  console.log('\nField'.padEnd(w + 3) + 'Expected'.padEnd(18) + 'Got'.padEnd(18) + 'Result');
  console.log('─'.repeat(w + 50));
  for (const r of rows) {
    console.log(
      `  ${r.field.padEnd(w + 1)}${r.expected.padEnd(18)}${r.got.padEnd(18)}${r.result === 'PASS' ? '✓ PASS' : '✗ FAIL'}`,
    );
  }
  console.log('─'.repeat(w + 50));
  if (failures === 0) {
    console.log('\n✓ GROUND TRUTH REPRODUCED — the pipeline reads the report exactly as seeded (ATH0061).');
  } else {
    console.log(`\n✗ ${failures} field(s) diverge from ground truth.`);
    console.log('  Troubleshooting: try VISION_FULL_PAGES=1 (rules out a crop-band miss),');
    console.log('  a stronger VISION_MODEL, or inspect the raw JSON with --json after a UI preview.');
  }
  return failures === 0;
}

(async () => {
  const args = process.argv.slice(2);

  if (args[0] === '--json') {
    if (!args[1] || !fs.existsSync(args[1])) {
      console.error('Usage: node scripts/verify-holomotion-extract.js --json <extraction.json>');
      process.exit(2);
    }
    const raw = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    // Accept either the raw model extraction or the mapped payload.
    const mapped = raw.athlete ? raw : mapToAthlete(raw);
    process.exit(printReport(compare(mapped)) ? 0 : 1);
  }

  const pdfPath = args[0];
  if (!pdfPath || !fs.existsSync(pdfPath)) {
    console.error('Usage: node scripts/verify-holomotion-extract.js <path-to-sample.pdf>');
    console.error('   or: node scripts/verify-holomotion-extract.js --json <extraction.json>');
    process.exit(2);
  }
  if (!isVisionConfigured()) {
    console.error('Vision provider not configured — set VISION_API_KEY and VISION_MODEL in backend/.env.');
    console.error('Example (Gemini free tier via its OpenAI-compatible endpoint):');
    console.error('  VISION_PROVIDER=openai');
    console.error('  VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai');
    console.error('  VISION_MODEL=gemini-2.0-flash');
    console.error('  VISION_API_KEY=<AI Studio key>');
    process.exit(2);
  }

  const cfg = visionConfig();
  console.log(`Extracting via ${cfg.provider} · ${cfg.model} · ${cfg.baseUrl}`);
  const t0 = Date.now();
  const result = await extractFromPdf(fs.readFileSync(pdfPath));
  console.log(`Extraction completed in ${((Date.now() - t0) / 1000).toFixed(1)}s (pages ${result.pagesRead.join(', ')})`);
  process.exit(printReport(compare(result)) ? 0 : 1);
})().catch((err) => {
  console.error(`\nExtraction failed: ${err.message}`);
  process.exit(1);
});
