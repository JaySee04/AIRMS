// Three HoloMotion screening PDF reports (redesign spec §7), streamed via
// pdfkit. Kept separate from the injury report (routes/reports.js).
//   1. GET /holistic.pdf              — admin cohort-wide overview (visual)
//   2. GET /individual/:id.pdf        — one athlete: scores, risks, peer
//                                        comparison, progress between reports
//   3. GET /team.pdf?sport&programme&gender — cohort ranking + attention table

const express = require('express');
const PDFDocument = require('pdfkit');
const { Screening, Athlete, CohortThreshold } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const {
  latestScreeningsByAthlete, resolveCohortStats, orientedComponents, computeStats, tierKeysFor,
} = require('../utils/cohorts');
const { compositeZ } = require('../utils/overallIndicator');
const { getSettings } = require('../utils/settings');

const router = express.Router();

const NAVY = '#0f2c4a';
const GOLD = '#c89b3c';
const MUTED = '#6b7280';
const TEXT = '#1a2533';
const BAND = { green: '#2e9e5b', amber: '#d99a16', red: '#d14b4b' };
const bandColor = (b) => BAND[b] || MUTED;
const bandLabel = (b) => ({ green: 'Safe', amber: 'Needs attention', red: 'Immediate assessment' }[b] || '—');

// ── pdfkit drawing helpers ──────────────────────────────────────────────────
function cover(doc, kind, subtitle) {
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold').text('AIRMS', 50, 30);
  doc.fillColor(GOLD).fontSize(11).font('Helvetica').text('Athlete Injury Risk Management System', 50, 56);
  doc.fillColor('#fff').fontSize(13).font('Helvetica-Bold').text(kind, 50, 30, { align: 'right', width: doc.page.width - 100 });
  if (subtitle) doc.fillColor('#cbd5e1').fontSize(9).font('Helvetica').text(subtitle, 50, 56, { align: 'right', width: doc.page.width - 100 });
  doc.fillColor(TEXT).y = 110;
  doc.x = 50;
}

function sectionTitle(doc, t) {
  if (doc.y > doc.page.height - 120) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(NAVY).fontSize(13).font('Helvetica-Bold').text(t, 50);
  doc.moveTo(50, doc.y + 2).lineTo(doc.page.width - 50, doc.y + 2).strokeColor('#e2e6ea').stroke();
  doc.moveDown(0.5);
  doc.fillColor(TEXT).font('Helvetica').fontSize(10);
}

// Horizontal bar with an optional reference marker (e.g. cohort mean).
function bar(doc, label, value, max, color, opts = {}) {
  const x = 50; const w = doc.page.width - 100; const barW = w - 190;
  const y = doc.y;
  doc.fillColor(TEXT).fontSize(9).font('Helvetica').text(label, x, y + 1, { width: 120 });
  const bx = x + 130;
  doc.roundedRect(bx, y, barW, 11, 2).fill('#eef1f4');
  const pct = Math.max(0, Math.min(1, (value ?? 0) / max));
  doc.roundedRect(bx, y, Math.max(2, barW * pct), 11, 2).fill(color);
  if (opts.ref != null) {
    const rx = bx + barW * Math.max(0, Math.min(1, opts.ref / max));
    doc.moveTo(rx, y - 2).lineTo(rx, y + 13).strokeColor(NAVY).lineWidth(1.4).stroke().lineWidth(1);
  }
  doc.fillColor(TEXT).fontSize(9).font('Helvetica-Bold').text(
    opts.valueText ?? String(value ?? '—'), bx + barW + 8, y + 1, { width: 50 });
  doc.y = y + 16;
}

function bandPill(doc, band, x, y) {
  const c = bandColor(band);
  doc.roundedRect(x, y, 130, 20, 4).fill(c);
  doc.fillColor('#fff').fontSize(9).font('Helvetica-Bold').text(bandLabel(band).toUpperCase(), x, y + 6, { width: 130, align: 'center' });
  doc.fillColor(TEXT);
}

function startDoc(res, filename) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

const SCORE_ROWS = [
  ['totalScore', 'Total Score', 100],
  ['rom', 'ROM', 100],
  ['stability', 'Stability', 100],
  ['symmetry', 'Symmetry', 100],
];

