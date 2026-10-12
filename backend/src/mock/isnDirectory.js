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
// WHICH DIRECTORY IS SERVED IS A DEPLOYMENT DECISION, AND IT FAILS CLOSED
// (2026-10-12, DESIGN_DECISIONS §162).
//
// The records below are FABRICATED. Six are invented people; three are the real
// athletes whose reports were handed to Dr Thung for the demo, carrying dates of
// birth tuned so the age DERIVED at the screening date matches the printed
// report. Neither set belongs in a database of real athletes.
//
// Until now they were served unconditionally. Measured on a running instance:
// `GET /api/isn/athletes?q=a` returned all nine to a signed-in clinician, and
// the roster-entry form fills Name / IC / date of birth / sport / programme
// straight from the hit. So on an ISN install the quickest path to creating an
// athlete was to accept an INVENTED PERSON WITH AN INVENTED IC, with nothing on
// screen saying the directory was a fixture. A fabricated patient that looks
// exactly like a real one is this project's defect class, pointed at the roster.
//
// AIRMS_ISN_DIRECTORY picks the source:
//
//   unset, NODE_ENV !== 'production'   the demo records (development, tests)
//   unset, NODE_ENV === 'production'   EMPTY — the fail-closed default
//   'demo'                             the demo records, chosen deliberately;
//                                      what the stakeholder demo sets, since
//                                      that runs with NODE_ENV=production
//   'none'                             empty, chosen deliberately
//   <path to a .json file>             ISN's own export: an array of records in
//                                      the shape below
//
// Empty is SAFE, not broken: the lookup returns nothing and the operator types
// the athlete's details, which is what they would do for anyone not in the
// directory anyway. Serving a fixture is the unsafe state, so that is the one
// that has to be asked for.
//
// A malformed export THROWS at require time rather than being filtered. Half a
// directory silently loaded is a roster where some athletes autocomplete and
// others do not, which reads as "ISN has not registered them yet".
//
// ADD DEMO RECORDS HERE — append to DEMO_DIRECTORY below. `icNumber` is the
// athlete key (12 digits) and must be unique. Real records belong in the JSON
// export named by AIRMS_ISN_DIRECTORY, never in this file.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');

const DEMO_DIRECTORY = [
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

// Validated on the way in, because this is the one place a real athlete's
// identity enters the system from outside the HoloMotion report.
function loadFromFile(file) {
  const abs = path.resolve(file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch (e) {
    throw new Error(`AIRMS_ISN_DIRECTORY: could not read ${abs} — ${e.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`AIRMS_ISN_DIRECTORY: ${abs} must hold a JSON ARRAY of athlete records`);
  }
  const seen = new Set();
  parsed.forEach((r, i) => {
    if (!r || typeof r !== 'object') throw new Error(`AIRMS_ISN_DIRECTORY: record ${i} is not an object`);
    if (!/^\d{12}$/.test(String(r.icNumber ?? ''))) {
      throw new Error(`AIRMS_ISN_DIRECTORY: record ${i} has no 12-digit icNumber`);
    }
    if (!String(r.name ?? '').trim()) {
      throw new Error(`AIRMS_ISN_DIRECTORY: record ${i} (${r.icNumber}) has no name`);
    }
    // A duplicate IC is worse than a missing record: searchIsn would return two
    // hits for one person and the importer's unique-match rule would decline,
    // so that athlete silently stops being findable.
    if (seen.has(r.icNumber)) throw new Error(`AIRMS_ISN_DIRECTORY: duplicate icNumber ${r.icNumber}`);
    seen.add(r.icNumber);
  });
  return parsed;
}

function resolveDirectory() {
  const setting = String(process.env.AIRMS_ISN_DIRECTORY ?? '').trim();
  if (setting === 'none') return { mode: 'none', source: 'disabled', records: [] };
  if (setting === 'demo') return { mode: 'demo', source: 'demo fixtures', records: DEMO_DIRECTORY };
  if (setting) return { mode: 'file', source: path.resolve(setting), records: loadFromFile(setting) };
  if (process.env.NODE_ENV === 'production') {
    // Fail closed. Nothing is logged at require time — server.js reports it at
    // boot, where an operator will actually see it.
    return { mode: 'none', source: 'fail-closed default (production, AIRMS_ISN_DIRECTORY unset)', records: [] };
  }
  return { mode: 'demo', source: 'demo fixtures (development default)', records: DEMO_DIRECTORY };
}

const resolved = resolveDirectory();
const ISN_DIRECTORY = resolved.records;

// What is actually being served, for the boot log, /api/health and
// `npm run verify:data`. A fixture directory on a real install has to be
// VISIBLE, not merely configurable.
function isnDirectoryStatus() {
  return {
    mode: resolved.mode,
    source: resolved.source,
    count: ISN_DIRECTORY.length,
    isFixture: resolved.mode === 'demo',
  };
}

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

module.exports = { searchIsn, getIsnByIC, ISN_DIRECTORY, DEMO_DIRECTORY, isnDirectoryStatus };
