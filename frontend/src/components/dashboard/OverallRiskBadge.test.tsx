/**
 * @jest-environment jsdom
 */
// The hero — the one panel every role reads first, and the surface where this
// project's recurring defect lands hardest.
//
// WHY THIS SUITE EXISTS. The frontend had 12 `lib/` suites and 2 component
// suites, and nothing at all above them. Everything the hero DISPLAYS was
// covered only by `npm run e2e`, which needs both servers running and so cannot
// gate a commit. That is the wrong shape of coverage for this component in
// particular, because several locked clinical decisions are properties of what
// it renders rather than of any function:
//
//   - green must NOT read as "Safe" (§33) — a screen that cannot predict injury
//     cannot certify its absence, and green is exactly where false reassurance
//     lands
//   - a band must never be named by COLOUR alone (SILENT_FAILURES 3i) — "Green"
//     reads as "you are fine"
//   - a missing Total Score must not print as a number (§54/§57) — the hero is
//     where `numOrNull('')` would have rendered a fabricated 0 with nothing to
//     say it was fabricated
//   - the staff copy must not address the reader as the at-risk athlete, which
//     was a real shipped bug (see HERO_MSG's comment)
//
// Each of those is invisible to a passing unit test of the functions beneath it,
// and each looks completely normal on screen.
//
// WHAT THIS IS NOT. The backend is the security and scoring boundary and is
// tested separately; nothing here says a number is CORRECT. What these pin is
// what a person sees when the number arrives — including when it does not.
import React from 'react';
import { render, screen } from '@testing-library/react';
import OverallRiskBadge, { type ScreeningIndicator } from './OverallRiskBadge';
import { BAND_LABEL } from '@/lib/bands';
import { SMALL_COHORT, EXCLUDED_RISK_KEYS } from '@/lib/shared/facts';

/** A plausible green screening. Tests override only the field under test. */
const base = (over: Partial<ScreeningIndicator> = {}): ScreeningIndicator => ({
  totalScore: 74,
  overallIndicator: 48,
  overallBand: 'green',
  effectiveBand: 'green',
  escalations: 0,
  factors: [],
  reasonsAgainst: [],
  cohortZ: -0.18,
  cohortRank: 12,
  cohortSize: 24,
  screeningAgeDays: 20,
  recallState: 'current',
  cohortLabel: 'Badminton / Female',
  cohortDeltas: [],
  ...over,
});

describe('the hero never fabricates a number', () => {
  // §57. `indicatorPayload.js` carried a private `numOrNull` under which an
  // empty-string Total Score became 0 and a non-numeric one became NaN. This is
  // the screen that would have shown it: a real figure, in the hero position,
  // with nothing marking it as invented.
  it('renders a missing Total Score as a dash, not as zero', () => {
    render(<OverallRiskBadge screening={base({ totalScore: null })} />);
    const stat = document.querySelector('.risk-hero-stat-val');
    expect(stat).not.toBeNull();
    expect(stat!.textContent).toBe('—');
    expect(stat!.textContent).not.toBe('0');
  });

  it('renders a real zero as zero — a measured 0 is not a missing value', () => {
    // The mirror case, and the reason `??` is right here and `||` is not.
    // Swapping to `||` passes the test above and fails this one.
    render(<OverallRiskBadge screening={base({ totalScore: 0 })} />);
    expect(document.querySelector('.risk-hero-stat-val')!.textContent).toBe('0');
  });

  it.each([
    ['no screening at all', null],
    ['a screening with no band', base({ effectiveBand: null })],
    ['every optional field absent', { effectiveBand: 'amber' } as ScreeningIndicator],
    ['nulls throughout', base({
      totalScore: null, overallIndicator: null, cohortRank: null, cohortSize: null,
      cohortZ: null, screeningAgeDays: null, recallState: null, cohortDeltas: [],
    })],
  ])('shows no NaN, undefined or Invalid Date for %s', (_label, screening) => {
    const { container } = render(<OverallRiskBadge screening={screening as ScreeningIndicator | null} />);
    const text = container.textContent || '';
    expect(text).not.toMatch(/NaN/);
    expect(text).not.toMatch(/undefined/);
    expect(text).not.toMatch(/Invalid Date/);
    // "null" as a word, not as part of a longer one.
    expect(text).not.toMatch(/\bnull\b/);
  });
});

describe('a band is named clinically, never by its colour', () => {
  // SILENT_FAILURES 3i. `ScreeningHistory.tsx` was found spelling these
  // Green/Amber/Red from a fourth private map — which reads to an athlete as
  // "you are fine" rather than as "nothing was flagged".
  it.each(['green', 'amber', 'red'] as const)('%s uses the shared clinical wording', (band) => {
    const { container } = render(
      <OverallRiskBadge screening={base({ effectiveBand: band, overallBand: band })} />,
    );
    expect(screen.getByText(BAND_LABEL[band])).toBeInTheDocument();
    // The colour word must not appear as the band's NAME anywhere on the panel.
    const level = container.querySelector('.risk-hero-level');
    expect(level!.textContent).toContain(BAND_LABEL[band]);
    expect(level!.textContent).not.toMatch(/^\s*(Green|Amber|Red)\b/);
  });

  it('never calls the green band Safe', () => {
    // The §33 decision, asserted rather than left as an absence — the same
    // reason EXCLUDED_RISK_KEYS exists as a value.
    const { container } = render(<OverallRiskBadge screening={base()} />);
    expect(container.textContent).not.toMatch(/\bSafe\b/i);
    expect(container.textContent).toContain('No indicators flagged');
  });
});

