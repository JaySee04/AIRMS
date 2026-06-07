'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { passwordRules, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

// Step 3 of the password-reset flow: collect the new password. This page is
// gated by the verification token that /verify-otp wrote to sessionStorage.
// Without a token the user is bounced back to step 1 — they can't land here
// by deep-linking.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // Pull verification context out of sessionStorage; redirect to step 1 if
  // anything's missing (direct navigation, refresh after success, etc.).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const e = sessionStorage.getItem('airms_reset_email');
    const t = sessionStorage.getItem('airms_reset_verification_token');
    if (!e || !t) {
      router.replace('/forgot-password');
      return;
    }
    setEmail(e);
    setToken(t);
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const policyError = validatePassword(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { email, verificationToken: token, password });
      sessionStorage.removeItem('airms_reset_email');
      sessionStorage.removeItem('airms_reset_verification_token');
      setDone(true);
      setTimeout(() => router.push('/'), 1800);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Reset failed';
      setError(msg);
      // If the server says the verification expired, bounce back to step 1
      // so the user can request a fresh code rather than retry hopelessly.
      if (/expired|invalid/i.test(msg)) {
        sessionStorage.removeItem('airms_reset_email');
        sessionStorage.removeItem('airms_reset_verification_token');
        setTimeout(() => router.push('/forgot-password'), 1800);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-split">
      <div className="login-card">
        <div className="login-left">
          <div className="login-logos">
            <Image src="/images/logofull.png" alt="ISN" width={210} height={72} priority quality={100} />
          </div>
          <div className="login-left-body">
            <h2 className="login-tagline">Athlete Injury Risk<br />Management System</h2>
            <p className="login-org">INSTITUT SUKAN NEGARA</p>
            <p className="login-address">
              Kompleks Sukan Negara<br />
              57000 Bukit Jalil, Kuala Lumpur
            </p>
          </div>
        </div>

        <div className="login-right">
          <div className="login-form-wrap">
            <h1 className="login-heading">Choose a new password</h1>
            <p className="login-subtext">
              Pick something memorable. Your previous password will no longer work after this reset.
            </p>

            {done ? (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                Password updated. Redirecting you to sign in…
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group">
                  <label htmlFor="password">New password</label>
                  <div className="password-input-wrap">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                      aria-describedby="password-rules"
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
                  {password.length > 0 && (
                    <ul id="password-rules" className="password-rules">
                      {passwordRules.map((rule) => {
                        const pass = rule.test(password);
                        return (
                          <li key={rule.id} className={pass ? 'password-rule--pass' : 'password-rule--fail'}>
                            <span aria-hidden>{pass ? '✓' : '○'}</span> {rule.label}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div className="form-group">
                  <label htmlFor="confirm">Confirm new password</label>
                  <div className="password-input-wrap">
                    <input
                      id="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Re-enter the password"
                      required
                      minLength={PASSWORD_MIN_LENGTH}
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      aria-pressed={showConfirm}
                    >
                      {showConfirm ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={loading || !token}>
                  {loading ? 'Updating…' : 'Update password'}
                </button>
              </form>
            )}

            <Link href="/" className="login-forgot">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
