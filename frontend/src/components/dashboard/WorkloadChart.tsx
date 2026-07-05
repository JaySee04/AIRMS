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
import { useIsDark, chartPalette } from '@/lib/chartTheme';

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
  // Optional: per-week breakdown of load by activity type, aligned to `labels`.
  // When provided, the bar tooltip lists each type and its AU contribution —
  // gives clinicians context for what made up a load spike.
  typeBreakdowns?: Array<Record<string, number>>;
}

export default function WorkloadChart({ labels, weeklyLoads, acwrSeries, typeBreakdowns }: WorkloadChartProps) {
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
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            type: 'bar',
            label: 'Weekly Load',
            data: weeklyLoads,
            backgroundColor: pal.bar,
            borderRadius: 4,
            yAxisID: 'y',
          },
          {
            type: 'line',
            label: 'ACWR',
            data: acwrSeries,
            yAxisID: 'y1',
            borderColor: pal.gold,
            backgroundColor: 'transparent',
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: pal.gold,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            title: { display: true, text: 'Load (AU)', color: pal.tick },
            beginAtZero: true,
            grid: { color: pal.grid },
            ticks: { color: pal.tick },
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'ACWR', color: pal.tick },
            grid: { display: false },
            ticks: { color: pal.tick },
            suggestedMax: 2.0,
          },
          x: {
            grid: { color: pal.grid },
            ticks: { color: pal.tick },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { color: pal.tick } },
          tooltip: {
            callbacks: {
              afterBody: (items) => {
                if (!typeBreakdowns) return '';
                const barItem = items.find((i) => i.dataset.type === 'bar');
                if (!barItem) return '';
                const breakdown = typeBreakdowns[barItem.dataIndex];
                if (!breakdown) return '';
                const entries = Object.entries(breakdown)
                  .filter(([, v]) => v > 0)
                  .sort((a, b) => b[1] - a[1]);
                if (entries.length === 0) return '';
                return ['', 'Breakdown:', ...entries.map(([t, v]) => `  ${t}: ${v.toLocaleString()} AU`)];
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
  }, [labels, weeklyLoads, acwrSeries, typeBreakdowns, isDark]);

  return (
    <div style={{ position: 'relative', height: 300 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
