// Generate a SYNTHETIC HoloMotion-shaped report with a real text layer.
//
// WHY THIS EXISTS. The two checks that verify the most important behaviour in
// Module 3 — `npm run verify:textlayer` (every clinical number read exactly) and
// `scripts/verify-redaction.js` (the athlete's name blacked out before any image
// could leave the machine) — both need a PDF argument, and the only PDFs that
// satisfy them are `scripts/samples/*.pdf`: real reports for real athletes,
// gitignored, and rightly so.
//
// The consequence, measured 2026-09-30: a fresh clone, a new collaborator and CI
// can verify NEITHER. The extraction pipeline and the privacy boundary are
// checkable on exactly one laptop. Backend jest puts textLayerExtract.js at
// 13.7% statements / 5.6% branches and redactName.js at 9.2% / 0% — not because
// they are untested, but because their tests are scripts that cannot run.
//
// So: a fixture with the same SHAPE and none of the content. Fabricated name,
// fabricated numbers, no athlete. Committed, ~10 KB, and it exercises the same
// parsers on the same layout contract.
//
// WHAT IT IS NOT. It is not a substitute for the real reports. It proves the
// parser reads the layout it is aimed at; only `nazwan.pdf` proves the layout
// assumption still matches what the instrument actually prints. Both matter, and
// the real-report check stays the authority — see §112. If HoloMotion changes
// its export, this fixture will keep passing and nazwan.pdf will start failing,
// which is the correct division of labour rather than a gap.
//
// THE LAYOUT CONTRACT, from utils/textLayerExtract.js. Getting any of these
// wrong produces a fixture that parses to nulls and a check that proves nothing:
//   * the colon after a cover field label is FULLWIDTH U+FF1A, not ':';
//   * "Gender ： X   Age ： N" share one row, so the parser stops a value at the
//     next field label;
//   * Total Score / Exercise Risks: headers on one row, values BENEATH, matched
//     by centre-x proximity;
//   * ROM / Stability / Symmetry: a row of EXACTLY three cells, values beneath;
//   * each subitem region label sits ABOVE its five numbers, read in x order as
//     [romL, romR, stabL, stabR, sym];
//   * page 6: the Low/Medium/High legend row sits ABOVE every score, each score
//     sits ABOVE its own label, and the two columns are split midway between the
//     score columns (~100pt between a score and its label block);
//   * pages 1-6 must carry more than MIN_TEXT_CHARS (400) or the extractor
//     correctly declines the whole document as having no text layer.
//
// Regenerate with:  node scripts/make-synthetic-report.js
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUT = path.join(__dirname, 'fixtures', 'synthetic-report.pdf');

// The ground truth this fixture encodes. verify-textlayer-extract.js reads the
// SAME object, so the expected values and the drawn values cannot drift apart.
const TRUTH = {
  // Fabricated, and deliberately a name no English prose would contain. The
  // first attempt was "Fixture Athlete Binti Test" and the leak check — does the
  // payload mention this person anywhere — fired on the word "fixture" in the
  // Summary text below. A false positive on the one assertion that must never
  // cry wolf, so the name is now unmistakable in either direction.
  name: 'Qelvorin Thrayspindle',
  gender: 'Female',
  age: 24,
  assessedAt: '2026-01-15 09:30:00',
  totalScore: 74,
  exerciseRisks: 18,
  rom: 71,
  stability: 76,
  symmetry: 79,
  subitems: {
    neck: [80, 78, 74, 72, 81],
    shoulder: [88, 84, 83, 81, 87],
    torso: [69, 66, 85, 88, 90],
    pelvis: [61, 70, 75, 81, 85],
    lowerLimbs: [65, 67, 75, 78, 90],
  },
  indicators: {
    'Neck Pain': 12,
    'Shoulder Pain': 22,
    'Scoliosis': 9,
    'Anterior Pelvic Tilt': 31,
    'Joint Pain': 15,
    'Ligament Strain': 20,
    'Ankle Sprain': 25,
    'Lumbar Disc Herniation': 40,          // LDH: stored, never scored (§31)
  },
  myodynamia: [['Gluteus Medius', 'L'], ['Rectus Abdominis', 'B'], ['Lower Trapezius', 'R']],
  tension: [['Iliopsoas', 'R'], ['Piriformis', 'L'], ['Upper Trapezius', 'B']],
};

