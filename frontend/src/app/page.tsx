'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import { saveSession } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ROLE_DEFAULTS: Record<string, string> = {
    'admin@isn.gov.my': '/admin/dashboard',
    'medical@isn.gov.my': '/medical/dashboard',
    'athlete@isn.gov.my': '/athlete/dashboard',
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.post('/auth/login', { email, password });
      saveSession(data.token, data.user);
      const redirect = ROLE_DEFAULTS[data.user.role] ?? `/${data.user.role}/dashboard`;
      router.push(redirect);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Image src="/images/logofull.png" alt="ISN Logo" width={200} height={80} priority />
        </div>
        <h1 className="login-title">AIRMS</h1>
        <p className="login-subtitle">Athlete Injury Risk Management System</p>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoComplete="email"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div className="login-demo-hint">
          <p><strong>Demo accounts:</strong></p>
          <p>admin@isn.gov.my / admin123</p>
          <p>medical@isn.gov.my / medical123</p>
          <p>athlete@isn.gov.my / athlete123</p>
        </div>
      </div>
    </div>
  );
}
