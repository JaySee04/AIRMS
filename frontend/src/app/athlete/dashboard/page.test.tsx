/**
 * @jest-environment jsdom
 */
// THE FIRST TEST THAT MOUNTS A page.tsx.
//
// CLAUDE.md has named this gap for weeks: there are four jsdom component
// suites, 110 e2e checks and two source-reading suites, and NOTHING in between.
// Each existing suite renders one component with a hand-built payload, reads
// page SOURCE as text, or drives the whole app through a real browser.
//
// WHAT MOUNTING A PAGE CATCHES THAT NONE OF THOSE DO
//
// `app/pageWiring.test.ts` reads the pages as text to check the `audience`
// prop, and says of itself that it "cannot see a prop computed at runtime".
// `npm run e2e` can see everything — but only against the SEEDED database,
// where every field is populated because the seeder populates it. A report from
// ISN is not obliged to be that tidy.
//
// So the coverage this adds is the SPARSE PAYLOAD: a page rendered against an
// athlete whose record is missing the things seeded data always has. That is
// the shape in which §54's rule matters — "an unknown value stays unknown",
// because a missing reading coerced to 0 is not a blank, it is a number, and it
// gets DRAWN: 0 reads as "no risk found" on a gauge and "perfectly balanced" on
// symmetry.
//
// The athlete dashboard was chosen over medical/dashboard deliberately: at 218
// lines against 1043 it is the smallest real page, and it is the one whose
// reader IS the at-risk person, so the audience wiring matters most here.
// Module 1 is audit-fixed — nothing in this file changes it, it only reads it.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import AthleteDashboard from './page';

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/athlete/dashboard',
}));

const mockGet = jest.fn();
jest.mock('@/lib/api', () => {
  class MockApiError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  }
  return {
    ApiError: MockApiError,
    isAuthError: (e: unknown) => e instanceof MockApiError && (e.status === 401 || e.status === 403),
    api: {
      get: (...a: unknown[]) => mockGet(...a),
      downloadGet: jest.fn(),
    },
  };
});

// The chrome, stubbed. A failure here should mean "the dashboard is wrong", not
// "the sidebar imports an icon set".
jest.mock('@/components/layout/Sidebar', () => ({
  __esModule: true,
  default: () => <nav data-testid="sidebar" />,
}));
jest.mock('@/components/layout/Topbar', () => ({
  __esModule: true,
  default: () => <header data-testid="topbar" />,
}));

// THE TWO CANVAS/GEOMETRY COMPONENTS, STUBBED — and this is a measurement, not
// a preference. Left real, the suite took **25 seconds** and filled the output
// with `Not implemented: HTMLCanvasElement.prototype.getContext`: jsdom has no
// canvas, so Chart.js inside RiskRadar throws on every mount, and the body map
// pulls in the full licensed path data to draw into a DOM nobody asserts on.
// A 25-second suite in front of a commit gets skipped, and a wall of expected
// errors is where a real one hides.
//
// Nothing is lost by stubbing them HERE. The body-map partition has its own
// test (`bodymap-data/muscles.test.ts`), the charts render server-side in
// `components/charts`, and `npm run e2e` asserts in a real browser that both
// actually draw geometry — 155 body-map regions and 2 drawn SVGs on this very
// route. What this file is for is the page's own wiring, which is exactly what
// those two components obscure. They are still MOUNTED, so a page that passed
// them nothing would still fail the leak checks below.
jest.mock('@/components/dashboard/BodyMap', () => ({
  __esModule: true,
  default: ({ myodynamia }: { myodynamia?: unknown[] }) => (
    <div data-testid="bodymap" data-flags={(myodynamia ?? []).length} />
  ),
}));
jest.mock('@/components/dashboard/RiskRadar', () => ({
  __esModule: true,
  default: ({ values }: { values?: number[] }) => (
    <div data-testid="radar" data-points={(values ?? []).length} />
  ),
}));

const USER = {
  id: '9', name: 'John Doe', email: 'athlete@isn.gov.my',
  role: 'athlete' as const, athleteId: '070202021001',
};

function signedIn(user: unknown = USER) {
  localStorage.setItem('airms_token', 'a.b.c');
  localStorage.setItem('airms_user', JSON.stringify(user));
}

