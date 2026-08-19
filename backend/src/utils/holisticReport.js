// The holistic (institute-wide) screening report, split into FETCH and DRAW.
//
// It used to live entirely inside its route handler, composing straight onto
// `res`. That was fine while a browser download was the only consumer, and it is
// exactly what blocked the monthly digest from attaching the report: you cannot
// attach a stream you have already handed to Express.
//
// So: `holisticData(query)` gathers and shapes, `drawHolistic(doc, data)` draws
// onto any pdfkit document, and `renderHolisticPdf(query)` buffers one for the
// mailer. The route keeps streaming — nothing about the download changed — and
// the scheduler gets the same bytes without a second definition of the report.
// (Two report generators that were meant to agree is the §19 failure mode.)

const { Screening, Athlete, AthleteDiscipline } = require('../models');
const { latestScreeningsByAthlete } = require('./cohorts');
const { effectiveBand } = require('./bands');
const { screeningPeriods } = require('./screeningPeriods');
const {
  focusBreakdown, isShownIndicator, ageGroupOf, SHOWN_INDICATORS, INDICATOR_LABEL,
} = require('./cohortFocus');
const {
  BAND, MUTED, NAVY, RISKS, SCORE_ROWS, TEXT, bandColor, bandLabel, bandOnLight, bandTable, bar,
  betweenTestsBlock, bufferDoc, cover, distributionHistogram, ensure, fileSlug, finish, focusTable,
  hotspotBar, num, periodTable, riskLegend, riskMovementScatter, seasonTable, sectionTitle, todayStamp,
  throughputChart, changeBars,
  zoneGauge,
} = require('./pdfDraw');

const KIND = 'Holistic Screening Report';
const AGE_ORDER = ['Under 18', '18-23 (junior)', '24-29 (senior)', '30+ (veteran)'];

// ── FETCH ───────────────────────────────────────────────────────────────────
// Everything the report needs, and nothing about how it looks. `query` is the
// route's req.query shape; the scheduler passes {} for an unfiltered institute
// report.
async function holisticData(query = {}) {
  // `grain` lets the same report be pulled for a monthly, quarterly or yearly
  // management review; quarterly is the default because it is the cadence ISN
  // actually screens at.
  const grain = ['month', 'quarter', 'year'].includes(String(query.grain))
    ? String(query.grain) : 'quarter';
  // POPULATION filters — the same slicers the admin dashboard offers, so a
  // report can be pulled for exactly the group under discussion rather than
  // always being institute-wide. A filtered report states its filters on the
  // cover, so a printed copy is self-describing.
  const {
    sport, program, gender, ageMin, ageMax, discipline, region,
  } = query;

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
  const focused = region && isShownIndicator(region) ? region : null;

  const nameBits = ['AIRMS_Holistic'];
  if (parts.length) nameBits.push(fileSlug(parts.join('_')));
  if (focused) nameBits.push(fileSlug(INDICATOR_LABEL[focused]));

  // The activity sections must read the SAME population as everything else.
  // They were fed the unfiltered history, so a report headed "Badminton - 18 of
  // 62 athletes" went on to report the institute's throughput, its 19 retest
  // pairs and its seasonality underneath — 19 retested athletes inside an
  // 18-athlete population, contradicting its own cover on the same page. Caught
  // by reading the printed report rather than by any test.
  const keptIds = new Set(kept.map(({ athlete }) => athlete.athleteId));
  const scopedHistory = kept.length === rows.length
    ? history
    : history.filter((h) => keptIds.has(h.athleteId));

  return {
    grain,
    allRows: rows,
    kept,
    totalActive,
    activity: screeningPeriods(scopedHistory, { grain }),
    parts,
    scope: parts.length ? parts.join(' · ') : 'All athletes',
    focused,
    nameBits,
  };
}

