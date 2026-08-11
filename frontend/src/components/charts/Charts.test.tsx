// Chart primitives — rendered to static markup and inspected.
//
// These are presentational, so the bugs they get are geometric: a chart that
// doesn't fill its space, values that all land on the same position, an axis that
// hides its own zoom. Those were exactly the faults in the admin dashboard this
// module replaced, and screenshots caught them once but cannot keep catching them.
//
// Uses react-dom/server rather than a DOM testing library — no jsdom or
// @testing-library in this project, and renderToStaticMarkup needs neither. It
// works because every component here is pure: props in, markup out, no hooks.

import { renderToStaticMarkup as render } from 'react-dom/server';
import { DotPlot, Heatmap, PeriodChart, RankedBars, Ring } from './Charts';

const period = (key: string, label: string, value: number, line?: number) => ({
  key,
  label,
  value,
  segments: [
    { label: 'Safe', value: Math.round(value * 0.6), color: 'var(--risk-low)' },
    { label: 'Needs attention', value: Math.round(value * 0.3), color: 'var(--risk-moderate)' },
    { label: 'Immediate', value: Math.round(value * 0.1), color: 'var(--risk-high)' },
  ],
  line: line ?? null,
});

// Percentage widths, in document order.
const widths = (html: string) => [...html.matchAll(/width:\s*([\d.]+)%/g)].map((m) => Number(m[1]));

describe('PeriodChart — layout follows the number of periods', () => {
  it('draws COLUMNS once there are several periods', () => {
    const html = render(<PeriodChart points={[1, 2, 3, 4, 5, 6].map((i) => period(`p${i}`, `M${i}`, 10 + i, 70 + i))} />);
    expect(html).toContain('periodchart-svg');
    expect(html).toContain('<rect');
    expect(html).not.toContain('periodrow-track');
  });

  it('draws ROWS when there are few, instead of two blocks and a canyon', () => {
    // The reported fault: quarterly/yearly views of a young dataset have one or
    // two periods, and as columns that reads like a chart that failed to load.
    const html = render(<PeriodChart points={[period('q2', 'Q2 2026', 43, 73.6), period('q3', 'Q3 2026', 22, 72.3)]} />);
    expect(html).toContain('periodrow-track');
    expect(html).not.toContain('periodchart-svg');
  });

  it('a single period still renders as a row, not an empty plot', () => {
    const html = render(<PeriodChart points={[period('y', '2026', 58, 73)]} />);
    expect(html).toContain('periodrow-track');
    expect(html).toContain('2026');
  });

  it('row length is the count on a SHARED scale, so 22 reads as half of 43', () => {
    const html = render(<PeriodChart points={[period('q2', 'Q2', 43), period('q3', 'Q3', 22)]} valueLabel="Athletes tested" />);
    const bars = widths(html).filter((w) => w > 0);
    // First row is the max, so 100%; the second is 22/43.
    expect(bars[0]).toBeCloseTo(100, 0);
    expect(bars[1]).toBeCloseTo((22 / 43) * 100, 0);
  });

  it('shows the line series per row when it is present, and omits the column when not', () => {
    const withLine = render(<PeriodChart points={[period('a', 'A', 10, 70), period('b', 'B', 20, 75)]} lineLabel="Average Total Score" />);
    expect(withLine).toContain('periodrow-line');
    const withoutLine = render(<PeriodChart points={[period('a', 'A', 10), period('b', 'B', 20)]} />);
    expect(withoutLine).not.toContain('periodrow-line');
  });

  it('renders nothing for no periods rather than an empty frame', () => {
    expect(render(<PeriodChart points={[]} />)).toBe('');
  });
});

