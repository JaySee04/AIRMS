// Ground-truth verification for the HoloMotion vision-ingestion pipeline.
//
// Two real reports are transcribed 1:1 below as ground truth (both also seeded):
//   - ATH0061 Thung Jin Seng — the original sample, a COMPACT ~3-page layout.
//   - ATH0062 Muhammad Nazwan Bin Abdullah — an EXPANDED layout whose data
//     section spans pages 1-6 (Info+Summary p1, Muscle Imbalance p3, Posture
//     p4, Risk Screening + Subitems p5, Exercise Risk Evaluation p6; pages
//     7-38 are image analysis / trajectory / prescription, not extracted).
// Together they exercise BOTH known layouts. The script picks the matching
// ground truth by the extracted name, so it works against either PDF.
//
// This script runs the real extraction pipeline against a PDF and diffs every
// persisted field against the known values — a correct end-to-end run must
// reproduce the seeded row exactly.
//
// Usage (from backend/):
//   node scripts/verify-holomotion-extract.js <path-to-report.pdf>
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

// ── Ground truth: each report's printed values (= the seeded rows) ──────────
// Keyed by lower-cased printed name so the right set is chosen automatically.
// subitems: region → [ROM-L, ROM-R, Stability-L, Stability-R, Symmetry].
const GROUND_TRUTH = {
  'thung jin seng': {
    athlete: {
      name: 'thung jin seng', age: 51, gender: 'Male',
      overallActivityScore: 77, injuryRiskIndex: 12,
      mobility: 88, stability: 72, symmetry: 75,
      neckInjuryRisk: 23, shoulderInjuryRisk: 11, scoliosis: 11,
      spinalDiscHerniation: 17, lumbarPelvisInjury: 17, jointPain: 3,
      kneeInjuryRisk: 18, ankleInjuryRisk: 19,
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
    subitems: {
      neck: [95, 62, 81, 60, 58],
      shoulder: [86, 90, 59, 57, 77],
      torso: [96, 85, 84, 82, 78],
      pelvis: [89, 85, 60, 78, 68],
      lowerLimbs: [90, 90, 72, 74, 92],
    },
  },
  // Verified 1:1 against the full 38-page report (2025-08-13). The report
  // prints Exercise Risk labels that AIRMS maps: Anterior pelvic tilt →
  // lumbarPelvisInjury, Ligament Strain → kneeInjuryRisk, Lumbar Disc
  // Herniation → spinalDiscHerniation (stored, never displayed).
  'muhammad nazwan bin abdullah': {
    athlete: {
      name: 'muhammad nazwan bin abdullah', age: 21, gender: 'Male',
      overallActivityScore: 78, injuryRiskIndex: 14,
      mobility: 71, stability: 82, symmetry: 88,
      neckInjuryRisk: 14, shoulderInjuryRisk: 8, scoliosis: 12,
      spinalDiscHerniation: 16, lumbarPelvisInjury: 16, jointPain: 15,
      kneeInjuryRisk: 21, ankleInjuryRisk: 26,
    },
    myodynamia: [
      { muscle: 'Gluteus Medius', side: 'L' },
      { muscle: 'Piriformis', side: 'L' },
      { muscle: 'Piriformis', side: 'R' },
    ],
    tension: [
      { muscle: 'Gluteus Maximus', side: 'L' },
      { muscle: 'Gluteus Maximus', side: 'R' },
      { muscle: 'Iliopsoas', side: 'L' },
    ],
    subitems: {
      neck: [83, 72, 76, 76, 83],
      shoulder: [89, 85, 84, 82, 89],
      torso: [70, 67, 87, 89, 90],
      pelvis: [62, 71, 76, 82, 86],
      lowerLimbs: [66, 68, 76, 79, 91],
    },
  },
};

// Pick the ground-truth set matching the extracted name; default to Thung
// (keeps the bare --json path working when a name isn't present).
function groundTruthFor(mapped) {
  const name = String(mapped?.athlete?.name ?? '').trim().toLowerCase();
  return GROUND_TRUTH[name] || GROUND_TRUTH['thung jin seng'];
}

function normName(s) { return String(s ?? '').trim().toLowerCase(); }
function muscleKey(m) { return `${normName(m.muscle)}|${m.side}`; }

function compare(mapped) {
  const EXPECTED = groundTruthFor(mapped);
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

  // Subitem scores (25 values). Compares each region's [romL,romR,stabL,stabR,sym].
  const METRICS = ['romL', 'romR', 'stabL', 'stabR', 'sym'];
  const gotSub = mapped.subitems || {};
  for (const [region, wantArr] of Object.entries(EXPECTED.subitems)) {
    const row = gotSub[region] || {};
    const gotArr = METRICS.map((m) => (row[m] == null ? null : Number(row[m])));
    const ok = wantArr.every((v, i) => gotArr[i] === v);
    check(`subitem ${region}`, `[${gotArr.join(',')}]`, `[${wantArr.join(',')}]`, ok);
  }

  // Summary: presence check (wording varies, so we verify the section was read,
  // not an exact string). Posture is no longer extracted (removed 2026-08-01 —
  // not required by the stakeholder), so it's no longer verified here.
  check('summary read', mapped.summary ? `${mapped.summary.length} chars` : 'empty', 'non-empty', Boolean(mapped.summary && mapped.summary.length > 20));

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
    console.log('\n✓ GROUND TRUTH REPRODUCED — the pipeline reads the report exactly as seeded.');
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
    console.error('  VISION_MODEL=gemini-flash-lite-latest');
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
