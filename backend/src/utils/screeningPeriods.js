// Screening-programme activity over time — the INSTITUTIONAL view.
//
// Every other analytic in AIRMS answers "how is this athlete?". This one
// answers "how is the screening programme?": how many athletes ISN actually
// tested in a period, how often they come back, and whether the population's
// scores are moving up or down. It is the administrator's own performance
// picture, not an athlete's.
//
// Two complementary readings, because they answer different questions:
//
//   PERIODS (yearly / quarterly / monthly) — calendar throughput and the
//   population average per bucket. Answers "did we test more people this
//   quarter than last, and is the squad better than it was?". Comparing period
//   averages mixes cohorts (a period with more juniors reads worse), so this is
//   a programme-level indicator, not proof any athlete changed.
//
//   BETWEEN TESTS — within-athlete consecutive pairs. Answers "when an athlete
//   is retested, do they come back better?", which the calendar view cannot,
//   because each athlete is their own control. Also carries the retest
//   interval, which is the programme's actual screening cadence.
//
// Pure: no DB, no Sequelize. Fed a flat array of screening rows by
// routes/athletes.js and unit-tested in tests/screeningPeriods.test.js.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Scores averaged per period. `higherBetter` drives the arrow direction in the
// UI/PDF, so exerciseRisks (lower = better) is flagged explicitly.
const PERIOD_SCORES = [
  ['overallIndicator', 'Overall indicator', true],
  ['totalScore', 'Total score', true],
  ['rom', 'ROM', true],
  ['stability', 'Stability', true],
  ['symmetry', 'Symmetry', true],
  ['exerciseRisks', 'Exercise risks', false],
];

const BAND_RANK = { green: 0, amber: 1, red: 2 };
const GRAINS = ['month', 'quarter', 'year'];

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