// ASCII colon, and the reason is §30f biting from the other side.
//
// The real report separates a cover label from its value with U+FF1A FULLWIDTH
// COLON, and textLayerExtract's comment says matching ASCII "returns nothing at
// all". So this fixture should use the fullwidth one — and it CANNOT: pdfkit's
// built-in Helvetica is WinAnsi, U+FF1A is outside that set, and it encodes as
// 0xFF. Measured on the first attempt: the colon came back as "ÿ", which the
// parser does not skip, so `age` parsed from "ÿ 24" as null and gender as
// "ÿ Female". A character outside WinAnsi measuring zero width and printing as
// mojibake is exactly the defect §30f added winAnsiSafe for; here it corrupts a
// FIXTURE rather than a report.
//
// Embedding a CJK-capable TTF would fix it and is refused: gotcha 7 records that
// only Helvetica and Helvetica-Bold hydrate in this environment, so the fixture
// would become unbuildable on the machine that needs it most.
//
// The parser accepts both (`s === '：' || s === ':'`), so ASCII exercises every
// other cover rule. WHAT IT DOES NOT EXERCISE IS THE FULLWIDTH COLON ITSELF —
// that path is covered only by nazwan.pdf, which is one concrete reason the real
// -report check stays the authority and this fixture does not replace it.
const COLON = ':';
const REGIONS = [
  ['Neck', 'neck'],
  ['Shoulder and Upper Limbs', 'shoulder'],
  ['Torso', 'torso'],
  ['Pelvis', 'pelvis'],
  ['Lower Limbs', 'lowerLimbs'],
];

