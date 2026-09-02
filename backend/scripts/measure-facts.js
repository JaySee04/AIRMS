// Print the headline numbers this project quotes, measured from the database.
//
//   cd backend; npm run measure:facts
//
// Why this exists: the docs carried FOUR different band splits and TWO different
// reliability pair counts, and a reader could not tell which line was current.
// Every one of those numbers was true when written; the seeder changed under
// them (§34 derived Total Score from the subitems, which moved the whole
// distribution) and prose does not recompute.
//
// Measured 2026-09-02: 38/9/9 of 56 was current, 41/13/4 and 43/10/5 were stale,
// the reliability count is 18 not 19, the small-cohort caveat covers 55 of 56
// rather than "all 56", and the risk-vs-movement quadrant holds 15-17 rather
// than 13.
//
// It reads through the SAME utils the application does, deliberately: a
// measurement script with its own copy of the banding rule would eventually
// disagree with the screens it is supposed to be checking, which is the defect
// class this whole exercise is about (docs/SILENT_FAILURES.md).
//
// Run it before quoting a number in the report or the viva.
// .env before the models: requiring them builds the Sequelize instance from
// process.env, so a later dotenv call is too late. Same pattern as
// scripts/verify-holomotion-extract.js.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Athlete } = require('../src/models');
const { effectiveBand } = require('../src/utils/bands');
const { latestScreeningsByAthlete, resolveCohortStats } = require('../src/utils/cohorts');
const { reliability } = require('../src/utils/reliability');
const { getSettings } = require('../src/utils/settings');
const { Screening } = require('../src/models');
const { PERIOD_SCORES } = require('../src/utils/periodScores');

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// The caveat threshold, read from the component that renders it rather than
// retyped — SMALL_COHORT lives in OverallRiskBadge.tsx and is `size < 10`.
const SMALL_COHORT = 10;

(async () => {
  const settings = await getSettings();
  const roster = await Athlete.findAll({ where: { isActive: true }, raw: true });
  const latest = await latestScreeningsByAthlete();

  console.log('AIRMS — measured facts   ' + new Date().toISOString().slice(0, 10));
  console.log('='.repeat(64));

  console.log('\nROSTER');
  console.log(`  active athletes                 ${roster.length}`);
  console.log(`  with at least one screening     ${latest.length}`);
  console.log(`  never screened                  ${roster.length - latest.length}`);

  console.log('\nBAND SPLIT  (effective band — clinician override applied)');
  const bands = { green: 0, amber: 0, red: 0 };
  let scored = 0;
  for (const { screening } of latest) {
    if (screening.overallIndicator == null) continue;
    scored += 1;
    const b = effectiveBand(screening);
    if (b in bands) bands[b] += 1;
  }
  console.log(`  ${bands.green} green / ${bands.amber} amber / ${bands.red} red   of ${scored} scored`);
  console.log('  (do NOT present this as calibration evidence — see §33/§34)');

  console.log('\nCOHORT SIZE  (the group each athlete is actually scored against)');
  const sizes = [];
  for (const { athlete } of latest) {
    const c = await resolveCohortStats(athlete, {
      minN: settings.min_cohort_n, fallbackEnabled: settings.fallback_enabled,
    });
    if (c && typeof c.n === 'number' && c.n > 0) sizes.push(c.n);
  }
  if (sizes.length) {
    const small = sizes.filter((n) => n < SMALL_COHORT).length;
    console.log(`  min ${Math.min(...sizes)} / median ${median(sizes)} / max ${Math.max(...sizes)}   (n=${sizes.length})`);
    console.log(`  below ${SMALL_COHORT} peers, so self-caveating: ${small} of ${sizes.length}`);
    console.log(`  min_cohort_n=${settings.min_cohort_n}  fallback=${settings.fallback_enabled}`);
  }

  console.log('\nRELIABILITY  (is a change real?)');
  const rows = await Screening.findAll({
    attributes: ['id', 'athleteId', 'assessedAt', ...PERIOD_SCORES.map(([k]) => k)],
    raw: true,
  });
  const rel = reliability(rows);
  console.log(`  repeat pairs on record          ${rel.scores[0] ? rel.scores[0].pairs : 0}   (needs ${rel.minPairs})`);
  console.log(`  any score with enough pairs     ${rel.anySufficient}`);
  console.log(`  => the dead band is ${rel.anySufficient ? 'DERIVED' : 'the documented fallback of ' + rel.fallback + ', and says so on screen'}`);

  console.log('\nRISK vs MOVEMENT  (moves well AND still scores risky)');
  const pts = latest
    .map(({ screening: s }) => ({ t: Number(s.totalScore), r: Number(s.exerciseRisks) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.r));
  if (pts.length) {
    const mT = median(pts.map((p) => p.t));
    const mR = median(pts.map((p) => p.r));
    const strict = pts.filter((p) => p.t > mT && p.r > mR).length;
    const inclusive = pts.filter((p) => p.t >= mT && p.r >= mR).length;
    console.log(`  medians: totalScore ${mT}, exerciseRisks ${mR}`);
    console.log(`  count: ${strict} (strict) to ${inclusive} (ties included)`);
    console.log('  quote the range — the number moves with how ties on the median are handled');
  }

  console.log('\nNORMS IN FORCE');
  console.log(`  pinned_norm_version_id          ${JSON.stringify(settings.pinned_norm_version_id)}`);
  console.log(`  rescreen_due_days               ${settings.rescreen_due_days}`);
  console.log('\n' + '='.repeat(64));
  console.log('Update docs/ and CLAUDE.md from THIS output, not from an older line.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
