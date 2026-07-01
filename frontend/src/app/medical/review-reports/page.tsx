'use client';

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

type ReportStatus = 'Pending' | 'Approved' | 'Rejected';

interface SelfReport {
  _id: string;
  athleteId: string;
  athleteName?: string;
  sport?: string;
  bodyPart: string;
  side: string;
  injuryType?: string;
  severity?: string;
  description?: string;
  status: ReportStatus;
  reviewNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

const TABS: ReportStatus[] = ['Pending', 'Approved', 'Rejected'];

export default function ReviewReportsPage() {
  const [reports, setReports] = useState<SelfReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportStatus>('Pending');

  // Modal state
  const [activeReport, setActiveReport] = useState<SelfReport | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [actioning, setActioning] = useState<'approve' | 'reject' | null>(null);

  async function refresh() {
    try {
      setLoading(true);
      const data = await api.get<SelfReport[]>('/self-reports');
      setReports(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get<SelfReport[]>('/self-reports');
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

  const counts = useMemo(() => {
    const c: Record<ReportStatus, number> = { Pending: 0, Approved: 0, Rejected: 0 };
    reports.forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [reports]);

  const filtered = useMemo(
    () => reports.filter((r) => r.status === activeTab),
    [reports, activeTab],
  );

  function openReport(r: SelfReport) {
    setActiveReport(r);
    setReviewNote(r.reviewNote ?? '');
  }

  function closeModal() {
    if (actioning) return;
    setActiveReport(null);
    setReviewNote('');
  }

  async function decide(status: 'Approved' | 'Rejected') {
    if (!activeReport) return;
    if (status === 'Rejected' && !reviewNote.trim()) {
      setError('Please add a note explaining the rejection.');
      return;
    }
    setActioning(status === 'Approved' ? 'approve' : 'reject');
    setError(null);
    try {
      await api.patch(`/self-reports/${activeReport._id}/review`, {
        status,
        reviewNote: reviewNote.trim() || undefined,
      });
      await refresh();
      setActiveReport(null);
      setReviewNote('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update report');
    } finally {
      setActioning(null);
    }
  }

  return (
    <DashboardLayout allowedRoles={['medical']} requiredPermission="reviewReports" title="Self-Report Review">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="tabs" style={{ marginBottom: 18 }}>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tab${activeTab === t ? ' active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t} ({counts[t] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted">Loading reports…</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          {activeTab === 'Pending' ? 'No pending self-reports. Good work.' : `No ${activeTab.toLowerCase()} reports.`}
        </div>
      ) : (
        <div className="card">
          {filtered.map((r) => (
            <div key={r._id} className="injury-record" style={{ cursor: 'pointer' }} onClick={() => openReport(r)}>
              <div className="injury-record-head">
                <div>
                  <strong>{r.athleteName ?? r.athleteId}</strong>
                  <div className="injury-record-meta">
                    {r.bodyPart} ({r.side}){r.injuryType ? ` — ${r.injuryType}` : ''}
                    {r.severity ? ` · ${r.severity}` : ''}
                  </div>
                  <div className="injury-record-meta">
                    {r.sport ?? '—'} · submitted {new Date(r.createdAt).toISOString().slice(0, 10)}
                  </div>
                </div>
                <span className={
                  r.status === 'Approved' ? 'badge-low' :
                  r.status === 'Rejected' ? 'badge-high' :
                  'badge-moderate'
                }>
                  {r.status}
                </span>
              </div>
              {r.description && (
                <div className="injury-record-notes" style={{ marginTop: 4 }}>
                  {r.description.length > 140 ? `${r.description.slice(0, 140)}…` : r.description}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeReport && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
                Review submission — {activeReport.athleteName ?? activeReport.athleteId}
              </h2>
              <button type="button" className="modal-close" onClick={closeModal} aria-label="Close">×</button>
            </div>
            <div className="modal-body">
              <div className="kv-grid" style={{ marginBottom: 14 }}>
                <div><span>Athlete</span><strong>{activeReport.athleteName ?? activeReport.athleteId}</strong></div>
                <div><span>Sport</span><strong>{activeReport.sport ?? '—'}</strong></div>
                <div><span>Body Part</span><strong>{activeReport.bodyPart} ({activeReport.side})</strong></div>
                <div><span>Suspected Type</span><strong>{activeReport.injuryType ?? '—'}</strong></div>
                <div><span>Severity</span><strong>{activeReport.severity ?? '—'}</strong></div>
                <div><span>Submitted</span><strong>{new Date(activeReport.createdAt).toISOString().slice(0, 10)}</strong></div>
              </div>

              {activeReport.description && (
                <div className="form-group">
                  <label>Athlete description</label>
                  <div className="injury-record-notes" style={{ background: 'var(--bg)', padding: 10, borderRadius: 6 }}>
                    {activeReport.description}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="review-note">Reviewer note {activeReport.status === 'Pending' && '(required for reject)'}</label>
                <textarea
                  id="review-note"
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Findings, follow-up plan, why approving/rejecting…"
                  rows={3}
                  disabled={activeReport.status !== 'Pending'}
                />
              </div>

              {activeReport.status !== 'Pending' && (
                <div className="text-muted" style={{ fontSize: '0.82rem' }}>
                  Already {activeReport.status.toLowerCase()} by {activeReport.reviewedBy ?? 'medical'}
                  {activeReport.reviewedAt ? ` on ${new Date(activeReport.reviewedAt).toISOString().slice(0, 10)}` : ''}.
                </div>
              )}
            </div>
            {activeReport.status === 'Pending' && (
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeModal} disabled={!!actioning}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: 'var(--risk-high)', color: 'var(--risk-high)' }}
                  onClick={() => decide('Rejected')}
                  disabled={!!actioning}
                >
                  {actioning === 'reject' ? 'Rejecting…' : 'Reject'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => decide('Approved')}
                  disabled={!!actioning}
                >
                  {actioning === 'approve' ? 'Approving…' : 'Approve & add to record'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