describe('DotPlot — the zoomed axis that made clustered scores readable', () => {
  // The four cohort averages that rendered as four identical bars on a 0-100 track.
  const rows = [
    { label: 'Total', value: 73.4 },
    { label: 'ROM', value: 75.9 },
    { label: 'Stability', value: 76.2 },
    { label: 'Symmetry', value: 75.7 },
  ];

  it('separates values that a 0-100 track would flatten', () => {
    const html = render(<DotPlot rows={rows} min={0} max={100} />);
    const lefts = [...html.matchAll(/left:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    const distinct = new Set(lefts.map((l) => Math.round(l)));
    // Four rows, four visibly different dot positions.
    expect(distinct.size).toBeGreaterThanOrEqual(4);
  });

  it('DECLARES its zoom, because a zoomed axis exaggerates', () => {
    const html = render(<DotPlot rows={rows} min={0} max={100} />);
    expect(html).toMatch(/Axis zoomed to/);
    expect(html).toContain('0–100 scale');
  });

  it('survives a single value without collapsing to a zero-width axis', () => {
    const html = render(<DotPlot rows={[{ label: 'Total', value: 73.4 }]} />);
    expect(html).toContain('dotplot-dot');
  });

  it('says so when there is nothing to plot', () => {
    const html = render(<DotPlot rows={[{ label: 'Total', value: null }]} />);
    expect(html).toContain('No data for this selection');
  });
});

describe('RankedBars — one shared axis so rows compare', () => {
  it('scales every row against the largest, not against itself', () => {
    // The 100%-stacked version made "Ankle 13" and "Neck 6" the same length.
    const html = render(<RankedBars rows={[
      { label: 'Ankle', segments: [{ label: 'Elevated', value: 13, color: 'red' }] },
      { label: 'Neck', segments: [{ label: 'Elevated', value: 6, color: 'red' }] },
    ]} />);
    const bars = widths(html).filter((w) => w > 0 && w <= 100);
    expect(bars[0]).toBeCloseTo(100, 0);
    expect(bars[1]).toBeCloseTo((6 / 13) * 100, 0);
  });

  it('renders a zero row without a bar rather than crashing', () => {
    const html = render(<RankedBars rows={[{ label: 'Joint Pain', segments: [{ label: 'Elevated', value: 0, color: 'red' }] }]} />);
    expect(html).toContain('Joint Pain');
  });
});

describe('Ring', () => {
  it('states the value, the total and an accessible label', () => {
    const html = render(<Ring value={58} total={62} label="Screened" />);
    expect(html).toContain('58');
    expect(html).toContain('of 62');
    expect(html).toContain('94%');
  });

  it('does not divide by zero on an empty roster', () => {
    const html = render(<Ring value={0} total={0} label="Screened" />);
    expect(html).toContain('of 0');
  });
});

describe('Heatmap — the matrix the subitem table actually is', () => {
  const rows = [
    { key: 'neck', label: 'Neck', cells: [{ key: 'romL', label: 'ROM L', value: 88 }, { key: 'romR', label: 'ROM R', value: 68.3 }] },
    { key: 'pelvis', label: 'Pelvis', cells: [{ key: 'romL', label: 'ROM L', value: 68 }, { key: 'romR', label: 'ROM R', value: null }] },
  ];
  const colorFor = (v: number) => (v >= 75 ? 'green' : 'red');

  it('keeps both axes — a row per region, a column per measure', () => {
    const html = render(<Heatmap rows={rows} colorFor={colorFor} />);
    expect(html).toContain('Neck');
    expect(html).toContain('Pelvis');
    expect(html).toContain('ROM L');
    expect(html).toContain('ROM R');
  });

  it('prints the VALUE in every cell, so meaning is never colour-alone', () => {
    const html = render(<Heatmap rows={rows} colorFor={colorFor} />);
    expect(html).toContain('88');
    expect(html).toContain('68.3');
  });

  it('leaves an unread cell blank rather than colouring it as a score', () => {
    // A missing reading painted green would say "good" about something never
    // measured.
    const html = render(<Heatmap rows={rows} colorFor={colorFor} />);
    expect(html).toContain('heatmap-empty');
  });

  it('says so when there is nothing to show', () => {
    expect(render(<Heatmap rows={[]} colorFor={colorFor} />)).toContain('No subitem scores');
  });
});
