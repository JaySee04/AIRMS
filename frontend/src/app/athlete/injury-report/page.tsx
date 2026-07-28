'use client';

import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

const BODY_PARTS = ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'];
const SIDES = ['Left', 'Right', 'Both', 'N/A'] as const;
const INJURY_TYPES = ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Contusion', 'Other'];
const SEVERITIES = ['Minor', 'Moderate', 'Severe'] as const;

interface SelfReport {
  _id: string;
  bodyPart: string;
  side: string;
  injuryType?: string;
  severity?: string;
  description?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export default function InjuryReportPage() {
  const [reports, setReports] = useState<SelfReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [bodyPart, setBodyPart] = useState('');
  const [side, setSide] = useState<typeof SIDES[number]>('N/A');
  const [injuryType, setInjuryType] = useState('');
  const [severity, setSeverity] = useState<typeof SEVERITIES[number]>('Minor');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get<SelfReport[]>('/self-reports/mine');
        if (!cancelled) {
          setReports(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load reports');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bodyPart || !description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<SelfReport>('/self-reports', {
        bodyPart,
        side,
        injuryType: injuryType || undefined,
        severity,
        description: description.trim(),
      });
      setReports((prev) => [created, ...prev]);
      setBodyPart('');
      setSide('N/A');
      setInjuryType('');
      setSeverity('Minor');
      setDescription('');
      setSuccess('Self-report submitted. A medical staff member will review it shortly.');
      window.setTimeout(() => setSuccess(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout allowedRoles={['athlete']} title="Injury Reporting">
      <div className="alert alert-info" style={{ marginBottom: 20 }}>
        <strong>For pain that appears between sessions.</strong> Use this to flag an injury or
        symptom that started <em>outside</em> a supervised session — waking up sore, something that
        came on during your own gym / mobility work, or an old niggle flaring up — so the medical
        team is aware before your next session. If pain starts <em>during</em> a session, tell the
        medical staff there so they can assess and log it on the spot. Reports here are reviewed by
        medical before they join your official injury record.
      </div>

      <div className="grid-1-2">
        <div className="card">
          <h2 className="card-title">New Self-Report</h2>
          {success && <div className="alert alert-success">{success}</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="sr-bp">Body Part</label>
                <select id="sr-bp" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} required>
                  <option value="">Select…</option>
                  {BODY_PARTS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="sr-side">Side</label>
                <select id="sr-side" value={side} onChange={(e) => setSide(e.target.value as typeof SIDES[number])}>
                  {SIDES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="sr-type">Suspected Type</label>
                <select id="sr-type" value={injuryType} onChange={(e) => setInjuryType(e.target.value)}>
                  <option value="">Select…</option>
                  {INJURY_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="sr-sev">Severity (your assessment)</label>
                <select id="sr-sev" value={severity} onChange={(e) => setSeverity(e.target.value as typeof SEVERITIES[number])}>
                  {SEVERITIES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="sr-desc">Description</label>
              <textarea
                id="sr-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="When did it start? What activity triggered it? Any treatments tried?"
                rows={5}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={submitting}
            >
              {submitting ? 'Submitting…' : 'Submit Self-Report'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ marginBottom: 0 }}>My Submissions</h2>
            <span className="text-muted">
              {reports.length} report{reports.length === 1 ? '' : 's'}
            </span>
          </div>

          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : reports.length === 0 ? (
            <div className="empty-state">No self-reports submitted yet.</div>
          ) : (
            <div>
              {reports.map((r) => {
                const statusCls =
                  r.status === 'Approved' ? 'badge-low' :
                  r.status === 'Rejected' ? 'badge-high' :
                  'badge-moderate';
                return (
                  <div key={r._id} className="injury-record">
                    <div className="injury-record-head">
                      <div>
                        <strong>
                          {r.bodyPart} ({r.side}){r.injuryType ? ` — ${r.injuryType}` : ''}
                        </strong>
                        <div className="injury-record-meta">
                          Submitted {new Date(r.createdAt).toISOString().slice(0, 10)}
                          {r.severity ? ` · ${r.severity}` : ''}
                        </div>
                      </div>
                      <span className={statusCls}>{r.status}</span>
                    </div>
                    {r.description && <div className="injury-record-notes">{r.description}</div>}
                    {r.reviewNote && (
                      <div className="injury-record-notes" style={{ marginTop: 6, fontStyle: 'italic' }}>
                        Reviewer ({r.reviewedBy ?? 'medical'}): {r.reviewNote}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
