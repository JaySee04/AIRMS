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
import { render, screen, waitFor } from '@testing-library/react';
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
    expect(replace).toHaveBeenCalledWith('/');
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

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'));
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
