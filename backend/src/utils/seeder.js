/**
 * Seed script — populates MySQL with the AIRMS prototype mock data.
 *
 * Run once: npm run seed
 * Safe to re-run: drops + recreates the schema before inserting.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { sequelize, User, Athlete, MuscleFlag, AthleteDiscipline, Screening, CohortThreshold } = require('../models');

// ── Deterministic PRNG (seed=42 — same demo data on every reseed) ──────────
let _seed = 42;
function rnd() { _seed = (_seed * 9301 + 49297) % 233280; return _seed / 233280; }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function range(min, max) { return Math.floor(rnd() * (max - min + 1)) + min; }
function rfloat(min, max, dp = 1) { return parseFloat((rnd() * (max - min) + min).toFixed(dp)); }
function maybeFlag(p) {
  if (rnd() > p) return null;
  const r = rnd();
  return r < 0.45 ? 'L' : r < 0.85 ? 'R' : 'B';
}
function buildFlags(muscles, p) {
  const out = {};
  muscles.forEach((m) => { const f = maybeFlag(p); if (f) out[m] = f; });
  return out;
}
function objToArray(obj) {
  return Object.entries(obj).map(([muscle, side]) => ({ muscle, side }));
}

// ── Reference data ──────────────────────────────────────────────────────────
const SPORTS = [
  'Badminton','Swimming','Athletics','Cycling','Diving','Squash','Archery','Bowling',
  'Karate','Taekwondo','Wushu','Silat','Gymnastics','Weightlifting','Sailing',
  'Shooting','Rugby','Football','Hockey','Netball','Sepak Takraw','Bowls','Pencak Silat',
];
const GENDERS = ['Male', 'Female'];
const MUSCLES_DEFICIENCY = [
  'Biceps Brachii','Pectoralis Major','Lateral Deltoid','Posterior Deltoid',
  'Rectus Abdominis','External Oblique','Internal Oblique','Latissimus Dorsi',
  'Gluteus Maximus','Gluteus Medius','Piriformis','Sartorius','Vastus Lateralis',
  'Upper Trapezius','Rectus Femoris','Gluteus Minimus',
];
const MUSCLES_TENSION = [
  'Sternocleidomastoid','Vastus Medialis','Rectus Capitis Anterior','Upper Trapezius',
  'Middle Deltoid','Biceps Brachii','Pectoralis Major','External Oblique',
  'Internal Oblique','Iliopsoas','Gluteus Maximus','Sartorius','Biceps Femoris',
];
const FIRST_NAMES = ['Aiman','Hafiz','Nurul','Siti','Faris','Zikri','Aisha','Lina','Adam','Hadi','Yusof','Imran','Aina','Sarah','Ariff','Iqbal','Maya','Daniel','Hannah','Zara'];
const LAST_NAMES = ['Hassan','Ibrahim','Rahman','Yusoff','Zainal','Othman','Bakar','Saleh','Ismail','Latif','Tan','Lee','Wong','Lim','Chong','Kumar','Raj','Devi','Ahmad','Karim'];

function pickProgram(age) {
  if (age >= 13 && age <= 21 && rnd() < 0.7) return 'PELAPIS';
  if (rnd() < 0.85) return 'PODIUM';
  return 'OTHERS';
}

// ── Build athletes ──────────────────────────────────────────────────────────
// All screening values mirror what a HoloMotion "Report of Physical Quality
// and Exercise Risks" actually carries: integer gauge scores (Total Score,
// ROM, Stability, Symmetry on 0–100; Exercise Risks and the eight per-region
// indicators on the report's risk scale, lower = better) plus the two muscle
// lists. Fields the report does NOT contain (weight, height) are left null —
// AIRMS stores only what its real ingestion source provides. sport/program
// are operator-supplied at import time, so they are always present.
// Concentrate the seeded roster into a handful of sports so the cohort-norm
// engine has n>=5 per group (a standard deviation over 1-2 athletes is
// meaningless). Seed-only — real ISN imports use the full 52-sport list. This
// also exercises the fallback ladder: sport+programme+gender cohorts stay
// small, so most athletes norm against the sport+gender or sport tier.
const DEMO_SPORTS = ['Badminton', 'Swimming', 'Athletics', 'Football', 'Hockey'];

function buildAthletes() {
  const athletes = [];
  for (let i = 1; i <= 60; i++) {
    const gender = pick(GENDERS);
    const age = range(15, 32);
    const sport = pick(DEMO_SPORTS);
    // Roughly 1 in 10 athletes has no HoloMotion report ingested yet — their
    // scores stay null / indicators 0 so the "no data" states are demoable.
    const screened = rnd() > 0.1;
    const defFlags = screened ? buildFlags(MUSCLES_DEFICIENCY, 0.18) : {};
    const tensionFlags = screened ? buildFlags(MUSCLES_TENSION, 0.18) : {};
    athletes.push({
      athleteId: 'ATH' + String(i).padStart(4, '0'),
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      age,
      gender,
      sport,
      program: pickProgram(age),
      overallActivityScore: screened ? range(55, 95) : null,
      injuryRiskIndex: screened ? range(3, 30) : null,
      mobility: screened ? range(55, 95) : null,
      stability: screened ? range(55, 95) : null,
      symmetry: screened ? range(55, 95) : null,
      // Kept uniform over the report's observed range: the two ground-truth
      // HoloMotion reports (Thung 15/18/14/24/9/26/27, Nazwan 14/8/12/16/15/
      // 21/26) sit at a median of ~15 with about half of all regions above 15,
      // which is what range(2,28) reproduces. Do not "skew healthy" to quiet
      // the alert volume — that hides the real cause (the AIRMS band scheme is
      // far tighter than HoloMotion's printed Low 0-15 / Medium 16-55 legend).
      neckInjuryRisk: screened ? range(2, 28) : 0,
      shoulderInjuryRisk: screened ? range(2, 28) : 0,
      scoliosis: screened ? range(2, 28) : 0,
      spinalDiscHerniation: screened ? range(2, 28) : 0,
      lumbarPelvisInjury: screened ? range(2, 28) : 0,
      jointPain: screened ? range(0, 20) : 0,
      kneeInjuryRisk: screened ? range(2, 28) : 0,
      ankleInjuryRisk: screened ? range(2, 28) : 0,
      _myodynamia: objToArray(defFlags),
      _tension: objToArray(tensionFlags),
    });
  }

  // Anchor athlete — John Doe, the athlete-login demo (ATH0001). Values are
  // HoloMotion-shaped integers preserving the profile the Module 2 walkthrough
  // depends on: healthy overall, moderate spinal-disc / lumbar indicators, an
  // elevated ankle, and 2+2 muscle flags — below the 5-flag escalation
  // threshold in classifyCompositeRisk so his band escalates via active
  // injuries ("Elevated"), not muscle-flag pile-up ("High Risk").
  athletes[0] = {
    athleteId: 'ATH0001',
    name: 'John Doe',
    age: 19,
    gender: 'Male',
    sport: 'Badminton', program: 'PODIUM',
    overallActivityScore: 80,
    injuryRiskIndex: 10,
    mobility: 80, stability: 78, symmetry: 82,
    neckInjuryRisk: 5,
    shoulderInjuryRisk: 7,
    scoliosis: 8,
    spinalDiscHerniation: 15,
    lumbarPelvisInjury: 15,
    jointPain: 6,
    kneeInjuryRisk: 3,
    ankleInjuryRisk: 20,
    _myodynamia: [
      { muscle: 'Vastus Lateralis', side: 'R' },
      { muscle: 'Gluteus Medius', side: 'L' },
    ],
    _tension: [
      { muscle: 'Upper Trapezius', side: 'L' },
      { muscle: 'Iliopsoas', side: 'R' },
    ],
  };

  // Reference athlete — Dr Thung (thung jin seng). Deliberately seeded as a
  // STALE earlier assessment (modelled on the worse 07-17 test the sample
  // report's own "Multi Move Tendency" page shows preceding the printed
  // 07-19 results), so that importing the sample HoloMotion PDF visibly
  // updates every value on his dashboard to the printed report:
  //   Total 68→77 · ExRisks 21→12 · ROM 74→88 · Stab 65→72 · Symm 70→75
  //   Knee 26→18 (High→Watch) · Ankle 27→19 · Lumbar 24→17 · muscle flags swap
  // The extraction ground truth (the printed 07-19 values) lives in
  // scripts/verify-holomotion-extract.js. sport/program are operator-supplied.
  athletes.push({
    athleteId: 'ATH0061',
    name: 'Thung Jin Seng',
    age: 51,
    gender: 'Male',
    sport: 'Badminton', program: 'OTHERS',
    overallActivityScore: 68,
    injuryRiskIndex: 21,
    mobility: 74,
    stability: 65,
    symmetry: 70,
    neckInjuryRisk: 15,
    shoulderInjuryRisk: 18,
    scoliosis: 14,
    spinalDiscHerniation: 22,
    lumbarPelvisInjury: 24,
    jointPain: 9,
    kneeInjuryRisk: 26,
    ankleInjuryRisk: 27,
    _myodynamia: [
      { muscle: 'Rectus Femoris', side: 'L' },
      { muscle: 'Upper Trapezius', side: 'R' },
    ],
    _tension: [
      { muscle: 'Iliopsoas', side: 'R' },
      { muscle: 'Sternocleidomastoid', side: 'L' },
    ],
  });

  // Second ground-truth athlete — Muhammad Nazwan Bin Abdullah (ATH0062),
  // transcribed 1:1 from his real HoloMotion report (2025-08-13). Distinct
  // page layout from Thung's, so importing both proves the layout-robust
  // extractor and gives a genuine two-athlete batch demo. Subitem scores +
  // real values live on his seeded Screening snapshot (see buildScreenings).
  athletes.push({
    athleteId: 'ATH0062',
    name: 'Muhammad Nazwan Bin Abdullah',
    age: 21,
    gender: 'Male',
    sport: 'Badminton', program: 'PODIUM',
    overallActivityScore: 78,   // Total Score
    injuryRiskIndex: 14,        // Exercise Risks
    mobility: 71,               // ROM (Average)
    stability: 82,              // Good
    symmetry: 88,               // Excellent
    neckInjuryRisk: 14,         // Neck Pain
    shoulderInjuryRisk: 8,      // Shoulder Pain
    scoliosis: 12,
    spinalDiscHerniation: 16,   // Lumbar Disc Herniation (stored, not shown)
    lumbarPelvisInjury: 16,     // Anterior pelvic tilt
    jointPain: 15,
    kneeInjuryRisk: 21,         // Ligament Strain
    ankleInjuryRisk: 26,        // Ankle Sprain
    _myodynamia: [
      { muscle: 'Gluteus Medius', side: 'L' },
      { muscle: 'Piriformis', side: 'L' },
      { muscle: 'Piriformis', side: 'R' },
    ],
    _tension: [
      { muscle: 'Gluteus Maximus', side: 'L' },
      { muscle: 'Gluteus Maximus', side: 'R' },
      { muscle: 'Iliopsoas', side: 'L' },
    ],
  });

  return athletes;
}

// Nazwan's real Physical Fitness Subitem Score table (page 5 of his report):
// region → [ROM-L, ROM-R, Stability-L, Stability-R, Symmetry].
const NAZWAN_SUBITEMS = {
  neck: { romL: 83, romR: 72, stabL: 76, stabR: 76, sym: 83 },
  shoulder: { romL: 89, romR: 85, stabL: 84, stabR: 82, sym: 89 },
  torso: { romL: 70, romR: 67, stabL: 87, stabR: 89, sym: 90 },
  pelvis: { romL: 62, romR: 71, stabL: 76, stabR: 82, sym: 86 },
  lowerLimbs: { romL: 66, romR: 68, stabL: 76, stabR: 79, sym: 91 },
};

// Plausible Physical Fitness Subitem Scores for the rest of the screened
// population (Nazwan keeps his real table above). Regional values are jittered
// around the athlete's headline ROM/Stability/Symmetry so the table reads
// coherently with the gauges, with the occasional marked L/R gap so the
// balance component and the reports' asymmetry callouts have real signal.
function genSubitems(a) {
  const clamp = (v) => Math.max(42, Math.min(97, Math.round(v)));
  const around = (base) => clamp((base ?? 70) + range(-8, 8));
  const region = () => {
    const gap = rnd() < 0.25 ? range(6, 14) : range(0, 5); // 1-in-4 regions asymmetric
    const flip = rnd() < 0.5 ? 1 : -1;
    const romL = around(a.mobility);
    const stabL = around(a.stability);
    return {
      romL,
      romR: clamp(romL + flip * gap),
      stabL,
      stabR: clamp(stabL - flip * range(0, 6)),
      sym: around(a.symmetry),
    };
  };
  return { neck: region(), shoulder: region(), torso: region(), pelvis: region(), lowerLimbs: region() };
}

// Build immutable Screening history snapshots. Every screened athlete gets one
// snapshot mirroring their latest (athletes-table) values so Stage B cohort
// stats have a full population. Ground-truth athletes get richer snapshots:
//   - Thung (ATH0061): his seeded STALE values dated earlier — importing his
//     real PDF then adds a newer, better snapshot → the individual report shows
//     stale→good progress.
//   - Nazwan (ATH0062): his real values + the real subitem table.
function buildScreenings(athletes) {
  const daysAgo = (d) => { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt; };
  const snap = (a, assessedAt, extra = {}) => ({
    athleteId: a.athleteId,
    assessedAt,
    importedBy: 'Seed',
    totalScore: a.overallActivityScore ?? null,
    exerciseRisks: a.injuryRiskIndex ?? null,
    rom: a.mobility ?? null,
    stability: a.stability ?? null,
    symmetry: a.symmetry ?? null,
    neckInjuryRisk: a.neckInjuryRisk ?? 0,
    shoulderInjuryRisk: a.shoulderInjuryRisk ?? 0,
    scoliosis: a.scoliosis ?? 0,
    spinalDiscHerniation: a.spinalDiscHerniation ?? 0,
    lumbarPelvisInjury: a.lumbarPelvisInjury ?? 0,
    jointPain: a.jointPain ?? 0,
    kneeInjuryRisk: a.kneeInjuryRisk ?? 0,
    ankleInjuryRisk: a.ankleInjuryRisk ?? 0,
    muscleFlags: { myodynamia: a._myodynamia, tension: a._tension },
    ...extra,
  });

  const rows = [];
  for (const a of athletes) {
    const screened = a.overallActivityScore != null;
    if (!screened) continue;
    if (a.athleteId === 'ATH0062') {
      rows.push(snap(a, daysAgo(6), { subitems: NAZWAN_SUBITEMS }));
    } else {
      rows.push(snap(a, daysAgo(range(20, 75)), { subitems: genSubitems(a) }));
    }
  }
  return rows;
}

function flattenMuscleFlags(athletes) {
  const rows = [];
  athletes.forEach((a) => {
    a._myodynamia.forEach((m) => rows.push({
      athleteId: a.athleteId, flagType: 'myodynamia', muscle: m.muscle, side: m.side,
    }));
    a._tension.forEach((m) => rows.push({
      athleteId: a.athleteId, flagType: 'tension', muscle: m.muscle, side: m.side,
    }));
  });
  return rows;
}

function buildUsers() {
  // Plain-text passwords here — the User model's beforeSave hook hashes
  // them when bulkCreate runs with individualHooks: true.
  return [
    { name: 'Admin User', email: 'admin@isn.gov.my', password: 'admin123', role: 'admin' },
    { name: 'Admin Demo', email: 'poseidonapollo11@gmail.com', password: 'admin123', role: 'admin' },
    { name: 'Medical Demo 01', email: 'medical@isn.gov.my', password: 'medical123', role: 'medical' },
    // Live-alert test recipient (2026-07-17): a real, deliverable inbox. Import-
    // commit alerts email ALL active medical staff, so any flagged athlete's
    // alert lands here — lets JC verify the email feature against a checkable
    // inbox. Also a working login (medical view) if useful. (The other seeded
    // recipients use fake @isn.gov.my addresses, so real sends to those bounce
    // to the SMTP account — expected; delete those bounce-backs.)
    { name: 'Medical Demo 02', email: '23005005@siswa.um.edu.my', password: 'medical123', role: 'medical' },
    { name: 'John Doe', email: 'athlete@isn.gov.my', password: 'athlete123', role: 'athlete', athleteId: 'ATH0001' },
    // Ground-truth athlete login — Dr Thung's own HoloMotion report seeded
    // 1:1 as ATH0061, so the athlete view can be checked against the PDF.
    { name: 'Thung Jin Seng', email: 'thung@isn.gov.my', password: 'thung123', role: 'athlete', athleteId: 'ATH0061' },
    // Coach role (first-class 4th role) — one sport per coach. Badminton includes ATH0001
    // (John Doe) + ATH0061 (Thung), so the coach's squad overlaps the athlete
    // demo logins.
    { name: 'Coach Demo 01', email: 'coach@isn.gov.my', password: 'coach123', role: 'coach', coachSport: 'Badminton' },
  ];
}

// Seed events for badminton athletes (the one sport with disciplines so far).
// Deterministic assignment by gender + rotation: a singles-or-doubles primary
// event for everyone, plus Mixed Doubles for every third athlete, so the coach
// board shows athletes spread across all five events with some overlap.
function buildDisciplines(athleteRows) {
  const male = ["Men's Singles", "Men's Doubles"];
  const female = ["Women's Singles", "Women's Doubles"];
  const rows = [];
  let i = 0;
  for (const a of athleteRows) {
    if (a.sport !== 'Badminton') continue;
    const pool = a.gender === 'Female' ? female : male;
    rows.push({ athleteId: a.athleteId, discipline: pool[i % 2] });
    if (i % 3 === 0) rows.push({ athleteId: a.athleteId, discipline: 'Mixed Doubles' });
    i += 1;
  }
  return rows;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function seed() {
  await sequelize.authenticate();
  console.log(`Connected to MySQL: ${sequelize.config.host}:${sequelize.config.port}/${sequelize.config.database}`);

  // Retired tables — force sync below only touches tables still backed by a
  // model, so a pre-existing dev database keeps these as FK-referencing orphans;
  // drop them first or sync's own DROP TABLE `athletes` fails. `injuries` +
  // `self_reports` were removed 2026-08-02 (HoloMotion-only); `activities` /
  // `recovery_baselines` when Activity Tracking was removed 2026-07-20.
  await sequelize.query('DROP TABLE IF EXISTS `injuries`');
  await sequelize.query('DROP TABLE IF EXISTS `self_reports`');
  await sequelize.query('DROP TABLE IF EXISTS `recovery_baselines`');
  await sequelize.query('DROP TABLE IF EXISTS `activities`');

  // Drop + recreate every table managed by these models. Sequelize handles
  // FK ordering automatically so we don't have to delete in any specific order.
  await sequelize.sync({ force: true });
  console.log('Schema recreated (force sync)');

  const athletes = buildAthletes();
  const muscleFlags = flattenMuscleFlags(athletes);

  // Drop the helper sub-arrays before bulk-inserting Athlete rows.
  const athleteRows = athletes.map(({ _myodynamia, _tension, ...rest }) => rest);

  await sequelize.transaction(async (t) => {
    await Athlete.bulkCreate(athleteRows, { transaction: t });
    console.log(`Inserted ${athleteRows.length} athletes`);

    await MuscleFlag.bulkCreate(muscleFlags, { transaction: t });
    console.log(`Inserted ${muscleFlags.length} muscle flags`);

    const disciplines = buildDisciplines(athleteRows);
    await AthleteDiscipline.bulkCreate(disciplines, { transaction: t });
    console.log(`Inserted ${disciplines.length} athlete-discipline rows`);

    const screenings = buildScreenings(athletes);
    await Screening.bulkCreate(screenings, { transaction: t });
    console.log(`Inserted ${screenings.length} screening snapshots`);

    const users = buildUsers();
    await User.bulkCreate(users, { transaction: t, individualHooks: true });
    console.log(`Inserted ${users.length} demo users`);
  });

  // Cohort norms + overall indicators. Compute the cohort thresholds, auto-
  // approve them (so the demo has live norms without a manual approval pass —
  // real imports leave new cohorts pending for admin review), then score every
  // athlete's overall indicator against them.
  const { recomputeCohorts } = require('./cohorts');
  const { recomputeIndicators } = require('./overallIndicator');
  const c = await recomputeCohorts();
  await CohortThreshold.update(
    { status: 'approved', approvedAt: new Date(), approvedBy: 'Seed' },
    { where: {} },
  );
  const ind = await recomputeIndicators();
  console.log(`Computed ${c.cohorts} cohorts (auto-approved); scored ${ind.scored}/${ind.athletes} athletes`);

  // Prior screening snapshots for ~1/3 of scored athletes, so the coach
  // dashboard's trend arrows + squad-momentum have history to compare against.
  // Real history accrues as new reports are imported; this makes the feature
  // visible in the seeded demo. Older snapshots never affect cohort norms (those
  // use each athlete's LATEST row) and carry an explicit indicator (recompute
  // only scores the latest per athlete).
  const scoredRows = await Screening.findAll({ order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true });
  const latestByAth = new Map();
  for (const s of scoredRows) if (s.overallIndicator != null && !latestByAth.has(s.athleteId)) latestByAth.set(s.athleteId, s);
  const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));
  const DELTAS = [-8, -5, 6, 4, -3, 7];
  const priorRows = [];
  let hi = 0;
  for (const [, s] of latestByAth) {
    hi += 1;
    if (hi % 3 !== 0) continue; // every third athlete gets a prior snapshot
    const delta = DELTAS[hi % DELTAS.length];       // current − prev (positive = improved)
    const nudge = delta > 0 ? -3 : 3;               // move the raw score consistent with the trend
    priorRows.push({
      athleteId: s.athleteId,
      assessedAt: new Date(new Date(s.assessedAt).getTime() - 35 * 86400000),
      importedBy: 'Seed (history)',
      totalScore: s.totalScore != null ? clamp100(Number(s.totalScore) + nudge) : null,
      exerciseRisks: s.exerciseRisks,
      rom: s.rom, stability: s.stability, symmetry: s.symmetry,
      neckInjuryRisk: s.neckInjuryRisk, shoulderInjuryRisk: s.shoulderInjuryRisk, scoliosis: s.scoliosis,
      spinalDiscHerniation: s.spinalDiscHerniation, lumbarPelvisInjury: s.lumbarPelvisInjury,
      jointPain: s.jointPain, kneeInjuryRisk: s.kneeInjuryRisk, ankleInjuryRisk: s.ankleInjuryRisk,
      overallIndicator: clamp100(Number(s.overallIndicator) - delta),
      overallBand: s.overallBand,
      escalations: s.escalations,
    });
  }
  if (priorRows.length) {
    await Screening.bulkCreate(priorRows);
    console.log(`Inserted ${priorRows.length} prior screening snapshots (coach trend history)`);
  }

  console.log('\nDemo credentials:');
  console.log('  Admin:   admin@isn.gov.my              / admin123');
  console.log('  Admin:   poseidonapollo11@gmail.com    / admin123');
  console.log('  Medical: medical@isn.gov.my            / medical123');
  console.log('  Medical: 23005005@siswa.um.edu.my      / medical123   (live-alert test inbox)');
  console.log('  Athlete: athlete@isn.gov.my            / athlete123   (John Doe, ATH0001)');
  console.log('  Athlete: thung@isn.gov.my              / thung123     (Thung Jin Seng, ATH0061 — 1:1 with the sample HoloMotion PDF)');
  console.log('  Coach:   coach@isn.gov.my              / coach123');

  await sequelize.close();
  console.log('\nSeeding complete.');
}

seed().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
