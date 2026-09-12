// The six scores AIRMS tracks over time, with their orientation — AND THE ORDER
// THEY ARE READ IN.
//
// Extracted from screeningPeriods.js so utils/reliability.js can derive a dead
// band per score without the two files requiring each other in a cycle
// (screeningPeriods needs reliability's thresholds; reliability needs this
// list). One definition, imported by both.
//
// `higherBetter` is false for exercise risks alone — the only score here that
// improves by going DOWN, and the reason nothing in this codebase may infer
// direction from the sign of a delta.
//
// THE ORDER IS THE READING ORDER, and it is deliberate (2026-09-12, JC).
//
//   1-2. HoloMotion's two printed scores. §21 made Total Score the headline
//        BECAUSE it is the one figure a clinician can check against the PDF in
//        their hand, and "The two scores lead every dashboard" (§50) put it and
//        Exercise Risks at the top of the admin, medical and coach dashboards.
//        A change chart that buried Total Score in the middle of the list
//        contradicted the layout everywhere else in the app.
//   3-5. What Total Score is MADE of. On a real report Total Score is the mean
//        of the subitem table (§34), so ROM / Stability / Symmetry explain the
//        line above them rather than competing with it.
//     6. AIRMS's own derived, cohort-normed indicator — last precisely because
//        §21 demoted it from the headline: it is the score nobody can check
//        against anything, and it leads nothing.
//
// Consumers RENDER IN THIS ORDER and must not re-sort (see MetricDeltas in
// frontend/src/components/charts/Charts.tsx and changeBars in pdfDraw.js, both
// of which used to sort biggest-mover-first). The frontend keeps its own copies
// of this list because the LABELS are presentation and this file is not the
// authority on them (CLAUDE.md, "what is shared is FACTS, not presentation") —
// `tests/scoreOrder.test.js` pins the KEY order of every copy to this one, in
// every package.
//
// THE FIRST TWO ARE SPELLED AS HOLOMOTION PRINTS THEM. "Total Score" and
// "Exercise Risks" are proper nouns off the report, not descriptions AIRMS
// invented — the point of §21 is that a clinician can put the screen beside the
// PDF and check them, which reads worse when the screen renames them. This file
// said "Total score" / "Exercise risks" while 69 and 33 other places in the two
// packages said otherwise, and the two spellings met on adjacent admin pages.
// The derived indicator keeps sentence case because it IS ours and appears on no
// printed report.
const PERIOD_SCORES = [
  ['totalScore', 'Total Score', true],
  ['exerciseRisks', 'Exercise Risks', false],
  ['rom', 'ROM', true],
  ['stability', 'Stability', true],
  ['symmetry', 'Symmetry', true],
  ['overallIndicator', 'Overall indicator', true],
];

module.exports = { PERIOD_SCORES };
