// Three HoloMotion screening PDF reports (redesign spec §7), streamed via
// pdfkit. Kept separate from the injury report (routes/reports.js).
//   1. GET /holistic.pdf              — admin cohort-wide overview (visual)
//   2. GET /individual/:id.pdf        — one athlete: scores, risks, subitems,
//                                        peer comparison, interpretation,
//                                        progress between reports
//   3. GET /team.pdf?sport&programme&gender — cohort ranking + attention table
//                                        + per-athlete snapshots
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

const express = require('express');
const PDFDocument = require('pdfkit');
const { Screening, Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const {
  latestScreeningsByAthlete, resolveCohortStats, orientedComponents, computeStats,
} = require('../utils/cohorts');
const { compositeZ } = require('../utils/overallIndicator');
const { getSettings } = require('../utils/settings');

const router = express.Router();

// ── palette (AIRMS identity + HoloMotion band semantics) ────────────────────
const NAVY = '#0f2c4a';
const GOLD = '#c89b3c';
const MUTED = '#6b7280';
const TEXT = '#1a2533';
const GRID = '#e2e6ea';
const BAND = { green: '#2e9e5b', amber: '#d99a16', red: '#d14b4b' };
const bandColor = (b) => BAND[b] || MUTED;
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
const RISK_ZONES = [
  { max: 15, label: 'Low', color: BAND.green, tint: '#e3f2e8' },
  { max: 25, label: 'Watch', color: BAND.amber, tint: '#f8eed5' },
  { max: RISK_AXIS_MAX, label: 'Elevated', color: BAND.red, tint: '#f8e2e2' },
];
const riskZone = (v) => RISK_ZONES[v > 25 ? 2 : v > 15 ? 1 : 0];
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

// Physical Fitness Subitem Score — HoloMotion's 60/75/85 tiers.
const TIERS = [
  { min: 85, label: 'Excellent', color: '#2e9e5b' },
  { min: 75, label: 'Good', color: '#2a9db8' },
  { min: 60, label: 'Average', color: '#5b64c9' },
  { min: 0, label: 'Below Average', color: '#9b45c9' },
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
  doc.fillColor(zone.color).fontSize(9).font('Helvetica-Bold')
    .text(`${v}  ${zone.label}`, bx + barW + 8, y + 1, { width: 92, lineBreak: false });
  doc.fillColor(TEXT);
  doc.y = y + 17;
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
        doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold')
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

// Radar chart (TMG-style visual anchor) — polygon over n axes with grid rings.
function radar(doc, axes, { max = 40, rings = 4, r = 85, color = GOLD } = {}) {
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
  // value polygon
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
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text(bandLabel(band).toUpperCase(), x, y + 6, { width: 130, align: 'center', lineBreak: false });
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
  if (subitems && typeof subitems === 'object') {
    const gaps = [];
    for (const [key, label] of SUBITEM_REGIONS) {
      const r = subitems[key] || {};
      if (num(r.romL) !== null && num(r.romR) !== null && Math.abs(r.romL - r.romR) >= 8) {
        gaps.push(`${label} ROM ${r.romL}/${r.romR}`);
      }
      if (num(r.stabL) !== null && num(r.stabR) !== null && Math.abs(r.stabL - r.stabR) >= 8) {
        gaps.push(`${label} Stability ${r.stabL}/${r.stabR}`);
      }
    }
    if (gaps.length) out.push(`Marked left/right gaps (8+ pts): ${gaps.join(' · ')}.`);
  }
  const mf = screening.muscleFlags || {};
  const nMyo = (mf.myodynamia || []).length; const nTen = (mf.tension || []).length;
  if (nMyo || nTen) out.push(`Muscle flags on record: ${nMyo} myodynamia deficiency, ${nTen} tension.`);
  if (screening.overrideBand) {
    out.push(`Clinician override in effect: ${bandLabel(screening.overrideBand)} — "${screening.overrideNote || ''}" (${screening.overrideBy || 'medical'}, ${fmtDate(screening.overrideAt)}).`);
  }
  return out;
}

// ── 1. Holistic (admin) ─────────────────────────────────────────────────────
router.get('/holistic.pdf', auth, rbac('admin'), async (_req, res) => {
  try {
    const [rows, totalActive] = await Promise.all([
      latestScreeningsByAthlete(),
      Athlete.count({ where: { isActive: true } }),
    ]);
    const doc = startDoc(res, 'AIRMS-screening-holistic.pdf');
    cover(doc, 'Screening — Holistic Report', new Date().toISOString().slice(0, 10));

    doc.fontSize(10).fillColor(MUTED).text(
      `Population: ${rows.length} of ${totalActive} active athletes have a HoloMotion screening on record `
      + `(${totalActive ? Math.round((rows.length / totalActive) * 100) : 0}% coverage). `
      + 'All comparisons below are cohort-normed (sport × programme × gender).', 50);

    // Band distribution
    sectionTitle(doc, 'Overall Risk Distribution');
    const bands = { green: 0, amber: 0, red: 0, none: 0 };
    rows.forEach(({ screening }) => { bands[(screening.overrideBand || screening.overallBand) || 'none']++; });
    const total = rows.length || 1;
    bar(doc, 'Safe (green)', bands.green, total, BAND.green, { valueText: `${bands.green}` });
    bar(doc, 'Needs attention', bands.amber, total, BAND.amber, { valueText: `${bands.amber}` });
    bar(doc, 'Immediate assessment', bands.red, total, BAND.red, { valueText: `${bands.red}` });
    if (bands.none) bar(doc, 'Unscored (small cohort)', bands.none, total, MUTED, { valueText: `${bands.none}` });

    // Cohort average headline scores
    sectionTitle(doc, 'Population Average Scores');
    const avg = (key) => {
      const vals = rows.map(({ screening }) => num(screening[key])).filter((v) => v !== null);
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
    };
    for (const [key, label, max] of SCORE_ROWS) bar(doc, label, avg(key), max, NAVY);
    zoneGauge(doc, 'Exercise Risks (avg)', avg('exerciseRisks'));

    // Exercise-risk hotspots — how many athletes sit beyond Low per region
    sectionTitle(doc, 'Exercise Risk Hotspots (athletes beyond Low)');
    riskLegend(doc);
    const hot = RISKS.map(([k, label]) => ({
      label,
      watch: rows.filter(({ screening }) => (num(screening[k]) ?? 0) > 15 && (num(screening[k]) ?? 0) <= 25).length,
      elevated: rows.filter(({ screening }) => (num(screening[k]) ?? 0) > 25).length,
    })).sort((a, b) => (b.watch + b.elevated) - (a.watch + a.elevated));
    for (const h of hot) {
      bar(doc, h.label, h.watch + h.elevated, total, h.elevated ? BAND.red : BAND.amber,
        { valueText: h.elevated ? `${h.watch + h.elevated} (${h.elevated} elevated)` : `${h.watch + h.elevated}` });
    }

    // Bands by sport
    sectionTitle(doc, 'Risk Bands by Sport');
    const yStart = doc.y;
    const yBy = new Map();
    for (const { athlete, screening } of rows) {
      if (!yBy.has(athlete.sport)) yBy.set(athlete.sport, { n: 0, green: 0, amber: 0, red: 0 });
      const s = yBy.get(athlete.sport);
      s.n++;
      const b = screening.overrideBand || screening.overallBand;
      if (s[b] !== undefined) s[b]++;
    }
    doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED);
    doc.text('Sport', 50, yStart, { lineBreak: false });
    doc.text('Screened', 220, yStart, { width: 60, align: 'right', lineBreak: false });
    doc.text('Safe', 300, yStart, { width: 50, align: 'right', lineBreak: false });
    doc.text('Attention', 360, yStart, { width: 60, align: 'right', lineBreak: false });
    doc.text('Immediate', 430, yStart, { width: 65, align: 'right', lineBreak: false });
    doc.y = yStart + 14;
    for (const [sport, s] of [...yBy.entries()].sort((a, b) => b[1].n - a[1].n)) {
      ensure(doc, 15);
      const y = doc.y;
      doc.fontSize(9).font('Helvetica').fillColor(TEXT).text(sport, 50, y, { width: 165, lineBreak: false });
      doc.text(String(s.n), 220, y, { width: 60, align: 'right', lineBreak: false });
      doc.fillColor(BAND.green).text(String(s.green), 300, y, { width: 50, align: 'right', lineBreak: false });
      doc.fillColor(BAND.amber).text(String(s.amber), 360, y, { width: 60, align: 'right', lineBreak: false });
      doc.fillColor(BAND.red).text(String(s.red), 430, y, { width: 65, align: 'right', lineBreak: false });
      doc.fillColor(TEXT);
      doc.y = y + 14;
    }

    // Athletes needing attention
    sectionTitle(doc, 'Athletes Flagged for Assessment');
    const flagged = rows
      .filter(({ screening }) => ['amber', 'red'].includes(screening.overrideBand || screening.overallBand))
      .sort((a, b) => (a.screening.overallIndicator ?? 100) - (b.screening.overallIndicator ?? 100));
    if (!flagged.length) doc.fontSize(10).fillColor(MUTED).text('No athletes currently flagged.', 50);
    flagged.slice(0, 25).forEach(({ athlete, screening }) => {
      ensure(doc, 14);
      const b = screening.overrideBand || screening.overallBand;
      doc.fontSize(9).fillColor(bandColor(b)).font('Helvetica-Bold').text('•  ', 50, doc.y, { continued: true })
        .fillColor(TEXT).font('Helvetica').text(`${athlete.name} (${athlete.athleteId}) · ${athlete.sport} · indicator ${screening.overallIndicator ?? '—'} · ${bandLabel(b)}`);
    });

    finish(doc, 'Holistic Screening Report');
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

// ── 2. Individual ───────────────────────────────────────────────────────────
router.get('/individual/:id.pdf', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    // Coaches get squad-level readiness + the team report only; the individual
    // report is screening detail, which is outside their read-only remit.
    if (req.user.role === 'coach') {
      return res.status(403).json({ message: 'Coaches do not have access to individual screening reports.' });
    }
    const [athlete, history, settings] = await Promise.all([
      Athlete.findOne({ where: { athleteId: req.params.id }, raw: true }),
      Screening.findAll({ where: { athleteId: req.params.id }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true }),
      getSettings(),
    ]);
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    if (!history.length) return res.status(404).json({ message: 'No screening on record for this athlete' });
    const latest = history[0];
    const cohort = await resolveCohortStats(athlete, { minN: settings.min_cohort_n, fallbackEnabled: settings.fallback_enabled });

    const doc = startDoc(res, `AIRMS-individual-${athlete.athleteId}.pdf`);
    cover(doc, 'Individual Screening Report', `${athlete.name} · ${athlete.athleteId}`);
    doc.fontSize(10).fillColor(TEXT).text(
      `${athlete.sport} · ${athlete.program} · ${athlete.gender ?? '—'} · age ${athlete.age ?? '—'}   ·   assessed ${fmtDate(latest.assessedAt)}   ·   imported by ${latest.importedBy ?? '—'}`, 50);
    doc.moveDown(0.4);
    const eff = latest.overrideBand || latest.overallBand;
    const pillY = doc.y;
    bandPill(doc, eff, 50, pillY);
    doc.fontSize(11).fillColor(TEXT).font('Helvetica-Bold')
      .text(`Overall indicator ${latest.overallIndicator ?? '—'}/100`, 195, pillY + 4, { lineBreak: false });
    doc.fontSize(8).fillColor(MUTED).font('Helvetica')
      .text('(50 = cohort average · cohort-normed composite)', 340, pillY + 6, { lineBreak: false });
    doc.y = pillY + 30;
    if (latest.overrideBand) {
      doc.fontSize(8.5).fillColor(MUTED).text(
        `Clinician override: computed band was ${bandLabel(latest.overallBand)}; set to ${bandLabel(latest.overrideBand)} by ${latest.overrideBy || 'medical'} on ${fmtDate(latest.overrideAt)}.`, 50);
      doc.moveDown(0.2);
    }

    // Scores vs peers (cohort mean marker)
    sectionTitle(doc, cohort ? `Scores vs Cohort (${cohort.tier} tier, n=${cohort.n})` : 'Scores (no cohort norm yet)');
    for (const [key, label, max] of SCORE_ROWS) {
      const ref = cohort && cohort.stats[key] ? cohort.stats[key].mean : null;
      bar(doc, label, num(latest[key]), max, NAVY, { ref });
    }
    doc.moveDown(0.2).fontSize(8).fillColor(MUTED).text('Navy marker = cohort average.', 50);

    // Exercise Risk Evaluation — printed legend + zone gauges + radar
    sectionTitle(doc, 'Exercise Risk Evaluation');
    riskLegend(doc);
    zoneGauge(doc, 'Exercise Risks (overall)', num(latest.exerciseRisks) ?? 0);
    doc.moveDown(0.2);
    for (const [key, label] of RISKS) zoneGauge(doc, label, num(latest[key]) ?? 0);
    doc.moveDown(0.3);
    radar(doc, RISKS.map(([key, label]) => ({ label, value: num(latest[key]) ?? 0 })), { max: 40, color: GOLD });
    doc.fontSize(8).fillColor(MUTED).text('Radar scale 0–40 (lower is better). Lumbar Disc Herniation is recorded but not assessed at ISN and is excluded from AIRMS risk displays.', 50, doc.y, { width: doc.page.width - 100 });

    // Physical Fitness Subitem Score
    sectionTitle(doc, 'Physical Fitness Subitem Score', 220);
    subitemTable(doc, latest.subitems);

    // Muscle legend
    sectionTitle(doc, 'Muscle Flags');
    const mf = latest.muscleFlags || {};
    doc.fontSize(9).fillColor(TEXT).font('Helvetica-Bold').text('Myodynamia deficiency: ', 50, doc.y, { continued: true }).font('Helvetica')
      .text((mf.myodynamia || []).map((m) => `${m.muscle} ${m.side}`).join(', ') || 'none');
    doc.font('Helvetica-Bold').text('Muscle tension: ', 50, doc.y, { continued: true }).font('Helvetica')
      .text((mf.tension || []).map((m) => `${m.muscle} ${m.side}`).join(', ') || 'none');

    // Interpretation (TMG-style derived bullets)
    sectionTitle(doc, 'Interpretation');
    bullets(doc, interpret(latest, cohort, latest.subitems));

    // Progress between reports
    sectionTitle(doc, 'Progress Between Reports');
    if (history.length < 2) {
      doc.fontSize(10).fillColor(MUTED).text('Only one screening on record — import a newer report to see progress.', 50);
    } else {
      const cols = ['totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks'];
      const labels = ['Total', 'ROM', 'Stability', 'Symmetry', 'Ex. Risks'];
      const cx = (i) => 170 + i * 65;
      let y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('Date', 50, y, { lineBreak: false });
      labels.forEach((l, i) => doc.text(l, cx(i), y, { width: 60, align: 'right', lineBreak: false }));
      y += 14;
      doc.font('Helvetica').fillColor(TEXT);
      for (const s of history.slice().reverse()) {
        ensure(doc, 15); if (doc.y > y) y = doc.y;
        doc.text(fmtDate(s.assessedAt), 50, y, { lineBreak: false });
        cols.forEach((c, i) => doc.text(String(num(s[c]) ?? '—'), cx(i), y, { width: 60, align: 'right', lineBreak: false }));
        y += 14;
      }
      const first = history[history.length - 1]; const last = history[0];
      doc.moveTo(50, y + 1).lineTo(doc.page.width - 50, y + 1).strokeColor(GRID).stroke();
      y += 6;
      doc.font('Helvetica-Bold').fillColor(NAVY).text('Change', 50, y, { lineBreak: false });
      cols.forEach((c, i) => {
        const a = num(first[c]); const b = num(last[c]);
        const d = a !== null && b !== null ? b - a : null;
        const txt = d === null ? '—' : (d >= 0 ? `+${d}` : `${d}`);
        // exerciseRisks: lower is better — colour improvement accordingly.
        const good = c === 'exerciseRisks' ? d !== null && d <= 0 : d !== null && d >= 0;
        doc.fillColor(d === null ? MUTED : good ? BAND.green : BAND.red)
          .text(txt, cx(i), y, { width: 60, align: 'right', lineBreak: false });
      });
      doc.fillColor(TEXT).font('Helvetica');
      doc.y = y + 18;
    }

    if (latest.summaryText) {
      sectionTitle(doc, 'Report Summary (as printed)');
      doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(latest.summaryText, 50, doc.y, { width: doc.page.width - 100 });
    }

    finish(doc, 'Individual Screening Report');
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

// ── 3. Team ─────────────────────────────────────────────────────────────────
// rbac first: requirePermission alone lets non-medical roles pass through, and
// an athlete must not be able to download the whole squad's ranking. The
// individual report handles athletes with an explicit self-only check instead.
// Coaches may pull the team report, but only for a sport they are assigned to
// (their read-only remit) — enforced by the coachSports scope check below.
router.get('/team.pdf', auth, rbac('medical', 'admin', 'coach'), requirePermission('viewRecords'), async (req, res) => {
  try {
    const { sport, programme, gender } = req.query;
    if (!sport) return res.status(400).json({ message: 'sport is required' });
    if (req.user.role === 'coach' && req.user.coachSport !== sport) {
      return res.status(403).json({ message: 'You can only download the report for your assigned sport.' });
    }
    const where = { isActive: true, sport };
    if (programme) where.program = programme;
    if (gender) where.gender = gender;
    const athletes = await Athlete.findAll({ where, raw: true });
    if (!athletes.length) return res.status(404).json({ message: 'No athletes in this group' });
    const ids = athletes.map((a) => a.athleteId);
    const screenings = await Screening.findAll({ where: { athleteId: ids }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true });
    const latestBy = new Map();
    for (const s of screenings) if (!latestBy.has(s.athleteId)) latestBy.set(s.athleteId, s);
    const members = athletes.map((a) => ({ a, s: latestBy.get(a.athleteId) })).filter((m) => m.s);
    if (!members.length) return res.status(404).json({ message: 'No screenings on record in this group' });

    // Group threshold from this exact group.
    const group = computeStats(members.map((m) => m.s));

    const doc = startDoc(res, 'AIRMS-team-report.pdf');
    cover(doc, 'Team / Group Screening Report', [sport, programme, gender].filter(Boolean).join(' · '));
    doc.fontSize(10).fillColor(MUTED).text(
      `${members.length} screened athletes of ${athletes.length} in the group. `
      + 'Group thresholds are this group’s own averages; the ranking and attention table below read every athlete against them.', 50);

    // Group thresholds (means)
    sectionTitle(doc, 'Group Thresholds (average scores)');
    for (const [key, label, max] of SCORE_ROWS) {
      const m = group.stats[key];
      bar(doc, label, m ? m.mean : 0, max, GOLD, { valueText: m ? `${m.mean}` : '—' });
    }

    // Group risk profile — average per printed indicator
    sectionTitle(doc, 'Group Exercise Risk Profile (average)');
    riskLegend(doc);
    const avgRisk = (k) => {
      const vals = members.map((m) => num(m.s[k])).filter((v) => v !== null);
      return vals.length ? +(vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1) : 0;
    };
    for (const [key, label] of RISKS) zoneGauge(doc, label, avgRisk(key));

    // Ranking by overall indicator
    sectionTitle(doc, 'Ranking (by overall indicator)');
    const ranked = members.slice().sort((a, b) => (b.s.overallIndicator ?? 0) - (a.s.overallIndicator ?? 0));
    ranked.forEach((m, i) => {
      ensure(doc, 18);
      const b = m.s.overrideBand || m.s.overallBand;
      const y = doc.y;
      doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(`${i + 1}.`, 50, y + 1, { width: 20, lineBreak: false });
      doc.text(m.a.name, 72, y + 1, { width: 106, lineBreak: false });
      const bx = 180; const barW = doc.page.width - 100 - 190;
      doc.roundedRect(bx, y, barW, 11, 2).fill('#eef1f4');
      const pct = Math.max(0, Math.min(1, (m.s.overallIndicator ?? 0) / 100));
      doc.roundedRect(bx, y, Math.max(2, barW * pct), 11, 2).fill(bandColor(b));
      doc.fillColor(TEXT).fontSize(9).font('Helvetica-Bold')
        .text(`${m.s.overallIndicator ?? '—'}`, bx + barW + 8, y + 1, { width: 50, lineBreak: false });
      doc.y = y + 16;
    });
    doc.moveDown(0.2).fontSize(8).fillColor(MUTED).text('Bar colour = risk band (override wins). 50 = group average by construction.', 50);

    // Attention table — components each flagged athlete is below the group on
    sectionTitle(doc, 'Attention Table (parts needing follow-up)');
    doc.fontSize(8).fillColor(MUTED).text('For each flagged athlete: score components below the group average, exercise-risk indicators beyond Low, and marked left/right gaps — for the coach to note.', 50, doc.y, { width: doc.page.width - 100 });
    doc.moveDown(0.3);
    const flagged = ranked.filter((m) => ['amber', 'red'].includes(m.s.overrideBand || m.s.overallBand));
    if (!flagged.length) doc.fontSize(10).fillColor(MUTED).text('No athletes flagged in this group.', 50);
    for (const m of flagged) {
      ensure(doc, 30);
      const comps = orientedComponents(m.s);
      const below = [];
      for (const [key, label] of [['totalScore', 'Total'], ['rom', 'ROM'], ['stability', 'Stability'], ['symmetry', 'Symmetry'], ['riskGood', 'Risk burden'], ['balance', 'Balance']]) {
        const st = group.stats[key];
        if (st && comps[key] != null && comps[key] < st.mean) below.push(label);
      }
      const risky = RISKS
        .map(([k, label]) => ({ label, v: num(m.s[k]) ?? 0 }))
        .filter((r) => r.v > 15)
        .map((r) => `${r.label} ${r.v}`);
      const b = m.s.overrideBand || m.s.overallBand;
      doc.fontSize(9).fillColor(bandColor(b)).font('Helvetica-Bold').text('•  ', 50, doc.y, { continued: true })
        .fillColor(TEXT).text(`${m.a.name} (${m.a.athleteId}): `, { continued: true })
        .font('Helvetica').fillColor(MUTED)
        .text([below.length ? `below group on ${below.join(', ')}` : null, risky.length ? `risks: ${risky.join(' · ')}` : null]
          .filter(Boolean).join('  —  ') || 'below group overall');
      doc.moveDown(0.15);
    }

    // Per-athlete snapshots (TMG group-report style individual sections)
    if (flagged.length) {
      sectionTitle(doc, 'Individual Snapshots (flagged athletes)');
      doc.fontSize(8).fillColor(MUTED).text('One block per flagged athlete: subitem scores on the HoloMotion tier colours, for targeted follow-up.', 50);
      doc.moveDown(0.4);
      for (const m of flagged) {
        ensure(doc, 190);
        const b = m.s.overrideBand || m.s.overallBand;
        const y = doc.y;
        bandPill(doc, b, 50, y);
        doc.fontSize(10).font('Helvetica-Bold').fillColor(TEXT)
          .text(`${m.a.name} (${m.a.athleteId})`, 195, y + 4, { lineBreak: false });
        doc.fontSize(9).font('Helvetica').fillColor(MUTED)
          .text(`indicator ${m.s.overallIndicator ?? '—'} · assessed ${fmtDate(m.s.assessedAt)}`, 380, y + 5, { lineBreak: false });
        doc.y = y + 28;
        subitemTable(doc, m.s.subitems);
        doc.moveDown(0.5);
      }
    }

    finish(doc, 'Team Screening Report');
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

module.exports = router;
