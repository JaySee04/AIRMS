'use client';

// Overall HoloMotion risk indicator — the cohort-normed traffic-light band
// (redesign spec §5). Green = safe · amber = needs attention · red = immediate
// assessment. Shows the 0–100 indicator, the escalation count, and any
// clinician override. Shared by the athlete, medical, and coach views.

export interface ScreeningIndicator {
  overallIndicator?: number | null;
  overallBand?: 'green' | 'amber' | 'red' | null;
  escalations?: number;
  effectiveBand?: 'green' | 'amber' | 'red' | null;
  overrideBand?: 'green' | 'amber' | 'red' | null;
  overrideNote?: string | null;
  overrideBy?: string | null;
}

const BAND_META = {
  green: { label: 'Safe', color: 'var(--risk-low)', bg: 'var(--risk-low-bg)' },
  amber: { label: 'Needs attention', color: 'var(--risk-moderate)', bg: 'var(--risk-moderate-bg)' },
  red: { label: 'Immediate assessment', color: 'var(--risk-high)', bg: 'var(--risk-high-bg)' },
} as const;

export default function OverallRiskBadge({ screening, compact }: { screening?: ScreeningIndicator | null; compact?: boolean }) {
  if (!screening || !screening.effectiveBand) {
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
