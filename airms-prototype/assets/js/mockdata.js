/* AIRMS — mock dataset
   Schema mirrors the Excel sample provided by ISN, plus the Athlete Assessment Report:
   - 8 injury risk indicators (Neck, Shoulder, Scoliosis, Spinal disc, Lumbar-pelvis,
     Joint pain, Knee, Ankle)
   - Per-muscle Myodynamia Deficiency flags (L/R/B)
   - Per-muscle Muscle Tension flags (L/R/B)
   - Programs: PELAPIS (developing 13–21), PODIUM (senior podium-track), OTHERS
*/
(function () {
  const SPORTS = [
    'Badminton','Swimming','Athletics','Cycling','Diving','Squash','Archery','Bowling',
    'Karate','Taekwondo','Wushu','Silat','Gymnastics','Weightlifting','Sailing',
    'Shooting','Rugby','Football','Hockey','Netball','Sepak Takraw','Bowls','Pencak Silat'
  ];
  const PROGRAMS = ['PELAPIS', 'PODIUM', 'OTHERS'];
  const GENDERS = ['Male','Female'];

  const BODY_PARTS = ['Neck','Shoulder','Spine','Lumbar/Pelvis','Knee','Ankle','Wrist','Elbow','Hip','Foot'];
  const SIDES = ['Left','Right','Both','N/A'];
  const INJURY_TYPES = ['Strain','Sprain','Tendinitis','Bursitis','Fracture','Contusion','Dislocation','Overuse'];
  const SEVERITY = ['Minor','Moderate','Severe'];
  const RECOVERY = ['Recovering','Recovered','Chronic'];
  const MECHANISMS = ['Contact','Non-contact','Overuse','Recurrent'];

  // Injury risk indicators (Section 4 of the assessment guide)
  const RISK_INDICATORS = [
    'Neck injury risk','Shoulder injury risk','Scoliosis','Spinal disc herniation',
    'Lumbar-pelvis injury','Joint pain','Knee injury risk','Ankle injury risk'
  ];

  // Muscles assessed for Myodynamia Deficiency (Section 5)
  const MUSCLES_DEFICIENCY = [
    'Biceps Brachii','Pectoralis Major','Lateral Deltoid','Posterior Deltoid',
    'Rectus Abdominis','External Oblique','Internal Oblique','Latissimus Dorsi',
    'Gluteus Maximus','Gluteus Medius','Piriformis','Sartorius','Vastus Lateralis',
    'Upper Trapezius','Rectus Femoris','Gluteus Minimus'
  ];
  // Muscles assessed for Muscle Tension (Section 6)
  const MUSCLES_TENSION = [
    'Sternocleidomastoid','Vastus Medialis','Rectus Capitis Anterior','Upper Trapezius',
    'Middle Deltoid','Biceps Brachii','Pectoralis Major','External Oblique',
    'Internal Oblique','Iliopsoas','Gluteus Maximus','Sartorius','Biceps Femoris'
  ];

  // Deterministic PRNG so charts stay stable
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
    muscles.forEach(m => { const f = maybeFlag(p); if (f) out[m] = f; });
    return out;
  }

  // Build an athlete's program based on age (PELAPIS 13-21, otherwise mostly PODIUM)
  function pickProgram(age) {
    if (age >= 13 && age <= 21 && rnd() < 0.7) return 'PELAPIS';
    if (rnd() < 0.85) return 'PODIUM';
    return 'OTHERS';
  }

  // ===== Athletes =====
  const FIRST_NAMES = ['Aiman','Hafiz','Nurul','Siti','Faris','Zikri','Aisha','Lina','Adam','Hadi','Yusof','Imran','Aina','Sarah','Ariff','Iqbal','Maya','Daniel','Hannah','Zara'];
  const LAST_NAMES = ['Hassan','Ibrahim','Rahman','Yusoff','Zainal','Othman','Bakar','Saleh','Ismail','Latif','Tan','Lee','Wong','Lim','Chong','Kumar','Raj','Devi','Ahmad','Karim'];

  const ATHLETES = [];
  for (let i = 1; i <= 60; i++) {
    const gender = pick(GENDERS);
    const age = range(15, 32);
    const sport = pick(SPORTS);
    const fn = pick(FIRST_NAMES);
    const ln = pick(LAST_NAMES);
    ATHLETES.push({
      id: 'ATH' + String(i).padStart(4, '0'),
      name: `${fn} ${ln}`,
      age,
      gender,
      sex: gender === 'Male' ? 'M' : 'F',
      weight: rfloat(50, 90),
      height: range(155, 195),
      sport,
      program: pickProgram(age),
      // Excel scores
      overallActivityScore: rfloat(65, 95, 2),
      injuryRiskIndex: rfloat(8, 35, 2),
      mobility: rfloat(60, 90, 2),
      stability: rfloat(60, 90, 2),
      symmetry: rfloat(60, 95, 2),
      exerciseRiskScore: rfloat(3, 12, 2),
      risks: RISK_INDICATORS.reduce((acc, k) => { acc[k] = rfloat(5, 30, 1); return acc; }, {}),
      myodynamia: buildFlags(MUSCLES_DEFICIENCY, 0.18),
      tension: buildFlags(MUSCLES_TENSION, 0.18)
    });
  }

  // Anchor athlete (matches Excel sample) — John Doe
  ATHLETES[0] = {
    id: 'ATH0001',
    name: 'John Doe',
    age: 19,
    gender: 'Male', sex: 'M',
    weight: 69.4, height: 173,
    sport: 'Badminton', program: 'PODIUM',
    overallActivityScore: 80.28,
    injuryRiskIndex: 10.4,
    mobility: 79.94, stability: 77.62, symmetry: 82.49,
    exerciseRiskScore: 5.49,
    risks: {
      'Neck injury risk': 7.27,
      'Shoulder injury risk': 8.03,
      'Scoliosis': 14.51,
      'Spinal disc herniation': 14.51,
      'Lumbar-pelvis injury': 5.62,
      'Joint pain': 0,
      'Knee injury risk': 20.24,
      'Ankle injury risk': 22.44
    },
    // Curated flags drawn from the Excel row + the README example
    myodynamia: {
      'External Oblique': 'L',
      'Latissimus Dorsi': 'B',
      'Vastus Lateralis': 'R',
      'Gluteus Medius': 'L'
    },
    tension: {
      'Biceps Brachii': 'B',
      'Gluteus Maximus': 'R',
      'External Oblique': 'B',
      'Upper Trapezius': 'L',
      'Iliopsoas': 'R'
    }
  };

  // ===== Activity logs (for John Doe) — 8 weeks ===
  function buildActivityLogs() {
    const types = ['Strength','Endurance','Speed','Skill','Match','Recovery'];
    const intensityMap = { 'Recovery': [3,5], 'Skill': [4,6], 'Speed': [6,8], 'Strength': [6,9], 'Endurance': [5,8], 'Match': [7,10] };
    const logs = [];
    const today = new Date('2026-05-09');
    for (let day = 56; day >= 0; day--) {
      if (rnd() < 0.3) continue;
      const date = new Date(today);
      date.setDate(date.getDate() - day);
      const type = pick(types);
      const dur = range(40, 110);
      const intensity = range(intensityMap[type][0], intensityMap[type][1]);
      logs.push({
        id: 'ACT' + (1000 + logs.length),
        date: date.toISOString().slice(0,10),
        type, duration: dur, intensity, load: dur * intensity, notes: ''
      });
    }
    return logs.reverse();
  }
  const ACTIVITY = buildActivityLogs();

  // ===== Injuries =====
  function buildInjuries() {
    const out = [];
    for (let i = 0; i < 220; i++) {
      const ath = pick(ATHLETES);
      const dt = new Date('2025-01-01');
      dt.setDate(dt.getDate() + range(0, 480));
      out.push({
        id: 'INJ' + String(i + 1).padStart(4, '0'),
        athleteId: ath.id,
        athleteName: ath.name,
        sport: ath.sport,
        gender: ath.gender,
        program: ath.program,
        bodyPart: pick(BODY_PARTS),
        side: pick(SIDES),
        injuryType: pick(INJURY_TYPES),
        severity: pick(SEVERITY),
        mechanism: pick(MECHANISMS),
        date: dt.toISOString().slice(0,10),
        recoveryStatus: pick(RECOVERY),
        source: rnd() < 0.7 ? 'Medical Log' : 'Athlete Self-Report',
        loggedBy: 'Dr. Aisyah Rahman',
        notes: ''
      });
    }
    return out;
  }
  const INJURIES = buildInjuries();

  INJURIES.push(
    { id: 'INJ9001', athleteId: 'ATH0001', athleteName: 'John Doe', sport: 'Badminton',
      gender: 'Male', program: 'PODIUM',
      bodyPart: 'Ankle', side: 'Right', injuryType: 'Sprain', severity: 'Moderate',
      mechanism: 'Non-contact', date: '2025-11-12', recoveryStatus: 'Recovered',
      source: 'Medical Log', loggedBy: 'Dr. Aisyah Rahman',
      notes: 'Lateral ankle sprain during match. Returned to play after 3 weeks.' },
    { id: 'INJ9002', athleteId: 'ATH0001', athleteName: 'John Doe', sport: 'Badminton',
      gender: 'Male', program: 'PODIUM',
      bodyPart: 'Knee', side: 'Right', injuryType: 'Tendinitis', severity: 'Minor',
      mechanism: 'Overuse', date: '2026-02-04', recoveryStatus: 'Recovering',
      source: 'Medical Log', loggedBy: 'Dr. Aisyah Rahman',
      notes: 'Patellar tendinitis. Modified training plan in place.' },
    { id: 'INJ9003', athleteId: 'ATH0001', athleteName: 'John Doe', sport: 'Badminton',
      gender: 'Male', program: 'PODIUM',
      bodyPart: 'Shoulder', side: 'Right', injuryType: 'Strain', severity: 'Minor',
      mechanism: 'Overuse', date: '2026-04-22', recoveryStatus: 'Recovering',
      source: 'Athlete Self-Report', loggedBy: 'Dr. Aisyah Rahman',
      notes: 'Rotator cuff irritation. Smash technique under review.' }
  );

  // ===== Self-report submissions queue =====
  const SELF_REPORTS = [
    { id: 'SR2001', athleteId: 'ATH0007', athleteName: 'Aiman Hassan', sport: 'Football',
      bodyPart: 'Ankle', side: 'Left', injuryType: 'Sprain', severity: 'Moderate',
      submittedAt: '2026-05-07 14:22',
      description: 'Twisted ankle when stepping off curb after evening jog. Swelling and pain when bearing weight.',
      status: 'Pending' },
    { id: 'SR2002', athleteId: 'ATH0014', athleteName: 'Nurul Rahman', sport: 'Athletics',
      bodyPart: 'Knee', side: 'Right', injuryType: 'Strain', severity: 'Minor',
      submittedAt: '2026-05-08 09:45',
      description: 'Mild knee discomfort during stair climbing. No swelling. Started yesterday.',
      status: 'Pending' },
    { id: 'SR2003', athleteId: 'ATH0021', athleteName: 'Faris Ibrahim', sport: 'Swimming',
      bodyPart: 'Shoulder', side: 'Right', injuryType: 'Tendinitis', severity: 'Minor',
      submittedAt: '2026-05-08 16:10',
      description: 'Shoulder tightness on freestyle pull. Self-treating with ice. Not from training session.',
      status: 'Pending' },
    { id: 'SR2004', athleteId: 'ATH0009', athleteName: 'Lina Yusoff', sport: 'Squash',
      bodyPart: 'Wrist', side: 'Left', injuryType: 'Strain', severity: 'Minor',
      submittedAt: '2026-05-05 11:00',
      description: 'Slight wrist pain. Suspect from gym session over weekend.',
      status: 'Approved', reviewNote: 'Approved — added to official record.', reviewedBy: 'Dr. Aisyah Rahman' },
    { id: 'SR2005', athleteId: 'ATH0030', athleteName: 'Adam Latif', sport: 'Karate',
      bodyPart: 'Hip', side: 'Right', injuryType: 'Strain', severity: 'Moderate',
      submittedAt: '2026-05-04 19:30',
      description: 'Pulled hip flexor at home doing yoga. Painful walking.',
      status: 'Rejected', reviewNote: 'Insufficient detail to confirm — please book consult.', reviewedBy: 'Dr. Aisyah Rahman' }
  ];

  // ===== Import history =====
  const IMPORT_LOG = [
    { id: 'IMP-2026-04-30', file: 'screening_apr_2026.xlsx', records: 47, errors: 0,
      uploadedBy: 'Dr. Aisyah Rahman', uploadedAt: '2026-04-30 10:14' },
    { id: 'IMP-2026-04-15', file: 'national_quarterly_q1.xlsx', records: 128, errors: 2,
      uploadedBy: 'En. Mohd Faizal', uploadedAt: '2026-04-15 09:02' },
    { id: 'IMP-2026-03-28', file: 'force_plate_mar_batch.xlsx', records: 35, errors: 0,
      uploadedBy: 'Dr. Aisyah Rahman', uploadedAt: '2026-03-28 16:48' },
    { id: 'IMP-2026-02-19', file: 'screening_feb_2026.xlsx', records: 52, errors: 1,
      uploadedBy: 'Dr. Aisyah Rahman', uploadedAt: '2026-02-19 14:30' }
  ];

  window.AIRMS_DATA = {
    SPORTS, PROGRAMS, GENDERS,
    BODY_PARTS, SIDES, INJURY_TYPES, SEVERITY, RECOVERY, MECHANISMS,
    RISK_INDICATORS, MUSCLES_DEFICIENCY, MUSCLES_TENSION,
    ATHLETES, ACTIVITY, INJURIES, SELF_REPORTS, IMPORT_LOG,
    findAthlete: id => ATHLETES.find(a => a.id === id),
    injuriesFor: id => INJURIES.filter(i => i.athleteId === id),
    activityFor: id => id === 'ATH0001' ? ACTIVITY : []
  };
})();
