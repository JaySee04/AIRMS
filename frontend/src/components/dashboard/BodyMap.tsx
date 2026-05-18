'use client';

import { useMemo } from 'react';
import { bodyFront } from './bodymap-data/bodyFront';
import { bodyBack } from './bodymap-data/bodyBack';
import { FRONT_OUTLINE, BACK_OUTLINE } from './bodymap-data/outlines';
import type { BodyPart } from './bodymap-data/types';

export type MuscleSide = 'L' | 'R' | 'B';
export interface MuscleEntry {
  muscle: string;
  side: MuscleSide;
}

interface BodyMapProps {
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
}

type FlagState = 'weak' | 'tight' | 'both';
type FlagMap = Record<string, MuscleSide>;

// AIRMS muscle name → library region slug. Some library regions cover
// multiple AIRMS muscles (e.g. all three quadriceps heads map to
// "quadriceps"); the flag-card list below the figure preserves the
// individual muscle names with their sides.
const AIRMS_TO_SLUG: Record<string, string> = {
  // Neck
  'Sternocleidomastoid': 'neck',
  'Rectus Capitis Anterior': 'neck',
  // Trapezius
  'Upper Trapezius': 'trapezius',
  // Deltoid (3 heads on front + 1 on back map to the same region)
  'Middle Deltoid': 'deltoids',
  'Lateral Deltoid': 'deltoids',
  'Posterior Deltoid': 'deltoids',
  // Chest
  'Pectoralis Major': 'chest',
  // Biceps
  'Biceps Brachii': 'biceps',
  // Core
  'Rectus Abdominis': 'abs',
  'External Oblique': 'obliques',
  'Internal Oblique': 'obliques',
  // Hip flexor — adductors region is closest visual home
  'Iliopsoas': 'adductors',
  // Quadriceps (3 heads + Sartorius all map to quads region)
  'Vastus Lateralis': 'quadriceps',
  'Rectus Femoris': 'quadriceps',
  'Vastus Medialis': 'quadriceps',
  'Sartorius': 'quadriceps',
  // Lats
  'Latissimus Dorsi': 'upper-back',
  // Glutes (3 heads + Piriformis)
  'Gluteus Medius': 'gluteal',
  'Gluteus Minimus': 'gluteal',
  'Gluteus Maximus': 'gluteal',
  'Piriformis': 'gluteal',
  // Hamstring
  'Biceps Femoris': 'hamstring',
};

// Library slugs that are within the AIRMS spreadsheet's scope. Anything
// outside this set (head, hair, hands, feet, knees, forearm, etc.) renders
// as inert silhouette — no hover, no tooltip, no pointer cursor.
const SCOPED_SLUGS: Set<string> = new Set(Object.values(AIRMS_TO_SLUG));

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
      const slug = AIRMS_TO_SLUG[muscle];
      if (!slug) return;
      if (side === 'L' || side === 'B') ensureSide(slug, 'L', kind);
      if (side === 'R' || side === 'B') ensureSide(slug, 'R', kind);
    });
  };

  apply(myo, 'weak');
  apply(ten, 'tight');
  return result;
}

function tooltipForSlug(slug: string, side: 'L' | 'R', myo: FlagMap, ten: FlagMap): string {
  const reverseList = Object.entries(AIRMS_TO_SLUG)
    .filter(([, s]) => s === slug)
    .map(([m]) => m);
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

function sideText(c: MuscleSide): string {
  return c === 'L' ? 'Left' : c === 'R' ? 'Right' : 'Both';
}

function classForState(state?: FlagState): string {
  const base = 'bodymap-region';
  if (!state) return base;
  return `${base} ${base}--${state}`;
}

function groupClassForState(state?: FlagState): string {
  const base = 'bodymap-region-group';
  if (!state) return base;
  return `${base} ${base}--${state}`;
}

function renderParts(
  data: BodyPart[],
  flags: Map<string, FlagState>,
  myo: FlagMap,
  ten: FlagMap,
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  data.forEach((part) => {
    const inScope = SCOPED_SLUGS.has(part.slug);

    const renderSide = (paths: string[] | undefined, sideTag: 'L' | 'R' | 'C') => {
      if (!paths) return;
      const key = sideTag === 'C' ? `${part.slug}:L` : `${part.slug}:${sideTag}`;
      const otherKey = sideTag === 'C' ? `${part.slug}:R` : null;
      const state = inScope
        ? otherKey
          ? mergeState(flags.get(key), flags.get(otherKey))
          : flags.get(key)
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

      const title =
        sideTag === 'C'
          ? part.slug
          : tooltipForSlug(part.slug, sideTag, myo, ten);
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

function mergeState(a?: FlagState, b?: FlagState): FlagState | undefined {
  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  return 'both';
}

export default function BodyMap({ myodynamia, tension }: BodyMapProps) {
  const myo = useMemo(() => buildFlagMap(myodynamia), [myodynamia]);
  const ten = useMemo(() => buildFlagMap(tension), [tension]);
  const slugFlags = useMemo(() => aggregateBySlug(myo, ten), [myo, ten]);

  const total = Object.keys(myo).length + Object.keys(ten).length;

  const myoEntries = Object.entries(myo) as Array<[string, MuscleSide]>;
  const tenEntries = Object.entries(ten) as Array<[string, MuscleSide]>;
  const compEntries = myoEntries
    .filter(([k]) => ten[k])
    .map(([k]) => ({ name: k, weak: myo[k], tight: ten[k] }));

  return (
    <>
      <div className="bm-shell">
        <div className="bm-figures">
          <div className="bm-fig">
            <div className="bm-fig-title">Front</div>
            <svg viewBox="0 0 724 1448" xmlns="http://www.w3.org/2000/svg" aria-label="Front body view">
              <path className="bodymap-silhouette" d={FRONT_OUTLINE} />
              {renderParts(bodyFront, slugFlags, myo, ten)}
            </svg>
          </div>
          <div className="bm-fig">
            <div className="bm-fig-title">Back</div>
            <svg viewBox="724 0 724 1448" xmlns="http://www.w3.org/2000/svg" aria-label="Back body view">
              <path className="bodymap-silhouette" d={BACK_OUTLINE} />
              {renderParts(bodyBack, slugFlags, myo, ten)}
            </svg>
          </div>
        </div>

        <div className="bm-strip">
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
        </div>
      </div>

      {total === 0 ? (
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
