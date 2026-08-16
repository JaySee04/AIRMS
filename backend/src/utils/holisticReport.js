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
  betweenTestsBlock, bufferDoc, cover, ensure, fileSlug, finish, focusTable, hotspotBar, num,
  periodTable, riskLegend, seasonTable, sectionTitle, todayStamp, zoneGauge,
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

  return {
    grain,
    allRows: rows,
    kept,
    totalActive,
    activity: screeningPeriods(history, { grain }),
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
  sectionTitle(doc, `Screening Programme Activity (${grainWord})`);
  periodTable(doc, activity.periods);

  sectionTitle(doc, 'Change Between Successive Tests', 120);
  betweenTestsBlock(doc, activity.betweenTests, activity.reliability);

  // Seasonality sits with the other programme-level readings, and always at
  // quarter grain regardless of the report's `grain` — see utils/screeningPeriods.js.
  sectionTitle(doc, 'Seasonality — Which Quarter Carries the Risk', 150);
  seasonTable(doc, activity.seasonality);

  sectionTitle(doc, 'Overall Risk Distribution', 110);
  const bands = { green: 0, amber: 0, red: 0, none: 0 };
  kept.forEach(({ screening }) => { bands[effectiveBand(screening) || 'none']++; });
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
