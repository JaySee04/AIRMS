// Did anybody act on the flags? (§103)
//
// Programme Activity measured whether the institution was SCREENING — coverage,
// throughput, recall, change, seasonality. It could not measure whether anybody
// RESPONDED. A programme that flags nine athletes for immediate assessment and
// assesses none of them looks, on every panel that existed, exactly like one
// that assessed all nine.
//
// That is this project's defect class at the level of the whole system: a
// screen that is confidently green about a question it is not asking.
//
// WHAT COUNTS AS OWED A RESPONSE. Only the LATEST screening per athlete, and
// only where it actually escalated. Two deliberate exclusions:
//
//   * green bands are not owed anything — "no indicators flagged" is not a
//     task, and counting them would drown the rate that matters;
//   * superseded screenings are not owed anything either. An athlete flagged in
//     May who was re-screened in September is a September question; leaving the
//     May row in the denominator would make the programme permanently look
//     behind on work that no longer exists.
//
// The band used is the EFFECTIVE one, overrides applied, so a clinician who
// overrode red to green has already answered — via a different audited act —
// and is not then also chased for a response.

const { effectiveBand } = require('./bands');
const { RESPONSE_OUTCOMES } = require('../shared/facts');
const { median } = require('./num');

/** Bands that constitute an escalation owed a clinical answer. */
const OWED_BANDS = new Set(['amber', 'red']);

/** Milliseconds in a day, for turning two timestamps into "days to respond". */
const DAY = 24 * 60 * 60 * 1000;

/**
 * Responsiveness across a set of LATEST screenings.
 *
 * @param {Array} latest one row per athlete — the current screening
 * @returns {{
 *   owed: number, answered: number, outstanding: number, rate: number|null,
 *   medianDaysToRespond: number|null, outcomes: Array, oldestOutstandingDays: number|null
 * }}
 */
function escalationResponse(latest = []) {
  const owed = [];
  for (const s of latest) {
    if (!s) continue;
    if (!OWED_BANDS.has(effectiveBand(s))) continue;
    owed.push(s);
  }

  const answered = owed.filter((s) => s.responseOutcome);
  const outstanding = owed.filter((s) => !s.responseOutcome);

  // Days from the screening being TAKEN to the response being recorded.
  //
  // Measured from assessedAt rather than from when the band was computed,
  // because that is the clinically meaningful clock: the athlete was screened on
  // a date, and the question is how long they waited. It also survives a
  // rescore — recomputing indicators must not silently improve this number.
  //
  // Negative spans are dropped rather than clamped to 0. A response recorded
  // BEFORE the screening it answers is a data problem (a back-dated import), and
  // folding it to zero would quietly flatter the median.
  const spans = [];
  for (const s of answered) {
    const from = new Date(s.assessedAt).getTime();
    const to = new Date(s.responseAt).getTime();
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const days = (to - from) / DAY;
    if (days >= 0) spans.push(days);
  }

  // How long the oldest unanswered escalation has been waiting — the number a
  // clinical lead actually acts on. A rate of 80% says nothing about whether
  // the missing 20% is a day old or five months old.
  const now = Date.now();
  let oldest = null;
  for (const s of outstanding) {
    const t = new Date(s.assessedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const days = (now - t) / DAY;
    if (oldest === null || days > oldest) oldest = days;
  }

  // The mix, in the SHARED order (least to most intervention) rather than by
  // count. Sorting by frequency would redraw the axis every time the data moved
  // and invite the reader to see a ranking where there is none.
  const counts = new Map(RESPONSE_OUTCOMES.map((o) => [o.key, 0]));
  for (const s of answered) {
    if (counts.has(s.responseOutcome)) counts.set(s.responseOutcome, counts.get(s.responseOutcome) + 1);
  }

  return {
    owed: owed.length,
    answered: answered.length,
    outstanding: outstanding.length,
    // null, not 0, when nothing was owed. A programme with no escalations has
    // no response rate — printing 0% would read as total failure when the
    // truthful answer is "nothing to answer". Same rule as §71's "not screened"
    // versus 0%.
    rate: owed.length ? answered.length / owed.length : null,
    medianDaysToRespond: spans.length ? Math.round(median(spans)) : null,
    oldestOutstandingDays: oldest === null ? null : Math.round(oldest),
    outcomes: RESPONSE_OUTCOMES.map((o) => ({
      key: o.key,
      label: o.label,
      count: counts.get(o.key) || 0,
    })),
  };
}

module.exports = { escalationResponse, OWED_BANDS };
