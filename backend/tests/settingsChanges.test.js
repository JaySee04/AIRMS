// Which settings a PATCH actually changes (utils/settings.js).
//
// Guards a SILENT failure, like bands/mailPrefs: `PATCH /cohorts/settings/all`
// used to write an audit row reading "Norm settings changed" for every request
// that reached it, including one with an empty body — and to rescore all 56
// athletes while it was there. Nothing broke, nothing was corrupted, and the
// only trace was a trail asserting a change that never happened, in the one
// record the institution would use to prove what moved the norms.
//
// Both directions matter and they are asymmetric. Reporting a change that did
// not occur pollutes the audit trail with noise, which is bad; failing to
// report one that DID occur means a norm moved with no record of who moved it,
// which is worse. Hence the type-mismatch case below: when in doubt, the
// function must over-report.

const { appliedSettingChanges, DEFAULTS } = require('../src/utils/settings');

const before = { ...DEFAULTS, min_cohort_n: 5, rescreen_due_days: 180, fallback_enabled: true };

describe('a PATCH that changes nothing', () => {
  test.each([
    ['an empty body', {}],
    ['no body at all', undefined],
    ['a null body', null],
    ['only unrecognised keys', { nope: 1, alsoNope: 'x' }],
  ])('%s applies nothing', (_label, patch) => {
    expect(appliedSettingChanges(before, patch)).toEqual([]);
  });

  test('a recognised key re-sent with the value it already has', () => {
    expect(appliedSettingChanges(before, { min_cohort_n: 5 })).toEqual([]);
  });

  test('several keys, all re-sent unchanged', () => {
    const patch = { min_cohort_n: 5, rescreen_due_days: 180, fallback_enabled: true };
    expect(appliedSettingChanges(before, patch)).toEqual([]);
  });
});

describe('a PATCH that does change something', () => {
  test('reports the key that moved', () => {
    expect(appliedSettingChanges(before, { min_cohort_n: 8 })).toEqual(['min_cohort_n']);
  });

  test('a boolean flipped counts', () => {
    expect(appliedSettingChanges(before, { fallback_enabled: false }))
      .toEqual(['fallback_enabled']);
  });

  test('reports only the keys that moved, dropping the rest', () => {
    const patch = { min_cohort_n: 8, rescreen_due_days: 180, unknownKey: true };
    expect(appliedSettingChanges(before, patch)).toEqual(['min_cohort_n']);
  });

  test('clearing a pinned norm version is a change, not a no-op', () => {
    const pinned = { ...before, pinned_norm_version_id: 12 };
    expect(appliedSettingChanges(pinned, { pinned_norm_version_id: null }))
      .toEqual(['pinned_norm_version_id']);
  });

  test('re-clearing an already-clear pin is a no-op', () => {
    const unpinned = { ...before, pinned_norm_version_id: null };
    expect(appliedSettingChanges(unpinned, { pinned_norm_version_id: null })).toEqual([]);
  });
});

describe('edge shapes', () => {
  test('falls back to the default when the current settings lack the key', () => {
    expect(appliedSettingChanges({}, { min_cohort_n: DEFAULTS.min_cohort_n })).toEqual([]);
    expect(appliedSettingChanges({}, { min_cohort_n: 99 })).toEqual(['min_cohort_n']);
  });

  test('a type mismatch counts as a change — over-report rather than hide a write', () => {
    expect(appliedSettingChanges(before, { min_cohort_n: '5' })).toEqual(['min_cohort_n']);
  });

  test('order follows the request body, so the audit summary reads as sent', () => {
    const patch = { rescreen_due_days: 90, min_cohort_n: 8 };
    expect(appliedSettingChanges(before, patch)).toEqual(['rescreen_due_days', 'min_cohort_n']);
  });
});
