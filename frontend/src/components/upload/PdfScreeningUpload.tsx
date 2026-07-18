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
import Link from 'next/link';
import { ISN_SPORTS } from '@/lib/sports';
import { disciplinesForSport, sportHasDisciplines } from '@/lib/disciplines';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

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
  // Screening-snapshot extras, passed straight back on commit (no re-extraction).
  summary?: string | null;
  subitems?: Record<string, Record<string, number | null>> | null;
  posture?: Record<string, { finding: string | null; value: number | null }> | null;
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
  disciplines?: string[];
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
  // Events the athlete competes in (only for sports that have them, e.g.
  // badminton). Pre-filled from a matched roster athlete; operator-editable.
  disciplines: string[];
  // Editable identity — pre-filled from the report (new athlete) or roster
  // (existing). Operator can correct name/age/gender before import.
  name: string;
  age: string;
  gender: string;
}

// One imported screening, shown in the post-import cohort-threshold prompt.
interface CommittedEntry { athleteId: string; name: string; sport: string; action: string; }

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
  // Ref mirror of the roster so long-running batch loops (whose closures
  // captured an older render) always match against the latest list — e.g. an
  // athlete created by file 1's commit is matchable by file 3's extraction.
  const rosterRef = useRef<RosterAthlete[] | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false); // a batch extract or commit-all is running

  // After a screening is imported the cohort norms are stale, so we prompt the
  // operator to update the cohort thresholds. `committed` accumulates the
  // athletes imported this session (shown in the prompt); the recompute action
  // is admin-only, so medical staff get an informational variant.
  const [role, setRole] = useState<string | null>(null);
  const [committed, setCommitted] = useState<CommittedEntry[]>([]);
  const [showThresholdModal, setShowThresholdModal] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null);

  useEffect(() => { setRole(getSession()?.user.role ?? null); }, []);

  async function recomputeThresholds() {
    setRecomputing(true); setRecomputeMsg(null);
    try {
      const r = await api.post<{ cohorts: { cohorts: number }; indicators: { scored: number } }>('/cohorts/recompute', {});
      setRecomputeMsg(`Recomputed ${r.cohorts.cohorts} cohorts and re-scored ${r.indicators.scored} athletes. New or changed cohorts still need approval on the Cohort Thresholds page before they drive the indicator.`);
    } catch (e) {
      setRecomputeMsg(e instanceof Error ? e.message : 'Recompute failed');
    } finally {
      setRecomputing(false);
    }
  }

  function updateRoster(next: RosterAthlete[] | null) {
    rosterRef.current = next;
    setRoster(next);
  }

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
        if (res.ok) updateRoster(await res.json());
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
        disciplines: [],
        name: '',
        age: '',
        gender: '',
      })),
    ]);
  }

  const titleCase = (s: string) => s.replace(/\S+/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

  function patchItem(id: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: number) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  // Match the extracted name against the roster (trimmed, case-insensitive).
  // Exactly one match → auto-fill; zero or ambiguous → manual entry.
  // Reads the ref so mid-batch matches see commits made earlier in the batch.
  function matchByName(name: string | undefined): RosterAthlete | null {
    const list = rosterRef.current;
    if (!name || !list) return null;
    const key = name.trim().toLowerCase();
    const hits = list.filter((a) => a.name.trim().toLowerCase() === key);
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
        disciplines: matched?.disciplines ?? [],
        // Identity pre-fill: matched roster name, else the (Title-Cased) report name.
        name: matched?.name ?? titleCase(preview.athlete.name ?? ''),
        age: preview.athlete.age != null ? String(preview.athlete.age) : '',
        gender: preview.athlete.gender ?? '',
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

  async function commitOne(item: QueueItem): Promise<CommittedEntry | null> {
    if (!item.preview) return null;
    if (!item.athleteId.trim() || !item.sport.trim() || !item.program || !item.name.trim()) {
      patchItem(item.id, { error: 'Name, Athlete ID, Sport, and Programme are required before importing.' });
      return null;
    }
    patchItem(item.id, { status: 'committing', error: null });
    try {
      // Merge the operator's identity edits over the extracted athlete.
      const athlete = {
        ...item.preview.athlete,
        name: item.name.trim(),
        age: item.age.trim() ? Number(item.age) : item.preview.athlete.age,
        gender: item.gender || item.preview.athlete.gender,
      };
      const res = await fetch(`${BASE}/upload/screening/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          athlete,
          myodynamia: item.preview.myodynamia,
          tension: item.preview.tension,
          athleteId: item.athleteId.trim(),
          sport: item.sport.trim(),
          program: item.program,
          // Only send events for sports that have them — omitting the field
          // leaves any existing events untouched on the backend.
          ...(sportHasDisciplines(item.sport.trim())
            ? { disciplines: item.disciplines.filter((d) => disciplinesForSport(item.sport.trim()).includes(d)) }
            : {}),
          assessedAt: item.preview.assessedAt,
          summary: item.preview.summary ?? null,
          subitems: item.preview.subitems ?? null,
          posture: item.preview.posture ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
      patchItem(item.id, {
        status: 'done',
        doneNote: `${data.action === 'updated' ? 'Updated' : 'Created'} ${data.athleteId} · ${data.muscleFlags} muscle flag(s)`,
      });
      // Fold the committed athlete into the roster so the rest of the batch
      // (and the ID datalist) can match them immediately.
      const rosterEntry: RosterAthlete = {
        athleteId: item.athleteId.trim(),
        name: item.name.trim() || item.athleteId.trim(),
        sport: item.sport.trim(),
        program: item.program,
        disciplines: sportHasDisciplines(item.sport.trim()) ? item.disciplines : [],
      };
      updateRoster([...(rosterRef.current ?? []).filter((a) => a.athleteId !== rosterEntry.athleteId), rosterEntry]);
      // Return the import so the caller can show the threshold prompt for
      // exactly the athletes committed in this action (single or batch).
      return { athleteId: item.athleteId.trim(), name: rosterEntry.name, sport: item.sport.trim(), action: String(data.action ?? '') };
    } catch (e) {
      patchItem(item.id, { status: 'ready', error: e instanceof Error ? e.message : 'Failed to import' });
      return null;
    }
  }

  // Open the cohort-threshold prompt for just the athletes imported in this
  // action — the norms they belong to are now stale.
  function promptThresholdUpdate(entries: CommittedEntry[]) {
    if (entries.length === 0) return;
    setCommitted(entries);
    setRecomputeMsg(null);
    setShowThresholdModal(true);
  }

  async function commitSingle(item: QueueItem) {
    const entry = await commitOne(item);
    if (entry) promptThresholdUpdate([entry]);
  }

  async function commitAllReady() {
    setBusy(true);
    try {
      const ready = items.filter((it) => it.status === 'ready' && it.name.trim() && it.athleteId.trim() && it.sport.trim() && it.program);
      const done: CommittedEntry[] = [];
      for (const it of ready) {
        const entry = await commitOne(it); // no API cost — commits replay the preview JSON
        if (entry) done.push(entry);
      }
      promptThresholdUpdate(done);
    } finally {
      setBusy(false);
    }
  }

  const disabled = status !== null && !status.configured;
  const queuedCount = items.filter((it) => it.status === 'queued' || it.status === 'error').length;
  const readyCount = items.filter((it) => it.status === 'ready').length;
  const completeReady = items.filter((it) => it.status === 'ready' && it.name.trim() && it.athleteId.trim() && it.sport.trim() && it.program).length;

  return (
    <>
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
                      Matched roster athlete <strong>{it.matched.name} ({it.matched.athleteId})</strong> — identity, sport, and programme auto-filled. Edit below if anything is wrong.
                    </div>
                  ) : (
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                      No roster athlete named “{it.preview.athlete.name ?? '—'}” — confirm the new athlete&apos;s details.
                    </div>
                  )}

                  {/* Editable identity — report name is Title-Cased on prefill;
                      name/age/gender are not on some reports so stay editable. */}
                  <div className="form-group">
                    <label>Name <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                    <input value={it.name} onChange={(e) => patchItem(it.id, { name: e.target.value })} placeholder="Full name" />
                  </div>
                  <div className="form-row-2">
                    <div className="form-group">
                      <label>Age</label>
                      <input type="number" min={5} max={90} value={it.age} onChange={(e) => patchItem(it.id, { age: e.target.value })} placeholder="—" />
                    </div>
                    <div className="form-group">
                      <label>Gender</label>
                      <select value={it.gender} onChange={(e) => patchItem(it.id, { gender: e.target.value })}>
                        <option value="">—</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                  </div>

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

                  {/* Events — only for sports that have them (e.g. badminton).
                      An athlete can compete in more than one. Optional. */}
                  {sportHasDisciplines(it.sport.trim()) && (
                    <div className="form-group">
                      <label>Events <span className="text-muted" style={{ fontWeight: 400 }}>(select any that apply)</span></label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                        {disciplinesForSport(it.sport.trim()).map((d) => {
                          const checked = it.disciplines.includes(d);
                          return (
                            <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400, fontSize: '0.85rem' }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => patchItem(it.id, {
                                  disciplines: e.target.checked
                                    ? [...it.disciplines, d]
                                    : it.disciplines.filter((x) => x !== d),
                                })}
                              />
                              {d}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => commitSingle(it)}
                    disabled={it.status === 'committing' || !it.name.trim() || !it.athleteId.trim() || !it.sport.trim() || !it.program}
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

    {/* Cohort-threshold prompt — a new screening changes the cohort norms, so
        after an import we always surface the "update thresholds" step. Admins
        can recompute in place (approval still happens on the Cohort Thresholds
        page); medical staff get an informational note since recompute is
        admin-only. */}
    {showThresholdModal && (
      <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Update cohort thresholds">
        <div className="modal">
          <div className="modal-header">
            <h2 className="card-title" style={{ margin: 0 }}>Update cohort thresholds</h2>
            <button type="button" className="modal-close" aria-label="Close" onClick={() => setShowThresholdModal(false)}>×</button>
          </div>
          <div className="modal-body">
            <p style={{ marginTop: 0 }}>
              {committed.length} screening{committed.length === 1 ? '' : 's'} imported. New screening data
              changes the cohort averages every athlete&apos;s overall risk indicator is measured against, so
              the cohort thresholds should be recomputed{role === 'admin' ? ' and re-approved' : ' by an administrator'}.
            </p>
            {committed.length > 0 && (
              <ul style={{ margin: '0 0 12px 16px', padding: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {committed.map((c) => (
                  <li key={c.athleteId}>{c.name} ({c.athleteId}) · {c.sport} · {c.action === 'updated' ? 'updated' : 'created'}</li>
                ))}
              </ul>
            )}
            {role === 'admin' ? (
              <div className="alert alert-info" style={{ marginBottom: recomputeMsg ? 12 : 0 }}>
                Recompute rebuilds the cohort stats and re-scores every athlete. Newly formed or changed
                cohorts still need approval on the Cohort Thresholds page before they drive the indicator.
              </div>
            ) : (
              <div className="alert alert-info" style={{ marginBottom: 0 }}>
                Recomputing and approving cohort thresholds is an administrator action. Let your admin know
                new screenings were imported so the norms can be refreshed.
              </div>
            )}
            {recomputeMsg && <div className="alert alert-success" style={{ marginBottom: 0 }}>{recomputeMsg}</div>}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={() => setShowThresholdModal(false)}>
              {role === 'admin' ? 'Later' : 'Got it'}
            </button>
            {role === 'admin' && (
              <>
                <Link
                  className="btn btn-outline"
                  href={`/admin/thresholds${committed.length ? `?sport=${encodeURIComponent([...new Set(committed.map((c) => c.sport))].join(','))}` : ''}`}
                >
                  Open Cohort Thresholds
                </Link>
                <button type="button" className="btn btn-gold" onClick={recomputeThresholds} disabled={recomputing}>
                  {recomputing ? 'Recomputing…' : 'Recompute now'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
