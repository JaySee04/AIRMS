// Verify the text-layer extractor and the privacy contract against a fixture
// that needs no real athlete — so this check can run in CI and on a fresh clone.
//
//   cd backend; npm run verify:fixture
//   cd backend; npm run verify:fixture -- --canary     (prove it can fail)
//
// WHY A SECOND VERIFIER. verify-textlayer-extract.js shells out to
// verify-holomotion-extract.js, which owns the ground truth for the two REAL
// reports. It cannot score this fixture, and teaching it to would give it two
// notions of "correct" — the shape that let two guards agree while both were
// wrong (SILENT_FAILURES 3l/3n/3o/3p). So this scores the fixture and nothing
// else, and the real-report path is untouched and remains the authority.
//
// ONE SOURCE FOR THE EXPECTED VALUES. `make-synthetic-report.js` writes both the
// PDF and `synthetic-report.truth.json`; this reads the JSON. Neither file holds
// a second copy of the numbers, so the drawn value and the expected value cannot
// drift apart — which is the whole failure mode of a hand-written fixture.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT.
//   proves: the parsers read the layout they are aimed at — both headline
//           scores, the three movement components, all 8 indicators including
//           LDH, all 25 subitem cells, 6 muscle flags with sides, cover fields;
//           and that the athlete's NAME IS ABSENT from the payload.
//   does not prove: that the layout assumption still matches what HoloMotion
//           actually prints. Only nazwan.pdf can say that. If the instrument
//           changes its export, this fixture keeps passing and nazwan.pdf starts
//           failing — the correct division of labour, not a gap. It also cannot
//           exercise the FULLWIDTH COLON, for the WinAnsi reason the generator
//           documents.
//
// EXIT CODES  0 all fields match · 1 a field diverges · 2 could not run
const fs = require('fs');
const path = require('path');

const FIXTURE = path.join(__dirname, 'fixtures', 'synthetic-report.pdf');
const TRUTH_JSON = path.join(__dirname, 'fixtures', 'synthetic-report.truth.json');
const CANARY = process.argv.includes('--canary');

const INDICATOR_KEY = {
  'Neck Pain': 'neckInjuryRisk',
  'Shoulder Pain': 'shoulderInjuryRisk',
  Scoliosis: 'scoliosis',
  'Anterior Pelvic Tilt': 'lumbarPelvisInjury',
  'Joint Pain': 'jointPain',
  'Ligament Strain': 'kneeInjuryRisk',
  'Ankle Sprain': 'ankleInjuryRisk',
  'Lumbar Disc Herniation': 'spinalDiscHerniation',
};
const CELLS = ['romL', 'romR', 'stabL', 'stabR', 'sym'];

