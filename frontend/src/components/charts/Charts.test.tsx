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
import {
  DotPlot, Heatmap, Histogram, MetricDeltas, PeriodChart, RankedBars, Ring, Scatter,
} from './Charts';

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

  // CHANGED 2026-08-11: one period used to render as a single row. It is not a
  // trend at all, and no layout makes one point look like one, so it now gets a
  // summary that says outright there is nothing to compare against.
  it('a single period is a SUMMARY, not a trend', () => {
    const html = render(<PeriodChart points={[period('y', '2026', 58, 73)]} />);
    expect(html).toContain('single-period');
    expect(html).not.toContain('periodrow-track');
    expect(html).not.toContain('periodchart-svg');
    expect(html).toContain('2026');
    expect(html).toContain('58');
    // And it says why, rather than leaving a lone bar to be interpreted.
    expect(html).toMatch(/no change to report yet/);
  });

  it('draws an EMPTY period rather than skipping it', () => {
    // Continuous axis: "nobody was screened that month" is the finding for a
    // screening programme, and a discrete axis hid it by omitting the bucket.
    const html = render(<PeriodChart points={[
      period('m1', 'Apr', 17), { key: 'm2', label: 'May', value: 0, segments: [], line: null }, period('m3', 'Jun', 21),
    ]} />);
    expect(html).toContain('periodrow--empty');
    expect(html).toContain('no screening');
    expect(html).toContain('May');
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

describe('Scatter — the athlete an average hides', () => {
  // Real shape from the seeded cohort: most athletes cluster, and a few move well
  // AND carry high risk. Those are the ones the page exists to surface.
  const pts = [
    { key: 'a', label: 'Nazwan', x: 78, y: 14 },
    { key: 'b', label: 'Yusof', x: 90, y: 30 },
    { key: 'c', label: 'Low', x: 60, y: 12 },
    { key: 'd', label: 'Mid', x: 75, y: 20 },
  ];

  it('places one dot per athlete', () => {
    const html = render(<Scatter points={pts} xLabel="Total Score" yLabel="Exercise Risks" />);
    expect((html.match(/scatter-dot/g) || []).length).toBe(4);
  });

  it('positions dots by BOTH measures, not just one', () => {
    const html = render(<Scatter points={pts} xLabel="Total Score" yLabel="Exercise Risks" />);
    const lefts = [...html.matchAll(/left:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    const tops = [...html.matchAll(/top:\s*([\d.]+)%/g)].map((m) => Number(m[1]));
    expect(new Set(lefts).size).toBeGreaterThan(1);
    expect(new Set(tops).size).toBeGreaterThan(1);
  });

  it('splits the quadrants on the cohort MEDIAN, not a fixed cut-off', () => {
    // "High risk" has to mean high for this group — a fixed line would call a
    // whole strong squad high-risk, or a whole weak one safe.
    const html = render(<Scatter points={pts} xLabel="x" yLabel="y" />);
    expect(html).toContain('scatter-cross');
    expect(html).toMatch(/median/);
  });

  it('labels the quadrants when asked', () => {
    const html = render(<Scatter points={pts} xLabel="x" yLabel="y"
      quadrants={['High risk · poor mover', 'High risk · good mover', 'Low risk · good mover', 'Low risk · poor mover']} />);
    expect(html).toContain('High risk · good mover');
  });

  it('says so when nobody has both measures', () => {
    expect(render(<Scatter points={[]} xLabel="x" yLabel="y" />)).toContain('No athletes with both measures');
  });
});

describe('Histogram — the shape an average destroys', () => {
  it('bins the values and labels each non-empty bin with its count', () => {
    const html = render(<Histogram values={[41, 42, 43, 58, 59]} min={40} max={60} binSize={5} />);
    expect(html).toContain('histogram-bar');
    expect(html).toContain('3');
    expect(html).toContain('2');
  });

  it('distinguishes a tight cluster from a split squad', () => {
    // Same mean, completely different squads — the case that motivates the panel.
    const tight = render(<Histogram values={[49, 50, 50, 51]} min={0} max={100} binSize={5} />);
    const split = render(<Histogram values={[30, 30, 70, 70]} min={0} max={100} binSize={5} />);
    const bars = (h: string) => (h.match(/histogram-bar/g) || []).length;
    // Same number of bins, but the counts land in different places, so the two
    // markups differ — an average would render them identically.
    expect(bars(tight)).toBe(bars(split));
    expect(tight).not.toBe(split);
  });

  it('draws reference markers, e.g. the band boundary', () => {
    const html = render(<Histogram values={[50]} min={0} max={100} binSize={10}
      markers={[{ at: 50, label: 'Cohort average (50)', color: 'grey' }]} />);
    expect(html).toContain('histogram-marker');
    expect(html).toContain('Cohort average (50)');
  });

  // The athlete squad view marks the READER's own position with a marker, so
  // where the line lands is the whole message. Asserting only that a marker
  // renders would pass with every marker pinned to the left edge.
  it('positions a marker by its value, not just draws one', () => {
    const at = (v: number) => {
      const html = render(<Histogram values={[50]} min={0} max={100} binSize={10}
        markers={[{ at: v, label: `You (${v})`, color: 'black' }]} />);
      return (html.match(/histogram-marker[^>]*left:\s*([\d.]+)%/) || [])[1];
    };
    expect(at(51)).toBe('51');
    expect(at(20)).toBe('20');
    expect(at(80)).toBe('80');
  });

  it('scales a marker to the axis range, not to the raw value', () => {
    const html = render(<Histogram values={[45]} min={40} max={60} binSize={5}
      markers={[{ at: 45, label: 'You (45)', color: 'black' }]} />);
    // 45 on a 40-60 axis is a quarter of the way across, not 45%.
    expect(html).toMatch(/histogram-marker[^>]*left:\s*25%/);
  });

  it('puts an out-of-range value in the nearest bin rather than dropping it', () => {
    const html = render(<Histogram values={[-5, 150]} min={0} max={100} binSize={50} />);
    // Both counted: one in the first bin, one in the last.
    expect((html.match(/histogram-n/g) || []).length).toBe(2);
  });

  it('says so when there is nothing scored', () => {
    expect(render(<Histogram values={[]} min={0} max={100} binSize={5} />)).toContain('No scored athletes');
  });
});

describe('MetricDeltas — what changed between two periods', () => {
  // The real Q2 -> Q3 movement. These metrics are NOT commensurable — 72-78 for
  // the movement scores, ~50 for the indicator, ~18 for risks — which is exactly
  // why the slopegraph this replaced collapsed them into overlapping lines.
  const metrics = [
    { key: 'rom', label: 'ROM', from: 77.6, to: 72.4, higherBetter: true, direction: 'declining' as const },
    { key: 'stability', label: 'Stability', from: 75.4, to: 78, higherBetter: true, direction: 'improving' as const },
    { key: 'symmetry', label: 'Symmetry', from: 74.6, to: 74.9, higherBetter: true, direction: 'steady' as const },
    { key: 'risk', label: 'Exercise risks', from: 18.2, to: 20.5, higherBetter: false, direction: 'declining' as const },
  ];

  it('shows before, after and the signed change for every metric', () => {
    const html = render(<MetricDeltas metrics={metrics} fromLabel="Q2 2026" toLabel="Q3 2026" />);
    expect(html).toContain('77.6');
    expect(html).toContain('72.4');
    expect(html).toContain('-5.2');
    expect(html).toContain('+2.6');
    expect(html).toContain('Q2 2026 → Q3 2026');
  });

  it('orders by the SIZE of the change, not by metric order', () => {
    const html = render(<MetricDeltas metrics={metrics} fromLabel="A" toLabel="B" />);
    // ROM moved 5.2, stability 2.6, risks 2.3, symmetry 0.3.
    expect(html.indexOf('ROM')).toBeLessThan(html.indexOf('Stability'));
    expect(html.indexOf('Stability')).toBeLessThan(html.indexOf('Symmetry'));
  });

  it('draws BETTER to the right on every row, including the inverted one', () => {
    // Exercise risks rose 18.2 -> 20.5, which is worse, so its bar must go LEFT
    // even though the raw number went up. A sign-based bar would put it right.
    const html = render(<MetricDeltas
      metrics={[{ key: 'risk', label: 'Exercise risks', from: 18.2, to: 20.5, higherBetter: false, direction: 'declining' }]}
      fromLabel="A" toLabel="B" />);
    expect(html).toMatch(/right:50%/);
    expect(html).not.toMatch(/left:50%/);
    // ...and the printed number still carries its true sign.
    expect(html).toContain('+2.3');
  });

  it('draws an improvement to the right even when the raw number falls', () => {
    const html = render(<MetricDeltas
      metrics={[{ key: 'risk', label: 'Exercise risks', from: 20.5, to: 18.2, higherBetter: false, direction: 'improving' }]}
      fromLabel="A" toLabel="B" />);
    expect(html).toMatch(/left:50%/);
    expect(html).toContain('-2.3');
  });

  it('shares one bar scale, so the longest bar is the biggest move', () => {
    const html = render(<MetricDeltas metrics={metrics} fromLabel="A" toLabel="B" />);
    const widths2 = [...html.matchAll(/width:([\d.]+)%/g)].map((m) => Number(m[1]));
    // ROM is the largest gain (5.2) so it takes the full half-width; stability
    // (2.6) takes about half of that.
    expect(Math.max(...widths2)).toBeCloseTo(50, 0);
    expect(widths2[1]).toBeCloseTo((2.6 / 5.2) * 50, 0);
  });

  it('colours by the verdict, not the sign', () => {
    const html = render(<MetricDeltas
      metrics={[{ key: 'risk', label: 'Exercise risks', from: 20.5, to: 18.2, higherBetter: false, direction: 'improving' }]}
      fromLabel="A" toLabel="B" />);
    const bar = html.match(/class="mdelta-bar"[^>]*style="background:([^;"]+)/);
    expect(bar?.[1]).toBe('var(--risk-low)');
  });

  it('skips metrics missing either end', () => {
    const html = render(<MetricDeltas
      metrics={[...metrics, { key: 'x', label: 'Missing', from: 50, to: null }]}
      fromLabel="A" toLabel="B" />);
    expect(html).not.toContain('Missing');
  });

  // The within-athlete case: change is AVERAGED across pairs, so there is no
  // single before and after to print. Without this the panel had to fall back to
  // flat tiles that gave a real move and a dead zero the same visual weight.
  it('accepts a pre-computed delta when there are no two endpoints', () => {
    const html = render(<MetricDeltas
      valsHead="pairs that moved"
      metrics={[
        { key: 'ind', label: 'Overall indicator', from: null, to: null, delta: -1.7, higherBetter: true, direction: 'declining', vals: '19 of 19' },
        { key: 'rom', label: 'ROM', from: null, to: null, delta: 0, higherBetter: true, direction: 'steady', vals: 'none of them', note: 'no change recorded' },
      ]} />);
    expect(html).toContain('pairs that moved');
    expect(html).toContain('-1.7');
    expect(html).toContain('19 of 19');
    // The flat row states WHY it is flat instead of showing a bare direction.
    expect(html).toContain('no change recorded');
    // No row renders a "from → to" pair, because there is none to render. The
    // arrow in the axis header is a different thing and stays.
    expect(html).not.toContain('mdelta-arrow');
  });

  it('still ranks a supplied delta by size', () => {
    const html = render(<MetricDeltas
      metrics={[
        { key: 'small', label: 'Small mover', from: null, to: null, delta: 0.2, direction: 'steady' },
        { key: 'big', label: 'Big mover', from: null, to: null, delta: -4.4, direction: 'declining' },
      ]} />);
    expect(html.indexOf('Big mover')).toBeLessThan(html.indexOf('Small mover'));
  });

  it('says so when nothing is comparable', () => {
    const html = render(<MetricDeltas metrics={[{ key: 'a', label: 'A', from: null, to: null }]} fromLabel="A" toLabel="B" />);
    expect(html).toContain('Not enough data to compare');
  });
});

describe('PeriodChart — the sparse-grain layouts', () => {
  const p = (key: string, label: string, value: number) => ({
    key, label, value, segments: [{ label: 'Safe', value, color: 'var(--risk-low)' }], line: null,
  });

  it('TWO periods lead with the changes, keeping throughput as context', () => {
    const html = render(<PeriodChart
      points={[p('q2', 'Q2 2026', 43), p('q3', 'Q3 2026', 22)]}
      slope={[{ key: 'rom', label: 'ROM', from: 77.6, to: 72.4, higherBetter: true, direction: 'declining' }]} />);
    expect(html).toContain('mdelta-row');
    expect(html).toContain('slope-throughput');
    expect(html).toContain('periodrow-track');
  });

  it('two periods WITHOUT metric data still fall back to rows', () => {
    const html = render(<PeriodChart points={[p('a', 'A', 4), p('b', 'B', 9)]} />);
    expect(html).not.toContain('mdelta-row');
    expect(html).toContain('periodrow-track');
  });

  it('ONE period shows what it is made of, instead of a dead panel', () => {
    const html = render(<PeriodChart
      points={[p('y', '2026', 58)]}
      composition={[p('q2', 'Q2 2026', 43), p('q3', 'Q3 2026', 22)]}
      compositionGrain="quarter" />);
    expect(html).toContain('single-period');
    expect(html).toContain('What this year is made of');
    expect(html).toContain('Q2 2026');
    expect(html).toContain('Q3 2026');
  });

  it('one period with a single-bucket composition does not show an empty breakdown', () => {
    const html = render(<PeriodChart
      points={[p('y', '2026', 58)]}
      composition={[p('q2', 'Q2 2026', 58)]}
      compositionGrain="quarter" />);
    expect(html).not.toContain('is made of');
  });
});
