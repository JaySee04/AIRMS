/**
 * @jest-environment jsdom
 */
// The client-side gate every authenticated page wraps itself in.
//
// It had no test at all, which is uncomfortable for two reasons: it is the one
// component whose job is access, and it was CHANGED on 2026-09-01 to confirm
// the session with the server. That change fixed a real, ordinary bug — a
// 7-day token expires, the localStorage snapshot still says "admin", so the
// shell rendered and then every panel failed 401: a broken page instead of the
// sign-in screen.
//
// The backend is the actual security boundary and is tested separately; nothing
// here should be read as "the API is protected because this passes". What these
// pin is the BROWSER behaviour: that nothing paints before the server has
// confirmed who this is, that the server's answer beats the browser's claim, and
// — the easy one to get backwards — that a network blink does NOT sign the whole
// institute out.
//
// Runs under jsdom via the docblock above, so the existing node-environment
// suites are untouched.
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import DashboardLayout from './DashboardLayout';
import { ApiError } from '@/lib/api';

const replace = jest.fn();
const push = jest.fn();
// ONE router object, not a fresh one per call. The gate's effect lists `router`
// in its dependencies, so a mock that returned a new object each render made the
// effect re-run for ever — "Maximum update depth exceeded", caused entirely by
// the mock. Real `useRouter()` is stable across renders; a stub that is not
// tests something the application never does.
const mockRouter = { replace, push };
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/admin/dashboard',
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
    api: { get: (...a: unknown[]) => mockGet(...a) },
  };
});

// Sidebar and Topbar pull in icons, links and theme plumbing that have nothing
// to do with the gate; stubbing them keeps a failure here meaning what it says.
jest.mock('./Sidebar', () => ({
  __esModule: true,
  default: ({ user }: { user: { role: string } }) => <nav data-testid="sidebar">{user.role}</nav>,
}));
jest.mock('./Topbar', () => ({
  __esModule: true,
  default: () => <header data-testid="topbar" />,
}));

const ADMIN = { id: '1', name: 'Admin User', email: 'admin@isn.gov.my', role: 'admin' as const };
const MEDICAL = {
  id: '2', name: 'Med', email: 'medical@isn.gov.my', role: 'medical' as const, permissions: {},
};

function signedInAs(user: unknown, token = 'a.b.c') {
  localStorage.setItem('airms_token', token);
  localStorage.setItem('airms_user', JSON.stringify(user));
}

const SECRET = <p>roster and clinical scores</p>;

beforeEach(() => {
  localStorage.clear();
  // The "already confirmed this token" marker lives in sessionStorage (§111.7).
  // Without this line the first test to confirm a session silences the
  // /auth/me call in every test after it, and the suite still passes — the
  // assertions that would notice are `toHaveBeenCalled`, and a test that
  // reuses a cached confirmation never reaches them.
  sessionStorage.clear();
  replace.mockClear();
  push.mockClear();
  mockGet.mockReset().mockResolvedValue({ user: ADMIN });
});

