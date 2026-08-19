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
const { effectiveBand, BAND_LABEL } = require('./bands');
const {
  bodyFront, bodyBack, frontOutline, backOutline, SCOPED_SLUGS: BODYMAP_SCOPED_SLUGS, worstValueBySlug,
} = require('../utils/bodymap');
const { aggregateSubitems } = require('./subitemAggregate');

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
// One vocabulary, from utils/bands.js. This was a private copy — the reason a
// band rename in bands.js would have left the PDFs still saying "Safe".
const bandLabel = (b) => BAND_LABEL[b] || '\u2014';

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
// The report's own HoloMotion wording for the seven shown indicators (LDH
// deliberately absent) — one definition, in utils/riskIndicators.js.
const { REPORT_RISKS: RISKS } = require('./riskIndicators');

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
// How a single first-vs-last change reads: its text and its colour.
//
// Extracted from the individual report's route handler, which is why it lives
// here: the rule had already been written WRONG there. It printed "+0" in green,
// because 0 satisfies both `d >= 0` and `d <= 0` and so passed the "improved"
// test in either orientation — four of the five columns on the most
// clinically-read document AIRMS produces were claiming an improvement that had
// not happened.
//
// THREE cases, never two. "moved down", "moved up" and "did not move" are
// distinct, and every defect in DESIGN_DECISIONS section 30 came from collapsing
// the third into one of the first two. `higherBetter` is false for exercise
// risks, which improve by falling.
//
// This comparison deliberately applies NO detectable-change threshold: the dead
// band is cohort-derived and is not on an athlete-scoped payload, the same reason
// the trend sparklines drawn beneath it assert no verdict.
function changeCell(delta, higherBetter = true) {
  if (delta === null || delta === undefined || delta === '' || Number.isNaN(Number(delta))) {
    return { text: '\u2014', color: MUTED, moved: false };
  }
  const d = Number(delta);
  if (d === 0) return { text: '0', color: MUTED, moved: false };
  const good = higherBetter ? d > 0 : d < 0;
  return { text: d > 0 ? `+${d}` : `${d}`, color: good ? BAND.green : BAND.red, moved: true };
}

// ── WinAnsi safety ─────────────────────────────────────────────────────────
// pdfkit's built-in Helvetica is WinAnsi-encoded. A character outside that set
// does not warn, does not throw and does not render — it measures ZERO WIDTH and
// comes out as mojibake on the page. The toolkit already knew this for arrow
// glyphs (see the note in periodTable) and avoided them in code it wrote.
//
// What that note could not protect is text arriving from the DATABASE. The
// escalation factors persisted on `screenings.factors` contain a real "greater
// than or equal" sign, generated in overallIndicator.js, and the audit summary
// written when a coach's sport changes contains a real arrow. Both are correct
// on the web, where they render properly; both are unreadable the moment a
// report prints them. The holistic report's flagged list printed the first of
// these as `("e25)`.
//
// So the fix belongs at the boundary where the constraint actually lives —
// drawing — not in the data, which is shared with surfaces that render it fine.
// Doing it here also repairs rows ALREADY stored, which editing the producers
// could not. `doc.text` is wrapped once at document creation, so every draw is
// covered, including code written later that never hears about this.
const WIN_ANSI_SUBS = [
  [/≥/g, '>='], [/≤/g, '<='], [/≠/g, '!='], [/≈/g, '~'],
  [/→/g, '->'], [/←/g, '<-'], [/↔/g, '<->'],
  [/−/g, '-'], [/─/g, '-'], [/ /g, ' '], [/﻿/g, ''],
];
function winAnsiSafe(v) {
  if (typeof v !== 'string' || !v) return v;
  let out = v;
  for (const [re, rep] of WIN_ANSI_SUBS) out = out.replace(re, rep);
  return out;
}

// Wrap `doc.text` so no unrenderable character can reach the page, whatever
// wrote it. Returns the same doc.
function guardText(doc) {
  const original = doc.text.bind(doc);
  doc.text = (str, ...rest) => original(winAnsiSafe(str), ...rest);
  return doc;
}

function startDoc(res, filename) {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return guardText(doc);
}

