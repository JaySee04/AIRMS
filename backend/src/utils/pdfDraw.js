// pdfkit drawing toolkit for the HoloMotion screening reports. Route handlers
// live in routes/screeningReports.js and call into this; that file does
// routing, fetching and page composition only.
//
// Scale/density is modelled on the TMG group/individual report format JC
// provided (multi-page, radar + zone gauges + per-athlete sections +
// interpretation text) while keeping the AIRMS navy/gold identity. The
// Exercise Risk Evaluation uses HoloMotion's printed indicator names and the
// AIRMS bands (Low ≤15 · Watch 16–25 · Elevated >25) — the SAME words and
// boundaries the dashboards use; see the RISK_ZONES note below. The Physical
// Fitness Subitem Score table uses HoloMotion's 60/75/85 tier boundaries
// (Below Average / Average / Good / Excellent). Lumbar Disc Herniation is
// stored but never shown (Dr Thung / ISN facilities).

const PDFDocument = require('pdfkit');
const { orientedComponents } = require('../utils/cohorts');
const { compositeZ } = require('../utils/overallIndicator');
const {
  bodyFront, bodyBack, frontOutline, backOutline, SCOPED_SLUGS: BODYMAP_SCOPED_SLUGS, worstValueBySlug,
} = require('../utils/bodymap');

// ── palette (AIRMS identity + HoloMotion band semantics) ────────────────────
const NAVY = '#0f2c4a';
const GOLD = '#c89b3c';
const MUTED = '#6b7280';
const TEXT = '#1a2533';
const GRID = '#e2e6ea';
// Traffic-light bands — the light-theme values of the website's --risk-low /
// --risk-moderate / --risk-high, so a verdict is the same colour on screen and
// on paper. Do not re-invent a print palette here (DESIGN_DECISIONS §19).
const BAND = { green: '#3d7c47', amber: '#c89b3c', red: '#b03030' };
const bandColor = (b) => BAND[b] || MUTED;
// Text drawn ON a band fill. Amber is a light yellow — white on it fails
// legibility, so it takes dark ink, exactly as the 'Average' tier does below.
const BAND_INK = { green: '#ffffff', amber: '#3d2f05', red: '#ffffff' };
const bandInk = (b) => BAND_INK[b] || '#ffffff';
// The band colour used as TEXT on white paper. Green and red carry themselves;
// amber is darkened, the same allowance the 'Average' tier's onLight makes.
const BAND_ON_LIGHT = { green: BAND.green, amber: '#8a6a16', red: BAND.red };
const bandOnLight = (b) => BAND_ON_LIGHT[b] || TEXT;
const bandLabel = (b) => ({ green: 'Safe', amber: 'Needs attention', red: 'Immediate assessment' }[b] || '—');

// Exercise Risk Evaluation bands. These MUST agree with the dashboards —
// frontend/src/lib/screeningAlerts.ts is the counterpart definition and carries
// the full rationale. Summary:
//
//   HoloMotion prints:  Low 0–15 │ Medium 16–55        │ High 56–100
//   AIRMS shows:        Low ≤15  │ Watch 16–25 · Elevated >25
//
// AIRMS' Low boundary is the report's exactly; above it AIRMS subdivides the
// report's broad Medium band so ISN can act early. AIRMS never says "High" —
// the report reserves that for 56–100, far above anything the instrument
// produces (the ground-truth reports top out at 27). Until 2026-07-16 these
// reports used the printed legend while the dashboards used ≤15/≤25/>25, so a
// 26 read "Medium Risk" on the PDF and "HIGH RISK" on screen.
const RISK_AXIS_MAX = 40; // display axis, matches the dashboard strips
// Zone tints are the light-theme --risk-low-bg / --risk-moderate-bg /
// --risk-high-bg, i.e. exactly what .screening-strip-zone--{ok,watch,high} paint
// on the dashboard, so a printed strip and an on-screen strip are the same
// picture.
// `color` fills marks (markers, ticks, swatches); `onLight` is the same meaning
// as text on white paper, with the amber darkened for legibility.
const RISK_ZONES = [
  { max: 15, label: 'Low', color: BAND.green, onLight: bandOnLight('green'), tint: '#e8f5ea' },
  { max: 25, label: 'Watch', color: BAND.amber, onLight: bandOnLight('amber'), tint: '#fef9e7' },
  { max: RISK_AXIS_MAX, label: 'Elevated', color: BAND.red, onLight: bandOnLight('red'), tint: '#fdecea' },
];
const riskZone = (v) => RISK_ZONES[v > 25 ? 2 : v > 15 ? 1 : 0];
const ELEVATED_THRESHOLD = RISK_ZONES[1].max; // 25 — the radar guide polygon is drawn at this boundary
// LDH (spinalDiscHerniation) deliberately absent.
const RISKS = [
  ['neckInjuryRisk', 'Neck Pain'],
  ['shoulderInjuryRisk', 'Shoulder Pain'],
  ['scoliosis', 'Scoliosis'],
  ['lumbarPelvisInjury', 'Anterior Pelvic Tilt'],
  ['jointPain', 'Joint Pain'],
  ['kneeInjuryRisk', 'Ligament Strain'],
  ['ankleInjuryRisk', 'Ankle Sprain'],
];

// Physical Fitness Subitem Score — HoloMotion's 60/75/85 tiers. Colours mirror
// the website's ROM & Stability language exactly (BodyMap: --risk-low /
// --risk-undertrained / --risk-moderate / --risk-high, light theme) so a tier
// reads the same green → blue → yellow → red on screen and on paper.
//   color   — the fill (discs, bars, heatmap cells, body regions, swatches)
//   ink     — text drawn ON that fill (white on dark tiers; dark on yellow)
//   onLight — tier-coloured text on white paper (yellow darkened to stay legible)
const TIERS = [
  { min: 85, label: 'Excellent', color: '#3d7c47', ink: '#ffffff', onLight: '#3d7c47' },
  { min: 75, label: 'Good', color: '#2a6391', ink: '#ffffff', onLight: '#2a6391' },
  { min: 60, label: 'Average', color: '#c89b3c', ink: '#3d2f05', onLight: '#8a6a16' },
  { min: 0, label: 'Below Average', color: '#b03030', ink: '#ffffff', onLight: '#b03030' },
];
const tierOf = (v) => TIERS.find((t) => v >= t.min) || TIERS[TIERS.length - 1];
const SUBITEM_REGIONS = [
  ['neck', 'Neck'],
  ['shoulder', 'Shoulder & Upper Limbs'],
  ['torso', 'Torso'],
  ['pelvis', 'Pelvis'],
  ['lowerLimbs', 'Lower Limbs'],
];
const SUBITEM_COLS = [['romL', 'ROM L'], ['romR', 'ROM R'], ['stabL', 'Stab L'], ['stabR', 'Stab R'], ['sym', 'Sym']];

