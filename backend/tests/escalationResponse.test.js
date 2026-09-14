// Whether anybody ACTED on the flags (§103).
//
// The failure this guards is the one the feature exists to remove: a programme
// that flags nine athletes for immediate assessment and assesses none of them
// must not produce the same numbers as one that assessed all nine.

const { escalationResponse } = require('../src/utils/escalationResponse');
const { RESPONSE_OUTCOME_KEYS, RESPONSE_OUTCOMES } = require('../src/shared/facts');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const ago = (d) => new Date(now - d * DAY);

const row = (over = {}) => ({
  athleteId: 'a', assessedAt: ago(30), overallBand: 'red',
  responseOutcome: null, responseAt: null, ...over,
});

describe('what is OWED a response', () => {
  it('counts amber and red', () => {
    const r = escalationResponse([row({ overallBand: 'red' }), row({ overallBand: 'amber' })]);
    expect(r.owed).toBe(2);
  });

  it('does NOT count green', () => {
    // "No indicators flagged" is not a task. Counting it would drown the rate
    // that matters — most athletes are green (§33).
    expect(escalationResponse([row({ overallBand: 'green' })]).owed).toBe(0);
  });

  it('does NOT count a band a clinician overrode down to green', () => {
    // Already answered, through a different audited act. Chasing a response as
    // well would ask the clinician to record the same decision twice.
    const r = escalationResponse([row({ overallBand: 'red', overrideBand: 'green' })]);
    expect(r.owed).toBe(0);
  });

  it('DOES count a band a clinician overrode UP to red', () => {
    // The override is the escalation here. Reading overallBand instead of the
    // effective one would miss every clinician-raised flag.
    const r = escalationResponse([row({ overallBand: 'green', overrideBand: 'red' })]);
    expect(r.owed).toBe(1);
  });
});

describe('the rate', () => {
  it('is null, never 0, when nothing was owed', () => {
    // A programme with no escalations has no response rate. 0% reads as total
    // failure where the truthful answer is "nothing to answer" — the same rule
    // §71 applies to a quarter with no screening.
    const r = escalationResponse([row({ overallBand: 'green' })]);
    expect(r.rate).toBeNull();
    expect(r.owed).toBe(0);
  });

  it('separates answered from outstanding', () => {
    const r = escalationResponse([
      row({ athleteId: 'a', responseOutcome: 'treating', responseAt: ago(28) }),
      row({ athleteId: 'b' }),
      row({ athleteId: 'c' }),
    ]);
    expect(r).toMatchObject({ owed: 3, answered: 1, outstanding: 2 });
    expect(r.rate).toBeCloseTo(1 / 3);
  });

  it('is 1 when every escalation has been answered', () => {
    const r = escalationResponse([row({ responseOutcome: 'assessed-none', responseAt: ago(29) })]);
    expect(r.rate).toBe(1);
    expect(r.outstanding).toBe(0);
  });
});

describe('time to respond', () => {
  it('measures from the SCREENING date, not from when it was scored', () => {
    // The clinically meaningful clock is how long the athlete waited. It also
    // survives a rescore — recomputing indicators must not silently improve it.
    const r = escalationResponse([row({ assessedAt: ago(40), responseOutcome: 'treating', responseAt: ago(30) })]);
    expect(r.medianDaysToRespond).toBe(10);
  });

  it('drops a response recorded BEFORE its screening rather than clamping to 0', () => {
    // A back-dated import can produce this. Folding it to zero would flatter
    // the median with a number that describes a data fault, not a clinician.
    const r = escalationResponse([
      row({ athleteId: 'a', assessedAt: ago(10), responseOutcome: 'treating', responseAt: ago(20) }),
      row({ athleteId: 'b', assessedAt: ago(30), responseOutcome: 'treating', responseAt: ago(26) }),
    ]);
    expect(r.medianDaysToRespond).toBe(4);
  });

  it('is null when nothing has been answered', () => {
    expect(escalationResponse([row()]).medianDaysToRespond).toBeNull();
  });
});

describe('the oldest outstanding escalation', () => {
  it('reports how long the longest-waiting flag has been unanswered', () => {
    // A rate of 80% says nothing about whether the missing fifth is a day old
    // or five months old. This is the number a clinical lead acts on.
    const r = escalationResponse([
      row({ athleteId: 'a', assessedAt: ago(5) }),
      row({ athleteId: 'b', assessedAt: ago(120) }),
      row({ athleteId: 'c', assessedAt: ago(200), responseOutcome: 'referred', responseAt: ago(199) }),
    ]);
    expect(r.oldestOutstandingDays).toBe(120);
  });

  it('is null when nothing is waiting', () => {
    const r = escalationResponse([row({ responseOutcome: 'monitoring', responseAt: ago(29) })]);
    expect(r.oldestOutstandingDays).toBeNull();
  });
});

describe('the outcome mix', () => {
  it('reports every outcome, including the ones nobody chose', () => {
    // A missing row and a zero row are different facts. Omitting the zeroes
    // would make "nobody was referred on" indistinguishable from "referral is
    // not an option here".
    const r = escalationResponse([row({ responseOutcome: 'treating', responseAt: ago(29) })]);
    expect(r.outcomes.map((o) => o.key)).toEqual(RESPONSE_OUTCOME_KEYS);
    expect(r.outcomes.find((o) => o.key === 'treating').count).toBe(1);
    expect(r.outcomes.find((o) => o.key === 'referred').count).toBe(0);
  });

  it('keeps the SHARED order — least to most intervention — not frequency', () => {
    // Sorting by count would redraw the axis whenever the data moved, and
    // invite the reader to see a ranking where there is none.
    const r = escalationResponse([
      row({ athleteId: 'a', responseOutcome: 'referred', responseAt: ago(29) }),
      row({ athleteId: 'b', responseOutcome: 'referred', responseAt: ago(29) }),
      row({ athleteId: 'c', responseOutcome: 'assessed-none', responseAt: ago(29) }),
    ]);
    expect(r.outcomes.map((o) => o.key)).toEqual(RESPONSE_OUTCOMES.map((o) => o.key));
    expect(r.outcomes[0].count).toBe(1);
    expect(r.outcomes[3].count).toBe(2);
  });

  it('ignores an outcome the shared list does not know', () => {
    // A value written by an older build must not invent a category here.
    const r = escalationResponse([row({ responseOutcome: 'made-up', responseAt: ago(29) })]);
    expect(r.answered).toBe(1);
    expect(r.outcomes.reduce((n, o) => n + o.count, 0)).toBe(0);
  });
});

describe('degenerate input', () => {
  it('survives an empty list', () => {
    expect(escalationResponse([])).toMatchObject({ owed: 0, answered: 0, rate: null });
  });

  it('survives null rows and an unparseable date', () => {
    // A dashboard KPI must never be the reason a page fails to load.
    const r = escalationResponse([null, undefined, row({ assessedAt: 'not-a-date' })]);
    expect(r.owed).toBe(1);
    expect(r.oldestOutstandingDays).toBeNull();
  });
});
