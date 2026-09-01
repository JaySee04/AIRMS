// What a SCOPED role may learn — two silent failures, both measured live before
// they were fixed (2026-09-02).
//
//   1. A coach could tell a real IC number from an invented one, because the
//      sport check runs after the row is loaded and an unknown id answered 404
//      while a foreign one answered 403. permissions.js already reasons about
//      exactly this for the athlete role and refuses before the lookup; the
//      coach path could not, and so leaked what the athlete path protects.
//
//   2. The clinician's injury note, its author and its timestamp were on every
//      coach and executive payload, because both athlete serialisers build
//      their result by spreading the row — granting each column by omission.
//
// Neither shows up on screen: no coach or executive page renders a note, and
// a 404 where a 403 belongs looks like ordinary "not found". Both are the kind
// this repo tests for — a wrong answer that looks like a right one.
const fs = require('fs');
const path = require('path');
const {
  scopeHidesExistence, notFoundStatusFor,
  readsClinicianNotes, CLINICIAN_NOTE_FIELDS, NOTE_READER_ROLES,
} = require('../src/utils/permissions');
const { serializeAthlete, serializeAthleteList } = require('../src/utils/serialize');

const ROLES = ['athlete', 'medical', 'admin', 'coach', 'executive'];

const athleteRow = (over = {}) => ({
  athleteId: '890202021001',
  name: 'Test Athlete',
  sport: 'Badminton',
  program: 'PELAPIS',
  gender: 'Female',
  isInjured: true,
  injuryNote: 'Grade 2 hamstring strain, reassess in 3 weeks',
  injuryBy: 'Medical Demo 01',
  injuryAt: new Date('2026-08-01T00:00:00Z'),
  normExcluded: false,
  ...over,
});

describe('scopeHidesExistence', () => {
  it('hides existence from the two roles whose access is scoped', () => {
    expect(scopeHidesExistence({ role: 'coach' })).toBe(true);
    expect(scopeHidesExistence({ role: 'athlete' })).toBe(true);
  });

  it('does not hide it from the roles that may see the whole roster', () => {
    expect(scopeHidesExistence({ role: 'medical' })).toBe(false);
    expect(scopeHidesExistence({ role: 'admin' })).toBe(false);
    expect(scopeHidesExistence({ role: 'executive' })).toBe(false);
  });

  it('fails CLOSED with no user — an unauthenticated caller is told least', () => {
    expect(scopeHidesExistence(null)).toBe(true);
    expect(scopeHidesExistence(undefined)).toBe(true);
  });

  it('gives a coach the SAME status for an unknown id as for a foreign one', () => {
    // The whole point: 403 is also what the sport check returns, so the two
    // cases are indistinguishable from outside.
    expect(notFoundStatusFor({ role: 'coach' })).toBe(403);
    expect(notFoundStatusFor({ role: 'athlete' })).toBe(403);
  });

  it('still reports a genuine 404 to an unscoped role', () => {
    expect(notFoundStatusFor({ role: 'medical' })).toBe(404);
    expect(notFoundStatusFor({ role: 'admin' })).toBe(404);
    expect(notFoundStatusFor({ role: 'executive' })).toBe(404);
  });
});

describe('readsClinicianNotes', () => {
  it('is an allow-list of exactly medical and admin', () => {
    expect(NOTE_READER_ROLES.slice().sort()).toEqual(['admin', 'medical']);
    for (const role of ROLES) {
      expect(readsClinicianNotes({ role })).toBe(NOTE_READER_ROLES.includes(role));
    }
  });

  it('withholds when nobody is named — a forgetful call site under-discloses', () => {
    expect(readsClinicianNotes(undefined)).toBe(false);
    expect(readsClinicianNotes(null)).toBe(false);
  });
});

describe('the athlete serialisers withhold clinician notes', () => {
  it.each(['coach', 'executive', 'athlete'])('strips all three fields for %s', (role) => {
    const one = serializeAthlete(athleteRow(), { role });
    const many = serializeAthleteList([athleteRow()], { role })[0];
    for (const field of CLINICIAN_NOTE_FIELDS) {
      expect(one).not.toHaveProperty(field);
      expect(many).not.toHaveProperty(field);
    }
  });

  it.each(['medical', 'admin'])('keeps them for %s', (role) => {
    const one = serializeAthlete(athleteRow(), { role });
    const many = serializeAthleteList([athleteRow()], { role })[0];
    for (const field of CLINICIAN_NOTE_FIELDS) {
      expect(one).toHaveProperty(field);
      expect(many).toHaveProperty(field);
    }
    expect(one.injuryNote).toMatch(/hamstring/);
  });

  it('strips them when no viewer is passed at all', () => {
    const one = serializeAthlete(athleteRow());
    const many = serializeAthleteList([athleteRow()])[0];
    for (const field of CLINICIAN_NOTE_FIELDS) {
      expect(one).not.toHaveProperty(field);
      expect(many).not.toHaveProperty(field);
    }
  });

  it('keeps isInjured for everyone — it is a roster fact, not a note', () => {
    // A coach needs to know their athlete is flagged, and the institution's
    // coverage figures are built on it. Stripping it would be the opposite
    // mistake to the one being fixed.
    for (const role of ROLES) {
      expect(serializeAthlete(athleteRow(), { role }).isInjured).toBe(true);
      expect(serializeAthleteList([athleteRow()], { role })[0].isInjured).toBe(true);
    }
  });

  it('leaves the rest of the payload alone', () => {
    const coachView = serializeAthlete(athleteRow(), { role: 'coach' });
    expect(coachView.name).toBe('Test Athlete');
    expect(coachView.sport).toBe('Badminton');
    expect(coachView._id).toBe('890202021001');
    expect(coachView.risks).toBeDefined();
    expect(coachView.normExcluded).toBe(false);
  });

  it('does not mutate the caller\'s row', () => {
    const row = athleteRow();
    serializeAthlete(row, { role: 'coach' });
    expect(row.injuryNote).toMatch(/hamstring/);
  });
});

// ── WIRING ──────────────────────────────────────────────────────────────────
//
// The predicates above are pure, so they pass whether or not anything calls
// them — the winAnsiSafe failure mode, and the one that left
// isForeignAthleteRequest correct and unreachable for weeks. These read the
// route sources and assert the guards are actually installed.
describe('wiring — the guards must be REACHABLE', () => {
  const src = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', f), 'utf8');

  it.each([
    ['athletes.js', 'Athlete not found'],
    ['screeningReports.js', 'Athlete not found'],
    ['screenings.js', 'Screening not found'],
  ])('%s refuses a missing row through notFoundStatusFor', (file, message) => {
    const text = src(file);
    expect(text).toContain("notFoundStatusFor } = require('../utils/permissions')");
    // The scoped lookup itself. A bare 404 elsewhere in the same file is
    // correct — PATCH /:id/injury is medical-only, so nothing it looks up is
    // scoped — which is why this asserts the guarded form is PRESENT rather
    // than that no 404 survives anywhere.
    expect(text).toMatch(
      new RegExp(`res\\.status\\(notFoundStatusFor\\(req\\.user\\)\\)\\.json\\(\\{ message: '${message}' \\}\\)`),
    );
  });

  it('athletes.js tells the serialisers who is asking', () => {
    const text = src('athletes.js');
    // Every athlete serialisation must name a viewer; an un-viewed call would
    // silently withhold notes from the medical dashboard instead.
    const calls = text.match(/serializeAthlete(?:List)?\([^)]*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    for (const call of calls) {
      if (call.includes('require')) continue;
      expect(call).toContain('req.user');
    }
  });
});
