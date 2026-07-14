/**
 * Seed script — populates MySQL with the AIRMS prototype mock data.
 *
 * Run once: npm run seed
 * Safe to re-run: drops + recreates the schema before inserting.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { sequelize, User, Athlete, MuscleFlag, Activity, Injury, SelfReport, Screening } = require('../models');

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
const BODY_PARTS = ['Neck','Shoulder','Spine','Lumbar/Pelvis','Knee','Ankle','Wrist','Elbow','Hip','Other'];
const SIDES = ['Left','Right','Both','N/A'];
const INJURY_TYPES = ['Strain','Sprain','Tendinitis','Bursitis','Fracture','Contusion','Dislocation','Other'];
const SEVERITY = ['Minor','Moderate','Severe'];
const RECOVERY = ['Recovering','Recovered','Chronic'];
const MECHANISMS = ['Contact','Non-contact','Overuse','Recurrent'];
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
function buildAthletes() {
  const athletes = [];
  for (let i = 1; i <= 60; i++) {
    const gender = pick(GENDERS);
    const age = range(15, 32);
    const sport = pick(SPORTS);
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
      rows.push(snap(a, daysAgo(range(20, 75))));
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

// ── Build activity logs (demo athletes, 8 weeks) ────────────────────────────
function buildActivities() {
  const types = ['Strength','Endurance','Speed','Skill','Match','Recovery'];
  const intensityMap = {
    Recovery: [3,5], Skill: [4,6], Speed: [6,8],
    Strength: [6,9], Endurance: [5,8], Match: [7,10],
  };
  const logs = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let day = 56; day >= 28; day--) {
    if (rnd() < 0.3) continue;
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    const type = pick(types);
    const duration = range(40, 110);
    const intensity = range(intensityMap[type][0], intensityMap[type][1]);
    logs.push({
      athleteId: 'ATH0001',
      date,
      type,
      duration,
      intensity,
      load: duration * intensity,
    });
  }

  // Thung Jin Seng (ATH0061) — steady low-to-moderate masters-athlete volume,
  // ~3 sessions/week over the full 8-week window, so his ACWR/dashboard view
  // renders a stable baseline to hold his HoloMotion screening against.
  for (let day = 56; day >= 0; day -= 2) {
    if (rnd() < 0.35) continue;
    const date = new Date(today);
    date.setDate(date.getDate() - day);
    const type = pick(['Skill', 'Endurance', 'Recovery', 'Strength']);
    const duration = range(35, 70);
    const intensity = range(3, 6);
    logs.push({
      athleteId: 'ATH0061',
      date,
      type,
      duration,
      intensity,
      load: duration * intensity,
    });
  }

  const curated = [
    { offset:  0, type: 'Match',     duration: 65, intensity: 8 },
    { offset:  1, type: 'Recovery',  duration: 45, intensity: 4 },
    { offset:  3, type: 'Skill',     duration: 55, intensity: 6 },
    { offset:  4, type: 'Speed',     duration: 50, intensity: 7 },
    { offset:  6, type: 'Endurance', duration: 60, intensity: 7 },
    { offset:  7, type: 'Strength',  duration: 70, intensity: 8 },
    { offset:  8, type: 'Recovery',  duration: 45, intensity: 4 },
    { offset:  9, type: 'Endurance', duration: 65, intensity: 7 },
    { offset: 11, type: 'Speed',     duration: 55, intensity: 8 },
    { offset: 13, type: 'Skill',     duration: 70, intensity: 7 },
    { offset: 14, type: 'Match',     duration: 80, intensity: 8 },
    { offset: 15, type: 'Recovery',  duration: 40, intensity: 4 },
    { offset: 16, type: 'Strength',  duration: 70, intensity: 8 },
    { offset: 18, type: 'Endurance', duration: 65, intensity: 7 },
    { offset: 20, type: 'Speed',     duration: 55, intensity: 7 },
    { offset: 21, type: 'Recovery',  duration: 40, intensity: 4 },
    { offset: 22, type: 'Strength',  duration: 65, intensity: 8 },
    { offset: 24, type: 'Endurance', duration: 70, intensity: 7 },
    { offset: 25, type: 'Speed',     duration: 55, intensity: 7 },
    { offset: 27, type: 'Skill',     duration: 75, intensity: 7 },
  ];
  curated.forEach((c) => {
    const date = new Date(today);
    date.setDate(date.getDate() - c.offset);
    logs.push({
      athleteId: 'ATH0001',
      date,
      type: c.type,
      duration: c.duration,
      intensity: c.intensity,
      load: c.duration * c.intensity,
    });
  });

  return logs;
}

// ── Build injuries ──────────────────────────────────────────────────────────
function buildInjuries(athletes) {
  const injuries = [];
  for (let i = 0; i < 220; i++) {
    const ath = athletes[Math.floor(rnd() * athletes.length)];
    const dt = new Date('2025-01-01');
    dt.setDate(dt.getDate() + range(0, 480));
    injuries.push({
      athleteId: ath.athleteId,
      athleteName: ath.name,
      sport: ath.sport,
      gender: ath.gender,
      program: ath.program,
      athleteAge: ath.age,
      bodyPart: pick(BODY_PARTS),
      side: pick(SIDES),
      injuryType: pick(INJURY_TYPES),
      severity: pick(SEVERITY),
      mechanism: pick(MECHANISMS),
      date: dt,
      recoveryStatus: pick(RECOVERY),
      source: rnd() < 0.7 ? 'Medical Log' : 'Athlete Self-Report',
      loggedBy: 'Medical Demo 01',
    });
  }

  injuries.push(
    { athleteId: 'ATH0001', athleteName: 'John Doe', sport: 'Badminton', gender: 'Male', program: 'PODIUM', athleteAge: 19,
      bodyPart: 'Ankle', side: 'Right', injuryType: 'Sprain', severity: 'Moderate', mechanism: 'Non-contact',
      date: new Date('2025-11-12'), recoveryStatus: 'Recovered', source: 'Medical Log',
      loggedBy: 'Medical Demo 01', notes: 'Lateral ankle sprain during match. Returned to play after 3 weeks.' },
    { athleteId: 'ATH0001', athleteName: 'John Doe', sport: 'Badminton', gender: 'Male', program: 'PODIUM', athleteAge: 19,
      bodyPart: 'Knee', side: 'Right', injuryType: 'Tendinitis', severity: 'Minor', mechanism: 'Overuse',
      date: new Date('2026-02-04'), recoveryStatus: 'Recovering', source: 'Medical Log',
      loggedBy: 'Medical Demo 01', notes: 'Patellar tendinitis. Modified training plan in place.' },
    { athleteId: 'ATH0001', athleteName: 'John Doe', sport: 'Badminton', gender: 'Male', program: 'PODIUM', athleteAge: 19,
      bodyPart: 'Shoulder', side: 'Right', injuryType: 'Strain', severity: 'Minor', mechanism: 'Overuse',
      date: new Date('2026-04-22'), recoveryStatus: 'Recovering', source: 'Athlete Self-Report',
      loggedBy: 'Medical Demo 01', notes: 'Rotator cuff irritation. Smash technique under review.' }
  );
  return injuries;
}

// ── Build self-reports ──────────────────────────────────────────────────────
function buildSelfReports() {
  return [
    { athleteId: 'ATH0007', athleteName: 'Aiman Hassan', sport: 'Football',
      bodyPart: 'Ankle', side: 'Left', injuryType: 'Sprain', severity: 'Moderate',
      description: 'Twisted ankle when stepping off curb after evening jog. Swelling and pain when bearing weight.',
      status: 'Pending' },
    { athleteId: 'ATH0014', athleteName: 'Nurul Rahman', sport: 'Athletics',
      bodyPart: 'Knee', side: 'Right', injuryType: 'Strain', severity: 'Minor',
      description: 'Mild knee discomfort during stair climbing. No swelling. Started yesterday.',
      status: 'Pending' },
    { athleteId: 'ATH0021', athleteName: 'Faris Ibrahim', sport: 'Swimming',
      bodyPart: 'Shoulder', side: 'Right', injuryType: 'Tendinitis', severity: 'Minor',
      description: 'Shoulder tightness on freestyle pull. Self-treating with ice.',
      status: 'Pending' },
    { athleteId: 'ATH0009', athleteName: 'Lina Yusoff', sport: 'Squash',
      bodyPart: 'Wrist', side: 'Left', injuryType: 'Strain', severity: 'Minor',
      description: 'Slight wrist pain. Suspect from gym session over weekend.',
      status: 'Approved', reviewNote: 'Approved — added to official record.',
      reviewedBy: 'Medical Demo 01', reviewedAt: new Date('2026-05-06') },
    { athleteId: 'ATH0030', athleteName: 'Adam Latif', sport: 'Karate',
      bodyPart: 'Hip', side: 'Right', injuryType: 'Strain', severity: 'Moderate',
      description: 'Pulled hip flexor at home doing yoga. Painful walking.',
      status: 'Rejected', reviewNote: 'Insufficient detail to confirm — please book consult.',
      reviewedBy: 'Medical Demo 01', reviewedAt: new Date('2026-05-05') },
  ];
}

function buildUsers() {
  // Plain-text passwords here — the User model's beforeSave hook hashes
  // them when bulkCreate runs with individualHooks: true.
  return [
    { name: 'Admin User', email: 'admin@isn.gov.my', password: 'admin123', role: 'admin' },
    { name: 'Admin Demo', email: 'poseidonapollo11@gmail.com', password: 'admin123', role: 'admin' },
    { name: 'Medical Demo 01', email: 'medical@isn.gov.my', password: 'medical123', role: 'medical' },
    { name: 'John Doe', email: 'athlete@isn.gov.my', password: 'athlete123', role: 'athlete', athleteId: 'ATH0001' },
    // Ground-truth athlete login — Dr Thung's own HoloMotion report seeded
    // 1:1 as ATH0061, so the athlete view can be checked against the PDF.
    { name: 'Thung Jin Seng', email: 'thung@isn.gov.my', password: 'thung123', role: 'athlete', athleteId: 'ATH0061' },
    // Experimental coach role — sees only athletes in their assigned sports.
    // Badminton includes ATH0001 (John Doe) + ATH0061 (Thung) for overlap.
    { name: 'Coach Demo 01', email: 'coach@isn.gov.my', password: 'coach123', role: 'coach', coachSports: ['Badminton', 'Swimming'] },
  ];
}

// ── Main ────────────────────────────────────────────────────────────────────
async function seed() {
  await sequelize.authenticate();
  console.log(`Connected to MySQL: ${sequelize.config.host}:${sequelize.config.port}/${sequelize.config.database}`);

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

    const activities = buildActivities();
    await Activity.bulkCreate(activities, { transaction: t, individualHooks: false });
    console.log(`Inserted ${activities.length} activity logs`);

    const injuries = buildInjuries(athletes);
    await Injury.bulkCreate(injuries, { transaction: t });
    console.log(`Inserted ${injuries.length} injury records`);

    const selfReports = buildSelfReports();
    await SelfReport.bulkCreate(selfReports, { transaction: t });
    console.log(`Inserted ${selfReports.length} self-reports`);

    const screenings = buildScreenings(athletes);
    await Screening.bulkCreate(screenings, { transaction: t });
    console.log(`Inserted ${screenings.length} screening snapshots`);

    const users = buildUsers();
    await User.bulkCreate(users, { transaction: t, individualHooks: true });
    console.log(`Inserted ${users.length} demo users`);
  });

  console.log('\nDemo credentials:');
  console.log('  Admin:   admin@isn.gov.my              / admin123');
  console.log('  Admin:   poseidonapollo11@gmail.com    / admin123');
  console.log('  Medical: medical@isn.gov.my            / medical123');
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
