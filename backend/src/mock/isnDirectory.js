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
