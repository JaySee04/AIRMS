'use client';

import { useRef, useState } from 'react';

interface PreviewRow {
  index: number;
  athleteId: string;
  name?: string;
  sport?: string;
  action: 'create' | 'update';
  errors: string[];
}

interface PreviewResponse {
  filename: string;
  total: number;
  valid: number;
  invalid: number;
  rows: PreviewRow[];
}

interface CommitResponse {
  message: string;
  created: number;
  updated: number;
  errors: Array<{ reason: string }>;
  total: number;
}

interface ScreeningUploadProps {
  // The role drives the API base URL behaviour, but both medical and admin call
  // the same backend route (which permits both via RBAC).
  allowedRole: 'medical' | 'admin';
  title: string;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('airms_token');
}

async function uploadFile(path: string, file: File): Promise<Response> {
  const token = getToken();
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

export default function ScreeningUpload({ allowedRole }: ScreeningUploadProps) {
  void allowedRole; // kept for prop typing; both roles hit the same endpoints
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setCommitResult(null);
    setError(null);
  }

  async function runPreview() {
    if (!file) return;
    setPreviewing(true);
    setError(null);
    try {
      const res = await uploadFile('/upload/screening/preview', file);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setPreview(data as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to preview file');
    } finally {
      setPreviewing(false);
    }
  }

  async function runCommit() {
    if (!file) return;
    if (!preview || preview.invalid > 0) {
      if (!window.confirm(
        `${preview?.invalid ?? 0} row(s) have validation errors and will be skipped. Continue?`,
      )) return;
    }
    setCommitting(true);
    setError(null);
    try {
      const res = await uploadFile('/upload/screening', file);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setCommitResult(data as CommitResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to commit upload');
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="grid-1-2">
      <div className="card">
        <h2 className="card-title">Upload Screening Data</h2>

        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <strong>Schema in flux.</strong> Expected columns include Athlete ID, Name, Age, Gender,
          Weight, Height, Sport, Program, and screening scores. The parser tolerates several column-name
          variants because the canonical column structure for the screening template is still being
          finalised.
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div
          className={`upload-dropzone${dragOver ? ' is-drag' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
          role="button"
          tabIndex={0}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <h3 style={{ margin: '0 0 4px' }}>
            {file ? file.name : 'Drop Excel file here'}
          </h3>
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB · click to replace` : 'or click to browse · .xlsx / .xls'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={runPreview}
            disabled={!file || previewing}
          >
            {previewing ? 'Parsing…' : 'Preview & validate'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={runCommit}
            disabled={!file || committing || !preview}
            title={!preview ? 'Run preview first' : ''}
          >
            {committing ? 'Importing…' : 'Confirm & import'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Tips</h2>
        <ul style={{ margin: '0 0 14px 18px', padding: 0, fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <li>Each row represents one athlete screening session.</li>
          <li>Use ISO date format (<code>YYYY-MM-DD</code>) for any date columns.</li>
          <li>Muscle deficiency / tension cells should contain <code>L</code>, <code>R</code>, <code>B</code>, or be empty.</li>
          <li>Duplicate <code>Athlete ID</code>s update the existing record (no duplicates created).</li>
          <li>The system never commits until you click <em>Confirm &amp; import</em>.</li>
        </ul>

        {preview && (
          <div>
            <div className="alert alert-success" style={{ marginBottom: 10 }}>
              <strong>{preview.filename}</strong> — {preview.total} row{preview.total === 1 ? '' : 's'} parsed
              {' '}({preview.valid} valid, {preview.invalid} with errors).
            </div>
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Athlete ID</th><th>Name</th><th>Sport</th><th>Action</th><th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.index} style={r.errors.length ? { background: 'var(--risk-high-bg)' } : undefined}>
                      <td>{r.index + 1}</td>
                      <td><code>{r.athleteId || '—'}</code></td>
                      <td>{r.name ?? '—'}</td>
                      <td>{r.sport ?? '—'}</td>
                      <td>
                        <span className={r.action === 'update' ? 'badge-moderate' : 'badge-low'}>
                          {r.action}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--risk-high)' }}>
                        {r.errors.length ? r.errors.join('; ') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {commitResult && (
          <div className="alert alert-success" style={{ marginTop: 14 }}>
            <strong>Import complete.</strong> {commitResult.created} created, {commitResult.updated} updated
            {commitResult.errors?.length ? `, ${commitResult.errors.length} errored` : ''}.
          </div>
        )}
      </div>
    </div>
  );
}
