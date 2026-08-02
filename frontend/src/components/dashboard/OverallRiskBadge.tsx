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

const HERO_MSG = {
  green: 'Your latest screening is in line with, or better than, the athletes you are compared against. Keep to your current programme.',
  amber: 'Your latest screening places you below your comparison group on at least one measure. Your medical team should look at the flagged areas when convenient.',
  red: 'Your latest screening places you among the athletes most in need of attention in your comparison group. Arrange an assessment with your medical team before your next high-load session.',
} as const;

// `hero` is accepted for call-site intent; the full-size render below IS the
// hero, so there is only ever `compact` or hero — no third variant.
export default function OverallRiskBadge({
  screening, compact,
}: { screening?: ScreeningIndicator | null; compact?: boolean; hero?: boolean }) {
  // No score yet (no screening, or cohort too small to score against).
  if (!screening || !screening.effectiveBand) {
    if (compact) return <span className="text-muted" style={{ fontSize: '0.8rem' }}>No cohort score</span>;
    return (
      <div className="risk-hero">
        <div style={{ flex: 1 }}>
          <div className="risk-hero-label">Current Status</div>
          <div className="risk-hero-level">No cohort score yet</div>
          <div className="risk-hero-msg">
            This athlete has no screening on record, or their comparison group is still too small to
            score against. Import a HoloMotion report to produce an overall risk indicator.
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
  const message = overridden
    ? 'A member of the medical team has assessed this athlete and set the band manually. It stays until the next screening is imported.'
    : HERO_MSG[band];

  return (
    <div className={`risk-hero risk-hero--${HERO_CLS[band]}`}>
      <div style={{ flex: 1 }}>
        <div className="risk-hero-label">Current Status</div>
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
                {escCount} escalation{escCount === 1 ? '' : 's'} · scoring below your
                comparison group, being among its lowest scorers, or a screening indicator that is both elevated
                and worse than your group
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
