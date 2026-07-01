'use client';

// HoloMotion PDF ingestion — a separate, vision-model-backed path that sits
// alongside the Excel uploader. The report has no text layer, so the backend
// renders its pages and a configurable vision provider (OpenAI / Qwen /
// Anthropic / local Ollama …) returns structured data. The operator only
// supplies the three fields the report never contains: Athlete ID, Sport,
// Program.

import { useEffect, useRef, useState } from 'react';

interface MuscleEntry { muscle: string; side: 'L' | 'R' | 'B'; }

interface ExtractedAthlete {
  name?: string;
  age?: number;
  gender?: 'Male' | 'Female';
  overallActivityScore?: number;
  injuryRiskIndex?: number;
  mobility?: number;
  stability?: number;
  symmetry?: number;
  neckInjuryRisk?: number;
  shoulderInjuryRisk?: number;
  scoliosis?: number;
  spinalDiscHerniation?: number;
  lumbarPelvisInjury?: number;
  jointPain?: number;
  kneeInjuryRisk?: number;
  ankleInjuryRisk?: number;
}

interface PreviewResponse {
  filename: string;
  athlete: ExtractedAthlete;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  assessedAt: string | null;
  pagesRead: number[];
}

interface StatusResponse {
  configured: boolean;
  provider: string;
  model: string | null;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('airms_token');
}

const SCORE_FIELDS: Array<[keyof ExtractedAthlete, string]> = [
  ['overallActivityScore', 'Total Score'],
  ['injuryRiskIndex', 'Exercise Risks'],
  ['mobility', 'ROM'],
  ['stability', 'Stability'],
  ['symmetry', 'Symmetry'],
  ['neckInjuryRisk', 'Neck Pain'],
  ['shoulderInjuryRisk', 'Shoulder Pain'],
  ['scoliosis', 'Scoliosis'],
  ['spinalDiscHerniation', 'Lumbar Disc'],
  ['lumbarPelvisInjury', 'Ant. Pelvic Tilt'],
  ['jointPain', 'Joint Pain'],
  ['kneeInjuryRisk', 'Ligament Strain'],
  ['ankleInjuryRisk', 'Ankle Sprain'],
];

export default function PdfScreeningUpload() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Operator-supplied metadata (not present on the report).
  const [athleteId, setAthleteId] = useState('');
  const [sport, setSport] = useState('');
  const [program, setProgram] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE}/upload/screening/pdf/status`, {
          headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        });
        if (res.ok) setStatus(await res.json());
      } catch {
        /* status stays null → treated as unknown/disabled */
      }
    })();
  }, []);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function runExtract() {
    if (!file) return;
    setExtracting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${BASE}/upload/screening/pdf/preview`, {
        method: 'POST',
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setPreview(data as PreviewResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to read PDF');
    } finally {
      setExtracting(false);
    }
  }

  async function runCommit() {
    if (!preview) return;
    if (!athleteId.trim() || !sport.trim() || !program) {
      setError('Athlete ID, Sport, and Program are required before importing.');
      return;
    }
    setCommitting(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/upload/screening/pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({
          athlete: preview.athlete,
          myodynamia: preview.myodynamia,
          tension: preview.tension,
          athleteId: athleteId.trim(),
          sport: sport.trim(),
          program,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      setResult(`${data.action === 'updated' ? 'Updated' : 'Created'} ${data.athleteId} · ${data.muscleFlags} muscle flag(s) imported.`);
      setPreview(null);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to import');
    } finally {
      setCommitting(false);
    }
  }

  const disabled = status !== null && !status.configured;

  return (
    <div className="grid-1-2">
      <div className="card">
        <h2 className="card-title">Import from HoloMotion PDF</h2>

        {status && status.configured && (
          <div className="alert alert-info" style={{ marginBottom: 14 }}>
            <strong>AI-assisted ingestion.</strong> The report is read automatically by a vision model
            ({status.provider}{status.model ? ` · ${status.model}` : ''}). You only need to add the
            Athlete ID, Sport, and Program — these are not present on the report.
          </div>
        )}

        {disabled && (
          <div className="alert alert-error" style={{ marginBottom: 14 }}>
            <strong>Not configured.</strong> Set <code>VISION_API_KEY</code> and <code>VISION_MODEL</code>
            {' '}in the backend environment to enable PDF ingestion. Any OpenAI-compatible provider
            (OpenAI, Qwen, OpenRouter, local Ollama) or Anthropic works.
          </div>
        )}

        {error && <div className="alert alert-error">{error}</div>}
        {result && <div className="alert alert-success">{result}</div>}

        <div
          className={`upload-dropzone${dragOver ? ' is-drag' : ''}`}
          onClick={() => !disabled && fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled) return;
            const f = e.dataTransfer.files?.[0];
            if (f) pickFile(f);
          }}
          role="button"
          tabIndex={0}
          style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <h3 style={{ margin: '0 0 4px' }}>{file ? file.name : 'Drop HoloMotion PDF here'}</h3>
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB · click to replace` : 'or click to browse · .pdf'}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <button type="button" className="btn btn-outline" onClick={runExtract} disabled={!file || extracting || disabled}>
            {extracting ? 'Reading PDF…' : 'Read & extract'}
          </button>
          <button type="button" className="btn btn-primary" onClick={runCommit} disabled={!preview || committing}>
            {committing ? 'Importing…' : 'Confirm & import'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Extracted data</h2>

        {!preview && (
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Upload a report and click <em>Read &amp; extract</em>. The athlete&apos;s scores and muscle
            flags will appear here for review before import.
          </p>
        )}

        {preview && (
          <div>
            <div className="alert alert-success" style={{ marginBottom: 12 }}>
              <strong>{preview.athlete.name ?? 'Unknown athlete'}</strong>
              {preview.athlete.age ? `, age ${preview.athlete.age}` : ''}
              {preview.athlete.gender ? ` · ${preview.athlete.gender}` : ''}
              {preview.assessedAt ? ` · assessed ${preview.assessedAt}` : ''}
              {' '}(pages {preview.pagesRead.join(', ')})
            </div>

            <div className="form-group">
              <label>Athlete ID <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input value={athleteId} onChange={(e) => setAthleteId(e.target.value)} placeholder="e.g. ATH0001" />
            </div>
            <div className="form-group">
              <label>Sport <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <input value={sport} onChange={(e) => setSport(e.target.value)} placeholder="e.g. Judo" />
            </div>
            <div className="form-group">
              <label>Program <span style={{ color: 'var(--risk-high)' }}>*</span></label>
              <select value={program} onChange={(e) => setProgram(e.target.value)}>
                <option value="">Select…</option>
                <option value="PODIUM">PODIUM</option>
                <option value="PELAPIS">PELAPIS</option>
                <option value="OTHERS">OTHERS</option>
              </select>
            </div>

            <div className="table-wrap" style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 12 }}>
              <table>
                <tbody>
                  {SCORE_FIELDS.map(([key, label]) => (
                    <tr key={key}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>{label}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {preview.athlete[key] ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Myodynamia ({preview.myodynamia.length})</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {preview.myodynamia.map((m, i) => <li key={i}>{m.muscle} {m.side}</li>)}
                  {!preview.myodynamia.length && <li>none</li>}
                </ul>
              </div>
              <div>
                <strong style={{ fontSize: '0.85rem' }}>Tension ({preview.tension.length})</strong>
                <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  {preview.tension.map((m, i) => <li key={i}>{m.muscle} {m.side}</li>)}
                  {!preview.tension.length && <li>none</li>}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
