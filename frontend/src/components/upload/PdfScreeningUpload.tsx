'use client';

// HoloMotion PDF ingestion — AIRMS' sole screening import path. The report
// has no text layer, so the backend renders its pages and a vision model
// returns structured data.
//
// Batch-capable: drop one or many PDFs; extraction runs sequentially (each
// file is one vision-API call — spacing respects free-tier rate limits).
// The athlete's name is redacted from the report image on the server BEFORE it
// reaches the vision model (privacy — see backend utils/redactName.js), so it
// isn't in the extraction. The operator attaches each report to a roster
// athlete by name search (or IC number, the athlete key), which fills
// identity/sport/programme back from the roster; a new athlete is entered
// manually with their 12-digit IC.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ISN_SPORTS } from '@/lib/sports';
import { disciplinesForSport } from '@/lib/disciplines';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';
import TagCombobox from '@/components/ui/TagCombobox';
import AthleteSearchSelect from '@/components/ui/AthleteSearchSelect';
import IsnLookup from '@/components/upload/IsnLookup';
import ScreeningPreview from '@/components/upload/ScreeningPreview';
import * as uploadStore from '@/lib/screeningUploadStore';
import type { QueueItem, CommittedEntry, RosterAthlete } from '@/lib/screeningUploadStore';

// The "muscle hero" — the shared body-map figure (front/back) with flag cards.
// Heavy (SVG path data), client-only; split it out like the dashboards do.
const BodyMap = dynamic(() => import('@/components/dashboard/BodyMap'), {
  ssr: false,
  loading: () => <div style={{ minHeight: 200 }} />,
});

interface StatusResponse {
  configured: boolean;
  provider: string;
  model: string | null;
}

