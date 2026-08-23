'use client';

// Account activation — where an invited user lands.
//
// The mechanism underneath is exactly the password-reset flow: verify a
// one-time code, then set a password with the short-lived token that returns.
// Reusing it is deliberate, so an invitation cannot end up with weaker rules
// than a reset (see backend utils/resetCodes.js).
//
// What differs is the FRAMING, and it is not cosmetic. Somebody resetting a
// password knows the product and is recovering access they had. Somebody
// activating has never seen AIRMS, was sent a code they did not ask for, and
// needs telling what this is and that the password they choose is theirs alone.
// Sending them through a screen headed "Choose a new password" would ask them
// to replace a password they never had.
//
// It is also ONE screen rather than the reset flow's two. The reset splits code
// entry and new password across pages because the user arrives mid-task; here
// the person has the invitation open in front of them and everything they need
// is in it, so a single form is one fewer place to lose them.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import LoginBrand from '@/components/auth/LoginBrand';
import { PASSWORD_MIN_LENGTH, passwordRules } from '@/lib/passwordPolicy';

export default function ActivatePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      // The same pair the reset flow uses. The verification token lives in a
      // local variable rather than sessionStorage: there is no navigation
      // between the two steps here, so nothing needs to persist it — and a
      // token that never reaches storage cannot be left behind in it.
      const { verificationToken } = await api.post<{ verificationToken: string }>(
        '/auth/verify-otp',
        { email: email.trim().toLowerCase(), code: code.trim() },
      );
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        verificationToken,
        password,
      });
      setDone(true);
      setTimeout(() => router.push('/'), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed. Check the code and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-split">
      <div className="login-card">
        <LoginBrand />

        <div className="login-right">
          <div className="login-form-wrap">
            <h1 className="login-heading">Activate your account</h1>
            <p className="login-subtext">
              An administrator has created an AIRMS account for you and emailed a
              six-digit code. Enter it with the password you want to use — the
              password is yours alone, and nobody at ISN can see it.
            </p>

            {done ? (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                Account activated. Redirecting you to sign in…
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <div className="alert alert-error">{error}</div>}

                <div className="form-group">
                  <label htmlFor="ac-email">Email address</label>
                  <input
                    id="ac-email"
                    type="email"
                    value={email}
                    autoComplete="username"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@isn.gov.my"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="ac-code">Activation code</label>
                  <input
                    id="ac-code"
                    value={code}
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="ac-pw">Choose a password</label>
                  <input
                    id="ac-pw"
                    type="password"
                    value={password}
                    autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                    aria-describedby="password-rules"
                    required
                  />
                  <ul id="password-rules" className="password-rules">
                    {passwordRules.map((rule) => {
                      const pass = rule.test(password);
                      return (
                        <li key={rule.id} className={pass ? 'password-rule--pass' : 'password-rule--fail'}>
                          {rule.label}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="form-group">
                  <label htmlFor="ac-pw2">Confirm password</label>
                  <input
                    id="ac-pw2"
                    type="password"
                    value={confirm}
                    autoComplete="new-password"
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter the password"
                    required
                  />
                </div>

                <button type="submit" className="btn btn-gold btn-block" disabled={busy}>
                  {busy ? 'Activating…' : 'Activate account'}
                </button>
              </form>
            )}

            <p className="login-subtext" style={{ marginTop: 16 }}>
              Code expired, or never arrived? Ask the administrator who set up
              your account to send a new one — they can re-send from the
              Personnel page. Already activated? <Link href="/">Sign in</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
