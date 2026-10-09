// ONE COMBINED DIAGRAM FOR ALL SEVEN INDICATORS — TO CHOOSE FROM, NOT FOR THE APP.
//
//   cd backend; npm run indicators:combined
//
// JC, having seen the three per-indicator directions: "I want a combined one,
// not something divided like this."
//
// So the subject changes. Seven separate marks answer "what does this row
// mean"; ONE diagram answers the question a clinician actually opens the page
// with — WHERE IS THIS ATHLETE AT RISK, ALL OF IT, AT ONCE. The seven values
// stop being a list with pictures and become a body with findings on it.
//
// Values are READ from a real report by the production text-layer extractor, so
// the layout is being judged against a real spread (8..26 on this athlete)
// rather than against numbers invented to make it look good. The band split is
// WATCH_THRESHOLD / HIGH_THRESHOLD from shared/facts.js — the same edges the app
// uses, so a marker that reads amber here reads amber there.
//
// The EIGHTH indicator is absent on purpose: LDH is EXCLUDED_RISK_KEYS — stored,
// never scored, charted, printed OR NAMED. On a combined figure that exclusion
// is more visible than on a list, so the sheet states it rather than leaving a
// silent gap at the lumbar spine.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  RISK_INDICATORS, EXCLUDED_RISK_KEYS, WATCH_THRESHOLD, HIGH_THRESHOLD,
} = require('../src/shared/facts');
const { extractFromTextLayer } = require('../src/utils/textLayerExtract');
const { openInBrowser, samplePath } = require('./lib/openSheet');

const OUT = samplePath('indicator-combined.html');
const SHOWN = RISK_INDICATORS.filter((i) => !EXCLUDED_RISK_KEYS.includes(i.key));

const bandOf = (v) => (v > HIGH_THRESHOLD ? 'high' : v > WATCH_THRESHOLD ? 'moderate' : 'low');

// Where each indicator sits on a 240 x 420 figure. Anatomical, and the ONLY
// place these coordinates exist — a combined diagram lives or dies on whether
// the marker is where the clinician expects the structure to be.
const AT = {
  neckInjuryRisk: [120, 62],
  shoulderInjuryRisk: [168, 96],
  scoliosis: [120, 132],
  lumbarPelvisInjury: [120, 186],
  jointPain: [72, 150],
  kneeInjuryRisk: [100, 286],
  ankleInjuryRisk: [100, 372],
};
// Which side each label hangs off, so leaders never cross.
const SIDE = {
  neckInjuryRisk: 'r',
  shoulderInjuryRisk: 'r',
  scoliosis: 'r',
  lumbarPelvisInjury: 'r',
  jointPain: 'l',
  kneeInjuryRisk: 'l',
  ankleInjuryRisk: 'l',
};

const FIGURE = `
  <path d="M120 22c9 0 15 7 15 15.5S129 53 120 53s-15-7-15-15.5S111 22 120 22z"/>
  <path d="M120 56c16 0 26 6 30 13l10 28-11 4-7-17-2 27 7 48h-12l-10-47h-10l-10 47H93l7-48-2-27-7 17-11-4 10-28c4-7 14-13 30-13z"/>
  <path d="M104 159h32l-3 44c0 0-5 3-13 3s-13-3-13-3z" opacity=".55"/>
  <path d="M106 212h12l6 82-4 76h-11l-3-76z"/>
  <path d="M122 212h12l3 82-3 76h-11l-4-76z"/>`;

function marker(ind, value, variant) {
  const [x, y] = AT[ind.key];
  const b = bandOf(value);
  if (variant === 'chip') {
    return `<g class="mk ${b}">
      <circle cx="${x}" cy="${y}" r="13" class="halo"/>
      <circle cx="${x}" cy="${y}" r="10"/>
      <text x="${x}" y="${y + 4}" class="val">${value}</text>
    </g>`;
  }
  // 'leader' — marker on the body, label parked outside with a leader line.
  const left = SIDE[ind.key] === 'l';
  const lx = left ? 18 : 222;
  const anchor = left ? 'end' : 'start';
  const elbow = left ? x - 26 : x + 26;
  return `<g class="mk ${b}">
    <path d="M${x} ${y}H${elbow}L${lx + (left ? -2 : 2)} ${y}" class="lead"/>
    <circle cx="${x}" cy="${y}" r="11" class="halo"/>
    <circle cx="${x}" cy="${y}" r="8"/>
    <text x="${lx}" y="${y - 1}" text-anchor="${anchor}" class="lbl">${ind.reportLabel}</text>
    <text x="${lx}" y="${y + 11}" text-anchor="${anchor}" class="sub">${value} · ${b === 'moderate' ? 'watch' : b}</text>
  </g>`;
}

