const {
  ageGroupOf, bandOf, tally, sliceBy, focusBreakdown, isShownIndicator, AGE_GROUPS,
} = require('../src/utils/cohortFocus');

// One athlete row as the analytics query returns it (flat Athlete columns).
const a = (name, over = {}) => ({
  athleteId: `ic-${name}`, name, sport: 'Badminton', gender: 'Male', program: 'PODIUM', age: 25,
  kneeInjuryRisk: 10, ankleInjuryRisk: 10, ...over,
});

describe('bandOf', () => {
  it('uses the AIRMS boundaries: Low <=15, Watch 16-25, Elevated >25', () => {
    expect(bandOf(0)).toBe('ok');
    expect(bandOf(15)).toBe('ok');
    expect(bandOf(16)).toBe('watch');
    expect(bandOf(25)).toBe('watch');
    expect(bandOf(26)).toBe('high');
  });
});

describe('ageGroupOf', () => {
  it('buckets on the shared boundaries', () => {
    expect(ageGroupOf(17)).toBe('Under 18');
    expect(ageGroupOf(18)).toBe('18-23 (junior)');
    expect(ageGroupOf(23)).toBe('18-23 (junior)');
    expect(ageGroupOf(24)).toBe('24-29 (senior)');
    expect(ageGroupOf(30)).toBe('30+ (veteran)');
    expect(ageGroupOf(51)).toBe('30+ (veteran)');
  });

  it('returns null for a missing or unparseable age', () => {
    expect(ageGroupOf(null)).toBeNull();
    expect(ageGroupOf(undefined)).toBeNull();
    expect(ageGroupOf('')).toBeNull();
  });

  it('uses ASCII labels — pdfkit Helvetica has no en-dash', () => {
    for (const g of AGE_GROUPS) {
      // eslint-disable-next-line no-control-regex
      expect(g.label).toMatch(/^[\x00-\x7F]*$/);
    }
  });
});

describe('tally', () => {
  it('counts bands and averages only the athletes who have a reading', () => {
    const t = tally([a('A', { kneeInjuryRisk: 5 }), a('B', { kneeInjuryRisk: 20 }), a('C', { kneeInjuryRisk: 30 })], 'kneeInjuryRisk');
    expect(t).toEqual({ n: 3, ok: 1, watch: 1, high: 1, avg: 18.3 });
  });

  it('skips nulls rather than counting them as zero', () => {
    const t = tally([a('A', { kneeInjuryRisk: 20 }), a('B', { kneeInjuryRisk: null })], 'kneeInjuryRisk');
    expect(t).toEqual({ n: 1, ok: 0, watch: 1, high: 0, avg: 20 });
  });

  it('handles an empty group', () => {
    expect(tally([], 'kneeInjuryRisk')).toEqual({ n: 0, ok: 0, watch: 0, high: 0, avg: null });
  });
});

describe('sliceBy', () => {
  it('orders worst-first by the SHARE elevated, not the raw count', () => {
    // Small squad: 3 of 4 elevated (75%). Large squad: 5 of 40 (12.5%).
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => a(`s${i}`, { sport: 'Hockey', kneeInjuryRisk: 30 })),
      a('s4', { sport: 'Hockey', kneeInjuryRisk: 5 }),
      ...Array.from({ length: 5 }, (_, i) => a(`b${i}`, { sport: 'Swimming', kneeInjuryRisk: 30 })),
      ...Array.from({ length: 35 }, (_, i) => a(`c${i}`, { sport: 'Swimming', kneeInjuryRisk: 5 })),
    ];
    const out = sliceBy(rows, 'kneeInjuryRisk', (r) => r.sport);
    expect(out[0].label).toBe('Hockey');
    expect(out[0]).toMatchObject({ n: 4, high: 3 });
    expect(out[1].label).toBe('Swimming');
  });

  it('respects an explicit order when given one', () => {
    const rows = [a('A', { gender: 'Female' }), a('B', { gender: 'Male' })];
    const out = sliceBy(rows, 'kneeInjuryRisk', (r) => r.gender, ['Male', 'Female']);
    expect(out.map((s) => s.label)).toEqual(['Male', 'Female']);
  });

  it('drops groups with no reading rather than showing an empty row', () => {
    const rows = [a('A', { sport: 'Badminton', kneeInjuryRisk: 20 }), a('B', { sport: 'Hockey', kneeInjuryRisk: null })];
    expect(sliceBy(rows, 'kneeInjuryRisk', (r) => r.sport).map((s) => s.label)).toEqual(['Badminton']);
  });

  it('ignores athletes with no value for the grouping key', () => {
    const rows = [a('A', { sport: 'Badminton' }), a('B', { sport: null }), a('C', { sport: '' })];
    expect(sliceBy(rows, 'kneeInjuryRisk', (r) => r.sport)).toHaveLength(1);
  });
});

