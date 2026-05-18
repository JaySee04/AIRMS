const express = require('express');
const PDFDocument = require('pdfkit');
const Injury = require('../models/Injury');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');

const router = express.Router();

const NAVY = '#0f2c4a';
const GOLD = '#f5c518';
const MUTED = '#6b7280';
const TEXT = '#1a2533';

const BODY_PARTS = ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'];
const INJURY_TYPES = ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'];
const SEVERITIES = ['Minor', 'Moderate', 'Severe'];

function buildMatchFromQuery(q) {
  const match = {};
  if (q.sport)       match.sport = q.sport;
  if (q.program)     match.program = q.program;
  if (q.gender)      match.gender = q.gender;
  if (q.bodyPart)    match.bodyPart = q.bodyPart;
  if (q.injuryType)  match.injuryType = q.injuryType;
  if (q.ageMin || q.ageMax) {
    match.athleteAge = {};
    if (q.ageMin) match.athleteAge.$gte = Number(q.ageMin);
    if (q.ageMax) match.athleteAge.$lte = Number(q.ageMax);
  }
  if (q.startDate || q.endDate) {
    match.date = {};
    if (q.startDate) match.date.$gte = new Date(q.startDate);
    if (q.endDate)   match.date.$lte = new Date(q.endDate);
  }
  return match;
}

function buildFilterSummary(q) {
  const parts = [];
  if (q.sport)      parts.push(`Sport: ${q.sport}`);
  if (q.program)    parts.push(`Programme: ${q.program}`);
  if (q.gender)     parts.push(`Gender: ${q.gender}`);
  if (q.bodyPart)   parts.push(`Body Part: ${q.bodyPart}`);
  if (q.injuryType) parts.push(`Injury Type: ${q.injuryType}`);
  if (q.ageMin || q.ageMax) {
    const lo = q.ageMin || '0';
    const hi = q.ageMax || '∞';
    parts.push(`Age: ${lo}–${hi}`);
  }
  if (q.startDate || q.endDate) {
    parts.push(`Period: ${q.startDate || '…'} → ${q.endDate || '…'}`);
  }
  return parts.length ? parts.join(' · ') : 'All records';
}

function distribution(rows, key, ordering) {
  const counts = {};
  rows.forEach((r) => {
    const v = r[key];
    if (!v) return;
    counts[v] = (counts[v] || 0) + 1;
  });
  return ordering.map((v) => ({ label: v, count: counts[v] || 0 }));
}

function drawBarChart(doc, rows, { x, y, width, height, color = NAVY, maxLabel = 18 }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const barHeight = Math.min(18, (height - 4) / Math.max(1, rows.length) - 6);
  const rowH = barHeight + 6;
  const labelCol = 110;
  const valueCol = 50;
  const barCol = width - labelCol - valueCol - 10;

  let cy = y;
  rows.forEach((r) => {
    doc.fontSize(9).fillColor(TEXT).text(r.label.slice(0, maxLabel), x, cy + 2, {
      width: labelCol - 4,
      ellipsis: true,
    });
    const w = max > 0 ? (r.count / max) * barCol : 0;
    doc.save();
    doc.roundedRect(x + labelCol, cy, w, barHeight, 2).fill(color);
    doc.restore();
    doc.fontSize(9).fillColor(MUTED).text(
      `${r.count}${total ? ` (${Math.round((r.count / total) * 100)}%)` : ''}`,
      x + labelCol + barCol + 6,
      cy + 2,
      { width: valueCol, align: 'left' },
    );
    cy += rowH;
  });
  return cy;
}

function drawHeading(doc, text, opts = {}) {
  doc.fillColor(NAVY).fontSize(opts.size || 13).text(text, { underline: false });
  doc.moveDown(0.3);
}

function drawSubHeading(doc, text) {
  doc.fillColor(NAVY).fontSize(10).text(text);
  doc.moveDown(0.2);
}

function drawHr(doc, y) {
  doc.save();
  doc.lineWidth(0.5).strokeColor('#e2e6ec');
  doc.moveTo(doc.page.margins.left, y).lineTo(doc.page.width - doc.page.margins.right, y).stroke();
  doc.restore();
}

