// Export the body figure to backend/src/utils/bodymapData.json.
//
// WHY THIS IS A SCRIPT AND NOT A ONE-TIME CONVERSION (2026-10-08, §144).
//
// The backend draws the same body figure into the PDF reports, and it cannot
// require() TypeScript, so it reads a generated JSON. That JSON was produced
// ONCE, by hand, and the comment at the top of backend/src/utils/bodymap.js
// said regenerating it would never be needed because the asset was a locked
// decision. The asset is no longer locked — §144 replaced it — and at that
// moment the screen and the printed report would have drawn DIFFERENT BODIES
// with nothing anywhere saying so. That is this project's defect class exactly:
// a wrong answer that looks like a right one.
//
// So the conversion is a command, and backend/tests/bodymapData.test.js fails
// if the committed copy is stale — the same contract as `npm run map` and
// `npm run sync:shared`.
//
//   cd frontend; npm run export:bodymap
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const FE = path.resolve(__dirname, '..');
const OUT = path.resolve(FE, '../backend/src/utils/bodymapData.json');
const SRC = 'src/components/dashboard/bodymap-data';

function build() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airms-bodymap-'));
  // --ignoreConfig: tsconfig.json is picked up whenever files are named on the
  // command line, and its `noEmit` would make this silently produce nothing.
  execFileSync('npx', ['tsc', '--ignoreConfig',
    `${SRC}/anatomy.ts`, `${SRC}/figure.ts`, `${SRC}/types.ts`,
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: FE, stdio: 'inherit', shell: process.platform === 'win32' });
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const fig = require(path.join(tmp, 'figure.js'));
  return { fig, tmp };
}

function serialise(fig) {
  return {
    _attribution: [
      'GENERATED — do not edit by hand. Run `cd frontend; npm run export:bodymap`.',
      'Source: frontend/src/components/dashboard/bodymap-data/{anatomy,figure}.ts',
      'Original geometry authored for AIRMS (DESIGN_DECISIONS.md §144). The figure',
      'is built from anatomical landmarks; it is not traced from, and contains no',
      'path data from, any third-party atlas or from the HoloMotion report.',
    ].join(' '),
    frontOutline: fig.FRONT_OUTLINE,
    backOutline: fig.BACK_OUTLINE,
    // The REGION layer only: the PDF figure colours HoloMotion's five reported
    // subitem regions, which is what these slugs are. The muscle layer is a
    // screen feature and is not drawn in the reports.
    bodyFront: fig.regionFront,
    bodyBack: fig.regionBack,
  };
}

function main() {
  const { fig, tmp } = build();
  const json = `${JSON.stringify(serialise(fig), null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== json) {
      process.stderr.write('bodymapData.json is STALE — run `cd frontend; npm run export:bodymap`\n');
      process.exit(1);
    }
    process.stdout.write('bodymapData.json is current\n');
  } else {
    fs.writeFileSync(OUT, json);
    process.stdout.write(`wrote ${OUT}\n  ${fig.regionFront.length} front regions, ${fig.regionBack.length} back\n`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

main();
