// What a "backup" of this system actually has to contain, and how each value
// survives the trip into a spreadsheet cell.
//
// WHY THIS FILE EXISTS (2026-10-09, JC, DESIGN_DECISIONS §149).
//
// The export shipped on 2026-07-01 — during the Excel retirement, when athletes
// plus muscle flags genuinely WAS the data model — and was never widened once
// `screenings` became the heart of the system. Measured against the live
// database on 2026-10-09 it wrote 2 of 9 tables: 62 athletes and 336 muscle
// flags, and nothing else. Absent were all 74 screenings (18 of them history
// rows with no representation anywhere else), the 49 cohort_thresholds and the
// norm version that are THE RULER every band was measured against, and 1,714
// audit rows. Worse than any single omission: the athlete row carries its
// latest screening's scores but NOT `assessedAt`, so every number in the file
// sat there with no date on it.
//
// None of that announced itself. The control was headed "Data Backup" and
// offered a snapshot "for records, review, or handover" — so the failure was
// the one this project keeps producing: a wrong answer that looks like a right
// one, discovered only by downloading the file and reading it back.
//
// THE TRAP WIDENING IT WALKS INTO. `XLSX.utils.json_to_sheet` stringifies with
// String(), so a JSON column lands in the cell as the literal text
// `[object Object]`. There are FOURTEEN such columns across the tables added
// here — `subitems` (the 25-cell table Total Score is the mean of),
// `prescription`, `factors`, `cohortDeltas`, `stats`, `snapshot`, `meta` and
// more. That is why the old two-sheet export looked healthy: Athletes and
// MuscleFlags are the only two tables in the schema with no JSON column, so the
// defect had nothing to land on. Widening without `cellValue` below would have
// produced a bigger file, full of `[object Object]`, that still opens cleanly.
const { Op } = require('sequelize');

// Audit rows are unbounded over an institution's lifetime, and a backup that
// exhausts memory is worse than one that says what it left out. The cap is
// generous for ISN (1,714 rows after a year of development) and the manifest
// NAMES the omission when it bites — rule 2: a partial result must never read
// as a complete one.
const AUDIT_CAP = 50000;

// Excel's own hard limit on one cell. Exceeding it does not truncate — `xlsx`
// THROWS ("Text length must not exceed 32767 characters") at write time, after
// every sheet has been built, so the whole backup 500s.
//
// MEASURED, and the reason this constant exists rather than a comment: on the
// live database exactly ONE cell is over it — `NormVersions.snapshot` at 35,076
// characters, the pinned 49-cohort norm set serialised into a single cell. So
// widening the export would have shipped a button that answers 500 every time,
// found only by pressing it. Unit tests could not have: the limit belongs to
// the file format, and the fixture rows are small.
const EXCEL_CELL_LIMIT = 32767;

// Appended to any value the format cannot hold. Deliberately LOUD and
// deliberately invalid JSON: a restore that tries to parse it must fail rather
// than quietly load a half-object, and a reader must be able to see which cell
// it happened to. The manifest counts these.
const TRUNCATION_MARK = '…[TRUNCATED BY EXCEL CELL LIMIT';

// Credentials and the live password-reset material. A backup is handed over,
// mailed and kept on a shared drive; a password hash in it is a durable
// liability, and the reset columns would let a holder of the file take over an
// account that still has a code outstanding. Everything else about a user is
// ordinary institutional record.
const USER_SECRETS = ['password', 'resetTokenHash', 'resetTokenExpiresAt', 'resetCodeAttempts'];

// One cell's worth of a column value.
//
// Dates become ISO-8601 STRINGS rather than Excel date cells deliberately. An
// Excel date carries no zone, so the reader's machine decides what it means —
// and §45 is the worked example of that costing this project a month-end
// column. A string is unambiguous, sorts correctly as text, and is what a
// restore would parse.
function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString();
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  const s = typeof v === 'object' ? JSON.stringify(v) : v;
  if (typeof s !== 'string' || s.length <= EXCEL_CELL_LIMIT) return s;
  const mark = `${TRUNCATION_MARK}: ${s.length - EXCEL_CELL_LIMIT} more characters]`;
  return s.slice(0, EXCEL_CELL_LIMIT - mark.length) + mark;
}

