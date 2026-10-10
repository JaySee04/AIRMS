// SEVEN PART-SPECIFIC DIAGRAMS, THREE DIRECTIONS, FOR A DECISION — NOT FOR THE APP.
//
//   cd backend; npm run indicators:proof
//
// JC: "Make some new designs for the Holomotion 7 part specific diagrams and let
// me see. Do not put them in the website, place them in a separate container for
// me to view and make a decision before we put anything."
//
// So this writes a standalone sheet to scripts/samples/ (gitignored) and opens
// it. Nothing here is imported by the app, and no app file is touched — the
// §153 loop, applied before the work rather than after it.
//
// THE SEVEN ARE THE SHOWN INDICATORS, and the eighth is absent on purpose:
// `spinalDiscHerniation` (LDH) is EXCLUDED_RISK_KEYS — Dr Thung's instruction is
// that it is stored but never scored, charted, printed or named. A design sheet
// is still a place where it would be NAMED, so it is not drawn here either.
// Read from shared/facts.js rather than typed, so the sheet cannot drift from
// the app's own list (§31).
const fs = require('fs');
const { sheet, openInBrowser, samplePath } = require('./lib/sheet');
const { RISK_INDICATORS, EXCLUDED_RISK_KEYS } = require('../src/shared/facts');

const OUT = samplePath('indicator-designs.html');
const SHOWN = RISK_INDICATORS.filter((i) => !EXCLUDED_RISK_KEYS.includes(i.key));

// ---------------------------------------------------------------------------
// Direction A — ANATOMICAL LOCUS
// A simplified figure with the affected region lit. Answers WHERE before WHAT,
// and borrows the body map's own language, so the strip label and the figure
// beside it teach each other. Weakest at small sizes: the body is 7 heads tall
// and most of it is not the point.
// ---------------------------------------------------------------------------
const FIG = 'M24 7c2.6 0 4.4 1.9 4.4 4.3 0 2.4-1.8 4.3-4.4 4.3s-4.4-1.9-4.4-4.3C19.6 8.9 21.4 7 24 7z'
  + 'M24 16.6c4.4 0 7.2 1.6 8.3 3.6l2.9 7.6-3 1.1-2-4.6-.5 7.3 1.9 13.1h-3.3L25.6 32h-3.2l-2.7 12.7h-3.3l1.9-13.1-.5-7.3-2 4.6-3-1.1 2.9-7.6c1.1-2 3.9-3.6 8.3-3.6z';

const LOCUS = {
  neckInjuryRisk: '<ellipse cx="24" cy="16.4" rx="3.2" ry="2.2"/>',
  shoulderInjuryRisk: '<ellipse cx="31.6" cy="19.6" rx="3.1" ry="2.5"/><ellipse cx="16.4" cy="19.6" rx="3.1" ry="2.5"/>',
  scoliosis: '<path d="M24 17c2.2 2.6-2.2 5.2 0 7.8s-2.2 5.2 0 7.8" fill="none" stroke-width="2.6" stroke-linecap="round"/>',
  lumbarPelvisInjury: '<path d="M17.4 27.4h13.2l-1.4 5.2H18.8z"/>',
  jointPain: '<circle cx="31.4" cy="30.4" r="2.3"/><circle cx="16.6" cy="30.4" r="2.3"/><circle cx="24" cy="25" r="2.3"/>',
  kneeInjuryRisk: '<ellipse cx="21.3" cy="37.4" rx="2.4" ry="2.8"/><ellipse cx="26.7" cy="37.4" rx="2.4" ry="2.8"/>',
  ankleInjuryRisk: '<ellipse cx="21.1" cy="43.6" rx="2.3" ry="2"/><ellipse cx="26.9" cy="43.6" rx="2.3" ry="2"/>',
};

const dirA = (key) => `<svg viewBox="0 0 48 52" aria-hidden="true">
  <path d="${FIG}" fill="var(--ghost)"/>
  <g fill="currentColor" stroke="currentColor">${LOCUS[key]}</g>
</svg>`;

