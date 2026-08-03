// External store for the HoloMotion PDF upload queue.
//
// WHY THIS EXISTS (bug fix 2026-07-22): the queue used to live in
// PdfScreeningUpload's component state. Next.js App Router unmounts a page's
// component on client-side navigation, so navigating away mid-extraction
// destroyed the queue AND orphaned the in-flight vision call (its resolved
// fetch called setState on an unmounted component — a no-op), and returning
// remounted the empty dropzone. Moving the queue + the extraction loop into a
// module-level store decouples them from React's lifecycle: the loop keeps
// running while no component is mounted, and any (re)mounted view subscribes
// via useSyncExternalStore and re-renders from the live state. State survives
// every client-side navigation; only a full page reload clears it (a File
// can't be revived across reload without re-selecting it anyway).
//
// This is a hand-rolled external store rather than a state library — the repo
// deliberately ships no client-state dependency (see CLAUDE.md).

import { api } from './api';

// ── shared types (imported by the component) ────────────────────────────────
export interface MuscleEntry { muscle: string; side: 'L' | 'R' | 'B'; }

export interface ExtractedAthlete {
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

export interface PreviewResponse {
  athlete: ExtractedAthlete;
  myodynamia: MuscleEntry[];
  tension: MuscleEntry[];
  assessedAt: string | null;
  pagesRead: number[];
  summary?: string | null;
  subitems?: Record<string, Record<string, number | null>> | null;
}

export interface RosterAthlete {
  athleteId: string;
  name: string;
  sport?: string;
  program?: string;
  programme?: string;
  disciplines?: string[];
}

export type ItemStatus = 'queued' | 'extracting' | 'ready' | 'committing' | 'done' | 'error';

export interface QueueItem {
  id: number;
  file: File;
  status: ItemStatus;
  preview: PreviewResponse | null;
  error: string | null;
  doneNote: string | null;
  matched: RosterAthlete | null;
  athleteId: string;
  sport: string;
  program: string;
  disciplines: string[];
  disciplinesTouched: boolean;
  name: string;
  age: string;
  gender: string;
}

export interface CommittedEntry { athleteId: string; name: string; sport: string; action: string; }

interface UploadState {
  items: QueueItem[];
  busy: boolean;               // a batch extract or commit-all is running
  roster: RosterAthlete[] | null;
}

// ── config / helpers ────────────────────────────────────────────────────────
// Pause between sequential vision calls — stays inside free-tier RPM limits
// when a whole squad's reports are dropped at once.
export const BATCH_SPACING_MS = 3000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── store internals ─────────────────────────────────────────────────────────
let state: UploadState = { items: [], busy: false, roster: null };
const listeners = new Set<() => void>();
let nextId = 1;
let running = false;          // extraction loop guard
let configured: boolean | null = null; // vision provider availability (null = unknown)

function emit() { for (const l of listeners) l(); }
function setState(patch: Partial<UploadState>) { state = { ...state, ...patch }; emit(); }

function patchItemInternal(id: number, patch: Partial<QueueItem>) {
  setState({ items: state.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) });
}

// Match a roster athlete by ID (trimmed, case-insensitive). The athlete's name
// is redacted from the screening image before extraction (privacy — see
// backend utils/redactName.js), so the report can no longer be auto-matched by
// name. The operator picks the athlete by ID instead, and we re-attach their
// identity from OUR roster — the mirror of the retired name-based match.
function matchById(athleteId: string | undefined): RosterAthlete | null {
  const list = state.roster;
  if (!athleteId || !list) return null;
  const key = athleteId.trim().toLowerCase();
  return list.find((a) => a.athleteId.trim().toLowerCase() === key) ?? null;
}

// Exactly-one roster match on name (trimmed, case-insensitive), else null.
function matchByName(name: string | undefined): RosterAthlete | null {
  const list = state.roster;
  if (!name || !list) return null;
  const key = name.trim().toLowerCase();
  const hits = list.filter((a) => a.name.trim().toLowerCase() === key);
  return hits.length === 1 ? hits[0] : null;
}

