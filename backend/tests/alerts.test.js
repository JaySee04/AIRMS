// WHO GETS TOLD AN ATHLETE WAS FLAGGED.
//
// This is the file whose failures are silent in the worst direction: nobody
// notices an email that did not arrive. A clinician does not chase an alert they
// were never sent, and the import they are waiting on reports success either
// way. Measured 2026-09-30, alerts.js was at 22.6% statements / 20.7% branches —
// the lowest of anything that touches clinical routing.
//
// The cases below are chosen for that: each is a way the routing could be wrong
// while the import still reports "committed" and the mailer still reports "sent".
//
//   * a coach seeing another sport's athlete — a DISCLOSURE, not a nuisance;
//   * a coach NOT seeing their own — the recall they are responsible for;
//   * an opt-out that reads as consent, or a consent that reads as opt-out
//     (utils/mailPrefs.js exists because this failed once already);
//   * the institution's switch and the per-user switch in the wrong ORDER;
//   * a red buried under six ambers in a digest;
//   * one email per ATHLETE instead of per RECIPIENT — the regression the batch
//     form was written to fix, which made a 15-PDF import send 15 mails into
//     every medical inbox;
//   * a clinician's OVERRIDE ignored, so the band emailed is not the band shown;
//   * the wrong screening picked when an athlete has several.
//
// The models, the mailer and the settings are mocked — same shape as
// holisticReport.test.js — so this needs no database and runs in CI.
jest.mock('../src/models', () => ({
  Athlete: { findAll: jest.fn() },
  Screening: { findAll: jest.fn() },
  User: { findAll: jest.fn() },
}));

const mockSendMail = jest.fn();
jest.mock('../src/utils/mailer', () => ({ sendMail: (...a) => mockSendMail(...a) }));

const mockGetSettings = jest.fn();
jest.mock('../src/utils/settings', () => ({ getSettings: (...a) => mockGetSettings(...a) }));

const { Athlete, Screening, User } = require('../src/models');
const { alertMany, groupByRecipient } = require('../src/utils/alerts');

const athlete = (athleteId, name, sport, extra = {}) => ({
  athleteId, name, sport, program: 'PODIUM', gender: 'Female', ...extra,
});
const screening = (athleteId, overallBand, extra = {}) => ({
  athleteId, overallBand, overallIndicator: 55, escalations: 1, factors: [], assessedAt: '2026-01-10', id: 1, ...extra,
});

const ROSTER = [
  athlete('A1', 'Aina Badminton', 'Badminton'),
  athlete('A2', 'Batrisyia Badminton', 'Badminton'),
  athlete('S1', 'Syazwani Swimmer', 'Swimming'),
];

const STAFF = [
  { email: 'med@isn.gov.my', role: 'medical', coachSport: null, notifyPrefs: null },
  { email: 'badminton@isn.gov.my', role: 'coach', coachSport: 'Badminton', notifyPrefs: null },
  { email: 'swim@isn.gov.my', role: 'coach', coachSport: 'Swimming', notifyPrefs: null },
];

function setup({ settings = {}, athletes = ROSTER, screenings = [], users = STAFF } = {}) {
  mockGetSettings.mockResolvedValue({ alerts_enabled: true, alert_on_band: 'amber', ...settings });
  Athlete.findAll.mockResolvedValue(athletes);
  // The real query orders assessedAt DESC, id DESC; the fixture must arrive in
  // that order or the "latest wins" assertion would be testing the fixture.
  Screening.findAll.mockResolvedValue(screenings);
  User.findAll.mockResolvedValue(users);
}

/** Every email sent, as { to, subject, text }. */
const sent = () => mockSendMail.mock.calls.map(([m]) => m);
const toAddresses = () => sent().map((m) => m.to).sort();
const bodyTo = (addr) => (sent().find((m) => m.to === addr) || {}).text || '';

beforeEach(() => {
  jest.clearAllMocks();
  mockSendMail.mockResolvedValue({ ok: true });
});

// ── the original routing suite, kept verbatim ───────────────────────────────
//
// These seven cases predate the alertMany coverage below and are BROADER on the
// pure function than the versions first written to replace them: two medical
// accounts rather than one, the 15-athlete regression asserted at this level,
// and a malformed-coach-row case covering null, {}, a blank email and a null
// sport. They were overwritten by accident and restored — a merge, not a
// rewrite, because losing an assertion to gain one is not coverage.
const item = (name, sport, band = 'amber') => ({
  athlete: { athleteId: name.toUpperCase(), name, sport },
  band,
  indicator: 40,
  escalations: 1,
  factors: [],
});

