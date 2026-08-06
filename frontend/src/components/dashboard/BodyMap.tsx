'use client';

import { useMemo, useState } from 'react';
import { bodyFront } from './bodymap-data/bodyFront';
import { bodyBack } from './bodymap-data/bodyBack';
import { FRONT_OUTLINE, BACK_OUTLINE } from './bodymap-data/outlines';
import {
  muscleFront, muscleBack, INERT_FRONT, INERT_BACK, RENDERABLE_MUSCLES, MUSCLE_ALIASES,
} from './bodymap-data/muscles';
import type { BodyPart } from './bodymap-data/types';
import type { Subitems, SubitemRow } from './OverallRiskBadge';
import SubitemTable from './SubitemTable';
import {
  TIER_LABEL, TIER_ORDER, TIER_RANGE, TIER_RANK, tierOf, type TierState,
} from '@/lib/holomotionTiers';

export type MuscleSide = 'L' | 'R' | 'B';
export interface MuscleEntry {
  muscle: string;
  side: MuscleSide;
}

interface BodyMapProps {
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  // Physical Fitness Subitem Score (ROM/Stability per region) — optional so
  // callers that genuinely have no screening yet still render the flags-only
  // figure unchanged. When present, a mode toggle appears letting the same
  // "muscle hero" figure be read either as muscle flags or as ROM/Stability.
  subitems?: Subitems | null;
}

type FlagState = 'weak' | 'tight' | 'both';
type FlagMap = Record<string, MuscleSide>;
type ViewMode = 'flags' | 'subitems';

// HoloMotion muscle name → the slug the figure draws it under.
//
// This used to collapse the report's 22 muscles onto ~15 workout regions from
// the source atlas, which merged clinically distinct findings: every glute
// muscle (maximus, medius, minimus, piriformis) landed on one "gluteal" shape,
// so "piriformis weak WHILE gluteus maximus tight" — a textbook deep-stabiliser
// compensation pattern — rendered as a single undifferentiated blob.
//
// The figure is now partitioned to the HoloMotion vocabulary itself
// (bodymap-data/muscles.ts), so the mapping is the identity for every muscle
// the asset can draw. The only remaining collapse is Middle → Lateral Deltoid,
// which is not a loss of information: HoloMotion names both, but they are the
// same anatomical head.
function slugForMuscle(muscle: string): string | undefined {
  const resolved = MUSCLE_ALIASES[muscle] ?? muscle;
  return RENDERABLE_MUSCLES.has(resolved) ? resolved : undefined;
}

// Slugs that take colour + hover in FLAGS mode. Everything else (head, hands,
// feet, forearm, calves …) draws as inert silhouette so the figure still reads
// as a body. SUBITEMS mode uses a different, broader scope — see below.
const SCOPED_SLUGS: Set<string> = RENDERABLE_MUSCLES;

// The Physical Fitness Subitem Score covers the WHOLE body at a coarser
// grain than the muscle flags do (5 regions vs 22 named muscles), so this is
// a SEPARATE, broader mapping — library slug → which of the report's 5
// regions it belongs to. Deliberately covers everything the flags scope
// doesn't (hands, feet, knees, calves, etc.) so switching to ROM/Stability
// mode reads as a full-body assessment rather than the same narrow cutout.
// Only "head" and "hair" stay inert — HoloMotion has no subitem for either.
type SubitemRegionKey = keyof Subitems;
const SUBITEM_REGION_LABEL: Record<SubitemRegionKey, string> = {
  neck: 'Neck',
  shoulder: 'Shoulder & Upper Limbs',
  torso: 'Torso',
  pelvis: 'Pelvis',
  lowerLimbs: 'Lower Limbs',
};
const SUBITEM_REGION_SLUGS: Record<SubitemRegionKey, string[]> = {
  neck: ['neck'],
  shoulder: ['trapezius', 'deltoids', 'biceps', 'triceps', 'forearm', 'hands'],
  torso: ['chest', 'abs', 'obliques', 'upper-back', 'lower-back'],
  pelvis: ['adductors', 'gluteal'],
  lowerLimbs: ['quadriceps', 'hamstring', 'knees', 'tibialis', 'calves', 'ankles', 'feet'],
};
const SLUG_TO_SUBITEM_REGION: Record<string, SubitemRegionKey> = Object.fromEntries(
  (Object.entries(SUBITEM_REGION_SLUGS) as Array<[SubitemRegionKey, string[]]>)
    .flatMap(([region, slugs]) => slugs.map((slug) => [slug, region])),
);
const SUBITEM_SCOPED_SLUGS: Set<string> = new Set(Object.keys(SLUG_TO_SUBITEM_REGION));