// Shaped from a REAL payload read off the running API (GET /athletes/:id), not
// invented — the keys and the nesting are what the page actually receives.
const FULL = {
  _id: '9',
  athleteId: '070202021001',
  name: 'John Doe',
  sport: 'Badminton',
  age: 19,
  gender: 'Male',
  overallActivityScore: 74,
  injuryRiskIndex: 15,
  mobility: 72,
  stability: 78,
  symmetry: 76,
  risks: {
    neckInjuryRisk: 14, shoulderInjuryRisk: 8, scoliosis: 12,
    spinalDiscHerniation: 16, lumbarPelvisInjury: 16, jointPain: 15,
    kneeInjuryRisk: 21, ankleInjuryRisk: 26,
  },
  myodynamia: [{ muscle: 'Gluteus Medius', side: 'L' }],
  tension: [{ muscle: 'Iliopsoas', side: 'B' }],
  screening: {
    screeningId: '1',
    assessedAt: '2026-07-29T02:00:00.000Z',
    totalScore: 74,
    overallIndicator: 50,
    overallBand: 'green',
    effectiveBand: 'green',
    escalations: [],
    factors: [],
    reasonsAgainst: [],
    cohortZ: 0.2,
    cohortRank: 3,
    cohortSize: 7,
    cohortLabel: 'Badminton · PELAPIS · Female',
    screeningAgeDays: 45,
    recallState: 'current',
  },
};

// EVERYTHING OPTIONAL REMOVED. This is not a torture test: it is the record of
// an athlete added from the ISN directory who has been screened once on a
// compact report, which carries no prescription and no written summary.
const SPARSE = {
  _id: '10',
  athleteId: '070202021001',
  name: 'Nur Aina Danish',
  sport: 'Badminton',
  risks: {},
  myodynamia: [],
  tension: [],
  screening: null,
};

// A PAGE IS NOT ONE FETCH, and finding that out is most of why nothing had
// mounted one before.
//
// The first version of this file answered every `api.get` with the athlete
// payload. It failed with `rows.map is not a function` from deep inside
// ScreeningHistory — because the page renders a TREE of components that each
// fetch their own data once mounted: the athlete record, the programme's
// reliability thresholds, and the athlete's own screening list. Measured
// against a production build, this route makes four calls.
//
// So the stub is a router, and its default THROWS rather than returning
// something plausible. That direction is deliberate: a page that grows a fifth
// fetch will fail here loudly, instead of quietly handing that component the
// wrong shape and rendering a page that looks fine — the defect class this repo
// is named after.
function route(athlete: unknown, over: Record<string, unknown> = {}) {
  return (path: string) => {
    if (path === '/auth/me') return Promise.resolve({ user: USER });
    if (Object.prototype.hasOwnProperty.call(over, path)) {
      // An Error override REJECTS. Resolving with one would hand the page an
      // Error object as its payload, which is a third thing neither the success
      // nor the failure path is written for.
      const v = over[path];
      return v instanceof Error ? Promise.reject(v) : Promise.resolve(v);
    }
    if (path.startsWith('/athletes/')) return Promise.resolve(athlete);
    if (path.startsWith('/screenings/athlete/')) return Promise.resolve([]);
    if (path === '/screenings/reliability') {
      // Shaped as the endpoint really answers when it DECLINES: on the seeded
      // data there are 18 repeat pairs against the 20 needed, so `derived` is
      // false and the documented fallback of 2 applies. Pinning the declining
      // case is the right default — it is what the demo actually shows.
      return Promise.resolve({ derived: false, fallback: 2, minPairs: 20, pairs: 18, scores: [] });
    }
    return Promise.reject(new Error(
      `Unstubbed request from the athlete dashboard: ${path}. `
      + 'Add it to route() deliberately — a plausible default here would hide a '
      + 'component receiving the wrong shape.',
    ));
  };
}

beforeEach(() => {
  localStorage.clear();
  mockGet.mockReset();
  mockRouter.replace.mockReset();
});

// A page renders many numbers from many optional fields, and the failure this
// looks for is not an exception — it is a plausible-looking screen with a hole
// in it. e2e asserts the same class against seeded data; this asserts it where
// the data is thin.
const LEAKS = /\bundefined\b|\bNaN\b|\bnull\b|Invalid Date|\[object Object\]/;

