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

const { BAND_RANK, effectiveBand } = require('./bands');
const GRAINS = ['month', 'quarter', 'year'];
// One step finer, for the composition breakdown a coarse view falls back on.
const FINER = { year: 'quarter', quarter: 'month', month: null };

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

// Every calendar bucket between two keys, inclusive — so the axis can be
// CONTINUOUS.
//
// Standard time-series practice, and the reason matters here more than most: on a
// discrete axis (only the buckets that have data) a quarter in which nobody was
// screened simply disappears, and the two quarters either side of it sit next to
// each other as though they were consecutive. For a screening PROGRAMME, a period
// with no screening is not absence of data — it is the finding.
//
// Nothing is invented before the first screening or after the last: a gap means
// "we ran the programme and tested nobody", which is information, whereas padding
// earlier would assert a period before the programme existed.
function keysBetween(first, last, grain) {
  const out = [];
  if (grain === 'year') {
    for (let y = Number(first.slice(0, 4)); y <= Number(last.slice(0, 4)); y += 1) {
      out.push({ key: String(y), label: String(y) });
    }
    return out;
  }
  if (grain === 'quarter') {
    let [y, q] = [Number(first.slice(0, 4)), Number(first.slice(6))];
    const [ly, lq] = [Number(last.slice(0, 4)), Number(last.slice(6))];
    while (y < ly || (y === ly && q <= lq)) {
      out.push({ key: `${y}-Q${q}`, label: `Q${q} ${y}` });
      q += 1;
      if (q > 4) { q = 1; y += 1; }
    }
    return out;
  }
  let [y, m] = [Number(first.slice(0, 4)), Number(first.slice(5, 7))];
  const [ly, lm] = [Number(last.slice(0, 4)), Number(last.slice(5, 7))];
  while (y < ly || (y === ly && m <= lm)) {
    out.push({ key: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}` });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
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

  // Fill the calendar between the first and last bucket that HAS data, so the
  // axis is continuous and an unscreened period is drawn rather than skipped.
  const present = [...buckets.keys()].sort();
  if (present.length) {
    for (const k of keysBetween(present[0], present[present.length - 1], grain)) {
      if (!buckets.has(k.key)) buckets.set(k.key, { key: k.key, label: k.label, rows: [] });
    }
  }

  const periods = [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, label, rows }) => {
      const perAthlete = new Map();
      for (const r of rows) perAthlete.set(r.athleteId, (perAthlete.get(r.athleteId) ?? 0) + 1);
      const bands = { green: 0, amber: 0, red: 0, none: 0 };
      for (const r of rows) {
        const b = effectiveBand(r);
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

  // Deltas are against the previous period in the series, which is now also the
  // previous CALENDAR period — the axis is continuous, so an unscreened period is
  // present with zero tests rather than skipped. Its averages are null, so the
  // period after a gap reports no change rather than silently comparing across
  // the gap as if the two were consecutive.
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
      const pb = BAND_RANK[effectiveBand(prev)];
      const cb = BAND_RANK[effectiveBand(cur)];
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

// SEASONALITY — Dr Thung's third reading: not "how are we doing over time" but
// "WHICH PART OF THE YEAR is the risky one". Same rows, bucketed by calendar
// POSITION with the year discarded, so every Q3 ever screened lands together.
//
//   *"is it that particular season, that particular quarter that they have more
//   injuries"* — meeting of 2026-04-24, 11:38
//
// WHY THIS REPORTS ITS OWN LIMITS
// With one year of data, "Q3 is worst" and "Q3 is when we happened to screen the
// weakest squad" produce identical numbers. A seasonal claim needs the pattern to
// REPEAT, so `yearsCovered` and `sufficient` travel with the buckets and the
// callers must render the caveat. Stating a season off a single year would be the
// most confidently wrong output in the system — a policy decision ("shift the
// pre-season block") made from one coincidence.
const QUARTER_LABEL = ['Q1 (Jan-Mar)', 'Q2 (Apr-Jun)', 'Q3 (Jul-Sep)', 'Q4 (Oct-Dec)'];

// Calendar position, year discarded. Fixed slot count so a month with no
// screening is still a visible gap rather than a missing row.
function seasonSlots(grain) {
  return grain === 'month'
    ? MONTHS.map((label, i) => ({ key: String(i + 1).padStart(2, '0'), label, pos: i }))
    : QUARTER_LABEL.map((label, i) => ({ key: `Q${i + 1}`, label, pos: i }));
}

function seasonality(screenings, { grain = 'quarter', noise = 2 } = {}) {
  const g = grain === 'month' ? 'month' : 'quarter';
  const rows = (screenings || []).filter((s) => s && s.assessedAt);
  const slots = seasonSlots(g);
  const byKey = new Map(slots.map((s) => [s.key, { ...s, rows: [], years: new Set() }]));
  const allYears = new Set();

  for (const s of rows) {
    const d = new Date(s.assessedAt);
    if (Number.isNaN(d.getTime())) continue;
    const m = d.getUTCMonth();
    const key = g === 'month' ? String(m + 1).padStart(2, '0') : `Q${Math.floor(m / 3) + 1}`;
    const slot = byKey.get(key);
    if (!slot) continue;
    slot.rows.push(s);
    slot.years.add(d.getUTCFullYear());
    allYears.add(d.getUTCFullYear());
  }

  const buckets = [...byKey.values()].map(({
    key, label, pos, rows: bucketRows, years,
  }) => {
    const perAthlete = new Set(bucketRows.map((r) => r.athleteId));
    const bands = { green: 0, amber: 0, red: 0, none: 0 };
    for (const r of bucketRows) {
      const b = effectiveBand(r);
      bands[b in bands ? b : 'none'] += 1;
    }
    const averages = {};
    for (const [k] of PERIOD_SCORES) {
      averages[k] = mean(bucketRows.map((r) => num(r[k])).filter((v) => v !== null));
    }
    const scored = bands.green + bands.amber + bands.red;
    return {
      key,
      label,
      pos,
      tests: bucketRows.length,
      athletes: perAthlete.size,
      // Years this bucket has data from — a bucket seen once is not a season even
      // when the dataset as a whole spans several years.
      years: years.size,
      bands,
      // The comparable "how bad was this part of the year" number. A share, not a
      // count, because ISN does not screen the same number of athletes each quarter.
      flaggedShare: scored ? +((bands.amber + bands.red) / scored).toFixed(3) : null,
      averages,
    };
  }).sort((a, b) => a.pos - b.pos);

  const yearsCovered = allYears.size;
  const sufficient = yearsCovered >= 2;
  const present = buckets.filter((b) => b.tests > 0 && b.flaggedShare !== null);

  // Only named when the pattern could have repeated. Below that it stays null and
  // the caller says why, rather than printing a season nobody should act on.
  let worst = null;
  if (sufficient && present.length >= 2) {
    const ranked = [...present].sort((a, b) => b.flaggedShare - a.flaggedShare);
    const [top, next] = ranked;
    // A dead band, same idea as `noise` on the period deltas: two quarters within
    // a couple of percentage points are not a season, they are a coin toss.
    if ((top.flaggedShare - next.flaggedShare) * 100 >= noise) worst = top.key;
  }

  return {
    grain: g, buckets, yearsCovered, years: [...allYears].sort(), sufficient, worst,
  };
}

// Distinct calendar buckets per grain, counting the CONTINUOUS axis (gaps
// included) so the number matches what the chart will draw.
function grainCounts(rows) {
  const out = {};
  for (const g of GRAINS) {
    const keys = new Set();
    for (const s of rows) {
      const p = periodKeyOf(s.assessedAt, g);
      if (p) keys.add(p.key);
    }
    const present = [...keys].sort();
    out[g] = present.length ? keysBetween(present[0], present[present.length - 1], g).length : 0;
  }
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
    // How many periods EACH grain would produce, so the UI can say which views
    // the data can support before the user clicks one.
    //
    // A grain that yields one period is not a trend, and no chart makes a single
    // point look like one — with ~4 months of screening on record, "Yearly" is a
    // button that can only ever disappoint. Offering it silently and then
    // rendering an apology underneath is worse than labelling it up front.
    grainCounts: grainCounts(rows),
    // The same rows bucketed one grain FINER, so a coarse view that has nothing
    // to compare against still has something to show.
    //
    // A yearly view of four months of screening is a single number, and no
    // presentation rescues a single number — but that year is made of quarters,
    // and those quarters are real content the reader can act on. Rather than
    // telling them to go and change the grain, the year shows what it is made of.
    // Null at month grain, which has no finer bucket here.
    composition: FINER[g] ? { grain: FINER[g], periods: bucketByPeriod(rows, FINER[g], noise) } : null,
    betweenTests: bucketBetweenTests(rows, noise),
    // Seasonality reads at quarter grain regardless of the caller's `grain`: a
    // month-of-year split over ISN's data is a dozen buckets of two or three
    // tests, which looks like a pattern and is not one.
    seasonality: seasonality(rows, { grain: 'quarter', noise }),
  };
}

module.exports = {
  screeningPeriods, seasonality, periodKeyOf, grainCounts, PERIOD_SCORES, GRAINS,
};
