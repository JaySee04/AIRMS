'use client';

// Overall HoloMotion risk indicator — the cohort-normed traffic-light band
// (redesign spec §5). Green = safe · amber = needs attention · red = immediate
// assessment. Shows the 0–100 indicator, the escalation count, and any
// clinician override. Shared by the athlete, medical, and coach views.

import {
  BANDS, BAND_BG, BAND_COLOR, BAND_GLYPH, BAND_LABEL, type Band,
} from '@/lib/bands';
import { ordinal, percentileFromRank } from '@/lib/rank';

// Physical Fitness Subitem Score — 5 body regions × {romL,romR,stabL,stabR,sym}
// (0–100, higher better). Extracted from the HoloMotion report, stored on the
// Screening row; not duplicated onto the Athlete row (display-only, unlike the
// headline scores/risk indicators which feed cohort z-scoring).
export interface SubitemRow { romL: number | null; romR: number | null; stabL: number | null; stabR: number | null; sym: number | null; }
export type Subitems = Partial<Record<'neck' | 'shoulder' | 'torso' | 'pelvis' | 'lowerLimbs', SubitemRow>>;

/** One component's standing against the athlete's comparison group. `delta` and
 *  `z` are ORIENTED: positive always means better than the group, on every row,
 *  including the two rows whose raw scale runs the other way. */
export interface CohortDelta {
  key: string;
  label: string;
  value: number;
  mean: number;
  delta: number;
  z: number;
  lowerIsBetter?: boolean;
}

export interface ScreeningIndicator {
  /** HoloMotion's own headline number, as printed on the report. */
  totalScore?: number | null;
  overallIndicator?: number | null;
  overallBand?: 'green' | 'amber' | 'red' | null;
  escalations?: number;
  factors?: string[]; // human-readable escalation reasons (why the band is amber/red)
  reasonsAgainst?: string[]; // observations arguing against assessment
  cohortZ?: number | null;
  cohortRank?: number | null;
  cohortSize?: number | null;
  /** Whole days since the screening was taken. */
  screeningAgeDays?: number | null;
  /** Against the institution's rescreen interval — same rule as the recall email. */
  recallState?: 'current' | 'due-soon' | 'overdue' | 'never' | null;
  cohortLabel?: string | null;
  cohortDeltas?: CohortDelta[];
  effectiveBand?: 'green' | 'amber' | 'red' | null;
  overrideBand?: 'green' | 'amber' | 'red' | null;
  overrideNote?: string | null;
  overrideBy?: string | null;
  subitems?: Subitems | null;
}

// A component this far below the group is worth naming even when no escalation
// rule fired on it.
//
// This exists because the rules only look at the COMPOSITE z, the bottom-k rank
// and the exercise-risk indicators — so a single badly-below component escalates
// nothing. Nazwan's ROM is 1.45 SD under his squad and his stored escalation
// reasons are empty; Adam Kumar's symmetry is 22.3 points under his and only a
// shoulder rule is recorded. Showing "no reasons to assess" for either would be
// worse than the old opaque score, so the panel lists what the deltas plainly
// say. The BAND is untouched — reasons and escalations are different things.
const NOTABLE_Z = -1;

/** Reasons to assess: the stored escalation reasons, plus any component clearly
 *  below the group that no rule happened to cover. */
function whyAssess(screening: ScreeningIndicator): string[] {
  const out = [...(screening.factors ?? [])];
  const named = out.join(' ').toLowerCase();
  for (const d of (screening.cohortDeltas ?? []).filter((x) => x.z <= NOTABLE_Z).sort((a, b) => a.z - b.z)) {
    // Skip anything the stored reasons already mention, so the column doesn't
    // say the same thing twice in different words.
    if (named.includes(d.label.toLowerCase())) continue;
    // "worse than", never "below". The deltas are oriented, so on Injury risk and
    // L/R balance a negative delta means a HIGHER raw value — saying "Injury risk
    // 4.9 below the group" for an athlete at 19 against a group mean of 14.1 states
    // the opposite of the truth.
    out.push(`${d.label} ${Math.abs(d.delta)} worse than the group (${d.z} SD)`);
  }
  return out;
}

// Names, colours and tints come from lib/bands.ts — the hero shows the FULL
// clinical wording, legends elsewhere show the compact form, and neither can
// drift from the other any more.
const BAND_META = Object.fromEntries(
  BANDS.map((b) => [b, {
    label: BAND_LABEL[b], color: BAND_COLOR[b], bg: BAND_BG[b], glyph: BAND_GLYPH[b],
  }]),
) as Record<Band, { label: string; color: string; bg: string; glyph: string }>;