describe('the compact badge does not carry state by hue alone', () => {
  // A coloured circle identical in every band puts the row's clinical state in
  // the one encoding red/green deficiency destroys — and a `title` rescues
  // neither a screen reader nor a touch device.
  it('gives each band a different glyph', () => {
    const glyphs = (['green', 'amber', 'red'] as const).map((band) => {
      const { container, unmount } = render(
        <OverallRiskBadge compact screening={base({ effectiveBand: band, overallBand: band })} />,
      );
      const g = container.querySelector('[aria-hidden="true"]')!.textContent;
      unmount();
      return g;
    });
    expect(new Set(glyphs).size).toBe(3);
  });

  it('puts the full clinical wording in the accessible name', () => {
    render(<OverallRiskBadge compact screening={base({ effectiveBand: 'red', overallBand: 'red' })} />);
    const el = screen.getByLabelText(/Immediate assessment/);
    expect(el).toBeInTheDocument();
  });

  it('says "not scored" rather than showing nothing when there is no indicator', () => {
    render(<OverallRiskBadge compact screening={base({ overallIndicator: null })} />);
    expect(screen.getByLabelText(/not scored/)).toBeInTheDocument();
  });
});

describe('a clinician override beats the computed band', () => {
  // The one expression in this codebase that could be written backwards and
  // silently ignore every clinical override.
  it('shows the override band and marks it as set by a clinician', () => {
    const { container } = render(<OverallRiskBadge screening={base({
      overallBand: 'red', effectiveBand: 'green', overrideBand: 'green',
      overrideNote: 'Cleared after physio review', overrideBy: 'Medical Demo 01',
    })} />);
    expect(container.querySelector('.risk-hero-level')!.textContent)
      .toContain(BAND_LABEL.green);
    expect(container.textContent).toContain('set by clinician');
    expect(container.textContent).toContain('Cleared after physio review');
    expect(container.textContent).toContain('Medical Demo 01');
    // The computed band must not also be shown as the verdict.
    expect(container.querySelector('.risk-hero-level')!.textContent)
      .not.toContain(BAND_LABEL.red);
  });
});

describe('the verdict states how old it is', () => {
  // §33. The hero is written in the present tense, so a screening from eight
  // months ago has to say so where the decision is taken — not only in the date
  // dropdown and the monthly recall email.
  it('warns when a rescreen is overdue, and says to read it as the last known position', () => {
    const { container } = render(<OverallRiskBadge screening={base({
      recallState: 'overdue', screeningAgeDays: 240,
    })} />);
    expect(container.textContent).toContain('240 days old');
    expect(container.textContent).toMatch(/last known position/);
  });

  it('is quieter when a rescreen is merely due soon', () => {
    const { container } = render(<OverallRiskBadge screening={base({
      recallState: 'due-soon', screeningAgeDays: 150,
    })} />);
    expect(container.textContent).toContain('due soon');
    expect(container.textContent).not.toMatch(/last known position/);
  });

  it('says nothing about age when the screening is current', () => {
    const { container } = render(<OverallRiskBadge screening={base()} />);
    expect(container.textContent).not.toMatch(/days old/);
  });

  it('says nothing about age on a historical screening', () => {
    // A past screening is settled, not overdue — the recall notice would be
    // answering a question nobody asked of that row.
    const { container } = render(<OverallRiskBadge historical screening={base({
      recallState: 'overdue', screeningAgeDays: 240,
    })} />);
    expect(container.textContent).not.toMatch(/days old/);
    expect(container.textContent).toContain('Status at this screening');
  });
});

describe('a small comparison group says so', () => {
  // The caveat lives inside the comparison table, so the fixture has to carry
  // deltas — an athlete scored against a cohort always has them. The first
  // version of this test passed an empty delta list and a rank of 12 out of 9,
  // and failed for both reasons rather than for the one it was testing.
  const withDeltas = (size: number) => base({
    cohortSize: size,
    cohortRank: Math.max(1, Math.floor(size / 2)),
    cohortDeltas: [
      { key: 'totalScore', label: 'Total Score', value: 74, mean: 76.2, delta: -2.2, z: -0.4 },
      { key: 'rom', label: 'ROM', value: 71, mean: 70.1, delta: 0.9, z: 0.2 },
    ],
  });

  it(`caveats below ${SMALL_COHORT} peers`, () => {
    const { container } = render(<OverallRiskBadge screening={withDeltas(SMALL_COHORT - 1)} />);
    expect(container.textContent).toMatch(/indicative/i);
    expect(container.textContent).toContain(`Only ${SMALL_COHORT - 1} athletes`);
  });

  it(`does not caveat at ${SMALL_COHORT} peers or above`, () => {
    // The boundary, in the direction that matters: hedging everything is the
    // same as hedging nothing.
    const { container } = render(<OverallRiskBadge screening={withDeltas(SMALL_COHORT)} />);
    expect(container.textContent).not.toMatch(/indicative/i);
  });
});

