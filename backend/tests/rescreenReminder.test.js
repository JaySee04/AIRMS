// When the rescreen reminder is owed, and what it says.
//
// Same silent-failure class as the monthly digest: a skipped month produces no
// error, no log and no email, and nobody notices that the recall list stopped
// arriving. The scheduling rules are pinned directly, and so is the one
// distinction the content must never lose — an athlete who has NEVER been
// screened needs a first assessment, not a call-back, and must not be folded
// into the overdue count.

jest.mock('../src/models', () => ({
  Athlete: { findAll: jest.fn(), count: jest.fn() },
  Screening: { findAll: jest.fn() },
  User: { findAll: jest.fn() },
  Setting: { findAll: jest.fn(), destroy: jest.fn(), upsert: jest.fn() },
}));
jest.mock('../src/utils/mailer', () => ({ sendMail: jest.fn().mockResolvedValue(true) }));

const { Athlete, Screening, Setting } = require('../src/models');
const { isReminderDue, buildReminder } = require('../src/utils/scheduler');

const at = (y, m, d, h) => new Date(y, m - 1, d, h, 0, 0, 0);
const base = {
  rescreen_reminder_enabled: true,
  rescreen_reminder_day: 1,
  rescreen_reminder_hour: 8,
  rescreen_reminder_last_sent: '',
};

beforeEach(() => {
  jest.clearAllMocks();
  Setting.findAll.mockResolvedValue([]); // defaults: rescreen_due_days = 180
});

describe('rescreen reminder scheduling', () => {
  it('is not due before the configured day and hour', () => {
    expect(isReminderDue(at(2026, 8, 1, 7), base)).toBe(false);
    expect(isReminderDue(at(2026, 8, 1, 8), base)).toBe(true);
  });

  // The whole point of a marker instead of a cron instant: down when it fell
  // due must mean late, not skipped.
  it('is still due later the same month if it was missed', () => {
    expect(isReminderDue(at(2026, 8, 20, 15), base)).toBe(true);
  });

  it('does not resend once the month is marked, but owes the next one', () => {
    const sent = { ...base, rescreen_reminder_last_sent: '2026-08' };
    expect(isReminderDue(at(2026, 8, 20, 15), sent)).toBe(false);
    expect(isReminderDue(at(2026, 9, 1, 8), sent)).toBe(true);
  });

  it('is never due while disabled', () => {
    expect(isReminderDue(at(2026, 8, 20, 15), { ...base, rescreen_reminder_enabled: false })).toBe(false);
  });

  it('caps the day at 28 so February always fires', () => {
    expect(isReminderDue(at(2026, 2, 28, 9), { ...base, rescreen_reminder_day: 31 })).toBe(true);
  });

  it('clamps a nonsense day or hour rather than never firing', () => {
    expect(isReminderDue(at(2026, 8, 20, 15), { ...base, rescreen_reminder_day: 0 })).toBe(true);
    expect(isReminderDue(at(2026, 8, 20, 23), { ...base, rescreen_reminder_hour: 99 })).toBe(true);
  });
});

describe('what the reminder says', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

  it('separates never-screened from overdue, and names both', async () => {
    Athlete.findAll.mockResolvedValue([
      { athleteId: 'a1', name: 'Late Larry', sport: 'Hockey' },
      { athleteId: 'a2', name: 'Fresh Fiona', sport: 'Hockey' },
      { athleteId: 'a3', name: 'New Nadia', sport: 'Swimming' },
    ]);
    Screening.findAll.mockResolvedValue([
      { athleteId: 'a1', assessedAt: daysAgo(400) },
      { athleteId: 'a2', assessedAt: daysAgo(5) },
    ]);

    const { subject, text, needed } = await buildReminder(at(2026, 8, 1, 8));

    // Two people need attention for two DIFFERENT reasons.
    expect(needed).toBe(2);
    expect(subject).toContain('2 athletes');
    expect(text).toMatch(/Overdue a rescreen \.+ 1/);
    expect(text).toMatch(/Never screened \.+ 1/);
    // Named, with the age on the overdue one so a caller knows how stale it is.
    expect(text).toContain('Late Larry (a1)');
    expect(text).toContain('400 days ago');
    expect(text).toContain('New Nadia (a3)');
    // The never-screened athlete must NOT be given a "last screened" age.
    expect(text).not.toMatch(/New Nadia[^\n]*last screened/);
    // Grouped by sport, since a recall list is worked per squad.
    expect(text).toContain('Hockey');
    expect(text).toContain('Swimming');
    // Current athletes are counted, not listed.
    expect(text).not.toContain('Fresh Fiona');
  });

  it('says so plainly when nothing needs a call-back', async () => {
    Athlete.findAll.mockResolvedValue([{ athleteId: 'a1', name: 'Fresh Fiona', sport: 'Hockey' }]);
    Screening.findAll.mockResolvedValue([{ athleteId: 'a1', assessedAt: daysAgo(3) }]);

    const { subject, text, needed } = await buildReminder(at(2026, 8, 1, 8));
    expect(needed).toBe(0);
    expect(subject).toContain('fully current');
    expect(text).toContain('Nothing needs a call-back');
  });

  it('states the interval, and that it is an institution setting not a standard', async () => {
    Athlete.findAll.mockResolvedValue([]);
    Screening.findAll.mockResolvedValue([]);
    const { text } = await buildReminder(at(2026, 8, 1, 8));
    expect(text).toContain('180 days');
    expect(text).toContain('about 6 months');
    expect(text).toMatch(/ISN setting rather than a clinical standard/);
  });

  // "about 1 months" reads as a bug to whoever receives it.
  it('pluralises the interval correctly at exactly one month', async () => {
    Setting.findAll.mockResolvedValue([{ key: 'rescreen_due_days', value: 30 }]);
    Athlete.findAll.mockResolvedValue([]);
    Screening.findAll.mockResolvedValue([]);
    const { text } = await buildReminder(at(2026, 8, 1, 8));
    expect(text).toContain('about 1 month)');
    expect(text).not.toContain('1 months');
  });

  it('caps the listed names and admits it is truncated', async () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      athleteId: `x${i}`, name: `Athlete ${i}`, sport: 'Hockey',
    }));
    Athlete.findAll.mockResolvedValue(many);
    Screening.findAll.mockResolvedValue(many.map((a) => ({ athleteId: a.athleteId, assessedAt: daysAgo(300) })));

    const { text } = await buildReminder(at(2026, 8, 1, 8));
    expect(text).toMatch(/Overdue a rescreen \.+ 50/);
    // 40 named, the remainder counted rather than silently dropped.
    expect(text).toContain('and 10 more not listed here');
  });
});