const SCORE_ROWS = [
  ['totalScore', 'Total Score', 100],
  ['rom', 'ROM', 100],
  ['stability', 'Stability', 100],
  ['symmetry', 'Symmetry', 100],
];

const COMPONENT_LABELS = {
  totalScore: 'Total Score', rom: 'ROM', stability: 'Stability',
  symmetry: 'Symmetry', riskGood: 'Exercise-risk burden', balance: 'Left/right balance',
};

const num = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
const fmtDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

// One report-naming scheme: AIRMS_<Type>_<who/scope>_<date>.pdf — name-based and
// accurate to the actual athlete/filters so a saved file is self-describing.
// The Content-Disposition this sets is honoured by the frontend downloader
// (CORS exposes the header), so this is the single source of truth for names.
const fileSlug = (s) => String(s ?? '').trim().replace(/[^\w.-]+/g, '_').replace(/_{2,}/g, '_').replace(/^_+|_+$/g, '') || 'report';
const todayStamp = () => new Date().toISOString().slice(0, 10);

// ── document plumbing ────────────────────────────────────────────────────────
function startDoc(res, filename) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

// Stamp "page i of n" footers on every buffered page, then end the stream.
// The footer sits inside the bottom margin, so the margin must be zeroed while
// stamping — otherwise pdfkit auto-adds a page for text below the margin line.
function finish(doc, kind) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const oldBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.fontSize(8).font('Helvetica').fillColor(MUTED)
      .text(`AIRMS · ${kind} · page ${i + 1} of ${range.count}`, 50, doc.page.height - 36, {
        width: doc.page.width - 100, align: 'center', lineBreak: false,
      });
    doc.page.margins.bottom = oldBottom;
  }
  doc.end();
}

// Page-break guard: start a fresh page unless `h` points still fit.
function ensure(doc, h) {
  if (doc.y + h > doc.page.height - 70) { doc.addPage(); doc.y = 50; }
}

function cover(doc, kind, subtitle) {
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold').text('AIRMS', 50, 30, { lineBreak: false });
  doc.fillColor(GOLD).fontSize(11).font('Helvetica').text('Athlete Injury Risk Management System', 50, 56, { lineBreak: false });
  doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold').text(kind, 50, 30, { align: 'right', width: doc.page.width - 100 });
  if (subtitle) doc.fillColor('#cbd5e1').fontSize(9).font('Helvetica').text(subtitle, 50, 56, { align: 'right', width: doc.page.width - 100 });
  doc.fillColor(TEXT).y = 110;
  doc.x = 50;
}

// `keep` = points that must fit below the title so a heading never orphans at
// a page bottom while its content starts on the next page.
function sectionTitle(doc, t, keep = 60) {
  ensure(doc, keep);
  doc.moveDown(0.6);
  doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold').text(t, 50);
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor(GRID).stroke();
  doc.moveDown(0.5);
  doc.fillColor(TEXT).font('Helvetica').fontSize(10);
}

// Horizontal bar with an optional reference marker (e.g. cohort mean).
function bar(doc, label, value, max, color, opts = {}) {
  ensure(doc, 18);
  const x = 50; const w = doc.page.width - 100; const barW = w - 190;
  const y = doc.y;
  doc.fillColor(TEXT).fontSize(9).font('Helvetica').text(label, x, y + 1, { width: 126, lineBreak: false });
  const bx = x + 130;
  doc.roundedRect(bx, y, barW, 11, 2).fill('#eef1f4');
  const pct = Math.max(0, Math.min(1, (value ?? 0) / max));
  doc.roundedRect(bx, y, Math.max(2, barW * pct), 11, 2).fill(color);
  if (opts.ref != null) {
    const rx = bx + barW * Math.max(0, Math.min(1, opts.ref / max));
    doc.moveTo(rx, y - 2).lineTo(rx, y + 13).strokeColor(NAVY).lineWidth(1.4).stroke().lineWidth(1);
  }
  doc.fillColor(TEXT).fontSize(9).font('Helvetica-Bold').text(
    opts.valueText ?? String(value ?? '—'), bx + barW + 8, y + 1, { width: 50, lineBreak: false });
  doc.y = y + 16;
}

// Exercise-risk gauge on the AIRMS bands (Low ≤15 · Watch 16–25 · Elevated
// >25), drawn on the same 0–40 axis the dashboard strips use: tinted zone
// track, marker at the value, zone-coloured label.
function zoneGauge(doc, label, value) {
  ensure(doc, 19);
  const v = num(value) ?? 0;
  const x = 50; const w = doc.page.width - 100; const barW = w - 230;
  const y = doc.y;
  doc.fillColor(TEXT).fontSize(9).font('Helvetica').text(label, x, y + 1, { width: 126, lineBreak: false });
  const bx = x + 130;
  let zx = bx; let prev = 0;
  for (const z of RISK_ZONES) {
    const zw = barW * ((z.max - prev) / RISK_AXIS_MAX);
    doc.rect(zx, y, zw, 11).fill(z.tint);
    zx += zw; prev = z.max;
  }
  const zone = riskZone(v);
  const mx = bx + barW * Math.max(0, Math.min(1, v / RISK_AXIS_MAX));
  doc.moveTo(mx, y - 2).lineTo(mx, y + 13).strokeColor(zone.color).lineWidth(2).stroke().lineWidth(1);
  doc.circle(mx, y - 3.5, 2.2).fill(zone.color);
  doc.fillColor(zone.onLight).fontSize(9).font('Helvetica-Bold')
    .text(`${v}  ${zone.label}`, bx + barW + 8, y + 1, { width: 92, lineBreak: false });
  doc.fillColor(TEXT);
  doc.y = y + 17;
}