describe('the comparison table keeps its orientation', () => {
  // The deltas are ORIENTED: positive means better than the group on EVERY row,
  // including the two whose raw scale runs the other way (injury risk and L/R
  // balance, stored negated). A sign read backwards here states the opposite of
  // the truth about an injured athlete, and reads perfectly normally.
  const deltas = [
    { key: 'totalScore', label: 'Total Score', value: 74, mean: 76.2, delta: -2.2, z: -0.4 },
    { key: 'riskGood', label: 'Injury risk', value: 19, mean: 14.1, delta: -4.9, z: -1.2, lowerIsBetter: true },
  ];

  it('states that a positive difference is the better one', () => {
    const { container } = render(<OverallRiskBadge screening={base({ cohortDeltas: deltas })} />);
    expect(container.textContent).toMatch(/positive difference is better/i);
  });

  it('shows the lower-is-better row un-negated, as the clinician reads it', () => {
    // Stored negated for scoring; displayed as the real figure. Showing an
    // injury-risk group mean of -14.1 to a clinician is the failure this guards.
    const { container } = render(<OverallRiskBadge screening={base({ cohortDeltas: deltas })} />);
    const text = container.textContent || '';
    expect(text).toContain('19');
    expect(text).toContain('14.1');
    expect(text).not.toContain('-14.1');
    expect(text).toMatch(/lower is better/i);
  });

  it('names a component clearly below the group as a reason to assess', () => {
    // NOTABLE_Z: the escalation rules only look at the composite, so a single
    // badly-below component escalates nothing — and "no reasons to assess" for
    // an athlete 1.2 SD down would be worse than the opaque score it replaced.
    const { container } = render(<OverallRiskBadge screening={base({
      effectiveBand: 'amber',
      overallBand: 'amber',
      factors: [],
      cohortDeltas: [
        { key: 'rom', label: 'ROM', value: 58, mean: 71.4, delta: -13.4, z: -1.45 },
      ],
    })} />);
    expect(container.textContent).toMatch(/Reasons to assess/i);
    // "worse than", never "below" — the deltas are oriented, so "below" states
    // the opposite of the truth on the lower-is-better rows.
    expect(container.textContent).toMatch(/ROM 13\.4 worse than the group/);
  });
});

describe('the copy knows who is reading it', () => {
  // A real shipped bug: this component is shared by the athlete, medical and
  // coach views, and was second-person only — so the medical dashboard told a
  // clinician that THEY were among the athletes needing attention.
  it('does not address staff as the at-risk athlete', () => {
    const { container } = render(
      <OverallRiskBadge audience="staff" screening={base({ effectiveBand: 'red', overallBand: 'red' })} />,
    );
    const msg = container.querySelector('.risk-hero-msg')!.textContent || '';
    expect(msg).toMatch(/this athlete|their/i);
    expect(msg).not.toMatch(/\byou\b|\byour\b/i);
  });

  it('addresses the athlete directly on their own dashboard', () => {
    const { container } = render(
      <OverallRiskBadge audience="self" screening={base({ effectiveBand: 'red', overallBand: 'red' })} />,
    );
    const msg = container.querySelector('.risk-hero-msg')!.textContent || '';
    expect(msg).toMatch(/\byour\b/i);
    expect(msg).not.toMatch(/this athlete/i);
  });

  it('does not tell an athlete to import a report they cannot import', () => {
    const { container } = render(<OverallRiskBadge audience="self" screening={null} />);
    expect(container.textContent).not.toMatch(/import/i);
  });
});

// WHERE THE LDH EXCLUSION IS *NOT* TESTED, AND WHY.
//
// The first version of this file asserted here that the hero never names
// `spinalDiscHerniation`, by handing it a cohortDelta for LDH. That test failed,
// and it was the test that was wrong — worth recording, because the reasoning
// looked sound.
//
// `cohortDeltas` is not the indicator list. It is built in
// backend/src/utils/overallIndicator.js from a closed set of SIX aggregate
// COMPONENTS — totalScore, rom, stability, symmetry, riskGood, balance — so an
// indicator cannot appear in it at all, and the payload that test constructed is
// one the backend has no path to produce. Asserting against an impossible input
// would have added a green tick and no coverage.
//
// The exclusion is real on the axis where indicators actually travel, and it is
// pinned there: backend/tests/riskIndicators.test.js and
// frontend/src/lib/screeningAlerts.indicators.test.ts assert it across every
// derived view. EXCLUDED_RISK_KEYS is imported here only to keep this note
// honest about what it refers to.
it('the excluded-key list is a value that can be asserted, not an absence', () => {
  expect(EXCLUDED_RISK_KEYS).toContain('spinalDiscHerniation');
});