const figure = (vals, variant) => `<svg viewBox="${variant === 'leader' ? '-96 10 432 400' : '0 10 240 400'}" class="fig">
  <g class="body">${FIGURE}</g>
  ${SHOWN.map((i) => marker(i, vals[i.key] ?? 0, variant)).join('')}
</svg>`;

const legend = `<div class="legend">
  <span><i class="low"></i>Low &le;${WATCH_THRESHOLD}</span>
  <span><i class="moderate"></i>Watch &le;${HIGH_THRESHOLD}</span>
  <span><i class="high"></i>Elevated &gt;${HIGH_THRESHOLD}</span>
</div>`;

const table = (vals) => `<table class="tbl"><tbody>${SHOWN.map((i) => {
  const v = vals[i.key] ?? 0;
  return `<tr class="${bandOf(v)}"><td>${i.reportLabel}</td><td class="r">${v}</td><td><i></i></td></tr>`;
}).join('')}</tbody></table>`;

function render(vals, meta) {
  const variants = [
    { id: '1', name: 'Labelled body', v: 'leader',
      note: 'Every finding named on the figure itself. One object to read, nothing to cross-reference — the layout HoloMotion uses for its own Muscle Imbalance page. Costs width.' },
    { id: '2', name: 'Body + list', v: 'chip',
      note: 'The figure carries the values; the list beside it carries the order. The figure answers WHERE at a glance, the list answers WHICH IS WORST without the eye hunting round a body.' },
  ];
  return `<!doctype html><meta charset="utf-8"><title>Combined indicator diagram</title>
<style>
  :root { --bg:#eef2f6; --card:#fff; --text:#15324a; --muted:#5a6b7d; --line:#d9e0e8;
          --body:#c8d2e0; --bodyink:#8ea3bb;
          --low:#4a8f5b; --moderate:#c89b3c; --high:#c0504a;
          --lowink:#397342; --moderateink:#8a6818; --highink:#a63b35; }
  .dark { --bg:#0b1726; --card:#13263a; --text:#e8edf2; --muted:#9fb3c8; --line:#24405c;
          --body:#2d3f56; --bodyink:#50688a;
          --low:#5fae72; --moderate:#dcab54; --high:#d9635b;
          --lowink:#6fbf7f; --moderateink:#e0ad55; --highink:#e8766c; }
  * { box-sizing:border-box }
  body { margin:0; font:14px/1.55 system-ui,Segoe UI,sans-serif; background:#e6ebf1; color:#15324a }
  header { padding:20px 26px; background:#15324a; color:#fff }
  header h1 { margin:0 0 5px; font-size:19px }
  header p { margin:0; opacity:.82; font-size:13px; max-width:78ch }
  .band { background:var(--bg); color:var(--text); padding:22px 26px 28px }
  .bandhead { font:600 11px system-ui; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:14px }
  .row { display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:18px 20px 16px; flex:1 1 440px }
  .card h2 { margin:0 0 4px; font-size:15px; display:flex; align-items:center; gap:9px }
  .tag { background:var(--text); color:var(--card); width:22px; height:22px; border-radius:6px; display:grid; place-items:center; font-size:12px; font-weight:700 }
  .note { margin:0 0 14px; color:var(--muted); font-size:12.5px }
  .pair { display:flex; gap:16px; align-items:center; justify-content:center }
  .fig { width:100%; max-width:380px; height:auto }
  .body path { fill:var(--body); stroke:var(--bodyink); stroke-width:1.1 }
  .mk circle { stroke:var(--card); stroke-width:2 }
  .mk .halo { stroke:none; opacity:.26 }
  .mk .lead { fill:none; stroke:var(--bodyink); stroke-width:1; opacity:.7 }
  .mk.low circle { fill:var(--low) } .mk.low .halo { fill:var(--low) }
  .mk.moderate circle { fill:var(--moderate) } .mk.moderate .halo { fill:var(--moderate) }
  .mk.high circle { fill:var(--high) } .mk.high .halo { fill:var(--high) }
  .val { fill:#fff; font:700 9px system-ui; text-anchor:middle }
  .lbl { fill:var(--text); font:600 10.5px system-ui }
  .sub { fill:var(--muted); font:10px system-ui }
  .tbl { border-collapse:collapse; font-size:12.5px; min-width:190px }
  .tbl td { padding:5px 8px; border-bottom:1px solid var(--line); white-space:nowrap }
  .tbl td.r { text-align:right; font-variant-numeric:tabular-nums; font-weight:700 }
  .tbl i { display:block; width:9px; height:9px; border-radius:3px }
  .tbl tr.low i { background:var(--low) } .tbl tr.moderate i { background:var(--moderate) } .tbl tr.high i { background:var(--high) }
  .tbl tr.low td.r { color:var(--lowink) } .tbl tr.moderate td.r { color:var(--moderateink) } .tbl tr.high td.r { color:var(--highink) }
  .legend { display:flex; gap:14px; margin-top:12px; font-size:11.5px; color:var(--muted); justify-content:center }
  .legend i { width:10px; height:10px; border-radius:3px; display:inline-block; vertical-align:-1px; margin-right:5px }
  .legend i.low { background:var(--low) } .legend i.moderate { background:var(--moderate) } .legend i.high { background:var(--high) }
  .note2 { padding:14px 26px; background:#fff6e5; color:#5c4813; font-size:13px; border-top:1px solid #e8d9b5 }
</style>
<header>
  <h1>Combined indicator diagram — two layouts, for a decision</h1>
  <p>All seven shown exercise-risk indicators on ONE figure. Values read from ${meta.file} by the
     production text-layer extractor (${meta.age}y ${meta.gender}, spread ${meta.min}–${meta.max}), band edges
     from <code>shared/facts.js</code>. Nothing here is in the app.</p>
</header>
<div class="note2">
  <b>Seven, not eight — and on a body the gap is visible.</b> Lumbar Disc Herniation is
  <code>EXCLUDED_RISK_KEYS</code>: stored, never scored, charted, printed <i>or named</i>. On a list its absence
  is quiet; on a figure there is simply no marker at the lumbar spine. Worth deciding whether that silence
  is acceptable before this ships.
</div>
${['', 'dark'].map((cls) => `
<div class="band ${cls}">
  <div class="bandhead">${cls ? 'Dark theme' : 'Light theme'}</div>
  <div class="row">
    ${variants.map((va) => `
    <div class="card">
      <h2><span class="tag">${va.id}</span> ${va.name}</h2>
      <p class="note">${va.note}</p>
      <div class="pair">
        ${figure(vals, va.v)}
        ${va.v === 'chip' ? table(vals) : ''}
      </div>
      ${legend}
    </div>`).join('')}
  </div>
</div>`).join('')}
`;
}

(async () => {
  const pdf = samplePath('nazwan.pdf');
  const r = await extractFromTextLayer(fs.readFileSync(pdf));
  const vals = r.athlete ?? {};
  const nums = SHOWN.map((i) => vals[i.key]).filter((n) => typeof n === 'number');
  if (nums.length !== SHOWN.length) {
    console.error(`only ${nums.length} of ${SHOWN.length} indicators read — the sheet would be drawn against holes.`);
    process.exit(1);
  }
  fs.writeFileSync(OUT, render(vals, {
    file: path.basename(pdf), age: vals.age, gender: vals.gender,
    min: Math.min(...nums), max: Math.max(...nums),
  }));
  console.log(`\n  ${SHOWN.length} indicators on one figure · spread ${Math.min(...nums)}–${Math.max(...nums)}`);
  console.log(`  excluded (by design): ${EXCLUDED_RISK_KEYS.join(', ')}`);
  console.log(`  written: ${OUT}\n`);
  openInBrowser(OUT);
})().catch((e) => { console.error(e); process.exit(2); });
