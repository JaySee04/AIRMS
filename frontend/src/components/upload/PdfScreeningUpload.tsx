'use client';

// HoloMotion PDF ingestion — AIRMS' sole screening import path. The report
// has no text layer, so the backend renders its pages and a vision model
// returns structured data.
//
// Batch-capable: drop one or many PDFs; extraction runs sequentially (each
// file is one vision-API call — spacing respects free-tier rate limits).
// After extraction, the athlete name printed on each report is matched
// against the existing roster: a match auto-fills Athlete ID, sport, and
// programme; a new name is entered manually, with the sport picked from a
// searchable list of ISN's 52 sports.

import { useEffect, useRef, useState } from 'react';
import { ISN_SPORTS } from '@/lib/sports';

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

interface RosterAthlete {
  athleteId: string;
  name: string;
  sport?: string;
  program?: string;
  programme?: string;
}

type ItemStatus = 'queued' | 'extracting' | 'ready' | 'committing' | 'done' | 'error';

interface QueueItem {
  id: number;
  file: File;
  status: ItemStatus;
  preview: PreviewResponse | null;
  error: string | null;
  doneNote: string | null;
  matched: RosterAthlete | null; // roster athlete auto-matched by extracted name
  athleteId: string;
  sport: string;
  program: string;
}

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('airms_token');
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
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

// Pause between sequential vision calls — stays well inside free-tier
// requests-per-minute limits when a whole squad's reports are dropped at once.
const BATCH_SPACING_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let nextId = 1;