// Stacked hotspot bar: amber Watch segment + red Elevated segment, with a value
// column wide enough for "N · M elevated" so the labels never wrap or collide
// with the next row (the previous single-column bar() overflowed here).
function hotspotBar(doc, label, watch, elevated, total) {
  ensure(doc, 17);
  const x = 50; const w = doc.page.width - 100; const barW = w - 250;
  const y = doc.y;
  doc.fillColor(TEXT).fontSize(9).font('Helvetica').text(label, x, y + 1, { width: 126, lineBreak: false });
  const bx = x + 130;
  doc.roundedRect(bx, y, barW, 11, 2).fill('#eef1f4');
  const denom = total || 1;
  const ww = Math.min(barW, barW * (watch / denom));
  const ew = Math.min(barW - ww, barW * (elevated / denom));
  if (ww > 0) doc.rect(bx, y, ww, 11).fill(BAND.amber);
  if (ew > 0) doc.rect(bx + ww, y, ew, 11).fill(BAND.red);
  const flagged = watch + elevated;
  doc.fillColor(TEXT).fontSize(9).font('Helvetica-Bold')
    .text(elevated ? `${flagged}  ·  ${elevated} elevated` : `${flagged}`, bx + barW + 8, y + 1, { width: 112, lineBreak: false });
  doc.y = y + 16;
}

// Reusable band-distribution table (Screened / Safe / Attention / Immediate) for
// any grouping — sport, gender, age band — so every slice reads identically.
function bandTable(doc, entries) {
  const yStart = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('Group', 50, yStart, { lineBreak: false });
  doc.text('Screened', 250, yStart, { width: 60, align: 'right', lineBreak: false });
  doc.text('Safe', 320, yStart, { width: 50, align: 'right', lineBreak: false });
  doc.text('Attention', 380, yStart, { width: 60, align: 'right', lineBreak: false });
  doc.text('Immediate', 450, yStart, { width: 65, align: 'right', lineBreak: false });
  doc.y = yStart + 14;
  for (const e of entries) {
    ensure(doc, 15);
    const y = doc.y;
    doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(e.label, 50, y, { width: 195, lineBreak: false });
    doc.text(String(e.n), 250, y, { width: 60, align: 'right', lineBreak: false });
    doc.fillColor(bandOnLight('green')).text(String(e.green), 320, y, { width: 50, align: 'right', lineBreak: false });
    doc.fillColor(bandOnLight('amber')).text(String(e.amber), 380, y, { width: 60, align: 'right', lineBreak: false });
    doc.fillColor(bandOnLight('red')).text(String(e.red), 450, y, { width: 65, align: 'right', lineBreak: false });
    doc.fillColor(TEXT);
    doc.y = y + 14;
  }
}

// Screening-programme activity per calendar period — the administrator's own
// performance table. Throughput (tests / distinct athletes) alongside the
// population average and its change against the previous period in the series.
// Newest first, matching the admin dashboard.
function periodTable(doc, periods) {
  if (!periods || !periods.length) {
    doc.fontSize(9).fillColor(MUTED).text('No screenings on record for this population.', 50);
    return;
  }
  const yStart = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('Period', 50, yStart, { lineBreak: false });
  doc.text('Tests', 200, yStart, { width: 50, align: 'right', lineBreak: false });
  doc.text('Athletes', 260, yStart, { width: 55, align: 'right', lineBreak: false });
  doc.text('Avg indicator', 325, yStart, { width: 75, align: 'right', lineBreak: false });
  doc.text('Change', 410, yStart, { width: 55, align: 'right', lineBreak: false });
  doc.text('Avg risk', 475, yStart, { width: 55, align: 'right', lineBreak: false });
  doc.y = yStart + 14;

  for (const p of [...periods].reverse()) {
    ensure(doc, 15);
    const y = doc.y;
    doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(p.label, 50, y, { width: 145, lineBreak: false });
    doc.text(String(p.tests), 200, y, { width: 50, align: 'right', lineBreak: false });
    const reps = p.retestedWithin ? ` (${p.retestedWithin} re)` : '';
    doc.text(`${p.athletes}${reps}`, 260, y, { width: 55, align: 'right', lineBreak: false });
    doc.text(p.averages.overallIndicator == null ? '—' : String(p.averages.overallIndicator), 325, y, { width: 75, align: 'right', lineBreak: false });

    // The SIGNED number carries the direction, not an arrow glyph: pdfkit's
    // Helvetica is WinAnsi-encoded and has no triangle/arrow, so one renders as
    // mojibake. Colour only reinforces what the sign already says.
    const d = p.deltas ? p.deltas.overallIndicator : null;
    if (!d || d.delta === null) {
      doc.fillColor(MUTED).text(p.deltas ? '—' : 'baseline', 410, y, { width: 55, align: 'right', lineBreak: false });
    } else {
      const flat = d.delta === 0;
      doc.fillColor(flat ? MUTED : bandOnLight(d.delta > 0 ? 'green' : 'red'))
        .text(`${d.delta > 0 ? '+' : ''}${d.delta}`, 410, y, { width: 55, align: 'right', lineBreak: false });
    }
    doc.fillColor(TEXT).text(p.averages.exerciseRisks == null ? '—' : String(p.averages.exerciseRisks), 475, y, { width: 55, align: 'right', lineBreak: false });
    doc.y = y + 14;
  }

  doc.moveDown(0.4);
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica').text(
    'Avg indicator is the cohort-normed 0-100 score (higher is better); avg risk is the exercise-risk burden '
    + '(lower is better). "re" counts athletes screened more than once inside the period. Change compares the '
    + 'previous period PRESENT in this table, so an empty period is skipped rather than read as a zero. Period '
    + 'averages mix cohorts - a period with a different intake reads differently for that reason alone, so treat '
    + 'these as programme throughput and direction, not as proof any individual athlete changed.',
    50, doc.y, { width: doc.page.width - 100 },
  );
}