describe('before the server has answered', () => {
  it('renders nothing at all with no session', () => {
    const { container } = render(
      <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(/roster and clinical scores/)).toBeNull();
    expect(replace).toHaveBeenCalledWith('/');
  });

  it('renders nothing for a role the page does not allow', () => {
    signedInAs({ ...ADMIN, role: 'coach' });
    const { container } = render(
      <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>,
    );
    expect(container).toBeEmptyDOMElement();
    // TO THEIR OWN DASHBOARD, NOT TO THE SIGN-IN FORM (2026-09-16, §111).
    // This person is authenticated; they are simply not allowed HERE. Sending
    // them to '/' showed a password prompt to someone holding a valid session,
    // which reads as "you have been logged out" and is the opposite of what
    // happened. The no-session case above still goes to '/', and must.
    expect(replace).toHaveBeenCalledWith('/coach/dashboard');
    // and it must not even ask the server on behalf of a role it already refused
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('the server settles who this is', () => {
  it('renders the page once /auth/me confirms an allowed role', async () => {
    signedInAs(ADMIN);
    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);
    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith('/auth/me');
    expect(replace).not.toHaveBeenCalled();
  });

  // The forged / stale snapshot. The browser claims admin; the server says coach.
  it('believes the SERVER, not the browser snapshot', async () => {
    signedInAs({ ...ADMIN, role: 'admin' });
    mockGet.mockResolvedValue({ user: { ...ADMIN, role: 'coach' } });

    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);

    // The server's role wins, and the destination is that role's OWN landing
    // page: the session is real, so a sign-in prompt would misdescribe it. The
    // 401 case below still clears the session and goes to '/', which is the
    // distinction — refused identity versus refused page.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/coach/dashboard'));
    // NOT asserting the content has gone. The gate renders OPTIMISTICALLY from
    // the snapshot and corrects when the server answers — that is deliberate,
    // and the shell it briefly shows is empty because every panel's own request
    // is refused by the API. Navigating away is the router's job, and the router
    // is mocked here; asserting an unmount would be asserting the mock.
    //
    // What this pins is that the correction HAPPENS: the server's role beat the
    // browser's claim and sent this session back to sign in.
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('writes the server\'s answer back, so a stale snapshot is corrected', async () => {
    signedInAs({ ...MEDICAL, name: 'Old Name' });
    mockGet.mockResolvedValue({ user: { ...MEDICAL, name: 'New Name' } });

    render(<DashboardLayout allowedRoles={['medical']} title="T">{SECRET}</DashboardLayout>);

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem('airms_user') || '{}');
      expect(stored.name).toBe('New Name');
    });
  });

  // The expired 7-day token: the snapshot still says admin, the API says 401.
  it('ends the session on a refusal', async () => {
    signedInAs(ADMIN);
    mockGet.mockRejectedValue(new ApiError(401, 'Token expired'));

    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    // The session is GONE — this is the half that matters. A redirect alone
    // would leave the stale token in localStorage for the next page load to
    // trust all over again.
    expect(localStorage.getItem('airms_token')).toBeNull();
    expect(localStorage.getItem('airms_user')).toBeNull();
  });

  // The one that is easy to get backwards, and would be an outage of its own.
  it('does NOT sign anybody out when the API merely blinks', async () => {
    signedInAs(ADMIN);
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);

    // The optimistic render from the snapshot stands...
    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    // ...and the session survives.
    expect(localStorage.getItem('airms_token')).toBe('a.b.c');
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('a session this build cannot place', () => {
  // MEASURED IN A REAL BROWSER, 2026-09-17. With the role set to "superuser",
  // the gate refused the page, asked `landingPathFor` where to send them, got
  // `undefined`, and handed that to the router — which threw `Cannot read
  // properties of undefined (reading 'startsWith')`. The result was a BLANK
  // page on the original URL with the token still in localStorage: no content,
  // no sign-out, no redirect. Reloading reproduced it.
  //
  // Reachable without devtools: a release that renames or retires a role leaves
  // every unexpired session in the institute carrying one this build has never
  // heard of.
  it('sends a snapshot with an unknown role back to sign in, and does not throw', () => {
    signedInAs({ ...ADMIN, role: 'superuser' });
    const { container } = render(
      <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(replace).toHaveBeenCalledWith('/');
    // Every argument the router is given must be a route. `undefined` here was
    // the whole defect.
    for (const [arg] of replace.mock.calls) expect(typeof arg).toBe('string');
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('does not leave the refused snapshot behind for the next page load', () => {
    signedInAs({ ...ADMIN, role: 'superuser' });
    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);
    expect(localStorage.getItem('airms_token')).toBeNull();
  });

  // The same value, arriving from the API instead of from storage. `getSession`
  // cannot screen this one, so it is checked where it lands.
  it('ends the session when the SERVER names a role this build does not know', async () => {
    signedInAs(ADMIN);
    mockGet.mockResolvedValue({ user: { ...ADMIN, role: 'superuser' } });

    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
    expect(localStorage.getItem('airms_token')).toBeNull();
  });
});

describe('how often the server is asked', () => {
  // §111.7. This component mounts on every page, so the confirmation fired once
  // per navigation: eight calls for one admin opening five pages, measured
  // against the dev server. Each one can be a cold start on the deployed API,
  // and it sits in front of the paint.
  it('confirms once per tab, not once per page', async () => {
    signedInAs(ADMIN);
    const page = () => <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>;

    const first = render(page());
    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    first.unmount();

    // Navigating to another page: a fresh mount of the same gate.
    render(page());
    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  // The cache must never turn "we could not check" into "we checked" — that
  // would let an expired token survive a whole browsing session on the strength
  // of one failed request.
  it('asks again after a failure, because nothing was confirmed', async () => {
    signedInAs(ADMIN);
    mockGet.mockRejectedValue(new TypeError('Failed to fetch'));

    const first = render(
      <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>,
    );
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    first.unmount();

    render(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
  });
});

describe('a revoked capability', () => {
  it('routes medical staff away from a page they may no longer use', async () => {
    const revoked = { ...MEDICAL, permissions: { uploadData: false } };
    signedInAs(revoked);
    mockGet.mockResolvedValue({ user: revoked });

    render(
      <DashboardLayout allowedRoles={['medical']} requiredPermission="uploadData" title="T">
        {SECRET}
      </DashboardLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalled());
    expect(replace.mock.calls[0][0]).not.toBe('/medical/data-upload');
  });

  it('leaves a capability the admin has not revoked alone', async () => {
    signedInAs(MEDICAL);
    mockGet.mockResolvedValue({ user: MEDICAL });

    render(
      <DashboardLayout allowedRoles={['medical']} requiredPermission="uploadData" title="T">
        {SECRET}
      </DashboardLayout>,
    );

    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});

// ONE session check per page load, not one per render.
//
// The gate's effect used to list `allowedRoles` — an ARRAY PROP — in its
// dependencies. Every page passes it as a literal (`allowedRoles={['medical',
// 'admin']}`), so React builds a fresh array each render and the effect re-ran
// on every parent re-render. A dashboard re-renders several times as its panels'
// data arrives.
//
// Measured against a PRODUCTION build, one page load each:
//
//   /medical/dashboard   GET /auth/me x3      (7 API calls total)
//   /athlete/dashboard   GET /auth/me x3      (6 API calls total)
//   /coach/dashboard     GET /auth/me x2      (4 API calls total)
//
// Three identical round trips to confirm one session, on a serverless API where
// each can be a cold start — and on the endpoint whose budget a clinician's
// ordinary navigation was spending (SILENT_FAILURES 3r). After comparing the
// roles by VALUE: 5, 4 and 3 calls, with nothing repeated.
//
// This is the same trap the router-stub note at the top of this file warns
// about, reached through an ordinary prop rather than a mock — which is why it
// survived into production while the mock version was caught immediately.
describe('the session is confirmed once, not once per render', () => {
  it('does not re-ask the server when the parent re-renders with an equal roles array', async () => {
    signedInAs(ADMIN);
    // A CONFIRMATION THAT NEVER ARRIVES, DELIBERATELY (2026-09-17, §111.7).
    //
    // The "already confirmed" marker is written when the ANSWER lands, so with a
    // resolving mock the first call populates the cache and every later effect
    // run is short-circuited before the network. This test would then count the
    // CACHE and pass no matter how many times the effect ran — and the mutation
    // registered against it survived, which is how that was found rather than
    // reasoned about.
    //
    // Left pending, nothing is ever cached, so every run of the effect reaches
    // `api.get` and the call count measures effect runs again, exactly as it did
    // before the cache existed.
    mockGet.mockReturnValue(new Promise(() => {}));
    const { rerender } = render(
      <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>,
    );
    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    const afterMount = mockGet.mock.calls.filter(([p]) => p === '/auth/me').length;
    expect(afterMount).toBe(1);

    // A NEW array with the SAME contents — exactly what a re-rendering page
    // produces. Depending on identity, this re-ran the whole check.
    await act(async () => {
      rerender(<DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>);
      rerender(<DashboardLayout allowedRoles={['admin']} title="T2">{SECRET}</DashboardLayout>);
    });

    const total = mockGet.mock.calls.filter(([p]) => p === '/auth/me').length;
    expect(total).toBe(1);
  });

  it('DOES re-run the gate when the allowed roles actually change', async () => {
    // The optimisation must not become "check once and never again". Comparing
    // by value has to stay a comparison — if the page genuinely changes which
    // roles it admits, the gate re-runs.
    //
    // THIS ASSERTED A SECOND `/auth/me` UNTIL 2026-09-17, and that was always a
    // proxy: the gate re-running and the server being re-asked were the same
    // event, so counting the cheap one stood in for the one that matters. The
    // confirmation cache (§111.7) separated them — within 60 seconds the gate
    // re-runs and the network does not — so the proxy now measures the cache
    // instead of the gate, which is not what this test is for.
    //
    // It asserts the refusal directly instead, which is both the property §80.2
    // cared about and a stronger one: the local role check is the half that
    // must never be skipped, and here it fires against a session the server
    // confirmed moments ago.
    signedInAs(ADMIN);
    const { rerender } = render(
      <DashboardLayout allowedRoles={['admin']} title="T">{SECRET}</DashboardLayout>,
    );
    expect(await screen.findByText(/roster and clinical scores/)).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();

    // The page now admits medical only. This admin must be turned away.
    await act(async () => {
      rerender(<DashboardLayout allowedRoles={['medical']} title="T">{SECRET}</DashboardLayout>);
    });

    expect(replace).toHaveBeenCalledWith('/admin/dashboard');
  });
});