function build() {
  // UNCOMPRESSED, for two reasons that both matter more than the ~3 KB.
  //
  // 1. The verifier's canary corrupts a number in the content stream to prove it
  //    can see a wrong value. With FlateDecode on, `(74)` is not in the bytes,
  //    the edit matched nothing, and the canary reported "27/27 match" while
  //    claiming to have broken something — §112.8's defect exactly, committed in
  //    the very comment that cites it.
  // 2. A committed fixture that is plain text is diffable. A future change to
  //    this generator shows up in `git diff` as moved coordinates rather than as
  //    an opaque blob.
  const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false, compress: false });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // `at` writes a single positioned run. lineBreak:false keeps each string one
  // pdfjs item, which is what makes the row/centre arithmetic predictable.
  const at = (s, x, y, size = 10, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
      .text(String(s), x, y, { lineBreak: false });
  };

  // ── page 1: cover ────────────────────────────────────────────────────────
  doc.addPage();
  at('HoloMotion Movement Screening Report', 40, 40, 16, true);
  at('SYNTHETIC FIXTURE - NOT A REAL ATHLETE', 40, 62, 9);
  at('Name', 40, 100); at(COLON, 90, 100); at(TRUTH.name, 105, 100);
  // Two fields on ONE row, which is the case the parser has to stop short on.
  at('Gender', 40, 120); at(COLON, 90, 120); at(TRUTH.gender, 105, 120);
  at('Age', 200, 120); at(COLON, 230, 120); at(TRUTH.age, 245, 120);
  at('Time', 40, 140); at(COLON, 90, 140); at(TRUTH.assessedAt, 105, 140);

  // Headers on one row, values BENEATH, centre-aligned under each header.
  at('Total Score', 120, 200, 11, true);
  at('Exercise Risks', 320, 200, 11, true);
  at(TRUTH.totalScore, 145, 225, 20, true);
  at(TRUTH.exerciseRisks, 352, 225, 20, true);

  // A Summary block. The real one is letter-spaced and the extractor DECLINES
  // it (looksLetterSpaced); this one is ordinary text, so the fixture must not
  // be used to assert the Summary is read — verify-textlayer-extract.js treats
  // that row as a presence check and the real report's decline is correct.
  at('Summary', 40, 300, 12, true);
  at('1. Synthetic fixture text for layout verification only.', 40, 320);
  at('2. No clinical meaning attaches to any value in this document.', 40, 336);

  // ── page 2: filler, so the page indices match the real layout ────────────
  doc.addPage();
  at('Page 2 - Overview (not extracted)', 40, 40, 12, true);
  at('This page exists so the data pages keep their real indices.', 40, 70);

  // ── page 3: muscle imbalance ─────────────────────────────────────────────
  doc.addPage();
  at('Muscle Imbalance', 40, 40, 14, true);
  at('Myodynamia', 40, 90, 11, true);
  at(`Deficiency ${COLON}`, 40, 106, 11, true);
  let y = 130;
  for (const [m, side] of TRUTH.myodynamia) { at(`${m} ${side}`, 60, y); y += 18; }
  at(`Muscle Tension ${COLON}`, 40, y + 20, 11, true);
  y += 44;
  for (const [m, side] of TRUTH.tension) { at(`${m} ${side}`, 60, y); y += 18; }

  // ── page 4: filler (Posture — dropped 2026-08-01) ────────────────────────
  doc.addPage();
  at('Page 4 - Posture (not extracted since 2026-08-01)', 40, 40, 12, true);
  at('Retained so page 5 is page 5.', 40, 70);

  // ── page 5: risk screening + the 25-cell subitem table ───────────────────
  doc.addPage();
  at('Physical Fitness Risk Screening', 40, 40, 14, true);
  // EXACTLY three cells on this row — the parser requires cells.length === 3.
  at('ROM', 120, 90, 11, true);
  at('Stability', 250, 90, 11, true);
  at('Symmetry', 390, 90, 11, true);
  at(TRUTH.rom, 128, 120, 18, true);
  at(TRUTH.stability, 268, 120, 18, true);
  at(TRUTH.symmetry, 408, 120, 18, true);

  at('Physical Fitness Subitem', 40, 190, 12, true);
  // Split header, exactly as the real report prints it. The parser deliberately
  // ignores it and reads the five numbers in x order.
  at('ROM', 210, 215, 9, true); at('Stability', 300, 215, 9, true); at('Symmetry', 400, 215, 9, true);
  at('L', 200, 230, 9); at('R', 250, 230, 9); at('L', 300, 230, 9); at('R', 350, 230, 9); at('B', 400, 230, 9);

  // Label ABOVE its own five numbers, ~12pt apart (the parser's window is 14).
  let ry = 255;
  for (const [label, key] of REGIONS) {
    at(label, 40, ry, 10, true);
    const v = TRUTH.subitems[key];
    const xs = [200, 250, 300, 350, 400];
    v.forEach((n, i) => at(n, xs[i], ry + 12, 10));
    ry += 42;
  }

  // ── page 6: exercise risk, eight indicators in two columns ───────────────
  doc.addPage();
  at('Exercise Risk', 40, 40, 14, true);
  // The legend must sit ABOVE every score: the parser treats everything above
  // it as heading and only reads scores below it.
  at('Low Risk (0-15)', 40, 70, 9);
  at('Medium Risk (16-55)', 160, 70, 9);
  at('High Risk (56-100)', 320, 70, 9);

  // Score centred ~100pt right of its label block, per the measured geometry:
  // left column scores ~200 / labels ~100, right column ~421 / ~321.
  const entries = Object.entries(TRUTH.indicators);
  let sy = 120;
  entries.forEach(([label, score], i) => {
    const left = i % 2 === 0;
    const scoreX = left ? 195 : 416;
    const labelX = left ? 95 : 316;
    const rowY = sy + Math.floor(i / 2) * 104;
    at(score, scoreX, rowY, 16, true);
    // The label wraps over up to three rows in the real report; wrapping it here
    // exercises the same word-gathering path.
    label.split(' ').forEach((w, k) => at(w, labelX, rowY + 26 + k * 13, 10));
  });

  doc.end();
  return done;
}

build().then((buf) => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, buf);
  fs.writeFileSync(
    path.join(path.dirname(OUT), 'synthetic-report.truth.json'),
    `${JSON.stringify(TRUTH, null, 2)}\n`,
  );
  console.log(`wrote ${path.relative(process.cwd(), OUT)}  (${(buf.length / 1024).toFixed(1)} KB)`);
  console.log('wrote synthetic-report.truth.json — the expected values, read by the verifier');
}).catch((e) => { console.error(e); process.exit(1); });

module.exports = { TRUTH };
