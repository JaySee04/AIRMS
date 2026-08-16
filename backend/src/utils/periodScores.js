// The six scores AIRMS tracks over time, with their orientation.
//
// Extracted from screeningPeriods.js so utils/reliability.js can derive a dead
// band per score without the two files requiring each other in a cycle
// (screeningPeriods needs reliability's thresholds; reliability needs this
// list). One definition, imported by both.
//
// `higherBetter` is false for exercise risks alone — the only score here that
// improves by going DOWN, and the reason nothing in this codebase may infer
// direction from the sign of a delta.
const PERIOD_SCORES = [
  ['overallIndicator', 'Overall indicator', true],
  ['totalScore', 'Total score', true],
  ['rom', 'ROM', true],
  ['stability', 'Stability', true],
  ['symmetry', 'Symmetry', true],
  ['exerciseRisks', 'Exercise risks', false],
];

module.exports = { PERIOD_SCORES };