// Within-athlete consecutive pairs. The counterpart to periodTable: each
// athlete is their own control here, which is the only way to claim athletes
// actually improved rather than the tested population having changed.
function betweenTestsBlock(doc, bt) {
  if (!bt || !bt.pairs) {
    doc.fontSize(9).fillColor(MUTED).text(
      'No athlete in this population has been screened twice yet, so there is nothing to compare test-to-test.', 50,
    );
    return;
  }
  doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(
    `${bt.pairs} consecutive test pair${bt.pairs === 1 ? '' : 's'} across ${bt.athletesWithRetest} athlete`
    + `${bt.athletesWithRetest === 1 ? '' : 's'}`
    + (bt.intervalDays.median === null ? '' : `, median ${bt.intervalDays.median} days apart`
      + (bt.intervalDays.min === bt.intervalDays.max ? '' : ` (range ${bt.intervalDays.min}-${bt.intervalDays.max})`))
    + '.', 50,
  );
  doc.moveDown(0.4);

  const total = bt.improved + bt.declined + bt.steady || 1;
  bar(doc, 'Improved', bt.improved, total, BAND.green, { valueText: String(bt.improved) });
  bar(doc, 'Unchanged', bt.steady, total, MUTED, { valueText: String(bt.steady) });
  bar(doc, 'Declined', bt.declined, total, BAND.red, { valueText: String(bt.declined) });

  ensure(doc, 16);
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(
    `Risk band improved for ${bt.bandMoves.better}, held for ${bt.bandMoves.same}, worsened for ${bt.bandMoves.worse}.`, 50,
  );
  doc.moveDown(0.3);

  const named = bt.deltas.filter((d) => d.avgDelta !== null);
  if (named.length) {
    ensure(doc, 16);
    doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED).text('AVERAGE CHANGE PER SCORE, TEST TO TEST', 50);
    doc.moveDown(0.2);
    for (const d of named) {
      ensure(doc, 13);
      const y = doc.y;
      const better = d.higherBetter ? d.avgDelta > 0 : d.avgDelta < 0;
      const flat = d.avgDelta === 0;
      doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(d.label, 50, y, { width: 150, lineBreak: false });
      doc.fillColor(flat ? MUTED : bandOnLight(better ? 'green' : 'red'))
        .text(`${d.avgDelta > 0 ? '+' : ''}${d.avgDelta}`, 205, y, { width: 60, align: 'right', lineBreak: false });
      doc.fillColor(MUTED).fontSize(8)
        .text(d.higherBetter ? '(higher is better)' : '(lower is better)', 275, y + 1, { lineBreak: false });
      doc.fillColor(TEXT);
      doc.y = y + 13;
    }
  }
}

function riskLegend(doc) {
  ensure(doc, 16);
  const y = doc.y; let x = 50;
  for (const z of [['Low (0–15)', BAND.green], ['Watch (16–25)', BAND.amber], ['Elevated (>25)', BAND.red]]) {
    doc.circle(x + 3, y + 4, 3).fill(z[1]);
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(z[0], x + 10, y, { lineBreak: false });
    x += doc.widthOfString(z[0]) + 34;
  }
  doc.fillColor(TEXT);
  doc.y = y + 12;
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica')
    .text('The HoloMotion report prints Low 0–15 · Medium 16–55 · High 56–100. AIRMS keeps the report’s Low boundary and subdivides its Medium band into Watch and Elevated so ISN can act early; readings above 55 do not occur in practice. These are the standard bands — the dashboards hold each athlete’s sport-critical regions to a tighter Watch/Elevated boundary (12/20), so a region may band one step higher on screen than here.',
      50, doc.y, { width: doc.page.width - 100 });
  doc.fillColor(TEXT);
  doc.moveDown(0.2);
}

// Physical Fitness Subitem Score table — coloured score discs per HoloMotion
// tier, matching the printed page-5 table.
function subitemTable(doc, subitems) {
  if (!subitems || typeof subitems !== 'object') {
    doc.fontSize(9).fillColor(MUTED).text('Subitem scores were not captured on this screening (older import).', 50);
    return;
  }
  const x = 50; const labelW = 150; const colW = 62; const rowH = 26;
  ensure(doc, 30 + rowH * SUBITEM_REGIONS.length + 20);
  // header
  let y = doc.y + 2;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
  SUBITEM_COLS.forEach(([, label], i) => {
    doc.text(label, x + labelW + i * colW, y, { width: colW, align: 'center', lineBreak: false });
  });
  y += 14;
  // rows
  for (const [key, label] of SUBITEM_REGIONS) {
    const r = subitems[key] || {};
    doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(label, x, y + 6, { width: labelW - 6, lineBreak: false });
    SUBITEM_COLS.forEach(([ck], i) => {
      const v = num(r[ck]);
      const cx = x + labelW + i * colW + colW / 2;
      if (v === null) {
        doc.fontSize(9).fillColor(MUTED).text('—', cx - 4, y + 6, { lineBreak: false });
      } else {
        const t = tierOf(v);
        doc.circle(cx, y + 10, 10).fill(t.color);
        doc.fillColor(t.ink).fontSize(8).font('Helvetica-Bold')
          .text(String(v), cx - 10, y + 6.5, { width: 20, align: 'center', lineBreak: false });
      }
    });
    y += rowH;
  }
  doc.y = y + 2;
  // tier legend
  let lx = 50; const ly = doc.y;
  for (const t of TIERS) {
    doc.circle(lx + 3, ly + 4, 3).fill(t.color);
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(t.label, lx + 10, ly, { lineBreak: false });
    lx += doc.widthOfString(t.label) + 34;
  }
  doc.fillColor(TEXT);
  doc.y = ly + 16;
}

