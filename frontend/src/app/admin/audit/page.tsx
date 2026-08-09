'use client';

// Activity Log — who changed what, for work transparency.
//
// Read-only surface over an append-only table. Open to admin and executive:
// seeing how the institution is being run, without being able to change it, is
// exactly what the executive role is for.

import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface Entry {
  _id: string;
  at: string;
  actor: string;
  actorRole: string | null;
  action: string;
  actionLabel: string;
  entity: string | null;
  entityId: string | null;
  summary: string | null;
  meta: Record<string, unknown> | null;
}
interface Payload {
  total: number;
  entries: Entry[];
  actions: Array<{ value: string; label: string }>;
}

const PAGE = 100;

// Colour by what the action touches, so a long list is scannable: clinical
// judgement, norm governance, and data intake read differently at a glance.
const ACTION_TONE: Record<string, string> = {
  'screening.import': 'badge-low',
  'screening.override': 'badge-high',
  'athlete.injury': 'badge-high',
  'norm.restore': 'badge-moderate',
  'norm.member': 'badge-moderate',
  'settings.update': 'badge-moderate',
};

function fmt(at: string): string {
  const d = new Date(at);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

// Tokens are the only meta worth surfacing inline — it answers "what does an
// import cost?" without opening anything.
function tokensOf(meta: Record<string, unknown> | null): string | null {
  const t = meta && (meta.tokens as { totalTokens?: number } | null);
  if (!t || typeof t.totalTokens !== 'number') return null;
  return `${t.totalTokens.toLocaleString()} tokens`;
}

export default function AuditPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const q = new URLSearchParams({ limit: String(PAGE), offset: String(offset) });
    if (action) q.set('action', action);
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    try {
      setData(await api.get<Payload>(`/audit?${q.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the activity log');
    }
  }, [action, from, to, offset]);

  useEffect(() => { load(); }, [load]);
  // Any filter change restarts paging — otherwise you can land on page 3 of a
  // result set that now has one page.
  useEffect(() => { setOffset(0); }, [action, from, to]);

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;

  return (
    <DashboardLayout allowedRoles={['admin', 'executive']} title="Activity Log">
      <div className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title" style={{ marginBottom: 0 }}>Activity Log</h2>
            <span className="card-sub">
              Every import, override, injury flag and norm change — who did it and when.
              Records are written automatically and cannot be edited or deleted.
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
          <label style={{ fontSize: '0.8rem' }}>
            <div className="text-muted" style={{ marginBottom: 4 }}>Action</div>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {(data?.actions ?? []).map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.8rem' }}>
            <div className="text-muted" style={{ marginBottom: 4 }}>From</div>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label style={{ fontSize: '0.8rem' }}>
            <div className="text-muted" style={{ marginBottom: 4 }}>To</div>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(action || from || to) && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAction(''); setFrom(''); setTo(''); }}>
              Clear
            </button>
          )}
          <div className="text-muted" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
            {total} record{total === 1 ? '' : 's'}
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {!error && entries.length === 0 && (
          <div className="empty-state" style={{ padding: 24 }}>
            {data === null
              ? 'Loading…'
              : (action || from || to)
                ? 'No activity matches these filters.'
                : 'No activity recorded yet. Actions are logged from the moment they happen — '
                  + 'anything done before this log existed is not in it.'}
          </div>
        )}

        {entries.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e._id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>{fmt(e.at)}</td>
                    <td style={{ fontSize: '0.82rem' }}>
                      <strong>{e.actor}</strong>
                      {e.actorRole && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{e.actorRole}</div>}
                    </td>
                    <td><span className={ACTION_TONE[e.action] ?? 'badge-low'}>{e.actionLabel}</span></td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {e.summary || <span className="text-muted">—</span>}
                      {tokensOf(e.meta) && (
                        <span className="text-muted" style={{ marginLeft: 8, fontSize: '0.72rem' }}>
                          · {tokensOf(e.meta)}
                        </span>
                      )}
                      {e.meta && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          style={{ marginLeft: 8, fontSize: '0.72rem' }}
                          aria-expanded={open === e._id}
                          onClick={() => setOpen(open === e._id ? null : e._id)}
                        >
                          {open === e._id ? 'Hide' : 'Details'}
                        </button>
                      )}
                      {open === e._id && e.meta && (
                        <pre style={{
                          marginTop: 8, fontSize: '0.7rem', whiteSpace: 'pre-wrap',
                          background: 'var(--bg-secondary)', padding: 8, borderRadius: 4,
                        }}>
                          {JSON.stringify(e.meta, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
            <button
              type="button" className="btn btn-outline btn-sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE))}
            >
              Newer
            </button>
            <span className="text-muted" style={{ fontSize: '0.8rem', alignSelf: 'center' }}>
              {offset + 1}–{Math.min(offset + PAGE, total)} of {total}
            </span>
            <button
              type="button" className="btn btn-outline btn-sm"
              disabled={offset + PAGE >= total}
              onClick={() => setOffset(offset + PAGE)}
            >
              Older
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
