// Squad readiness: how a set of screening bands becomes the coach's headline
// percentages.
//
// Extracted from the coach dashboard on 2026-09-02, for the reason this project
// already applies to route handlers — logic inside a component is logic nobody
// tests. It matters here because this exact arithmetic was wrong: the three band
// tiles were denominated over the WHOLE squad while two of sixteen athletes had
// no screening at all, so they summed to 88% and the stacked bar stopped short
// of its track, reading as a rendering artefact rather than as two missing
// people (DESIGN_DECISIONS §44).
//
// The rule that fixes it, and the one this module exists to hold:
//
//   A BAND IS A CLAIM ABOUT A SCREENING. An athlete without one is not "not
//   cleared" — they are unknown. So they are counted OUT of the percentages and
//   reported separately, because what they need is a first assessment, not a
//   review.

/** The coach-facing readiness bands, worst first. */
export type ReadinessBand = 'full' | 'observation' | 'restricted';

export const READINESS_BANDS: ReadinessBand[] = ['full', 'observation', 'restricted'];

/**
 * The HoloMotion band as the coach's readiness vocabulary.
 * `null` means no screening — deliberately not a band.
 */
export function bandFor(effectiveBand?: 'green' | 'amber' | 'red' | null): ReadinessBand | null {
  if (effectiveBand === 'green') return 'full';
  if (effectiveBand === 'amber') return 'observation';
  if (effectiveBand === 'red') return 'restricted';
  return null;
}

export interface ReadinessCounts {
  full: number;
  observation: number;
  restricted: number;
  /** Athletes with no screening. Never folded into the bands. */
  unscored: number;
}

export function readinessCounts(bands: Array<ReadinessBand | null>): ReadinessCounts {
  const c: ReadinessCounts = { full: 0, observation: 0, restricted: 0, unscored: 0 };
  bands.forEach((b) => { if (b) c[b] += 1; else c.unscored += 1; });
  return c;
}

export interface ReadinessBreakdown {
  counts: ReadinessCounts;
  /** How many have a screening — the denominator for every percentage below. */
  scored: number;
  /** Everyone in the filtered squad, scored or not. */
  total: number;
  /** Percentage of SCORED athletes in each band. */
  share: Record<ReadinessBand, number>;
}

/**
 * The full breakdown, with the percentages taken over SCORED athletes.
 *
 * Each share is rounded HONESTLY and independently, so they can sum to 99 or
 * 101. The first version of this function nudged the largest band to force
 * exactly 100 — and that was the wrong trade. Nine of fourteen is 64%, and
 * printing 65% to tidy a total makes the tile disagree with the "9 athletes"
 * printed directly beneath it, where a reader can check. A one-point sliver on
 * a stacked bar is a cosmetic rounding artefact; a percentage that does not
 * match its own count is the kind of small wrongness this codebase keeps
 * finding.
 *
 * That is a different fault from the one this module was extracted for. The bug
 * was a wrong DENOMINATOR — three tiles over the whole squad while two athletes
 * had no screening, summing to 88% and hiding two people. Twelve points of
 * missing athletes and one point of rounding are not the same thing.
 */
export function readinessBreakdown(bands: Array<ReadinessBand | null>): ReadinessBreakdown {
  const counts = readinessCounts(bands);
  const scored = counts.full + counts.observation + counts.restricted;
  const total = scored + counts.unscored;

  const share: Record<ReadinessBand, number> = { full: 0, observation: 0, restricted: 0 };
  if (scored > 0) {
    READINESS_BANDS.forEach((b) => { share[b] = Math.round((counts[b] / scored) * 100); });
  }
  return { counts, scored, total, share };
}
