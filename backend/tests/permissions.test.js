// Per-user permission layer (opt-out model for medical staff).
const { hasPermission, sanitizePermissions, PERMISSION_KEYS } = require('../src/utils/permissions');

describe('hasPermission', () => {
  test('non-medical roles are never constrained by this layer', () => {
    for (const role of ['admin', 'athlete', 'coach']) {
      expect(hasPermission({ role, permissions: { viewRecords: false } }, 'viewRecords')).toBe(true);
    }
  });

  test('medical staff are granted by default (missing key = granted)', () => {
    expect(hasPermission({ role: 'medical', permissions: {} }, 'viewRecords')).toBe(true);
    expect(hasPermission({ role: 'medical', permissions: null }, 'uploadData')).toBe(true);
  });

  test('only an explicit false revokes, and only the named capability', () => {
    const user = { role: 'medical', permissions: { viewRecords: false } };
    expect(hasPermission(user, 'viewRecords')).toBe(false);
    expect(hasPermission(user, 'uploadData')).toBe(true); // untouched key still granted
  });

  test('defensive against malformed input', () => {
    expect(hasPermission(null, 'viewRecords')).toBe(true);
    expect(hasPermission({ role: 'medical', permissions: 'nope' }, 'viewRecords')).toBe(true);
  });
});

describe('sanitizePermissions', () => {
  test('keeps only known keys with boolean values', () => {
    const out = sanitizePermissions({ viewRecords: false, uploadData: true, bogus: true, injuryReports: 'yes' });
    expect(out).toEqual({ viewRecords: false, uploadData: true });
  });

  test('non-object input normalises to an empty map', () => {
    expect(sanitizePermissions(null)).toEqual({});
    expect(sanitizePermissions('x')).toEqual({});
    expect(sanitizePermissions(undefined)).toEqual({});
  });

  test('never emits a key outside the known set', () => {
    const out = sanitizePermissions(Object.fromEntries(PERMISSION_KEYS.concat('sneaky').map((k) => [k, true])));
    expect(Object.keys(out).sort()).toEqual([...PERMISSION_KEYS].sort());
  });
});
