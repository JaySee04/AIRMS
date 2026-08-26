// ─────────────────────────────────────────────────────────────────────────────
// MOCK ISN ATHLETE DIRECTORY (A3)
//
// A stand-in for Institut Sukan Negara's athlete master database. AIRMS does not
// own this data — in production this module is the INTEGRATION SEAM: the two
// lookup functions below would instead hit ISN's real database (a second
// connection) or an ISN API. The record SHAPE mirrors what ISN holds, so the
// rest of AIRMS (the route + UI) is written against this contract and doesn't
// change when the mock is swapped for the real source.
//
// Why it exists: when an operator imports a screening (or adds an athlete) for
// someone AIRMS has never seen, their name can't autocomplete from our roster —
// so we look them up in ISN and pull their Name / IC / age / sport / programme /
// etc. to create the athlete pre-filled.
//
// ADD RECORDS HERE — append athletes to ISN_DIRECTORY below (JC will supply
// names). `icNumber` is the athlete key (12 digits) and must be unique.
// ─────────────────────────────────────────────────────────────────────────────

const ISN_DIRECTORY = [
  {
    icNumber: '020714101234',
    name: 'Nurul Aina Binti Rahman',
    dateOfBirth: '2002-07-14',
    gender: 'Female',
    sport: 'Swimming',
    programme: 'PODIUM',
    disciplines: ['100m Freestyle', '200m Freestyle'],
    nationality: 'Malaysian',
    stateOfBirth: 'Selangor',
    contactEmail: 'nurul.aina@isn-athlete.example.my',
    contactPhone: '0123456781',
    dateRegistered: '2019-02-11',
    status: 'active',
  },
  {
    icNumber: '990312085678',
    name: 'Arif Danial Bin Yusof',
    dateOfBirth: '1999-03-12',
    gender: 'Male',
    sport: 'Athletics',
    programme: 'PODIUM',
    disciplines: ['400m', '4x400m Relay'],
    nationality: 'Malaysian',
    stateOfBirth: 'Perak',
    contactEmail: 'arif.danial@isn-athlete.example.my',
    contactPhone: '0123456782',
    dateRegistered: '2017-08-03',
    status: 'active',
  },
  {
    icNumber: '041128142233',
    name: 'Tan Wei Jie',
    dateOfBirth: '2004-11-28',
    gender: 'Male',
    sport: 'Badminton',
    programme: 'PELAPIS',
    disciplines: ["Men's Singles"],
    nationality: 'Malaysian',
    stateOfBirth: 'Penang',
    contactEmail: 'tan.weijie@isn-athlete.example.my',
    contactPhone: '0123456783',
    dateRegistered: '2022-01-19',
    status: 'active',
  },
  {
    icNumber: '010905065544',
    name: 'Kavitha A/P Suresh',
    dateOfBirth: '2001-09-05',
    gender: 'Female',
    sport: 'Hockey',
    programme: 'PODIUM',
    disciplines: ['Midfielder'],
    nationality: 'Malaysian',
    stateOfBirth: 'Kuala Lumpur',
    contactEmail: 'kavitha.suresh@isn-athlete.example.my',
    contactPhone: '0123456784',
    dateRegistered: '2018-06-27',
    status: 'active',
  },
  {
    icNumber: '060222103311',
    name: 'Muhammad Haikal Bin Aziz',
    dateOfBirth: '2006-02-22',
    gender: 'Male',
    sport: 'Football',
    programme: 'OTHERS',
    disciplines: ['Goalkeeper'],
    nationality: 'Malaysian',
    stateOfBirth: 'Johor',
    contactEmail: 'haikal.aziz@isn-athlete.example.my',
    contactPhone: '0123456785',
    dateRegistered: '2023-04-05',
    status: 'active',
  },
  // Walkthrough record for the "athlete AIRMS has never seen" path: he is in
  // ISN's directory and deliberately NOT in the seeded AIRMS roster, so a
  // lookup returns inRoster:false and the operator can create him pre-filled in
  // one step. Badminton/PELAPIS puts him in a cohort that already has peers, so
  // his first screening scores against a real norm rather than falling back.
  {
    icNumber: '080319101817',
    name: 'Mohamed Elffie Danish Bin Khir Johari',
    dateOfBirth: '2008-03-19',
    gender: 'Male',
    sport: 'Badminton',
    programme: 'PELAPIS',
    disciplines: ["Men's Singles"],
    nationality: 'Malaysian',
    stateOfBirth: 'Selangor',
    contactEmail: 'elffie.danish@isn-athlete.example.my',
    contactPhone: '0123456786',
    dateRegistered: '2025-01-13',
    status: 'active',
  },

  // ── The 2025-07-29 screening session ──────────────────────────────────────
  // Three athletes from one afternoon's squad run (15:42, 16:00 and 16:56),
  // whose HoloMotion reports JC holds and will hand to Dr Thung and Dr Hoo to
  // upload. They are in ISN's directory and deliberately NOT in the seeded AIRMS
  // roster, so each report resolves to `inRoster: false` — "new, from the ISN
  // directory ... added when you commit" — and the whole ingestion path runs end
  // to end: parse the name from the filename, look it up in ISN, create the
  // athlete pre-filled, score the first screening, alert the clinician.
  //
  // Two details are load-bearing:
  //
  //   `name` must match what parseNameFromFilename() recovers from the supplied
  //   filename, since matchInIsn accepts only a UNIQUE hit. The files are
  //   "rpt_2025-07-29_12. nurin syazwani binti rusli_<hash>.pdf" and so on; the
  //   parser strips the date, the batch number and the hash, and the comparison
  //   is case-insensitive, so the properly-cased master record below matches the
  //   report's lowercase and ALL-CAPS spellings alike.
  //
  //   `dateOfBirth` is set so the age it derives AT THE SCREENING DATE equals
  //   the age printed on that athlete's report (17, 16 and 18). Age is derived,
  //   not stored, so the directory shows them a year older today — which is what
  //   a master record holding a birth date should do. The upload takes the
  //   REPORT's age regardless (see fromReport in screeningUploadStore.ts); ISN's
  //   is only the fallback for a report that did not read cleanly.
  //
  // Badminton / PELAPIS / Female puts them beside the four seeded athletes of
  // that squad, aged 15-18. That group is one short of `min_cohort_n`, so their
  // first screening scores against the `sg` tier (Badminton / Female, n=7) — a
  // real same-sport, same-sex norm, and the fallback ladder doing its job rather
  // than a contrivance. It is also Coach Demo's squad, so the coach dashboard
  // picks them up once the reports are committed.
  {
    icNumber: '070322080314',
    name: 'Nur Aina Danish',
    dateOfBirth: '2007-03-22',   // 18 on 2025-07-29, as printed
    gender: 'Female',
    sport: 'Badminton',
    programme: 'PELAPIS',
    disciplines: ["Women's Singles"],
    nationality: 'Malaysian',
    stateOfBirth: 'Perak',
    contactEmail: 'nur.aina@isn-athlete.example.my',
    contactPhone: '0123456787',
    dateRegistered: '2024-03-18',
    status: 'active',
  },
  {
    icNumber: '080214100248',
    name: 'Nurin Syazwani Binti Rusli',
    dateOfBirth: '2008-02-14',   // 17 on 2025-07-29, as printed
    gender: 'Female',
    sport: 'Badminton',
    programme: 'PELAPIS',
    disciplines: ["Women's Doubles", 'Mixed Doubles'],
    nationality: 'Malaysian',
    stateOfBirth: 'Selangor',
    contactEmail: 'nurin.syazwani@isn-athlete.example.my',
    contactPhone: '0123456788',
    dateRegistered: '2024-07-02',
    status: 'active',
  },
  {
    icNumber: '090506010576',
    name: 'Nur Batrisyia Binti Yusof',
    dateOfBirth: '2009-05-06',   // 16 on 2025-07-29, as printed
    gender: 'Female',
    sport: 'Badminton',
    programme: 'PELAPIS',
    disciplines: ["Women's Singles"],
    nationality: 'Malaysian',
    stateOfBirth: 'Johor',
    contactEmail: 'nur.batrisyia@isn-athlete.example.my',
    contactPhone: '0123456789',
    dateRegistered: '2025-02-24',
    status: 'active',
  },
];