// ---------------------------------------------------------------------------
// Direction B — STRUCTURE
// The anatomy that is actually at risk, drawn as line-art. Closest to what
// HoloMotion itself puts in its Exercise Risk circles, and the only direction
// that distinguishes "ligament strain" from "joint pain" by LOOKING different
// rather than by sitting in a different place on a body.
// ---------------------------------------------------------------------------
const STRUCT = {
  // Cervical vertebrae, with the forward-head tilt that drives neck pain.
  neckInjuryRisk: '<path d="M18 40c0-7 1-12 4-17" /><path d="M30 40c0-8 1.5-13 5-18"/>'
    + '<path d="M19.6 33.5h9.8M20.4 28h9.6M22 22.5h9.4M24.4 17.2h9.2"/>',
  // Glenohumeral joint: head of humerus in the glenoid cup.
  shoulderInjuryRisk: '<path d="M14 15c7-3 12-1 14 4"/><circle cx="30" cy="25" r="7.5"/>'
    + '<path d="M36 30c3 5 3 9 2 13"/><path d="M22.5 19.5c-1.5 4-1 7 1.5 9.5"/>',
  // The defining sign: a lateral curve against a plumb line.
  scoliosis: '<path d="M24 8v34" stroke-dasharray="3 3.5" opacity=".5"/>'
    + '<path d="M24 8c6 6-6 11 0 17s-6 11 0 17"/>'
    + '<path d="M26.5 13.5h-5M18.8 21h5M26.8 29h-5M20 36.5h5"/>',
  // Pelvis in profile with the tilt angle called out.
  lumbarPelvisInjury: '<path d="M12 20c6-2 14-2 20 1l4 2"/>'
    + '<path d="M13 20c-1 7 2 12 7 14 5 2 9 1 11-2"/>'
    + '<path d="M12 33h24" stroke-dasharray="3 3.5" opacity=".5"/>'
    + '<path d="M30 33a9 9 0 0 0-3.2-6.4" opacity=".75"/>',
  // Two bone ends and a capsule, with irritation marks.
  jointPain: '<path d="M18 9v9c0 4-4 4-4 8s4 4 4 8v9"/><path d="M30 9v9c0 4 4 4 4 8s-4 4-4 8v9"/>'
    + '<path d="M9 22l-4-2M9 30l-4 2M39 22l4-2M39 30l4 2" opacity=".8"/>',
  // Knee with the cruciates crossing — this IS "ligament strain".
  kneeInjuryRisk: '<path d="M16 7v13c0 3 2 4 2 6M32 7v13c0 3-2 4-2 6"/>'
    + '<path d="M17 32v9M31 32v9"/><rect x="13" y="25" width="22" height="7" rx="3.5"/>'
    + '<path d="M18 26.5l12 4M30 26.5l-12 4" opacity=".85"/>',
  // Lateral ankle in inversion — the mechanism of the sprain.
  ankleInjuryRisk: '<path d="M20 8v16"/><path d="M28 8v15"/>'
    + '<path d="M16 24c0 5 2 8 6 9h14"/><path d="M36 33l-3-3M36 33l-3 3"/>'
    + '<path d="M19 25l4 7M27 24.5l-3 7.5" opacity=".85"/>',
};

const dirB = (key) => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <g fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${STRUCT[key]}</g>
</svg>`;

// ---------------------------------------------------------------------------
// Direction C — MARK
// Abstract, built from one vocabulary: a stack, an arc, a cross, a wedge. Made
// to survive 20px in a dense table where the other two turn to mush. Pays for
// it by having to be LEARNED — which is why none of these is ever the only
// carrier of a finding (§4a); the word sits beside it.
// ---------------------------------------------------------------------------
const MARK = {
  neckInjuryRisk: '<rect x="17" y="10" width="14" height="5" rx="2.5"/><rect x="18" y="19" width="12" height="5" rx="2.5"/>'
    + '<rect x="19" y="28" width="10" height="5" rx="2.5"/><path d="M24 36v3" opacity=".6"/>',
  shoulderInjuryRisk: '<path d="M30 14a11 11 0 1 0 0 20" fill="none" stroke-width="3"/><circle cx="31" cy="24" r="5.5"/>',
  scoliosis: '<path d="M24 8v32" fill="none" stroke-dasharray="3.5 4" opacity=".45"/>'
    + '<path d="M24 8c7 8-7 16 0 24s-5 6 0 8" fill="none" stroke-width="3"/>',
  lumbarPelvisInjury: '<path d="M13 20h22l-3 13H16z"/><path d="M11 36h26" opacity=".45" stroke-dasharray="3.5 4" fill="none"/>',
  jointPain: '<circle cx="18" cy="24" r="7"/><circle cx="30" cy="24" r="7"/>',
  kneeInjuryRisk: '<rect x="12" y="11" width="24" height="5" rx="2.5"/><rect x="12" y="32" width="24" height="5" rx="2.5"/>'
    + '<path d="M16 17l16 14M32 17L16 31" fill="none" stroke-width="3"/>',
  ankleInjuryRisk: '<path d="M20 10v16h14l-4 8H14z"/><path d="M34 12a9 9 0 0 1 2 7" fill="none" opacity=".6"/>',
};

const dirC = (key) => `<svg viewBox="0 0 48 48" aria-hidden="true">
  <g fill="currentColor" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round">${MARK[key]}</g>
