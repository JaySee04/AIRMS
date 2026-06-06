'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      // The backend deliberately returns the same response whether the email
      // matched an account or not, so an attacker can't enumerate users.
      // The UI mirrors that — we always show the same confirmation.
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
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
            <h1 className="login-heading">Forgot password?</h1>
            <p className="login-subtext">
              Enter the email address associated with your AIRMS account and we&apos;ll send you a link to reset your password.
            </p>

            {submitted ? (
              <div className="alert alert-success" style={{ marginTop: 12 }}>
                If an account exists for <strong>{email}</strong>, a password reset link has been sent. Check your inbox — the link expires in 60 minutes.
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <div className="alert alert-error">{error}</div>}
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@isn.gov.my"
                    required
                    autoComplete="email"
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                  {loading ? 'Sending…' : 'Send reset link'}
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