// Priority-areas callout: the lowest subitem readings as labelled bars, so the
// values that actually need attention lead the section instead of hiding among
// 25 equal discs. Each bar is tier-coloured with the value + tier word.
function subitemPriorities(doc, subitems, { count = 5 } = {}) {
  if (!subitems || typeof subitems !== 'object') return;
  const all = [];
  for (const [key, label] of SUBITEM_REGIONS) {
    const r = subitems[key] || {};
    for (const [ck, clabel] of SUBITEM_COLS) {
      const v = num(r[ck]);
      if (v !== null) all.push({ label: `${label} · ${clabel}`, v });
    }
  }
  if (!all.length) return;
  all.sort((a, b) => a.v - b.v);
  const rows = all.slice(0, count);
  ensure(doc, 20 + 16 * rows.length);
  doc.fontSize(10).font('Helvetica-Bold').fillColor(NAVY).text('Priority areas — lowest subitem scores', 50);
  doc.moveDown(0.3);
  const x = 50; const w = doc.page.width - 100; const barW = w - 260;
  for (const row of rows) {
    ensure(doc, 16);
    const y = doc.y;
    const t = tierOf(row.v);
    doc.fillColor(TEXT).fontSize(9).font('Helvetica').text(row.label, x, y + 1, { width: 150, lineBreak: false });
    const bx = x + 155;
    doc.roundedRect(bx, y, barW, 11, 2).fill('#eef1f4');
    doc.roundedRect(bx, y, Math.max(2, barW * Math.min(1, row.v / 100)), 11, 2).fill(t.color);
    doc.fillColor(t.onLight).fontSize(9).font('Helvetica-Bold')
      .text(`${row.v}  ${t.label}`, bx + barW + 8, y + 1, { width: 90, lineBreak: false });
    doc.y = y + 16;
  }
  doc.fillColor(TEXT);
  doc.moveDown(0.3);
}

// Squad subitem heatmap: one row per athlete, one cell per region coloured by
// that athlete's WEAKEST reading (min of ROM/Stability/Symmetry) in the region.
// Replaces the repeated per-athlete disc grids — scan a column to spot a region
// that's weak across the squad. The per-metric detail lives in individual reports.
function squadSubitemHeatmap(doc, members) {
  const rows = members.filter((m) => m.s.subitems && typeof m.s.subitems === 'object');
  if (!rows.length) { doc.fontSize(9).fillColor(MUTED).text('No subitem scores on record for this group.', 50); return; }
  const x = 50; const nameW = 150; const colW = (doc.page.width - 100 - nameW) / SUBITEM_REGIONS.length; const rowH = 22;
  ensure(doc, 30 + rowH * rows.length + 24);
  // header
  let y = doc.y + 2;
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor(MUTED).text('Athlete', x, y, { width: nameW, lineBreak: false });
  SUBITEM_REGIONS.forEach(([, label], i) => {
    doc.text(label, x + nameW + i * colW, y, { width: colW, align: 'center', lineBreak: false });
  });
  y += 14;
  for (const m of rows) {
    ensure(doc, rowH);
    const b = m.s.overrideBand || m.s.overallBand;
    doc.circle(x + 4, y + 8, 3).fill(bandColor(b));
    doc.fillColor(TEXT).fontSize(8.5).font('Helvetica')
      .text(m.a.name, x + 12, y + 3, { width: nameW - 16, height: 12, lineBreak: false, ellipsis: true });
    SUBITEM_REGIONS.forEach(([key], i) => {
      const r = m.s.subitems[key] || {};
      const vals = SUBITEM_COLS.map(([ck]) => num(r[ck])).filter((v) => v !== null);
      const cellX = x + nameW + i * colW;
      if (!vals.length) { doc.fillColor(MUTED).fontSize(8).text('—', cellX + colW / 2 - 3, y + 4, { lineBreak: false }); return; }
      const worst = Math.min(...vals);
      const wt = tierOf(worst);
      doc.roundedRect(cellX + 3, y, colW - 6, rowH - 6, 3).fill(wt.color);
      doc.fillColor(wt.ink).fontSize(8.5).font('Helvetica-Bold')
        .text(String(worst), cellX + 3, y + 4, { width: colW - 6, align: 'center', lineBreak: false });
    });
    y += rowH;
  }
  doc.y = y + 4;
  // tier legend (squares, matching the cells)
  let lx = 50; const ly = doc.y;
  for (const t of TIERS) {
    doc.roundedRect(lx, ly, 8, 8, 2).fill(t.color);
    doc.fillColor(MUTED).fontSize(8).font('Helvetica').text(t.label, lx + 12, ly, { lineBreak: false });
    lx += doc.widthOfString(t.label) + 40;
  }
  doc.fillColor(TEXT);
  doc.y = ly + 14;
}

// Physical Fitness Subitem Score as a body figure (front + back), tier-
// coloured per HoloMotion region — the PDF counterpart of the website's
// BodyMap "ROM & Stability" mode. Reuses the SAME TIERS/tierOf() as the
// table above (not the website's colours) so the figure and the table right
// below it read as one consistent picture rather than two palettes in the
// same section. A region is judged by whichever of ROM/Stability is worse on
// that side — same rule the website figure uses.
function muscleFigure(doc, subitems, { width = 170, gap = 14 } = {}) {
  const figW = (width - gap) / 2;
  const figH = figW * (1448 / 724);
  ensure(doc, figH + 34);
  const top = doc.y;
  const left = doc.page.width / 2 - width / 2;

  const values = worstValueBySlug(subitems);
  const mergeWorst = (a, b) => (a === undefined ? b : b === undefined ? a : Math.min(a, b));

  const drawView = (parts, outline, x, cropX) => {
    const scale = figW / 724;
    doc.save();
    doc.translate(x - cropX * scale, top + 14);
    doc.scale(scale);

    doc.path(outline).lineWidth(2 / scale).fillAndStroke('#eef1f5', '#c7cedb');

    parts.forEach((part) => {
      const inScope = BODYMAP_SCOPED_SLUGS.has(part.slug);
      const draw = (paths, sideTag) => {
        if (!paths) return;
        let v;
        if (inScope) {
          v = sideTag === 'C'
            ? mergeWorst(values.get(`${part.slug}:L`), values.get(`${part.slug}:R`))
            : values.get(`${part.slug}:${sideTag}`);
        }
        const color = inScope && v !== undefined ? tierOf(v).color : '#d7dde6';
        paths.forEach((d) => {
          doc.path(d).lineWidth(0.8 / scale).fillAndStroke(color, '#3d4a5c');
        });
      };
      draw(part.path.common, 'C');
      draw(part.path.left, 'L');
      draw(part.path.right, 'R');
    });

    doc.restore();
  };

  drawView(bodyFront, frontOutline, left, 0);
  drawView(bodyBack, backOutline, left + figW + gap, 724);

  doc.fontSize(7.5).font('Helvetica').fillColor(MUTED)
    .text('Front', left, top + figH + 16, { width: figW, align: 'center', lineBreak: false });
  doc.fontSize(7.5).font('Helvetica').fillColor(MUTED)
    .text('Back', left + figW + gap, top + figH + 16, { width: figW, align: 'center', lineBreak: false });
  doc.fillColor(TEXT);
  doc.y = top + figH + 30;
  doc.x = 50;
}

