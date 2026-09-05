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

const { Op } = require('sequelize');
const {
  Athlete, Screening, CohortThreshold, CohortNormVersion, AuditLog, User, MuscleFlag,
} = require('../src/models');
const { effectiveBand } = require('../src/utils/bands');
const {
  latestScreeningsByAthlete, resolveCohortStats, SMALL_COHORT,
} = require('../src/utils/cohorts');
const { reliability } = require('../src/utils/reliability');
const { getSettings } = require('../src/utils/settings');
const { PERIOD_SCORES } = require('../src/utils/periodScores');
// median and SMALL_COHORT come from the application, not from a second
// implementation here: a measurement script that computes its own median or
// carries its own threshold will eventually report a number the screens do
// not, which is the exact drift this script exists to detect.
//
// From utils/num, which is where the ONE median lives (DD 56). This line said
// `screeningPeriods` until 2026-09-05 and had stopped working: the §56 sweep
// moved `median` out and re-exported nothing, so the destructure quietly bound
// `undefined` and the script died at the call with "median is not a function".
// A dangling NAMED import is not a resolution error — the module resolves fine
// — so neither `node --check` nor a require() smoke test would have caught it.
// tests/scriptImports.test.js now checks the names, not just the paths.
const { median } = require('../src/utils/num');


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
  // What the pin actually HOLDS. CLAUDE.md quoted "50 of 50 cohorts held" in the
  // same sentence as "snapshots all 49" for two weeks: the 50 was a superseded
  // version that a reseed had destroyed, and prose does not recompute. This is
  // read-only evidence of the same property — the live table, the snapshot it
  // was installed from, and how many rows have parked what the data WOULD say.
  // Deliberately does NOT call recomputeCohorts(): that writes, and a
  // measurement script must not change the thing it is measuring.
  const pinnedId = settings.pinned_norm_version_id;
  if (pinnedId) {
    const v = await CohortNormVersion.findByPk(pinnedId);
    let snapRows = null;
    if (v) {
      try {
        const rawSnap = typeof v.snapshot === 'string' ? JSON.parse(v.snapshot) : v.snapshot;
        snapRows = Array.isArray(rawSnap) ? rawSnap.length : null;
      } catch (e) { snapRows = null; }
    }
    // `label`, not `name` — the column is `label` (models/CohortNormVersion.js).
    console.log(`  version in force                ${v ? JSON.stringify(v.label) : '(MISSING - pinned id points at nothing)'}`);
    console.log(`  cohorts in that snapshot        ${snapRows === null ? 'unreadable' : snapRows}`);
  }
  console.log(`  live cohort rows                ${await CohortThreshold.count()}`);
  console.log(`  ...parking fresh_stats          ${await CohortThreshold.count({ where: { freshStats: { [Op.ne]: null } } })}   (so pinDrift has something to show)`);
  console.log(`  ...added since the pin          ${await CohortThreshold.count({ where: { addedSincePin: true } })}   (created live so nobody is unscoreable)`);

  // The rest of the viva dossier's table. These are here because they are
  // precisely the rows that rotted: §2 said "11 hosted / 1 local" audit rows and
  // "382 backend tests" long after both had moved — because the script that
  // says "re-measure before quoting" covered only half of its own table.
  console.log('\nSCALE  (the rest of the dossier table)');
  console.log(`  screenings held                 ${await Screening.count()}`);
  console.log(`  saved norm versions             ${await CohortNormVersion.count()}`);
  console.log(`  users                           ${await User.count()}`);
  console.log(`  muscle flags                    ${await MuscleFlag.count()}`);
  console.log(`  audit rows                      ${await AuditLog.count()}   (a reseed clears these)`);

  console.log('\nREPOSITORY');
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  let commits = 'unavailable';
  try {
    commits = execSync('git rev-list --count HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (e) { /* not a git checkout */ }
  console.log(`  commits on this branch          ${commits}`);
  const walk = (d, re, acc = []) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, f.name);
      if (f.isDirectory()) walk(full, re, acc);
      else if (re.test(f.name)) acc.push(full);
    }
    return acc;
  };
  const countSuites = (dir, re) => { try { return walk(dir, re).length; } catch (e) { return 'unavailable'; } };
  console.log(`  backend test suites             ${countSuites(path.join(__dirname, '..', 'tests'), /\.test\.js$/)}`);
  console.log(`  frontend test suites            ${countSuites(path.join(__dirname, '..', '..', 'frontend', 'src'), /\.test\.tsx?$/)}`);
  // The per-test TOTALS are deliberately NOT computed here. Only a run knows how
  // many cases a suite contains, and a plausible number obtained by counting
  // `it(` would be exactly the kind of figure this script exists to stop anyone
  // quoting. Declining beats inventing — the same rule as reliability.js.
  console.log('  individual test counts          run `npx jest` in each package - not inferable from the files');

  console.log('\n' + '='.repeat(64));
  console.log('Update docs/ and CLAUDE.md from THIS output, not from an older line.');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
