'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import LoginBrand from '@/components/auth/LoginBrand';

const ROLE_REDIRECTS: Record<string, string> = {
  athlete: '/athlete/dashboard',
  medical: '/medical/dashboard',
  admin: '/admin/dashboard',
  coach: '/coach/dashboard',
  executive: '/admin/dashboard',
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post<{ token: string; user: { role: string } }>('/auth/login', { email, password });
      saveSession((data as any).token, (data as any).user);
      router.push(ROLE_REDIRECTS[(data as any).user.role] ?? '/athlete/dashboard');
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