describe('the athlete dashboard, mounted', () => {
  it('asks for its OWN record, by the athleteId on the session', async () => {
    signedIn();
    mockGet.mockImplementation(route(FULL));

    render(<AthleteDashboard />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/athletes/070202021001'));
    // Never the numeric id. `athleteId` is the IC number and the canonical key;
    // `_id` is the serialised row id, and asking with it returns somebody else
    // or nobody — a confusion no unit test on a helper can see.
    expect(mockGet).not.toHaveBeenCalledWith('/athletes/9');
    expect(mockGet).not.toHaveBeenCalledWith('/athletes/10');
  });

  it('renders the athlete\'s own scores without a hole in them', async () => {
    signedIn();
    mockGet.mockImplementation(route(FULL));

    render(<AthleteDashboard />);
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeTruthy());
    await waitFor(() => expect(document.body.textContent).toContain('74'));
    expect(document.body.textContent).not.toMatch(LEAKS);
  });

  // THE ONE THE OTHER SUITES CANNOT REACH.
  it('renders an athlete whose record is missing everything optional', async () => {
    signedIn();
    mockGet.mockImplementation(route(SPARSE));

    render(<AthleteDashboard />);
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeTruthy());
    // It must render SOMETHING — a blank page would pass a leak check.
    await waitFor(() => expect(document.body.textContent!.length).toBeGreaterThan(200));
    expect(document.body.textContent).not.toMatch(LEAKS);
  });

  // Dr Thung's instruction, asserted at the level a reader experiences it.
  // riskIndicators.test.js and screeningAlerts.indicators.test.ts pin the two
  // packages' lists to each other; neither mounts the page that would show it.
  it('never names Lumbar Disc Herniation, which is stored but never shown', async () => {
    signedIn();
    mockGet.mockImplementation(route(FULL));

    render(<AthleteDashboard />);
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeTruthy());
    const text = document.body.textContent || '';
    expect(text).not.toMatch(/herniation/i);
    // Unanchored, like every other negative below — see the note in the
    // audience test. `/\bLDH\b/` would pass against "flaggedLDH".
    expect(text).not.toMatch(/LDH/);
    expect(text).not.toMatch(/spinalDiscHerniation/);
    // The floor: the payload DID carry it, so this is an exclusion and not an
    // observation about an empty page.
    expect(FULL.risks.spinalDiscHerniation).toBe(16);
    expect(text).toMatch(/knee/i); // ...and a shown indicator did arrive
  });

  // §33, at page level: green may not read as a clean bill of health, and no
  // band may be named by colour alone. OverallRiskBadge.test.tsx pins what each
  // `audience` renders; nothing pinned that THIS page asks for the right one at
  // runtime, and the prop DEFAULTS to 'staff' — so omitting it reproduces the
  // original shipped bug in the one direction where the words still scan.
  it('addresses the athlete as the reader, and does not certify them safe', async () => {
    signedIn();
    mockGet.mockImplementation(route(FULL));

    render(<AthleteDashboard />);
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeTruthy());
    const text = document.body.textContent || '';
    expect(text).not.toMatch(/\bSafe\b/);
    // No band named by colour alone — "Green" reads as "you are fine".
    expect(text).not.toMatch(/\b(Green|Amber|Red)\b/);

    // SECOND PERSON, and the staff wording absent. `audience` defaults to
    // 'staff', so the failure mode is a page that reads "this athlete" to the
    // athlete themselves — grammatical, plausible, and the original shipped bug
    // (§20j). This is the assertion pageWiring.test.ts cannot make: it reads
    // source, and the value here could as easily be computed at runtime.
    // NO \b ANCHORS ON A textContent ASSERTION, and the negative ones are why.
    //
    // `textContent` concatenates across element boundaries with no separator,
    // so this page really does read "...No indicators flaggedYour latest
    // screening is in line with...". There is no word boundary between "d" and
    // "Y", so `/\bYour latest screening/` does not match — which is how this
    // was found, on the POSITIVE assertion, loudly.
    //
    // The same anchor on a NEGATIVE assertion fails silently in the opposite
    // direction: `not.toMatch(/\bthis athlete\b/)` passes against a page
    // reading "flaggedthis athlete", i.e. against the very bug it is written to
    // catch. A too-strict pattern is a green tick.
    expect(text).toMatch(/Your latest screening/);
    expect(text).not.toMatch(/this athlete/i);
    expect(text).not.toMatch(/They sit/);
  });

  // A page whose failure state renders OUTSIDE the layout would paint content
  // with no access gate around it. Both branches return early, so both are
  // checked.
  it('keeps its error state inside the gated layout', async () => {
    signedIn({ ...USER, athleteId: null });
    mockGet.mockResolvedValue({ user: USER });

    render(<AthleteDashboard />);
    await waitFor(() => expect(screen.getByTestId('sidebar')).toBeTruthy());
    expect(document.body.textContent).toContain('No athlete profile linked');
  });

  it('reports a failed load rather than rendering an empty dashboard', async () => {
    signedIn();
    mockGet.mockImplementation(route(FULL, {
      '/athletes/070202021001': new Error('Service unavailable'),
    }));

    render(<AthleteDashboard />);
    await waitFor(() => expect(document.body.textContent).toContain('Service unavailable'));
    expect(document.body.textContent).not.toMatch(LEAKS);
  });
});
