'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { getSession, saveSession, landingPathFor, Role } from '@/lib/auth';
import LoginBrand from '@/components/auth/LoginBrand';
import { touchIdle } from '@/lib/idleLock';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // SIGN IN ONCE ON A DEVICE AND STAY SIGNED IN (JC, section 148).
  //
  // A device that holds a live session goes straight to its dashboard. No
  // prompt, no banner: "logged in once then it shall stay".
  //
  // This is the third position on one question, so the reasoning for each is
  // worth having in one place rather than scattered across three sections:
  //
  //   §137  redirected — Back from a dashboard otherwise landed a signed-in
  //         clinician on a password prompt, which reads as "you have been
  //         logged out" when the session is perfectly good
  //   §142  stopped redirecting and stated the session instead, because the
  //         redirect made the sign-in screen unreachable and switching between
  //         the five demo logins a three-step detour
  //   §148  redirects again, by JC's decision, with the two objections §142
  //         raised answered rather than traded away:
  //           - the sign-in screen is still reachable, because SIGNING OUT
  //             lands here and a cleared session does not redirect
  //           - an unattended device no longer stays open for a week, because
  //             the session now IDLE-LOCKS (lib/idleLock.ts)
  //
  // The idle lock is what makes "stay signed in" safe enough to want: without
  // it, a walked-away clinic terminal holds a clinician's session until the
  // 7-day token expires, with IC numbers on screen — and an IC encodes date of
  // birth, birth state and sex (§43).
  useEffect(() => {
    const session = getSession();
    if (session) router.replace(landingPathFor(session.user.role));
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token: string; user: { role: Role } }>('/auth/login', { email, password });
      saveSession((data as any).token, (data as any).user);
      // Start the idle clock fresh (§148). Without this a device still holding
      // a stale stamp — a session cleared some other way, a browser restored
      // from disk — would lock the new user out partway through their first
      // task, which reads as the login not having worked.
      touchIdle();
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
