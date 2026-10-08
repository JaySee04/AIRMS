// WHAT A BACKUP HAS TO CONTAIN, AND WHAT A CELL DOES TO IT (§149).
//
// Two failure modes, and both produce a file that opens cleanly:
//
//  1. A TABLE IS MISSING. That is what shipped for three months — the export
//     wrote 2 of 9 tables and the card called it a backup. Nothing downstream
//     complains, because the file is valid; only reading it back finds it.
//  2. A VALUE ARRIVES AS `[object Object]`. `XLSX.utils.json_to_sheet`
//     stringifies with String(), and there are 14 JSON columns across the
//     tables this now exports. A backup full of `[object Object]` is the same
//     shape of defect one layer down: complete-looking and worthless.
//
// So the sheet LIST is pinned against the model registry (direction: a model
// added without a sheet fails, which is the silent one — the reverse throws at
// collect()), and the cell encoder is pinned against every column type the
// schema actually holds.
const {
  cellValue, flattenRow, headerFor, sheetPlan, manifestRows, collect,
  USER_SECRETS, AUDIT_CAP, EXCEL_CELL_LIMIT, TRUNCATION_MARK,
} = require('../src/utils/backupWorkbook');

// A stand-in registry: `collect` only needs count/findAll/rawAttributes.
function fakeModel(name, rows, attrs) {
  return {
    name,
    rawAttributes: Object.fromEntries((attrs ?? Object.keys(rows[0] ?? {})).map((k) => [k, {}])),
    count: async () => rows.length,
    findAll: async ({ limit }) => (limit ? rows.slice(0, limit) : rows.slice()),
  };
}

const registry = () => ({
  Athlete: fakeModel('Athlete', [{ athleteId: '890202021001', name: 'A' }]),
  Screening: fakeModel('Screening', [
    { id: 1, athleteId: '890202021001', assessedAt: new Date('2026-07-29T02:00:00Z'), subitems: { neck: { rom: 71 } } },
  ]),
  MuscleFlag: fakeModel('MuscleFlag', [{ id: 1, muscle: 'psoas', side: 'L' }]),
  AthleteDiscipline: fakeModel('AthleteDiscipline', [{ id: 1, sport: 'Badminton' }]),
  CohortThreshold: fakeModel('CohortThreshold', [{ id: 1, stats: { mean: 50 } }]),
  CohortNormVersion: fakeModel('CohortNormVersion', [{ id: 1, snapshot: [{ t: 1 }] }]),
  Setting: fakeModel('Setting', [{ key: 'rescreen_due_days', value: 180 }]),
  User: fakeModel('User', [
    { id: 1, email: 'a@isn.gov.my', password: '$2b$10$hash', resetTokenHash: 'x', resetTokenExpiresAt: null, resetCodeAttempts: 0, permissions: { viewRecords: true } },
  ]),
  AuditLog: fakeModel('AuditLog', [{ id: 1, action: 'athlete.view', meta: { n: 2 } }]),
});

describe('cellValue — the [object Object] trap', () => {
  test('a JSON object becomes readable JSON, never [object Object]', () => {
    const v = cellValue({ neck: { rom: 71, stability: 68 } });
    expect(v).toBe('{"neck":{"rom":71,"stability":68}}');
    expect(v).not.toContain('[object Object]');
  });

  test('a JSON array survives too — prescription is an array of days', () => {
    expect(cellValue([{ day: 1 }, { day: 2 }])).toBe('[{"day":1},{"day":2}]');
  });

  test('a Date becomes an unambiguous ISO-8601 string, not an Excel date cell', () => {
    // §45: an Excel date carries no zone, so the reader's machine decides what
    // it means. That already cost this project a month-end column.
    expect(cellValue(new Date('2026-07-29T02:00:00Z'))).toBe('2026-07-29T02:00:00.000Z');
  });

  test('an invalid Date does not write "Invalid Date" into a cell', () => {
    expect(cellValue(new Date('nonsense'))).toBe('');
  });

  test('null and undefined are blank, not the strings "null"/"undefined"', () => {
    expect(cellValue(null)).toBe('');
    expect(cellValue(undefined)).toBe('');
  });

  test('a real 0 stays 0 — §54, an unknown value stays unknown but a zero is a zero', () => {
    expect(cellValue(0)).toBe(0);
  });

  test('booleans read as words, because Excel shows a bare 0/1 for them', () => {
    expect(cellValue(true)).toBe('TRUE');
    expect(cellValue(false)).toBe('FALSE');
  });
});