// Same document, collected into memory instead of piped at a response — for the
// monthly digest, which has to attach the bytes rather than stream them. The
// promise resolves on `finish(doc, …)`, which is what ends the stream.
function bufferDoc() {
  const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  return { doc: guardText(doc), done };
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
  const x = 50; const w = doc.page.width - 100;
  const y = doc.y;
  // The value slot was a fixed 50pt. "58 of 62 (94%)" needs about 70 at 9pt
  // bold, so on the Programme Activity cover it wrapped and the second line
  // landed on top of the row beneath it. Measure the text and give the bar
  // whatever is left, so a long value shortens the bar instead of colliding.
  const valueText = opts.valueText ?? String(value ?? '—');
  const prevSize = doc._fontSize;
  doc.fontSize(9).font('Helvetica-Bold');
  const valueW = Math.max(50, Math.ceil(doc.widthOfString(valueText)) + 4);
  doc.fontSize(prevSize).font('Helvetica');
  const barW = w - 140 - valueW;
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
    valueText, bx + barW + 8, y + 1, { width: valueW, lineBreak: false });
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
  doc.text('None flagged', 300, yStart, { width: 70, align: 'right', lineBreak: false });
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
// Seasonality — which part of the YEAR carries the risk, every year pooled.
//
// The caveat is drawn FIRST and unconditionally. This table's whole danger is
// that it reads like a finding at a glance: four quarters, one of them worst,
// therefore move the pre-season block. Until the pattern has repeated across
// years that reading is unsupported, and the reader has to meet that sentence
// before the numbers, not after them.
function seasonTable(doc, season) {
  if (!season || !season.buckets) return;
  const present = season.buckets.filter((b) => b.tests > 0);

  doc.fontSize(8.5).fillColor(MUTED).font('Helvetica').text(
    season.sufficient
      ? `Every screening pooled by quarter of the year, across ${season.yearsCovered} years `
        + `(${season.years.join(', ')}). A quarter is only worth acting on if it repeats.`
      : `NOT YET A SEASONAL READING. All screenings on record fall in ${season.yearsCovered === 1 ? 'a single year' : 'no complete year'}`
        + `${season.years.length ? ` (${season.years.join(', ')})` : ''}, so a quarter that looks worst here is `
        + 'indistinguishable from the quarter in which the weaker squads happened to be screened. '
        + 'Shown for completeness; it becomes a seasonal reading once a second year of screening exists.',
    50, doc.y, { width: doc.page.width - 100 },
  );
  doc.moveDown(0.5);

  if (!present.length) {
    doc.fontSize(9).fillColor(MUTED).text('No screenings on record for this population.', 50);
    return;
  }

  const yStart = doc.y;
  doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('Quarter', 50, yStart, { lineBreak: false });
  doc.text('Years', 200, yStart, { width: 45, align: 'right', lineBreak: false });
  doc.text('Tests', 255, yStart, { width: 45, align: 'right', lineBreak: false });
  doc.text('Athletes', 310, yStart, { width: 55, align: 'right', lineBreak: false });
  doc.text('Flagged', 375, yStart, { width: 60, align: 'right', lineBreak: false });
  doc.text('Avg indicator', 445, yStart, { width: 85, align: 'right', lineBreak: false });
  doc.y = yStart + 14;

  for (const b of season.buckets) {
    ensure(doc, 15);
    const y = doc.y;
    const empty = b.tests === 0;
    doc.fontSize(9).font(season.worst === b.key ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(empty ? MUTED : TEXT)
      .text(b.label, 50, y, { width: 145, lineBreak: false });
    doc.font('Helvetica').fillColor(empty ? MUTED : TEXT);
    doc.text(empty ? '—' : String(b.years), 200, y, { width: 45, align: 'right', lineBreak: false });
    doc.text(empty ? 'none' : String(b.tests), 255, y, { width: 45, align: 'right', lineBreak: false });
    doc.text(empty ? '—' : String(b.athletes), 310, y, { width: 55, align: 'right', lineBreak: false });
    // A share, not a count: ISN does not screen the same number of athletes each
    // quarter, so counts would rank by throughput rather than by risk.
    doc.fillColor(empty || b.flaggedShare === null ? MUTED
      : bandOnLight(b.flaggedShare >= 0.5 ? 'red' : b.flaggedShare >= 0.25 ? 'amber' : 'green'))
      .text(b.flaggedShare === null ? '—' : `${Math.round(b.flaggedShare * 100)}%`, 375, y, { width: 60, align: 'right', lineBreak: false });
    doc.fillColor(empty ? MUTED : TEXT)
      .text(b.averages.overallIndicator == null ? '—' : String(b.averages.overallIndicator), 445, y, { width: 85, align: 'right', lineBreak: false });
    doc.y = y + 14;
  }

  doc.moveDown(0.4);
  doc.fontSize(7.5).fillColor(MUTED).font('Helvetica').text(
    'Flagged is the share of screenings in that quarter that landed at Needs attention or Immediate assessment '
    + '(a share, not a count, because throughput differs by quarter). Years counts the distinct years contributing '
    + 'to the quarter.'
    + (season.worst
      ? ` ${season.buckets.find((b) => b.key === season.worst).label} carries the highest flagged share and has `
        + 'repeated across years — the candidate for a seasonal preventive block.'
      : season.sufficient
        ? ' No quarter stands clear of the others by more than rounding, so there is no seasonal candidate.'
        : ''),
    50, doc.y, { width: doc.page.width - 100 },
  );
  doc.moveDown(0.6);
}

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
function betweenTestsBlock(doc, bt, rel = null) {
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

    // WHERE THE LINE IS DRAWN, on the document as well as the screen.
    // A printed report outlives the session that produced it, so the threshold
    // that decided "improved" versus "unchanged" has to travel with it —
    // otherwise a reader six months later has a verdict and no way to audit it.
    const derived = (rel && rel.scores ? rel.scores : []).filter((r) => r.sufficient);
    ensure(doc, 30);
    doc.moveDown(0.3);
    doc.fontSize(7.5).font('Helvetica').fillColor(MUTED).text(
      derived.length
        ? 'A change counts as real only past that score\'s minimal detectable change ('
          + derived.map((r) => `${r.label} ${String.fromCharCode(0xB1)}${r.mdc95}`).join(', ')
          + '), derived from the variation between athletes\' own repeat screenings. Those repeats are '
          + 'months apart and contain genuine change as well as measurement error, so it is an upper '
          + 'bound on the error and under-calls change rather than over-calling it.'
        : `Changes smaller than ${String.fromCharCode(0xB1)}${(rel && rel.fallback) || 2} are reported as `
          + 'unchanged. That figure is an assumption, not a measurement: deriving one needs '
          + `${(rel && rel.minPairs) || 20} repeat screenings per score and the programme does not yet `
          + 'have them.',
      50, doc.y, { width: doc.page.width - 100 },
    );
    doc.fillColor(TEXT);
  }
}

