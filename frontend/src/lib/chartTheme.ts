'use client';

// Theme-aware palette for Chart.js. Chart.js needs literal colour values at
// build time (it can't read CSS custom properties), so charts can't rely on the
// --token system the rest of the UI uses. This hook reads the app theme
// (data-theme on <html>, set by DashboardLayout) and re-renders consumers when
// it flips, so each chart can rebuild with colours that stay legible on both
// the light card (#fff) and the dark card (#1a2535).

import { useEffect, useState } from 'react';

export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const read = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export interface ChartPalette {
  bar: string;      // primary categorical series (navy in light, lifted blue in dark)
  gold: string;     // secondary accent series
  grid: string;     // axis grid / radar web lines
  tick: string;     // axis ticks, titles, point labels, legend text
  barFill: string;  // translucent fill for line/area datasets
  cardBg: string;   // the card surface — used to section pie/doughnut slices (Google-Forms style)
  // Status colours, for charts that draw a risk meaning (an Elevated cutoff, a
  // breached spoke). These MUST track the --risk-* custom properties in
  // globals.css, because the same status is drawn as CSS elsewhere on the page:
  // a radar sits directly beside the risk hero, so a threshold ring in one red
  // and a band badge in another reads as two different meanings.
  riskLow: string;
  riskMod: string;
  riskHigh: string;
}

// Light keeps the brand navy; dark lifts it to a mid blue that reads on the dark
// card, and softens grid/tick colours so axes are visible but not shouty.
// The risk* values are the literal light/dark values of --risk-low /
// --risk-moderate / --risk-high — Chart.js cannot read custom properties, so
// this is the one place they are duplicated. Keep them in step with globals.css.
export function chartPalette(isDark: boolean): ChartPalette {
  return isDark
    ? {
        bar: '#5b9bd5', gold: '#e0b84e', grid: 'rgba(255,255,255,0.10)', tick: '#8899aa',
        barFill: 'rgba(91,155,213,0.18)', cardBg: '#1a2535',
        riskLow: '#5cc47a', riskMod: '#e6b84e', riskHigh: '#e57373',
      }
    : {
        bar: '#0f2c4a', gold: '#c89b3c', grid: 'rgba(0,0,0,0.08)', tick: '#6b7280',
        barFill: 'rgba(15,44,74,0.10)', cardBg: '#ffffff',
        riskLow: '#3d7c47', riskMod: '#c89b3c', riskHigh: '#b03030',
      };
}