describe('alert grouping', () => {
  const MED = ['med1@isn.gov.my', 'med2@isn.gov.my'];
  const COACHES = [
    { email: 'badminton@isn.gov.my', coachSport: 'Badminton' },
    { email: 'swim@isn.gov.my', coachSport: 'Swimming' },
  ];

  it('gives every medical account one entry per flagged athlete', () => {
    const flagged = [item('a', 'Badminton'), item('b', 'Swimming'), item('c', 'Hockey')];
    const g = groupByRecipient(flagged, MED, COACHES);
    // ONE list per medical address, holding all three — not three separate sends.
    expect(g.get('med1@isn.gov.my')).toHaveLength(3);
    expect(g.get('med2@isn.gov.my')).toHaveLength(3);
  });

  it('gives a coach only their own sport', () => {
    const flagged = [item('a', 'Badminton'), item('b', 'Badminton'), item('c', 'Swimming')];
    const g = groupByRecipient(flagged, MED, COACHES);
    expect(g.get('badminton@isn.gov.my').map((i) => i.athlete.name)).toEqual(['a', 'b']);
    expect(g.get('swim@isn.gov.my').map((i) => i.athlete.name)).toEqual(['c']);
  });

  it('leaves out a coach whose sport nobody flagged', () => {
    const g = groupByRecipient([item('a', 'Hockey')], MED, COACHES);
    expect(g.has('badminton@isn.gov.my')).toBe(false);
    expect(g.has('swim@isn.gov.my')).toBe(false);
    // Medical still hear about it — an unassigned sport must not silence the alert.
    expect(g.get('med1@isn.gov.my')).toHaveLength(1);
  });

  it('produces one send per recipient, not one per athlete', () => {
    const flagged = Array.from({ length: 15 }, (_, i) => item(`ath${i}`, 'Badminton'));
    const g = groupByRecipient(flagged, MED, COACHES);
    // The regression this replaced: 15 athletes used to mean 15 sendMail calls.
    expect(g.size).toBe(3); // 2 medical + 1 badminton coach
    for (const items of g.values()) expect(items).toHaveLength(15);
  });

  it('never sends the same athlete to one recipient twice', () => {
    // A duplicated coach row must not double up the digest.
    const dupes = [...COACHES, { email: 'badminton@isn.gov.my', coachSport: 'Badminton' }];
    const g = groupByRecipient([item('a', 'Badminton')], [], dupes);
    expect(g.get('badminton@isn.gov.my')).toHaveLength(1);
  });

  it('skips blank addresses and malformed coach rows', () => {
    const g = groupByRecipient(
      [item('a', 'Badminton')],
      ['', null, 'med1@isn.gov.my'],
      [null, {}, { email: '', coachSport: 'Badminton' }, { email: 'x@y', coachSport: null }],
    );
    expect([...g.keys()]).toEqual(['med1@isn.gov.my']);
  });

  it('returns nothing when there is nobody to tell', () => {
    expect(groupByRecipient([item('a', 'Badminton')], [], []).size).toBe(0);
    expect(groupByRecipient([], MED, COACHES).size).toBe(0);
  });
});