describe("Excel's 32,767-character cell limit", () => {
  // FOUND BY RUNNING IT, not by reading it. `xlsx` THROWS at write time rather
  // than truncating, after every sheet is built — so the widened export 500'd
  // on the real database, where NormVersions.snapshot measures 35,076
  // characters. No fixture-sized unit test could have reached it.
  test('an oversize value is clipped to something the format can hold', () => {
    const v = cellValue('x'.repeat(EXCEL_CELL_LIMIT + 5000));
    expect(v.length).toBeLessThanOrEqual(EXCEL_CELL_LIMIT);
  });

  test('...and SAYS it was clipped, naming how much went', () => {
    const v = cellValue('x'.repeat(EXCEL_CELL_LIMIT + 5000));
    expect(v).toContain(TRUNCATION_MARK);
    expect(v).toMatch(/\d+ more characters]$/);
  });

  test('a clipped JSON value does not parse — a restore must fail loudly', () => {
    const big = JSON.stringify({ pad: 'x'.repeat(EXCEL_CELL_LIMIT) });
    expect(() => JSON.parse(cellValue(big))).toThrow();
  });

  test('a value exactly at the limit is untouched', () => {
    const v = cellValue('x'.repeat(EXCEL_CELL_LIMIT));
    expect(v.length).toBe(EXCEL_CELL_LIMIT);
    expect(v).not.toContain(TRUNCATION_MARK);
  });

  test('collect counts clipped cells, and the manifest reports them', async () => {
    const models = registry();
    models.CohortNormVersion = fakeModel('CohortNormVersion', [
      { id: 1, snapshot: { pad: 'x'.repeat(EXCEL_CELL_LIMIT) } },
    ]);
    const plan = await collect(models);
    const versions = plan.find((s) => s.name === 'NormVersions');
    expect(versions.clippedCells).toBe(1);
    const row = manifestRows(plan, '2026-10-09').find((r) => r.Sheet === 'NormVersions');
    expect(row.Complete).toMatch(/clipped/);
  });

  test('a sheet with nothing clipped still reads as complete', async () => {
    const plan = await collect(registry());
    for (const s of plan) expect(s.clippedCells).toBe(0);
    const row = manifestRows(plan, '2026-10-09').find((r) => r.Sheet === 'NormVersions');
    expect(row.Complete).toBe('yes');
  });
});

describe('flattenRow', () => {
  test('omits what it is told to omit and encodes the rest', () => {
    const row = flattenRow({ id: 1, password: 'secret', meta: { a: 1 } }, ['password']);
    expect(row).toEqual({ id: 1, meta: '{"a":1}' });
  });

  test('the whole row is encoded — no key escapes cellValue', () => {
    const row = flattenRow({ a: { x: 1 }, b: { y: 2 } });
    for (const v of Object.values(row)) expect(String(v)).not.toContain('[object Object]');
  });
});

