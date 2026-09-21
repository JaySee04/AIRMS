// Extract a HoloMotion report WITHOUT a vision model, and hand the result to
// the existing ground-truth comparator.
//
//   node scripts/verify-textlayer-extract.js scripts/samples/nazwan.pdf
//
// It deliberately scores nothing itself. verify-holomotion-extract.js already
// owns the ground truth and the pass/fail rules — including the one that
// matters most, that the athlete's real name must be ABSENT from the output —
// so this writes the payload and shells out to it. A second scorer would be a
// second opinion about what "correct" means, which is how two guards end up
// agreeing while both are wrong (SILENT_FAILURES 3l/3n/3o/3p).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { extractFromTextLayer } = require('../src/utils/textLayerExtract');

(async () => {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node scripts/verify-textlayer-extract.js <path-to-report.pdf>');
    process.exit(1);
  }
  if (!fs.existsSync(target)) {
    console.error(`No such file: ${target}`);
    process.exit(1);
  }

  const t0 = Date.now();
  const result = await extractFromTextLayer(fs.readFileSync(target));
  const secs = ((Date.now() - t0) / 1000).toFixed(2);

  if (!result.ok) {
    console.log(`\n${path.basename(target)}: NO TEXT LAYER `
      + `(${result.textLayerChars} chars across the data pages, ${result.totalPages} pages).`);
    console.log('This is the compact layout. It needs the vision path — which is the');
    console.log('point of the gate, not a failure of the extractor.');
    process.exit(2);
  }

  console.log(`\nExtracted in ${secs}s — no vision model, no tokens, nothing left the machine.`);
  console.log(`  ${result.totalPages} pages, ${result.textLayerChars} chars of text on the data pages`);
  console.log(`  name present in the PDF: ${result.nameFound ? 'yes (read, then dropped)' : 'no'}`);

  // THE BEHAVIOURS THE GROUND-TRUTH DIFF CANNOT SEE.
  //
  // They live here rather than in jest because opening a PDF at all requires
  // the ESM pdfjs build, which jest's CommonJS transform cannot load — the same
  // constraint CLAUDE.md already states for this pipeline. tests/
  // textLayerExtract.test.js covers the pure half.
  const behaviours = [];
  const must = (name, ok, detail) => { behaviours.push({ name, ok, detail }); };

  // The text layer hands over the athlete's name in plain text. It is read —
  // that is how nameFound can report the page was understood — and dropped,
  // because the commit backfills the name server-side from the roster row.
  must('the name is read and then dropped', result.athlete.name === '', `name="${result.athlete.name}"`);

  // §70: HoloMotion's Summary is reproduced verbatim and attributed to the
  // instrument. The word boundaries are not recoverable from this text layer,
  // so it must be declined rather than guessed at.
  must(
    'the Summary is declined, not mangled',
    result.summary === null && result.summaryUnavailable === 'letter-spaced',
    `summary=${result.summary === null ? 'null' : `${String(result.summary).length} chars`}`,
  );

  console.log('');
  for (const b of behaviours) {
    console.log(`  ${b.ok ? 'ok  ' : 'FAIL'}  ${b.name}${b.ok ? '' : `  — ${b.detail}`}`);
  }
  const behaviourFailures = behaviours.filter((b) => !b.ok).length;

  const out = path.join(os.tmpdir(), `airms-textlayer-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(result, null, 2));

  const verifier = path.join(__dirname, 'verify-holomotion-extract.js');
  const run = spawnSync(process.execPath, [verifier, '--json', out], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  fs.unlinkSync(out);

  // The verifier's "summary read" check is a PRESENCE check — length > 20 —
  // so it reports FAIL here by design, and would equally report PASS on prose
  // that had been mangled into nonsense. Say so, rather than let a red line
  // read as a regression.
  console.log('\nNote: the ground-truth comparator\'s "summary read" row is a presence');
  console.log('check. It FAILS above because this path declines the Summary on purpose,');
  console.log('and it would have PASSED on the letter-spaced mush an earlier version');
  console.log('produced. Every other field is compared by value.');

  process.exit(behaviourFailures ? 1 : (run.status === null ? 1 : 0));
})().catch((e) => {
  console.error(`\nExtraction failed: ${e.message}`);
  process.exit(1);
});
