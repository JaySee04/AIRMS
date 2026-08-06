// Three HoloMotion screening PDF reports (redesign spec §7), streamed via
// pdfkit.
//   1. GET /holistic.pdf              — admin cohort-wide overview (visual)
//   2. GET /individual/:id.pdf        — one athlete: scores, risks, subitems,
//                                        peer comparison, interpretation,
//                                        progress between reports
//   3. GET /team.pdf?sport&programme&gender — cohort ranking + attention table
//                                        + per-athlete snapshots
//
// All pdfkit drawing (palette, gauges, radar, tables, body figure, the
// interpretation generator) lives in utils/pdfDraw.js — this file is routing,
// data fetching and page composition only.

const express = require('express');
const { Screening, Athlete } = require('../models');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const {
  latestScreeningsByAthlete, resolveCohortStats, orientedComponents, computeStats,
} = require('../utils/cohorts');
const { getSettings } = require('../utils/settings');
const {
  BAND, ELEVATED_THRESHOLD, GOLD, GRID, MUTED, NAVY, RISKS, SCORE_ROWS, TEXT, bandColor, bandLabel,
  bandPill, bandTable, bar, bullets, cover, ensure, fileSlug, finish, fmtDate, hotspotBar, interpret,
  keyFindings, keyFindingsBox, muscleFigure, num, radar, riskLegend, sectionTitle, squadMuscleHotspots,
  squadSubitemHeatmap, squadSymmetrySection, startDoc, subitemPriorities, subitemTable, symmetrySection,
  todayStamp, zoneGauge,
} = require('../utils/pdfDraw');

const router = express.Router();

