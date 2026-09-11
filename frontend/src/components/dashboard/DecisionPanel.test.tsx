/**
 * @jest-environment jsdom
 */
// The panel that tells a clinician what to do next — and, specifically, what it
// says about HOW FAR BACK it is looking.
//
// WHY THIS FILE EXISTS RATHER THAN AN E2E CHECK. The change list only renders
// when something moved, and on the seeded data nothing has moved inside the
// default 7-day window (measured 2026-09-11: 0 changes at 7 days, 36 at 90). So
// `npm run e2e` walks straight past this whole section and reports green. The
// one thing worth guarding here is therefore invisible to the suite that would
// otherwise cover it.
//
// WHAT IS BEING GUARDED. The heading makes a claim about coverage, and the
// claim has three forms. "Moved since you last looked" tells a reader they are
// seeing everything that happened while they were away; if the server actually
// applied a 7-day window, that sentence is false, and false in the direction
// that matters — it converts "I have not shown you five weeks" into "there was
// nothing to show". That is the silent-failure shape this project keeps
// producing: a confident, reassuring, wrong answer.
//
// The defence is that the SERVER reports which rule it applied (`changesBasis`)
// and the panel renders from that, never from whether it happened to send a
// marker. These tests pin the three sentences to the three bases, and pin the
// one that must never appear when the marker was not honoured.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import DecisionPanel from './DecisionPanel';

const mockGet = jest.fn();
jest.mock('@/lib/api', () => ({
  isAuthError: () => false,
  api: {
    get: (...a: unknown[]) => mockGet(...a),
    post: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock('@/lib/auth', () => ({
  getSession: () => ({ token: 't', user: { id: 'u-7', role: 'medical' } }),
}));

// One worsening athlete, so the change section renders at all.
const CHANGE = {
  athleteId: '070202021001',
  name: 'Test Athlete',
  from: 'green',
  to: 'red',
  direction: 'worse' as const,
  at: '2026-09-10T00:00:00.000Z',
};

function payload(over: Record<string, unknown> = {}) {
  return {
    scope: 'the institution',
    windowDays: 7,
    changesBasis: 'window',
    changesFrom: '2026-09-04T00:00:00.000Z',
    canMarkReviewed: true,
    headline: null,
    worklist: [],
    changes: [CHANGE],
    ...over,
  };
}

beforeEach(() => {
  mockGet.mockReset();
  window.localStorage.clear();
});

describe('what the change list claims to cover', () => {
  it('says "since you last looked" ONLY when the server honoured the marker', async () => {
    mockGet.mockResolvedValue(payload({ changesBasis: 'since' }));
    render(<DecisionPanel />);
    await waitFor(() => expect(screen.getByText(/Moved since you last looked/i)).toBeTruthy());
  });

  it('does NOT claim the marker when the server fell back to the window', async () => {
    // The failure this whole design exists to prevent. A panel that printed
    // "since you last looked" here would be telling a reader they had seen
    // everything, over a list covering seven days.
    mockGet.mockResolvedValue(payload({ changesBasis: 'window', windowDays: 7 }));
    render(<DecisionPanel />);
    await waitFor(() => expect(screen.getByText(/Moved in the last 7 days/i)).toBeTruthy());
    // Asserted on the HEADING, not on the section's text. The body deliberately
    // contains the phrase in a NEGATION ("a fixed window, not 'since you last
    // looked'") — the first draft of this test failed on exactly that, which is
    // the distinction worth keeping: what misleads is the claim, not the word.
    const heading = screen.getByRole('heading', { name: /Moved/i });
    expect(heading.textContent).not.toMatch(/since you last looked/i);
    // ...and the reader is told which it is, rather than left to assume.
    expect(screen.getByText(/this browser has no record of your last visit/i)).toBeTruthy();
  });

  it('discloses that a stale marker was capped rather than quietly capping it', async () => {
    // 'clamped' means there may be OLDER changes not listed. Saying so is the
    // difference between a short list and a short list that looks complete.
    mockGet.mockResolvedValue(payload({ changesBasis: 'clamped' }));
    render(<DecisionPanel />);
    await waitFor(() => expect(screen.getByText(/Moved in the last 90 days/i)).toBeTruthy());
    expect(screen.getByText(/older changes not listed/i)).toBeTruthy();
  });
});

describe('the marker itself', () => {
  it('sends no "since" when this browser has never held one', async () => {
    mockGet.mockResolvedValue(payload());
    render(<DecisionPanel />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toBe('/decisions');
  });

  it('sends the stored marker when there is one', async () => {
    window.localStorage.setItem('airms_decisions_seen:u-7', '2026-08-01T00:00:00.000Z');
    mockGet.mockResolvedValue(payload({ changesBasis: 'since' }));
    render(<DecisionPanel />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toContain('since=2026-08-01');
  });

  it('ignores a corrupt marker instead of sending it', async () => {
    // A half-written or hand-edited value must not reach the server, and must
    // not take the panel down. It degrades to the window, which shows MORE.
    window.localStorage.setItem('airms_decisions_seen:u-7', 'not-a-date');
    mockGet.mockResolvedValue(payload());
    render(<DecisionPanel />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toBe('/decisions');
  });

  it('keys the marker to the USER, so a shared machine does not leak one reader\'s "seen" to another', async () => {
    // Two clinicians share a terminal at ISN. A key without the user id would
    // mean the second one's changes were silently already "read".
    window.localStorage.setItem('airms_decisions_seen:someone-else', '2026-08-01T00:00:00.000Z');
    mockGet.mockResolvedValue(payload());
    render(<DecisionPanel />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet.mock.calls[0][0]).toBe('/decisions');
  });

  it('does not greet a returning reader with "Marked as read"', async () => {
    // Found in a real browser, not here: the control was first wired to
    // "a marker exists", so a returning reader — who by definition has one —
    // arrived to a button already claiming they had read a list they had not
    // opened. The button describes THEIR action, not the presence of state.
    window.localStorage.setItem('airms_decisions_seen:u-7', '2026-08-01T00:00:00.000Z');
    mockGet.mockResolvedValue(payload({ changesBasis: 'since' }));
    render(<DecisionPanel />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Mark these as read/i })).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Marked as read$/i })).toBeNull();
  });

  it('does not advance the marker just because the panel rendered', async () => {
    // Advancing on render would mean a reader who opened the dashboard and was
    // interrupted has "seen" a worsening they never read — and it would never
    // be shown again. The click is what advances it.
    mockGet.mockResolvedValue(payload());
    render(<DecisionPanel />);
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(window.localStorage.getItem('airms_decisions_seen:u-7')).toBeNull();
  });
});