// Hero mode reuses the .risk-hero band classes so the primary signal carries
// the same visual weight the (now removed) ACWR hero used to occupy.
const HERO_CLS = { green: 'low', amber: 'mod', red: 'high' } as const;

// The hero sentence, by WHO is reading and WHEN the screening is from.
//
// Two axes, because both were wrong in one direction each:
//
//   audience — this map used to be second-person only ("Your latest screening
//   places you…"), while the component is shared by the athlete, medical and
//   coach views. So the medical dashboard told a clinician that THEY were among
//   the athletes needing attention, and to arrange an assessment with their own
//   medical team. Nobody had reported it; it reads plausibly until you notice
//   who is holding the screen.
//
//   tense — on a dashboard the screening IS the athlete's position, so present
//   tense is a claim the system can make. In the history views it is a record of
//   one date, so the same words assert something unknown, and any instruction
//   ("before your next high-load session") is about a session already past.
//
// Written out in full rather than assembled from fragments: these are the
// sentences a person actually reads, and they have to scan as English.
const HERO_MSG = {
  self: {
    now: {
      green: 'Your latest screening is in line with, or better than, the athletes you are compared against. Keep to your current programme.',
      amber: 'Your latest screening places you below your comparison group on at least one measure. Your medical team should look at the flagged areas when convenient.',
      red: 'Your latest screening places you among the athletes most in need of attention in your comparison group. Arrange an assessment with your medical team before your next high-load session.',
    },
    past: {
      green: 'At this screening you were in line with, or better than, the athletes you were compared against.',
      amber: 'At this screening you were below your comparison group on at least one measure.',
      red: 'At this screening you were among the athletes most in need of attention in your comparison group.',
    },
  },
  staff: {
    now: {
      green: 'This athlete’s latest screening is in line with, or better than, their comparison group. No screening-led change indicated.',
      amber: 'This athlete’s latest screening places them below their comparison group on at least one measure. Review the flagged areas when convenient.',
      red: 'This athlete’s latest screening places them among those most in need of attention in their comparison group. Assess before clearing them for the next high-load session.',
    },
    past: {
      green: 'At this screening the athlete was in line with, or better than, their comparison group.',
      amber: 'At this screening the athlete was below their comparison group on at least one measure.',
      red: 'At this screening the athlete was among those most in need of attention in their comparison group.',
    },
  },
} as const;