// POST /api/reports/injuries-pdf — stream a filtered injury report as PDF
// Body params (all optional): same as /api/injuries/analytics/summary
// + `reportType` (monthly/quarterly/custom), `includeRecovery`, `includeTrends`,
// `includeAthleteIndex`.
router.post('/injuries-pdf', auth, rbac('admin'), async (req, res) => {
  try {
    const q = req.body || {};
    const match = buildMatchFromQuery(q);

    const injuries = await Injury.find(match).sort({ date: -1 }).lean();
    const total = injuries.length;
    const athletesAffected = new Set(injuries.map((i) => i.athleteId)).size;
    const sportsAffected = new Set(injuries.filter((i) => i.sport).map((i) => i.sport)).size;
    const recovering = injuries.filter((i) => i.recoveryStatus === 'Recovering').length;

    const byBodyPart = distribution(injuries, 'bodyPart', BODY_PARTS);
    const byType = distribution(injuries, 'injuryType', INJURY_TYPES);
    const bySeverity = distribution(injuries, 'severity', SEVERITIES);

    // Monthly aggregation (last 12 months represented)
    const monthMap = {};
    injuries.forEach((i) => {
      const d = new Date(i.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    const byMonth = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, count]) => ({ label, count }));

    // Athlete index (unique)
    const athleteMap = new Map();
    injuries.forEach((i) => {
      if (!athleteMap.has(i.athleteId)) {
        athleteMap.set(i.athleteId, {
          athleteId: i.athleteId,
          athleteName: i.athleteName || '—',
          sport: i.sport || '—',
          program: i.program || '—',
          count: 1,
        });
      } else {
        athleteMap.get(i.athleteId).count++;
      }
    });
    const athleteIndex = Array.from(athleteMap.values()).sort((a, b) => b.count - a.count);

    const reportTypeLabel = {
      monthly: 'Monthly Standard Report',
      quarterly: 'Quarterly Programme Review',
      custom: 'Custom Filtered Report',
    }[q.reportType] || 'Injury Analytics Report';

    const filename = `airms-${(q.reportType || 'report')}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 60, bottom: 60, left: 50, right: 50 },
      info: {
        Title: `AIRMS — ${reportTypeLabel}`,
        Author: req.user.name || 'AIRMS',
        Subject: 'Injury Analytics',
      },
    });
    doc.pipe(res);

    // ── Cover ───────────────────────────────────────────────────────────────
    doc.save();
    doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
    doc.restore();
    doc.fillColor(GOLD).fontSize(11).text('AIRMS', 50, 28, { characterSpacing: 2 });
    doc.fillColor('white').fontSize(8).text('SPORTS HEALTH', 50, 46, { characterSpacing: 2 });
    doc.fillColor('white').fontSize(18).text(reportTypeLabel, 50, 60, { width: doc.page.width - 100, align: 'right' });

    doc.moveDown(4);
    doc.fillColor(TEXT).fontSize(20).text('Injury Analytics Report', 50, 130);
    doc.moveDown(0.5);
    doc.fillColor(MUTED).fontSize(10).text(`Generated ${new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}`);
    doc.text(`Generated by: ${req.user.name || 'Admin'}`);

    doc.moveDown(1);
    drawHr(doc, doc.y);
    doc.moveDown(0.5);

    drawSubHeading(doc, 'FILTERS APPLIED');
    doc.fillColor(TEXT).fontSize(10).text(buildFilterSummary(q));
    doc.moveDown(1);

    // ── Executive summary ───────────────────────────────────────────────────
    drawHeading(doc, 'Executive summary');
    const summaryRows = [
      ['Total cases', String(total)],
      ['Athletes affected', String(athletesAffected)],
      ['Sports affected', String(sportsAffected)],
      ['Currently recovering', String(recovering)],
    ];
    const cellH = 22;
    let sy = doc.y;
    summaryRows.forEach(([k, v], i) => {
      const cy2 = sy + i * cellH;
      doc.save();
      doc.rect(50, cy2, 250, cellH).fill(i % 2 === 0 ? '#f4f6fa' : '#ffffff');
      doc.restore();
      doc.fillColor(MUTED).fontSize(9).text(k, 56, cy2 + 6, { width: 180 });
      doc.fillColor(TEXT).fontSize(11).text(v, 240, cy2 + 5, { width: 55, align: 'right' });
    });
    doc.y = sy + summaryRows.length * cellH + 14;

    // ── Body part distribution ──────────────────────────────────────────────
    drawHeading(doc, 'Distribution by body part');
    doc.y = drawBarChart(doc, byBodyPart, { x: 50, y: doc.y, width: 495, height: 200, color: NAVY });
    doc.moveDown(0.6);

    // ── Injury type distribution ────────────────────────────────────────────
    drawHeading(doc, 'Distribution by injury type');
    doc.y = drawBarChart(doc, byType, { x: 50, y: doc.y, width: 495, height: 200, color: GOLD });
    doc.moveDown(0.6);

    // ── Severity (optional) ─────────────────────────────────────────────────
    if (q.includeRecovery !== false) {
      drawHeading(doc, 'Distribution by severity');
      doc.y = drawBarChart(doc, bySeverity, { x: 50, y: doc.y, width: 495, height: 100, color: '#b03030' });
      doc.moveDown(0.6);

      drawHeading(doc, 'Recovery status');
      const recRows = [
        { label: 'Recovering', count: recovering },
        { label: 'Recovered', count: injuries.filter((i) => i.recoveryStatus === 'Recovered').length },
        { label: 'Chronic', count: injuries.filter((i) => i.recoveryStatus === 'Chronic').length },
      ];
      doc.y = drawBarChart(doc, recRows, { x: 50, y: doc.y, width: 495, height: 100, color: '#3d7c47' });
      doc.moveDown(0.6);
    }

    // ── Monthly trend ───────────────────────────────────────────────────────
    if (q.includeTrends !== false && byMonth.length > 0) {
      if (doc.y > doc.page.height - 180) doc.addPage();
      drawHeading(doc, 'Cases over time');
      const trendRows = byMonth.map((m) => ({ label: m.label, count: m.count }));
      doc.y = drawBarChart(doc, trendRows, { x: 50, y: doc.y, width: 495, height: Math.min(250, trendRows.length * 22), color: NAVY, maxLabel: 8 });
      doc.moveDown(0.6);
    }

    // ── Athlete index ───────────────────────────────────────────────────────
    if (q.includeAthleteIndex !== false && athleteIndex.length > 0) {
      doc.addPage();
      drawHeading(doc, `Athlete index (${athleteIndex.length} unique athletes)`);
      const colW = [70, 180, 110, 80, 50];
      const header = ['ID', 'Name', 'Sport', 'Programme', 'Cases'];
      // header row
      let cx = 50;
      doc.save();
      doc.rect(50, doc.y, 495, 20).fill('#f4f6fa');
      doc.restore();
      doc.fillColor(NAVY).fontSize(9);
      header.forEach((h, i) => {
        doc.text(h, cx + 4, doc.y - 14, { width: colW[i] - 8 });
        cx += colW[i];
      });
      doc.moveDown(0.4);
      doc.y += 6;
      // rows
      athleteIndex.slice(0, 80).forEach((a, idx) => {
        if (doc.y > doc.page.height - 60) {
          doc.addPage();
        }
        if (idx % 2 === 0) {
          doc.save();
          doc.rect(50, doc.y, 495, 18).fill('#fafbfd');
          doc.restore();
        }
        cx = 50;
        const cells = [a.athleteId, a.athleteName, a.sport, a.program, String(a.count)];
        doc.fillColor(TEXT).fontSize(9);
        cells.forEach((c, i) => {
          doc.text(c, cx + 4, doc.y + 4, { width: colW[i] - 8, ellipsis: true });
          cx += colW[i];
        });
        doc.y += 18;
      });
      if (athleteIndex.length > 80) {
        doc.moveDown(0.5);
        doc.fillColor(MUTED).fontSize(9).text(`(${athleteIndex.length - 80} more athletes omitted — refine filters for the full list.)`);
      }
    }

    // ── Appendix ────────────────────────────────────────────────────────────
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(1);
    drawHr(doc, doc.y);
    doc.moveDown(0.5);
    drawHeading(doc, 'Appendix');
    doc.fillColor(MUTED).fontSize(9);
    doc.text('Report version: 1.0 · AIRMS analytics pipeline');
    doc.text(`Data source: live Injury collection, filtered query at generation time`);
    doc.text(`Records included: ${total}`);
    doc.text(`Filters: ${buildFilterSummary(q)}`);

    // Page numbers footer
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      doc.fillColor(MUTED).fontSize(8).text(
        `AIRMS · Page ${i + 1} of ${range.count}`,
        50,
        doc.page.height - 40,
        { width: doc.page.width - 100, align: 'center' },
      );
    }

    doc.end();
  } catch (err) {
    console.error('PDF generation failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: err.message });
    } else {
      res.end();
    }
  }
});

module.exports = router;
