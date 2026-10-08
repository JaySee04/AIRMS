// THE FIGURE, BESIDE THE INSTRUMENT'S OWN FIGURE, BEFORE ANYTHING IS BUILT.
//
//   cd backend; npm run bodymap:proof          # opens a self-contained HTML page
//   cd backend; npm run bodymap:proof -- --pdf scripts/samples/thung.pdf
//
// WHY THIS EXISTS (2026-10-09, JC, DESIGN_DECISIONS §153).
//
// JC asked the right question after the §144 redraw was built, reviewed and
// reverted: "how should I make you do the correct thing for the muscle
// flagging?" The honest answer was that the geometry was never the problem —
// the LOOP was. ~900 lines of figure, 25 tests and three doc sections were
// written, committed and deployed before he saw a single picture, and the
// feedback cycle was therefore "full implementation -> verdict", which is the
// most expensive one available. It cost two sessions.
//
// The tool was not missing. Rendering the figure to a PNG and LOOKING at it is
// what found the white hole at the armpit that 25 passing tests could not see
// (§150). It was simply used at the wrong moment: to check my own work AFTER
// building, instead of to get JC's verdict BEFORE building.
//
// WHAT MAKES THIS DIFFERENT FROM A SCREENSHOT. It puts HoloMotion's actual
// Muscle Imbalance page next to ours, at a comparable size, WITH THE SAME
// FINDINGS LIT. The flags are not invented for the demo: they are read out of
// the sample report by the production text-layer extractor, so the two figures
// are showing the same athlete's same six findings. "Too ugly and not
// representable of a human silhouette" stops being a verdict to interpret and
// becomes a visible gap.
//
// It needs no dev server, writes nothing into the app, and touches no committed
// file. It is also the one automated form of the body-map lock's standing
// instruction — "AND THEN RENDER A REPORT AND LOOK AT IT" — which until now
// nothing did.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const { renderPdfPages } = require('../src/utils/pdfRender');
const { extractFromTextLayer } = require('../src/utils/textLayerExtract');

const ROOT = path.join(__dirname, '..', '..');
const FE = path.join(ROOT, 'frontend');
const SRC = 'src/components/dashboard/bodymap-data';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

// Resolved against the CURRENT DIRECTORY, not the repo root: this is run from
// backend/, so `--pdf scripts/samples/thung.pdf` is what a reader will type.
// The first version resolved against ROOT and answered with an ENOENT stack
// trace naming a path the caller never asked for.
const PDF = path.resolve(process.cwd(), arg('--pdf', path.join(__dirname, 'samples', 'nazwan.pdf')));
// The Muscle Imbalance page. Located by text rather than assumed: page 3 on the
// 28-/38-page expanded layout, and the compact 12-page one has no text layer at
// all, so `--page` is the escape hatch.
const PAGE = Number(arg('--page', 0)) || null;
const OUT = path.resolve(ROOT, arg('--out', 'backend/scripts/samples/bodymap-proof.html'));

// ---------------------------------------------------------------------------
// Our figure, compiled out of TypeScript
// ---------------------------------------------------------------------------

// Same technique the body-map exporter used: tsc to a temp dir, then require.
// `--ignoreConfig` because tsconfig.json is picked up whenever files are named
// on the command line, and its `noEmit` would silently produce nothing.
function loadFigure() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airms-proof-'));
  execFileSync('npx', ['tsc', '--ignoreConfig',
    `${SRC}/bodyFront.ts`, `${SRC}/bodyBack.ts`, `${SRC}/muscles.ts`,
    `${SRC}/outlines.ts`, `${SRC}/types.ts`,
    '--outDir', tmp, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: FE, stdio: 'inherit', shell: process.platform === 'win32' });
  /* eslint-disable import/no-dynamic-require, global-require */
  return {
    muscles: require(path.join(tmp, 'muscles.js')),
    outlines: require(path.join(tmp, 'outlines.js')),
  };
}

// ---------------------------------------------------------------------------
// The instrument's own page
// ---------------------------------------------------------------------------

