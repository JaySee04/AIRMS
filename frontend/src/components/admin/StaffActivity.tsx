'use client';

// Per-account activity: who did how much, and whether it is going up or down.
//
// The Activity Log answers "what happened" chronologically. This answers "who is
// doing the work", which is the question an administrator asks about their own
// programme rather than about any one athlete.
//
// Two sources, stated on the page rather than blended silently: the audit log is
// complete only from the day it was added, while Screening.importedBy covers
// every screening ever committed. Presenting one total would undercount every
// import made before logging existed.

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Staff {
  actor: string;
  role: string | null;
  actions: number;
  /** Reports and backups pulled — access, counted apart from changes made. */
  downloads: number;
  previousActions: number;
  change: number;
  byAction: Record<string, number>;
  screeningsImported: number;
}
interface Payload {
  window: { from: string; to: string };
  previousWindow: { from: string; to: string };
  logCompleteFrom: string | null;
  /** False when the previous window predates logging, making "vs previous" meaningless. */
  comparable: boolean;
  actionLabels: Record<string, string>;
  staff: Staff[];
}

const day = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString() : '—');

export default function StaffActivity({ from, to }: { from?: string; to?: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    const q = new URLSearchParams();
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    api.get<Payload>(`/audit/staff${q.toString() ? `?${q.toString()}` : ''}`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load staff activity'); });
    return () => { cancelled = true; };
  }, [from, to]);

  // Seeded rows are not people and should not appear in a staff table.
  const staff = (data?.staff ?? []).filter((s) => !/^seed/i.test(s.actor));
  const labels = data?.actionLabels ?? {};

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Staff activity</h2>
          {/* The subtitle must not promise a comparison the table then omits. */}
          <span className="card-sub">
            {!data
              ? 'Who is doing the work, and what is being taken out of the system.'
              : data.comparable
                ? `${day(data.window.from)} – ${day(data.window.to)}, compared with the same length of time before it.`
                : `${day(data.window.from)} – ${day(data.window.to)}. Changes made and reports taken out.`}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide breakdown' : 'Show breakdown'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {!error && data === null && <p className="text-muted" style={{ fontSize: '0.85rem' }}>Loading…</p>}

      {data && staff.length === 0 && (
        <div className="empty-state" style={{ padding: 18 }}>
          No staff activity recorded in this window.
        </div>
      )}

      {staff.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 620 }}>
            <thead>
              <tr>
                <th>Account</th>
                <th style={{ textAlign: 'right' }} title="Changes made: imports, overrides, norm and account edits">Changes</th>
                {/* Reads get their own column rather than being added to the
                    changes count. Coach and executive cannot write anything, so
                    every trace they leave lands here — folding the two together
                    would let a role that only reads outrank the clinicians. */}
                <th style={{ textAlign: 'right' }} title="Reports and backups pulled — access rather than work">Downloads</th>
                {data?.comparable !== false && <th style={{ textAlign: 'right' }}>vs previous</th>}
                <th style={{ textAlign: 'right' }} title="From the screenings table, so complete for all time">Screenings imported</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.actor}>
                  <td>
                    <strong>{s.actor}</strong>
                    {s.role && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{s.role}</div>}
                    {open && Object.keys(s.byAction).length > 0 && (
                      <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
                        {Object.entries(s.byAction)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, n]) => `${labels[k] ?? k}: ${n}`)
                          .join(' · ')}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.actions}</td>
                  <td style={{ textAlign: 'right' }}>
                    {s.downloads > 0 ? s.downloads : <span className="text-muted">—</span>}
                  </td>
                  {data?.comparable !== false && (
                    <td style={{ textAlign: 'right' }}>
                      {s.change === 0 ? (
                        <span className="text-muted">no change</span>
                      ) : (
                        // More activity is not automatically "good" — it is more
                        // work recorded. Neutral emphasis, direction only.
                        <span style={{ fontWeight: 600 }}>
                          {s.change > 0 ? '+' : ''}{s.change}
                          <span className="text-muted" style={{ fontWeight: 400 }}> (was {s.previousActions})</span>
                        </span>
                      )}
                    </td>
                  )}
                  <td style={{ textAlign: 'right' }}>{s.screeningsImported}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="text-muted" style={{ fontSize: '0.7rem', marginTop: 10, marginBottom: 0 }}>
          Changes and downloads are counted from the activity log, which is complete from {day(data.logCompleteFrom)}.
          Screenings are counted from the screenings themselves, so that column covers all time and
          will exceed the change count for any import made before logging began.
          {data.comparable === false && (
            // Suppressing the column is not enough on its own — an administrator
            // who saw "vs previous" last month would assume it had been dropped
            // for some other reason. Say which comparison cannot be drawn, and why.
            <>
              {' '}No comparison against {day(data.previousWindow.from)} – {day(data.previousWindow.to)} is
              shown: logging had not started for that window, so every account would read
              &ldquo;was 0&rdquo; — an idle programme and an unrecorded one are not the same thing.
            </>
          )}
        </p>
      )}
    </div>
  );
}
