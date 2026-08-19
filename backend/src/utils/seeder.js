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
// HoloMotion emits EXACTLY three myodynamia-deficiency and three muscle-tension
// entries per report, each carrying a single side. Verified against all three
// real reports we hold (Thung, Nazwan, Elffie — 18 slots, no exceptions).
//
// Three ways the old seeder diverged from that, all now fixed:
//
//  1. COUNT. It rolled every muscle independently at p=0.18, so an athlete
//     could surface zero flags or eight. Real reports are always 3 + 3.
//  2. SIDE. It emitted 'B' (bilateral) ~15% of the time. HoloMotion has no
//     such value — a bilateral finding is printed as TWO sided lines, e.g.
//     Elffie's "Gluteus maximus R" and "Gluteus maximus L". The old
//     object-keyed shape physically could not represent that, one key per
//     muscle, which is why 'B' existed. An array of pairs can.
//  3. VOCABULARY. It drew uniformly from 24 invented names. Real output is
//     hip-dominated: 14 of the 18 observed slots are Gluteus Maximus, Gluteus
//     Medius, Piriformis, Iliopsoas or Sartorius.
//
// The observed set is only 18 draws, so it is treated as a weighted core rather
// than a closed list — the plausible tail stays reachable so the body map still
// exercises other regions, just at realistic rarity.
//
// Deliberately NOT tuned to reproduce the observed 77.8% hip share: that figure
// rests on 18 slots and is inflated by two of the three athletes happening to be
// hip-heavy, while Thung's entire tension set was upper-body. Landing near 55%
// keeps the distribution honestly hip-dominant without overfitting the sample.
const SIDES = ['L', 'R'];
const CORE_P = 0.8; // share of draws taken from the observed vocabulary

// `exclude` carries the (muscle|side) keys already taken by the other list. A
// muscle cannot be simultaneously weak and tense on the same side — none of the
// three real reports does it — but Gluteus Maximus sits in both cores, so
// drawing the two lists independently produced exactly that contradiction.
function buildFlags(core, tail, exclude = new Set()) {
  const out = [];
  const seen = new Set(exclude);
  let guard = 0;
  while (out.length < 3 && guard < 200) {
    guard += 1;
    const muscle = pick(rnd() < CORE_P || tail.length === 0 ? core : tail);
    const side = SIDES[rnd() < 0.5 ? 0 : 1];
    const key = `${muscle}|${side}`;
    if (seen.has(key)) continue; // the same muscle may recur on the OTHER side
    seen.add(key);
    out.push({ muscle, side });
  }
  return out;
}
function flagKeys(flags) { return new Set(flags.map((f) => `${f.muscle}|${f.side}`)); }