// Calendar bucket for a date. `key` sorts lexicographically inside a grain, so
// it doubles as the ordering value — no separate sort field needed.
function periodKeyOf(date, grain) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (grain === 'year') return { key: String(y), label: String(y) };
  if (grain === 'quarter') {
    const q = Math.floor(m / 3) + 1;
    return { key: `${y}-Q${q}`, label: `Q${q} ${y}` };
  }
  return { key: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MONTHS[m]} ${y}` };
}

const mean = (vals) => (vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null);

function median(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

// Direction of travel for one score, respecting its orientation. `noise` is a
// dead band so a rounding-level wobble doesn't read as a real move.
function directionOf(delta, higherBetter, noise) {
  if (delta === null) return null;
  const gain = higherBetter ? delta : -delta;
  if (gain >= noise) return 'improving';
  if (gain <= -noise) return 'declining';
  return 'steady';
}

// Calendar buckets. Each period carries its throughput (tests, distinct
// athletes, how many of them were retests) and its population averages, plus
// the change against the PREVIOUS period present in the series.
function bucketByPeriod(screenings, grain, noise) {
  const buckets = new Map();
  for (const s of screenings) {
    const p = periodKeyOf(s.assessedAt, grain);
    if (!p) continue;
    if (!buckets.has(p.key)) buckets.set(p.key, { key: p.key, label: p.label, rows: [] });
    buckets.get(p.key).rows.push(s);
  }

  const periods = [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, label, rows }) => {
      const perAthlete = new Map();
      for (const r of rows) perAthlete.set(r.athleteId, (perAthlete.get(r.athleteId) ?? 0) + 1);
      const bands = { green: 0, amber: 0, red: 0, none: 0 };
      for (const r of rows) {
        const b = r.overrideBand || r.overallBand;
        bands[b in bands ? b : 'none'] += 1;
      }
      const averages = {};
      for (const [k] of PERIOD_SCORES) {
        averages[k] = mean(rows.map((r) => num(r[k])).filter((v) => v !== null));
      }
      return {
        key,
        label,
        tests: rows.length,
        athletes: perAthlete.size,
        // Athletes screened more than once inside this bucket — a period can
        // show more tests than athletes, and the gap is worth seeing.
        retestedWithin: [...perAthlete.values()].filter((n) => n > 1).length,
        bands,
        averages,
      };
    });

  // Deltas are against the previous period IN THE SERIES, not the previous
  // calendar bucket: a quarter with no screening at all is simply absent, and
  // comparing across a gap is still the honest comparison to make.
  periods.forEach((p, i) => {
    if (i === 0) { p.deltas = null; p.direction = null; return; }
    const prev = periods[i - 1];
    p.deltas = {};
    for (const [k, , higherBetter] of PERIOD_SCORES) {
      const a = prev.averages[k]; const b = p.averages[k];
      const d = a === null || b === null ? null : +(b - a).toFixed(1);
      p.deltas[k] = { delta: d, higherBetter, direction: directionOf(d, higherBetter, noise) };
    }
    p.direction = p.deltas.overallIndicator ? p.deltas.overallIndicator.direction : null;
  });

  return periods;
}

// Within-athlete consecutive pairs across the whole filtered set. Each athlete
// is their own control here, so this is the only reading that can claim an
// athlete got better rather than the population mix changing.
function bucketBetweenTests(screenings, noise) {
  const byAthlete = new Map();
  for (const s of screenings) {
    if (!byAthlete.has(s.athleteId)) byAthlete.set(s.athleteId, []);
    byAthlete.get(s.athleteId).push(s);
  }

  const out = {
    athletesWithRetest: 0,
    pairs: 0,
    intervalDays: { median: null, min: null, max: null },
    improved: 0,
    declined: 0,
    steady: 0,
    bandMoves: { better: 0, worse: 0, same: 0 },
    deltas: [],
  };
  const intervals = [];
  const sums = new Map(PERIOD_SCORES.map(([k]) => [k, { sum: 0, n: 0 }]));

  for (const [, rows] of byAthlete) {
    const sorted = rows
      .filter((r) => !Number.isNaN(new Date(r.assessedAt || 0).getTime()))
      .sort((a, b) => new Date(a.assessedAt) - new Date(b.assessedAt) || (a.id || 0) - (b.id || 0));
    if (sorted.length < 2) continue;
    out.athletesWithRetest += 1;
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1]; const cur = sorted[i];
      out.pairs += 1;
      const days = Math.round((new Date(cur.assessedAt) - new Date(prev.assessedAt)) / 86400000);
      if (Number.isFinite(days) && days >= 0) intervals.push(days);
      for (const [k] of PERIOD_SCORES) {
        const a = num(prev[k]); const b = num(cur[k]);
        if (a !== null && b !== null) { const acc = sums.get(k); acc.sum += b - a; acc.n += 1; }
      }
      const di = num(cur.overallIndicator) !== null && num(prev.overallIndicator) !== null
        ? num(cur.overallIndicator) - num(prev.overallIndicator) : null;
      const dir = directionOf(di, true, noise);
      if (dir === 'improving') out.improved += 1;
      else if (dir === 'declining') out.declined += 1;
      else if (dir === 'steady') out.steady += 1;
      const pb = BAND_RANK[prev.overrideBand || prev.overallBand];
      const cb = BAND_RANK[cur.overrideBand || cur.overallBand];
      if (pb != null && cb != null) {
        if (cb < pb) out.bandMoves.better += 1;
        else if (cb > pb) out.bandMoves.worse += 1;
        else out.bandMoves.same += 1;
      }
    }
  }

  out.intervalDays = {
    median: median(intervals),
    min: intervals.length ? Math.min(...intervals) : null,
    max: intervals.length ? Math.max(...intervals) : null,
  };
  out.deltas = PERIOD_SCORES.map(([k, label, higherBetter]) => {
    const acc = sums.get(k);
    const avgDelta = acc.n ? +(acc.sum / acc.n).toFixed(1) : null;
    return { key: k, label, higherBetter, avgDelta, direction: directionOf(avgDelta, higherBetter, noise) };
  });
  return out;
}

// `screenings`: flat rows carrying at least { athleteId, assessedAt, id } plus
// any of the PERIOD_SCORES columns and overallBand / overrideBand.
function screeningPeriods(screenings, { grain = 'quarter', noise = 2 } = {}) {
  const g = GRAINS.includes(grain) ? grain : 'quarter';
  const rows = (screenings || []).filter((s) => s && s.assessedAt);
  return {
    grain: g,
    periods: bucketByPeriod(rows, g, noise),
    betweenTests: bucketBetweenTests(rows, noise),
  };
}

module.exports = { screeningPeriods, periodKeyOf, PERIOD_SCORES, GRAINS };
