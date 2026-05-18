'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

const BODY_PARTS = ['Neck', 'Shoulder', 'Spine', 'Lumbar/Pelvis', 'Knee', 'Ankle', 'Hip', 'Elbow', 'Wrist', 'Other'];
const SIDES = ['Left', 'Right', 'Both', 'N/A'] as const;
const INJURY_TYPES = ['Sprain', 'Strain', 'Tendinitis', 'Bursitis', 'Fracture', 'Contusion', 'Dislocation', 'Other'];
const SEVERITIES = ['Minor', 'Moderate', 'Severe'] as const;
const MECHANISMS = ['Contact', 'Non-contact', 'Overuse', 'Recurrent'] as const;
const RECOVERY = ['Recovering', 'Recovered', 'Chronic'] as const;

interface AthleteOption {
  athleteId: string;
  name: string;
  sport: string;
}

interface Injury {
  _id: string;
  athleteId: string;
  athleteName?: string;
  bodyPart: string;
  side: string;
  injuryType: string;
  severity: string;
  mechanism?: string;
  date: string;
  recoveryStatus: 'Recovering' | 'Recovered' | 'Chronic';
  notes?: string;
  loggedBy?: string;
  createdAt: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function InjuryLogInner() {
  const params = useSearchParams();
  const presetAthleteId = params.get('athleteId') ?? '';

  const [athletes, setAthletes] = useState<AthleteOption[]>([]);
  const [recent, setRecent] = useState<Injury[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [athleteId, setAthleteId] = useState(presetAthleteId);
  const [bodyPart, setBodyPart] = useState('');
  const [side, setSide] = useState<typeof SIDES[number]>('N/A');
  const [injuryType, setInjuryType] = useState('');
  const [severity, setSeverity] = useState<typeof SEVERITIES[number]>('Minor');
  const [mechanism, setMechanism] = useState<typeof MECHANISMS[number]>('Non-contact');
  const [date, setDate] = useState(todayISO());
  const [recoveryStatus, setRecoveryStatus] = useState<typeof RECOVERY[number]>('Recovering');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [list, injuries] = await Promise.all([
          api.get<AthleteOption[]>('/athletes'),
          api.get<Injury[]>('/injuries').catch(() => [] as Injury[]),
        ]);
        if (!cancelled) {
          setAthletes(list);
          setRecent(injuries.slice(0, 8));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const athleteIndex = useMemo(
    () => new Map(athletes.map((a) => [a.athleteId, a])),
    [athletes],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!athleteId || !bodyPart || !injuryType) return;
    if (!athleteIndex.has(athleteId)) {
      setError(`No athlete found with ID "${athleteId}".`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Injury>('/injuries', {
        athleteId,
        bodyPart,
        side,
        injuryType,
        severity,
        mechanism,
        date,
        recoveryStatus,
        notes: notes || undefined,
      });
      setRecent((prev) => [created, ...prev].slice(0, 8));
      setSuccess(`Injury logged for ${created.athleteName ?? athleteId}.`);
      // Reset (but keep athleteId so you can add multiple injuries for the same athlete)
      setBodyPart('');
      setSide('N/A');
      setInjuryType('');
      setSeverity('Minor');
      setMechanism('Non-contact');
      setDate(todayISO());
      setRecoveryStatus('Recovering');
      setNotes('');
      window.setTimeout(() => setSuccess(null), 3500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to log injury');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout allowedRoles={['medical']} title="Injury Logging">
      <div className="grid-1-2">
        <div className="card">
          <h2 className="card-title">Log Official Injury</h2>
          {success && <div className="alert alert-success">{success}</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="inj-athlete">Athlete</label>
              <input
                id="inj-athlete"
                list="athlete-list"
                value={athleteId}
                onChange={(e) => setAthleteId(e.target.value)}
                placeholder="Search by name or athlete ID…"
                required
              />
              <datalist id="athlete-list">
                {athletes.map((a) => (
                  <option key={a.athleteId} value={a.athleteId}>{a.name} — {a.sport}</option>
                ))}
              </datalist>
              {athleteId && athleteIndex.has(athleteId) && (
                <small className="text-muted">
                  Selected: {athleteIndex.get(athleteId)?.name} · {athleteIndex.get(athleteId)?.sport}
                </small>
              )}
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="inj-bp">Body Part</label>
                <select id="inj-bp" value={bodyPart} onChange={(e) => setBodyPart(e.target.value)} required>
                  <option value="">Select…</option>
                  {BODY_PARTS.map((b) => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="inj-side">Side</label>
                <select id="inj-side" value={side} onChange={(e) => setSide(e.target.value as typeof SIDES[number])}>
                  {SIDES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="inj-type">Injury Type</label>
                <select id="inj-type" value={injuryType} onChange={(e) => setInjuryType(e.target.value)} required>
                  <option value="">Select…</option>
                  {INJURY_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="inj-sev">Severity</label>
                <select id="inj-sev" value={severity} onChange={(e) => setSeverity(e.target.value as typeof SEVERITIES[number])}>
                  {SEVERITIES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor="inj-mech">Mechanism</label>
                <select id="inj-mech" value={mechanism} onChange={(e) => setMechanism(e.target.value as typeof MECHANISMS[number])}>
                  {MECHANISMS.map((m) => (<option key={m} value={m}>{m}</option>))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="inj-date">Date of Injury</label>
                <input id="inj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="inj-status">Recovery Status</label>
              <select id="inj-status" value={recoveryStatus} onChange={(e) => setRecoveryStatus(e.target.value as typeof RECOVERY[number])}>
                {RECOVERY.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="inj-notes">Clinical Notes</label>
              <textarea
                id="inj-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Findings, treatment plan, return-to-play criteria…"
                rows={4}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
              {submitting ? 'Saving…' : 'Log Injury'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ marginBottom: 0 }}>Recent Injury Logs</h2>
            <span className="text-muted">Last 8 entries</span>
          </div>
          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : recent.length === 0 ? (
            <div className="empty-state">No injuries logged yet.</div>
          ) : (
            recent.map((i) => (
              <div key={i._id} className="injury-record">
                <div className="injury-record-head">
                  <div>
                    <strong>{i.athleteName ?? i.athleteId}</strong>
                    <div className="injury-record-meta">
                      {i.bodyPart} ({i.side}) — {i.injuryType} · {i.severity}
                    </div>
                    <div className="injury-record-meta">
                      {new Date(i.date).toISOString().slice(0, 10)}
                      {i.mechanism ? ` · ${i.mechanism}` : ''}
                      {i.loggedBy ? ` · by ${i.loggedBy}` : ''}
                    </div>
                  </div>
                  <span className={
                    i.recoveryStatus === 'Recovered' ? 'badge-low' :
                    i.recoveryStatus === 'Recovering' ? 'badge-moderate' :
                    'badge-high'
                  }>
                    {i.recoveryStatus}
                  </span>
                </div>
                {i.notes && <div className="injury-record-notes">{i.notes}</div>}
              </div>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function InjuryLogPage() {
  return (
    <Suspense fallback={null}>
      <InjuryLogInner />
    </Suspense>
  );
}
