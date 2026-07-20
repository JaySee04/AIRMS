'use client';

// Posture Evaluation — the HoloMotion report's 8-axis postural read-out (neck,
// shoulder, spine, pelvis, lower limbs), each a descriptive finding plus a
// signed degree value. Shared by the import preview and the athlete/medical/
// coach dashboard screening panel.
//
// The report draws each axis as a bar against its own reference range, but
// that range varies per axis and isn't part of the extraction schema — so
// rather than fabricate a bar from a guessed range, this shows exactly what
// was extracted: the finding text (which already carries direction, e.g.
// "Lumbar Right Lateral Tilt") and the raw value. Findings aren't colored on
// the injury-risk scale (green/amber/red) — a postural classification isn't
// the same kind of measurement as an exercise-risk score, and treating it as
// one would overstate what the report itself claims.

import type { Posture } from './OverallRiskBadge';

const POSTURE_AXES: Array<[keyof Posture, string]> = [
  ['neckFB', 'Neck (Fwd / Bwd)'],
  ['neckLR', 'Neck (L / R)'],
  ['shoulder', 'Shoulder'],
  ['spineFB', 'Spine (Fwd / Bwd)'],
  ['spineLR', 'Spine (L / R)'],
  ['pelvisFB', 'Pelvis (Fwd / Bwd)'],
  ['pelvisLR', 'Pelvis (L / R)'],
  ['lowerLimbs', 'Lower Limbs'],
];

function fmtValue(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}°`;
}

export default function PostureList({ posture }: { posture: Posture | null | undefined }) {
  const hasAny = posture && POSTURE_AXES.some(([key]) => posture[key]?.finding || posture[key]?.value != null);
  if (!hasAny) {
    return <div className="text-muted" style={{ fontSize: '0.8rem' }}>No posture evaluation was read from this report.</div>;
  }
  return (
    <div className="posture-list">
      {POSTURE_AXES.map(([key, label]) => {
        const axis = posture?.[key];
        if (!axis || (!axis.finding && axis.value == null)) return null;
        const isNormal = (axis.finding ?? '').trim().toLowerCase() === 'normal';
        return (
          <div className="posture-row" key={key}>
            <span className="posture-axis">{label}</span>
            <div className="posture-finding-row">
              <span className={`posture-finding${isNormal ? ' posture-finding--normal' : ''}`}>{axis.finding ?? '—'}</span>
              <span className="posture-value">{fmtValue(axis.value)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
