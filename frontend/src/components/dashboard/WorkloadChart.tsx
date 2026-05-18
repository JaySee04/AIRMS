'use client';

import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Legend,
  Tooltip,
  Title,
} from 'chart.js';

Chart.register(
  BarController, BarElement,
  LineController, LineElement, PointElement,
  LinearScale, CategoryScale,
  Legend, Tooltip, Title,
);

interface WorkloadChartProps {
  labels: string[];
  weeklyLoads: number[];
  acwrSeries: number[];
}

const NAVY = '#0f2c4a';
const GOLD = '#c89b3c';

export default function WorkloadChart({ labels, weeklyLoads, acwrSeries }: WorkloadChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    chartRef.current?.destroy();
    chartRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Weekly Load',
            data: weeklyLoads,
            backgroundColor: NAVY,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'ACWR',
            data: acwrSeries,
            yAxisID: 'y1',
            borderColor: GOLD,
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: GOLD,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { title: { display: true, text: 'Load (AU)' }, beginAtZero: true },
          y1: {
            position: 'right',
            title: { display: true, text: 'ACWR' },
            grid: { display: false },
            suggestedMax: 2.0,
          },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    });

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [labels, weeklyLoads, acwrSeries]);

  return (
    <div style={{ position: 'relative', height: 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