// Boundaries, ranks and wording from lib/holomotionTiers.ts; the fills come
// from the .excellent/.good/.average/.below classes, same four tokens.
const subitemTierOf = tierOf;

function buildFlagMap(entries: MuscleEntry[]): FlagMap {
  const out: FlagMap = {};
  entries.forEach(({ muscle, side }) => {
    const existing = out[muscle];
    if (!existing) out[muscle] = side;
    else if (existing !== side) out[muscle] = 'B';
  });
  return out;
}

// Aggregate AIRMS muscle-level flags up to library slugs, per side.
// Returns a map of "slug:L"/"slug:R" → flag state.
function aggregateBySlug(
  myo: FlagMap,
  ten: FlagMap,
): Map<string, FlagState> {
  const result = new Map<string, FlagState>();

  const ensureSide = (slug: string, side: 'L' | 'R', kind: 'weak' | 'tight') => {
    const key = `${slug}:${side}`;
    const current = result.get(key);
    if (!current) result.set(key, kind);
    else if (current !== kind) result.set(key, 'both');
  };

  const apply = (flags: FlagMap, kind: 'weak' | 'tight') => {
    Object.entries(flags).forEach(([muscle, side]) => {
      const slug = slugForMuscle(muscle);
      if (!slug) return;
      if (side === 'L' || side === 'B') ensureSide(slug, 'L', kind);
      if (side === 'R' || side === 'B') ensureSide(slug, 'R', kind);
    });
  };

  apply(myo, 'weak');
  apply(ten, 'tight');
  return result;
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

// Region-side tier = the WORSE (lower-scoring) of that region's ROM and
// Stability reading on that side — mirrors how a single figure region can
// only carry one colour. The exact pair is still in the tooltip and in the
// SubitemTable rendered below the figure in this mode.
function worstTier(row: SubitemRow | undefined, side: 'L' | 'R'): TierState | null {
  if (!row) return null;
  const rom = numOrNull(side === 'L' ? row.romL : row.romR);
  const stab = numOrNull(side === 'L' ? row.stabL : row.stabR);
  const vals = [rom, stab].filter((v): v is number => v !== null);
  if (!vals.length) return null;
  return subitemTierOf(Math.min(...vals));
}

// Aggregate the 5 subitem regions down to library slugs, per side — the
// SUBITEM counterpart of aggregateBySlug above. Every slug in a region gets
// that region's tier (the data doesn't distinguish deltoids from biceps —
// "Shoulder & Upper Limbs" is one score).
function aggregateSubitemsBySlug(subitems: Subitems | null | undefined): Map<string, TierState> {
  const result = new Map<string, TierState>();
  if (!subitems) return result;
  (Object.entries(SUBITEM_REGION_SLUGS) as Array<[SubitemRegionKey, string[]]>).forEach(([region, slugs]) => {
    const row = subitems[region];
    (['L', 'R'] as const).forEach((side) => {
      const t = worstTier(row, side);
      if (t === null) return;
      slugs.forEach((slug) => result.set(`${slug}:${side}`, t));
    });
  });
  return result;
}

// Hover text for one muscle-side. The figure now draws the muscle itself, so
// this is normally a single line naming it; the alias pair (Middle/Lateral
// Deltoid) is the one case that can contribute two.
function tooltipForSlug(slug: string, side: 'L' | 'R', myo: FlagMap, ten: FlagMap): string {
  const reverseList = [slug, ...Object.keys(MUSCLE_ALIASES).filter((m) => MUSCLE_ALIASES[m] === slug)];
  const matches: string[] = [];
  reverseList.forEach((muscle) => {
    const myoFlag = myo[muscle];
    const tenFlag = ten[muscle];
    const sideMatches = (f?: MuscleSide) => f === 'B' || f === side;
    if (sideMatches(myoFlag) && sideMatches(tenFlag)) matches.push(`${muscle} — weak + tight`);
    else if (sideMatches(myoFlag)) matches.push(`${muscle} — weak`);
    else if (sideMatches(tenFlag)) matches.push(`${muscle} — tight`);
  });
  return matches.length ? matches.join('\n') : slug;
}

function tooltipForSubitemSlug(slug: string, side: 'L' | 'R', subitems: Subitems | null | undefined): string {
  const region = SLUG_TO_SUBITEM_REGION[slug];
  if (!region || !subitems) return slug;
  const row = subitems[region];
  if (!row) return SUBITEM_REGION_LABEL[region];
  const rom = numOrNull(side === 'L' ? row.romL : row.romR);
  const stab = numOrNull(side === 'L' ? row.stabL : row.stabR);
  const lines = [`${SUBITEM_REGION_LABEL[region]} (${side === 'L' ? 'Left' : 'Right'})`];
  lines.push(rom === null ? 'ROM — no data' : `ROM ${rom} — ${TIER_LABEL[subitemTierOf(rom)]}`);
  lines.push(stab === null ? 'Stability — no data' : `Stability ${stab} — ${TIER_LABEL[subitemTierOf(stab)]}`);
  return lines.join('\n');
}

function sideText(c: MuscleSide): string {
  return c === 'L' ? 'Left' : c === 'R' ? 'Right' : 'Both';
}

function classForState(state?: string): string {
  const base = 'bodymap-region';
  if (!state) return base;
  return `${base} ${base}--${state}`;
}

function groupClassForState(state?: string): string {
  const base = 'bodymap-region-group';
  if (!state) return base;
  return `${base} ${base}--${state}`;
}

function mergeFlagState(a?: FlagState, b?: FlagState): FlagState | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return 'both';
}

