// Turning "12 of 58" into something a non-statistician reads in one go.
//
// AIRMS already computes where an athlete sits in their comparison group, and
// showed it as a raw rank. A rank makes the reader do two jobs at once: hold
// both numbers, and work out which end is good. Percentile is the form every
// commercial screening report uses for the same quantity, because it answers
// "how many of my squad am I above" directly and survives a change of group
// size — 12 of 58 and 5 of 24 are the same standing and do not look it.
//
// The rank stays on screen next to it. A clinician comparing two athletes wants
// the ordinal; the athlete wants the percentile. Showing both costs one line.

/**
 * Mid-rank percentile: the share of the group at or below this athlete, using
 * the (r - 0.5) / n convention so the best and worst never read as a
 * meaningless 100th or 0th percentile.
 *
 * `rank` is 1-based with 1 = lowest, matching the backend's `cohortRank`.
 * Returns null when there is no group to be placed inside.
 */
export function percentileFromRank(rank?: number | null, size?: number | null): number | null {
  if (rank == null || size == null || size < 2) return null;
  if (rank < 1 || rank > size) return null;
  return Math.round(((rank - 0.5) / size) * 100);
}

/** 1st, 2nd, 3rd, 4th… — English ordinals, including the teens exception. */
export function ordinal(n: number): string {
  const abs = Math.abs(Math.round(n));
  const tens = abs % 100;
  if (tens >= 11 && tens <= 13) return `${abs}th`;
  switch (abs % 10) {
    case 1: return `${abs}st`;
    case 2: return `${abs}nd`;
    case 3: return `${abs}rd`;
    default: return `${abs}th`;
  }
}

/**
 * The whole phrase, or null when there is no comparison to make.
 * e.g. "21st percentile of their group" / "…of your group".
 */
export function percentilePhrase(
  rank?: number | null,
  size?: number | null,
  possessive = 'their',
): string | null {
  const p = percentileFromRank(rank, size);
  if (p === null) return null;
  return `${ordinal(p)} percentile of ${possessive} group`;
}