// Lateral symmetry per HoloMotion region, from the subitems we already extract:
// `sym` is the report's OWN 0–100 Symmetry score (higher = better), and the
// per-side ROM/Stability say WHICH side is weaker. This is a TMG-style analysis,
// but every number is printed on the HoloMotion report — nothing is fabricated.
// Status bands reuse HoloMotion's own subitem tiers (85 / 75 / 60).
function symmetryFindings(subitems) {
  if (!subitems || typeof subitems !== 'object') return [];
  const sideAvg = (a, b) => {
    const v = [num(a), num(b)].filter((x) => x !== null);
    return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null;
  };
  const out = [];
  for (const [key, label] of SUBITEM_REGIONS) {
    const r = subitems[key] || {};
    const sym = num(r.sym);
    if (sym === null) continue;
    const l = sideAvg(r.romL, r.stabL);
    const rr = sideAvg(r.romR, r.stabR);
    let weaker = 'Balanced'; let gap = null;
    if (l !== null && rr !== null) {
      gap = Math.round(Math.abs(l - rr));
      weaker = gap < 3 ? 'Balanced' : l < rr ? 'Left' : 'Right';
    }
    const status = sym >= 85 ? 'Good symmetry' : sym >= 75 ? 'Acceptable' : sym >= 60 ? 'Mild asymmetry' : 'Marked asymmetry';
    out.push({ key, label, sym, status, tier: tierOf(sym), weaker, gap });
  }
  return out;
}

// Lateral Symmetry section — the analytic counterpart to the raw subitem table:
// region · symmetry score (tier-coloured) · plain-language status · which side
// is weaker and by how much. TMG's group/individual reports lead with exactly
// this; we already hold the data, so we surface it instead of only the numbers.
function symmetrySection(doc, subitems) {
  const rows = symmetryFindings(subitems);
  if (!rows.length) {
    doc.fontSize(9).fillColor(MUTED).text('Symmetry subitems were not captured on this screening (older import).', 50);
    return;
  }
  const x = 50; const labelW = 160; const symW = 64; const statusW = 150;
  ensure(doc, 24 + rows.length * 22 + 26);
  let y = doc.y + 2;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('Region', x, y, { lineBreak: false });
  doc.text('Symmetry', x + labelW, y, { width: symW, align: 'center', lineBreak: false });
  doc.text('Status', x + labelW + symW + 10, y, { lineBreak: false });
  doc.text('Weaker side', x + labelW + symW + statusW, y, { lineBreak: false });
  y += 15;
  for (const r of rows) {
    doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(r.label, x, y + 3, { width: labelW - 6, lineBreak: false });
    const cx = x + labelW + symW / 2;
    doc.circle(cx, y + 7, 10).fill(r.tier.color);
    doc.fillColor(r.tier.ink).fontSize(8).font('Helvetica-Bold').text(String(r.sym), cx - 10, y + 3.5, { width: 20, align: 'center', lineBreak: false });
    doc.fontSize(9).font('Helvetica').fillColor(r.sym >= 75 ? TEXT : bandOnLight('amber')).text(r.status, x + labelW + symW + 10, y + 3, { width: statusW - 12, lineBreak: false });
    doc.fillColor(MUTED).text(r.weaker === 'Balanced' ? 'Balanced' : `${r.weaker} weaker by ${r.gap}`, x + labelW + symW + statusW, y + 3, { lineBreak: false });
    y += 22;
  }
  doc.y = y + 2;
  doc.fontSize(8).fillColor(MUTED).text(
    'Symmetry is the HoloMotion 0–100 score per region (higher = more symmetric); status uses the report’s own 85 / 75 / 60 tiers. Weaker side compares the region’s left vs right ROM & stability.',
    50, doc.y, { width: doc.page.width - 100 });
  doc.fillColor(TEXT);
}

// Top-priority findings for the executive callout at the head of the individual
// report (TMG's per-athlete priority summary, done descriptively — it surfaces
// the drivers behind the band, most-severe first, without prescribing exercises).
function keyFindings(screening, subitems) {
  const items = [];
  const rated = RISKS.map(([k, label]) => ({ label, v: num(screening[k]) ?? 0 }));
  const elevated = rated.filter((r) => r.v > 25).sort((a, b) => b.v - a.v);
  const watch = rated.filter((r) => r.v > 15 && r.v <= 25).sort((a, b) => b.v - a.v);
  if (elevated.length) items.push(`Elevated exercise-risk: ${elevated.map((r) => `${r.label} ${r.v}`).join(', ')} — review before high-load work.`);
  const marked = symmetryFindings(subitems).filter((r) => r.sym < 75).sort((a, b) => a.sym - b.sym);
  if (marked.length) items.push(`Lateral asymmetry: ${marked.slice(0, 2).map((r) => `${r.label} (sym ${r.sym}${r.weaker !== 'Balanced' ? `, ${r.weaker.toLowerCase()} weaker` : ''})`).join(', ')}.`);
  if (screening.overrideBand) items.push(`Clinician override in effect: band set to ${bandLabel(screening.overrideBand)}.`);
  if (!items.length) {
    items.push(watch.length
      ? `No elevated indicators; monitoring ${watch.map((r) => `${r.label} ${r.v}`).join(', ')}.`
      : 'No priority findings — screening is within expected ranges across all measures.');
  }
  return items.slice(0, 4);
}