describe('the sheet plan', () => {
  test('every model in the registry has a sheet', async () => {
    // The direction that fails SILENTLY: a tenth model added to the schema and
    // forgotten here exports as a backup missing a table, which is exactly the
    // defect §149 was opened about. The reverse (a sheet naming a model that
    // does not exist) throws inside collect() and needs no test.
    const models = registry();
    const named = new Set(sheetPlan(models).map((s) => s.model.name));
    for (const name of Object.keys(models)) {
      expect(named.has(name)).toBe(true);
    }
  });

  test('screenings are exported — the table whose absence started this', () => {
    const names = sheetPlan(registry()).map((s) => s.name);
    expect(names).toContain('Screenings');
    expect(names).toContain('CohortNorms');
    expect(names).toContain('AuditLog');
  });

  test('user credentials are never a sheet column', async () => {
    const plan = await collect(registry());
    const users = plan.find((s) => s.name === 'Users');
    for (const secret of USER_SECRETS) {
      expect(Object.keys(users.rows[0])).not.toContain(secret);
    }
    expect(JSON.stringify(users.rows)).not.toContain('$2b$10$');
  });

  test('a user sheet still carries the account, minus the secrets', async () => {
    const plan = await collect(registry());
    const users = plan.find((s) => s.name === 'Users');
    expect(users.rows[0].email).toBe('a@isn.gov.my');
    expect(users.rows[0].permissions).toBe('{"viewRecords":true}');
  });
});

describe('collect', () => {
  test('a screening row keeps its date AND its subitems', async () => {
    // Both halves of the original defect in one assertion: the athlete row
    // carried scores with no `assessedAt`, and `subitems` is the 25-cell table
    // Total Score is the mean of.
    const plan = await collect(registry());
    const s = plan.find((x) => x.name === 'Screenings').rows[0];
    expect(s.assessedAt).toBe('2026-07-29T02:00:00.000Z');
    expect(s.subitems).toBe('{"neck":{"rom":71}}');
  });

  test('nothing is truncated when everything fits', async () => {
    const plan = await collect(registry());
    for (const s of plan) expect(s.truncated).toBe(false);
  });

  test('a capped table reports itself truncated', async () => {
    const models = registry();
    const many = Array.from({ length: AUDIT_CAP + 5 }, (_, i) => ({ id: i, action: 'a' }));
    models.AuditLog = fakeModel('AuditLog', many);
    const plan = await collect(models);
    const log = plan.find((s) => s.name === 'AuditLog');
    expect(log.rows.length).toBe(AUDIT_CAP);
    expect(log.total).toBe(AUDIT_CAP + 5);
    expect(log.truncated).toBe(true);
  });
});

describe('the manifest', () => {
  test('a truncated sheet is NAMED as incomplete, not quietly short', async () => {
    // Rule 2: a partial result must never read as a complete one.
    const models = registry();
    models.AuditLog = fakeModel('AuditLog', Array.from({ length: AUDIT_CAP + 1 }, (_, i) => ({ id: i })));
    const rows = manifestRows(await collect(models), '2026-10-09');
    const log = rows.find((r) => r.Sheet === 'AuditLog');
    expect(log.Complete).toMatch(/^NO —/);
    expect(log.Complete).toMatch(/newest/);
  });

  test('a complete sheet says so, and reports both counts', async () => {
    const rows = manifestRows(await collect(registry()), '2026-10-09');
    const scr = rows.find((r) => r.Sheet === 'Screenings');
    expect(scr.Complete).toBe('yes');
    expect(scr.Rows).toBe(1);
    expect(scr['Rows in database']).toBe(1);
  });

  test('every sheet in the plan appears in the manifest', async () => {
    const plan = await collect(registry());
    const rows = manifestRows(plan, '2026-10-09');
    for (const s of plan) expect(rows.some((r) => r.Sheet === s.name)).toBe(true);
  });
});

describe('headerFor', () => {
  test('an empty table still names its columns', () => {
    // Otherwise "nothing in this table" and "this table was not exported" look
    // identical to the reader — the §33 distinction, one layer down.
    const cols = headerFor({ rawAttributes: { id: {}, password: {}, name: {} } }, ['password']);
    expect(cols).toEqual(['id', 'name']);
  });
});
