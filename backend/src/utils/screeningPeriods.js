// Screening-programme activity over time — the INSTITUTIONAL view.
//
// Every other analytic answers "how is this athlete?". This answers "how is the
// programme?" — the administrator's performance picture, not an athlete's.
//
// Two readings, because they answer different questions:
//
//   PERIODS (yearly/quarterly/monthly) — calendar throughput and the population
//   average per bucket. Comparing period averages mixes cohorts (a period with
//   more juniors reads worse), so it is a programme indicator, not proof any
//   athlete changed.
//
//   BETWEEN TESTS — within-athlete consecutive pairs, where each athlete is
//   their own control, plus the retest interval the programme actually runs at.
//
// Pure: no DB, no Sequelize. Unit-tested in tests/screeningPeriods.test.js.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Scores averaged per period. `higherBetter` drives the arrow direction in the
// UI/PDF, so exerciseRisks (lower = better) is flagged explicitly.
// Lives in its own module so utils/reliability.js can read it without the two
// files requiring each other.
const { PERIOD_SCORES } = require('./periodScores');
const { reliability, consecutivePairs } = require('./reliability');

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
// `deadBands` is named apart from the local band-COUNT tallies below, which
// are a different thing entirely (green/amber/red headcounts).
function bucketByPeriod(screenings, grain, deadBands) {
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
      p.deltas[k] = {
        delta: d,
        higherBetter,
        direction: directionOf(d, higherBetter, deadBands.deadBandFor(k)),
        deadBand: deadBands.deadBandFor(k),
      };
    }
    p.direction = p.deltas.overallIndicator ? p.deltas.overallIndicator.direction : null;
  });

  return periods;
}

// Within-athlete consecutive pairs across the whole filtered set. Each athlete
// is their own control here, so this is the only reading that can claim an
// athlete got better rather than the population mix changing.
function bucketBetweenTests(screenings, deadBands) {
  // Same pair relation the dead band was derived from — see consecutivePairs.
  const { pairs, athletesWithRetest } = consecutivePairs(screenings);

  const out = {
    athletesWithRetest,
    pairs: 0,
    intervalDays: { median: null, min: null, max: null },
    improved: 0,
    declined: 0,
    steady: 0,
    bandMoves: { better: 0, worse: 0, same: 0 },
    deltas: [],
  };
  const intervals = [];
  // `moved` counts the pairs in which the score actually CHANGED, and it is not
  // redundant with the average. An average of zero has two completely different
  // causes — nobody moved, or gains and losses cancelled — and a panel that
  // renders both as "→ 0" tells the reader the same thing about a stable squad
  // and a churning one. Worse, an all-zero column usually means the retest never
  // re-measured that score, which is a data-quality finding rather than a
  // clinical one, and the reader can only see it if we count it.
  const sums = new Map(PERIOD_SCORES.map(([k]) => [k, { sum: 0, n: 0, moved: 0 }]));

  const indicatorBand = deadBands.deadBandFor('overallIndicator');
  for (const [prev, cur] of pairs) {
    out.pairs += 1;
    const days = Math.round((new Date(cur.assessedAt) - new Date(prev.assessedAt)) / 86400000);
    if (Number.isFinite(days) && days >= 0) intervals.push(days);
    for (const [k] of PERIOD_SCORES) {
      const a = num(prev[k]); const b = num(cur[k]);
      if (a !== null && b !== null) {
        const acc = sums.get(k);
        acc.sum += b - a; acc.n += 1;
        if (b !== a) acc.moved += 1;
      }
    }
    const prevInd = num(prev.overallIndicator);
    const curInd = num(cur.overallIndicator);
    const dir = directionOf(
      prevInd !== null && curInd !== null ? curInd - prevInd : null, true, indicatorBand,
    );
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

  out.intervalDays = {
    median: median(intervals),
    min: intervals.length ? Math.min(...intervals) : null,
    max: intervals.length ? Math.max(...intervals) : null,
  };
  out.deltas = PERIOD_SCORES.map(([k, label, higherBetter]) => {
    const acc = sums.get(k);
    const avgDelta = acc.n ? +(acc.sum / acc.n).toFixed(1) : null;
    return {
      key: k,
      label,
      higherBetter,
      avgDelta,
      comparedPairs: acc.n,
      movedPairs: acc.moved,
      direction: directionOf(avgDelta, higherBetter, deadBands.deadBandFor(k)),
      deadBand: deadBands.deadBandFor(k),
    };
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
// `noise` may be a number (one dead band for every score, the old behaviour) or
// omitted, in which case the band is DERIVED per score from the repeat
// screenings in `screenings` — see utils/reliability.js. Passing a number
// remains supported so a caller with its own justified threshold, and the
// existing tests, are unaffected.
function screeningPeriods(screenings, { grain = 'quarter', noise } = {}) {
  const g = GRAINS.includes(grain) ? grain : 'quarter';
  const rows = (screenings || []).filter((s) => s && s.assessedAt);
  // One reliability pass for the whole call, so every section below judges
  // "did this change" by the same threshold. Two sections of one report
  // disagreeing about whether a move counts is the failure this replaces.
  const rel = reliability(rows);
  // Only `deadBandFor` and `derived` are ever read downstream; the reported
  // scores come from `rel` either way, so an explicit override does not need to
  // carry an empty copy of them.
  const deadBands = typeof noise === 'number'
    ? { deadBandFor: () => noise, derived: false }
    : { deadBandFor: rel.deadBandFor, derived: true };

  return {
    grain: g,
    // What counts as a change, and where that number came from. Travels with
    // the data because a threshold the reader cannot see is a threshold they
    // cannot challenge.
    reliability: {
      derived: deadBands.derived,
      anySufficient: rel.anySufficient,
      minPairs: rel.minPairs,
      fallback: rel.fallback,
      scores: rel.scores,
    },
    periods: bucketByPeriod(rows, g, deadBands),
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
    composition: FINER[g] ? { grain: FINER[g], periods: bucketByPeriod(rows, FINER[g], deadBands) } : null,
    betweenTests: bucketBetweenTests(rows, deadBands),
    // Seasonality reads at quarter grain regardless of the caller's `grain`: a
    // month-of-year split over ISN's data is a dozen buckets of two or three
    // tests, which looks like a pattern and is not one.
    seasonality: seasonality(rows, { grain: 'quarter', noise: deadBands.deadBandFor('overallIndicator') }),
  };
}

module.exports = {
  screeningPeriods, seasonality, periodKeyOf, grainCounts, median, PERIOD_SCORES, GRAINS,
};
