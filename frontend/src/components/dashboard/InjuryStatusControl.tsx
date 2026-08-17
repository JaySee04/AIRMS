'use client';

// Medical-side injury control (B4). Lets medical/admin mark an athlete injured
// or recovered — SEPARATE from the green/amber/red risk band. An injured athlete
// is auto-excluded from cohort-norm CALCULATION (still scored against the norm),
// which the server rebuilds immediately — so the first change in a browser shows
// the norm-change notice before it happens.
// PATCHes /api/athletes/:id/injury and calls onSaved to reload.

import { useState } from 'react';
import { api } from '@/lib/api';
import { useNormChangeNotice } from '@/components/admin/NormChangeNotice';

interface Props {
  athleteId: string;
  isInjured?: boolean;
  injuryNote?: string | null;
  injuryBy?: string | null;
  injuryAt?: string | null;
  onSaved?: () => void;
}

export default function InjuryStatusControl({ athleteId, isInjured, injuryNote, injuryBy, injuryAt, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(injuryNote ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { guard, notice } = useNormChangeNotice();

  async function apply(injured: boolean) {
    setBusy(true); setErr(null);
    try {
      await api.patch(`/athletes/${athleteId}/injury`, { isInjured: injured, note: injured ? note : '' });
      setOpen(false);
      onSaved?.();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }
  // Declaring an athlete injured (or recovered) changes who the norm is built
  // from, so it goes through the same one-time disclosure as the tick box.
  const save = (injured: boolean) => guard(() => { void apply(injured); });

  return (
    <div className="card" style={{ marginTop: 20, borderLeft: `4px solid ${isInjured ? 'var(--risk-high)' : 'var(--risk-low)'}` }}>
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Injury status</h2>
        <span className="card-sub">Set by medical staff — separate from the risk band. An injured athlete is excluded from cohort-norm calculation (still scored against it).</span>
      </div></div>
      {notice}
      {err && <div className="alert alert-error" style={{ marginBottom: 10 }}>{err}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <span className={isInjured ? 'badge-high' : 'badge-low'}>{isInjured ? 'Injured' : 'Not injured'}</span>
        {isInjured && injuryNote && <span style={{ fontSize: 'var(--fs-md)' }}>{injuryNote}</span>}
        {isInjured && injuryBy && (
          <span className="text-muted" style={{ fontSize: 'var(--fs-sm)' }}>· {injuryBy}{injuryAt ? ` · ${new Date(injuryAt).toLocaleDateString()}` : ''}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {isInjured ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => save(false)} disabled={busy}>Mark recovered</button>
          ) : open ? (
            <>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Injury note (optional)" style={{ minWidth: 220 }} />
              <button type="button" className="btn btn-primary btn-sm" onClick={() => save(true)} disabled={busy}>Confirm injured</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(false)} disabled={busy}>Cancel</button>
            </>
          ) : (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setOpen(true)}>Mark injured</button>
          )}
        </div>
      </div>
    </div>
  );
}
