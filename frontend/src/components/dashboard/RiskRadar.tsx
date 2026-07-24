'use client';

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

interface RiskRadarProps {
  labels: string[];
  values: number[];
  // Optional per-axis Elevated-band cutoff (same order as labels/values —
  // see highThresholdsFor in lib/screeningAlerts.ts). Drawn as a dashed
  // unfilled guide polygon so the athlete's shape can be read directly
  // against their personalised threshold rather than against a bare number.
  thresholds?: number[];
}

const THRESHOLD_RED = '#d14b4b'; // matches --risk-high / BAND.red used everywhere else "Elevated" is drawn

export default function RiskRadar({ labels, values, thresholds }: RiskRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const isDark = useIsDark();

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;
    const pal = chartPalette(isDark);

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          // Drawn first (behind the athlete's shape) so it reads as a
          // boundary the shape is measured against, not a second reading.
          ...(thresholds && thresholds.length === values.length
            ? [
                {
                  label: 'Elevated threshold',
                  data: thresholds,
                  backgroundColor: 'transparent',
                  borderColor: THRESHOLD_RED,
                  borderDash: [5, 4],
                  borderWidth: 1.5,
                  pointRadius: 0,
                  pointHoverRadius: 0,
                },
              ]
            : []),
          {
            label: 'Risk %',
            data: values,
            backgroundColor: isDark ? 'rgba(224,184,78,0.22)' : 'rgba(200,155,60,0.18)',
            borderColor: pal.gold,
            pointBackgroundColor: pal.gold,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 30,
            ticks: { display: false },
            grid: { color: pal.grid },
            angleLines: { color: pal.grid },
            pointLabels: { color: pal.tick },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: (item) => item.dataset.label !== 'Elevated threshold',
          },
        },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values, thresholds, isDark]);

  return (
    <div style={{ position: 'relative', height: 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
