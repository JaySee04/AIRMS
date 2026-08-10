// When the monthly digest is owed.
//
// This is the logic that fails SILENTLY: a skipped month produces no error, no
// log and no email, and you find out when someone asks why there are eleven
// reports in the year. So the rules get pinned down directly.
const { isDue, monthKey } = require('../src/utils/scheduler');

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0);
const base = { digest_enabled: true, digest_day: 1, digest_hour: 7, digest_last_sent: '' };

describe('monthly digest scheduling', () => {
  it('is not due before the configured day and hour', () => {
    expect(isDue(at(2026, 8, 1, 6), base)).toBe(false);
    // The instant itself counts as due — a >= boundary, not >.
    expect(isDue(at(2026, 8, 1, 7), base)).toBe(true);
  });

  it('is still due later the same month if it was missed', () => {
    // The point of the whole design: down on the 1st must not mean skipped.
    expect(isDue(at(2026, 8, 9, 15), base)).toBe(true);
  });

  it('does not resend once this month is marked', () => {
    const sent = { ...base, digest_last_sent: '2026-08' };
    expect(isDue(at(2026, 8, 9, 15), sent)).toBe(false);
    // ...but the NEXT month is owed again.
    expect(isDue(at(2026, 9, 1, 7), sent)).toBe(true);
  });

  it('is never due while disabled', () => {
    expect(isDue(at(2026, 8, 9, 15), { ...base, digest_enabled: false })).toBe(false);
  });

  it('caps the day at 28 so February always fires', () => {
    // A digest configured for the 30th would otherwise never fire in February.
    const feb = { ...base, digest_day: 31 };
    expect(isDue(at(2026, 2, 28, 8), feb)).toBe(true);
  });

  it('clamps a nonsense day or hour instead of never firing', () => {
    expect(isDue(at(2026, 8, 9, 12), { ...base, digest_day: 0 })).toBe(true);
    expect(isDue(at(2026, 8, 9, 12), { ...base, digest_day: -5 })).toBe(true);
    expect(isDue(at(2026, 8, 1, 0), { ...base, digest_hour: 99 })).toBe(false);
    expect(isDue(at(2026, 8, 1, 23), { ...base, digest_hour: 99 })).toBe(true);
  });

  it('treats a missing hour as 07:00 rather than midnight', () => {
    const noHour = { digest_enabled: true, digest_day: 1, digest_last_sent: '' };
    expect(isDue(at(2026, 8, 1, 6), noHour)).toBe(false);
    expect(isDue(at(2026, 8, 1, 7), noHour)).toBe(true);
  });

  it('keys the marker by year and month, zero-padded', () => {
    expect(monthKey(at(2026, 1, 5, 0))).toBe('2026-01');
    expect(monthKey(at(2026, 12, 5, 0))).toBe('2026-12');
    // Zero padding matters: '2026-9' would not equal '2026-09' and the month
    // would resend every hour.
    expect(monthKey(at(2026, 9, 5, 0))).toBe('2026-09');
  });

  it('does not confuse the same month in different years', () => {
    const sent = { ...base, digest_last_sent: '2025-08' };
    expect(isDue(at(2026, 8, 1, 7), sent)).toBe(true);
  });
});