function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

// Shape ISN → the fields AIRMS consumes (adds a derived age). This is the
// contract the route/UI depend on; keep it stable across mock ↔ real ISN.
function toAirmsRecord(r) {
  return {
    icNumber: r.icNumber,
    name: r.name,
    dateOfBirth: r.dateOfBirth,
    age: ageFromDob(r.dateOfBirth),
    gender: r.gender,
    sport: r.sport,
    programme: r.programme,
    disciplines: Array.isArray(r.disciplines) ? r.disciplines : [],
    nationality: r.nationality,
    stateOfBirth: r.stateOfBirth,
    contactEmail: r.contactEmail,
    contactPhone: r.contactPhone,
    dateRegistered: r.dateRegistered,
    status: r.status,
  };
}

// Search the ISN directory by name or IC (case-insensitive substring). In
// production this is an ISN query/API call; the signature stays the same.
function searchIsn(query, { limit = 20 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  return ISN_DIRECTORY
    .filter((r) => r.name.toLowerCase().includes(q) || r.icNumber.includes(q))
    .slice(0, limit)
    .map(toAirmsRecord);
}

function getIsnByIC(ic) {
  const key = String(ic || '').trim();
  const hit = ISN_DIRECTORY.find((r) => r.icNumber === key);
  return hit ? toAirmsRecord(hit) : null;
}

module.exports = { searchIsn, getIsnByIC, ISN_DIRECTORY };
