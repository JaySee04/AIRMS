'use client';

// The exercise-risk radar: a REFERENCE REGION with the athlete drawn over it.
//
// JC, 2026-10-06 (§127): "make it more easy to understand... a radarish [norm]
// and use lines to show the athlete's shape, and highlight the ones that are
// over... Also place labels to ensure people understand it."
//
// WHAT CHANGED AND WHY IT IS THE RIGHT WAY ROUND NOW. The athlete used to be the
// FILLED gold shape and the threshold a thin dashed line behind it, so the thing
// being judged was visually heavier than the thing judging it. Reading a breach
// meant eyeballing which of two overlapping outlines was outside the other.
// Inverted, the question becomes shape recognition: the acceptable region is a
// solid field, the athlete is a line, and a breach is the line leaving the field.
//
// THE REGION IS NOT GREEN, AND THAT WAS DEBATED RATHER THAN ASSUMED (§127.2).
// A bright green field would say "inside here you are fine" in one colour with no
// words, which is the §33 reassurance failure — the green band in this product
// reads "No indicators flagged" and deliberately never "Safe". It would also be
// concretely wrong: this boundary is the ELEVATED cutoff, so the whole WATCH band
// sits inside the region. An athlete who needs attention would be sitting
// comfortably in the green. Neutral gets the identical shape-recognition benefit
// and asserts nothing.
//
// THE BOUNDARY IS A THRESHOLD, NOT A COHORT AVERAGE, and that distinction is
// load-bearing. `highThresholdsFor(sport)` is the sport-tightened Elevated cutoff.
// Drawing the cohort MEAN here instead and flagging everything outside it would
// put about half the squad over the line by construction — which is the defect
// the below-mean escalation rule already had (it fired at z<0 and flagged 27 of
// 58 seeded athletes; §32 moved it to -0.5 SD). Do not make this the norm.
//
// LABELS, because there were none. `legend` was display:false and `ticks` was
// display:false with `max` hard-coded to 30, so the chart had no key, no scale,
// and no way to tell a breach of one point from a breach of fifteen. The legend
// is on, the radial ticks are on, and the caller renders a per-spoke "over by N"
// list from `onReadout` — the question the picture alone cannot answer.
import { useEffect, useRef } from 'react';
import {
  Chart,
  RadarController,
  PointElement,
  LineElement,
  RadialLinearScale,
  Legend,
  Tooltip,
  Filler,
} from 'chart.js';
import { useIsDark, chartPalette } from '@/lib/chartTheme';

Chart.register(RadarController, PointElement, LineElement, RadialLinearScale, Legend, Tooltip, Filler);

/** One spoke's verdict, for the caller's readout list. */
export interface RadarReadout {
  label: string;
  value: number;
  threshold: number | null;
  /** Points above the Elevated cutoff. Null when there is no cutoff to compare. */
  over: number | null;
}

interface RiskRadarProps {
  labels: string[];
  values: number[];
  // Per-axis Elevated-band cutoff, same order as labels/values (see
  // highThresholdsFor in lib/screeningAlerts.ts). Drawn as the FILLED reference
  // region the athlete's line is read against.
  thresholds?: number[];
  /**
   * Called with the per-spoke comparison so the page can print it.
   *
   * The chart is a shape; "shoulder is 4 over" is a sentence. A reader deciding
   * who to assess needs the sentence, and until now it existed only inside a
   * hover tooltip — invisible on a touch screen and invisible in a screenshot
   * pasted into a case note.
   */
  onReadout?: (rows: RadarReadout[]) => void;
  /**
   * Drawn height in px. 320 suits a full-width card; the medical hero passes a
   * smaller one, where the chart shares a row with the identity card and 320
   * pushed the row taller than either side needed (JC, §137).
   *
   * A prop rather than a CSS class because Chart.js sizes to its container and
   * has to be given the number at render.
   */
  height?: number;
}

