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
const { Op } = require('sequelize');
const { Screening, Athlete, AuditLog } = require('../models');
const { ACTION_LABELS: AUDIT_LABELS, staffActivity, auditWhere } = require('./audit');
const { recordAudit } = require('../utils/audit');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const { resolveCohortStats, orientedComponents, computeStats } = require('../utils/cohorts');
const { getSettings } = require('../utils/settings');
const { effectiveBand } = require('../utils/bands');
const { holisticData, drawHolistic } = require('../utils/holisticReport');
const { programmeActivityData } = require('../utils/programmeActivity');
const {
  BAND, ELEVATED_THRESHOLD, GOLD, GRID, MUTED, NAVY, RISKS, SCORE_ROWS, TEXT, bandColor, bandLabel,
  bandPill, bar, betweenTestsBlock, bullets, cover, ensure, fileSlug, finish, fmtDate, periodTable,
  seasonTable, sparkline,
  auditTable, staffTable, interpret, keyFindings, keyFindingsBox, muscleFigure, num, radar,
  riskLegend, sectionTitle, squadMuscleHotspots, squadSubitemHeatmap, squadSymmetrySection, startDoc,
  subitemPriorities, subitemTable, symmetrySection, todayStamp, zoneGauge,
} = require('../utils/pdfDraw');

const router = express.Router();

const KIND_ACTIVITY = 'Programme Activity Report';

// Record that a report left the building.
//
// WHY DOWNLOADS ARE AUDITED AT ALL. Until now the trail only recorded writes,
// which meant the two read-only roles — coach and executive — could not appear
// in it however much athlete data they pulled. That is backwards: for a role
// that cannot change anything, *reading* is the only act there is to hold it to,
// and an individual screening PDF carries a named athlete's clinical scores. A
// transparency log that is blind to exactly the accounts with no other trace is
// not covering the institution, only the half of it that types.
//
// Logged at the point the response is committed to streaming, so a request that
// 403s on the coach sport check or 404s on an empty group leaves no row — the
// trail records reports that were actually delivered, not ones that were asked
// for. `entityId` is the athlete for an individual report and null otherwise;
// the filter scope goes in `meta` so a squad-wide pull can be told from a
// single-athlete one.
function logDownload(req, kind, { summary = null, entityId = null, meta = null } = {}) {
  recordAudit(req, {
    action: 'report.download',
    entity: 'report',
    entityId,
    summary: summary ? `${kind} — ${summary}` : kind,
    meta: { kind, ...(meta || {}) },
  });
}

// The query filters worth keeping, minus the noise. Undefined keys are dropped
// so an unfiltered pull records `{}` rather than a row of nulls.
function scopeMeta(query = {}) {
  const out = {};
  for (const k of ['sport', 'programme', 'gender', 'grain', 'from', 'to', 'action', 'actorName', 'entityId']) {
    if (query[k]) out[k] = String(query[k]);
  }
  return out;
}

// ── 1. Holistic (admin) ─────────────────────────────────────────────────────
router.get('/holistic.pdf', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    // Fetch + draw both live in utils/holisticReport.js, so the monthly digest
    // can attach the identical report instead of re-deriving one.
    const stamp = todayStamp();
    const data = await holisticData(req.query);
    const doc = startDoc(res, `${data.nameBits.join('_')}_${stamp}.pdf`);
    logDownload(req, 'Holistic Screening Report', { meta: scopeMeta(req.query) });
    drawHolistic(doc, data, stamp);
  } catch (err) { if (!res.headersSent) res.status(500).json({ message: err.message }); }
});

