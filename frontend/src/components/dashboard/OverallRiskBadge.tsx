'use client';

// Overall HoloMotion risk indicator — the cohort-normed traffic-light band
// (redesign spec §5). Green = safe · amber = needs attention · red = immediate
// assessment. Shows the 0–100 indicator, the escalation count, and any
// clinician override. Shared by the athlete, medical, and coach views.

// Physical Fitness Subitem Score — 5 body regions × {romL,romR,stabL,stabR,sym}
// (0–100, higher better). Extracted from the HoloMotion report, stored on the
// Screening row; not duplicated onto the Athlete row (display-only, unlike the
// headline scores/risk indicators which feed cohort z-scoring).
export interface SubitemRow { romL: number | null; romR: number | null; stabL: number | null; stabR: number | null; sym: number | null; }
export type Subitems = Partial<Record<'neck' | 'shoulder' | 'torso' | 'pelvis' | 'lowerLimbs', SubitemRow>>;

export interface ScreeningIndicator {
  overallIndicator?: number | null;
  overallBand?: 'green' | 'amber' | 'red' | null;
  escalations?: number;
  factors?: string[]; // human-readable escalation reasons (why the band is amber/red)
  effectiveBand?: 'green' | 'amber' | 'red' | null;
  overrideBand?: 'green' | 'amber' | 'red' | null;
  overrideNote?: string | null;
  overrideBy?: string | null;
  subitems?: Subitems | null;
}

const BAND_META = {
  green: { label: 'Safe', color: 'var(--risk-low)', bg: 'var(--risk-low-bg)' },
  amber: { label: 'Needs attention', color: 'var(--risk-moderate)', bg: 'var(--risk-moderate-bg)' },
  red: { label: 'Immediate assessment', color: 'var(--risk-high)', bg: 'var(--risk-high-bg)' },
} as const;

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
    if (compact) return <span className="text-muted" style={{ fontSize: '0.8rem' }}>No cohort score</span>;
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

  // Compact badge (coach squad table): coloured dot + indicator + override mark.
  if (compact) {
    return (
      <span
        title={overridden
          ? `Clinician override → ${meta.label}${screening.overrideNote ? `: ${screening.overrideNote}` : ''}`
          : `${meta.label}${screening.factors?.length ? ` · ${screening.factors.join(' · ')}` : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.78rem', color: meta.color }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color }} />
        {screening.overallIndicator ?? '—'}
        {overridden && <span style={{ fontSize: '0.66rem' }}>✎</span>}
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

  return (
    <div className={`risk-hero risk-hero--${HERO_CLS[band]}`}>
      <div style={{ flex: 1 }}>
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
        {!overridden && (hasFactors || escCount > 0) && (
          <div className="risk-factors">
            <span className="risk-factors-label">Why:</span>
            {hasFactors ? (
              screening.factors!.map((f) => (<span key={f} className="risk-factor-chip">{f}</span>))
            ) : (
              <span className="risk-factor-chip">
                {escCount} escalation{escCount === 1 ? '' : 's'} · scoring below
                {audience === 'self' ? ' your ' : ' their '}
                comparison group, being among its lowest scorers, or a screening indicator that is both elevated
                and worse than that group
              </span>
            )}
          </div>
        )}
      </div>
      <div className="risk-hero-stat">
        <div className="risk-hero-stat-val" style={{ color: meta.color }}>
          {screening.overallIndicator ?? '—'}
        </div>
        <div className="risk-hero-stat-label">Indicator / 100</div>
        <div className="risk-hero-stat-sub">
          Comparison group<br /><strong>average = 50</strong>
        </div>
      </div>
    </div>
  );
}
