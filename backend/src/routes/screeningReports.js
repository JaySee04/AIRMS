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
const { Screening, Athlete, AthleteDiscipline, AuditLog } = require('../models');
const { ACTION_LABELS: AUDIT_LABELS, staffActivity } = require('./audit');
const auth = require('../middleware/auth');
const rbac = require('../middleware/rbac');
const requirePermission = require('../middleware/permission');
const {
  latestScreeningsByAthlete, resolveCohortStats, orientedComponents, computeStats,
} = require('../utils/cohorts');
const { getSettings } = require('../utils/settings');
const { effectiveBand } = require('../utils/bands');
const { screeningPeriods } = require('../utils/screeningPeriods');
const {
  focusBreakdown, isShownIndicator, ageGroupOf, SHOWN_INDICATORS, INDICATOR_LABEL,
} = require('../utils/cohortFocus');
const {
  BAND, ELEVATED_THRESHOLD, GOLD, GRID, MUTED, NAVY, RISKS, SCORE_ROWS, TEXT, bandColor, bandLabel, bandOnLight,
  bandPill, bandTable, bar, betweenTestsBlock, bullets, cover, ensure, fileSlug, finish, fmtDate,
  auditTable, staffTable, focusTable, hotspotBar, interpret, keyFindings, keyFindingsBox, muscleFigure, num, periodTable, radar,
  riskLegend, sectionTitle, squadMuscleHotspots, squadSubitemHeatmap, squadSymmetrySection, startDoc,
  subitemPriorities, subitemTable, symmetrySection, todayStamp, zoneGauge,
} = require('../utils/pdfDraw');

const router = express.Router();