// For a centre-drawn (unmirrored) region, show the worse of its two sides —
// unlike flag states, tiers are ordered, so "worse" is well-defined rather
// than collapsing to a catch-all bucket.
function mergeTierState(a?: TierState, b?: TierState): TierState | undefined {
  if (!a) return b;
  if (!b) return a;
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

function renderParts(
  data: BodyPart[],
  states: Map<string, string>,
  inScopeSlugs: Set<string>,
  tooltipFor: (slug: string, side: 'L' | 'R') => string,
  merge: (a?: string, b?: string) => string | undefined,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  data.forEach((part) => {
    const inScope = inScopeSlugs.has(part.slug);

    const renderSide = (paths: string[] | undefined, sideTag: 'L' | 'R' | 'C') => {
      if (!paths) return;
      const key = sideTag === 'C' ? `${part.slug}:L` : `${part.slug}:${sideTag}`;
      const otherKey = sideTag === 'C' ? `${part.slug}:R` : null;
      const state = inScope
        ? otherKey
          ? merge(states.get(key), states.get(otherKey))
          : states.get(key)
        : undefined;

      if (!inScope) {
        // Inert: just render the paths, no group wrapper, no tooltip, no hover.
        paths.forEach((d, i) => {
          out.push(
            <path
              key={`${part.slug}-${sideTag}-${i}-inert`}
              className="bodymap-region bodymap-region--inert"
              d={d}
            />,
          );
        });
        return;
      }

      const title = sideTag === 'C' ? part.slug : tooltipFor(part.slug, sideTag);
      out.push(
        <g
          key={`${part.slug}-${sideTag}-group`}
          className={groupClassForState(state)}
          data-slug={part.slug}
          data-side={sideTag}
        >
          <title>{title}</title>
          {paths.map((d, i) => (
            <path
              key={i}
              className={classForState(state)}
              d={d}
            />
          ))}
        </g>,
      );
    };
    renderSide(part.path.common, 'C');
    renderSide(part.path.left, 'L');
    renderSide(part.path.right, 'R');
  });
  return out;
}

export default function BodyMap({ myodynamia, tension, subitems }: BodyMapProps) {
  const myo = useMemo(() => buildFlagMap(myodynamia), [myodynamia]);
  const ten = useMemo(() => buildFlagMap(tension), [tension]);
  const slugFlags = useMemo(() => aggregateBySlug(myo, ten), [myo, ten]);
  const slugTiers = useMemo(() => aggregateSubitemsBySlug(subitems), [subitems]);

  const hasSubitems = useMemo(
    () => Object.values(subitems ?? {}).some(
      (row) => row && Object.values(row).some((v) => v !== null && v !== undefined),
    ),
    [subitems],
  );

  const [mode, setMode] = useState<ViewMode>('flags');
  const activeMode: ViewMode = mode === 'subitems' && !hasSubitems ? 'flags' : mode;

  const total = Object.keys(myo).length + Object.keys(ten).length;
  const belowCount = useMemo(() => {
    let n = 0;
    (Object.keys(SUBITEM_REGION_SLUGS) as SubitemRegionKey[]).forEach((region) => {
      (['L', 'R'] as const).forEach((side) => {
        if (worstTier(subitems?.[region], side) === 'below') n += 1;
      });
    });
    return n;
  }, [subitems]);

  const myoEntries = Object.entries(myo) as Array<[string, MuscleSide]>;
  const tenEntries = Object.entries(ten) as Array<[string, MuscleSide]>;
  const compEntries = myoEntries
    .filter(([k]) => ten[k])
    .map(([k]) => ({ name: k, weak: myo[k], tight: ten[k] }));

  const parts =
    activeMode === 'flags'
      ? {
          // Muscle-level geometry: the report names individual muscles, so the
          // figure draws individual muscles. Inert scaffolding is listed first
          // so the named muscles (and the deep insets within them) paint on top.
          frontData: [...INERT_FRONT, ...muscleFront],
          backData: [...INERT_BACK, ...muscleBack],
          states: slugFlags as Map<string, string>,
          inScope: SCOPED_SLUGS,
          tooltipFor: (slug: string, side: 'L' | 'R') => tooltipForSlug(slug, side, myo, ten),
          merge: mergeFlagState as (a?: string, b?: string) => string | undefined,
        }
      : {
          // Region-level geometry: the Physical Fitness Subitem Score IS five
          // regions, so drawing regions here matches the grain of the data.
          frontData: bodyFront,
          backData: bodyBack,
          states: slugTiers as Map<string, string>,
          inScope: SUBITEM_SCOPED_SLUGS,
          tooltipFor: (slug: string, side: 'L' | 'R') => tooltipForSubitemSlug(slug, side, subitems),
          merge: mergeTierState as (a?: string, b?: string) => string | undefined,
        };

  return (
    <>
      {hasSubitems && (
        <div className="seg-group" style={{ marginBottom: 12 }} role="tablist" aria-label="Muscle hero view">
          <button
            type="button"
            className={`seg-btn${activeMode === 'flags' ? ' active' : ''}`}
            aria-pressed={activeMode === 'flags'}
            onClick={() => setMode('flags')}
          >
            Muscle Flags
          </button>
          <button
            type="button"
            className={`seg-btn${activeMode === 'subitems' ? ' active' : ''}`}
            aria-pressed={activeMode === 'subitems'}
            onClick={() => setMode('subitems')}
          >
            ROM &amp; Stability
          </button>
        </div>
      )}

      <div className="bm-shell">
        <div className="bm-figures">
          <div className="bm-fig">
            <div className="bm-fig-title">Front</div>
            <svg viewBox="0 0 724 1448" xmlns="http://www.w3.org/2000/svg" aria-label="Front body view">
              <path className="bodymap-silhouette" d={FRONT_OUTLINE} />
              {renderParts(parts.frontData, parts.states, parts.inScope, parts.tooltipFor, parts.merge)}
            </svg>
          </div>
          <div className="bm-fig">
            <div className="bm-fig-title">Back</div>
            <svg viewBox="724 0 724 1448" xmlns="http://www.w3.org/2000/svg" aria-label="Back body view">
              <path className="bodymap-silhouette" d={BACK_OUTLINE} />
              {renderParts(parts.backData, parts.states, parts.inScope, parts.tooltipFor, parts.merge)}
            </svg>
          </div>
        </div>

        <div className="bm-strip">
          {activeMode === 'flags' ? (
            <>
              <div className="bm-summary">
                <div className="bm-summary-num">{total}</div>
                <div className="bm-summary-label">Muscle {total === 1 ? 'flag' : 'flags'}</div>
              </div>
              <div className="bm-legend">
                <span><i className="weak" /><span>Weakness <em>(Myodynamia)</em></span></span>
                <span><i className="tight" /><span>Tension <em>(Over-activation)</em></span></span>
                <span><i className="both" /><span>Both <em>(Compensation pattern)</em></span></span>
                <span className="bm-legend-note">L · Left  ·  R · Right  ·  B · Both sides</span>
              </div>
            </>
          ) : (
            <>
              <div className="bm-summary">
                <div className="bm-summary-num">{belowCount}</div>
                <div className="bm-summary-label">Region{belowCount === 1 ? '' : 's'} below average</div>
              </div>
              <div className="bm-legend">
                {TIER_ORDER.map((t) => (
                  <span key={t}><i className={t} /><span>{TIER_LABEL[t]} <em>({TIER_RANGE[t]})</em></span></span>
                ))}
                <span className="bm-legend-note">Colour = worse of ROM / Stability on that side</span>
              </div>
            </>
          )}
        </div>
      </div>

      {activeMode === 'flags' ? (
        total === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            No muscle flags from the latest assessment.
          </div>
        ) : (
          <div className="bm-cards">
            <FlagCard
              title="Myodynamia Deficiency"
              subtitle="Weakness"
              accent="var(--flag-weak)"
              items={myoEntries.map(([k, c]) => (
                <li key={k}><span>{k}</span><span className="lat-code">{c} · {sideText(c)}</span></li>
              ))}
              count={myoEntries.length}
            />
            <FlagCard
              title="Muscle Tension"
              subtitle="Over-activation"
              accent="var(--flag-tight)"
              items={tenEntries.map(([k, c]) => (
                <li key={k}><span>{k}</span><span className="lat-code">{c} · {sideText(c)}</span></li>
              ))}
              count={tenEntries.length}
            />
            <FlagCard
              title="Compensation Pattern"
              subtitle="Weak + Tight in same muscle"
              accent="var(--flag-both)"
              items={compEntries.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <span>
                    <span className="lat-code">W:{c.weak}</span>{' '}
                    <span className="lat-code">T:{c.tight}</span>
                  </span>
                </li>
              ))}
              count={compEntries.length}
              hint={
                compEntries.length > 0
                  ? 'These muscles likely indicate one side compensating for the other — clinically the most significant findings.'
                  : undefined
              }
            />
          </div>
        )
      ) : (
        <div style={{ marginTop: 4 }}>
          <SubitemTable subitems={subitems} />
        </div>
      )}
    </>
  );
}

function FlagCard({
  title, subtitle, accent, items, count, hint,
}: {
  title: string;
  subtitle: string;
  accent: string;
  items: React.ReactNode[];
  count: number;
  hint?: string;
}) {
  return (
    <div className="bm-card">
      <div className="bm-card-head">
        <span className="bm-card-dot" style={{ background: accent }} />
        <div>
          <div className="bm-card-title">{title}</div>
          <div className="bm-card-sub">{subtitle}</div>
        </div>
        <span className="bm-card-count">{count}</span>
      </div>
      {items.length > 0 ? (
        <ul className="bm-card-list">{items}</ul>
      ) : (
        <div className="bm-card-empty">None flagged</div>
      )}
      {hint && <div className="bm-card-hint">{hint}</div>}
    </div>
  );
}