export default function PdfScreeningUpload() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Disciplines already on record, grouped by sport — offered as autocomplete in
  // the events picker so an operator can reuse an existing event or type a new one.
  const [knownDisc, setKnownDisc] = useState<Record<string, string[]>>({});

  // The upload queue + extraction loop live in a module-level store (not
  // component state) so navigating away mid-read no longer discards the queue
  // or orphans the in-flight vision call — see lib/screeningUploadStore.ts.
  const { items, busy, roster } = useSyncExternalStore(
    uploadStore.subscribe,
    uploadStore.getSnapshot,
    uploadStore.getSnapshot,
  );

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

  useEffect(() => {
    // The store's extraction loop keeps running while this page is unmounted,
    // so any queued items may already be read by the time we return. Kick it
    // defensively in case a loop was ever interrupted (idempotent while one is
    // already running).
    uploadStore.resume();
    (async () => {
      try {
        const s = await api.get<StatusResponse>('/upload/screening/pdf/status');
        setStatus(s);
        uploadStore.setConfigured(s.configured); // gate the store's loop
      } catch { /* status stays null → treated as unknown/disabled */ }
      try {
        // Roster for name-matching. Optional: if this user can't view records,
        // matching silently degrades to manual entry. Server truth includes any
        // athletes committed earlier (they're persisted), so overwriting the
        // store's roster on remount is correct, not lossy.
        uploadStore.setRoster(await api.get<RosterAthlete[]>('/athletes'));
      } catch { /* no roster → manual entry */ }
      try {
        // Existing (sport, discipline) pairs → group by sport for the picker's
        // "choose existing" suggestions.
        const pairs = await api.get<Array<{ sport: string; discipline: string }>>('/athletes/meta/disciplines');
        const grouped: Record<string, string[]> = {};
        for (const { sport, discipline } of pairs) {
          (grouped[sport] ??= []).push(discipline);
        }
        setKnownDisc(grouped);
      } catch { /* no suggestions → curated list + free typing still work */ }
    })();
  }, []);

  // Queue mutations delegate to the module store (see the import). Kept as
  // local aliases so the JSX below reads unchanged.
  const addFiles = uploadStore.addFiles;
  const patchItem = uploadStore.patchItem;
  const setItemAthleteId = uploadStore.setItemAthleteId;
  const removeItem = uploadStore.removeItem;
  const retryFailed = uploadStore.retryFailed;

  // Autocomplete pool for the events combobox: the curated catalogue for the
  // sport (badminton so far) plus any events already used for that sport, minus
  // what's already selected on this item.
  function suggestionsFor(sport: string, selected: string[]): string[] {
    const pool = [...disciplinesForSport(sport), ...(knownDisc[sport] ?? [])];
    return [...new Set(pool)].filter((d) => !selected.includes(d)).sort();
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
    const entry = await uploadStore.commitSingle(item);
    if (entry) promptThresholdUpdate([entry]);
  }

  async function commitAllReady() {
    promptThresholdUpdate(await uploadStore.commitAllReady());
  }

  const disabled = status !== null && !status.configured;
  const errorCount = items.filter((it) => it.status === 'error').length;
  const readyCount = items.filter((it) => it.status === 'ready').length;
  const completeReady = items.filter((it) => it.status === 'ready' && it.name.trim() && it.athleteId.trim() && it.sport.trim() && it.program).length;

  // Client-side navigation no longer loses the queue (it lives in the store),
  // but a hard reload / tab close still would — and 'extracting'/'ready' items
  // represent real vision-API calls not yet committed. Warn only when such
  // at-risk work exists, so a clean/empty page never nags.
  const hasUnsavedWork = items.some((it) => it.status === 'extracting' || it.status === 'ready');
  useEffect(() => {
    if (!hasUnsavedWork) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedWork]);

  return (
    <>
    <div className="card">
      <h2 className="card-title">Import HoloMotion Screening Reports</h2>

      {status && status.configured && (
        <div className="alert alert-info" style={{ marginBottom: 14 }}>
          <strong>AI-assisted ingestion.</strong> Reports are read automatically by a vision model. The athlete&apos;s
          name is blacked out on your device before any image is sent for reading, so the identity never leaves here.
          Reports are matched to the roster by their <strong>filename</strong> where possible — otherwise search the roster below to attach each one.
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
          <button type="button" className="btn btn-primary" onClick={commitAllReady} disabled={busy || completeReady === 0}>
            Import all ready ({completeReady}/{readyCount})
          </button>
          {errorCount > 0 && (
            <button type="button" className="btn btn-outline" onClick={retryFailed} disabled={busy}>
              Retry failed ({errorCount})
            </button>
          )}
          <span className="text-muted" style={{ fontSize: '0.78rem' }}>
            {busy ? 'Reading…' : 'PDFs are read automatically when added'}
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
                    <strong>Report read</strong>
                    {it.preview.athlete.age ? ` · age ${it.preview.athlete.age}` : ''}
                    {it.preview.athlete.gender ? ` · ${it.preview.athlete.gender}` : ''}
                    {it.preview.assessedAt ? ` · assessed ${it.preview.assessedAt}` : ''}
                    <span className="text-muted" style={{ fontWeight: 400 }}> · name redacted before extraction</span>
                  </div>
                  {it.matched ? (
                    <div className="alert alert-info" style={{ marginBottom: 10 }}>
                      Attached to <strong>{it.matched.name} ({it.matched.athleteId})</strong> — identity, sport, and programme filled from the roster. Edit below if anything is wrong.
                    </div>
                  ) : (
                    <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>
                      Search the roster below to attach this report to an athlete, or enter a new athlete&apos;s details.
                    </div>
                  )}

                  {/* Attach to a roster athlete — search by name. The name is
                      redacted from the report image, so the athlete is identified
                      here from OUR roster; picking fills the fields below. */}
                  <div className="form-group">
                    <label>Find athlete {!it.matched && <span style={{ color: 'var(--risk-high)' }}>*</span>}</label>
                    <AthleteSearchSelect
                      athletes={roster ?? []}
                      onSelect={(athleteId) => setItemAthleteId(it.id, athleteId)}
                      placeholder="Search the roster by name…"
                    />
                    <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 3 }}>
                      {it.matched ? `Attached · ${it.matched.name} (${it.athleteId})` : 'Pick an athlete, look them up in ISN, or fill in a new one’s details below.'}
                    </div>
                  </div>

                  {/* Athlete AIRMS has never seen → pull their master record from
                      the ISN directory (A3). Fills IC / name / sport / programme /
                      age / gender / events. */}
                  {!it.matched && (
                    <IsnLookup onPick={(r) => patchItem(it.id, {
                      athleteId: r.icNumber,
                      name: r.name,
                      sport: r.sport,
                      program: r.programme,
                      gender: r.gender,
                      age: r.age != null ? String(r.age) : '',
                      disciplines: r.disciplines ?? [],
                      disciplinesTouched: true,
                      matched: null,
                    })} />
                  )}

                  {/* Editable identity. Name/sport/programme are filled from the
                      roster when an athlete is picked (the name is redacted from
                      the report image); age/gender come from the report. All stay
                      editable so a new athlete can be entered manually. */}
                  <div className="form-group">
                    <label>Name <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                    <input value={it.name} onChange={(e) => patchItem(it.id, { name: e.target.value })} placeholder="Filled from the roster when you pick an athlete" />
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
                    <label>IC Number <span style={{ color: 'var(--risk-high)' }}>*</span></label>
                    <input
                      value={it.athleteId}
                      onChange={(e) => setItemAthleteId(it.id, e.target.value)}
                      placeholder="Filled by the picker · type a 12-digit IC for a new athlete"
                      inputMode="numeric"
                    />
                    {it.athleteId.trim() && !/^\d{12}$/.test(it.athleteId.trim()) && (
                      <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2, color: 'var(--risk-moderate)' }}>
                        An IC number is 12 digits.
                      </div>
                    )}
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

                  {/* Events — pick an existing one or type a new one. An athlete
                      can compete in more than one. Optional; works for any sport. */}
                  <div className="form-group">
                    <label>Events <span className="text-muted" style={{ fontWeight: 400 }}>(optional — choose an existing event or type a new one)</span></label>
                    <TagCombobox
                      values={it.disciplines}
                      suggestions={suggestionsFor(it.sport.trim(), it.disciplines)}
                      onChange={(next) => patchItem(it.id, { disciplines: next, disciplinesTouched: true })}
                      placeholder="e.g. Men's Doubles"
                      ariaLabel="Events"
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => commitSingle(it)}
                    disabled={it.status === 'committing' || !it.name.trim() || !it.athleteId.trim() || !it.sport.trim() || !it.program}
                  >
                    {it.status === 'committing' ? 'Importing…' : 'Confirm & import'}
                  </button>
                </div>

                {/* Extracted data — scrolls internally so this tall read-out
                    fits beside the shorter edit form on the left. */}
                <div className="pdf-preview-col">
                  <ScreeningPreview
                    athlete={it.preview.athlete as unknown as Record<string, unknown>}
                  />
                  {/* Muscle hero — fitted into the right (data) column */}
                  <div className="screening-muscle-hero">
                    <div className="screening-block-h">Muscle assessment map</div>
                    <BodyMap myodynamia={it.preview.myodynamia} tension={it.preview.tension} subitems={it.preview.subitems} />
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