// Flatten one model row. `omit` drops secrets; the key ORDER is the model's own
// column order, so the sheet reads like the table.
function flattenRow(row, omit = []) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (omit.includes(k)) continue;
    out[k] = cellValue(v);
  }
  return out;
}

// A sheet whose rows are all empty still needs its HEADER, or a reader cannot
// tell "this table is empty" from "this table was not exported" — the same
// distinction §33 draws between never-screened and green.
function headerFor(model, omit = []) {
  return Object.keys(model.rawAttributes).filter((k) => !omit.includes(k));
}

// The sheets, in the order a reader opens them: who, what was measured, the
// detail, then the governance that makes a verdict reproducible.
function sheetPlan(models) {
  const {
    Athlete, Screening, MuscleFlag, AthleteDiscipline,
    CohortThreshold, CohortNormVersion, Setting, User, AuditLog,
  } = models;
  return [
    { name: 'Athletes', model: Athlete, order: [['athleteId', 'ASC']] },
    {
      name: 'Screenings',
      model: Screening,
      order: [['athleteId', 'ASC'], ['assessedAt', 'ASC']],
      note: 'Every screening ever imported, not just the latest per athlete.',
    },
    { name: 'MuscleFlags', model: MuscleFlag, order: [['athleteId', 'ASC']] },
    { name: 'Disciplines', model: AthleteDiscipline, order: [['athleteId', 'ASC']] },
    {
      name: 'CohortNorms',
      model: CohortThreshold,
      order: [['id', 'ASC']],
      note: 'The norms in force — the ruler each band was measured against.',
    },
    { name: 'NormVersions', model: CohortNormVersion, order: [['id', 'ASC']] },
    { name: 'Settings', model: Setting, order: [['key', 'ASC']] },
    {
      name: 'Users',
      model: User,
      order: [['id', 'ASC']],
      omit: USER_SECRETS,
      note: 'Accounts without credentials — no password hashes, no reset material.',
    },
    {
      name: 'AuditLog',
      model: AuditLog,
      order: [['id', 'DESC']],
      limit: AUDIT_CAP,
      note: 'Append-only trail. Newest first.',
    },
  ];
}

// Read every sheet's rows. Returns the plan with `rows` and `total` attached,
// so the manifest can report a truncated table as truncated.
async function collect(models) {
  const plan = sheetPlan(models);
  for (const s of plan) {
    const total = await s.model.count();
    const rows = await s.model.findAll({
      order: s.order,
      ...(s.limit ? { limit: s.limit } : {}),
      raw: true,
    });
    s.total = total;
    s.rows = rows.map((r) => flattenRow(r, s.omit));
    s.truncated = total > s.rows.length;
    // Cells the FORMAT could not hold, as opposed to rows the CAP dropped. Two
    // different losses, reported separately because the remedies differ.
    s.clippedCells = s.rows.reduce((n, row) => n + Object.values(row)
      .filter((v) => typeof v === 'string' && v.includes(TRUNCATION_MARK)).length, 0);
  }
  return plan;
}

// The first sheet. It exists so a reader can tell at a glance whether the file
// in front of them is complete — which is exactly what the old export could not
// be asked.
function manifestRows(plan, takenAt) {
  const rows = plan.map((s) => {
    const losses = [];
    if (s.truncated) losses.push(`NO — only the newest ${s.rows.length} rows`);
    if (s.clippedCells) losses.push(`${s.clippedCells} cell(s) clipped at Excel's 32,767-character limit`);
    return {
      Sheet: s.name,
      Rows: s.rows.length,
      'Rows in database': s.total,
      Complete: losses.length ? losses.join('; ') : 'yes',
      Notes: s.note ?? '',
    };
  });
  return [
    { Sheet: 'AIRMS backup', Rows: '', 'Rows in database': '', Complete: '', Notes: `Taken ${takenAt}` },
    ...rows,
  ];
}

module.exports = {
  AUDIT_CAP,
  EXCEL_CELL_LIMIT,
  TRUNCATION_MARK,
  USER_SECRETS,
  cellValue,
  flattenRow,
  headerFor,
  sheetPlan,
  collect,
  manifestRows,
};
