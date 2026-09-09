/**
 * @jest-environment jsdom
 */
// The three cards that read from the `.screening` sub-object — and the reason
// this file exists is that TWO OF THEM HAD NEVER RENDERED ON ANY PAGE.
//
// WHAT HAPPENED (2026-09-09). The API puts per-report detail on a `screening`
// sub-object and leaves the flat athlete row alone. All four pages that render
// ScreeningPanel lifted exactly one field across by hand — `subitems` — which,
// as it happens, is the one field this panel does not read. So
// `prescription` and `lateralSymmetry` arrived `undefined` everywhere, and the
// Training Prescription and Lateral Symmetry cards drew nothing, on every
// dashboard, for weeks. Both were built on 2026-08-23, both were documented as
// shipped, and Lateral Symmetry's own source comment described it as fixing the
// fact that the weaker side "was reachable only by downloading a PDF" — which
// remained true, because the fix never received data.
//
// NOTHING CAUGHT IT. The components were correct in isolation, so a component
// test passed. The payload was correct, so a backend test passed. The pages
// compiled, because every field involved is optional — a missing optional prop
// is not a type error, it is a card that silently does not appear. And e2e
// asserts pages render without NaN/undefined, not that a given card is present.
// This is SILENT_FAILURES 3f/3j territory: a wrong answer that looks right.
//
// So these tests assert PRESENCE from the shape the API actually sends, which
// is the assertion the whole stack was missing.

import React from 'react';
import { render, screen } from '@testing-library/react';
import ScreeningPanel, { type ScreeningData } from './ScreeningPanel';

// The minimum that makes the panel consider a report present — without one of
// these five scores it renders the "no screening ingested" empty state and
// every assertion below would pass or fail for the wrong reason.
const base: ScreeningData = {
  name: 'Test Athlete',
  sport: 'Badminton',
  overallActivityScore: 77,
  injuryRiskIndex: 14,
  mobility: 75,
  stability: 74,
  symmetry: 80,
  // The panel draws a threshold strip per indicator and reads each by name, so
  // this is required, not decoration. spinalDiscHerniation is present in the
  // data and never displayed (locked decision, Dr Thung) — included here so the
  // fixture matches the real payload rather than a convenient subset.
  risks: {
    neckInjuryRisk: 20,
    shoulderInjuryRisk: 30,
    scoliosis: 10,
    spinalDiscHerniation: 40,
    lumbarPelvisInjury: 15,
    jointPain: 25,
    kneeInjuryRisk: 35,
    ankleInjuryRisk: 12,
  },
};

// Clearing all five headline scores is what makes the panel treat an athlete as
// unscreened — `risks` stays, because a real unscreened athlete still has the
// column defaults.
const noScores = {
  overallActivityScore: null,
  injuryRiskIndex: null,
  mobility: null,
  stability: null,
  symmetry: null,
};

const SUMMARY = '1. Cervical rotation limited on the left. 2. Shoulder stability 12.5 below the mean.';

// Again the real shape, not a convenient one: reps keep their UNIT as a string
// so a 30-second hold is never rendered as 30 repetitions (utils/prescription.js).
const PRESCRIPTION = {
  days: [{ day: 1, exercises: [{ no: 1, name: 'Band pull-apart', reps: '12', sets: 3, rest: 60 }] }],
  note: null,
};

// The shape the SERVER sends (backend utils/symmetry.js), not an invented one —
// the first draft of this fixture made up `region`/`weakerSide`/`left`/`right`
// and the test failed, which is the fixture doing its job.
const SYMMETRY_ROWS = [
  { key: 'shoulder', label: 'Shoulder', sym: 68, status: 'Needs work', weaker: 'Left' as const, gap: 12 },
];

describe('ScreeningPanel reads the .screening sub-object', () => {
  describe('report summary', () => {
    it('renders from screening.summaryText — the shape the API sends', () => {
      render(<ScreeningPanel athlete={{ ...base, screening: { summaryText: SUMMARY } }} />);
      expect(screen.getByText(/Report summary/i)).toBeTruthy();
    });

    it('renders from a flat summaryText too, so a narrowed caller still works', () => {
      render(<ScreeningPanel athlete={{ ...base, summaryText: SUMMARY }} />);
      expect(screen.getByText(/Report summary/i)).toBeTruthy();
    });

    it('says whose words they are', () => {
      // The card reproduces someone else's clinical judgement. Rendered without
      // attribution it becomes AIRMS's judgement — the same reason the Training
      // Prescription card names its source.
      // Matched on the attribution SENTENCE, not the bare word: the panel's own
      // title is "HoloMotion Screening", so a loose match passes even with the
      // attribution deleted.
      render(<ScreeningPanel athlete={{ ...base, screening: { summaryText: SUMMARY } }} />);
      expect(screen.getByText(/HoloMotion.s own comment on this screening/i)).toBeTruthy();
    });

    it('shows the instrument\'s text verbatim, decimals intact', () => {
      render(<ScreeningPanel athlete={{ ...base, screening: { summaryText: SUMMARY } }} />);
      expect(screen.getByText(/Shoulder stability 12\.5 below the mean\./)).toBeTruthy();
    });

    it('draws nothing when the report carried no summary', () => {
      // The compact HoloMotion layout has no Summary section. Absence is a fact
      // about the report, not a failure, so no empty card appears.
      render(<ScreeningPanel athlete={{ ...base, screening: { summaryText: null } }} />);
      expect(screen.queryByText(/Report summary/i)).toBeNull();
    });
  });

  describe('training prescription — dark on every page until 2026-09-09', () => {
    it('renders from screening.prescription', () => {
      render(<ScreeningPanel athlete={{ ...base, screening: { prescription: PRESCRIPTION } }} />);
      expect(screen.getByText(/Band pull-apart/)).toBeTruthy();
    });

    it('is absent when the report carried none', () => {
      render(<ScreeningPanel athlete={{ ...base, screening: { prescription: null } }} />);
      expect(screen.queryByText(/Band pull-apart/)).toBeNull();
    });
  });

  describe('lateral symmetry — dark on every page until 2026-09-09', () => {
    it('renders from screening.lateralSymmetry', () => {
      render(<ScreeningPanel athlete={{ ...base, screening: { lateralSymmetry: SYMMETRY_ROWS } }} />);
      expect(screen.getByText('Lateral Symmetry')).toBeTruthy();
      // The card's whole reason for existing is naming a SIDE — the body map
      // paints the worse of L/R and discards which one it was.
      expect(screen.getByText(/Left weaker by 12/)).toBeTruthy();
    });

    it('is absent for an empty findings list', () => {
      // An empty list means no region had a measurable gap — not "symmetrical",
      // and not a card worth drawing.
      render(<ScreeningPanel athlete={{ ...base, screening: { lateralSymmetry: [] } }} />);
      expect(screen.queryByText(/weaker/i)).toBeNull();
    });
  });

  describe('the empty state still wins', () => {
    it('an athlete with no scores shows the no-screening message, not the cards', () => {
      // Guards the fixture as much as the code: if `base` ever stops counting as
      // a report, every test above would pass vacuously.
      render(<ScreeningPanel athlete={{ ...base, ...noScores, screening: { summaryText: SUMMARY } }} />);
      expect(screen.getByText(/No HoloMotion screening has been ingested/i)).toBeTruthy();
      expect(screen.queryByText(/Report summary/i)).toBeNull();
    });
  });
});