// ── DRAW ────────────────────────────────────────────────────────────────────
// Moved verbatim from the route handler; the only change is that it reads its
// inputs off `data` instead of closing over the handler's locals.
function drawHolistic(doc, data, stamp = todayStamp()) {
  const {
    grain, allRows, kept, totalActive, activity, parts, scope, focused,
  } = data;

  cover(doc, 'Holistic Screening Report', `${scope} · ${stamp}`);

  doc.fontSize(10).fillColor(MUTED).text(
    `Population: ${kept.length} of ${totalActive} active athletes`
    + (parts.length ? ` (filtered to ${scope})` : '')
    + ' have a HoloMotion screening on record'
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
  // Chart THEN table, the same pairing (and the same reason) as the Programme
  // Activity report: the chart answers "is this going up" at a glance, the table
  // is what someone quotes in a meeting, and neither replaces the other. This
  // report had only the table — so the institution's flagship document, and the
  // one the monthly digest attaches, presented as numbers what its sibling drew
  // as a picture, off the identical data.
  sectionTitle(doc, `Screening Programme Activity (${grainWord})`, 200);
  throughputChart(doc, activity.periods);
  periodTable(doc, activity.periods);

  sectionTitle(doc, 'Change Between Successive Tests', 200);
  betweenTestsBlock(doc, activity.betweenTests, activity.reliability);
  // The same averages the block above lists as signed numbers, drawn on one
  // shared DELTA axis so the relative sizes are visible rather than assembled by
  // the reader. Bars point right for BETTER, and anything inside the dead band
  // is outlined rather than filled — see DESIGN_DECISIONS section 30a.
  if (activity.betweenTests && activity.betweenTests.deltas) {
    const bt = activity.betweenTests;
    changeBars(doc, bt.deltas, {
      note: `Averaged across ${bt.pairs} consecutive test pair${bt.pairs === 1 ? '' : 's'}.`,
    });
  }

  // Seasonality sits with the other programme-level readings, and always at
  // quarter grain regardless of the report's `grain` — see utils/screeningPeriods.js.
  sectionTitle(doc, 'Seasonality — Which Quarter Carries the Risk', 150);
  seasonTable(doc, activity.seasonality);

  sectionTitle(doc, 'Overall Risk Distribution', 110);
  const bands = { green: 0, amber: 0, red: 0, none: 0 };
  kept.forEach(({ screening }) => { bands[effectiveBand(screening) || 'none']++; });
  const total = kept.length || 1;
  bar(doc, 'No indicators flagged', bands.green, total, BAND.green, { valueText: `${bands.green}` });
  bar(doc, 'Needs attention', bands.amber, total, BAND.amber, { valueText: `${bands.amber}` });
  bar(doc, 'Immediate assessment', bands.red, total, BAND.red, { valueText: `${bands.red}` });
  if (bands.none) bar(doc, 'Unscored (small cohort)', bands.none, total, MUTED, { valueText: `${bands.none}` });

  // The two readings an average cannot give you (DESIGN_DECISIONS 25). Both
  // exist on the Screening Analytics page and neither reached print, so the
  // document a clinician actually files was the weaker of the two artefacts.
  sectionTitle(doc, 'Indicator Distribution', 150);
  distributionHistogram(
    doc,
    kept.map(({ screening }) => num(screening.overallIndicator)),
    {
      min: 0, max: 100, binSize: 5, xLabel: 'Overall indicator (0-100)',
      markers: [{ at: 50, label: 'cohort average' }],
    },
  );
  doc.fontSize(7.5).fillColor(MUTED).text(
    'Shape, not just the mean. A population average of 50 is produced equally by everyone sitting at 50 '
    + 'and by half the squad at 30 with the other half at 70 — the table below cannot tell those apart.',
    50, doc.y + 2, { width: doc.page.width - 100 },
  );
  doc.fillColor(TEXT);
  doc.moveDown(0.5);

  sectionTitle(doc, 'Movement Quality vs Injury Risk', 230);
  riskMovementScatter(
    doc,
    kept.map(({ athlete, screening }) => ({
      x: num(screening.totalScore),
      y: num(screening.exerciseRisks),
      band: effectiveBand(screening),
      name: athlete && athlete.name,
    })),
    {
      xLabel: 'Total Score (movement quality)',
      yLabel: 'Exercise Risks',
      quadrants: ['High risk - poor mover', 'High risk - GOOD mover', 'Low risk - good mover', 'Low risk - poor mover'],
    },
  );
  doc.fontSize(7.5).fillColor(MUTED).text(
    'Top-right is the reading to look for: movement quality above the group median AND injury risk above '
    + 'it too. The HoloMotion Total Score excludes injury risk entirely, so those two facts are '
    + 'independent and an athlete can be both — which no ranked table or averaged panel here would surface.',
    50, doc.y + 2, { width: doc.page.width - 100 },
  );
  doc.fillColor(TEXT);
  doc.moveDown(0.5);

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
  if (flagged.length) {
    // WHY each athlete is flagged, not just that they are. The band comes from
    // the escalation COUNT, not from the indicator value, so an athlete can sit
    // above the cohort average and still be flagged — on the seeded data the
    // highest-scoring name on this list reads 58 against an average of 50. A
    // reader who cannot see the reason has to take that on trust, and it is the
    // first question anyone asks of the list.
    doc.fontSize(8).fillColor(MUTED).text(
      'Ordered worst indicator first. The reason line beneath each athlete is the escalation that set '
      + 'their band — the band follows how MANY rules fired, not the indicator value, so an athlete '
      + 'above the cohort average can still appear here.',
      50, doc.y, { width: doc.page.width - 100 });
    doc.moveDown(0.4);
  }
  const SHOWN = 25;
  flagged.slice(0, SHOWN).forEach(({ athlete, screening }) => {
    const b = effectiveBand(screening);
    const head = `${athlete.name} (${athlete.athleteId}) · ${athlete.sport} · indicator ${screening.overallIndicator ?? '—'} · ${bandLabel(b)}`;
    const factors = Array.isArray(screening.factors) ? screening.factors.filter(Boolean) : [];
    const reason = factors.length
      ? factors.join(' · ')
      : (screening.overrideBand ? 'clinician override' : 'no escalation recorded');
    // Measure the wrapped reason so the page break accounts for it, rather than
    // reserving a fixed height and letting a three-factor athlete overrun.
    const W = doc.page.width - 116;
    doc.fontSize(7.5).font('Helvetica');
    const rh = doc.heightOfString(reason, { width: W });
    ensure(doc, 14 + rh);
    doc.fontSize(9).fillColor(bandColor(b)).font('Helvetica-Bold').text('•  ', 50, doc.y, { continued: true })
      .fillColor(TEXT).font('Helvetica').text(head);
    doc.fontSize(7.5).fillColor(MUTED).text(reason, 66, doc.y, { width: W });
    doc.moveDown(0.25);
  });
  // A list headed "Athletes Flagged for Assessment" that silently drops names is
  // worse than a shorter one that says so.
  if (flagged.length > SHOWN) {
    doc.moveDown(0.2);
    doc.fontSize(8).fillColor(MUTED).text(
      `Showing the ${SHOWN} lowest indicators of ${flagged.length} flagged athletes. `
      + 'The remainder are in the Screening Analytics page and the team reports.',
      50, doc.y, { width: doc.page.width - 100 });
  }
  doc.fillColor(TEXT);

  finish(doc, KIND);
}

// Buffer a copy for the mailer. Same data, same drawing, no `res`.
async function renderHolisticPdf(query = {}, stamp = todayStamp()) {
  const data = await holisticData(query);
  const { doc, done } = bufferDoc();
  drawHolistic(doc, data, stamp);
  return { buffer: await done, filename: `${data.nameBits.join('_')}_${stamp}.pdf` };
}

module.exports = {
  holisticData, drawHolistic, renderHolisticPdf, KIND,
};