export default function PdfScreeningUpload() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [roster, setRoster] = useState<RosterAthlete[] | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false); // a batch extract or commit-all is running

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE}/upload/screening/pdf/status`, { headers: authHeaders() });
        if (res.ok) setStatus(await res.json());
      } catch { /* status stays null → treated as unknown/disabled */ }
      try {
        // Roster for name-matching. Optional: if this user can't view records,
        // matching silently degrades to manual entry.
        const res = await fetch(`${BASE}/athletes`, { headers: authHeaders() });
        if (res.ok) setRoster(await res.json());
      } catch { /* no roster → manual entry */ }
    })();
  }, []);

  function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
    if (!pdfs.length) return;
    setItems((prev) => [
      ...prev,
      ...pdfs.map((file) => ({
        id: nextId++,
        file,
        status: 'queued' as ItemStatus,
        preview: null,
        error: null,
        doneNote: null,
        matched: null,
        athleteId: '',
        sport: '',
        program: '',
      })),
    ]);
  }

  function patchItem(id: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Match the extracted name against the roster (trimmed, case-insensitive).
  // Exactly one match → auto-fill; zero or ambiguous → manual entry.
  function matchByName(name: string | undefined): RosterAthlete | null {
    if (!name || !roster) return null;
    const key = name.trim().toLowerCase();
    const hits = roster.filter((a) => a.name.trim().toLowerCase() === key);
    return hits.length === 1 ? hits[0] : null;
  }

  async function extractOne(item: QueueItem): Promise<void> {
    patchItem(item.id, { status: 'extracting', error: null });
    try {
      const formData = new FormData();
      formData.append('file', item.file);
      const res = await fetch(`${BASE}/upload/screening/pdf/preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      const preview = data as PreviewResponse;
      const matched = matchByName(preview.athlete.name);
      patchItem(item.id, {
        status: 'ready',
        preview,
        matched,
        athleteId: matched?.athleteId ?? '',
        sport: matched?.sport ?? '',
        program: matched?.program ?? matched?.programme ?? '',
      });
    } catch (e) {
      patchItem(item.id, { status: 'error', error: e instanceof Error ? e.message : 'Failed to read PDF' });
    }
  }

  async function extractAll() {
    setBusy(true);
    try {
      // Read from a snapshot: sequential, spaced calls.
      const queued = items.filter((it) => it.status === 'queued' || it.status === 'error');
      for (let i = 0; i < queued.length; i++) {
        if (i > 0) await sleep(BATCH_SPACING_MS);
        await extractOne(queued[i]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function commitOne(item: QueueItem): Promise<void> {
    if (!item.preview) return;
    if (!item.athleteId.trim() || !item.sport.trim() || !item.program) {
      patchItem(item.id, { error: 'Athlete ID, Sport, and Programme are required before importing.' });
      return;
    }
    patchItem(item.id, { status: 'committing', error: null });
    try {
      const res = await fetch(`${BASE}/upload/screening/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          athlete: item.preview.athlete,
          myodynamia: item.preview.myodynamia,
          tension: item.preview.tension,
          athleteId: item.athleteId.trim(),
          sport: item.sport.trim(),
          program: item.program,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      patchItem(item.id, {
        status: 'done',
        doneNote: `${data.action === 'updated' ? 'Updated' : 'Created'} ${data.athleteId} · ${data.muscleFlags} muscle flag(s)`,
      });
    } catch (e) {
      patchItem(item.id, { status: 'ready', error: e instanceof Error ? e.message : 'Failed to import' });
    }
  }

  async function commitAllReady() {
    setBusy(true);
    try {
      const ready = items.filter((it) => it.status === 'ready' && it.athleteId.trim() && it.sport.trim() && it.program);
      for (const it of ready) await commitOne(it); // no API cost — commits replay the preview JSON
    } finally {
      setBusy(false);
    }
  }

  const disabled = status !== null && !status.configured;
  const queuedCount = items.filter((it) => it.status === 'queued' || it.status === 'error').length;
  const readyCount = items.filter((it) => it.status === 'ready').length;
  const completeReady = items.filter((it) => it.status === 'ready' && it.athleteId.trim() && it.sport.trim() && it.program).length;

  return (
    <div className="card">
      <h2 className="card-title">Import HoloMotion Screening Reports</h2>

      {status && status.configured && (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <strong>AI-assisted ingestion.</strong> Reports are read automatically by a vision model
          ({status.provider}{status.model ? ` · ${status.model}` : ''}). Drop one or many PDFs —
          athletes already on the roster are matched by name and auto-filled; new athletes need an
          Athlete ID, sport, and programme.
        </div>
      )}

      {disabled && (
        <div className="alert alert-error" style={{ marginBottom: 14 }}>
          <strong>Not configured.</strong> Set <code>VISION_API_KEY</code> and <code>VISION_MODEL</code>
          {' '}in the backend environment to enable PDF ingestion. Any OpenAI-compatible provider
          (Gemini, OpenAI, Qwen, OpenRouter, local Ollama) or Anthropic works.
        </div>
      )}

      <div
        className={`upload-dropzone${dragOver ? ' is-drag' : ''}`}
        onClick={() => !disabled && fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        role="button"
        tabIndex={0}
        style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted)', marginBottom: 10 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        <h3 style={{ margin: '0 0 4px' }}>Drop HoloMotion PDFs here</h3>
        <p className="text-muted" style={{ fontSize: '0.85rem', margin: 0 }}>
          or click to browse · one or many .pdf files
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
        />
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline" onClick={extractAll} disabled={busy || disabled || queuedCount === 0}>
            {busy ? 'Working…' : `Read & extract (${queuedCount})`}
          </button>
          <button type="button" className="btn btn-primary" onClick={commitAllReady} disabled={busy || completeReady === 0}>
            Import all ready ({completeReady}/{readyCount})
          </button>
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>
            Extraction is one vision call per file, spaced {BATCH_SPACING_MS / 1000}s apart; importing costs no extra calls.
          </span>
        </div>
      )}

      {/* ── Queue ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: items.length ? 16 : 0 }}>
        {items.map((it) => (
          <div key={it.id} className="pdf-queue-item">
            <div className="pdf-queue-head">
              <div style={{ minWidth: 0 }}>
                <strong style={{ fontSize: '0.88rem', overflowWrap: 'anywhere' }}>{it.file.name}</strong>
                <span className="text-muted" style={{ fontSize: '0.76rem', marginLeft: 8 }}>
                  {(it.file.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                <span className={`pdf-status pdf-status--${it.status}`}>
                  {it.status === 'queued' && 'Queued'}
                  {it.status === 'extracting' && 'Reading…'}
                  {it.status === 'ready' && 'Ready to import'}
                  {it.status === 'committing' && 'Importing…'}
                  {it.status === 'done' && 'Imported'}
                  {it.status === 'error' && 'Failed'}
                </span>
                {it.status !== 'extracting' && it.status !== 'committing' && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => removeItem(it.id)}>✕</button>
                )}
              </div>
            </div>

            {it.error && <div className="alert alert-error" style={{ marginTop: 8 }}>{it.error}</div>}
            {it.doneNote && <div className="alert alert-success" style={{ marginTop: 8 }}>{it.doneNote}</div>}

            {it.preview && it.status !== 'done' && (
              <div className="pdf-queue-body">
                <div>
                  <div className="alert alert-success" style={{ marginBottom: 10 }}>
                    <strong>{it.preview.athlete.name ?? 'Unknown athlete'}</strong>
                    {it.preview.athlete.age ? `, age ${it.preview.athlete.age}` : ''}
                    {it.preview.athlete.gender ? ` · ${it.preview.athlete.gender}` : ''}
                    {it.preview.assessedAt ? ` · assessed ${it.preview.assessedAt}` : ''}
                  </div>
                  {it.matched ? (
                    <div className="alert alert-info" style={{ marginBottom: 10 }}>
                      Matched roster athlete <strong>{it.matched.name} ({it.matched.athleteId})</strong> — ID, sport, and programme auto-filled. Edit below if this is the wrong person.
                    </div>
                  ) : (
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                      No roster athlete named “{it.preview.athlete.name ?? '—'}” — enter the new athlete&apos;s details.
                    </div>
                  )}

                  <div className="form-group">
                    <label>Athlete ID <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                    <input
                      value={it.athleteId}
                      onChange={(e) => patchItem(it.id, { athleteId: e.target.value })}
                      placeholder="e.g. ATH0001"
                      list={`pdf-roster-${it.id}`}
                    />
                    <datalist id={`pdf-roster-${it.id}`}>
                      {(roster ?? []).map((a) => (
                        <option key={a.athleteId} value={a.athleteId}>{a.name} — {a.sport ?? '—'}</option>
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>Sport <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                    <input
                      value={it.sport}
                      onChange={(e) => patchItem(it.id, { sport: e.target.value })}
                      placeholder="Type to search the 52 ISN sports…"
                      list="isn-sports"
                    />
                  </div>
                  <div className="form-group">
                    <label>Programme <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                    <select value={it.program} onChange={(e) => patchItem(it.id, { program: e.target.value })}>
                      <option value="">Select…</option>
                      <option value="PODIUM">PODIUM</option>
                      <option value="PELAPIS">PELAPIS</option>
                      <option value="OTHERS">OTHERS</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => commitOne(it)}
                    disabled={it.status === 'committing' || !it.athleteId.trim() || !it.sport.trim() || !it.program}
                  >
                    {it.status === 'committing' ? 'Importing…' : 'Confirm & import'}
                  </button>
                </div>

                <div>
                  <div className="table-wrap" style={{ maxHeight: 220, overflowY: 'auto', marginBottom: 10 }}>
                    <table>
                      <tbody>
                        {SCORE_FIELDS.map(([key, label]) => (
                          <tr key={key}>
                            <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{label}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600 }}>{it.preview!.athlete[key] ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: '0.82rem' }}>Myodynamia ({it.preview.myodynamia.length})</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {it.preview.myodynamia.map((m, i) => <li key={i}>{m.muscle} {m.side}</li>)}
                        {!it.preview.myodynamia.length && <li>none</li>}
                      </ul>
                    </div>
                    <div>
                      <strong style={{ fontSize: '0.82rem' }}>Tension ({it.preview.tension.length})</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {it.preview.tension.map((m, i) => <li key={i}>{m.muscle} {m.side}</li>)}
                        {!it.preview.tension.length && <li>none</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Shared searchable sport list (one datalist for all queue items) */}
      <datalist id="isn-sports">
        {ISN_SPORTS.map((s) => (<option key={s} value={s} />))}
      </datalist>
    </div>
  );
}