// Executive callout box — a tinted panel of the key findings at the top of the
// individual report, so the actionable items are visible before the detail.
function keyFindingsBox(doc, items) {
  const x = 50; const w = doc.page.width - 100; const pad = 10; const innerW = w - pad * 2;
  const lines = items.map((t) => `•  ${t}`);
  doc.fontSize(9).font('Helvetica');
  const hs = lines.map((t) => doc.heightOfString(t, { width: innerW }));
  const boxH = pad + 14 + hs.reduce((a, b) => a + b + 3, 0) + pad - 3;
  ensure(doc, boxH + 8);
  const y = doc.y;
  doc.roundedRect(x, y, w, boxH, 6).fillAndStroke('#f4f7fb', GRID);
  doc.fillColor(NAVY).fontSize(8).font('Helvetica-Bold').text('KEY FINDINGS', x + pad, y + pad, { lineBreak: false });
  let ty = y + pad + 14;
  doc.fontSize(9).font('Helvetica');
  for (let i = 0; i < lines.length; i++) {
    doc.fillColor(TEXT).text(lines[i], x + pad, ty, { width: innerW });
    ty += hs[i] + 3;
  }
  doc.y = y + boxH + 8; doc.x = 50; doc.fillColor(TEXT);
}

// Squad-level lateral symmetry — the aggregate counterpart to TMG's group
// "Team" pages. Averages each region's HoloMotion symmetry score across the
// screened squad, counts how many fall below the good tier, and reports the
// squad's weaker-side lean. `members` = [{ a, s }] with s.subitems.
function squadSymmetryAggregate(members) {
  const acc = new Map();
  for (const [key, label] of SUBITEM_REGIONS) acc.set(key, { label, syms: [], below: 0, leanL: 0, leanR: 0 });
  for (const m of members) {
    for (const f of symmetryFindings(m.s.subitems)) {
      const e = acc.get(f.key); if (!e) continue;
      e.syms.push(f.sym);
      if (f.sym < 75) e.below += 1;
      if (f.weaker === 'Left') e.leanL += 1; else if (f.weaker === 'Right') e.leanR += 1;
    }
  }
  const out = [];
  for (const e of acc.values()) {
    if (!e.syms.length) continue;
    const avg = Math.round(e.syms.reduce((a, b) => a + b, 0) / e.syms.length);
    const lean = e.leanL === e.leanR ? 'Balanced' : e.leanL > e.leanR ? `Left (${e.leanL})` : `Right (${e.leanR})`;
    out.push({ label: e.label, avg, n: e.syms.length, below: e.below, tier: tierOf(avg), lean });
  }
  return out;
}

function squadSymmetrySection(doc, members) {
  const rows = squadSymmetryAggregate(members);
  if (!rows.length) { doc.fontSize(9).fillColor(MUTED).text('No symmetry subitems on record for this group.', 50); return; }
  const x = 50; const labelW = 170; const avgW = 70; const belowW = 130;
  ensure(doc, 24 + rows.length * 22 + 26);
  let y = doc.y + 2;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('Region', x, y, { lineBreak: false });
  doc.text('Avg symmetry', x + labelW, y, { width: avgW, align: 'center', lineBreak: false });
  doc.text('Below good tier', x + labelW + avgW + 10, y, { lineBreak: false });
  doc.text('Weaker-side lean', x + labelW + avgW + belowW, y, { lineBreak: false });
  y += 15;
  for (const r of rows) {
    doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(r.label, x, y + 3, { width: labelW - 6, lineBreak: false });
    const cx = x + labelW + avgW / 2;
    doc.circle(cx, y + 7, 10).fill(r.tier.color);
    doc.fillColor(r.tier.ink).fontSize(8).font('Helvetica-Bold').text(String(r.avg), cx - 10, y + 3.5, { width: 20, align: 'center', lineBreak: false });
    doc.fontSize(9).font('Helvetica').fillColor(r.below ? bandOnLight('amber') : TEXT).text(`${r.below} of ${r.n}`, x + labelW + avgW + 10, y + 3, { lineBreak: false });
    doc.fillColor(MUTED).text(r.lean, x + labelW + avgW + belowW, y + 3, { lineBreak: false });
    y += 22;
  }
  doc.y = y + 2;
  doc.fontSize(8).fillColor(MUTED).text(
    'Average of each region’s HoloMotion symmetry score across screened athletes; “below good tier” counts those under 75. Weaker-side lean is how many athletes are weaker on that side.',
    50, doc.y, { width: doc.page.width - 100 });
  doc.fillColor(TEXT);
}

// Most-flagged muscles across the squad (distinct athletes per muscle+kind) —
// the report counterpart of the coach dashboard's muscle hotspots.
function squadMuscleHotspots(members) {
  const map = new Map(); // muscle|kind -> Set(athleteId)
  const add = (muscle, kind, aid) => {
    if (!muscle) return;
    const k = `${muscle}|${kind}`;
    if (!map.has(k)) map.set(k, new Set());
    map.get(k).add(aid);
  };
  for (const m of members) {
    const mf = m.s.muscleFlags || {};
    (mf.myodynamia || []).forEach((x) => add(x.muscle, 'weak', m.a.athleteId));
    (mf.tension || []).forEach((x) => add(x.muscle, 'tight', m.a.athleteId));
  }
  return [...map.entries()]
    .map(([k, set]) => { const [muscle, kind] = k.split('|'); return { muscle, kind, count: set.size }; })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

// Radar chart (TMG-style visual anchor) — polygon over n axes with grid rings.
// `guide` (a flat number or a per-axis array, same order as `axes`) draws a
// dashed unfilled threshold polygon UNDER the value polygon — the same
// Elevated-boundary guide the website's RiskRadar draws, so the printed
// report and the dashboard read the same way.
function radar(doc, axes, { max = 40, rings = 4, r = 85, color = GOLD, guide = null } = {}) {
  ensure(doc, r * 2 + 70);
  const cx = doc.page.width / 2;
  const cy = doc.y + r + 26;
  const n = axes.length;
  const pt = (i, rad) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };
  // grid rings + spokes
  doc.lineWidth(0.7).strokeColor(GRID);
  for (let g = 1; g <= rings; g++) {
    const rad = (r * g) / rings;
    const [sx, sy] = pt(0, rad);
    doc.moveTo(sx, sy);
    for (let i = 1; i <= n; i++) { const [px, py] = pt(i % n, rad); doc.lineTo(px, py); }
    doc.stroke();
  }
  for (let i = 0; i < n; i++) { const [px, py] = pt(i, r); doc.moveTo(cx, cy).lineTo(px, py).stroke(); }
  // threshold guide polygon — dashed, unfilled, drawn before the value
  // polygon so it reads as a boundary rather than a second reading.
  if (guide !== null && guide !== undefined) {
    const guideVals = axes.map((a, i) => {
      const gv = Array.isArray(guide) ? guide[i] : guide;
      return pt(i, r * Math.max(0, Math.min(1, gv / max)));
    });
    doc.dash(2.5, { space: 2 }).lineWidth(1).strokeColor(BAND.red);
    doc.moveTo(guideVals[0][0], guideVals[0][1]);
    for (let i = 1; i <= n; i++) doc.lineTo(guideVals[i % n][0], guideVals[i % n][1]);
    doc.stroke();
    doc.undash();
  }
  const vals = axes.map((a, i) => pt(i, r * Math.max(0, Math.min(1, (num(a.value) ?? 0) / max))));
  doc.moveTo(vals[0][0], vals[0][1]);
  for (let i = 1; i <= n; i++) doc.lineTo(vals[i % n][0], vals[i % n][1]);
  doc.fillOpacity(0.22).fillAndStroke(color, color);
  doc.fillOpacity(1).lineWidth(1);
  vals.forEach(([px, py]) => doc.circle(px, py, 1.8).fill(color));
  // labels
  doc.fontSize(7.5).font('Helvetica').fillColor(TEXT);
  for (let i = 0; i < n; i++) {
    const [px, py] = pt(i, r + 14);
    doc.text(axes[i].label, px - 42, py - 4, { width: 84, align: 'center', lineBreak: false });
  }
  doc.fillColor(TEXT);
  doc.y = cy + r + 24;
  doc.x = 50;
}

