'use client';

// Athlete · My Squad (C3). A read-only, summary view of the athlete's own squad
// (same sport): each teammate's overall risk band + cohort-normed indicator.
// Deliberately NO peer clinical/screening detail — athletes see squad readiness,
// not each other's reports (privacy). Backed by GET /api/athletes/teammates.

import { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';
import { BAND_SHORT, BAND_COLOR, Band } from '@/lib/bands';
import { Histogram } from '@/components/charts/Charts';

interface Teammate {
  /** Self only — a teammate's row carries no id, because the id is their IC number. */
  athleteId?: string; name: string; program: string | null;
  isSelf: boolean; overallIndicator: number | null; effectiveBand: Band | null;
}
/** The caller's own cohort — NOT this squad. See the note on the context line. */
interface You { cohortLabel: string | null; cohortSize: number | null; cohortRank: number | null; overallIndicator: number | null; }
interface Resp { sport: string; you: You | null; teammates: Teammate[]; }

// Labels and colours both come from lib/bands. This file used to declare its own
// map and had drifted to `var(--risk-med)`, which is not a token that exists — the
// amber dot and the amber tile's top border rendered with an invalid custom
// property while green and red were fine. That is exactly the drift BAND_COLOR
// exists to prevent, and it was invisible in review because the name looks right.
const BAND: Record<Band, { label: string; color: string }> = {
  green: { label: BAND_SHORT.green, color: BAND_COLOR.green },
  amber: { label: BAND_SHORT.amber, color: BAND_COLOR.amber },
  red: { label: BAND_SHORT.red, color: BAND_COLOR.red },
};

export default function AthleteSquadPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { setLoading(true); const r = await api.get<Resp>('/athletes/teammates'); if (!cancelled) setData(r); }
      catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load squad'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Every scored indicator in the squad, self included — the shape the band
  // tiles cannot show. Three counts are equally produced by a squad clustered at
  // the middle and by one split between two tails (§25).
  const values = useMemo(
    () => (data?.teammates ?? []).map((t) => t.overallIndicator).filter((v): v is number => typeof v === 'number'),
    [data],
  );

  const counts = useMemo(() => {
    const m = { green: 0, amber: 0, red: 0, none: 0 };
    (data?.teammates ?? []).forEach((t) => { if (t.effectiveBand) m[t.effectiveBand] += 1; else m.none += 1; });
    return m;
  }, [data]);

  return (
    <DashboardLayout allowedRoles={['athlete']} title="My Squad">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>{data?.sport ?? 'My'} Squad</h2>
          <span className="card-sub">Read-only. Each athlete&apos;s detailed report stays private to them and the medical team.</span>
        </div></div>
        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : !data || data.teammates.length === 0 ? (
          <div className="empty-state">No squad on record.</div>
        ) : (
          <>
            <div className="stat-grid" style={{ marginBottom: 12 }}>
              {(['green', 'amber', 'red'] as const).map((b) => (
                <div className="stat-tile" key={b} style={{ borderTop: `3px solid ${BAND[b].color}` }}>
                  <div className="stat-tile-label">{BAND[b].label}</div>
                  <div className="stat-tile-value">{counts[b]}</div>
                  <div className="stat-tile-delta">athlete{counts[b] === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
            {/* The page's central ambiguity, stated rather than left to the
                reader: this table is the whole SPORT, the Indicator column is
                normed against a much narrower cohort, and the two are routinely
                confused into "I am 3rd of 16". */}
            {data.you?.cohortLabel && (
              <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 0, marginBottom: 12 }}>
                This table is everyone in <strong>{data.sport}</strong> ({data.teammates.length} athletes).
                Your indicator is not a rank within it — you are scored against{' '}
                <strong>{data.you.cohortLabel}</strong>
                {typeof data.you.cohortSize === 'number' && <> ({data.you.cohortSize} athlete{data.you.cohortSize === 1 ? '' : 's'})</>}
                {typeof data.you.cohortSize === 'number' && data.you.cohortSize < 10 && (
                  <> — a small group, so your score moves more easily than it would against a large one</>
                )}. The per-measure group averages behind it are on your dashboard.
              </p>
            )}
            {/* Below five scored athletes a histogram is a row of single-athlete
                spikes that invites reading noise as shape — the same reason §24
                renders one period as a summary rather than a lone bar. */}
            {values.length >= 5 && typeof data.you?.overallIndicator === 'number' && (
              <div style={{ marginBottom: 16 }}>
                <Histogram
                  values={values}
                  min={0}
                  max={100}
                  binSize={5}
                  valueLabel="indicator"
                  markers={[{
                    // Neutral, not the athlete's band colour: a coloured vertical
                    // rule on a chart reads as a THRESHOLD, and this one is a
                    // position.
                    at: data.you.overallIndicator,
                    label: `You (${data.you.overallIndicator})`,
                    color: 'var(--text)',
                  }]}
                />
                <p className="chart-note">
                  Where every scored athlete in {data.sport} sits, and where you sit among them.
                  Unlike the same chart on a single-cohort view, the centre here is <strong>not</strong> fixed
                  at 50: this squad spans several cohorts and each athlete is normed against their own,
                  so the shape is the squad&apos;s spread rather than a scale with a guaranteed middle.
                  A long tail on either side means a few athletes are carrying most of the difference —
                  which the three counts above cannot tell apart from an even squad.
                </p>
              </div>
            )}
            <div className="table-wrap">
              <table>
                <thead><tr><th>Athlete</th><th>Programme</th><th style={{ textAlign: 'center' }}>Readiness</th><th style={{ textAlign: 'center' }}>Indicator</th></tr></thead>
                <tbody>
                  {data.teammates.map((t, i) => (
                    <tr key={t.athleteId ?? `mate-${i}`} style={t.isSelf ? { background: 'var(--bg)' } : undefined}>
                      <td><strong>{t.name}</strong>{t.isSelf && <span className="badge-low" style={{ marginLeft: 8 }}>You</span>}</td>
                      <td className="text-muted" style={{ fontSize: 'var(--fs-md)' }}>{t.program ?? '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {t.effectiveBand ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: BAND[t.effectiveBand].color }} />
                            {BAND[t.effectiveBand].label}
                          </span>
                        ) : <span className="text-muted">Not scored</span>}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{t.overallIndicator ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-muted" style={{ fontSize: 'var(--fs-sm)', marginTop: 10, marginBottom: 0 }}>
              Indicator is the cohort-normed score (0–100, 50 = group average). Only squad readiness is shared here — detailed screening reports aren&apos;t visible between athletes.
            </p>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
