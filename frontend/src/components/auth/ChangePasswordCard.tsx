'use client';

import { useState, FormEvent } from 'react';
import { api } from '@/lib/api';
import { passwordRules, validatePassword, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

// Self-contained Change Password card. Drop into any profile page — used on
// the athlete profile here, will be reused on the medical and admin profile
// pages once those are built out.
export default function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function resetForm() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword) {
      setError('Enter your current password.');
      return;
    }
    const policyError = validatePassword(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must differ from your current password.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      setSuccess('Password updated. Use your new password on your next sign-in.');
      resetForm();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Password change failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title" style={{ marginBottom: 0 }}>Change Password</h2>
        <span className="card-sub">Update the password you use to sign in</span>
      </div>

      <form onSubmit={handleSubmit} style={{ marginTop: 12 }}>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="form-group">
          <label htmlFor="cp-current">Current password</label>
          <div className="password-input-wrap">
            <input
              id="cp-current"
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowCurrent((v) => !v)}
              aria-label={showCurrent ? 'Hide password' : 'Show password'}
              aria-pressed={showCurrent}
            >
              {showCurrent ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="cp-new">New password</label>
          <div className="password-input-wrap">
            <input
              id="cp-new"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
              aria-describedby="cp-rules"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowNew((v) => !v)}
              aria-label={showNew ? 'Hide password' : 'Show password'}
              aria-pressed={showNew}
            >
              {showNew ? 'Hide' : 'Show'}
            </button>
          </div>
          {newPassword.length > 0 && (
            <ul id="cp-rules" className="password-rules">
              {passwordRules.map((rule) => {
                const pass = rule.test(newPassword);
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
          <label htmlFor="cp-confirm">Confirm new password</label>
          <div className="password-input-wrap">
            <input
              id="cp-confirm"
              type={showConfirm ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              required
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

        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}