describe('alertMany — the institution switch and the threshold', () => {
  it('sends nothing at all when alerts are disabled', async () => {
    setup({ settings: { alerts_enabled: false }, screenings: [screening('A1', 'red')] });
    const res = await alertMany(['A1']);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({ athleteId: 'A1', sent: false, reason: 'alerts disabled' });
  });

  it('does not alert on a band below the threshold', async () => {
    setup({ screenings: [screening('A1', 'green')] });
    const res = await alertMany(['A1']);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({ sent: false, reason: 'below alert threshold', band: 'green' });
  });

  it('honours a RAISED threshold — red-only does not alert on amber', async () => {
    // The setting is the institution's dial. An amber alert going out under a
    // red-only policy is the feature ignoring an explicit instruction.
    setup({ settings: { alert_on_band: 'red' }, screenings: [screening('A1', 'amber')] });
    await alertMany(['A1']);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('alerts at the threshold itself, not only above it', async () => {
    setup({ settings: { alert_on_band: 'amber' }, screenings: [screening('A1', 'amber')] });
    await alertMany(['A1']);
    expect(toAddresses()).toContain('med@isn.gov.my');
  });

  it('reads a CLINICIAN OVERRIDE, so the band emailed is the band shown', async () => {
    // effectiveBand(overrideBand || overallBand). A computed green that a
    // clinician overrode to red must alert; the inverse must not.
    setup({ screenings: [screening('A1', 'green', { overrideBand: 'red' })] });
    await alertMany(['A1']);
    expect(bodyTo('med@isn.gov.my')).toMatch(/Immediate assessment/i);

    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ ok: true });
    setup({ screenings: [screening('A2', 'red', { overrideBand: 'green' })] });
    await alertMany(['A2']);
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('alertMany — routing', () => {
  it('sends ONE email per recipient, not one per athlete', async () => {
    // The regression the batch form exists to prevent: 15 flagged athletes once
    // meant 15 emails into every medical inbox, which gets the alert filtered.
    setup({
      screenings: [screening('A1', 'red'), screening('A2', 'amber'), screening('S1', 'amber')],
    });
    await alertMany(['A1', 'A2', 'S1']);
    expect(toAddresses()).toEqual(['badminton@isn.gov.my', 'med@isn.gov.my', 'swim@isn.gov.my']);
    expect(sent()).toHaveLength(3);
  });

  it('never puts another sport\'s athlete in a coach\'s email', async () => {
    setup({ screenings: [screening('A1', 'red'), screening('S1', 'red')] });
    await alertMany(['A1', 'S1']);
    const badminton = bodyTo('badminton@isn.gov.my');
    expect(badminton).toContain('Aina Badminton');
    expect(badminton).not.toContain('Syazwani Swimmer');
    const swim = bodyTo('swim@isn.gov.my');
    expect(swim).toContain('Syazwani Swimmer');
    expect(swim).not.toContain('Aina Badminton');
  });

  it('reports sent:false with a reason when nobody is willing to receive', async () => {
    setup({ users: [], screenings: [screening('A1', 'red')] });
    const res = await alertMany(['A1']);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(res[0]).toMatchObject({ athleteId: 'A1', sent: false, reason: 'no recipients' });
  });

  it('honours a per-user opt-out on top of the institution setting', async () => {
    // Two gates in order: the institution decides whether AIRMS sends this kind
    // of mail at all, then the user decides if they still want it. An opt-out
    // that reads as consent is the failure utils/mailPrefs.js was written about.
    setup({
      users: [
        { email: 'med@isn.gov.my', role: 'medical', coachSport: null, notifyPrefs: { import_alerts: false } },
        STAFF[1],
      ],
      screenings: [screening('A1', 'red')],
    });
    await alertMany(['A1']);
    expect(toAddresses()).toEqual(['badminton@isn.gov.my']);
  });

  it('treats a null notifyPrefs as opted IN, so a new notification defaults on', async () => {
    setup({ screenings: [screening('A1', 'red')] });
    await alertMany(['A1']);
    expect(toAddresses()).toContain('med@isn.gov.my');
  });
});

describe('alertMany — what the email says', () => {
  it('puts the worst band first, so a red is not buried under ambers', async () => {
    setup({
      athletes: [athlete('A1', 'Amber One', 'Badminton'), athlete('A2', 'Red Two', 'Badminton')],
      screenings: [screening('A1', 'amber'), screening('A2', 'red')],
    });
    await alertMany(['A1', 'A2']);
    const body = bodyTo('med@isn.gov.my');
    expect(body.indexOf('Red Two')).toBeLessThan(body.indexOf('Amber One'));
  });

  it('names the athlete in the subject for a single finding, and counts for many', async () => {
    setup({ screenings: [screening('A1', 'red')] });
    await alertMany(['A1']);
    expect(sent()[0].subject).toContain('Aina Badminton');

    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ ok: true });
    setup({ screenings: [screening('A1', 'red'), screening('A2', 'amber')] });
    await alertMany(['A1', 'A2']);
    expect(sent().find((m) => m.to === 'med@isn.gov.my').subject).toMatch(/2 athletes flagged/);
  });

  it('surfaces the escalation factors, so the reader sees WHY without opening AIRMS', async () => {
    setup({ screenings: [screening('A1', 'red', { factors: ['Below cohort mean on stability', 'Knee outlier'] })] });
    await alertMany(['A1']);
    expect(bodyTo('med@isn.gov.my')).toContain('Below cohort mean on stability');
  });

  it('survives factors arriving as something other than an array', async () => {
    // `factors` is a JSON column; a null or a string must not throw mid-import.
    setup({ screenings: [screening('A1', 'red', { factors: null })] });
    await expect(alertMany(['A1'])).resolves.toBeDefined();
    expect(mockSendMail).toHaveBeenCalled();
  });
});

describe('alertMany — the rows it cannot act on', () => {
  it('reports an unknown athlete rather than throwing', async () => {
    setup({ screenings: [] });
    const res = await alertMany(['NOPE']);
    expect(res[0]).toMatchObject({ athleteId: 'NOPE', sent: false, reason: 'no athlete' });
  });

  it('reports an athlete with no screening', async () => {
    setup({ screenings: [] });
    expect((await alertMany(['A1']))[0]).toMatchObject({ sent: false, reason: 'no screening' });
  });

  it('uses the LATEST screening when an athlete has several', async () => {
    // The query orders newest first and the loop keeps the first per athlete.
    // Picking the older one would alert on a band the athlete has moved off.
    setup({
      screenings: [
        screening('A1', 'red', { assessedAt: '2026-02-01', id: 9 }),
        screening('A1', 'green', { assessedAt: '2026-01-01', id: 2 }),
      ],
    });
    const res = await alertMany(['A1']);
    expect(res.find((r) => r.athleteId === 'A1')).toMatchObject({ sent: true, band: 'red' });
  });

  it('de-duplicates the requested ids and returns [] for an empty request', async () => {
    setup({ screenings: [screening('A1', 'red')] });
    await alertMany(['A1', 'A1', 'A1']);
    expect(bodyTo('med@isn.gov.my').match(/Aina Badminton/g)).toHaveLength(1);
    expect(await alertMany([])).toEqual([]);
    expect(await alertMany([null, undefined])).toEqual([]);
  });
});