// One slice dimension for a focused indicator: group, n, the Low/Watch/Elevated
// split, the share elevated, and the group average. The share is what a policy
// decision hangs on — a squad of 4 with 3 elevated matters more than one of 60
// with 5 — so it is printed, not left to be worked out from the counts.
function focusTable(doc, title, rows) {
  // A one-row breakdown teaches nothing — it happens when the population is
  // already filtered on this dimension (focus Knee within Female, then "By
  // gender" is just Female again). Skip it rather than print a tautology.
  if (!rows || rows.length < 2) return;
  ensure(doc, 30 + rows.length * 14);
  doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT).text(title, 50);
  doc.moveDown(0.25);
  const y0 = doc.y;
  doc.fontSize(8).font('Helvetica-Bold').fillColor(MUTED);
  doc.text('Group', 50, y0, { lineBreak: false });
  doc.text('n', 230, y0, { width: 30, align: 'right', lineBreak: false });
  doc.text('Low', 270, y0, { width: 40, align: 'right', lineBreak: false });
  doc.text('Watch', 320, y0, { width: 45, align: 'right', lineBreak: false });
  doc.text('Elevated', 375, y0, { width: 55, align: 'right', lineBreak: false });
  doc.text('% elev.', 440, y0, { width: 45, align: 'right', lineBreak: false });
  doc.text('Avg', 495, y0, { width: 40, align: 'right', lineBreak: false });
  doc.y = y0 + 13;

  for (const r of rows) {
    ensure(doc, 14);
    const y = doc.y;
    const share = r.n ? Math.round((r.high / r.n) * 100) : 0;
    doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(String(r.label), 50, y, { width: 175, lineBreak: false });
    doc.text(String(r.n), 230, y, { width: 30, align: 'right', lineBreak: false });
    doc.fillColor(bandOnLight('green')).text(String(r.ok), 270, y, { width: 40, align: 'right', lineBreak: false });
    doc.fillColor(bandOnLight('amber')).text(String(r.watch), 320, y, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor(bandOnLight('red')).text(String(r.high), 375, y, { width: 55, align: 'right', lineBreak: false });
    doc.fillColor(r.high ? bandOnLight('red') : MUTED).font('Helvetica-Bold')
      .text(`${share}%`, 440, y, { width: 45, align: 'right', lineBreak: false });
    doc.fillColor(TEXT).font('Helvetica')
      .text(r.avg === null || r.avg === undefined ? '-' : String(r.avg), 495, y, { width: 40, align: 'right', lineBreak: false });
    doc.y = y + 13;
  }
  doc.moveDown(0.4);
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
// ── Throughput chart ────────────────────────────────────────────────────────
// Tests per period as columns, with the distinct-athlete share drawn inside each
// one, and the population's average indicator as a line across the top. The
// report had only the table underneath, which lists the same numbers but cannot
// show the SHAPE — that a quarter halved, or that throughput rose while the
// average fell. Matches PeriodChart on Programme Activity.
//
// Two quantities on one frame, deliberately: columns are a count and the line is
// a 0-100 score, so they get separate scales and the line is labelled at its
// ends rather than sharing the column axis. Anything else would be the
// non-commensurable-axis mistake this codebase keeps writing up.
function throughputChart(doc, periods, opts = {}) {
  const rows = (periods || []).filter(Boolean);
  if (rows.length < 2) return; // one period is not a trend; the table says it
  const W = doc.page.width - 100;
  const H = opts.height || 150;
  const padL = 26; const padB = 18; const padT = 10;
  ensure(doc, H + 26);
  const x0 = 50; const y0 = doc.y;
  const plotW = W - padL; const plotH = H - padB - padT;
  const maxTests = Math.max(...rows.map((p) => p.tests || 0), 1);
  const slot = plotW / rows.length;
  const bw = Math.min(slot * 0.62, 46);

  // Columns: total tests, with distinct athletes as the darker inner portion.
  rows.forEach((p, i) => {
    const cx = x0 + padL + i * slot + (slot - bw) / 2;
    const h = ((p.tests || 0) / maxTests) * plotH;
    const y = y0 + padT + plotH - h;
    doc.rect(cx, y, bw, h).fill('#7aa7cc');
    const inner = p.tests ? Math.min(1, (p.athletes || 0) / p.tests) : 0;
    if (inner > 0) doc.rect(cx, y + h - h * inner, bw, h * inner).fill(NAVY);
    doc.fontSize(6.5).fillColor(MUTED).font('Helvetica')
      .text(String(p.tests ?? 0), cx - 4, y - 8, { width: bw + 8, align: 'center', lineBreak: false });
    doc.text(String(p.label || '').slice(0, 9), x0 + padL + i * slot, y0 + padT + plotH + 4,
      { width: slot, align: 'center', lineBreak: false });
  });

  // The average-indicator line, on its own 0-100 scale.
  const key = opts.lineKey || 'overallIndicator';
  const pts = rows.map((p, i) => {
    const v = p.averages ? num(p.averages[key]) : null;
    return v === null ? null : { x: x0 + padL + i * slot + slot / 2, y: y0 + padT + (1 - v / 100) * plotH, v };
  });
  doc.save().lineWidth(1.2).strokeColor(GOLD);
  let started = false;
  for (const pt of pts) {
    if (!pt) { started = false; continue; }
    if (!started) { doc.moveTo(pt.x, pt.y); started = true; } else doc.lineTo(pt.x, pt.y);
  }
  doc.stroke().restore();
  for (const pt of pts) if (pt) doc.circle(pt.x, pt.y, 1.8).fill(GOLD);
  // Labelled at the ends only — a number over every point buries the shape.
  const ends = pts.filter(Boolean);
  if (ends.length) {
    doc.fontSize(6.5).fillColor(GOLD).font('Helvetica-Bold');
    doc.text(String(ends[0].v), ends[0].x - 16, ends[0].y - 9, { width: 32, align: 'center', lineBreak: false });
    if (ends.length > 1) {
      const last = ends[ends.length - 1];
      doc.text(String(last.v), last.x - 16, last.y - 9, { width: 32, align: 'center', lineBreak: false });
    }
  }

  doc.lineWidth(0.7).strokeColor(GRID)
    .moveTo(x0 + padL, y0 + padT + plotH).lineTo(x0 + padL + plotW, y0 + padT + plotH).stroke();
  doc.fontSize(6.5).fillColor(MUTED).font('Helvetica')
    .text(String(maxTests), x0, y0 + padT - 2, { width: padL - 4, align: 'right', lineBreak: false })
    .text('0', x0, y0 + padT + plotH - 6, { width: padL - 4, align: 'right', lineBreak: false });
  doc.fillColor(TEXT);
  doc.y = y0 + H + 2;
  doc.fontSize(7).fillColor(MUTED).text(
    'Column height is tests performed; the darker portion is distinct athletes, so a period of many '
    + 'retests looks different from a period of many new ones. The gold line is the average overall '
    + 'indicator on its own 0-100 scale - it shares the frame, not the axis.',
    50, doc.y, { width: W },
  );
  doc.fillColor(TEXT);
  doc.moveDown(0.3);
}

// ── Change bars ─────────────────────────────────────────────────────────────
// One diverging bar per score on a shared DELTA axis, right for better. The
// report listed these as signed numbers, which makes "ROM fell 5.2 while
// stability rose 2.6" something the reader has to assemble. Mirrors MetricDeltas
// on the dashboard, including the rule that cost a redesign there: bar DIRECTION
// is the oriented gain (exercise risks improve by falling, so a drop draws right)
// while the printed number keeps its true sign.
function changeBars(doc, deltas, opts = {}) {
  const rows = (deltas || [])
    .filter((d) => d && d.avgDelta !== null && d.avgDelta !== undefined)
    .map((d) => ({ ...d, gain: d.higherBetter === false ? -d.avgDelta : d.avgDelta }))
    .sort((a, b) => Math.abs(b.gain) - Math.abs(a.gain));
  if (!rows.length) return;

  const W = doc.page.width - 100;
  const labelW = 96; const numW = 46; const dirW = 62;
  const trackW = W - labelW - numW - dirW - 16;
  const rowH = 15;
  ensure(doc, rowH * rows.length + 26);
  const x0 = 50;
  // The scale must include the DEAD BAND, not just the biggest move. Scaled to
  // the largest delta alone, a -1.8 against a +-2 threshold drew the longest bar
  // on the figure and labelled it "steady" — the chart shouting significance at
  // a change section 27 says is indistinguishable from noise.
  const bands = rows.map((r) => Number(r.deadBand) || 0);
  const max = Math.max(...rows.map((r) => Math.abs(r.gain)), ...bands, 0.1);
  const mid = x0 + labelW + trackW / 2;

  doc.fontSize(6.5).font('Helvetica-Bold').fillColor(MUTED)
    .text('worse <- change -> better', x0 + labelW, doc.y, { width: trackW, align: 'center', lineBreak: false });
  doc.y += 10;

  for (const r of rows) {
    ensure(doc, rowH);
    const y = doc.y;
    doc.fontSize(8.5).font('Helvetica').fillColor(TEXT)
      .text(r.label, x0, y + 2, { width: labelW - 6, lineBreak: false, ellipsis: true });
    doc.rect(x0 + labelW, y + 1, trackW, rowH - 5).fill('#f1f4f7');
    // The zone in which a change cannot be told from measurement error, drawn
    // so a bar that sits inside it is SEEN to sit inside it.
    const bw = ((Number(r.deadBand) || 0) / max) * (trackW / 2);
    if (bw > 0.4) doc.rect(mid - bw, y + 1, bw * 2, rowH - 5).fill('#e4e9ee');
    doc.save().lineWidth(0.6).strokeColor('#c3cbd4')
      .moveTo(mid, y).lineTo(mid, y + rowH - 3).stroke().restore();

    const w = (Math.abs(r.gain) / max) * (trackW / 2);
    const tone = r.direction === 'improving' ? BAND.green
      : r.direction === 'declining' ? BAND.red : MUTED;
    if (w > 0.4) {
      // A bar inside the dead band is drawn as an outline: present, measured,
      // and visibly not claiming to be a real move.
      const inside = Math.abs(r.gain) < (Number(r.deadBand) || 0);
      const bx2 = r.gain >= 0 ? mid : mid - w;
      if (inside) {
        doc.save().lineWidth(0.7).strokeColor(MUTED)
          .rect(bx2, y + 1, w, rowH - 5).stroke().restore();
      } else {
        doc.rect(bx2, y + 1, w, rowH - 5).fill(tone);
      }
    }
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(tone)
      .text(`${r.avgDelta > 0 ? '+' : ''}${r.avgDelta}`, x0 + labelW + trackW + 6, y + 2,
        { width: numW, align: 'right', lineBreak: false });
    doc.fontSize(7.5).font('Helvetica').fillColor(MUTED)
      .text(r.direction || 'steady', x0 + labelW + trackW + numW + 12, y + 3, { width: dirW, lineBreak: false });
    doc.y = y + rowH;
  }
  doc.fillColor(TEXT);
  doc.moveDown(0.2);
  doc.fontSize(7).fillColor(MUTED).text(
    (opts.note || '')
    + ' The shaded band either side of centre is the change too small to be told from measurement '
    + 'error; a bar drawn as an outline sits inside it and is reported as steady. Bars share one scale '
    + 'and point right for BETTER rather than for a positive number - exercise risks improve by '
    + 'falling, so a drop there is drawn right like any other gain while the printed figure keeps its '
    + 'true sign.',
    50, doc.y, { width: W },
  );
  doc.fillColor(TEXT);
  doc.moveDown(0.3);
}

// ── Risk vs movement scatter ────────────────────────────────────────────────
// The §25 finding the printed reports had no way to carry. Total Score and
// Exercise Risks measure different halves of the HoloMotion report, so an
// athlete can move well and still score risky — 13 of the seeded squad do, and
// no averaged panel or ranked table surfaces them, because averaging is exactly
// what hides a diagonal relationship.
//
// Quadrants split on the group's own MEDIANS rather than fixed cut-offs: the
// question is "who is unusual for this squad", and a fixed line would put an
// entire strong cohort in one box and say nothing.
function riskMovementScatter(doc, points, opts = {}) {
  const pts = (points || [])
    .map((p) => ({ x: num(p.x), y: num(p.y), band: p.band, name: p.name }))
    .filter((p) => p.x !== null && p.y !== null);
  if (pts.length < 3) {
    doc.fontSize(9).fillColor(MUTED).text('Not enough scored athletes to plot a distribution.', 50);
    return;
  }

  const W = doc.page.width - 100;
  const H = opts.height || 190;
  const padL = 34; const padB = 24; const padT = 8; const padR = 8;
  ensure(doc, H + 46);
  const x0 = 50; const y0 = doc.y;
  const plotW = W - padL - padR; const plotH = H - padT - padB;

  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
  const pad = (lo, hi) => { const s = (hi - lo) || 1; return [lo - s * 0.08, hi + s * 0.08]; };
  const [xMin, xMax] = pad(Math.min(...xs), Math.max(...xs));
  const [yMin, yMax] = pad(Math.min(...ys), Math.max(...ys));
  const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const xMed = med(xs); const yMed = med(ys);

  const px = (v) => x0 + padL + ((v - xMin) / (xMax - xMin)) * plotW;
  // y is inverted: higher exercise risk sits HIGHER on the page, so "bad" reads up.
  const py = (v) => y0 + padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;

  doc.rect(x0 + padL, y0 + padT, plotW, plotH).fill('#fbfcfd');
  // Median split.
  doc.save().lineWidth(0.7).dash(3, { space: 2 }).strokeColor('#c3cbd4');
  doc.moveTo(px(xMed), y0 + padT).lineTo(px(xMed), y0 + padT + plotH).stroke();
  doc.moveTo(x0 + padL, py(yMed)).lineTo(x0 + padL + plotW, py(yMed)).stroke();
  doc.undash().restore();

  // Quadrant captions, seated in the corners they describe.
  const labels = opts.quadrants || [];
  if (labels.length === 4) {
    doc.fontSize(6.5).font('Helvetica').fillColor('#9aa4b0');
    doc.text(labels[0], x0 + padL + 4, y0 + padT + 3, { width: plotW / 2 - 8, lineBreak: false });
    doc.text(labels[1], x0 + padL + plotW / 2 + 4, y0 + padT + 3, { width: plotW / 2 - 8, align: 'right', lineBreak: false });
    doc.text(labels[3], x0 + padL + 4, y0 + padT + plotH - 10, { width: plotW / 2 - 8, lineBreak: false });
    doc.text(labels[2], x0 + padL + plotW / 2 + 4, y0 + padT + plotH - 10, { width: plotW / 2 - 8, align: 'right', lineBreak: false });
  }

  for (const p of pts) {
    doc.circle(px(p.x), py(p.y), 2.6).fillOpacity(0.8).fill(bandColor(p.band) || NAVY).fillOpacity(1);
  }

  doc.lineWidth(0.7).strokeColor(GRID);
  doc.moveTo(x0 + padL, y0 + padT + plotH).lineTo(x0 + padL + plotW, y0 + padT + plotH).stroke();
  doc.moveTo(x0 + padL, y0 + padT).lineTo(x0 + padL, y0 + padT + plotH).stroke();

  doc.fontSize(7).fillColor(MUTED).font('Helvetica');
  doc.text(String(Math.round(xMin)), x0 + padL, y0 + padT + plotH + 4, { lineBreak: false });
  doc.text(String(Math.round(xMax)), x0 + padL + plotW - 20, y0 + padT + plotH + 4, { width: 20, align: 'right', lineBreak: false });
  // y needs numbers too. Without them the axis says which way is worse but not
  // by how much, so a dot near the top could be 22 or 60.
  doc.text(String(Math.round(yMax)), x0, y0 + padT - 2, { width: padL - 4, align: 'right', lineBreak: false });
  doc.text(String(Math.round(yMin)), x0, y0 + padT + plotH - 7, { width: padL - 4, align: 'right', lineBreak: false });
  doc.text(opts.xLabel || 'Total Score', x0 + padL, y0 + padT + plotH + 13, { width: plotW, align: 'center', lineBreak: false });
  doc.save().rotate(-90, { origin: [x0 + 10, y0 + padT + plotH / 2] })
    .text(opts.yLabel || 'Exercise Risks', x0 + 10 - 40, y0 + padT + plotH / 2 - 4, { width: 80, align: 'center', lineBreak: false })
    .restore();

  doc.fillColor(TEXT);
  doc.y = y0 + H + 6;
  doc.fontSize(7.5).fillColor(MUTED).text(
    `${pts.length} athletes. Dashed lines are this group's medians (Total ${Math.round(xMed)}, `
    + `Risks ${Math.round(yMed)}), so the quadrants say who is unusual FOR THIS SQUAD rather than against a `
    + 'fixed cut-off. Dot colour is the athlete\'s risk band.', 50, doc.y, { width: W });
  doc.fillColor(TEXT);
  doc.moveDown(0.4);
}

// ── Distribution histogram ──────────────────────────────────────────────────
// A mean of 50 is produced equally by everyone sitting at 50 and by half the
// squad at 30 with the other half at 70, and those are different institutions.
// The population-average table above cannot tell them apart; this can.
function distributionHistogram(doc, values, opts = {}) {
  const vals = (values || []).map(num).filter((v) => v !== null);
  if (vals.length < 3) {
    doc.fontSize(9).fillColor(MUTED).text('Not enough scored athletes to plot a distribution.', 50);
    return;
  }
  const lo = opts.min ?? 0; const hi = opts.max ?? 100; const binSize = opts.binSize || 5;
  const nBins = Math.ceil((hi - lo) / binSize);
  const bins = new Array(nBins).fill(0);
  for (const v of vals) {
    const i = Math.min(nBins - 1, Math.max(0, Math.floor((v - lo) / binSize)));
    bins[i] += 1;
  }
  const peak = Math.max(...bins, 1);

  const W = doc.page.width - 100;
  const H = opts.height || 130;
  const padB = 16; const padL = 20;
  ensure(doc, H + 40);
  const x0 = 50; const y0 = doc.y;
  const plotW = W - padL; const plotH = H - padB;
  const bw = plotW / nBins;

  for (let i = 0; i < nBins; i += 1) {
    if (!bins[i]) continue;
    const h = (bins[i] / peak) * plotH;
    doc.rect(x0 + padL + i * bw + 0.6, y0 + plotH - h, bw - 1.2, h).fill(NAVY);
  }
  doc.lineWidth(0.7).strokeColor(GRID)
    .moveTo(x0 + padL, y0 + plotH).lineTo(x0 + padL + plotW, y0 + plotH).stroke();

  for (const m of (opts.markers || [])) {
    const mx = x0 + padL + ((m.at - lo) / (hi - lo)) * plotW;
    doc.save().lineWidth(0.9).dash(3, { space: 2 }).strokeColor(GOLD)
      .moveTo(mx, y0).lineTo(mx, y0 + plotH).stroke().undash().restore();
    doc.fontSize(6.5).fillColor(GOLD).text(m.label, mx + 3, y0 + 1, { lineBreak: false });
  }

  doc.fontSize(7).fillColor(MUTED).font('Helvetica');
  doc.text(String(lo), x0 + padL, y0 + plotH + 3, { lineBreak: false });
  doc.text(String(hi), x0 + padL + plotW - 20, y0 + plotH + 3, { width: 20, align: 'right', lineBreak: false });
  if (opts.xLabel) {
    doc.text(opts.xLabel, x0 + padL, y0 + plotH + 3, { width: plotW, align: 'center', lineBreak: false });
  }
  doc.text(String(peak), x0, y0 - 1, { width: padL - 3, align: 'right', lineBreak: false });
  doc.text('0', x0, y0 + plotH - 7, { width: padL - 3, align: 'right', lineBreak: false });
  doc.fillColor(TEXT);
  doc.y = y0 + H + 2;
}

// ── Sparkline ───────────────────────────────────────────────────────────────
// One score's trajectory, small enough to sit in a table row. The individual
// report already prints the numbers; this is the shape they make, which is what
// answers "is this athlete drifting" at a glance.
function sparkline(doc, values, x, y, w, h, higherBetter = true) {
  const vals = (values || []).map(num);
  const real = vals.filter((v) => v !== null);
  if (real.length < 2) return;
  const lo = Math.min(...real); const hi = Math.max(...real);
  const span = (hi - lo) || 1;
  const stepX = w / (vals.length - 1);
  const yOf = (v) => y + h - ((v - lo) / span) * h;

  const gain = higherBetter ? real[real.length - 1] - real[0] : real[0] - real[real.length - 1];
  const stroke = gain > 0 ? BAND.green : gain < 0 ? BAND.red : MUTED;

  doc.save().lineWidth(1.1).strokeColor(stroke);
  let started = false;
  vals.forEach((v, i) => {
    if (v === null) { started = false; return; }
    const cx = x + i * stepX;
    if (!started) { doc.moveTo(cx, yOf(v)); started = true; } else doc.lineTo(cx, yOf(v));
  });
  doc.stroke().restore();
  const lastIdx = vals.length - 1 - [...vals].reverse().findIndex((v) => v !== null);
  doc.circle(x + lastIdx * stepX, yOf(real[real.length - 1]), 1.7).fill(stroke);
  doc.fillColor(TEXT);
}

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
    const b = effectiveBand(m.s);
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
  tierLegend(doc);
}

