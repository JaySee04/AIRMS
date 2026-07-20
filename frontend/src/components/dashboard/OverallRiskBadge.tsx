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

// Posture Evaluation — 8 axes, each a descriptive finding + a signed degree
// value. No reference range is captured (the report's own ranges vary per
// axis and aren't part of the extraction schema), so this is presented as a
// plain finding + value, not a fabricated range bar.
export interface PostureAxis { finding: string | null; value: number | null; }
export type Posture = Partial<Record<'neckFB' | 'neckLR' | 'shoulder' | 'spineFB' | 'spineLR' | 'pelvisFB' | 'pelvisLR' | 'lowerLimbs', PostureAxis>>;

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
  posture?: Posture | null;
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

export default function OverallRiskBadge({
  screening, compact, hero,
}: { screening?: ScreeningIndicator | null; compact?: boolean; hero?: boolean }) {
  if (!screening || !screening.effectiveBand) {
    if (hero) {
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
    return <span className="text-muted" style={{ fontSize: '0.8rem' }}>No cohort score</span>;
  }
  const band = screening.effectiveBand;
  const meta = BAND_META[band];
  const overridden = Boolean(screening.overrideBand);

  if (compact) {
    return (
      <span
        title={overridden ? `Clinician override → ${meta.label}${screening.overrideNote ? `: ${screening.overrideNote}` : ''}` : `${meta.label}${screening.escalations ? ` · ${screening.escalations} escalation(s)` : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '0.78rem', color: meta.color }}
      >
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: meta.color }} />
        {screening.overallIndicator ?? '—'}
        {overridden && <span style={{ fontSize: '0.66rem' }}>✎</span>}
      </span>
    );
  }

  if (hero) {
    return (
      <div className={`risk-hero risk-hero--${HERO_CLS[band]}`}>
        <div style={{ flex: 1 }}>
          <div className="risk-hero-label">Current Status</div>
          <div className="risk-hero-level">
            {meta.label}
            {overridden && <span className="risk-escalation-badge">set by clinician</span>}
          </div>
          <div className="risk-hero-msg">
            {overridden
              ? 'A member of the medical team has assessed this athlete and set the band manually. It stays until the next screening is imported.'
              : HERO_MSG[band]}
          </div>
          {overridden && screening.overrideNote && (
            <div className="risk-factors">
              <span className="risk-factors-label">Clinician note:</span>
              <span className="risk-factor-chip">
                “{screening.overrideNote}”{screening.overrideBy ? ` — ${screening.overrideBy}` : ''}
              </span>
            </div>
          )}
          {!overridden && typeof screening.escalations === 'number' && screening.escalations > 0 && (
            <div className="risk-factors">
              <span className="risk-factors-label">Why:</span>
              {screening.factors && screening.factors.length > 0 ? (
                screening.factors.map((f) => (<span key={f} className="risk-factor-chip">{f}</span>))
              ) : (
                <span className="risk-factor-chip">
                  {screening.escalations} escalation{screening.escalations === 1 ? '' : 's'} · scoring below your
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

  return (
    <div style={{ background: meta.bg, border: `1px solid ${meta.color}`, borderRadius: 'var(--radius)', padding: '12px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 700, color: meta.color }}>
            Overall Risk: {meta.label}
            {overridden && <span style={{ fontSize: '0.72rem', fontWeight: 600, marginLeft: 8 }}>· clinician override</span>}
          </div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>
            Indicator {screening.overallIndicator ?? '—'}/100 vs cohort
            {typeof screening.escalations === 'number' && screening.escalations > 0 && !overridden
              ? ` · ${screening.escalations} escalation${screening.escalations === 1 ? '' : 's'}`
              : ''}
          </div>
          {overridden && screening.overrideNote && (
            <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4, fontStyle: 'italic' }}>
              “{screening.overrideNote}”{screening.overrideBy ? ` — ${screening.overrideBy}` : ''}
            </div>
          )}
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 700, color: meta.color }}>{screening.overallIndicator ?? '—'}</div>
      </div>
    </div>
  );
}
