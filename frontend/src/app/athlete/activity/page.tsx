'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

export default function ActivityPage() {
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [type, setType] = useState<ActivityType | ''>('');
  const [date, setDate] = useState<string>(todayISO());
  const [duration, setDuration] = useState<number>(60);
  const [intensity, setIntensity] = useState<number>(6);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Filter state
  const [filterType, setFilterType] = useState<ActivityType | ''>('');

  const [showRpeGuide, setShowRpeGuide] = useState(false);

  // Track in-flight deletes per row so rapid double-clicks can't fire two DELETEs
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Hold the success-toast timer so we can clear it on unmount
  const successTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
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

  const load = duration * intensity;

  const filtered = useMemo(
    () => (filterType ? activities.filter((a) => a.type === filterType) : activities),
    [activities, filterType],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !date) return;
    // Client-side guards so a zero/invalid value never makes a doomed POST.
    if (!Number.isFinite(duration) || duration < 10 || duration > 240) {
      setError('Duration must be between 10 and 240 minutes.');
      return;
    }
    if (!Number.isFinite(intensity) || intensity < 1 || intensity > 10) {
      setError('Intensity must be between 1 and 10.');
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
      setType('');
      setDate(todayISO());
      setDuration(60);
      setIntensity(6);
      setNotes('');
      setSuccess('Activity saved. Your dashboard will update automatically.');
      if (successTimerRef.current !== null) {
        window.clearTimeout(successTimerRef.current);
      }
      successTimerRef.current = window.setTimeout(() => {
        setSuccess(null);
        successTimerRef.current = null;
      }, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save activity');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    if (!window.confirm('Delete this activity entry?')) return;
    setDeletingId(id);
    try {
      await api.delete(`/activities/${id}`);
      setActivities((prev) => prev.filter((a) => a._id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete activity');
    } finally {
      setDeletingId(null);
    }
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

            <div className="rpe-guide-wrap">
              <button
                type="button"
                className="rpe-guide-toggle"
                onClick={() => setShowRpeGuide((v) => !v)}
                aria-expanded={showRpeGuide}
              >
                <span>{showRpeGuide ? '▾' : '▸'}</span> RPE Reference Guide
              </button>
              {showRpeGuide && (
                <table className="rpe-table">
                  <thead>
                    <tr>
                      <th>RPE</th>
                      <th>Effort Level</th>
                      <th>Example</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>1 – 2</td>
                      <td>Very light</td>
                      <td>Gentle walk, cool-down stretching</td>
                    </tr>
                    <tr>
                      <td>3 – 4</td>
                      <td>Light – Moderate</td>
                      <td>Easy jog, warm-up drills</td>
                    </tr>
                    <tr>
                      <td>5 – 6</td>
                      <td>Hard</td>
                      <td>Typical training session, breathless but sustainable</td>
                    </tr>
                    <tr>
                      <td>7 – 8</td>
                      <td>Very hard</td>
                      <td>High-intensity intervals, can only speak in short phrases</td>
                    </tr>
                    <tr>
                      <td>9 – 10</td>
                      <td>Maximum</td>
                      <td>Competition effort, all-out sprint, cannot maintain</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            <div className="load-preview">
              <div className="load-formula">
                Load = Duration × Intensity
                <span className="load-info-icon">
                  ⓘ
                  <span className="load-tooltip">
                    Session load (AU — Arbitrary Units) reflects the total internal demand of a training session. It combines how long and how hard you trained. This value feeds directly into your weekly ACWR and risk level on the dashboard.
                  </span>
                </span>
              </div>
              <div className="load-value">
                <span>{duration}</span> min × <span>{intensity}</span> ={' '}
                <strong>{load.toLocaleString()}</strong> AU
              </div>
              <div className="load-note">{loadNote(load)}</div>
            </div>

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
                  {filtered.map((a) => (
                    <tr key={a._id}>
                      <td>{new Date(a.date).toISOString().slice(0, 10)}</td>
                      <td><span className="tag-pill">{a.type}</span></td>
                      <td>{a.duration} min</td>
                      <td>{a.intensity}/10</td>
                      <td><strong>{a.load}</strong></td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => handleDelete(a._id)}
                          disabled={deletingId === a._id}
                        >
                          {deletingId === a._id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