// ── 1. Holistic (admin) ─────────────────────────────────────────────────────
router.get('/holistic.pdf', auth, rbac('admin'), async (_req, res) => {
  try {
    const rows = await latestScreeningsByAthlete();
    const doc = startDoc(res, 'AIRMS-screening-holistic.pdf');
    cover(doc, 'Screening — Holistic Report', new Date().toISOString().slice(0, 10));

    doc.fontSize(10).fillColor(MUTED).text(`Population: ${rows.length} athletes with a HoloMotion screening on record. Cohort-normed overall risk bands below.`);

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
    sectionTitle(doc, 'Cohort Average Scores');
    const avg = (key) => {
      const vals = rows.map(({ screening }) => Number(screening[key])).filter((v) => Number.isFinite(v));
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
    };
    for (const [key, label, max] of SCORE_ROWS) bar(doc, label, avg(key), max, NAVY);
    bar(doc, 'Exercise Risks (lower better)', avg('exerciseRisks'), 40, GOLD);

    // Athletes needing attention
    sectionTitle(doc, 'Athletes Flagged for Assessment');
    const flagged = rows
      .filter(({ screening }) => ['amber', 'red'].includes((screening.overrideBand || screening.overallBand)))
      .sort((a, b) => (a.screening.overallIndicator ?? 100) - (b.screening.overallIndicator ?? 100));
    if (!flagged.length) doc.fontSize(10).fillColor(MUTED).text('No athletes currently flagged.');
    flagged.slice(0, 20).forEach(({ athlete, screening }) => {
      const b = screening.overrideBand || screening.overallBand;
      doc.fontSize(9).fillColor(bandColor(b)).font('Helvetica-Bold').text('●  ', { continued: true })
        .fillColor(TEXT).font('Helvetica').text(`${athlete.name} (${athlete.athleteId}) · ${athlete.sport} · indicator ${screening.overallIndicator ?? '—'} · ${bandLabel(b)}`);
    });

    doc.end();
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

// ── 2. Individual ───────────────────────────────────────────────────────────
router.get('/individual/:id.pdf', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    if (req.user.role === 'athlete' && req.user.athleteId !== req.params.id) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const athlete = await Athlete.findOne({ where: { athleteId: req.params.id }, raw: true });
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    const history = await Screening.findAll({ where: { athleteId: req.params.id }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true });
    if (!history.length) return res.status(404).json({ message: 'No screening on record for this athlete' });
    const latest = history[0];
    const settings = await getSettings();
    const cohort = await resolveCohortStats(athlete, { minN: settings.min_cohort_n, fallbackEnabled: settings.fallback_enabled });

    const doc = startDoc(res, `AIRMS-individual-${athlete.athleteId}.pdf`);
    cover(doc, 'Individual Screening Report', `${athlete.name} · ${athlete.athleteId}`);
    doc.fontSize(10).fillColor(TEXT).text(`${athlete.sport} · ${athlete.program} · ${athlete.gender ?? '—'} · age ${athlete.age ?? '—'}`);
    doc.moveDown(0.3);
    const eff = latest.overrideBand || latest.overallBand;
    bandPill(doc, eff, 50, doc.y);
    doc.fontSize(11).fillColor(TEXT).font('Helvetica-Bold').text(`  Overall indicator ${latest.overallIndicator ?? '—'}/100`, 190, doc.y + 4);
    doc.moveDown(1.5);

    // Scores vs peers (cohort mean marker)
    sectionTitle(doc, cohort ? `Scores vs Cohort (${cohort.tier}, n=${cohort.n})` : 'Scores (no cohort norm yet)');
    for (const [key, label, max] of SCORE_ROWS) {
      const ref = cohort && cohort.stats[key === 'totalScore' ? 'totalScore' : key] ? cohort.stats[key].mean : null;
      bar(doc, label, Number(latest[key]), max, NAVY, { ref });
    }
    doc.moveDown(0.2).fontSize(8).fillColor(MUTED).text('Navy marker = cohort average.', 50);

    // Risk levels (7 shown; LDH excluded)
    sectionTitle(doc, 'Exercise Risk Indicators');
    const RISKS = [['neckInjuryRisk', 'Neck'], ['shoulderInjuryRisk', 'Shoulder'], ['scoliosis', 'Scoliosis'], ['lumbarPelvisInjury', 'Lumbar/Pelvis'], ['jointPain', 'Joint'], ['kneeInjuryRisk', 'Knee'], ['ankleInjuryRisk', 'Ankle']];
    for (const [key, label] of RISKS) {
      const v = Number(latest[key]);
      const c = v > 25 ? BAND.red : v > 15 ? BAND.amber : BAND.green;
      bar(doc, label, v, 40, c);
    }

    // Muscle legend
    sectionTitle(doc, 'Muscle Flags');
    const mf = latest.muscleFlags || {};
    doc.fontSize(9).fillColor(TEXT).font('Helvetica-Bold').text('Myodynamia deficiency: ', { continued: true }).font('Helvetica')
      .text((mf.myodynamia || []).map((m) => `${m.muscle} ${m.side}`).join(', ') || 'none');
    doc.font('Helvetica-Bold').text('Muscle tension: ', { continued: true }).font('Helvetica')
      .text((mf.tension || []).map((m) => `${m.muscle} ${m.side}`).join(', ') || 'none');

    // Progress between reports
    sectionTitle(doc, 'Progress Between Reports');
    if (history.length < 2) {
      doc.fontSize(10).fillColor(MUTED).text('Only one screening on record — import a newer report to see progress.');
    } else {
      const cols = ['totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks'];
      const labels = ['Total', 'ROM', 'Stab', 'Sym', 'ExRisk'];
      doc.fontSize(9).fillColor(MUTED).font('Helvetica-Bold');
      doc.text('Date'.padEnd(14) + labels.map((l) => l.padStart(8)).join(''), 50);
      doc.font('Helvetica').fillColor(TEXT);
      history.slice().reverse().forEach((s) => {
        const d = s.assessedAt ? new Date(s.assessedAt).toISOString().slice(0, 10) : '—';
        doc.text(d.padEnd(14) + cols.map((c) => String(s[c] ?? '—').padStart(8)).join(''), 50);
      });
      const first = history[history.length - 1]; const last = history[0];
      const delta = (c) => (last[c] != null && first[c] != null ? (Number(last[c]) - Number(first[c])).toFixed(0) : '—');
      doc.moveDown(0.3).font('Helvetica-Bold').fillColor(NAVY).text('Change'.padEnd(14) + cols.map((c) => { const d = delta(c); return (d[0] === '-' ? d : `+${d}`).padStart(8); }).join(''), 50);
    }

    if (latest.summaryText) {
      sectionTitle(doc, 'Report Summary');
      doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(latest.summaryText, { width: doc.page.width - 100 });
    }

    doc.end();
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

// ── 3. Team ─────────────────────────────────────────────────────────────────
router.get('/team.pdf', auth, requirePermission('viewRecords'), async (req, res) => {
  try {
    const { sport, programme, gender } = req.query;
    if (!sport) return res.status(400).json({ message: 'sport is required' });
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

    // Group threshold from this exact group.
    const group = computeStats(members.map((m) => m.s));

    const doc = startDoc(res, 'AIRMS-team-report.pdf');
    cover(doc, 'Team / Group Screening Report', [sport, programme, gender].filter(Boolean).join(' · '));
    doc.fontSize(10).fillColor(TEXT).text(`${members.length} screened athletes. Group thresholds and ranking below.`);

    // Group thresholds (means)
    sectionTitle(doc, 'Group Thresholds (average)');
    for (const [key, label, max] of SCORE_ROWS) {
      const m = group.stats[key];
      bar(doc, label, m ? m.mean : 0, max, GOLD, { valueText: m ? `${m.mean}` : '—' });
    }

    // Ranking by overall indicator
    sectionTitle(doc, 'Ranking (by overall indicator)');
    const ranked = members.slice().sort((a, b) => (b.s.overallIndicator ?? 0) - (a.s.overallIndicator ?? 0));
    ranked.forEach((m, i) => {
      const b = m.s.overrideBand || m.s.overallBand;
      const y = doc.y;
      doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(`${i + 1}.`, 50, y + 1, { width: 20 });
      doc.text(`${m.a.name}`, 72, y + 1, { width: 170 });
      bar(doc, '', m.s.overallIndicator ?? 0, 100, bandColor(b), { valueText: `${m.s.overallIndicator ?? '—'}` });
    });

    // Attention table — components each athlete is below the group on
    sectionTitle(doc, 'Attention Table (parts needing follow-up)');
    doc.fontSize(8).fillColor(MUTED).text('For each flagged athlete: score components below the group average, for the coach to note.', { width: doc.page.width - 100 });
    doc.moveDown(0.3);
    const flagged = ranked.filter((m) => ['amber', 'red'].includes(m.s.overrideBand || m.s.overallBand));
    if (!flagged.length) doc.fontSize(10).fillColor(MUTED).text('No athletes flagged in this group.');
    for (const m of flagged) {
      const comps = orientedComponents(m.s);
      const below = [];
      for (const [key, label] of [['totalScore', 'Total'], ['rom', 'ROM'], ['stability', 'Stability'], ['symmetry', 'Symmetry'], ['riskGood', 'Risk'], ['balance', 'Balance']]) {
        const st = group.stats[key];
        if (st && comps[key] != null && comps[key] < st.mean) below.push(label);
      }
      const b = m.s.overrideBand || m.s.overallBand;
      doc.fontSize(9).fillColor(bandColor(b)).font('Helvetica-Bold').text('●  ', { continued: true })
        .fillColor(TEXT).font('Helvetica').text(`${m.a.name} (${m.a.athleteId}): `, { continued: true })
        .fillColor(MUTED).text(below.length ? below.join(', ') : 'below group overall');
    }

    doc.end();
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

module.exports = router;