// Best-effort athlete name out of a HoloMotion PDF FILENAME. Safe to use: the
// filename is a LOCAL browser value, never sent to the vision model (only the
// redacted images are) — so this pre-fills the roster pick without weakening the
// on-device name redaction. Handles both sample shapes:
//   "thung jin seng_0122663031.pdf"                         → "thung jin seng"
//   "rpt_2025-08-13_muhammad nazwan bin abdullah_<hash>.pdf" → "muhammad nazwan bin abdullah"
export function parseNameFromFilename(filename: string): string {
  let s = filename.replace(/\.pdf$/i, '');
  s = s.replace(/^rpt_\d{4}-\d{2}-\d{2}[_-]*/i, '');   // drop a leading rpt_<date>_ prefix
  s = s.replace(/[_-]+(?:[0-9a-f]{6,}|\d{6,})$/i, ''); // drop a trailing _<hash|phone>
  return s.replace(/_+/g, ' ').trim();
}

async function extractOne(item: QueueItem): Promise<void> {
  patchItemInternal(item.id, { status: 'extracting', error: null });
  try {
    const formData = new FormData();
    formData.append('file', item.file);
    const preview = await api.upload<PreviewResponse>('/upload/screening/pdf/preview', formData);
    // Name is redacted from the IMAGE, so it isn't in the extraction. Recover a
    // pre-fill from the LOCAL filename instead (never sent to the model): a unique
    // roster name-match attaches the athlete; otherwise the operator picks below.
    const hit = matchByName(parseNameFromFilename(item.file.name));
    patchItemInternal(item.id, {
      status: 'ready',
      preview,
      matched: hit,
      athleteId: hit?.athleteId ?? '',
      sport: hit?.sport ?? '',
      program: hit?.program ?? hit?.programme ?? '',
      disciplines: hit?.disciplines ?? [],
      name: hit?.name ?? '',
      age: preview.athlete.age != null ? String(preview.athlete.age) : '',
      gender: preview.athlete.gender ?? '',
    });
  } catch (e) {
    patchItemInternal(item.id, { status: 'error', error: e instanceof Error ? e.message : 'Failed to read PDF' });
  }
}

// The extraction loop. Runs in module scope (not tied to any component), so it
// keeps processing while the upload page is unmounted. Re-reads the queue each
// iteration, so files dropped mid-run are picked up; vision calls stay spaced.
async function runExtraction() {
  if (running || configured === false) return;
  running = true;
  setState({ busy: true });
  try {
    for (;;) {
      const next = state.items.find((it) => it.status === 'queued');
      if (!next) break;
      await extractOne(next);
      if (state.items.some((it) => it.status === 'queued')) await sleep(BATCH_SPACING_MS);
    }
  } finally {
    running = false;
    setState({ busy: false });
  }
}

// ── public API ──────────────────────────────────────────────────────────────
export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getSnapshot(): UploadState { return state; }

// Config gate. The component sets this once it fetches the vision status; the
// loop refuses to run when the provider is explicitly unconfigured.
export function setConfigured(v: boolean) { configured = v; }

export function setRoster(list: RosterAthlete[] | null) { setState({ roster: list }); }

export function patchItem(id: number, patch: Partial<QueueItem>) { patchItemInternal(id, patch); }

// Set an item's Athlete ID and keep the roster-derived identity in sync:
//   - matches the roster  → fill name/sport/programme (and events if untouched)
//   - clears/changes off a previous match → STRIP those roster-filled fields, so
//     clearing the picker undoes the whole autofill, not just the ID
//   - never matched (manual new-athlete entry) → just update the ID, leaving any
//     manually typed name/sport/programme alone
// age/gender aren't touched here — they come from the report, not the roster.
export function setItemAthleteId(id: number, athleteId: string) {
  const hit = matchById(athleteId);
  const item = state.items.find((it) => it.id === id);
  if (hit) {
    patchItemInternal(id, {
      athleteId,
      matched: hit,
      name: hit.name,
      sport: hit.sport ?? '',
      program: hit.program ?? hit.programme ?? '',
      ...(item && !item.disciplinesTouched ? { disciplines: hit.disciplines ?? [] } : {}),
    });
  } else if (item?.matched) {
    // Was attached to a roster athlete; the pick is now cleared/changed → remove
    // everything that autofill put in (events too, unless the operator edited them).
    patchItemInternal(id, {
      athleteId,
      matched: null,
      name: '',
      sport: '',
      program: '',
      ...(item.disciplinesTouched ? {} : { disciplines: [] }),
    });
  } else {
    patchItemInternal(id, { athleteId, matched: null });
  }
}

