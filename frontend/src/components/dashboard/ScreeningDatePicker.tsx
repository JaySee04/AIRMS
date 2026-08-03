'use client';

// A compact "which screening" selector for the medical/coach athlete-detail
// views (Module 3 / C2). Lists an athlete's screenings by assessed date; picking
// the LATEST calls onPick(null) so the parent keeps using its live data, and
// picking an older one fetches GET /api/screenings/:id/full and hands the parent
// that historical screening reshaped into the dashboard shape. Renders nothing
// when there's 0–1 screening (nothing to choose between).

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { MuscleEntry } from '@/components/dashboard/BodyMap';
import type { ScreeningIndicator } from '@/components/dashboard/OverallRiskBadge';
import type { AthleteRisks } from '@/lib/screeningAlerts';

export interface FullScreening {
  athleteId: string; name: string; sport: string; age?: number; gender?: string;
  risks: AthleteRisks;
  myodynamia: MuscleEntry[]; tension: MuscleEntry[];
  overallActivityScore?: number; injuryRiskIndex?: number; mobility?: number; stability?: number; symmetry?: number;
  screening?: ScreeningIndicator | null;
}

interface Row { id: number; assessedAt: string | null; }

const fmtDate = (d: string | null) => (d
  ? new Date(d).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Undated');

export default function ScreeningDatePicker({ athleteId, onPick }: { athleteId: string; onPick: (full: FullScreening | null) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  // Reload (and reset the parent to "latest") whenever the athlete changes.
  useEffect(() => {
    let cancelled = false;
    setRows([]); setSelId(null); onPick(null);
    (async () => {
      try {
        const list = await api.get<Row[]>(`/screenings/athlete/${athleteId}`);
        if (cancelled) return;
        setRows(list);
        setSelId(list.length ? list[0].id : null);
      } catch { /* leave the picker hidden on error */ }
    })();
    return () => { cancelled = true; };
    // onPick is treated as stable; re-running on athlete change is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function choose(id: number, isLatest: boolean) {
    setSelId(id);
    if (isLatest) { onPick(null); return; } // latest → parent uses its own live data
    setBusy(true);
    try { onPick(await api.get<FullScreening>(`/screenings/${id}/full`)); }
    catch { onPick(null); }
    finally { setBusy(false); }
  }

  if (rows.length <= 1) return null;

  return (
    <div className="form-group" style={{ maxWidth: 360, marginBottom: 0 }}>
      <label>Viewing screening {busy && <span className="text-muted" style={{ fontWeight: 400 }}>· loading…</span>}</label>
      <select
        value={selId ?? ''}
        onChange={(e) => { const id = Number(e.target.value); choose(id, id === rows[0]?.id); }}
        aria-label="Choose a screening date"
      >
        {rows.map((r, i) => (
          <option key={r.id} value={r.id}>{fmtDate(r.assessedAt)}{i === 0 ? ' · latest' : ''}</option>
        ))}
      </select>
    </div>
  );
}
