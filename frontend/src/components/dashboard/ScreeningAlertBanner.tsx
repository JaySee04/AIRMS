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

import {
  AthleteRisks, BAND_LABEL, HISTORICAL_NOTE, computeBodyPartAlerts, recommendedAction, screeningRef,
} from '@/lib/screeningAlerts';

interface Props {
  risks: AthleteRisks | undefined | null;
  sport: string | undefined;
  // The athlete's cohort-normed band (override applied). The banner is a
  // detail OF this band, so it renders only for amber/red.
  band?: 'green' | 'amber' | 'red' | null;
  // 'self' tunes the copy for the athlete viewing their own data.
  audience?: 'self' | 'staff';
  // Set in the history views: the screening on screen was chosen by date, so the
  // copy must not describe it as where the athlete stands now.
  historical?: boolean;
}

export default function ScreeningAlertBanner({
  risks, sport, band, audience = 'staff', historical = false,
}: Props) {
  const result = computeBodyPartAlerts(risks, sport);
  const { alerts, criticalRegions, hasCriticalAlert } = result;
  if (alerts.length === 0) return null;
  // Not a standalone alarm: only explain a band that is already flagged.
  if (band !== 'amber' && band !== 'red') return null;

  const tone = band === 'red' ? 'high' : 'mod';
  // "on this screening" in the history views, "on your/this athlete's latest
  // screening" on a dashboard — one definition, in lib/screeningAlerts.ts.
  const onWhich = `on ${screeningRef(historical, audience)}`;
  // The dashboards keep the present tense they were audited with; only the
  // history views shift to past.
  const wasWere = historical ? 'were' : 'are';

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
              ? `These regions ${wasWere} out of range ${onWhich}, and are ones ${audience === 'self' ? 'your' : 'their'} sport loads heavily — so AIRMS holds them to a tighter standard.`
              : `These indicators ${wasWere} out of range ${onWhich}.`}
            {criticalRegions.length > 0 && (
              <> Regions AIRMS treats as critical for {sport}: <strong>{criticalRegions.join(', ')}</strong>.</>
            )}
            {/* On a dashboard this is the follow-up action; in history it is
                replaced by a statement that this is not the current position. */}
            {' '}{historical ? HISTORICAL_NOTE[audience] : recommendedAction(result, audience)}
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
