'use client';

// Sport-aware screening detail for a single athlete: which HoloMotion
// exercise-risk indicators are out of range in a body region that matters for
// the athlete's sport. Shared by the athlete and medical dashboards.
//
// WHY THIS IS GATED ON `band` (changed 2026-07-16). This used to be an
// independent, always-on alarm keyed purely on absolute thresholds, and it
// fired for 59 of 59 screened athletes — measured, not estimated. That is
// alert fatigue, and no threshold fixes it: to make it rare you would have to
// set the sport-critical boundary ABOVE the standard one (~26 vs 25), which
// contradicts its own tightening-only design, and both real ground-truth
// athletes trip it too. The deeper problem is that an absolute cut-off is
// exactly what the FYP II redesign argues against — the cohort-normed
// indicator is the triage signal, and this banner was a second, louder,
// worse-founded verdict competing with it.
//
// So it is no longer a verdict. It renders only when the cohort-normed band is
// already amber/red, and explains WHICH regions sit behind that band. Athletes
// who are fine overall don't get an alarm; their elevated regions still show on
// the threshold strips and in Training Focus, which is where detail belongs.

import { AthleteRisks, BAND_LABEL, computeBodyPartAlerts, recommendedAction } from '@/lib/screeningAlerts';

interface Props {
  risks: AthleteRisks | undefined | null;
  sport: string | undefined;
  // The athlete's cohort-normed band (override applied). The banner is a
  // detail OF this band, so it renders only for amber/red.
  band?: 'green' | 'amber' | 'red' | null;
  // 'self' tunes the copy for the athlete viewing their own data.
  audience?: 'self' | 'staff';
}

export default function ScreeningAlertBanner({ risks, sport, band, audience = 'staff' }: Props) {
  const result = computeBodyPartAlerts(risks, sport);
  const { alerts, criticalRegions, hasCriticalAlert } = result;
  if (alerts.length === 0) return null;
  // Not a standalone alarm: only explain a band that is already flagged.
  if (band !== 'amber' && band !== 'red') return null;

  const tone = band === 'red' ? 'high' : 'mod';
  const who = audience === 'self' ? 'your' : "this athlete's";

  return (
    <div className={`screening-alert screening-alert--${tone}`}>
      <div className="screening-alert-head">
        <span className="screening-alert-icon" aria-hidden>⚠</span>
        <div>
          <div className="screening-alert-title">
            Regions behind this band
            {hasCriticalAlert && sport ? ` · sport-critical for ${sport}` : ''}
          </div>
          <div className="screening-alert-sub">
            {hasCriticalAlert
              ? `These regions are out of range on ${who} latest screening, and are ones ${audience === 'self' ? 'your' : 'their'} sport loads heavily — so AIRMS holds them to a tighter standard.`
              : `These indicators are out of range on ${who} latest screening.`}
            {criticalRegions.length > 0 && (
              <> Regions AIRMS treats as critical for {sport}: <strong>{criticalRegions.join(', ')}</strong>.</>
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