(async () => {
  for (const f of [FIXTURE, TRUTH_JSON]) {
    if (!fs.existsSync(f)) {
      console.error(`missing ${path.relative(process.cwd(), f)}\nRegenerate: node scripts/make-synthetic-report.js`);
      process.exit(2);
    }
  }

  const truth = JSON.parse(fs.readFileSync(TRUTH_JSON, 'utf8'));
  const { extractFromTextLayer } = require('../src/utils/textLayerExtract');

  let buf = fs.readFileSync(FIXTURE);
  if (CANARY) {
    // THE CONTROL, and it mutates the DOCUMENT rather than the expectation.
    //
    // Editing truth.json would test the comparator's string equality and
    // nothing else. Corrupting the PDF's own content stream makes the extractor
    // read a different number, which is the thing being guarded. §112.8 records
    // the first attempt at this class of proof matching nothing and reporting
    // 330/330 green; a canary that cannot change the input is that mistake.
    // pdfkit writes text as HEX strings with kerning — `[<54> 80 <6f74...>]` —
    // so there is no literal "(18)" to find. TWO earlier attempts matched
    // nothing and reported "27/27 fields match" while announcing they had broken
    // something: first `(74)` against a Flate-compressed stream, then `(74)`
    // against the uncompressed one. The fixture is uncompressed now and the
    // needle is the hex for the digits.
    //
    // Exercise Risks (18 -> `<3138>`) rather than Total Score, because `<3734>`
    // occurs TWICE — 74 is also a subitem cell — and a canary that silently
    // changes two fields is testing something other than what it says.
    const NEEDLE = '<3138>';
    const REPLACEMENT = '<3939>';                    // same byte length: 99
    const raw = buf.toString('latin1');
    const hits = raw.split(NEEDLE).length - 1;
    if (hits !== 1) {
      console.error(`canary needle ${NEEDLE} found ${hits} times, expected exactly 1.`);
      console.error('The fixture encoding changed. Re-derive the needle before trusting this.');
      process.exit(2);
    }
    buf = Buffer.from(raw.replace(NEEDLE, REPLACEMENT), 'latin1');
    console.log(`canary: Exercise Risks 18 overwritten with 99 (${NEEDLE} -> ${REPLACEMENT})\n`);
  }

  let res;
  try {
    res = await extractFromTextLayer(buf);
  } catch (e) {
    console.error(`extractor threw: ${e.message}`);
    process.exit(2);
  }
  if (!res.ok) {
    console.error(`extractor declined the fixture: ${res.reason}`);
    console.error('If this says no-text-layer, the fixture was written without a text layer.');
    process.exit(2);
  }

  const a = res.athlete;
  const rows = [];
  const cmp = (label, expected, actual) => rows.push({ label, expected, actual, pass: String(expected) === String(actual) });

  cmp('method', 'text-layer', res.method);
  cmp('gender', truth.gender, a.gender);
  cmp('age', truth.age, a.age);
  cmp('assessedAt', truth.assessedAt, res.assessedAt);
  cmp('Total Score', truth.totalScore, a.overallActivityScore);
  cmp('Exercise Risks', truth.exerciseRisks, a.injuryRiskIndex);
  cmp('ROM', truth.rom, a.mobility);
  cmp('Stability', truth.stability, a.stability);
  cmp('Symmetry', truth.symmetry, a.symmetry);

  for (const [label, key] of Object.entries(INDICATOR_KEY)) cmp(label, truth.indicators[label], a[key]);

  for (const [region, vals] of Object.entries(truth.subitems)) {
    const got = res.subitems[region];
    cmp(`subitem ${region}`, vals.join(','), got ? CELLS.map((c) => got[c]).join(',') : 'absent');
  }

  for (const kind of ['myodynamia', 'tension']) {
    const want = truth[kind].map(([m, s]) => `${m}/${s}`).join(' ');
    const got = (res[kind] || []).map((f) => `${f.muscle}/${f.side}`).join(' ');
    cmp(kind, want, got);
  }

  // THE PRIVACY CONTRACT, and the one assertion here that is not about accuracy.
  // The text layer hands the name over in plain text; the extractor reads it (so
  // `nameFound` can report the page was understood) and must then DROP it.
  cmp('name absent from payload', '', a.name ?? '');
  cmp('name was nonetheless read', 'true', String(res.nameFound));
  // Checked on the FULL name and on each of its parts, because a payload that
  // dropped only the surname would still have leaked. Matching a single word was
  // the first version and it fired on "fixture" appearing in the Summary — a
  // false positive on the one assertion here that must never cry wolf.
  const blob = JSON.stringify(res).toLowerCase();
  const parts = [truth.name, ...truth.name.split(/\s+/)].map((s) => s.toLowerCase());
  const leaked = parts.filter((p) => p.length > 3 && blob.includes(p));
  cmp('name nowhere in payload', 'none', leaked.length ? leaked.join(',') : 'none');

  const width = Math.max(...rows.map((r) => r.label.length));
  console.log(`  ${'field'.padEnd(width)}  expected              got                   \n  ${'─'.repeat(width + 46)}`);
  for (const r of rows) {
    console.log(`  ${r.label.padEnd(width)}  ${String(r.expected).slice(0, 20).padEnd(20)}  ${String(r.actual).slice(0, 20).padEnd(20)}  ${r.pass ? '✓' : '✗ FAIL'}`);
  }

  const failed = rows.filter((r) => !r.pass);
  console.log(`\n  ${rows.length - failed.length}/${rows.length} fields match`);

  if (CANARY) {
    // Inverted verdict: the canary must be CAUGHT.
    const caught = failed.some((r) => r.label === 'Exercise Risks');
    console.log(caught
      ? '\ncanary caught — a wrong value in this fixture would be reported.'
      : '\nCANARY NOT CAUGHT — the comparator did not notice Total Score changing.\nDo not trust a clean run.');
    process.exit(caught ? 0 : 1);
  }

  if (failed.length) {
    console.log('\nRegenerate the fixture if the layout contract changed:');
    console.log('  node scripts/make-synthetic-report.js');
    process.exit(1);
  }
  console.log('\n  Run with --canary before trusting this: a clean result and a');
  console.log('  broken comparator look identical from here.');
  process.exit(0);
})();
