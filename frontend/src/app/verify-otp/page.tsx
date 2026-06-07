'use client';

import { useState, useEffect, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';

// Step 2 of the password-reset flow: collect the 6-digit OTP the backend
// emailed in step 1. On a successful verification the backend returns a
// short-lived verification token; we hold it (plus the email) in
// sessionStorage and navigate to /reset-password to collect the new password.
// Keeping the token out of the URL prevents it leaking into the browser
// history or anything that logs Referer headers.
function VerifyOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromUrl = searchParams.get('email') ?? '';

  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Bounce back to step 1 if we landed here without an email, which means
  // the user navigated directly rather than via /forgot-password.
  useEffect(() => {
    if (!emailFromUrl) router.replace('/forgot-password');
  }, [emailFromUrl, router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setLoading(true);
    try {
      const resp = await api.post<{ verificationToken: string }>('/auth/verify-otp', { email, code });
      // Hand off to step 3 via sessionStorage so the token never appears in
      // the URL bar. It expires server-side in 5 minutes regardless.
      sessionStorage.setItem('airms_reset_email', email);
      sessionStorage.setItem('airms_reset_verification_token', resp.verificationToken);
      router.push('/reset-password');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  function handleResend() {
    setError('');
    setInfo('');
    setLoading(true);
    api.post('/auth/forgot-password', { email })
      .then(() => setInfo(`A new code has been sent to ${email}.`))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => setLoading(false));
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
            <h1 className="login-heading">Enter your code</h1>
            <p className="login-subtext">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to continue. The code expires in 10 minutes.
            </p>
            <form onSubmit={handleSubmit}>
              {error && <div className="alert alert-error">{error}</div>}
              {info && !error && <div className="alert alert-success">{info}</div>}
              <div className="form-group">
                <label htmlFor="code">6-digit code</label>
                <input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="123456"
                  maxLength={6}
                  pattern="\d{6}"
                  required
                  autoFocus
                  style={{ fontSize: '1.25rem', letterSpacing: '0.35em', textAlign: 'center' }}
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={loading || code.length !== 6}>
                {loading ? 'Verifying…' : 'Verify code'}
              </button>
            </form>

            <div style={{ marginTop: 12, fontSize: '0.82rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Didn&apos;t receive the code?{' '}
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                style={{ background: 'none', border: 'none', color: 'var(--text)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
              >
                Send a new one
              </button>
              {' '}or{' '}
              <Link href="/forgot-password" style={{ color: 'var(--text)', textDecoration: 'underline' }}>
                use a different email
              </Link>.
            </div>

            <Link href="/" className="login-forgot">Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyOtpPage() {
  return (
    <Suspense fallback={<div className="login-split"><p className="text-muted">Loading…</p></div>}>
      <VerifyOtpContent />
    </Suspense>
  );
}
