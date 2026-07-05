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
}

export default function RiskRadar({ labels, values }: RiskRadarProps) {
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
        plugins: { legend: { display: false } },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values, isDark]);

  return (
    <div style={{ position: 'relative', height: 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
