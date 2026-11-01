#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// BUILD A STAND-IN ISN DIRECTORY FROM A SCREENING SPREADSHEET (2026-10-27)
//
//   node scripts/build-isn-directory.js "<path to TASK DR GINA (cleaned).xlsx>"
//        [--out scripts/samples/isn-directory.json]
//
// Then point the API at it:  AIRMS_ISN_DIRECTORY=scripts/samples/isn-directory.json
//
// WHY: a HoloMotion report enters AIRMS tied to a person in ISN's directory
// (src/mock/isnDirectory.js), and ISN's real directory is not available yet.
// Dr Gina's spreadsheet is ISN's own record of who was screened, in which sport
// and programme — enough to fill the sport/programme fields at upload, which is
// all the directory is for at this stage.
//
// WHAT IT DOES NOT HAVE, AND HOW THAT IS HANDLED:
//
//   IC number   The sheet carries none, and the loader requires a unique 12-digit
//               one. Each is SYNTHETIC and IMPOSSIBLE: "0000" + 8 digits hashed
//               from the name. YYMM = 0000 is month 00, which no real IC has, so
//               a placeholder can never be mistaken for, or collide with, a real
//               one — and it is stable across re-runs, so regenerating does not
//               re-key an athlete. An athlete created from this directory keeps
//               that IC as their roster key until ISN's real directory arrives
//               and they are re-keyed; `^0000` finds every one of them.
//   Birth date  Unknown, so null (§54: an unknown value stays unknown). The
//               upload takes age from the REPORT regardless.
//
// ONE RECORD PER PERSON. The sheet is one row per SCREENING — 1,370 rows for
// 1,185 names, repeats a year apart. Sport, programme and gender come from the
// LATEST row (highest age; on a tie, the later row), because a programme moves
// (PELAPIS -> PODIUM). Every name whose rows disagree is listed in the review
// file written beside the output, so the operator can check those at upload.
//
// SPORT NAMES are normalised through an explicit table, and an unmapped spelling
// FAILS rather than passing through: a stray "Taekwondo " would otherwise become
// a second Taekwondo cohort with nothing saying so. Only spellings of the SAME
// sport are merged. Artistic vs Rhythmic Gymnastics and Hockey vs Indoor Hockey
// vs Ice Hockey stay apart, because cohort norms are keyed on sport. The sheet's
// numeric sport-code column is ignored — code 2 covers gymnastics, golf AND
// artistic swimming.
//
// THE OUTPUT HOLDS REAL ATHLETES' NAMES, many of them minors. It belongs in
// scripts/samples/ beside the NDA'd reports: gitignored, and excluded from the
// ISN sync. Do not commit it.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const XLSX = require('xlsx');

const SPORTS = {
  'archery': 'Archery',
  'artistic gymnastic': 'Artistic Gymnastics',
  'artistic gymnastics': 'Artistic Gymnastics',
  'artistic swimming': 'Artistic Swimming',
  'athletics': 'Athletics',
  'badminton': 'Badminton',
  'baseball': 'Baseball',
  'beach volleyball': 'Beach Volleyball',
  'boxing': 'Boxing',
  'canoe': 'Canoeing',
  'chess': 'Chess',
  'cricket': 'Cricket',
  'cycling': 'Cycling',
  'diving': 'Diving',
  'dragon boat': 'Dragon Boat',
  'equestrian': 'Equestrian',
  'esports': 'E-sports',
  'fencing': 'Fencing',
  'floorball': 'Floorball',
  'futsal': 'Futsal',
  'golf': 'Golf',
  'handball': 'Handball',
  'hockey': 'Hockey',
  'ice hockey': 'Ice Hockey',
  'indoor hockey': 'Indoor Hockey',
  'jetski': 'Jet Ski',
  'judo': 'Judo',
  'jujitsu': 'Ju-Jitsu',
  'kabaddi': 'Kabaddi',
  'karate': 'Karate',
  'kayak': 'Kayaking',
  'kickboxing': 'Kickboxing',
  'lawnbowls': 'Lawn Bowls',
  'modern pentathlon': 'Modern Pentathlon',
  'muaythai': 'Muay Thai',
  'netball': 'Netball',
  'ping pong': 'Table Tennis',
  'table tennis': 'Table Tennis',
  'rhythmic gymnastic': 'Rhythmic Gymnastics',
  'rhythmic gymnastics': 'Rhythmic Gymnastics',
  'rowing': 'Rowing',
  'rugby': 'Rugby',
  'sailing': 'Sailing',
  'sepak takraw': 'Sepak Takraw',
  'sepaktakraw': 'Sepak Takraw',
  'shooting': 'Shooting',
  'silat': 'Silat',
  'skateboard': 'Skateboarding',
  'snooker': 'Snooker',
  'softball': 'Softball',
  'sport climbing': 'Sport Climbing',
  'squash': 'Squash',
  'swimming': 'Swimming',
  'taekwondo': 'Taekwondo',
  'tennis': 'Tennis',
  'tenpin bowling': 'Tenpin Bowling',
  'teqball': 'Teqball',
  'triathlon': 'Triathlon',
  'volleyball': 'Volleyball',
  'waterpolo': 'Water Polo',
  'weightlifting': 'Weightlifting',
  'wushu': 'Wushu',
};

