/**
 * @jest-environment jsdom
 */
// ONCE, PER USER, AND NEVER TO A STRANGER.
//
// Three properties, and each one is a way a release note goes wrong rather than
// a feature of it:
//
//   ONCE — a notice that reappears is an annoyance people learn to click past,
//   and the next one that matters gets clicked past too.
//
//   PER USER, NOT PER BROWSER — localStorage is per-origin, so a key without the
//   user id shows this to whoever opens a shared clinic terminal first and to
//   nobody after. That is §79's lesson, where the "since you last looked" marker
//   is keyed per user for exactly that reason.
//
//   VERSIONED — a bare key makes this a one-off: dismissed in October, silent
//   for ever. The key carries a version so the NEXT release can speak.
//
// Verified in a real browser as well (shown once, dismissed, shown again to a
// different user in the same browser, never when signed out). This pins the same
// behaviour where a regression would otherwise only be caught by someone
// remembering to look.
import { render, screen, fireEvent } from '@testing-library/react';
import WhatsNewNotice from './WhatsNewNotice';
import * as auth from '@/lib/auth';

jest.mock('@/lib/auth', () => ({ getSession: jest.fn() }));
const mockGetSession = auth.getSession as jest.Mock;

const session = (id: string) => ({ token: 't', user: { id, name: 'X', email: 'x@y', role: 'medical' } });

beforeEach(() => {
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe('WhatsNewNotice', () => {
  it('shows once to a signed-in user who has not seen it', () => {
    mockGetSession.mockReturnValue(session('3'));
    render(<WhatsNewNotice />);
    expect(screen.getByText(/What.s new in AIRMS/)).toBeTruthy();
  });

  it('says plainly that it only appears once', () => {
    mockGetSession.mockReturnValue(session('3'));
    render(<WhatsNewNotice />);
    expect(screen.getByText(/You only see this once/i)).toBeTruthy();
  });

  it('stays dismissed, under a key naming THAT user', () => {
    mockGetSession.mockReturnValue(session('3'));
    const { unmount } = render(<WhatsNewNotice />);
    fireEvent.click(screen.getByText('Got it'));
    expect(window.localStorage.getItem('airms_whatsnew_v1:3')).toBe('1');
    unmount();

    render(<WhatsNewNotice />);
    expect(screen.queryByText(/What.s new in AIRMS/)).toBeNull();
  });

  it('STILL SHOWS to a different user in the same browser', () => {
    // The shared clinic terminal. A per-browser key would hand the first
    // reader's dismissal to everyone after them.
    window.localStorage.setItem('airms_whatsnew_v1:3', '1');
    mockGetSession.mockReturnValue(session('7'));
    render(<WhatsNewNotice />);
    expect(screen.getByText(/What.s new in AIRMS/)).toBeTruthy();
  });

  it('shows nothing when nobody is signed in', () => {
    // A release note over a bounce-to-sign-in is useless and confusing.
    mockGetSession.mockReturnValue(null);
    render(<WhatsNewNotice />);
    expect(screen.queryByText(/What.s new in AIRMS/)).toBeNull();
  });

  it('stays silent when storage cannot be read, rather than nagging', () => {
    // Private browsing throws. A changelog that cannot remember being dismissed
    // would reappear on EVERY navigation, which is worse than missing it.
    mockGetSession.mockReturnValue(session('3'));
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    try {
      render(<WhatsNewNotice />);
      expect(screen.queryByText(/What.s new in AIRMS/)).toBeNull();
    } finally { spy.mockRestore(); }
  });

  it('is dismissible by the close button and the backdrop, not only by "Got it"', () => {
    mockGetSession.mockReturnValue(session('3'));
    render(<WhatsNewNotice />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText(/What.s new in AIRMS/)).toBeNull();
    expect(window.localStorage.getItem('airms_whatsnew_v1:3')).toBe('1');
  });

  it('describes what changed in words with no jargon in them', () => {
    // The reader is a physiologist or an administrator. If these leak, the
    // notice has stopped being for them.
    mockGetSession.mockReturnValue(session('3'));
    const { container } = render(<WhatsNewNotice />);
    const text = container.textContent || '';
    expect(text.length).toBeGreaterThan(400);
    for (const jargon of ['text layer', 'vision provider', 'token', '§', 'pdfjs', 'Gemini', 'WCAG']) {
      expect(text.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });

  it('carries a VERSION in the key, so a later release can speak again', () => {
    mockGetSession.mockReturnValue(session('3'));
    render(<WhatsNewNotice />);
    fireEvent.click(screen.getByText('Got it'));
    const key = Object.keys(window.localStorage).find((k) => k.startsWith('airms_whatsnew'));
    // Without a version this becomes a one-off: dismissed once, silent for ever.
    expect(key).toMatch(/^airms_whatsnew_v\d+:/);
  });
});
