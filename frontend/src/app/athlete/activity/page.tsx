'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

type ActivityType = 'Strength' | 'Endurance' | 'Speed' | 'Skill' | 'Match' | 'Recovery';

interface Activity {
  _id: string;
  athleteId: string;
  date: string;
  type: ActivityType;
  duration: number;
  intensity: number;
  load: number;
  notes?: string;
}

const ACTIVITY_TYPES: ActivityType[] = [
  'Strength',
  'Endurance',
  'Speed',
  'Skill',
  'Match',
  'Recovery',
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadNote(load: number): string {
  if (load === 0) return 'Enter duration and intensity to compute load.';
  if (load < 200) return 'Light session — feeds your chronic baseline.';
  if (load < 500) return 'Moderate session — typical training load.';
  if (load < 800) return 'High load session — ensure recovery is planned.';
  return 'Very high load — verify duration and intensity values are accurate.';
}

function RpeGuide({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="rpe-guide-wrap">
      <button
        type="button"
        className="rpe-guide-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span>{open ? '▾' : '▸'}</span> RPE Reference Guide
      </button>
      {open && (
        <table className="rpe-table">
          <thead>
            <tr>
              <th>RPE</th>
              <th>Effort Level</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>1 – 2</td><td>Very light</td><td>Gentle walk, cool-down stretching</td></tr>
            <tr><td>3 – 4</td><td>Light – Moderate</td><td>Easy jog, warm-up drills</td></tr>
            <tr><td>5 – 6</td><td>Hard</td><td>Typical training session, breathless but sustainable</td></tr>
            <tr><td>7 – 8</td><td>Very hard</td><td>High-intensity intervals, can only speak in short phrases</td></tr>
            <tr><td>9 – 10</td><td>Maximum</td><td>Competition effort, all-out sprint, cannot maintain</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function LoadPreview({ duration, intensity }: { duration: number; intensity: number }) {
  const load = duration * intensity;
  return (
    <div className="load-preview">
      <div className="load-formula">
        Load = Duration × Intensity
        <span className="load-info-icon">
          ⓘ
          <span className="load-tooltip">
            Session load (AU — Arbitrary Units) reflects the total internal demand of a training session. It combines how long and how hard you trained. Your medical team uses this history to set recovery targets, and a sharp week-to-week drop will prompt you to add context on the dashboard.
          </span>
        </span>
      </div>
      <div className="load-value">
        <span>{duration}</span> min × <span>{intensity}</span> ={' '}
        <strong>{load.toLocaleString()}</strong> AU
      </div>
      <div className="load-note">{loadNote(load)}</div>
    </div>
  );
}

function ActivityEditModal({
  activity,
  onSaved,
  onClose,
}: {
  activity: Activity;
  onSaved: (updated: Activity) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<ActivityType>(activity.type);
  const [date, setDate] = useState<string>(new Date(activity.date).toISOString().slice(0, 10));
  const [duration, setDuration] = useState<number>(activity.duration);
  const [intensity, setIntensity] = useState<number>(activity.intensity);
  const [notes, setNotes] = useState<string>(activity.notes ?? '');
  const [showRpeGuide, setShowRpeGuide] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !submitting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !date) return;
    if (!Number.isFinite(duration) || duration < 10 || duration > 240) {
      setError('Duration must be between 10 and 240 minutes.');
      return;
    }
    if (!Number.isFinite(intensity) || intensity < 1 || intensity > 10) {
      setError('Intensity must be between 1 and 10.');
      return;
    }
    if (date > todayISO()) {
      setError('Activity date cannot be in the future.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await api.put<Activity>(`/activities/${activity._id}`, {
        type,
        date,
        duration,
        intensity,
        notes: notes || undefined,
      });
      onSaved(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update activity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !submitting && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>
            Edit Activity — {new Date(activity.date).toISOString().slice(0, 10)}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form id="edit-activity-form" onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="ef-type">Activity Type</label>
              <select
                id="ef-type"
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType)}
                required
              >
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="ef-date">Date</label>
              <input
                id="ef-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="ef-dur">Duration (minutes)</label>
                <input
                  id="ef-dur"
                  type="number"
                  min={10}
                  max={240}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="ef-int">Intensity (RPE 1–10)</label>
                <input
                  id="ef-int"
                  type="number"
                  min={1}
                  max={10}
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <RpeGuide open={showRpeGuide} onToggle={() => setShowRpeGuide((v) => !v)} />

            <LoadPreview duration={duration} intensity={intensity} />

            <div className="form-group" style={{ marginTop: 14 }}>
              <label htmlFor="ef-notes">Notes (optional)</label>
              <textarea
                id="ef-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant observations…"
                rows={3}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Updating…' : 'Update Activity'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({
  activity,
  deleting,
  error,
  onConfirm,
  onClose,
}: {
  activity: Activity;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !deleting) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleting, onClose]);

  const dateStr = new Date(activity.date).toISOString().slice(0, 10);

  return (
    <div className="modal-backdrop" onClick={() => !deleting && onClose()}>
      <div
        className="modal"
        style={{ maxWidth: 460 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Delete activity?</h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={deleting}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}
          <p style={{ marginTop: 0 }}>
            This will permanently remove the entry below. Your training history
            and weekly load totals will update automatically.
          </p>
          <div
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '12px 14px',
              marginTop: 10,
            }}
          >
            <div style={{ marginBottom: 4 }}>
              <strong>{dateStr}</strong>
              <span className="text-muted"> · {activity.type}</span>
            </div>
            <div className="text-muted" style={{ fontSize: '0.88rem' }}>
              {activity.duration} min · RPE {activity.intensity}/10 ·{' '}
              <strong>{activity.load} AU</strong>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-outline"
            onClick={onClose}
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ borderColor: 'var(--risk-high)', color: 'var(--risk-high)' }}
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete Activity'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ActivityPage() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [type, setType] = useState<ActivityType | ''>('');
  const [date, setDate] = useState<string>(todayISO());
  const [duration, setDuration] = useState<number>(60);
  const [intensity, setIntensity] = useState<number>(6);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [flashRowId, setFlashRowId] = useState<string | null>(null);

  const [filterType, setFilterType] = useState<ActivityType | ''>('');
  const [showRpeGuide, setShowRpeGuide] = useState(false);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [deleteCandidate, setDeleteCandidate] = useState<Activity | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function toggleNote(id: string) {
    setExpandedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const successTimerRef = useRef<number | null>(null);
  const flashTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
      if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const session = getSession();
    if (!session?.user.athleteId) {
      setError('No athlete profile linked to this account.');
      setLoading(false);
      return;
    }
    setAthleteId(session.user.athleteId);
  }, []);

  useEffect(() => {
    if (!athleteId) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get<Activity[]>(`/activities/athlete/${athleteId}`);
        if (!cancelled) {
          setActivities(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load activities');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [athleteId]);

  const filtered = useMemo(
    () => (filterType ? activities.filter((a) => a.type === filterType) : activities),
    [activities, filterType],
  );

  function resetForm() {
    setType('');
    setDate(todayISO());
    setDuration(60);
    setIntensity(6);
    setNotes('');
  }

  function flashRow(id: string) {
    setFlashRowId(id);
    if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashRowId(null);
      flashTimerRef.current = null;
    }, 1700);
  }

  function showSuccess(msg: string) {
    setSuccess(msg);
    if (successTimerRef.current !== null) window.clearTimeout(successTimerRef.current);
    successTimerRef.current = window.setTimeout(() => {
      setSuccess(null);
      successTimerRef.current = null;
    }, 2500);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !date) return;
    if (!Number.isFinite(duration) || duration < 10 || duration > 240) {
      setError('Duration must be between 10 and 240 minutes.');
      return;
    }
    if (!Number.isFinite(intensity) || intensity < 1 || intensity > 10) {
      setError('Intensity must be between 1 and 10.');
      return;
    }
    if (date > todayISO()) {
      setError('Activity date cannot be in the future.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Activity>('/activities', {
        type,
        date,
        duration,
        intensity,
        notes: notes || undefined,
      });
      setActivities((prev) => [created, ...prev]);
      resetForm();
      showSuccess('Activity saved. Your dashboard will update automatically.');
      flashRow(created._id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save activity');
    } finally {
      setSubmitting(false);
    }
  }

  function handleEditSaved(updated: Activity) {
    setActivities((prev) => prev.map((a) => (a._id === updated._id ? updated : a)));
    setEditingActivity(null);
    showSuccess('Activity updated. Your dashboard will update automatically.');
    flashRow(updated._id);
  }

  async function confirmDelete() {
    if (!deleteCandidate || deleting) return;
    const id = deleteCandidate._id;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.delete(`/activities/${id}`);
      setActivities((prev) => prev.filter((a) => a._id !== id));
      if (editingActivity?._id === id) setEditingActivity(null);
      setDeleteCandidate(null);
      showSuccess('Activity deleted. Your dashboard will update automatically.');
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed to delete activity');
    } finally {
      setDeleting(false);
    }
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteCandidate(null);
    setDeleteError(null);
  }

  return (
    <DashboardLayout allowedRoles={['athlete']} title="Activity Tracking">
      <div className="grid-1-2">
        <div className="card">
          <h2 className="card-title">Log New Activity</h2>

          {success && <div className="alert alert-success">{success}</div>}
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="f-type">Activity Type</label>
              <select
                id="f-type"
                value={type}
                onChange={(e) => setType(e.target.value as ActivityType | '')}
                required
              >
                <option value="">Select…</option>
                {ACTIVITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="f-date">Date</label>
              <input
                id="f-date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="f-dur">Duration (minutes)</label>
                <input
                  id="f-dur"
                  type="number"
                  min={10}
                  max={240}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 0)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="f-int">Intensity (RPE 1–10)</label>
                <input
                  id="f-int"
                  type="number"
                  min={1}
                  max={10}
                  value={intensity}
                  onChange={(e) => setIntensity(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <RpeGuide open={showRpeGuide} onToggle={() => setShowRpeGuide((v) => !v)} />

            <LoadPreview duration={duration} intensity={intensity} />

            <div className="form-group" style={{ marginTop: 14 }}>
              <label htmlFor="f-notes">Notes (optional)</label>
              <textarea
                id="f-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant observations…"
                rows={3}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={submitting}
            >
              {submitting ? 'Saving…' : 'Save Activity'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title" style={{ marginBottom: 4 }}>Activity History</h2>
              <span className="text-muted">
                {filtered.length} session{filtered.length === 1 ? '' : 's'} logged
              </span>
            </div>
            <select
              className="select-inline"
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as ActivityType | '')}
              aria-label="Filter by activity type"
            >
              <option value="">All Types</option>
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-muted" style={{ padding: '20px 0' }}>Loading activities…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted" style={{ padding: '20px 0' }}>
              {activities.length === 0
                ? 'No activities logged yet. Use the form on the left to log your first session.'
                : 'No activities match the selected filter.'}
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Duration</th>
                    <th>Intensity</th>
                    <th>Load</th>
                    <th aria-label="actions"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a) => {
                    const isExpanded = expandedNotes.has(a._id);
                    return (
                      <Fragment key={a._id}>
                        <tr className={flashRowId === a._id ? 'row-flash' : undefined}>
                          <td>
                            {a.notes && (
                              <button
                                type="button"
                                className="note-caret"
                                onClick={() => toggleNote(a._id)}
                                aria-expanded={isExpanded}
                                aria-label={isExpanded ? 'Hide note' : 'Show note'}
                                title={isExpanded ? 'Hide note' : 'Show note'}
                              >
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            )}
                            {new Date(a.date).toISOString().slice(0, 10)}
                          </td>
                          <td><span className="tag-pill">{a.type}</span></td>
                          <td>{a.duration} min</td>
                          <td>{a.intensity}/10</td>
                          <td><strong>{a.load}</strong></td>
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setEditingActivity(a)}
                              disabled={deleting && deleteCandidate?._id === a._id}
                              style={{ marginRight: 6 }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setDeleteCandidate(a)}
                              disabled={deleting && deleteCandidate?._id === a._id}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                        {isExpanded && a.notes && (
                          <tr className={`activity-notes-row${flashRowId === a._id ? ' row-flash' : ''}`}>
                            <td colSpan={6}>
                              <div className="activity-note">📝 {a.notes}</div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editingActivity && (
        <ActivityEditModal
          activity={editingActivity}
          onSaved={handleEditSaved}
          onClose={() => setEditingActivity(null)}
        />
      )}

      {deleteCandidate && (
        <DeleteConfirmModal
          activity={deleteCandidate}
          deleting={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onClose={closeDeleteModal}
        />
      )}
    </DashboardLayout>
  );
}