function bandPill(doc, band, x, y) {
  const c = bandColor(band);
  doc.roundedRect(x, y, 130, 20, 4).fill(c);
  doc.fillColor(bandInk(band)).fontSize(9).font('Helvetica-Bold').text(bandLabel(band).toUpperCase(), x, y + 6, { width: 130, align: 'center', lineBreak: false });
  doc.fillColor(TEXT);
}

function bullets(doc, lines) {
  for (const line of lines) {
    ensure(doc, 16);
    doc.fontSize(9).fillColor(GOLD).font('Helvetica-Bold').text('•  ', 50, doc.y, { continued: true })
      .fillColor(TEXT).font('Helvetica').text(line);
    doc.moveDown(0.15);
  }
}

// Data-driven interpretation bullets (TMG-style "Interpretation" section).
function interpret(screening, cohort, subitems) {
  const out = [];
  if (cohort) {
    const z = compositeZ(screening, cohort.stats);
    if (z !== null) {
      out.push(z < 0
        ? `Overall composite is BELOW the cohort average (z = ${z.toFixed(2)} vs ${cohort.tier}-tier cohort, n=${cohort.n}).`
        : `Overall composite is at or above the cohort average (z = ${z.toFixed(2)} vs ${cohort.tier}-tier cohort, n=${cohort.n}).`);
    }
    const comps = orientedComponents(screening);
    const below = Object.keys(COMPONENT_LABELS)
      .filter((c) => cohort.stats[c] && comps[c] !== null && comps[c] !== undefined && comps[c] < cohort.stats[c].mean)
      .map((c) => COMPONENT_LABELS[c]);
    if (below.length) out.push(`Below the cohort average on: ${below.join(', ')}.`);
  } else {
    out.push('No approved cohort norm yet — shown values are uncompared.');
  }
  const flaggedRisks = RISKS
    .map(([k, label]) => ({ label, v: num(screening[k]) ?? 0, zone: riskZone(num(screening[k]) ?? 0) }))
    .filter((r) => r.zone.label !== 'Low')
    .sort((a, b) => b.v - a.v);
  if (flaggedRisks.length) {
    out.push(`Exercise-risk indicators beyond Low: ${flaggedRisks.map((r) => `${r.label} ${r.v} (${r.zone.label})`).join(' · ')}.`);
  } else {
    out.push('All exercise-risk indicators are in the Low band.');
  }
  // Lateral symmetry — graded, TMG-style, naming the weaker side (replaces the
  // old flat 8-pt gap list; detail is in the Lateral Symmetry section).
  const symRows = symmetryFindings(subitems);
  const asym = symRows.filter((r) => r.sym < 75).sort((a, b) => a.sym - b.sym);
  if (asym.length) {
    const worst = asym.slice(0, 3).map((r) =>
      `${r.label} (sym ${r.sym}${r.weaker !== 'Balanced' ? `, ${r.weaker.toLowerCase()} weaker` : ''})`);
    out.push(`Lateral symmetry below the good tier in ${asym.length} region${asym.length === 1 ? '' : 's'}: ${worst.join(' · ')}.`);
  } else if (symRows.length) {
    out.push('Lateral symmetry is acceptable across all measured regions.');
  }
  const mf = screening.muscleFlags || {};
  const nMyo = (mf.myodynamia || []).length; const nTen = (mf.tension || []).length;
  if (nMyo || nTen) out.push(`Muscle flags on record: ${nMyo} myodynamia deficiency, ${nTen} tension.`);
  if (screening.overrideBand) {
    out.push(`Clinician override in effect: ${bandLabel(screening.overrideBand)} — "${screening.overrideNote || ''}" (${screening.overrideBy || 'medical'}, ${fmtDate(screening.overrideAt)}).`);
  }
  return out;
}


module.exports = {
  BAND, ELEVATED_THRESHOLD, GOLD, GRID, MUTED, NAVY, RISKS, SCORE_ROWS, TEXT, bandColor, bandLabel,
  bandPill, bandTable, bar, betweenTestsBlock, bullets, cover, ensure, fileSlug, finish, fmtDate,
  hotspotBar, interpret, keyFindings, keyFindingsBox, muscleFigure, num, periodTable, radar,
  riskLegend, sectionTitle, squadMuscleHotspots, squadSubitemHeatmap, squadSymmetrySection, startDoc,
  subitemPriorities, subitemTable, symmetrySection, todayStamp, zoneGauge,
};
