'use client';

// Screening History — the on-screen counterpart of the individual PDF's
// "Progress Between Reports" section. Fetches the athlete's full screening
// history (GET /screenings/athlete/:id — summary columns only) and renders a
// newest-first table with a "Change since first screening" footer, coloured
// with the same lower-is-better rule for Exercise Risks the PDF uses.
// Shared by the athlete dashboard and the medical + coach detail views; the
// backend scopes access per role (self / viewRecords / coach's sport).

import { ReactNode, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface ScreeningRow {
  id: number;
  assessedAt?: string | null;
  importedBy?: string | null;
  totalScore?: number | string | null;
  rom?: number | string | null;
  stability?: number | string | null;
  symmetry?: number | string | null;
  exerciseRisks?: number | string | null;
  overallIndicator?: number | string | null;
  overallBand?: 'green' | 'amber' | 'red' | null;
  overrideBand?: 'green' | 'amber' | 'red' | null;
  overrideBy?: string | null;
}

type ScoreKey = 'totalScore' | 'rom' | 'stability' | 'symmetry' | 'exerciseRisks';

// exerciseRisks is the one column where lower is better (mirrors the PDF).
const COLS: Array<{ key: ScoreKey; label: string }> = [
  { key: 'totalScore', label: 'Total' },
  { key: 'rom', label: 'ROM' },
  { key: 'stability', label: 'Stability' },
  { key: 'symmetry', label: 'Symmetry' },
  { key: 'exerciseRisks', label: 'Ex. Risks' },
];

const BAND_BADGE = { green: 'badge-low', amber: 'badge-moderate', red: 'badge-high' } as const;
const BAND_LABEL = { green: 'Green', amber: 'Amber', red: 'Red' } as const;

// MySQL DECIMAL columns arrive as strings — normalise before arithmetic.
function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '—';
}

export default function ScreeningHistory({ athleteId, headerAction }: {
  athleteId: string;
  /** Optional right-side header slot (e.g. the athlete's Download PDF button). */
  headerAction?: ReactNode;
}) {
  const [rows, setRows] = useState<ScreeningRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    api.get<ScreeningRow[]>(`/screenings/athlete/${athleteId}`)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setRows([]); }); // non-critical surface — fail quiet
    return () => { cancelled = true; };
  }, [athleteId]);

  // Nothing to say until there's at least one screening on record.
  if (!rows || rows.length === 0) return null;

  const first = rows[rows.length - 1]; // oldest
  const last = rows[0]; // newest

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Screening History</h2>
          <span className="card-sub">Report-to-report progress · newest first</span>
        </div>
        {headerAction}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: 'center' }}>Band</th>
              <th style={{ textAlign: 'right' }}>Indicator</th>
              {COLS.map((c) => (<th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const band = r.overrideBand || r.overallBand;
              return (
                <tr key={r.id}>
                  <td>{fmtDate(r.assessedAt)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {band ? (
                      <span
                        className={BAND_BADGE[band]}
                        title={r.overrideBand ? `Clinician override by ${r.overrideBy ?? 'medical'}` : undefined}
                      >
                        {BAND_LABEL[band]}{r.overrideBand ? ' *' : ''}
                      </span>
                    ) : (
                      <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{num(r.overallIndicator) ?? '—'}</td>
                  {COLS.map((c) => (
                    <td key={c.key} style={{ textAlign: 'right' }}>{num(r[c.key]) ?? '—'}</td>
                  ))}
                </tr>
              );
            })}
            {rows.length >= 2 && (
              <tr style={{ fontWeight: 600 }}>
                <td colSpan={2}>Change since first</td>
                {(['overallIndicator', ...COLS.map((c) => c.key)] as Array<'overallIndicator' | ScoreKey>).map((key) => {
                  const a = num(first[key]);
                  const b = num(last[key]);
                  const d = a !== null && b !== null ? Math.round((b - a) * 100) / 100 : null;
                  // exerciseRisks: lower is better — colour improvement accordingly.
                  const good = key === 'exerciseRisks' ? d !== null && d <= 0 : d !== null && d >= 0;
                  return (
                    <td key={key} style={{ textAlign: 'right', color: d === null ? undefined : good ? 'var(--risk-low, #2e9e5b)' : 'var(--risk-high, #d14b4b)' }}>
                      {d === null ? '—' : d >= 0 ? `+${d}` : `${d}`}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 12, marginBottom: 0 }}>
        {rows.length < 2
          ? 'Only one screening on record — progress deltas appear once a newer report is imported.'
          : '* = clinician override. Higher is better except Ex. Risks (lower is better).'}
      </p>
    </div>
  );
}