</svg>`;

const DIRECTIONS = [
  { id: 'A', name: 'Anatomical locus', draw: dirA,
    note: 'A figure with the region lit. Answers WHERE first and reuses the body map\'s language. Most of the mark is body that is not the point, so it fades fastest when small.' },
  { id: 'B', name: 'Structure', draw: dirB,
    note: 'The tissue actually at risk. Closest to HoloMotion\'s own circles, and the only direction where Ligament Strain and Joint Pain look different rather than merely sitting elsewhere.' },
  { id: 'C', name: 'Mark', draw: dirC,
    note: 'One abstract vocabulary — stack, arc, cross, wedge. Built to survive 20px in a dense table. Has to be learned, so the word always sits beside it.' },
];

const SIZES = [{ px: 56, label: '56px — card' }, { px: 32, label: '32px — strip' }, { px: 20, label: '20px — table' }];

function render() {
  const band = (i) => ['low', 'moderate', 'high'][i % 3];
  const row = (d) => `
  <section class="card" style="margin-bottom:16px">
    <h2><span class="tag">${d.id}</span> ${d.name}</h2>
    <p class="note">${d.note}</p>
    ${SIZES.map((s) => `
    <div class="sizerow">
      <div class="sizelabel">${s.label}</div>
      <div class="icons">
        ${SHOWN.map((ind, n) => `
        <figure style="--s:${s.px}px" class="ic ${band(n)}">
          ${d.draw(ind.key)}
          ${s.px === 56 ? `<figcaption>${ind.reportLabel}<br><span>${ind.region}</span></figcaption>` : ''}
        </figure>`).join('')}
      </div>
    </div>`).join('')}
  </section>`;

  return sheet({
    title: 'Indicator diagram directions',
    heading: 'Indicator diagrams — three directions, for a decision',
    intro: 'The seven SHOWN exercise-risk indicators, read from <code>shared/facts.js</code>. Nothing here is in '
      + 'the app: this is a sheet to choose from. Colours are the band inks, cycled only so you can see each '
      + 'shape carry a status tint — they are not real values for these indicators.',
    warn: '<b>Lumbar Disc Herniation is deliberately absent.</b> It is the eighth indicator the instrument '
      + 'prints and the one <code>EXCLUDED_RISK_KEYS</code> withholds on Dr Thung&rsquo;s instruction — stored, '
      + 'never scored, charted, printed <i>or named</i>. A design sheet would name it, so it is not drawn here.',
    body: () => DIRECTIONS.map(row).join(''),
  }) + `<style>
  .sizerow { display:flex; align-items:center; gap:16px; padding:11px 0; border-top:1px dashed var(--line) }
  .sizelabel { width:96px; flex:none; font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em }
  .icons { display:flex; gap:22px; align-items:flex-start; flex-wrap:wrap }
  .ic { margin:0; width:max(var(--s), 74px); text-align:center }
  .ic svg { width:var(--s); height:var(--s); display:block; margin:0 auto }
  .ic.low svg { color:var(--lowink) } .ic.moderate svg { color:var(--moderateink) } .ic.high svg { color:var(--highink) }
  figcaption { margin-top:7px; font-size:11px; line-height:1.35; color:var(--text) }
  figcaption span { color:var(--muted) }
</style>`;
}

fs.writeFileSync(OUT, render());
console.log(`\n  ${SHOWN.length} indicators x ${DIRECTIONS.length} directions x ${SIZES.length} sizes`);
console.log(`  excluded (by design): ${EXCLUDED_RISK_KEYS.join(', ')}`);
console.log(`  written: ${OUT}\n`);

openInBrowser(OUT);
