// WHICH MUSCLES COME UP MOST OFTEN ACROSS A GROUP. One definition.
//
// This counting lived inline in routes/athletes.js as `topMuscles`, and the
// coach's squad view needs the same answer for one sport. Two copies of "rank
// the muscles by how many athletes carry the flag" would be two numbers for the
// same squad: the admin's Screening Analytics, the coach's squad map and the
// team PDF could each report a different top muscle for Badminton, with nothing
// to say which was right (SILENT_FAILURES "rules" 8).
//
// SIDES ARE MERGED ON PURPOSE, and that is a real decision rather than a
// simplification. At SQUAD level the question is "how many athletes have a
// gluteus medius problem", and an athlete flagged on both sides is one athlete
// with that problem, not two. The side is clinically load-bearing for an
// INDIVIDUAL — it is why the individual report prints `Gluteus medius L` and why
// the body map's own rule (paint the worse of L/R) is called out as discarding
// information — so this function deliberately answers the group question only.
// A caller that needs the side must read the per-athlete flags.
//
// COUNTED PER ATHLETE, NOT PER FLAG ROW. A report carrying the same muscle for
// left and right produces two rows, and counting rows would report 2 of 14
// athletes where the truth is 1 of 14 — a share that reads as twice the problem.
// The first version of this (inherited from the inline one) counted rows.

/**
 * Rank the muscles of one flag type by how many ATHLETES carry them.
 *
 * @param {Array<{athleteId?: string|number, flagType: string, muscle: string}>} flags
 * @param {'myodynamia'|'tension'} type
 * @param {number} limit  how many to return, ranked descending
 * @returns {Array<{muscle: string, count: number}>}
 *
 * `athleteId` is optional: callers that have already narrowed to one athlete's
 * flags have nothing to de-duplicate. When it is absent each row counts once,
 * which is the old behaviour and is correct for that case.
 */
function topFlaggedMuscles(flags, type, limit = 6) {
  const perMuscle = new Map();
  for (const f of flags || []) {
    if (!f || f.flagType !== type || !f.muscle) continue;
    if (!perMuscle.has(f.muscle)) perMuscle.set(f.muscle, new Set());
    // A row with no athleteId gets a unique key so it still counts once — using
    // a constant here would collapse every such row into one.
    perMuscle.get(f.muscle).add(f.athleteId ?? Symbol('row'));
  }
  return [...perMuscle.entries()]
    .map(([muscle, who]) => ({ muscle, count: who.size }))
    // Ties broken by NAME so the order is stable across requests. Without it two
    // muscles on the same count can swap places between page loads, which reads
    // as the squad changing when nothing has.
    .sort((a, b) => (b.count - a.count) || a.muscle.localeCompare(b.muscle))
    .slice(0, limit);
}

module.exports = { topFlaggedMuscles };