// ── 1. Holistic (admin) ─────────────────────────────────────────────────────
router.get('/holistic.pdf', auth, rbac('admin'), async (_req, res) => {
  try {
    const [rows, totalActive] = await Promise.all([
      latestScreeningsByAthlete(),
      Athlete.count({ where: { isActive: true } }),
    ]);
    const doc = startDoc(res, `AIRMS_Holistic_${todayStamp()}.pdf`);
    cover(doc, 'Holistic Screening Report', `All athletes · ${todayStamp()}`);

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
    for (const h of hot) hotspotBar(doc, h.label, h.watch, h.elevated, total);

    // Band distribution by slice — sport, gender, age group (Dr Thung's
    // administrator view: "by sport, by gender, by age group"). One shared
    // table shape so every slice reads the same.
    const groupBands = (keyFn, order) => {
      const m = new Map();
      for (const { athlete, screening } of rows) {
        const key = keyFn(athlete);
        if (key == null || key === '') continue;
        if (!m.has(key)) m.set(key, { label: String(key), n: 0, green: 0, amber: 0, red: 0 });
        const s = m.get(key); s.n++;
        const b = screening.overrideBand || screening.overallBand;
        if (s[b] !== undefined) s[b]++;
      }
      const entries = [...m.values()];
      return order ? entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : entries.sort((a, b) => b.n - a.n);
    };
    const ageBand = (a) => {
      const v = num(a.age);
      if (v === null) return null;
      // ASCII-safe labels — pdfkit's Helvetica has no ≤ glyph.
      if (v <= 20) return '20 & under'; if (v <= 25) return '21-25'; if (v <= 30) return '26-30'; return '31+';
    };

    sectionTitle(doc, 'Risk Bands by Sport');
    bandTable(doc, groupBands((a) => a.sport));
    sectionTitle(doc, 'Risk Bands by Gender', 90);
    bandTable(doc, groupBands((a) => a.gender, ['Male', 'Female']));
    sectionTitle(doc, 'Risk Bands by Age Group', 110);
    bandTable(doc, groupBands(ageBand, ['20 & under', '21-25', '26-30', '31+']));

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
    const [athlete, history, settings] = await Promise.all([
      Athlete.findOne({ where: { athleteId: req.params.id }, raw: true }),
      Screening.findAll({ where: { athleteId: req.params.id }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true }),
      getSettings(),
    ]);
    if (!athlete) return res.status(404).json({ message: 'Athlete not found' });
    // Coaches may pull individual reports, but only for athletes in their one
    // assigned sport — the same scope check the team report applies.
    if (req.user.role === 'coach' && req.user.coachSport !== athlete.sport) {
      return res.status(403).json({ message: 'Coaches can only download reports for athletes in their assigned sport.' });
    }
    if (!history.length) return res.status(404).json({ message: 'No screening on record for this athlete' });
    const latest = history[0];
    const cohort = await resolveCohortStats(athlete, { minN: settings.min_cohort_n, fallbackEnabled: settings.fallback_enabled });

    const doc = startDoc(res, `AIRMS_Individual_${fileSlug(athlete.name)}_${athlete.athleteId}_${fmtDate(latest.assessedAt)}.pdf`);
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

    // Key findings — executive callout so the actionable items lead the report.
    keyFindingsBox(doc, keyFindings(latest, latest.subitems));

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
    radar(doc, RISKS.map(([key, label]) => ({ label, value: num(latest[key]) ?? 0 })), { max: 40, color: GOLD, guide: ELEVATED_THRESHOLD });
    doc.fontSize(8).fillColor(MUTED).text('Radar scale 0–40 (lower is better). Dashed red line = Elevated threshold (>25, standard bands — see note above on sport-critical tightening). Lumbar Disc Herniation is recorded but not assessed at ISN and is excluded from AIRMS risk displays.', 50, doc.y, { width: doc.page.width - 100 });

    // Physical Fitness Subitem Score — figure (glance) → priority callout (the
    // lowest readings, so what matters leads) → full table (exact numbers).
    sectionTitle(doc, 'Physical Fitness Subitem Score', 380);
    muscleFigure(doc, latest.subitems);
    subitemPriorities(doc, latest.subitems);
    sectionTitle(doc, 'Full subitem breakdown', 170);
    subitemTable(doc, latest.subitems);

    // Lateral Symmetry — analytic view of the L/R subitems above (TMG-style):
    // status per region + which side is weaker, not just the raw numbers.
    sectionTitle(doc, 'Lateral Symmetry', 170);
    symmetrySection(doc, latest.subitems);

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

    // Progress between reports. The latest screening is always the primary
    // (shown above); an optional ?from&to date window bounds the TREND rows
    // here (the coach report defaults it to the last 30 days, adjustable). The
    // latest is always kept so the current point never drops out of the trend.
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const inRange = (d) => { const t = new Date(d); return (!from || t >= from) && (!to || t <= to); };
    const trendHistory = (from || to)
      ? history.filter((s, i) => i === 0 || inRange(s.assessedAt))
      : history;
    sectionTitle(doc, 'Progress Between Reports');
    if (trendHistory.length < 2) {
      doc.fontSize(10).fillColor(MUTED).text(
        (from || to)
          ? 'Only the latest screening falls in the selected window — widen the date range to see progress.'
          : 'Only one screening on record — import a newer report to see progress.', 50);
    } else {
      const cols = ['totalScore', 'rom', 'stability', 'symmetry', 'exerciseRisks'];
      const labels = ['Total', 'ROM', 'Stability', 'Symmetry', 'Ex. Risks'];
      const cx = (i) => 170 + i * 65;
      let y = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED).text('Date', 50, y, { lineBreak: false });
      labels.forEach((l, i) => doc.text(l, cx(i), y, { width: 60, align: 'right', lineBreak: false }));
      y += 14;
      doc.font('Helvetica').fillColor(TEXT);
      for (const s of trendHistory.slice().reverse()) {
        ensure(doc, 15); if (doc.y > y) y = doc.y;
        doc.text(fmtDate(s.assessedAt), 50, y, { lineBreak: false });
        cols.forEach((c, i) => doc.text(String(num(s[c]) ?? '—'), cx(i), y, { width: 60, align: 'right', lineBreak: false }));
        y += 14;
      }
      const first = trendHistory[trendHistory.length - 1]; const last = trendHistory[0];
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
    // Optional ?from&to window (coach report defaults to last 30 days,
    // adjustable): take each athlete's latest screening WITHIN the window,
    // falling back to their latest overall so the squad view is never empty.
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    const inRange = (d) => { const t = new Date(d); return (!from || t >= from) && (!to || t <= to); };
    const latestBy = new Map();
    const fallbackBy = new Map();
    for (const s of screenings) {
      if (!fallbackBy.has(s.athleteId)) fallbackBy.set(s.athleteId, s);
      if (((from || to) ? inRange(s.assessedAt) : true) && !latestBy.has(s.athleteId)) latestBy.set(s.athleteId, s);
    }
    for (const [id, s] of fallbackBy) if (!latestBy.has(id)) latestBy.set(id, s);
    const members = athletes.map((a) => ({ a, s: latestBy.get(a.athleteId) })).filter((m) => m.s);
    if (!members.length) return res.status(404).json({ message: 'No screenings on record in this group' });

    // Group threshold from this exact group.
    const group = computeStats(members.map((m) => m.s));

    const groupParts = [sport, programme, gender].filter(Boolean);
    const doc = startDoc(res, `AIRMS_Team_${groupParts.map(fileSlug).join('_')}_${todayStamp()}.pdf`);
    cover(doc, 'Team Screening Report', `${groupParts.join(' · ')} · ${todayStamp()}`);
    doc.fontSize(10).fillColor(MUTED).text(
      `${members.length} screened athletes of ${athletes.length} in the group. `
      + 'Group thresholds are this group’s own averages; the ranking and attention table below read every athlete against them.', 50);

    // Group thresholds (means)
    sectionTitle(doc, 'Group Thresholds (average scores)');
    for (const [key, label, max] of SCORE_ROWS) {
      const m = group.stats[key];
      bar(doc, label, m ? m.mean : 0, max, GOLD, { valueText: m ? m.mean.toFixed(1) : '—' });
    }

    // Group risk profile — average per printed indicator
    sectionTitle(doc, 'Group Exercise Risk Profile (average)');
    riskLegend(doc);
    const avgRisk = (k) => {
      const vals = members.map((m) => num(m.s[k])).filter((v) => v !== null);
      return vals.length ? +(vals.reduce((x, y) => x + y, 0) / vals.length).toFixed(1) : 0;
    };
    for (const [key, label] of RISKS) zoneGauge(doc, label, avgRisk(key));

    // Squad lateral symmetry — aggregate of the per-region symmetry subitems
    // across the group (TMG group-report "Team" pages, adapted to our data).
    sectionTitle(doc, 'Squad Lateral Symmetry (average)');
    squadSymmetrySection(doc, members);

    // Squad muscle-flag hotspots — the most-flagged muscles across the group.
    const hotspots = squadMuscleHotspots(members);
    if (hotspots.length) {
      sectionTitle(doc, 'Squad Muscle-Flag Hotspots', 110);
      doc.fontSize(8).fillColor(MUTED).text('Muscles flagged across the most athletes (weak = myodynamia deficiency, tight = tension); athletes counted once per muscle.', 50, doc.y, { width: doc.page.width - 100 });
      doc.moveDown(0.3);
      for (const h of hotspots) {
        ensure(doc, 15);
        doc.fontSize(9).fillColor(h.kind === 'weak' ? '#c07a1e' : BAND.red).font('Helvetica-Bold').text('•  ', 50, doc.y, { continued: true })
          .fillColor(TEXT).font('Helvetica').text(`${h.muscle} `, { continued: true })
          .fillColor(MUTED).text(`(${h.kind}) — ${h.count} athlete${h.count === 1 ? '' : 's'}`);
        doc.moveDown(0.1);
      }
    }

    // Ranking by overall indicator
    sectionTitle(doc, 'Ranking (by overall indicator)');
    const ranked = members.slice().sort((a, b) => (b.s.overallIndicator ?? 0) - (a.s.overallIndicator ?? 0));
    ranked.forEach((m, i) => {
      ensure(doc, 18);
      const b = m.s.overrideBand || m.s.overallBand;
      const y = doc.y;
      doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(`${i + 1}.`, 50, y + 1, { width: 20, lineBreak: false });
      // Clip long names to one line so they never wrap into the next ranking row.
      doc.text(m.a.name, 72, y + 1, { width: 106, height: 11, lineBreak: false, ellipsis: true });
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

    // Squad subitem heatmap — one compact grid of every flagged athlete's
    // weakest reading per region (replaces the old per-athlete disc grids).
    if (flagged.length) {
      sectionTitle(doc, 'Squad Subitem Heatmap (flagged athletes)');
      doc.fontSize(8).fillColor(MUTED).text('Each cell is the athlete’s weakest subitem reading (ROM / Stability / Symmetry) for that region — scan a column to spot a region weak across the squad.', 50, doc.y, { width: doc.page.width - 100 });
      doc.moveDown(0.4);
      squadSubitemHeatmap(doc, flagged);
    }

    finish(doc, 'Team Screening Report');
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

module.exports = router;
