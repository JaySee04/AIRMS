// One shape for "the screening indicator" as the dashboards read it.
//
// This object was built by hand in three places — routes/athletes.js,
// routes/coach.js and routes/screenings.js — each listing the same fields. They
// had already drifted once: the coach payload was silently dropping the clinician
// override, so a coach saw the generic band message where the override card had
// promised them the clinician's note. Nothing errored; the coach just got worse
// information than the other two roles.
//
// Adding the cohort-comparison fields (2026-08-11) meant editing all three again,
// which is the moment to stop. §19.

const { effectiveBand } = require('./bands');
const { screeningAgeDays, recallState } = require('./recall');

// The columns the payload needs. Deliberately NOT `*`: it keeps the big JSON/TEXT
// columns (muscle_flags, summary_text) and the 12 raw scores off the wire for the
// roster query, which fetches one of these per athlete.
const INDICATOR_ATTRS = [
  'id', 'assessedAt', 'totalScore', 'overallIndicator', 'overallBand', 'escalations',
  'factors', 'reasonsAgainst', 'cohortZ', 'cohortRank', 'cohortSize', 'cohortLabel', 'cohortDeltas',
  'subitems', 'overrideBand', 'overrideNote', 'overrideBy', 'overrideAt',
];

const arr = (v) => (Array.isArray(v) ? v : []);
const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

// Shape one Screening row into the indicator payload.
// `dueDays` is the institution's rescreen interval (settings.rescreen_due_days).
// Passed in rather than read here so this module stays sync and DB-free; when a
// caller omits it the age is still reported and the state falls back to null,
// which the UI renders as "no interval set" rather than inventing one.
function toIndicator(s, dueDays = null) {
  if (!s) return null;
  const ageDays = screeningAgeDays(s.assessedAt);
  return {
    screeningId: s.id,
    assessedAt: s.assessedAt,
    // The HoloMotion headline as printed on the report — the hero shows this as
    // its primary number, so it has to travel with the indicator rather than
    // being read off the flat athlete row (which a HISTORICAL screening does not
    // update).
    totalScore: numOrNull(s.totalScore),
    overallIndicator: s.overallIndicator,
    overallBand: s.overallBand,
    escalations: s.escalations,
    // Two-sided evidence: why assess, and why not.
    factors: arr(s.factors),
    reasonsAgainst: arr(s.reasonsAgainst),
    // The comparison the band came from.
    cohortZ: numOrNull(s.cohortZ),
    cohortRank: s.cohortRank ?? null,
    cohortSize: s.cohortSize ?? null,
    cohortLabel: s.cohortLabel ?? null,
    cohortDeltas: arr(s.cohortDeltas),
    subitems: s.subitems || null,
    overrideBand: s.overrideBand,
    overrideNote: s.overrideNote,
    overrideBy: s.overrideBy,
    overrideAt: s.overrideAt,
    // HOW OLD the reading is, and whether it is still current. The band is
    // rendered in the present tense, so without this an eight-month-old screening
    // presents exactly like one taken last week. Classified by the same function
    // the monthly recall email uses, so the two cannot disagree.
    screeningAgeDays: ageDays,
    recallState: dueDays === null ? null : recallState(ageDays, dueDays),
    // The band clinicians/coaches act on: an override wins until the next import.
    effectiveBand: effectiveBand(s),
  };
}

module.exports = { INDICATOR_ATTRS, toIndicator };
