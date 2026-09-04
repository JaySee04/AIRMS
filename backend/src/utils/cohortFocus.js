// Focused cohort analysis — "pick a body region, then compare it across every
// other dimension".
//
// TWO KINDS OF FILTER, and the distinction is the whole point of this file:
//
//   POPULATION filters (sport, programme, gender, age, discipline) choose WHO
//   is in the picture. They are applied before anything here runs.
//
//   A REGION FOCUS chooses WHAT the picture is about. It deliberately does NOT
//   remove athletes. Filtering the population down to "athletes with a knee
//   problem" and then charting knee problems is circular — everyone is
//   elevated by construction. Dr Thung's question was "why [do] women actually
//   have more knee" (2026-04-24, 12:17), which means: hold the population,
//   focus on one indicator, and split it by gender. That comparison only works
//   if the whole population is still present.
//
// So `focusBreakdown` returns ONE indicator expressed across every slice the
// admin can think in — sport, gender, age group, programme — plus the athletes
// worst on it. Pure: no DB, no Sequelize. Tested in tests/cohortFocus.test.js.

// The seven indicators AIRMS shows, and the LDH exclusion, from the one
// definition in utils/riskIndicators.js.
const { SHOWN_INDICATORS, INDICATOR_LABEL, isShownIndicator } = require('./riskIndicators');

// Band boundaries. Must agree with lib/screeningAlerts.ts (display) and
// pdfDraw.js RISK_ZONES (print): Low <=15 · Watch 16-25 · Elevated >25.
const WATCH = 15;
const HIGH = 25;
const bandOf = (v) => (v > HIGH ? 'high' : v > WATCH ? 'watch' : 'ok');

// ONE set of age buckets, used by the filter control, the breakdown and the
// PDF. These used to differ — the dashboard offered "18-23 (junior)" while the
// report printed "21-25", so an administrator who filtered on screen and then
// read the report was looking at different groupings of the same athletes.
// Labels are ASCII: pdfkit's Helvetica has no en-dash.
// One source now: shared/facts.js, generated into both packages, so the filter
// control and the printed report cannot fall out of step by hand.
const { AGE_GROUPS, GENDERS, PROGRAMMES } = require('../shared/facts');

function ageGroupOf(age) {
  // Guard '' and null explicitly: Number('') is 0, which would silently bucket
  // an athlete with no recorded age as "Under 18".
  if (age === null || age === undefined || age === '') return null;
  const v = Number(age);
  if (!Number.isFinite(v)) return null;
  const g = AGE_GROUPS.find((b) => (b.min === undefined || v >= b.min) && (b.max === undefined || v <= b.max));
  return g ? g.label : null;
}

const { toNum: num } = require('./num');
const mean = (vals) => (vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null);

// Tally one group of athletes on one indicator.
function tally(rows, key) {
  const vals = [];
  let ok = 0; let watch = 0; let high = 0;
  for (const r of rows) {
    const v = num(r[key]);
    if (v === null) continue;
    vals.push(v);
    const b = bandOf(v);
    if (b === 'high') high += 1; else if (b === 'watch') watch += 1; else ok += 1;
  }
  return { n: vals.length, ok, watch, high, avg: mean(vals) };
}

// Group by a key function, tally each group, and order worst-first — the
// admin is looking for where the problem concentrates, so the group with the
// most elevated athletes (by share, then by count) leads.
function sliceBy(rows, key, keyFn, order) {
  const groups = new Map();
  for (const r of rows) {
    const g = keyFn(r);
    if (g === null || g === undefined || g === '') continue;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const out = [...groups.entries()].map(([label, group]) => ({ label, ...tally(group, key) }))
    .filter((s) => s.n > 0);

  if (order) {
    return out.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
  }
  // Share of the group that is elevated, so a small squad with 3 of 4 elevated
  // outranks a large one with 5 of 60 — proportion is what a policy decision
  // hangs on, not raw count.
  const share = (s) => (s.n ? s.high / s.n : 0);
  return out.sort((a, b) => (share(b) - share(a)) || (b.high - a.high) || (b.n - a.n));
}

/**
 * One indicator, expressed across every dimension the admin can slice by.
 *
 * @param rows       athletes already narrowed by the population filters
 * @param key        which shown indicator to focus on
 * @param allRows    the UNFILTERED screened population, for the baseline
 *                   comparison ("is this cohort worse than the institute?")
 */
function focusBreakdown(rows, key, allRows = null) {
  if (!isShownIndicator(key)) return null;
  const overall = tally(rows, key);
  const baseline = allRows ? tally(allRows, key) : null;

  return {
    key,
    label: INDICATOR_LABEL[key],
    ...overall,
    // The same indicator across the whole institute, so a filtered view can be
    // read as better or worse than normal rather than in isolation.
    baselineAvg: baseline ? baseline.avg : null,
    baselineHighShare: baseline && baseline.n ? +(baseline.high / baseline.n).toFixed(3) : null,
    bySlice: {
      sport: sliceBy(rows, key, (r) => r.sport),
      gender: sliceBy(rows, key, (r) => r.gender, GENDERS),
      ageGroup: sliceBy(rows, key, (r) => ageGroupOf(r.age), AGE_GROUPS.map((g) => g.label)),
      programme: sliceBy(rows, key, (r) => r.program, PROGRAMMES),
    },
    // Worst readings, so "who do we look at" is one step from "where is the
    // problem". Ties broken by name for a stable order.
    worst: rows
      .filter((r) => num(r[key]) !== null)
      .sort((a, b) => (num(b[key]) - num(a[key])) || String(a.name || '').localeCompare(String(b.name || '')))
      .slice(0, 10)
      .map((r) => ({
        athleteId: r.athleteId,
        name: r.name,
        sport: r.sport,
        gender: r.gender,
        value: num(r[key]),
        band: bandOf(num(r[key])),
      })),
  };
}

module.exports = {
  SHOWN_INDICATORS, INDICATOR_LABEL, isShownIndicator,
  AGE_GROUPS, ageGroupOf, bandOf, WATCH, HIGH,
  tally, sliceBy, focusBreakdown,
};