// `hero` is accepted for call-site intent; the full-size render below IS the
// hero, so there is only ever `compact` or hero — no third variant.
//
// `historical` — set when the screening on screen was chosen by date rather than
// being the athlete's latest (the history views). It only changes wording; the
// band, indicator and factors are whatever that screening recorded.
export default function OverallRiskBadge({
  screening, compact, historical = false, audience = 'staff',
}: {
  screening?: ScreeningIndicator | null;
  compact?: boolean;
  hero?: boolean;
  historical?: boolean;
  // Defaults to 'staff' to match ScreeningAlertBanner — one default across the
  // shared components, so "which is it again?" never costs a bug. The athlete
  // views pass 'self' explicitly.
  audience?: 'self' | 'staff';
}) {
  const heroLabel = historical ? 'Status at this screening' : 'Current Status';

  // No score yet (no screening, or cohort too small to score against).
  if (!screening || !screening.effectiveBand) {
    if (compact) return <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>No cohort score</span>;
    return (
      <div className="risk-hero">
        <div style={{ flex: 1 }}>
          <div className="risk-hero-label">{heroLabel}</div>
          {/* "yet" is right on a dashboard and wrong on a past screening — that
              one is settled, not pending. */}
          <div className="risk-hero-level">{historical ? 'No cohort score' : 'No cohort score yet'}</div>
          <div className="risk-hero-msg">
            {historical
              // "Import a report" is the wrong instruction here: a screening on
              // record that scored nothing was scored against a group too small
              // at the time, and importing today cannot change that.
              ? 'This screening was not scored against a comparison group — at the time, the group was too small to norm against.'
              : audience === 'self'
                // The athlete cannot import a report, so don't tell them to.
                ? 'You have no screening on record yet, or your comparison group is still too small to score against.'
                : 'This athlete has no screening on record, or their comparison group is still too small to score against. Import a HoloMotion report to produce an overall risk indicator.'}
          </div>
        </div>
      </div>
    );
  }

  const band = screening.effectiveBand;
  const meta = BAND_META[band];
  const overridden = Boolean(screening.overrideBand);

  // Compact badge (coach squad table): band SHAPE + indicator + override mark.
  //
  // The shape is not decoration. This used to be a coloured circle, identical in
  // every band, so the row's clinical state was carried by hue alone — the one
  // encoding red/amber/green is worst at, and the one a `title` tooltip does not
  // rescue, since neither a screen reader nor a touch device surfaces it. The
  // glyph differs per band (lib/bands.ts) and the accessible name carries the
  // full wording, so the column reads correctly in greyscale, under a red-green
  // deficiency, and aloud.
  if (compact) {
    const detail = overridden
      ? `Clinician override → ${meta.label}${screening.overrideNote ? `: ${screening.overrideNote}` : ''}`
      : `${meta.label}${screening.factors?.length ? ` · ${screening.factors.join(' · ')}` : ''}`;
    return (
      <span
        title={detail}
        aria-label={`${meta.label}, indicator ${screening.overallIndicator ?? 'not scored'}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 'var(--fs-sm)', color: meta.color }}
      >
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-2xs)', lineHeight: 1 }}>{meta.glyph}</span>
        {screening.overallIndicator ?? '—'}
        {overridden && <span aria-hidden="true" style={{ fontSize: 'var(--fs-2xs)' }}>✎</span>}
      </span>
    );
  }

  // Full hero. The "why" chips are driven off the stored escalation factors.
  const escCount = screening.escalations ?? 0;
  const hasFactors = Boolean(screening.factors?.length);
  const subject = audience === 'self' ? 'you' : 'this athlete';
  const message = overridden
    ? (historical
      // "It stays until the next screening is imported" describes a rule that has
      // already run its course on a past screening.
      ? `A member of the medical team assessed ${subject} and set this band manually.`
      : `A member of the medical team has assessed ${subject} and set the band manually. It stays until the next screening is imported.`)
    : HERO_MSG[audience][historical ? 'past' : 'now'][band];

  const deltas = screening.cohortDeltas ?? [];
  const forList = whyAssess(screening);
  const againstList = screening.reasonsAgainst ?? [];
  const rank = screening.cohortRank;
  const size = screening.cohortSize;
  const who = audience === 'self' ? 'you' : 'this athlete';
  // Percentile is derived from the rank the backend already sends, so the two
  // can never disagree about where the athlete stands.
  const pct = percentileFromRank(rank, size);

  // HOW OLD IS THIS READING? The verdict above is written in the present tense,
  // so a screening taken eight months ago has to say so where the decision is
  // made — not only in the date dropdown, and not only in the monthly recall
  // email an administrator receives. Classified server-side by the same rule
  // that email uses, so the two cannot disagree.
  const age = screening.screeningAgeDays;
  const recall = screening.recallState;
  const staleNotice = (!historical && recall && recall !== 'current' && typeof age === 'number')
    ? (recall === 'overdue'
      ? `This screening is ${age} days old and a rescreen is overdue — read the verdict as the last known position, not today's.`
      : `This screening is ${age} days old and a rescreen is due soon.`)
    : null;

  // HOW MANY PEERS IS THIS COMPARED AGAINST? A standard deviation estimated from
  // a handful of athletes is unstable, so a small cohort makes the comparison
  // indicative rather than firm. Stating it is the same "say what the data can
  // support" rule the detectable-change threshold and seasonality already follow.
  const SMALL_COHORT = 10;
  const smallCohort = typeof size === 'number' && size > 0 && size < SMALL_COHORT;

  return (
    <div className={`risk-hero risk-hero--${HERO_CLS[band]}`}>
      <div style={{ flex: 1 }}>

        {/* HoloMotion's own printed number is the headline. It is the one value a
            clinician can check against the PDF in their hand, which the derived
            0-100 indicator never was. The indicator is still computed and still
            drives ranking, alerts and report ordering — it is just no longer the
            thing shown. */}
        <div className="risk-hero-stat">
          <div className="risk-hero-stat-val" style={{ color: meta.color }}>
            {screening.totalScore ?? '—'}
          </div>
          <div className="risk-hero-stat-label">Total Score</div>
          <div className="risk-hero-stat-sub">
            as printed by HoloMotion
            {pct != null && (
              <><br /><strong>{ordinal(pct)} pct</strong> of group ({rank}/{size})</>
            )}
          </div>
        </div>
        <div className="risk-hero-label">{heroLabel}</div>
        <div className="risk-hero-level">
          {meta.label}
          {overridden && <span className="risk-escalation-badge">set by clinician</span>}
        </div>
        <div className="risk-hero-msg">{message}</div>
        {overridden && screening.overrideNote && (
          <div className="risk-factors">
            <span className="risk-factors-label">Clinician note:</span>
            <span className="risk-factor-chip">
              “{screening.overrideNote}”{screening.overrideBy ? ` — ${screening.overrideBy}` : ''}
            </span>
          </div>
        )}

        {/* The comparison behind the band. Replaces the abstract 0-100 as the
            explanation: a signed row per component says WHICH measure drove the
            verdict, which a single composite number cannot. */}
        {staleNotice && (
          <p className={`risk-hero-stale risk-hero-stale--${recall}`}>{staleNotice}</p>
        )}

        {deltas.length > 0 && (
          <div className="cohort-profile">
            <div className="cohort-profile-head">
              {historical ? 'Against the group at that screening' : `How ${who} compare${audience === 'self' ? '' : 's'} to the comparison group`}
              {screening.cohortLabel && <span className="cohort-profile-group"> · {screening.cohortLabel}</span>}
              {typeof size === 'number' && size > 0
                && <span className="cohort-profile-group"> · n={size}</span>}
            </div>
            {smallCohort && (
              <p className="cohort-profile-caveat">
                Only {size} athletes in this comparison group, so the group average and
                spread are themselves uncertain — read these differences as indicative.
              </p>
            )}
            <table className="cohort-profile-table">
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col" className="num">Score</th>
                  <th scope="col" className="num">Group</th>
                  <th scope="col" className="num">Difference</th>
                </tr>
              </thead>
              <tbody>
                {deltas.map((d) => {
                  // A dead band, so a rounding-level wobble doesn't read as a
                  // real gap. Matches the ±0.25 SD the backend uses to decide
                  // what counts as "level with the group".
                  const tone = d.z >= 0.25 ? 'up' : d.z <= -0.25 ? 'down' : 'flat';
                  return (
                    <tr key={d.key}>
                      <th scope="row">
                        {d.label}
                        {d.lowerIsBetter && <span className="cohort-profile-hint" title="Lower raw values are better on this measure"> (lower is better)</span>}
                      </th>
                      <td className="num">{d.value}</td>
                      <td className="num muted">{d.mean}</td>
                      <td className={`num delta delta--${tone}`}>
                        {/* Signed, not an arrow glyph: the sign already carries
                            the direction, and colour only reinforces it. */}
                        {d.delta > 0 ? '+' : ''}{d.delta}
                        <span className="cohort-profile-sd"> ({d.z} SD)</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="cohort-profile-note">
              A positive difference is better than the group on every row.
              {pct != null && (
                <> {audience === 'self' ? 'You sit' : 'They sit'} at the <strong>{ordinal(pct)} percentile</strong>{' '}
                  of this group &mdash; ranked {rank} of {size}, where 1 is the lowest.</>
              )}
            </div>
          </div>
        )}

        {/* Both sides of the evidence. AIRMS only ever recorded reasons to
            escalate, so a green athlete's hero asserted "fine" with nothing
            behind it and an amber one showed a lone negative with no
            counterweight. The band above stays the verdict. */}
        {(forList.length > 0 || againstList.length > 0) && (
          <div className="reason-cols">
            <div className="reason-col reason-col--for">
              <div className="reason-col-head">Reasons to assess</div>
              {forList.length ? (
                <ul>{forList.map((f) => <li key={f}>{f}</li>)}</ul>
              ) : (
                <p className="reason-col-empty">Nothing in this screening argues for an assessment.</p>
              )}
            </div>
            <div className="reason-col reason-col--against">
              <div className="reason-col-head">Reasons not to</div>
              {againstList.length ? (
                <ul>{againstList.map((f) => <li key={f}>{f}</li>)}</ul>
              ) : (
                <p className="reason-col-empty">Nothing in this screening argues against one.</p>
              )}
            </div>
          </div>
        )}
        {escCount > 0 && !hasFactors && (
          <div className="risk-factors">
            <span className="risk-factors-label">Why:</span>
            <span className="risk-factor-chip">
              {escCount} escalation{escCount === 1 ? '' : 's'} recorded
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