async function musclePage(buffer) {
  if (PAGE) return PAGE;
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  try {
    const doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const text = (await (await doc.getPage(i)).getTextContent())
        .items.map((x) => x.str).join('');
      if (/Muscle\s*Imbalance/i.test(text)) return i;
    }
  } finally {
    await task.destroy();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Flags, read from the report rather than invented
// ---------------------------------------------------------------------------

// HoloMotion prints a muscle NAME; the figure is keyed by slug. `muscles.ts`
// already owns that mapping for the app, so this reuses it rather than writing
// a second one that could disagree (§31's rule, one layer down).
function flagStates(found, muscles) {
  const { RENDERABLE_MUSCLES, MUSCLE_ALIASES } = muscles;
  const key = (name) => {
    const slug = name.trim();
    const aliased = MUSCLE_ALIASES[slug] ?? slug;
    return RENDERABLE_MUSCLES.has(aliased) ? aliased : null;
  };
  const states = new Map();
  const put = (name, side, kind) => {
    const k = key(name);
    if (!k) return;
    const id = `${k}:${side}`;
    const prev = states.get(id);
    states.set(id, prev && prev !== kind ? 'both' : kind);
  };
  for (const f of found.myodynamia ?? []) put(f.muscle, f.side, 'weak');
  for (const f of found.tension ?? []) put(f.muscle, f.side, 'tight');
  return states;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const FILLS = {
  weak: '#4a89c4', tight: '#d08244', both: '#8a6bb5', none: 'var(--body)',
};

function svg(outline, parts, inert, states, viewBox, figure) {
  const paint = (p) => {
    const sides = [['left', 'L'], ['right', 'R'], ['common', 'B']];
    return sides.flatMap(([k, side]) => {
      const paths = p.path?.[k];
      if (!paths) return [];
      // A common path carries no side, so it lights if EITHER side is flagged —
      // the same rule the app uses.
      const st = side === 'B'
        ? (states.get(`${p.slug}:L`) ?? states.get(`${p.slug}:R`))
        : states.get(`${p.slug}:${side}`);
      const fill = st ? FILLS[st] : 'var(--body)';
      return paths.map((d) => `<path d="${d}" fill="${fill}" stroke="var(--ink)" stroke-width="1.1" stroke-opacity=".32"/>`);
    });
  };
  return `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" class="fig">
  <path d="${outline}" fill="var(--body)" stroke="var(--ink)" stroke-width="3" stroke-opacity=".6"/>
  ${inert.flatMap(paint).join('\n  ')}
  ${parts.flatMap(paint).join('\n  ')}
  <text x="50%" y="30" class="figlabel">${figure}</text>
</svg>`;
}

function page({ refPng, refPage, pdfName, found, svgs }) {
  const list = (rows, label) => (rows?.length
    ? `<li><b>${label}</b> ${rows.map((r) => `${r.muscle} ${r.side}`).join(' · ')}</li>`
    : `<li><b>${label}</b> <i>none printed</i></li>`);
  return `<!doctype html><meta charset="utf-8"><title>Body map proof sheet</title>
<style>
  :root { --bg:#f4f7fa; --card:#fff; --ink:#15324a; --body:#c8d2e0; --text:#15324a; --muted:#5a6b7d; }
  .dark { --bg:#0d1c2c; --card:#13263a; --ink:#c8dcf0; --body:#2d3f56; --text:#e8edf2; --muted:#9fb3c8; }
  * { box-sizing:border-box }
  body { margin:0; font:14px/1.5 system-ui,Segoe UI,sans-serif; background:#eef2f6; color:#15324a }
  header { padding:18px 24px; background:#15324a; color:#fff }
  header h1 { margin:0 0 4px; font-size:18px }
  header p { margin:0; opacity:.8; font-size:13px }
  .band { background:var(--bg); color:var(--text); padding:18px 24px }
  .row { display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap }
  .panel { background:var(--card); border-radius:10px; padding:14px; box-shadow:0 1px 4px rgba(0,0,0,.12) }
  .panel h2 { margin:0 0 10px; font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted) }
  .fig { width:260px; height:620px; display:block }
  .figlabel { font:600 15px system-ui; fill:var(--muted); text-anchor:middle }
  img { max-width:560px; height:auto; border-radius:6px; display:block }
  ul { margin:8px 0 0; padding-left:18px; color:var(--muted); font-size:13px }
  .key { display:flex; gap:14px; margin-top:10px; font-size:13px; color:var(--muted) }
  .key i { width:13px; height:13px; border-radius:3px; display:inline-block; vertical-align:-2px; margin-right:5px }
  .note { padding:14px 24px; background:#fff6e5; color:#5c4813; font-size:13px; border-top:1px solid #e8d9b5 }
</style>
<header>
  <h1>Body map proof sheet</h1>
  <p>${pdfName} · HoloMotion Muscle Imbalance page ${refPage ?? '(not found)'} · the same findings, lit on both figures</p>
</header>

<div class="note">
  <b>Judge this by looking, not by reading the code.</b> The flags below are read out of the
  report by the production text-layer extractor — the reference page and our figures are
  showing the same athlete's same findings, so any difference is ours.
</div>

${['', 'dark'].map((cls) => `
<div class="band ${cls}">
  <div class="row">
    <div class="panel">
      <h2>HoloMotion — the instrument${cls ? ' (dark surround)' : ''}</h2>
      ${refPng ? `<img src="${refPng}" alt="HoloMotion Muscle Imbalance page">` : '<p><i>page not rendered</i></p>'}
    </div>
    <div class="panel">
      <h2>AIRMS — ours${cls ? ', dark theme' : ', light theme'}</h2>
      <div style="display:flex;gap:6px">${svgs}</div>
      <div class="key">
        <span><i style="background:${FILLS.weak}"></i>Weakness</span>
        <span><i style="background:${FILLS.tight}"></i>Tension</span>
        <span><i style="background:${FILLS.both}"></i>Both</span>
      </div>
      <ul>
        ${list(found.myodynamia, 'Myodynamia deficiency')}
        ${list(found.tension, 'Muscle tension')}
      </ul>
    </div>
  </div>
</div>`).join('')}
`;
}

async function main() {
  if (!fs.existsSync(PDF)) {
    console.error(`no such report: ${PDF}`);
    console.error('pass one with  --pdf <path>  (relative to where you are standing)');
    process.exit(2);
  }
  const buffer = fs.readFileSync(PDF);
  const refPage = await musclePage(buffer);

  // READ THE RENDERER'S REAL KEY. The first version of this line guessed —
  // `img.data ?? img.buffer ?? img` — and renderPdfPages returns
  // { page, base64, mediaType }, so the fallback reached the OBJECT, whose
  // toString() is "[object Object]". The sheet shipped
  // `data:image/png;base64,[object Object]`: a broken image, while this script
  // printed "reference page: 3" and exited 0.
  //
  // That is §149's defect verbatim, inside the tool built to prevent it — and
  // rule 5 ("read the payload's real keys; print the raw response once first")
  // is the rule it broke. So the check below asserts the BYTES, not that a
  // variable is truthy: a real PNG's base64 begins `iVBORw0KGgo`.
  let refPng = null;
  if (refPage) {
    const [img] = await renderPdfPages(buffer, [refPage], 2);
    const b64 = img?.base64;
    if (typeof b64 === 'string' && b64.startsWith('iVBORw0KGgo') && b64.length > 10000) {
      refPng = `data:image/png;base64,${b64}`;
    } else {
      console.error(`  reference render produced no usable PNG (got ${typeof b64}, ${b64?.length ?? 0} chars)`);
    }
  }

  const found = await extractFromTextLayer(buffer);
  const { muscles, outlines } = loadFigure();
  const states = flagStates(found, muscles);

  const svgs = [
    svg(outlines.FRONT_OUTLINE, muscles.muscleFront, muscles.INERT_FRONT, states, '0 0 724 1448', 'Front'),
    svg(outlines.BACK_OUTLINE, muscles.muscleBack, muscles.INERT_BACK, states, '724 0 724 1448', 'Back'),
  ].join('');

  fs.writeFileSync(OUT, page({
    refPng, refPage, pdfName: path.basename(PDF), found, svgs,
  }));

  const lit = [...states.entries()].map(([k, v]) => `${k}=${v}`).join(', ');
  console.log(`\n  reference page : ${refPage ?? 'NOT FOUND'}${refPng ? '' : '  (not rendered)'}`);
  console.log(`  findings       : ${states.size} lit — ${lit || 'none'}`);
  console.log(`  written        : ${OUT}\n`);

  // Rule 2: a sheet that could not be measured must not read as a clean one.
  if (!refPng) {
    console.error('  the reference page did not render — the sheet shows only our side.');
    process.exitCode = 1;
  }
  if (!states.size) {
    console.error('  NO FLAGS LIT. Either the report has none, or the name->slug mapping broke;');
    console.error('  a blank figure beside a flagged reference page is the failure to look for.');
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(e); process.exit(2); });
