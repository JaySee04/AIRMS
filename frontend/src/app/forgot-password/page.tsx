'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import LoginBrand from '@/components/auth/LoginBrand';

// Step 1 of the password-reset flow: ask the user which account to reset.
// On submit, the backend emails a 6-digit code; we navigate to /verify-otp
// to collect that code. Returning the same response in every case prevents
// account-enumeration via this endpoint.
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // The server tells us how long the code is good for. Carried through to
      // the next page rather than restated there: the page used to hardcode
      // "10 minutes", which is right only for as long as nobody changes
      // RESET_CODE_TTL_MIN. Not sensitive — the same number is in the email.
      const resp = await api.post<{ expiresInMinutes?: number }>('/auth/forgot-password', { email });
      const ttl = typeof resp?.expiresInMinutes === 'number' ? `&ttl=${resp.expiresInMinutes}` : '';
      // Navigate to the OTP entry page regardless of whether the email
      // matched an account — the backend's silent-failure policy means
      // we cannot tell the user any different from here.
      router.push(`/verify-otp?email=${encodeURIComponent(email)}${ttl}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
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
            <h1 className="login-heading">Forgot password?</h1>
            <p className="login-subtext">
              Enter the email address associated with your AIRMS account and we&apos;ll send you a 6-digit code to reset your password.
            </p>
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
              <button type="submit" className="btn btn-primary btn-full" disabled={loading || !email}>
                {loading ? 'Sending…' : 'Send reset code'}
              </button>
            </form>

            <Link href="/" className="login-forgot">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
