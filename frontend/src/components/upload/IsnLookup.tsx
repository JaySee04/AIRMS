'use client';

// ISN directory lookup (A3). When an athlete isn't on the AIRMS roster, the
// operator searches ISN by name/IC and picks their master record to pre-fill a
// new athlete (IC, name, sport, programme, age, gender, disciplines). Backed by
// GET /api/isn/athletes — a mock ISN directory today, the real ISN source later.

import { useState } from 'react';
import { api } from '@/lib/api';

export interface IsnRecord {
  icNumber: string; name: string; dateOfBirth: string; age: number | null; gender: string;
  sport: string; programme: string; disciplines: string[]; nationality: string; stateOfBirth: string;
  contactEmail: string; contactPhone: string; dateRegistered: string; status: string; inRoster: boolean;
}

export default function IsnLookup({ onPick }: { onPick: (r: IsnRecord) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<IsnRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    const query = q.trim();
    if (!query) return;
    setBusy(true); setErr(null); setSearched(true);
    try { setResults(await api.get<IsnRecord[]>(`/isn/athletes?q=${encodeURIComponent(query)}`)); }
    catch (e) { setErr(e instanceof Error ? e.message : 'ISN lookup failed'); setResults([]); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, marginBottom: 10 }}>
      <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginBottom: 6 }}>
        Not on the roster? Look the athlete up in the <strong>ISN directory</strong> to import their details.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }}
          placeholder="Search ISN by name or IC…"
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-outline btn-sm" onClick={search} disabled={busy || !q.trim()}>{busy ? '…' : 'Search ISN'}</button>
      </div>
      {err && <div className="alert alert-error" style={{ marginTop: 8 }}>{err}</div>}
      {searched && !busy && results.length === 0 && !err && (
        <div className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 8 }}>No ISN athlete matches “{q.trim()}”.</div>
      )}
      {results.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {results.map((r) => (
            <div key={r.icNumber} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong style={{ fontSize: 'var(--fs-md)' }}>{r.name}</strong>{' '}
                <span className="text-muted" style={{ fontSize: 'var(--fs-xs)' }}>
                  IC {r.icNumber} · {r.sport} · {r.programme} · {r.gender}{r.age != null ? ` · ${r.age}y` : ''}
                </span>
              </div>
              {r.inRoster
                ? <span className="badge-low" title="Already an AIRMS athlete">In AIRMS</span>
                : <button type="button" className="btn btn-primary btn-sm" onClick={() => onPick(r)}>Use</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