const squash = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

function programmeOf(raw) {
  const p = squash(raw).toUpperCase();
  if (!p) return null;
  if (p === 'PODIUM' || p === 'PELAPIS') return p;
  if (p.startsWith('OTHERS')) return 'OTHERS';   // "OTHERS (Please specify in next question)"
  throw new Error(`unrecognised programme "${raw}"`);
}

function genderOf(raw) {
  const g = squash(raw).toLowerCase();
  if (!g) return null;
  if (g === 'male' || g === 'female') return g[0].toUpperCase() + g.slice(1);
  throw new Error(`unrecognised gender "${raw}"`);
}

function sportOf(raw) {
  const s = squash(raw).toLowerCase();
  if (!s) return null;
  if (!SPORTS[s]) throw new Error(`unmapped sport "${raw}" — add it to SPORTS`);
  return SPORTS[s];
}

function placeholderIc(key, taken) {
  const h = crypto.createHash('sha256').update(key).digest();
  let n = h.readUInt32BE(0) % 1e8;
  // Probe forward on a clash. Records are processed in sorted-key order, so the
  // result is still deterministic.
  while (taken.has(n)) n = (n + 1) % 1e8;
  taken.add(n);
  return '0000' + String(n).padStart(8, '0');
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = path.resolve(outIdx >= 0 ? args[outIdx + 1] : path.join(__dirname, 'samples', 'isn-directory.json'));
  const input = args.find((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
  if (!input) {
    console.error('usage: node scripts/build-isn-directory.js <spreadsheet.xlsx> [--out <file.json>]');
    process.exit(2);
  }

  const wb = XLSX.readFile(input);
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const header = grid[0].map(squash);
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`no "${name}" column in the first header row`);
    return i;
  };
  const C = { name: col('Name'), age: col('Age'), gender: col('Gender'), sport: col('Sport'), program: col('Program') };

  // The header spans several rows (the muscle columns wrap); data begins at the
  // first row with a name AND a numeric age.
  const rows = [];
  grid.forEach((r, i) => {
    const name = squash(r[C.name]);
    if (!name || typeof r[C.age] !== 'number') return;
    rows.push({
      line: i + 1, name, age: r[C.age],
      gender: genderOf(r[C.gender]), sport: sportOf(r[C.sport]), programme: programmeOf(r[C.program]),
    });
  });

  const people = new Map();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    if (!people.has(key)) people.set(key, []);
    people.get(key).push(r);
  }

  const taken = new Set();
  const records = [];
  const review = [];
  for (const key of [...people.keys()].sort()) {
    const seen = people.get(key);
    const latest = seen.reduce((a, b) => (b.age >= a.age ? b : a));
    const differs = (f) => new Set(seen.map((r) => r[f])).size > 1;
    const conflicts = ['sport', 'programme', 'gender'].filter(differs);
    const missing = ['sport', 'programme', 'gender'].filter((f) => !latest[f]);
    if (conflicts.length || missing.length) {
      review.push({
        name: latest.name, conflicts, missing,
        rows: seen.map((r) => `row ${r.line}: age ${r.age}, ${r.gender ?? '?'}, ${r.sport ?? '?'}, ${r.programme ?? '?'}`),
      });
    }
    records.push({
      icNumber: placeholderIc(key, taken),
      name: latest.name,
      dateOfBirth: null,
      gender: latest.gender,
      sport: latest.sport,
      programme: latest.programme,
      disciplines: [],
      nationality: null,
      stateOfBirth: null,
      contactEmail: null,
      contactPhone: null,
      dateRegistered: null,
      status: 'active',
      // Ignored by the loader's toAirmsRecord(); here so the file says where it came from.
      provenance: `${path.basename(input)}, ${seen.length} screening row(s), latest at age ${latest.age}`,
    });
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(records, null, 2) + '\n');
  const reviewFile = out.replace(/\.json$/i, '') + '.review.txt';
  fs.writeFileSync(reviewFile, [
    `Names to check at upload — ${review.length} of ${records.length}.`,
    'The directory carries each person\'s LATEST row. "conflicts" = their rows disagree; "missing" = the latest row left it blank.',
    '',
    ...review.flatMap((r) => [
      `${r.name}${r.conflicts.length ? `  [conflicts: ${r.conflicts.join(', ')}]` : ''}${r.missing.length ? `  [missing: ${r.missing.join(', ')}]` : ''}`,
      ...r.rows.map((l) => `    ${l}`),
    ]),
  ].join('\n') + '\n');

  const tally = (f) => records.reduce((m, r) => ((m[r[f] ?? '(blank)'] = (m[r[f] ?? '(blank)'] || 0) + 1), m), {});
  console.log(`read      ${rows.length} screening rows`);
  console.log(`wrote     ${records.length} people -> ${out}`);
  console.log(`review    ${review.length} to check -> ${reviewFile}`);
  console.log('programme', tally('programme'));
  console.log('gender   ', tally('gender'));
  console.log(`sports    ${Object.keys(tally('sport')).length}`);
}

try {
  main();
} catch (e) {
  console.error(`build-isn-directory: ${e.message}`);
  process.exit(1);
}