export default function RiskRadar({
  labels, values, thresholds, onReadout, height = 320,
}: RiskRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pal = chartPalette(isDark);

    const hasThresholds = !!thresholds && thresholds.length === values.length;
    const over = hasThresholds ? values.map((v, i) => v >= thresholds![i]) : values.map(() => false);
    // pal.riskHigh, not a literal: this red is the risk hero's band colour a few
    // pixels away and has to lift in dark mode with it.
    const breachRed = pal.riskHigh;
    const ptColor = over.map((o) => (o ? breachRed : pal.tick));

    // The scale has to cover the data AND the boundary, or a breach can be
    // clipped at the rim and read as "exactly at threshold". Was hard-coded to 30.
    const ceiling = Math.max(30, ...values, ...(hasThresholds ? thresholds! : []));
    const axisMax = Math.ceil(ceiling / 10) * 10;

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          // THE REFERENCE REGION, drawn first so the athlete's line sits over it.
          ...(hasThresholds
            ? [
                {
                  label: 'Within the Elevated cutoff',
                  data: thresholds,
                  // GREEN, ON JC'S INSTRUCTION — asked twice (§137).
                  //
                  // It was neutral grey, and the reasoning stays on record rather
                  // than being quietly deleted: the Watch band sits INSIDE this
                  // boundary, so a green field says "in here is fine" about
                  // athletes who are on watch. That is the §33 shape.
                  //
                  // JC's case is that the chart is read by athletes and coaches,
                  // not only clinicians, and a grey field reads as chrome rather
                  // than as the target it is meant to be. A guide nobody
                  // recognises as a guide is not doing its job either.
                  //
                  // WHAT KEEPS IT HONEST, now that the colour no longer does:
                  //   * the breach list beside the chart names every spoke that is
                  //     over, WITH its reading, its cutoff and the gap;
                  //   * the legend says "within the Elevated cutoff" — never
                  //     "safe", "clear" or "normal";
                  //   * the §33 band wording on the hero is untouched, and the
                  //     pinned caveat "a breach is a reason to examine, not a
                  //     diagnosis" still sits on the card.
                  // The field is a reference region; nothing on the page calls it
                  // a verdict.
                  //
                  // Low alpha deliberately: the athlete's gold line has to stay
                  // the figure and this the ground.
                  backgroundColor: isDark ? 'rgba(92,196,122,0.22)' : 'rgba(61,124,71,0.16)',
                  borderColor: isDark ? 'rgba(92,196,122,0.85)' : 'rgba(61,124,71,0.75)',
                  borderDash: [4, 3],
                  borderWidth: 1,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  fill: true,
                },
              ]
            : []),
          {
            label: "This athlete's reading",
            data: values,
            // A LINE, not a fill. Two filled polygons made the reader work out
            // which was on top; one field and one line do not.
            backgroundColor: 'transparent',
            fill: false,
            borderColor: pal.gold,
            borderWidth: 2,
            pointBackgroundColor: ptColor,
            pointBorderColor: ptColor,
            // A breached spoke is bigger AND red: size survives greyscale, and
            // colour alone is never the only channel (SILENT_FAILURES 3i).
            pointRadius: over.map((o) => (o ? 6 : 3)),
            pointHoverRadius: over.map((o) => (o ? 8 : 5)),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: axisMax,
            // ON. Without a scale there is no way to tell a breach of one point
            // from a breach of fifteen, which is most of what "hard to
            // understand" meant.
            ticks: {
              display: true,
              color: pal.tick,
              backdropColor: 'transparent',
              stepSize: Math.max(5, Math.round(axisMax / 4 / 5) * 5),
              font: { size: 9 },
            },
            grid: { color: pal.grid },
            angleLines: { color: pal.grid },
            pointLabels: { color: pal.tick, font: { size: 11 } },
          },
        },
        plugins: {
          // ON. The two shapes mean different things and nothing said which was
          // which — the single most answerable part of "make it easier to
          // understand".
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: pal.tick,
              boxWidth: 12,
              font: { size: 11 },
              usePointStyle: false,
            },
          },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${item.formattedValue} / ${axisMax}`,
              afterLabel: (item) => {
                if (!hasThresholds || item.datasetIndex === 0) return '';
                const t = thresholds![item.dataIndex];
                const gap = Math.round((values[item.dataIndex] - t) * 10) / 10;
                if (gap > 0) return `Elevated cutoff ${t} · ${gap} over — assess`;
                if (gap === 0) return `Elevated cutoff ${t} · at the cutoff`;
                return `Elevated cutoff ${t} · ${-gap} below`;
              },
            },
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values, thresholds, isDark]);

  // Reported in its own effect, not from inside the chart build: the chart is
  // recreated on a theme change and the readout must not be re-emitted for that.
  //
  // GUARDED BY VALUE, AND THIS IS NOT OPTIONAL. `values` and `thresholds` arrive
  // as FRESH ARRAYS on every render of the parent — riskRadarSeries(view.risks)
  // builds one each time — so an effect keyed on them fires on every render.
  // Calling the parent's setState from there re-renders the parent, which builds
  // new arrays, which fires the effect again: an infinite loop. It is the trap
  // CLAUDE.md records for a stub that returns a fresh object each render, and it
  // hung the medical dashboard — the route answered 200 in 233ms while
  // networkidle2 never settled, which is what that failure looks like from
  // outside.
  //
  // Comparing the SERIALISED readout rather than array identity is what makes the
  // effect idempotent: a re-render for an unrelated reason emits nothing.
  //
  // Comparing the SERIALISED readout rather than the array identity is what makes
  // the effect idempotent: re-rendering for an unrelated reason emits nothing.
  const lastReadout = useRef<string>('');
  useEffect(() => {
    if (!onReadout) return;
    const has = !!thresholds && thresholds.length === values.length;
    const rows = labels.map((label, i) => {
      const t = has ? thresholds![i] : null;
      return {
        label,
        value: values[i],
        threshold: t,
        over: t === null ? null : Math.round((values[i] - t) * 10) / 10,
      };
    });
    const key = JSON.stringify(rows);
    if (key === lastReadout.current) return;
    lastReadout.current = key;
    onReadout(rows);
  }, [labels, values, thresholds, onReadout]);

  return (
    <div style={{ position: 'relative', height }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
