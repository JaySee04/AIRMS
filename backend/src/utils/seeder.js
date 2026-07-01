/**
 * Seed script — populates MySQL with the AIRMS prototype mock data.
 *
 * Run once: npm run seed
 * Safe to re-run: drops + recreates the schema before inserting.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { sequelize, User, Athlete, MuscleFlag, Activity, Injury, SelfReport } = require('../models');

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
function buildAthletes() {
  const athletes = [];
  for (let i = 1; i <= 60; i++) {
    const gender = pick(GENDERS);
    const age = range(15, 32);
    const sport = pick(SPORTS);
    const defFlags = buildFlags(MUSCLES_DEFICIENCY, 0.18);
    const tensionFlags = buildFlags(MUSCLES_TENSION, 0.18);
    athletes.push({
      athleteId: 'ATH' + String(i).padStart(4, '0'),
      name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      age,
      gender,
      sex: gender === 'Male' ? 'M' : 'F',
      weight: rfloat(50, 90),
      height: range(155, 195),
      sport,
      program: pickProgram(age),
      overallActivityScore: rfloat(65, 95, 2),
      injuryRiskIndex: rfloat(8, 35, 2),
      mobility: rfloat(60, 90, 2),
      stability: rfloat(60, 90, 2),
      symmetry: rfloat(60, 95, 2),
      neckInjuryRisk: rfloat(5, 30, 1),
      shoulderInjuryRisk: rfloat(5, 30, 1),
      scoliosis: rfloat(5, 30, 1),
      spinalDiscHerniation: rfloat(5, 30, 1),
      lumbarPelvisInjury: rfloat(5, 30, 1),
      jointPain: rfloat(0, 20, 1),
      kneeInjuryRisk: rfloat(5, 30, 1),
      ankleInjuryRisk: rfloat(5, 30, 1),
      _myodynamia: objToArray(defFlags),
      _tension: objToArray(tensionFlags),
    });
  }

  // Anchor athlete — John Doe, matches ISN Excel sample exactly.
  // Note: "Exercise risk score" in the Excel is a column-GROUP header, not a
  // leaf value. The five injury-risk indicators that follow are its grouped
  // sub-columns. Earlier seeder revisions misread that header and offset all
  // values by one position; the layout below is the corrected attribution.
  athletes[0] = {
    athleteId: 'ATH0001',
    name: 'John Doe',
    age: 19,
    gender: 'Male', sex: 'M',
    weight: 69.4, height: 173,
    sport: 'Badminton', program: 'PODIUM',
    overallActivityScore: 80.28,
    injuryRiskIndex: 10.4,
    mobility: 79.94, stability: 77.62, symmetry: 82.49,
    // Five "Exercise risk score" sub-indicators from the Excel sample
    neckInjuryRisk: 5.49,
    shoulderInjuryRisk: 7.27,
    scoliosis: 8.03,
    spinalDiscHerniation: 14.51,
    lumbarPelvisInjury: 14.51,
    // Three additional risk indicators; values shifted from the prior offset
    jointPain: 5.62,
    kneeInjuryRisk: 0,
    ankleInjuryRisk: 20.24,
    // Below the 5-flag escalation threshold in `classifyCompositeRisk` so
    // John's demo lands at "Elevated" via injury escalation, not "High Risk".
    _myodynamia: [
      { muscle: 'Vastus Lateralis', side: 'R' },
      { muscle: 'Gluteus Medius', side: 'L' },
    ],
    _tension: [
      { muscle: 'Upper Trapezius', side: 'L' },
      { muscle: 'Iliopsoas', side: 'R' },
    ],
  };

  return athletes;
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

// ── Build activity logs (John Doe, 8 weeks) ─────────────────────────────────
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
    // Experimental coach role — sees only athletes in their assigned sports.
    // Badminton includes ATH0001 (John Doe) so the demo has overlapping data.
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

    const users = buildUsers();
    await User.bulkCreate(users, { transaction: t, individualHooks: true });
    console.log(`Inserted ${users.length} demo users`);
  });

  console.log('\nDemo credentials:');
  console.log('  Admin:   admin@isn.gov.my              / admin123');
  console.log('  Admin:   poseidonapollo11@gmail.com    / admin123');
  console.log('  Medical: medical@isn.gov.my            / medical123');
  console.log('  Athlete: athlete@isn.gov.my            / athlete123');
  console.log('  Coach:   coach@isn.gov.my              / coach123');

  await sequelize.close();
  console.log('\nSeeding complete.');
}

seed().catch(async (err) => {
  console.error(err);
  try { await sequelize.close(); } catch (_) {}
  process.exit(1);
});