// ── 1. Holistic (admin) ─────────────────────────────────────────────────────
router.get('/holistic.pdf', auth, rbac('admin', 'executive'), async (req, res) => {
  try {
    // `grain` lets the same report be pulled for a monthly, quarterly or yearly
    // management review; quarterly is the default because it is the cadence ISN
    // actually screens at.
    const grain = ['month', 'quarter', 'year'].includes(String(req.query.grain))
      ? String(req.query.grain) : 'quarter';
    // POPULATION filters — the same slicers the admin dashboard offers, so a
    // report can be pulled for exactly the group under discussion rather than
    // always being institute-wide. A filtered report states its filters on the
    // cover, so a printed copy is self-describing.
    const {
      sport, program, gender, ageMin, ageMax, discipline, region,
    } = req.query;

    const [rows, totalActive, history] = await Promise.all([
      latestScreeningsByAthlete(),
      Athlete.count({ where: { isActive: true } }),
      // The FULL screening history, not just each athlete's latest — the
      // programme-activity section counts every test ever performed.
      Screening.findAll({
        attributes: [
          'id', 'athleteId', 'assessedAt', 'totalScore', 'rom', 'stability', 'symmetry',
          'exerciseRisks', 'overallIndicator', 'overallBand', 'overrideBand',
        ],
        order: [['assessedAt', 'ASC'], ['id', 'ASC']],
        raw: true,
      }),
    ]);
    // Narrow in memory: the population is small (tens to low hundreds) and this
    // keeps one fetch path for filtered and unfiltered reports alike.
    const disciplineOf = new Map();
    if (discipline) {
      const owners = await AthleteDiscipline.findAll({ where: { discipline }, attributes: ['athleteId'], raw: true });
      owners.forEach((o) => disciplineOf.set(o.athleteId, true));
    }
    const allRows = rows;
    const kept = rows.filter(({ athlete: a }) => {
      if (sport && a.sport !== sport) return false;
      if (program && a.program !== program) return false;
      if (gender && a.gender !== gender) return false;
      if (ageMin && !(Number(a.age) >= Number(ageMin))) return false;
      if (ageMax && !(Number(a.age) <= Number(ageMax))) return false;
      if (discipline && !disciplineOf.has(a.athleteId)) return false;
      return true;
    });

    // A filter description that reads as a sentence on the cover and slugs into
    // the filename, so a saved report says who it is about.
    const parts = [];
    if (sport) parts.push(sport);
    if (program) parts.push(program);
    if (gender) parts.push(gender);
    if (discipline) parts.push(discipline);
    if (ageMin || ageMax) parts.push(`age ${ageMin || '0'}-${ageMax || '+'}`);
    const scope = parts.length ? parts.join(' · ') : 'All athletes';
    const focused = region && isShownIndicator(region) ? region : null;

    const activity = screeningPeriods(history, { grain });
    const nameBits = ['AIRMS_Holistic'];
    if (parts.length) nameBits.push(fileSlug(parts.join('_')));
    if (focused) nameBits.push(fileSlug(INDICATOR_LABEL[focused]));
    const doc = startDoc(res, `${nameBits.join('_')}_${todayStamp()}.pdf`);
    cover(doc, 'Holistic Screening Report', `${scope} · ${todayStamp()}`);

    doc.fontSize(10).fillColor(MUTED).text(
      `Population: ${kept.length} of ${totalActive} active athletes`
      + (parts.length ? ` (filtered to ${scope})` : '')
      + ` have a HoloMotion screening on record`
      + `${parts.length ? '' : ` (${totalActive ? Math.round((kept.length / totalActive) * 100) : 0}% coverage)`}. `
      + 'All comparisons below are cohort-normed (sport × programme × gender).', 50);

    if (focused) {
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(TEXT).font('Helvetica-Bold')
        .text(`Focused on: ${INDICATOR_LABEL[focused]}`, 50);
      doc.fontSize(8.5).fillColor(MUTED).font('Helvetica').text(
        'A focus does not remove any athlete from this report - it re-reads the same population through one '
        + 'indicator, split by sport, gender, age and programme, so the group carrying the problem is visible. '
        + 'The sections after it are the unfocused picture.', 50, doc.y, { width: doc.page.width - 100 });
    }

    // Screening-programme activity. Deliberately the FIRST section: this report
    // goes to management, and "how much did we screen, and which way is the
    // population moving" is their question. Everything after it is the current
    // snapshot.
    const grainWord = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' }[grain];
    sectionTitle(doc, `Screening Programme Activity (${grainWord})`);
    periodTable(doc, activity.periods);

    sectionTitle(doc, 'Change Between Successive Tests', 120);
    betweenTestsBlock(doc, activity.betweenTests);

    sectionTitle(doc, 'Overall Risk Distribution', 110);
    const bands = { green: 0, amber: 0, red: 0, none: 0 };
    kept.forEach(({ screening }) => { bands[(effectiveBand(screening)) || 'none']++; });
    const total = kept.length || 1;
    bar(doc, 'Safe (green)', bands.green, total, BAND.green, { valueText: `${bands.green}` });
    bar(doc, 'Needs attention', bands.amber, total, BAND.amber, { valueText: `${bands.amber}` });
    bar(doc, 'Immediate assessment', bands.red, total, BAND.red, { valueText: `${bands.red}` });
    if (bands.none) bar(doc, 'Unscored (small cohort)', bands.none, total, MUTED, { valueText: `${bands.none}` });

    sectionTitle(doc, 'Population Average Scores');
    const avg = (key) => {
      const vals = kept.map(({ screening }) => num(screening[key])).filter((v) => v !== null);
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : 0;
    };
    for (const [key, label, max] of SCORE_ROWS) bar(doc, label, avg(key), max, NAVY);
    zoneGauge(doc, 'Exercise Risks (avg)', avg('exerciseRisks'));

    // Exercise-risk hotspots — how many athletes sit beyond Low per region
    sectionTitle(doc, 'Exercise Risk Hotspots (athletes beyond Low)');
    riskLegend(doc);
    const hot = RISKS.map(([k, label]) => ({
      label,
      watch: kept.filter(({ screening }) => (num(screening[k]) ?? 0) > 15 && (num(screening[k]) ?? 0) <= 25).length,
      elevated: kept.filter(({ screening }) => (num(screening[k]) ?? 0) > 25).length,
    })).sort((a, b) => (b.watch + b.elevated) - (a.watch + a.elevated));
    for (const h of hot) hotspotBar(doc, h.label, h.watch, h.elevated, total);

    // Band distribution by slice — sport, gender, age group (Dr Thung's
    // administrator view: "by sport, by gender, by age group"). One shared
    // table shape so every slice reads the same.
    const groupBands = (keyFn, order) => {
      const m = new Map();
      for (const { athlete, screening } of kept) {
        const key = keyFn(athlete);
        if (key == null || key === '') continue;
        if (!m.has(key)) m.set(key, { label: String(key), n: 0, green: 0, amber: 0, red: 0 });
        const s = m.get(key); s.n++;
        const b = effectiveBand(screening);
        if (s[b] !== undefined) s[b]++;
      }
      const entries = [...m.values()];
      return order ? entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)) : entries.sort((a, b) => b.n - a.n);
    };
    // Shared buckets (utils/cohortFocus.js), so the age rows here, the focus
    // breakdown above and the dashboard's age filter all mean the same thing.
    // They used to disagree: "21-25" in print vs "18-23 (junior)" on screen.
    const ageBand = (a) => ageGroupOf(a.age);
    const AGE_ORDER = ['Under 18', '18-23 (junior)', '24-29 (senior)', '30+ (veteran)'];

    if (focused) {
      const flat = (list) => list.map(({ athlete, screening }) => {
        const out = { ...athlete };
        for (const { key } of SHOWN_INDICATORS) out[key] = screening[key];
        return out;
      });
      const fb = focusBreakdown(flat(kept), focused, flat(allRows));
      if (fb) {
        sectionTitle(doc, `Focus: where ${fb.label} concentrates`, 150);
        const pct = fb.n ? Math.round((fb.high / fb.n) * 100) : 0;
        doc.fontSize(9).fillColor(TEXT).font('Helvetica').text(
          `${fb.high} of ${fb.n} athletes in this report are Elevated on ${fb.label} (${pct}%), `
          + `${fb.watch} are in Watch. Average reading ${fb.avg === null ? '-' : fb.avg}`
          + (fb.baselineAvg === null ? '.' : `, against ${fb.baselineAvg} across the whole institute - `
            + `${fb.avg === fb.baselineAvg ? 'the same' : fb.avg > fb.baselineAvg ? 'worse than normal' : 'better than normal'}.`),
          50, doc.y, { width: doc.page.width - 100 });
        doc.moveDown(0.5);
        riskLegend(doc);
        doc.moveDown(0.3);
        focusTable(doc, 'By sport', fb.bySlice.sport);
        focusTable(doc, 'By gender', fb.bySlice.gender);
        focusTable(doc, 'By age group', fb.bySlice.ageGroup);
        focusTable(doc, 'By programme', fb.bySlice.programme);

        if (fb.worst.length) {
          ensure(doc, 30 + fb.worst.length * 13);
          doc.fontSize(9).font('Helvetica-Bold').fillColor(TEXT).text(`Highest ${fb.label} readings`, 50);
          doc.moveDown(0.2);
          for (const w of fb.worst) {
            ensure(doc, 13);
            doc.fontSize(9).font('Helvetica').fillColor(bandOnLight(w.band === 'high' ? 'red' : w.band === 'watch' ? 'amber' : 'green'))
              .text('•  ', 50, doc.y, { continued: true })
              .fillColor(TEXT).text(`${w.name} (${w.athleteId}) · ${w.sport} · ${fb.label} ${w.value}`);
          }
          doc.moveDown(0.4);
        }
      }
    }

    sectionTitle(doc, 'Risk Bands by Sport');
    bandTable(doc, groupBands((a) => a.sport));
    sectionTitle(doc, 'Risk Bands by Gender', 90);
    bandTable(doc, groupBands((a) => a.gender, ['Male', 'Female']));
    sectionTitle(doc, 'Risk Bands by Age Group', 110);
    bandTable(doc, groupBands(ageBand, AGE_ORDER));

    // Athletes needing attention
    sectionTitle(doc, 'Athletes Flagged for Assessment');
    const flagged = kept
      .filter(({ screening }) => ['amber', 'red'].includes(effectiveBand(screening)))
      .sort((a, b) => (a.screening.overallIndicator ?? 100) - (b.screening.overallIndicator ?? 100));
    if (!flagged.length) doc.fontSize(10).fillColor(MUTED).text('No athletes currently flagged.', 50);
    flagged.slice(0, 25).forEach(({ athlete, screening }) => {
      ensure(doc, 14);
      const b = effectiveBand(screening);
      doc.fontSize(9).fillColor(bandColor(b)).font('Helvetica-Bold').text('•  ', 50, doc.y, { continued: true })
        .fillColor(TEXT).font('Helvetica').text(`${athlete.name} (${athlete.athleteId}) · ${athlete.sport} · indicator ${screening.overallIndicator ?? '—'} · ${bandLabel(b)}`);
    });

    finish(doc, 'Holistic Screening Report');
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
    const where = {};
    if (req.query.action) where.action = String(req.query.action);
    if (req.query.from || req.query.to) {
      where.createdAt = {};
      if (req.query.from) where.createdAt[Op.gte] = new Date(String(req.query.from));
      if (req.query.to) {
        const end = new Date(String(req.query.to));
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }
    // Capped: a log export is a review document, not a database dump. The page
    // paginates for anything longer.
    const LIMIT = 400;
    const { rows, count } = await AuditLog.findAndCountAll({
      where, order: [['createdAt', 'DESC']], limit: LIMIT, raw: true,
    });

    const scope = [
      req.query.action ? `Action: ${req.query.action}` : null,
      req.query.from ? `From ${String(req.query.from)}` : null,
      req.query.to ? `To ${String(req.query.to)}` : null,
    ].filter(Boolean).join(' · ') || 'All recorded activity';

    const doc = startDoc(res, `AIRMS-activity-log-${todayStamp()}.pdf`);
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
      staffTable(doc, staff, AUDIT_LABELS);
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
