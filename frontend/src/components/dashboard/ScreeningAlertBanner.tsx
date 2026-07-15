'use client';

// Sport-aware screening alert banner for a single athlete. Surfaces HoloMotion
// exercise-risk indicators that are out of range in a body region that matters
// for the athlete's sport. Shared by the athlete and medical dashboards.
// Renders nothing when there is nothing to flag.

import { AthleteRisks, BAND_LABEL, computeBodyPartAlerts, recommendedAction } from '@/lib/screeningAlerts';

interface Props {
  risks: AthleteRisks | undefined | null;
  sport: string | undefined;
  // 'self' tunes the copy for the athlete viewing their own data.
  audience?: 'self' | 'staff';
}

export default function ScreeningAlertBanner({ risks, sport, audience = 'staff' }: Props) {
  const result = computeBodyPartAlerts(risks, sport);
  const { alerts, criticalRegions, topBand, hasCriticalAlert } = result;
  if (alerts.length === 0) return null;

  const tone = topBand === 'high' ? 'high' : 'mod';
  const who = audience === 'self' ? 'your' : "this athlete's";

  return (
    <div className={`screening-alert screening-alert--${tone}`} role="alert">
      <div className="screening-alert-head">
        <span className="screening-alert-icon" aria-hidden>⚠</span>
        <div>
          <div className="screening-alert-title">
            {hasCriticalAlert
              ? `Sport-critical screening alert${sport ? ` · ${sport}` : ''}`
              : 'Screening indicators out of range'}
          </div>
          <div className="screening-alert-sub">
            {hasCriticalAlert
              ? `A body region important for ${who} sport is not within a healthy screening range.`
              : `Some screening indicators are elevated for ${who} latest report.`}
            {criticalRegions.length > 0 && (
              <> Critical regions for {sport}: <strong>{criticalRegions.join(', ')}</strong>.</>
            )}
            {' '}{recommendedAction(result, audience)}
          </div>
        </div>
      </div>

      <ul className="screening-alert-list">
        {alerts.map((a) => (
          <li key={`${a.label}-${a.region}`} className={`screening-alert-item${a.critical ? ' is-critical' : ''}`}>
            <span className={`screening-chip screening-chip--${a.band}`}>
              {BAND_LABEL[a.band]}
            </span>
            <span className="screening-alert-label">
              {a.label}
              {a.critical && <span className="screening-alert-crit"> · sport-critical</span>}
            </span>
            <span className="screening-alert-val">{a.value.toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
