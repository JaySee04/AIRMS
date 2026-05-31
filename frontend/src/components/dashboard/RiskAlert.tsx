import Link from 'next/link';
import type { CompositeRisk } from '@/lib/risk';

interface RiskAlertProps {
  risk: CompositeRisk;
  acwr: number;
}

// Prominent warning surface required by UC-13: only renders when the
// classified risk is Moderate or High. Sits above the risk hero so it
// reads as an alert, not a status panel.
export default function RiskAlert({ risk, acwr }: RiskAlertProps) {
  if (risk.cls !== 'mod' && risk.cls !== 'high') return null;

  const isHigh = risk.cls === 'high';
  const heading = isHigh ? 'High Injury Risk Alert' : 'Elevated Injury Risk';
  const { lowMin, lowMax, modMax } = risk.personalisedRange;
  const acwrStr = acwr.toFixed(2);
  const rangeStr = `${lowMin.toFixed(2)} – ${lowMax.toFixed(2)}`;
  const finalLabel = isHigh ? 'High' : 'Elevated';

  // The reason must reflect what the raw ACWR actually did, not just where
  // the final class landed. Escalation can jump low → mod → high in two
  // hops, so a 'high' final class does not imply the ACWR ever crossed the
  // optimal range. We branch on baseCls (the raw ACWR class) for accuracy.
  let reason: string;
  if (risk.baseCls === 'high') {
    reason = `Your ACWR of ${acwrStr} exceeds your personalised danger threshold (${modMax.toFixed(2)}).`;
  } else if (risk.baseCls === 'mod' && !risk.escalated) {
    reason = `Your ACWR of ${acwrStr} is above your optimal range (${rangeStr}).`;
  } else if (risk.baseCls === 'mod' && risk.escalated) {
    reason = `Your ACWR of ${acwrStr} is above your optimal range (${rangeStr}), and active injury or muscle-flag context has escalated your risk to ${finalLabel}.`;
  } else {
    // baseCls === 'low' (or 'under'), escalated up by context only.
    reason = `Your ACWR of ${acwrStr} is within your optimal range (${rangeStr}), but active injury or muscle-flag context has escalated your risk to ${finalLabel}.`;
  }

  return (
    <div className={`risk-alert risk-alert--${risk.cls}`} role="alert">
      <span className="risk-alert-icon" aria-hidden>⚠</span>
      <div className="risk-alert-body">
        <div className="risk-alert-heading">{heading}</div>
        <div className="risk-alert-reason">{reason}</div>
      </div>
      <Link href="/athlete/activity" className="btn btn-outline btn-sm">
        Review Activity
      </Link>
    </div>
  );
}
