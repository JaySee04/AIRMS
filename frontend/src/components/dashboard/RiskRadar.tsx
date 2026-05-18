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

Chart.register(RadarController, PointElement, LineElement, RadialLinearScale, Legend, Tooltip, Filler);

interface RiskRadarProps {
  labels: string[];
  values: number[];
}

const GOLD = '#c89b3c';

export default function RiskRadar({ labels, values }: RiskRadarProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'radar',
      data: {
        labels,
        datasets: [
          {
            label: 'Risk %',
            data: values,
            backgroundColor: 'rgba(200, 155, 60, 0.18)',
            borderColor: GOLD,
            pointBackgroundColor: GOLD,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { r: { min: 0, max: 30, ticks: { display: false } } },
        plugins: { legend: { display: false } },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, values]);

  return (
    <div style={{ position: 'relative', height: 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