// The subitem tier key. Extracted from the heatmap so the squad body map can
// print the SAME key rather than a second one that could drift from it.
function tierLegend(doc) {
  ensure(doc, 18);
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

// The squad's body, drawn — the same licensed figure the individual report uses,
// fed the group's MEAN subitem readings instead of one athlete's.
//
// The team report described the squad's body only in words and numbers: a
// hotspot bullet list and a 5-column heatmap. In a product whose entire
// vocabulary is body regions, the squad had no anatomical view at all — the one
// graphic that answers "where is this squad weak" without reading a table. The
// means come from aggregateSubitems, the same function behind the heatmap and
// the Screening Analytics page, so the figure cannot quote a different average
// from the grid printed beside it.
function squadMuscleFigure(doc, members, opts = {}) {
  const rows = members
    .map((m) => (m && m.s ? m.s : m))
    .filter((x) => x && x.subitems && typeof x.subitems === 'object');
  if (!rows.length) {
    doc.fontSize(9).fillColor(MUTED).text('No subitem scores on record for this group.', 50);
    return false;
  }
  const { matrix } = aggregateSubitems(rows);
  const subitems = {};
  for (const region of matrix) {
    const cells = {};
    for (const c of region.cells) if (c.value !== null) cells[c.key] = c.value;
    if (Object.keys(cells).length) subitems[region.key] = cells;
  }
  if (!Object.keys(subitems).length) {
    doc.fontSize(9).fillColor(MUTED).text('No subitem scores on record for this group.', 50);
    return false;
  }
  muscleFigure(doc, subitems, opts);
  return true;
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


// Activity-log table. Four columns, only the last of which wraps, so row height
// is driven by the detail text and the header repeats on every page.
//
// Lives here rather than in the route for the same reason as every other
// drawing helper: routes do routing, pdfDraw does pdfkit — and it means this
// can be rendered headlessly in tests instead of only by downloading it.
function auditTable(doc, rows, labels = {}) {
  const COLW = { when: 96, who: 116, what: 118 };
  const xWhen = 50;
  const xWho = xWhen + COLW.when;
  const xWhat = xWho + COLW.who;
  const xDetail = xWhat + COLW.what;
  const detailW = doc.page.width - 50 - xDetail;

  const header = () => {
    const y = doc.y;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(MUTED);
    doc.text('When', xWhen, y, { width: COLW.when, lineBreak: false });
    doc.text('Who', xWho, y, { width: COLW.who, lineBreak: false });
    doc.text('Action', xWhat, y, { width: COLW.what, lineBreak: false });
    doc.text('Detail', xDetail, y, { width: detailW, lineBreak: false });
    doc.y = y + 13;
    doc.moveTo(50, doc.y - 3).lineTo(doc.page.width - 50, doc.y - 3).strokeColor(GRID).stroke();
    doc.font('Helvetica').fillColor(TEXT);
  };
  header();

  for (const r of rows || []) {
    const detail = r.summary || '-';
    doc.fontSize(8.5);
    const h = Math.max(14, doc.heightOfString(detail, { width: detailW }) + 5);
    if (doc.y + h > doc.page.height - 70) { doc.addPage(); doc.y = 50; header(); doc.fontSize(8.5); }
    const y = doc.y;
    doc.fontSize(8.5).fillColor(TEXT);
    doc.text(fmtDate(r.created_at || r.createdAt), xWhen, y, { width: COLW.when, lineBreak: false });
    doc.text(String(r.actor_name || r.actorName || 'Unknown'), xWho, y, { width: COLW.who, lineBreak: false });
    doc.text(labels[r.action] || r.action || '-', xWhat, y, { width: COLW.what, lineBreak: false });
    doc.text(detail, xDetail, y, { width: detailW });
    doc.y = y + h;
  }
}

// Trim a single-line string to fit `max` points at `size`, ellipsising if it
// has to cut. Measured with the real font metrics rather than a character
// estimate, because the labels vary in width far more than in length.
function fitWidth(doc, text, size, max) {
  const s = String(text || '');
  if (!s) return '';
  const prev = doc._fontSize;
  doc.fontSize(size);
  let out = s;
  if (doc.widthOfString(out) > max) {
    while (out.length > 1 && doc.widthOfString(`${out}…`) > max) out = out.slice(0, -1);
    out = `${out.trimEnd()}…`;
  }
  doc.fontSize(prev);
  return out;
}

// Per-account activity table for the Activity Log export. Numeric columns, no
// wrapping, so rows are a fixed height.
//
// Mirrors the on-screen table deliberately: changes and downloads are separate
// columns, and "vs prev" is omitted entirely when the preceding window predates
// the log (`comparable === false`), because printing "+43 (was 0)" on paper —
// where it outlives the caveat that explained it — is worse than on screen.
function staffTable(doc, staff, labels = {}, { comparable = true } = {}) {
  const X = comparable
    ? { actor: 50, actions: 280, downloads: 345, change: 405, screenings: 480 }
    : { actor: 50, actions: 320, downloads: 395, screenings: 470 };
  const head = () => {
    const y = doc.y;
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(MUTED);
    doc.text('Account', X.actor, y, { lineBreak: false });
    doc.text('Changes', X.actions, y, { width: 60, align: 'right', lineBreak: false });
    doc.text('Downloads', X.downloads, y, { width: 65, align: 'right', lineBreak: false });
    if (comparable) doc.text('vs prev', X.change, y, { width: 70, align: 'right', lineBreak: false });
    doc.text('Screenings', X.screenings, y, { width: 75, align: 'right', lineBreak: false });
    doc.y = y + 13;
    doc.moveTo(50, doc.y - 3).lineTo(doc.page.width - 50, doc.y - 3).strokeColor(GRID).stroke();
    doc.font('Helvetica').fillColor(TEXT);
  };
  head();
  for (const s of staff || []) {
    // Two lines when a breakdown exists, so height is computed not assumed.
    // pdfkit's lineBreak:false does not clip — it overruns. With the two new
    // access actions an admin's breakdown is long enough to run under the
    // numeric columns, so it is measured and cut to the label column's width.
    const parts = fitWidth(
      doc,
      Object.entries(s.byAction || {})
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${labels[k] || k}: ${n}`)
        .join('  '),
      7.5,
      212,
    );
    const h = parts ? 22 : 14;
    if (doc.y + h > doc.page.height - 70) { doc.addPage(); doc.y = 50; head(); }
    const y = doc.y;
    doc.fontSize(8.5).fillColor(TEXT);
    doc.text(fitWidth(doc, `${s.actor}${s.role ? ` (${s.role})` : ''}`, 8.5, 220), X.actor, y, { width: 220, lineBreak: false });
    doc.text(String(s.actions ?? 0), X.actions, y, { width: 60, align: 'right', lineBreak: false });
    // A count of zero is zero. This rendered '-' because 0 is falsy, so one row
    // showed three treatments of the same value — actions 0, downloads '-',
    // screenings 0. On an accountability document that is not cosmetic: '-'
    // reads as "not tracked", and "we hold no record" is a different claim
    // from "we hold a record of none". (The `vs prev` column keeps its dash:
    // there a zero genuinely means no change, not a count.)
    doc.text(String(s.downloads ?? 0), X.downloads, y, { width: 65, align: 'right', lineBreak: false });
    if (comparable) {
      const ch = Number(s.change) || 0;
      doc.text(ch === 0 ? '-' : `${ch > 0 ? '+' : ''}${ch}`, X.change, y, { width: 70, align: 'right', lineBreak: false });
    }
    doc.text(String(s.screeningsImported ?? 0), X.screenings, y, { width: 75, align: 'right', lineBreak: false });
    if (parts) {
      doc.fontSize(7.5).fillColor(MUTED).text(parts, X.actor + 8, y + 10, { width: 240, lineBreak: false });
      doc.fillColor(TEXT);
    }
    doc.y = y + h;
  }
}

module.exports = {
  winAnsiSafe, changeCell,
  BAND, ELEVATED_THRESHOLD, GOLD, GRID, MUTED, NAVY, RISKS, SCORE_ROWS, TEXT, auditTable, staffTable, bandColor, bandLabel, bandOnLight,
  bandPill, bandTable, bar, betweenTestsBlock, bufferDoc, bullets, changeBars, cover,
  distributionHistogram, ensure, fileSlug, finish, fmtDate, riskMovementScatter, sparkline,
  throughputChart,
  focusTable, hotspotBar, interpret, keyFindings, keyFindingsBox, muscleFigure, num, periodTable, radar,
  riskLegend, seasonTable, sectionTitle, squadMuscleHotspots, squadMuscleFigure, tierLegend, squadSubitemHeatmap, squadSymmetrySection, startDoc,
  subitemPriorities, subitemTable, symmetrySection, todayStamp, zoneGauge,
};