describe('focusBreakdown', () => {
  const rows = [
    a('W1', { gender: 'Female', kneeInjuryRisk: 30 }),
    a('W2', { gender: 'Female', kneeInjuryRisk: 28 }),
    a('M1', { gender: 'Male', kneeInjuryRisk: 8 }),
    a('M2', { gender: 'Male', kneeInjuryRisk: 10 }),
  ];

  it('rejects an indicator that is not shown', () => {
    // Lumbar Disc Herniation is stored but never displayed (Dr Thung).
    expect(focusBreakdown(rows, 'spinalDiscHerniation')).toBeNull();
    expect(focusBreakdown(rows, 'nonsense')).toBeNull();
    expect(isShownIndicator('spinalDiscHerniation')).toBe(false);
  });

  it('answers "does one gender carry more of this problem"', () => {
    const f = focusBreakdown(rows, 'kneeInjuryRisk');
    const byGender = Object.fromEntries(f.bySlice.gender.map((s) => [s.label, s]));
    expect(byGender.Female).toMatchObject({ n: 2, high: 2, ok: 0 });
    expect(byGender.Male).toMatchObject({ n: 2, high: 0, ok: 2 });
    expect(f.label).toBe('Knee');
  });

  it('does NOT drop athletes who are fine on the focused indicator', () => {
    // The comparison is meaningless if focusing filtered the population down
    // to the athletes who already have the problem.
    const f = focusBreakdown(rows, 'kneeInjuryRisk');
    expect(f.n).toBe(4);
    expect(f.ok + f.watch + f.high).toBe(4);
  });

  it('compares the filtered cohort against the unfiltered baseline', () => {
    const all = [...rows, ...Array.from({ length: 6 }, (_, i) => a(`z${i}`, { kneeInjuryRisk: 2 }))];
    const f = focusBreakdown(rows.filter((r) => r.gender === 'Female'), 'kneeInjuryRisk', all);
    expect(f.avg).toBe(29);           // the focused cohort: (30+28)/2
    expect(f.baselineAvg).toBe(8.8);  // everyone: (30+28+8+10+2*6)/10
    expect(f.baselineHighShare).toBe(0.2); // 2 of 10 institute-wide
  });

  it('leaves the baseline null when no population is supplied', () => {
    const f = focusBreakdown(rows, 'kneeInjuryRisk');
    expect(f.baselineAvg).toBeNull();
    expect(f.baselineHighShare).toBeNull();
  });

  it('lists the worst athletes, highest reading first, capped at ten', () => {
    const many = Array.from({ length: 14 }, (_, i) => a(`A${i}`, { kneeInjuryRisk: i }));
    const f = focusBreakdown(many, 'kneeInjuryRisk');
    expect(f.worst).toHaveLength(10);
    expect(f.worst[0].value).toBe(13);
    expect(f.worst[0].band).toBe('ok'); // 13 is still Low — worst is relative
    expect(f.worst.map((w) => w.value)).toEqual([13, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
  });

  it('slices every dimension at once', () => {
    const f = focusBreakdown(rows, 'kneeInjuryRisk');
    expect(Object.keys(f.bySlice).sort()).toEqual(['ageGroup', 'gender', 'programme', 'sport']);
  });
});
