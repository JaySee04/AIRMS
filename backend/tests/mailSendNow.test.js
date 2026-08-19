// Forced sends, and what happens when a send FAILS.
//
// Two silent failures live here, and neither shows up in `isDue` unit tests:
//
//   1. A "Send now" button that quietly ignored `digest_enabled` would be a
//      second gate contradicting the first — the institution switch says AIRMS
//      does not send this kind of mail, and a button would send it anyway.
//   2. A failed send must NOT consume the month. The marker is what makes the
//      scheduler idempotent, so marking a month whose mail never left turns a
//      transient SMTP error into a permanently missing report. That failure
//      produces no error anywhere a human looks — which is why the outcome is
//      now persisted, and why it is asserted here.
//
// Everything the scheduler touches is mocked, so this runs with no database and
// no network — same approach as holisticReport.test.js.

const mockSettingsStore = {};

jest.mock('../src/utils/settings', () => ({
  getSettings: jest.fn(async () => ({ ...mockSettingsStore })),
  setSetting: jest.fn(async (k, v) => { mockSettingsStore[k] = v; }),
  DEFAULTS: {},
}));

const mockSendMail = jest.fn(async () => ({ messageId: 'test' }));
jest.mock('../src/utils/mailer', () => ({ sendMail: (...a) => mockSendMail(...a) }));

jest.mock('../src/models', () => ({
  Athlete: { findAll: jest.fn(async () => []), count: jest.fn(async () => 0) },
  Screening: { findAll: jest.fn(async () => []) },
  User: { findAll: jest.fn(async () => [{ email: 'admin@isn.gov.my', role: 'admin', notifyPrefs: null }]) },
}));

jest.mock('../src/utils/cohorts', () => ({ latestScreeningsByAthlete: jest.fn(async () => []) }));
jest.mock('../src/utils/screeningPeriods', () => ({ screeningPeriods: jest.fn(() => ({ periods: [] })) }));
jest.mock('../src/utils/bands', () => ({ effectiveBand: jest.fn(() => 'green') }));
jest.mock('../src/utils/holisticReport', () => ({ renderHolisticPdf: jest.fn(async () => null) }));
jest.mock('../src/utils/mailPrefs', () => ({ recipientsFor: jest.fn((users) => users) }));
jest.mock('../src/utils/programmeActivity', () => ({
  rescreenRecall: jest.fn(async () => ({ overdue: [], never: [], dueSoon: [], current: [], medianAgeDays: null })),
}));

// The cross-process lock is exercised for real in lock.test.js, against the SQL
// it issues. Here it is a passthrough, so these tests stay about WHAT is sent
// rather than who is allowed to send it - except for `mockLockBusy`, which
// proves the wrap is actually in place. A passthrough alone would let somebody
// delete `withLock` from the scheduler and see every test still pass.
let mockLockBusy = false;
jest.mock('../src/utils/lock', () => ({
  withLock: jest.fn(async (name, fn, opts = {}) => (mockLockBusy ? opts.onBusy : fn())),
}));

const { runDigestOnce } = require('../src/utils/scheduler');
const { getSettings } = require('../src/utils/settings');

// The 9th, well past a day-1 digest, with this month already delivered — so
// nothing here is "due" and only `force` can make it send.
const NOW = new Date(2026, 7, 9, 15, 0, 0, 0);

function reset(over = {}) {
  for (const k of Object.keys(mockSettingsStore)) delete mockSettingsStore[k];
  Object.assign(mockSettingsStore, {
    digest_enabled: true,
    digest_day: 1,
    digest_hour: 7,
    digest_last_sent: '2026-08',
    digest_last_result: '',
  }, over);
  mockSendMail.mockClear();
  mockSendMail.mockImplementation(async () => ({ messageId: 'test' }));
  mockLockBusy = false;
}

describe('forced sends', () => {
  beforeEach(() => reset());

  it('does nothing without force once the month is marked', async () => {
    const r = await runDigestOnce(NOW);
    expect(r.sent).toBe(false);
    expect(r.reason).toBe('not due');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('sends with force even though the month is already marked', async () => {
    const r = await runDigestOnce(NOW, { force: true });
    expect(r.sent).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  // Proves the send actually runs UNDER the lock. Without this, deleting the
  // withLock wrapper from the scheduler would break nothing any test can see -
  // and the double-send it prevents only shows up in production, once a month.
  it('does not send at all while another process holds the lock', async () => {
    mockLockBusy = true;
    const r = await runDigestOnce(NOW, { force: true });
    expect(r).toEqual({ sent: false, reason: 'another process is already sending' });
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  // The gate that must survive the button. `force` overrides the SCHEDULE, never
  // the institution's decision about whether this mail exists at all.
  it('still refuses when the notification is switched off', async () => {
    reset({ digest_enabled: false });
    const r = await runDigestOnce(NOW, { force: true });
    expect(r.sent).toBe(false);
    expect(r.reason).toBe('disabled');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('the outcome of the last attempt is recorded', () => {
  beforeEach(() => reset());

  it('records a success, with detail', async () => {
    await runDigestOnce(NOW, { force: true });
    const out = JSON.parse((await getSettings()).digest_last_result);
    expect(out.ok).toBe(true);
    expect(out.detail).toMatch(/recipient/);
    expect(Number.isNaN(new Date(out.at).getTime())).toBe(false);
  });

  it('records a FAILURE, carrying the reason', async () => {
    reset({ digest_last_sent: '' });          // the month is owed
    mockSendMail.mockImplementation(async () => { throw new Error('ECONNREFUSED smtp'); });

    await expect(runDigestOnce(NOW, { force: true })).rejects.toThrow('ECONNREFUSED');

    const out = JSON.parse((await getSettings()).digest_last_result);
    expect(out.ok).toBe(false);
    expect(out.detail).toMatch(/ECONNREFUSED/);
  });

  // The property that makes the whole marker design safe. If a failed send were
  // to mark the month, the retry would never happen and the report would be
  // missing for good — with nothing logged anywhere a person looks.
  it('does not consume the month when the send fails', async () => {
    reset({ digest_last_sent: '' });
    mockSendMail.mockImplementation(async () => { throw new Error('ECONNREFUSED smtp'); });

    await expect(runDigestOnce(NOW, { force: true })).rejects.toThrow();

    expect((await getSettings()).digest_last_sent).toBe('');
  });
});