// ── 2. Individual ───────────────────────────────────────────────────────────
router.get('/individual/:id.pdf', auth, rbac('medical', 'admin', 'coach', 'executive'), requirePermission('viewRecords'), async (req, res) => {
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
    // The one download that carries a named athlete's clinical record, so the
    // athlete is the audited entity rather than a filter string.
    logDownload(req, 'Individual Screening Report', {
      entityId: athlete.athleteId,
      summary: `${athlete.name} (${athlete.athleteId})`,
      meta: { sport: athlete.sport || null, assessedAt: latest.assessedAt || null },
    });
    cover(doc, 'Individual Screening Report', `${athlete.name} · ${athlete.athleteId}`);
    doc.fontSize(10).fillColor(TEXT).text(
      `${athlete.sport} · ${athlete.program} · ${athlete.gender ?? '—'} · age ${athlete.age ?? '—'}   ·   assessed ${fmtDate(latest.assessedAt)}   ·   imported by ${latest.importedBy ?? '—'}`, 50);
    doc.moveDown(0.4);
    const eff = effectiveBand(latest);
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
      y += 20;

      // The same trajectory as a SHAPE. The rows above give the numbers; a
      // reader still cannot get "is this athlete drifting" out of a column of
      // them, which is the question a screening programme exists to answer.
      // Matches the sparkline strip on the dashboard's Screening History.
      if (trendHistory.length >= 2) {
        ensure(doc, 44);
        if (doc.y > y) y = doc.y;
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(MUTED)
          .text('TREND', 50, y + 8, { lineBreak: false });
        // Oldest to newest; trendHistory is newest-first.
        const series = trendHistory.slice().reverse();
        cols.forEach((c, i) => {
          sparkline(doc, series.map((s) => num(s[c])), cx(i), y + 4, 56, 18, c !== 'exerciseRisks');
        });
        y += 30;
        doc.fontSize(7).font('Helvetica').fillColor(MUTED).text(
          `${series.length} screenings, oldest to newest. Each line is scaled to its own range, so heights `
          + 'are not comparable between columns - read the shape. A line is green when the score moved the '
          + 'good way for that measure, which for exercise risks is downward.',
          50, y, { width: doc.page.width - 100 },
        );
        y = doc.y + 4;
      }
      doc.fillColor(TEXT);
      doc.y = y;
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
router.get('/team.pdf', auth, rbac('medical', 'admin', 'coach', 'executive'), requirePermission('viewRecords'), async (req, res) => {
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
    logDownload(req, 'Team Screening Report', {
      summary: `${groupParts.join(' · ')} (${members.length} athlete${members.length === 1 ? '' : 's'})`,
      meta: { ...scopeMeta(req.query), athletes: members.length },
    });
    cover(doc, 'Team Screening Report', `${groupParts.join(' · ')} · ${todayStamp()}`);
    doc.fontSize(10).fillColor(MUTED).text(
      `${members.length} screened athletes of ${athletes.length} in the group. `
      + 'Group thresholds are this group’s own averages; the ranking and attention table below read every athlete against them.', 50);

    sectionTitle(doc, 'Group Thresholds (average scores)');
    for (const [key, label, max] of SCORE_ROWS) {
      const m = group.stats[key];
      bar(doc, label, m ? m.mean : 0, max, GOLD, { valueText: m ? m.mean.toFixed(1) : '—' });
    }

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

    sectionTitle(doc, 'Ranking (by overall indicator)');
    const ranked = members.slice().sort((a, b) => (b.s.overallIndicator ?? 0) - (a.s.overallIndicator ?? 0));
    ranked.forEach((m, i) => {
      ensure(doc, 18);
      const b = effectiveBand(m.s);
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
    const flagged = ranked.filter((m) => ['amber', 'red'].includes(effectiveBand(m.s)));
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
      const b = effectiveBand(m.s);
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


// GET /api/screening-reports/programme-activity.pdf — the Programme Activity KPIs
// as a document.
//
// The page answers "how is the screening programme running?" for someone sitting
// at AIRMS. This is the same answer in a form that can be printed, filed, or put
// in front of a director — which is what an administrator is actually asked for
// when they have to account for the programme's performance.
//
// Deliberately the SAME data function the page uses (utils/programmeActivity.js).
// A report that quoted different KPIs from the screen it mirrors would be worse
// than no report.
//
// Admin and executive, matching the page: the executive role exists for exactly
// this kind of oversight-without-write.
router.get('/programme-activity.pdf', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    const data = await programmeActivityData(req.query);
    const { coverage: cov, periods, betweenTests: bt, scope, grain, recall } = data;
    const grainWord = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' }[grain] || 'Quarterly';

    const nameBits = ['AIRMS_Programme_Activity'];
    if (req.query.sport) nameBits.push(fileSlug(String(req.query.sport)));
    const doc = startDoc(res, `${nameBits.join('_')}_${todayStamp()}.pdf`);
    logDownload(req, KIND_ACTIVITY, { summary: `${scope} · ${grainWord}`, meta: scopeMeta(req.query) });
    cover(doc, 'Programme Activity Report', `${scope} · ${grainWord} · ${todayStamp()}`);

    // ── Headline KPIs ────────────────────────────────────────────────────────
    // Coverage first: everything after it is about the athletes who WERE tested,
    // so how much of the roster that represents has to be established before any
    // of it can be read.
    sectionTitle(doc, 'Programme KPIs');
    const pct = cov.rostered ? Math.round((cov.tested / cov.rostered) * 100) : 0;
    const perAthlete = cov.tested ? (cov.tests / cov.tested).toFixed(1) : '—';
    bar(doc, 'Roster covered', cov.tested, Math.max(1, cov.rostered), BAND.green, { valueText: `${cov.tested} of ${cov.rostered} (${pct}%)` });
    doc.moveDown(0.2);
    const kpis = [
      ['Athletes tested', `${cov.tested} of ${cov.rostered} on the roster`],
      ['Never tested', `${cov.untested}`],
      ['Tests performed', `${cov.tests}`],
      ['Tests per tested athlete', `${perAthlete}`],
      [`${grainWord} periods with activity`, `${periods.length}`],
      ['Athletes retested at least once', bt ? `${bt.athletesWithRetest}` : '0'],
      ['Median gap between retests', bt && bt.intervalDays.median !== null ? `${bt.intervalDays.median} days` : '—'],
    ];
    // Recall: how current the programme's knowledge is, as opposed to how much
    // of the roster it has ever touched. A fully covered roster can be entirely
    // out of date, and only these rows would say so.
    if (recall) {
      kpis.push(
        ['Screening considered current for', `${recall.dueDays} days`],
        ['Overdue a rescreen', `${recall.overdue}`],
        ['Never screened', `${recall.never}`],
        ['Median age of latest screening', recall.medianAgeDays === null ? '—' : `${recall.medianAgeDays} days`],
      );
    }
    for (const [label, value] of kpis) {
      ensure(doc, 14);
      const y = doc.y;
      doc.fontSize(9.5).font('Helvetica').fillColor(TEXT).text(label, 50, y, { lineBreak: false });
      doc.font('Helvetica-Bold').text(value, 300, y, { width: 240, align: 'right', lineBreak: false });
      doc.y = y + 14;
    }
    doc.moveDown(0.5);
    doc.fontSize(7.5).fillColor(MUTED).font('Helvetica').text(
      'Coverage is measured against the filtered roster for the selected window, so a narrow date range '
      + 'correctly counts an athlete as untested in that window. Tests per athlete is retest DEPTH — reach '
      + 'without depth means a roster screened once and never followed up. Recall figures are read '
      + 'across ALL time rather than the selected window, because when an athlete was last seen is a '
      + 'fact about the athlete; "never screened" is counted apart from "overdue" because it calls for '
      + 'a first assessment, not a call-back.',
      50, doc.y, { width: doc.page.width - 100 },
    );
    doc.moveDown(0.6);

    if (!periods.length) {
      sectionTitle(doc, 'No screening activity');
      doc.fontSize(10).fillColor(MUTED).text('No screenings fall in this selection, so there is no activity to report.', 50);
      finish(doc, KIND_ACTIVITY);
      return;
    }

    // ── Throughput ───────────────────────────────────────────────────────────
    sectionTitle(doc, `Screening Throughput (${grainWord})`, 120);
    periodTable(doc, periods);

    // ── Within-athlete change ────────────────────────────────────────────────
    sectionTitle(doc, 'Change Between Successive Tests', 120);
    betweenTestsBlock(doc, bt, data.reliability);

    // ── Seasonality ──────────────────────────────────────────────────────────
    if (data.seasonality) {
      sectionTitle(doc, 'Seasonality — Which Quarter Carries the Risk', 150);
      seasonTable(doc, data.seasonality);
    }

    // ── Who did the work ─────────────────────────────────────────────────────
    // A programme report without the staff in it measures only the athletes.
    // Same window as the audit page's rollup, and the same helper, so the two
    // cannot disagree about who did what.
    const staff = await staffActivity({ from: req.query.from, to: req.query.to });
    if (staff.length) {
      sectionTitle(doc, 'Activity by account', 120);
      staffTable(doc, staff, AUDIT_LABELS, { comparable: staff.meta.comparable });
      doc.moveDown(0.3);
      doc.fontSize(7.5).fillColor(MUTED).font('Helvetica').text(
        'Changes are edits made; downloads are reports and backups taken out, counted apart so that reading '
        + 'data is not scored as doing work. Two sources, not blended: both are complete only from the day '
        + 'activity logging was added, while screenings imported is counted from the screenings themselves '
        + 'and covers every import ever made.',
        50, doc.y, { width: doc.page.width - 100 },
      );
    }

    finish(doc, KIND_ACTIVITY);
  } catch (err) {
    if (!res.headersSent) res.status(err.status || 500).json({ message: err.message });
  }
});

// GET /api/screening-reports/activity-log.pdf — the Activity Log as a document.
//
// The on-screen log answers "who changed what" for someone sitting at AIRMS.
// A transparency record usually has to leave the system — attached to a report,
// filed, or handed to whoever is asking — and a page cannot do that. Same data,
// same filters, in a form that can be printed and signed off.
//
// Admin and executive, matching the log itself: oversight without write access
// is the whole point of the executive role.
router.get('/activity-log.pdf', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    // The page's filter clause, not a second copy of it — see auditWhere.
    const where = auditWhere(req.query);
    // Capped: a log export is a review document, not a database dump. The page
    // paginates for anything longer.
    const LIMIT = 400;
    const { rows, count } = await AuditLog.findAndCountAll({
      where, order: [['createdAt', 'DESC']], limit: LIMIT, raw: true,
    });

    // Every filter that narrowed the export has to be printed on it. A reader
    // holding a one-athlete extract must not be able to mistake it for the
    // whole log.
    const scope = [
      req.query.action ? `Action: ${AUDIT_LABELS[req.query.action] || req.query.action}` : null,
      req.query.actorName ? `Account: ${String(req.query.actorName)}` : null,
      req.query.entityId ? `Subject: ${String(req.query.entityId)}` : null,
      req.query.from ? `From ${String(req.query.from)}` : null,
      req.query.to ? `To ${String(req.query.to)}` : null,
    ].filter(Boolean).join(' · ') || 'All recorded activity';

    const doc = startDoc(res, `AIRMS-activity-log-${todayStamp()}.pdf`);
    // Exporting the log is itself an audited act. The row is written after the
    // rows above were read, so the export never contains its own entry — it
    // shows up in the next one, which is the honest ordering.
    logDownload(req, 'Activity Log', { summary: scope, meta: scopeMeta(req.query) });
    cover(doc, 'Activity Log', scope);

    doc.fontSize(10).fillColor(MUTED).text(
      `${count} record${count === 1 ? '' : 's'} match this selection`
      + (count > LIMIT ? `; the ${LIMIT} most recent are listed.` : '.')
      + ' Entries are written automatically when an action is performed and cannot be edited or deleted.',
      50, doc.y, { width: doc.page.width - 100 },
    );
    doc.moveDown(0.8);

    if (!rows.length) {
      sectionTitle(doc, 'No activity');
      doc.fontSize(10).fillColor(MUTED).text('Nothing was recorded in this selection.', 50);
      finish(doc, 'Activity Log');
      return;
    }

    // Who did the work comes before the blow-by-blow: a reviewer wants the
    // shape of the period before its detail.
    const staff = await staffActivity({ from: req.query.from, to: req.query.to });
    if (staff.length) {
      sectionTitle(doc, 'Activity by account');
      staffTable(doc, staff, AUDIT_LABELS, { comparable: staff.meta.comparable });
      doc.moveDown(0.4);
    }

    sectionTitle(doc, 'Recorded actions');
    auditTable(doc, rows, AUDIT_LABELS);

    finish(doc, 'Activity Log');
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ message: err.message });
    else res.end();
  }
});

module.exports = router;
