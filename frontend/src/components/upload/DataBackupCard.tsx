'use client';

// Admin one-click data backup. Downloads the whole database as a multi-sheet
// Excel workbook — the offline record ISN keeps, reviews and hands over.
//
// THE COPY BELOW NAMES THE SHEETS ON PURPOSE (§149). This card said "all
// current athlete and muscle-flag data" under a heading reading "Data Backup",
// offered "for handover", while exporting 2 of 9 tables — no screenings, no
// norms, no trail. Either half alone was defensible; together they described a
// roster export as a backup. Listing what is inside is what stops the heading
// and the contents drifting apart again, since a reader can now check.

import { useState } from 'react';
import { getSession } from '@/lib/auth';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

// The storage key is lib/auth.ts's business. Read directly here, a rename there
// would leave the backup export silently unauthenticated.
const getToken = (): string | null => getSession()?.token ?? null;

export default function DataBackupCard() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/export/backup.xlsx`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      // Pull the server-provided filename, else fall back to a dated default.
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `airms-backup-${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to export backup');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 className="card-title">Data Backup</h2>
      <p className="text-muted" style={{ fontSize: 'var(--fs-md)', marginTop: 0 }}>
        Every table in one Excel workbook — athletes, every screening ever imported,
        muscle flags, disciplines, the cohort norms in force, settings, accounts and
        the activity log. One sheet each, with a manifest listing the row counts.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <button type="button" className="btn btn-gold" onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download backup (.xlsx)'}
      </button>
    </div>
  );
}