// ── Reference data ──────────────────────────────────────────────────────────
const SPORTS = [
  'Badminton','Swimming','Athletics','Cycling','Diving','Squash','Archery','Bowling',
  'Karate','Taekwondo','Wushu','Silat','Gymnastics','Weightlifting','Sailing',
  'Shooting','Rugby','Football','Hockey','Netball','Sepak Takraw','Bowls','Pencak Silat',
];
const GENDERS = ['Male', 'Female'];
// CORE = muscles actually observed in HoloMotion output; TAIL = the rest of the
// body map's vocabulary, kept reachable but rare. See buildFlags above.
const MUSCLES_DEFICIENCY_CORE = [
  'Gluteus Maximus', 'Gluteus Medius', 'Piriformis', 'Sartorius', 'Internal Oblique',
];
const MUSCLES_DEFICIENCY_TAIL = [
  'Biceps Brachii','Pectoralis Major','Lateral Deltoid','Posterior Deltoid',
  'Rectus Abdominis','External Oblique','Latissimus Dorsi','Vastus Lateralis',
  'Upper Trapezius','Rectus Femoris','Gluteus Minimus',
];
const MUSCLES_TENSION_CORE = [
  'Gluteus Maximus', 'Iliopsoas', 'Pectoralis Major', 'Biceps Brachii',
];
const MUSCLES_TENSION_TAIL = [
  'Sternocleidomastoid','Vastus Medialis','Rectus Capitis Anterior','Upper Trapezius',
  'Middle Deltoid','External Oblique','Internal Oblique','Sartorius','Biceps Femoris',
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

// A fake but valid-SHAPE 12-digit Malaysian IC (YYMMDD + PB + ###G), used as the
// athlete KEY now that IC replaces the old ATHxxxx id (A2). NOT real ICs — the
// digits are derived deterministically from a sequence number so the seed=42
// dataset stays stable and every athlete's key is unique.
//
// The birth year is derived from the athlete's OWN age, so the IC and the age
// column agree — anyone cross-checking the two (which is exactly what an IC is
// for) sees a consistent record. It previously ran off the sequence number
// alone, `(88 + seq) % 100`, which handed later athletes birth years in the
// 1930s and 40s: a 22-year-old whose IC said 1933.
function icFor(seq, age) {
  const birthYear = new Date().getFullYear() - Number(age);
  const yy = String(birthYear % 100).padStart(2, '0');
  const mm = String((seq % 12) + 1).padStart(2, '0');
  const dd = String((seq % 28) + 1).padStart(2, '0');
  const pb = String((seq % 59) + 1).padStart(2, '0');
  // Last 4 keep the key unique even when two athletes share a birth year.
  const rest = String(1000 + seq).slice(-4);
  return `${yy}${mm}${dd}${pb}${rest}`;
}

// The three anchor athletes' ages, kept beside their ICs so the two cannot
// drift apart. Thung is a real reference record (the sample HoloMotion PDF).
const AGE_JOHN = 19;
const AGE_THUNG = 51;
const AGE_NAZWAN = 21;
const IC_JOHN = icFor(1, AGE_JOHN);
const IC_THUNG = icFor(61, AGE_THUNG);
const IC_NAZWAN = icFor(62, AGE_NAZWAN);

function buildAthletes() {
  const athletes = [];
  for (let i = 1; i <= 60; i++) {
    const gender = pick(GENDERS);
    const age = range(15, 32);
    const sport = pick(DEMO_SPORTS);
    // Roughly 1 in 10 athletes has no HoloMotion report ingested yet — their
    // scores stay null / indicators 0 so the "no data" states are demoable.
    const screened = rnd() > 0.1;
    const defFlags = screened ? buildFlags(MUSCLES_DEFICIENCY_CORE, MUSCLES_DEFICIENCY_TAIL) : [];
    const tensionFlags = screened
      ? buildFlags(MUSCLES_TENSION_CORE, MUSCLES_TENSION_TAIL, flagKeys(defFlags))
      : [];
    // Drawn first so Total Score can be derived from them below.
    const mobility = screened ? range(55, 95) : null;
    const stability = screened ? range(55, 95) : null;
    const symmetry = screened ? range(55, 95) : null;
    athletes.push({
      athleteId: icFor(i, age),
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      age,
      gender,
      sport,
      program: pickProgram(age),
      // Total Score is DERIVED, not drawn. On a real HoloMotion report it is the
      // mean of the 25-cell subitem table (verified against three reports,
      // residual <= 1.2), and `genSubitems` builds those cells around mobility,
      // stability and symmetry — 10 ROM cells, 10 stability, 5 symmetry — so
      // their mean is 0.4*mob + 0.4*stab + 0.2*sym. Drawing it independently
      // instead left the four movement components statistically UNRELATED in the
      // seeded data (measured mean residual 9.9, against <= 1.2 on real reports;
      // only 11 of 58 athletes obeyed the instrument's own arithmetic). That hid
      // the composite's real behaviour: on true data those components correlate
      // and the composite weights movement quality above injury burden, which is
      // invisible while they are independent. See docs/DESIGN_DECISIONS.md §34.
      overallActivityScore: screened ? Math.round(0.4 * mobility + 0.4 * stability + 0.2 * symmetry) : null,
      injuryRiskIndex: screened ? range(3, 30) : null,
      mobility,
      stability,
      symmetry,
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
      _myodynamia: defFlags,
      _tension: tensionFlags,
    });
  }

  // Anchor athlete — John Doe, the athlete-login demo. Values are
  // HoloMotion-shaped integers: healthy overall, moderate lumbar indicators, an
  // elevated ankle, and 2+2 muscle flags.
  athletes[0] = {
    athleteId: IC_JOHN,
    name: 'John Doe',
    age: AGE_JOHN,
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
    // Three of each — HoloMotion always emits exactly that.
    _myodynamia: [
      { muscle: 'Vastus Lateralis', side: 'R' },
      { muscle: 'Gluteus Medius', side: 'L' },
      { muscle: 'Gluteus Maximus', side: 'R' },
    ],
    _tension: [
      { muscle: 'Upper Trapezius', side: 'L' },
      { muscle: 'Iliopsoas', side: 'R' },
      { muscle: 'Pectoralis Major', side: 'L' },
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
    athleteId: IC_THUNG,
    name: 'Thung Jin Seng',
    age: AGE_THUNG,
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
    // Deliberately NOT the report's values — Thung is seeded stale so importing
    // his PDF visibly updates him. Three of each, matching HoloMotion's shape.
    _myodynamia: [
      { muscle: 'Rectus Femoris', side: 'L' },
      { muscle: 'Upper Trapezius', side: 'R' },
      { muscle: 'Piriformis', side: 'L' },
    ],
    _tension: [
      { muscle: 'Iliopsoas', side: 'R' },
      { muscle: 'Sternocleidomastoid', side: 'L' },
      { muscle: 'Gluteus Maximus', side: 'L' },
    ],
  });

  // Second ground-truth athlete — Muhammad Nazwan Bin Abdullah ,
  // transcribed 1:1 from his real HoloMotion report (2025-08-13). Distinct
  // page layout from Thung's, so importing both proves the layout-robust
  // extractor and gives a genuine two-athlete batch demo. Subitem scores +
  // real values live on his seeded Screening snapshot (see buildScreenings).
  athletes.push({
    athleteId: IC_NAZWAN,
    name: 'Muhammad Nazwan Bin Abdullah',
    age: AGE_NAZWAN,
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
//   - Thung: his seeded STALE values dated earlier — importing his
//     real PDF then adds a newer, better snapshot → the individual report shows
//     stale→good progress.
//   - Nazwan: his real values + the real subitem table.
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
    if (a.athleteId === IC_NAZWAN) {
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
    { name: 'John Doe', email: 'athlete@isn.gov.my', password: 'athlete123', role: 'athlete', athleteId: IC_JOHN },
    // Ground-truth athlete login — Dr Thung's own HoloMotion report seeded
    // 1:1, so the athlete view can be checked against the printed PDF.
    { name: 'Thung Jin Seng', email: 'thung@isn.gov.my', password: 'thung123', role: 'athlete', athleteId: IC_THUNG },
    // Coach role (first-class 4th role) — one sport per coach. Badminton includes
    // John Doe and Thung, so the coach's squad overlaps the athlete
    // demo logins.
    { name: 'Coach Demo 01', email: 'coach@isn.gov.my', password: 'coach123', role: 'coach', coachSport: 'Badminton' },
    // Executive — read-only oversight. Sees the admin analytics and can download
    // the reports; cannot import, edit norms, touch the roster or personnel.
    { name: 'Datuk Executive', email: 'executive@isn.gov.my', password: 'executive123', role: 'executive' },
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
    // The nudge is applied to the COMPONENTS and Total Score is derived from
    // them, for the same reason `buildScreenings` derives it (§34b): on a real
    // HoloMotion report Total Score IS the mean of the subitem table, so a row
    // whose Total Score moved while ROM, stability and symmetry stayed bit-
    // identical is arithmetic the instrument cannot produce. Nudging all three
    // by `nudge` leaves the derived Total Score exactly where nudging it
    // directly used to — 0.4n + 0.4n + 0.2n = n — so the demonstrated trend is
    // unchanged, and a retest now differs in the things a retest measures.
    const bump = (v) => (v == null ? null : clamp100(Number(v) + nudge));
    const pRom = bump(s.rom);
    const pStab = bump(s.stability);
    const pSym = bump(s.symmetry);
    priorRows.push({
      athleteId: s.athleteId,
      assessedAt: new Date(new Date(s.assessedAt).getTime() - 35 * 86400000),
      importedBy: 'Seed (history)',
      totalScore: (pRom == null || pStab == null || pSym == null)
        ? (s.totalScore != null ? clamp100(Number(s.totalScore) + nudge) : null)
        : clamp100(0.4 * pRom + 0.4 * pStab + 0.2 * pSym),
      exerciseRisks: s.exerciseRisks,
      rom: pRom, stability: pStab, symmetry: pSym,
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
  console.log('  Executive: executive@isn.gov.my        / executive123 (read-only: analytics + reports)');
  console.log(`  Athlete: athlete@isn.gov.my            / athlete123   (John Doe, IC ${IC_JOHN})`);
  console.log(`  Athlete: thung@isn.gov.my              / thung123     (Thung Jin Seng, IC ${IC_THUNG} — 1:1 with the sample HoloMotion PDF)`);
  console.log('  Coach:   coach@isn.gov.my              / coach123');

  await sequelize.close();
  console.log('\nSeeding complete.');
}

// RUN ONLY WHEN INVOKED AS A SCRIPT.
//
// This file used to call seed() unconditionally at import time, so
// `require('./src/utils/seeder')` — the obvious way to check the module parses —
// silently dropped the schema and reseeded the database. It cost a pinned norm
// version and an entire audit trail on 2026-08-19 before anyone noticed what had
// happened, because the destructive part looks exactly like a successful import.
//
// `npm run seed` still works: it runs this file directly, so require.main is this
// module. Nothing else can trigger it by accident — including a test that pulls in
// a module which happens to require this one. See docs/DESIGN_DECISIONS.md §34c.
if (require.main === module) {
  seed().catch(async (err) => {
    console.error(err);
    try { await sequelize.close(); } catch (_) {}
    process.exit(1);
  });
}

module.exports = { seed };