export function removeItem(id: number) {
  setState({ items: state.items.filter((it) => it.id !== id) });
}

export function addFiles(files: FileList | File[] | null) {
  if (!files) return;
  const pdfs = Array.from(files).filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  if (!pdfs.length) return;
  setState({
    items: [
      ...state.items,
      ...pdfs.map((file): QueueItem => ({
        id: nextId++,
        file,
        status: 'queued',
        preview: null,
        error: null,
        doneNote: null,
        matched: null,
        athleteId: '',
        sport: '',
        program: '',
        disciplines: [],
        disciplinesTouched: false,
        name: '',
        age: '',
        gender: '',
      })),
    ],
  });
  void runExtraction();
}

// Re-queue any failed extractions; the loop re-reads them.
export function retryFailed() {
  setState({ items: state.items.map((it) => (it.status === 'error' ? { ...it, status: 'queued' as ItemStatus, error: null } : it)) });
  void runExtraction();
}

// Defensive kick on mount — if a loop was somehow interrupted (it shouldn't
// be), pick up any still-queued items. No-op while a loop is already running.
export function resume() { void runExtraction(); }

async function commitOne(item: QueueItem): Promise<CommittedEntry | null> {
  if (!item.preview) return null;
  if (!item.athleteId.trim() || !item.sport.trim() || !item.program || !item.name.trim()) {
    patchItemInternal(item.id, { error: 'Name, Athlete ID, Sport, and Programme are required before importing.' });
    return null;
  }
  patchItemInternal(item.id, { status: 'committing', error: null });
  try {
    const athlete = {
      ...item.preview.athlete,
      name: item.name.trim(),
      age: item.age.trim() ? Number(item.age) : item.preview.athlete.age,
      gender: item.gender || item.preview.athlete.gender,
    };
    const data = await api.post<{ action?: string; athleteId?: string; muscleFlags?: number }>('/upload/screening/pdf', {
      athlete,
      myodynamia: item.preview.myodynamia,
      tension: item.preview.tension,
      athleteId: item.athleteId.trim(),
      sport: item.sport.trim(),
      program: item.program,
      ...((item.disciplines.length > 0 || item.disciplinesTouched) ? { disciplines: item.disciplines } : {}),
      assessedAt: item.preview.assessedAt,
      summary: item.preview.summary ?? null,
      subitems: item.preview.subitems ?? null,
    });
    patchItemInternal(item.id, {
      status: 'done',
      doneNote: `${data.action === 'updated' ? 'Updated' : 'Created'} ${data.athleteId} · ${data.muscleFlags} muscle flag(s)`,
    });
    // Fold the committed athlete into the roster so the rest of the batch (and
    // the ID datalist) can match them immediately.
    const rosterEntry: RosterAthlete = {
      athleteId: item.athleteId.trim(),
      name: item.name.trim() || item.athleteId.trim(),
      sport: item.sport.trim(),
      program: item.program,
      disciplines: item.disciplines,
    };
    setState({ roster: [...(state.roster ?? []).filter((a) => a.athleteId !== rosterEntry.athleteId), rosterEntry] });
    return { athleteId: item.athleteId.trim(), name: rosterEntry.name, sport: item.sport.trim(), action: String(data.action ?? '') };
  } catch (e) {
    patchItemInternal(item.id, { status: 'ready', error: e instanceof Error ? e.message : 'Failed to import' });
    return null;
  }
}

// Commit a single item; returns the entry so the caller can prompt for cohort
// recompute for exactly the athletes it imported.
export function commitSingle(item: QueueItem): Promise<CommittedEntry | null> {
  return commitOne(item);
}

// Commit every complete "ready" item (no API cost — commits replay the preview
// JSON). Returns the imported entries.
export async function commitAllReady(): Promise<CommittedEntry[]> {
  setState({ busy: true });
  try {
    const ready = state.items.filter((it) => it.status === 'ready' && it.name.trim() && it.athleteId.trim() && it.sport.trim() && it.program);
    const done: CommittedEntry[] = [];
    for (const it of ready) {
      const entry = await commitOne(it);
      if (entry) done.push(entry);
    }
    return done;
  } finally {
    setState({ busy: false });
  }
}
