'use client';

// Admin one-click data backup. Downloads the current HoloMotion-derived data
// (athletes + muscle flags) as a multi-sheet Excel workbook — an offline
// snapshot for records, review, or handover.

import { useState } from 'react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('airms_token');
}

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
      <p className="text-muted" style={{ fontSize: '0.9rem', marginTop: 0 }}>
        Export all current athlete and muscle-flag data to a single Excel workbook —
        an offline snapshot for records, review, or handover.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <button type="button" className="btn btn-gold" onClick={download} disabled={busy}>
        {busy ? 'Preparing…' : 'Download backup (.xlsx)'}
      </button>
    </div>
  );
}
