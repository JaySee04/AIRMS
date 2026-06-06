'use client';

import { useState, FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { passwordRules, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const token = params?.token ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

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
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      // Short delay so the user reads the success message before redirect.
      setTimeout(() => router.push('/'), 2500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
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
                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
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
