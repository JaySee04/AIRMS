// Turning a squad aggregate into the two props BodyMap reads. One definition.
//
// The admin's Screening Analytics and the coach's Sport/Squad view both feed the
// SAME figure from the SAME server-side aggregate, and until now each reshaped it
// with its own pair of `useMemo`s — identical logic, two copies, written five
// weeks apart (§124 added the coach's). That is the drift this codebase keeps
// paying for: not the duplication itself, but that one copy can be "simplified"
// and the two figures then disagree about one squad with nothing to say which is
// right (SILENT_FAILURES "rules" 8).
//
// Pure functions rather than a hook, deliberately. Each caller still owns its own
// `useMemo` and its own dependency array — the admin's input is `cohort`, the
// coach's is `data.squad`, and a hook would have to take both or guess. What is
// shared is the TRANSFORM, which is the part that could drift.

import type { MuscleEntry } from '@/components/dashboard/BodyMap';

/** A ranked hotspot row, as both aggregates emit it. */
export interface Hotspot { muscle: string; count: number }

/** The squad subitem matrix, as utils/subitemAggregate.js emits it. */
export interface SquadMatrix {
  matrix?: Array<{ key: string; cells: Array<{ key: string; value: number | null }> }>;
}

/**
 * Muscle flags for the squad figure.
 *
 * SIDE 'B' ON EVERY ENTRY, and that is not laziness. `utils/muscleHotspots.js`
 * merges left and right at group level on purpose — "how many athletes have a
 * gluteus medius problem" is one athlete per athlete, not one per side — so the
 * count carries no side and the figure must not invent one. The per-muscle
 * magnitude lives in the hotspot list beside the figure, and since §129 hovering
 * or focusing a row there lights the muscle here.
 */
export function squadFlags(
  myodynamia: Hotspot[] | undefined,
  tension: Hotspot[] | undefined,
): { myodynamia: MuscleEntry[]; tension: MuscleEntry[] } {
  const asEntries = (rows: Hotspot[] | undefined): MuscleEntry[] => (rows ?? [])
    .map((m) => ({ muscle: m.muscle, side: 'B' as const }));
  return { myodynamia: asEntries(myodynamia), tension: asEntries(tension) };
}

/**
 * The squad's mean subitem table, in the per-athlete shape BodyMap already reads.
 *
 * Returns null when there is no matrix, which is what makes the ROM/Stability mode
 * absent rather than empty — a figure drawn from no readings would paint every
 * region at one end of the scale, and an unknown value must stay unknown (§54).
 */
export function squadSubitems(aggregate: SquadMatrix | null | undefined) {
  const matrix = aggregate?.matrix;
  if (!matrix?.length) return null;
  const out: Record<string, Record<string, number | null>> = {};
  for (const row of matrix) {
    out[row.key] = Object.fromEntries(row.cells.map((c) => [c.key, c.value]));
  }
  // The cast is the one the two call sites already carried: BodyMap's `Subitems`
  // is a named shape and this is built from a server aggregate keyed the same way.
  // Kept in ONE place now rather than two, which is most of the point.
  return out as never;
}
