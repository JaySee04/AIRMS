'use client';

type RiskCls = 'under' | 'low' | 'mod' | 'high';

interface AcwrGaugeProps {
  acwr: number;
  lowMin: number;
  lowMax: number;
  modMax: number;
  compositeCls?: RiskCls;
  /** Final risk label after composite escalation (e.g. "Compound Moderate Risk").
   *  Falls back to the matching band label when omitted. */
  compositeLabel?: string;
}

const AXIS_MAX = 2.0;
const CLS_TO_BAND_IDX: Record<RiskCls, number> = { under: 0, low: 1, mod: 2, high: 3 };

function computeBaseCls(acwr: number, lowMin: number, lowMax: number, modMax: number): RiskCls {
  if (acwr > modMax) return 'high';
  if (acwr > lowMax) return 'mod';
  if (acwr >= lowMin) return 'low';
  return 'under';
}

export default function AcwrGauge({ acwr, lowMin, lowMax, modMax, compositeCls, compositeLabel }: AcwrGaugeProps) {
  const markerPos = (Math.max(0, Math.min(AXIS_MAX, acwr)) / AXIS_MAX) * 100;
  const bands = [
    { cls: 'low',  label: 'Detraining Risk', pct: (lowMin / AXIS_MAX) * 100 },
    { cls: 'opt',  label: 'Low Risk',      pct: ((lowMax - lowMin) / AXIS_MAX) * 100 },
    { cls: 'mod',  label: 'Moderate Risk', pct: ((modMax - lowMax) / AXIS_MAX) * 100 },
    { cls: 'high', label: 'High Risk',     pct: ((AXIS_MAX - modMax) / AXIS_MAX) * 100 },
  ];
  const ticks = [
    { val: lowMin, pos: (lowMin / AXIS_MAX) * 100 },
    { val: lowMax, pos: (lowMax / AXIS_MAX) * 100 },
    { val: modMax, pos: (modMax / AXIS_MAX) * 100 },
  ];

  const baseCls = computeBaseCls(acwr, lowMin, lowMax, modMax);
  const rawIdx = CLS_TO_BAND_IDX[baseCls];
  const compositeIdx = compositeCls ? CLS_TO_BAND_IDX[compositeCls] : rawIdx;
  const showComposite = compositeIdx !== rawIdx;

  return (
    <div
      className="acwr-gauge"
      role="img"
      aria-label={`ACWR ${acwr.toFixed(2)} — personalised low-risk band ${lowMin.toFixed(2)} to ${lowMax.toFixed(2)}${showComposite ? `; composite-risk class is ${bands[compositeIdx].label}` : ''}`}
    >
      <div className="acwr-gauge-title">ACWR risk position</div>
      <div className="acwr-gauge-track">
        {bands.map((b, i) => {
          const isComposite = showComposite && i === compositeIdx;
          return (
            <div
              key={b.cls}
              className={`acwr-gauge-band acwr-gauge-band--${b.cls}${isComposite ? ' acwr-gauge-band--composite' : ''}`}
              style={{ width: `${b.pct}%` }}
              title={isComposite ? `${b.label} — composite-risk class` : b.label}
            >
              {isComposite && <span className="acwr-gauge-composite-tag">composite ▼</span>}
            </div>
          );
        })}
        <div className="acwr-gauge-marker" style={{ left: `${markerPos}%` }} aria-hidden />
      </div>
      <div className="acwr-gauge-scale">
        {ticks.map((t) => (
          <span key={t.val} style={{ left: `${t.pos}%` }}>{t.val.toFixed(2)}</span>
        ))}
      </div>
      <div className="acwr-gauge-legend">
        <span className="acwr-gauge-legend-item acwr-gauge-legend-item--low">Detraining Risk</span>
        <span className="acwr-gauge-legend-item acwr-gauge-legend-item--opt">Low Risk</span>
        <span className="acwr-gauge-legend-item acwr-gauge-legend-item--mod">Moderate Risk</span>
        <span className="acwr-gauge-legend-item acwr-gauge-legend-item--high">High Risk</span>
      </div>
      {showComposite && (
        <div className="acwr-gauge-note">
          Workload alone (ACWR) classifies as <strong>{bands[rawIdx].label}</strong>. Active injury or biomechanical context escalates the final composite classification to <strong>{compositeLabel ?? bands[compositeIdx].label}</strong>.
        </div>
      )}
    </div>
  );
}
