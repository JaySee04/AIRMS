'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getSession, saveSession, clearSession, landingPathFor, SessionUser, Role } from '@/lib/auth';
import LoginBrand from '@/components/auth/LoginBrand';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState<SessionUser | null>(null);

  // ALREADY SIGNED IN? SAY SO — DO NOT SILENTLY LEAVE (JC, section 142).
  //
  // Section 137 made this page REDIRECT when a session existed, to stop Back
  // from a dashboard landing a signed-in clinician on a password prompt that
  // reads as "you have been logged out". It fixed that and broke two things
  // that matter more:
  //
  //   1. Opening the app went straight to a dashboard. There was no way to
  //      SEE the sign-in screen, which is the first thing a stakeholder is
  //      shown and the one JC demonstrates from.
  //   2. The five demo logins became unreachable without signing out first.
  //      The whole demo is "here is the same athlete as a clinician, a coach,
  //      an executive" — a redirect makes switching role a three-step detour.
  //
  // Both readings were right; the mistake was treating it as a choice between
  // them. The page now RENDERS, and states the session instead of acting on
  // it: Back reads as "still signed in, continue" rather than "logged out",
  // and a different account is one form away. Nothing navigates on its own.
  useEffect(() => {
    const session = getSession();
    if (session) setResuming(session.user);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token: string; user: { role: Role } }>('/auth/login', { email, password });
      saveSession((data as any).token, (data as any).user);
      // REPLACE, not push: with `push` the sign-in form stays one Back away
      // from every page of the session, which is exactly what JC reported.
      router.replace(landingPathFor((data as any).user.role));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-split">
      <div className="login-card">
      <LoginBrand />

      <div className="login-right">
        <div className="login-form-wrap">
          <h1 className="login-heading">Sign in</h1>
          <p className="login-subtext">Use your ISN credentials to access the system.</p>

          {resuming && (
            <div className="login-resume">
              <p className="login-resume-who">
                Still signed in as <strong>{resuming.name}</strong>
              </p>
              <div className="login-resume-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => router.replace(landingPathFor(resuming.role))}
                >
                  Continue
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => { clearSession(); setResuming(null); }}
                >
                  Sign in as someone else
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                required
                autoComplete="email"
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-input-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <Link href="/forgot-password" className="login-forgot">Forgot password?</Link>
        </div>
      </div>
      </div>
    </div>
  );
}
