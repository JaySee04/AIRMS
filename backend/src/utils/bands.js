// One definition of the risk band vocabulary.
//
// These constants were duplicated: BAND_RANK stood in three files
// (alerts, cohorts, screeningPeriods) and BAND_LABEL in two (alerts,
// notifications). Identical today, and nothing stopped them drifting apart —
// which is the failure mode that matters rather than the repetition itself:
//   - a divergent BAND_RANK makes "worse than" disagree between the alert
//     threshold and the period comparison, so an athlete is flagged in one
//     place and not the other;
//   - a divergent BAND_LABEL makes two emails call the same band different
//     things, which is worse than either wording alone.
// Neither would raise an error. See docs/DESIGN_DECISIONS.md §19.

// Ordering for "worse than" comparisons. Higher = worse.
const BAND_RANK = { green: 0, amber: 1, red: 2 };

// Wording shown to humans. Deliberately Title Case, not caps: the earlier
// 'IMMEDIATE ASSESSMENT' read as shouting, was inconsistent with the
// dashboards, and is a spam-filter trigger in a subject line. Green has no
// entry because nothing notifies on a clear.
// GREEN IS NOT "SAFE". A screening test does not have the properties needed to
// predict injury, so it cannot certify the absence of it either — and because
// most athletes are low-risk, the green band is precisely where a false
// reassurance would land. The label therefore describes THE FINDING (nothing
// was flagged by this screening) rather than THE ATHLETE (who is safe).
// Green was previously absent from this map entirely, which is why
// utils/pdfDraw.js had grown its own full copy saying 'Safe'.
// See docs/DESIGN_DECISIONS.md §33.
const BAND_LABEL = {
  green: 'No indicators flagged',
  amber: 'Needs attention',
  red: 'Immediate assessment',
};

// The band that actually applies to a screening: a clinician's override wins
// over the computed band.
//
// This precedence is the one thing here that could be written BACKWARDS by
// accident — `overallBand || overrideBand` looks equally plausible and would
// silently ignore every clinical override — so new code should call this rather
// than inline the `||`.
function effectiveBand(screening) {
  if (!screening) return null;
  return screening.overrideBand || screening.overallBand || null;
}

// Is `band` at least as bad as `threshold`? Used by the alert gate.
function atLeastAsBad(band, threshold) {
  const b = BAND_RANK[band];
  const t = BAND_RANK[threshold];
  if (b === undefined || t === undefined) return false;
  return b >= t;
}

module.exports = { BAND_RANK, BAND_LABEL, effectiveBand, atLeastAsBad };
