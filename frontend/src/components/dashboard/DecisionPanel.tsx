'use client';

// The panel that answers "what should I do next?".
//
// ONE COMPONENT FOR EVERY ROLE, fed by one endpoint (`/api/decisions`), for the
// same reason the ranking is one module: four copies would grow four ideas of
// "worst first", and this project has already paid for that with the band
// vocabulary (four definitions) and SMALL_COHORT (five).
//
// The role differences are all SERVER-side — scope, the verb, whether ticking
// is allowed — so this file has no role logic and cannot drift from the API's
// view of who may do what. It renders what it is given.
//
// WHAT THIS PANEL MUST NOT BECOME. It orders a worklist; it does not predict
// injury, and no wording here may suggest it does. Every entry shows the rules
// that put it there, so a clinician disagrees with the ordering on evidence
// rather than on faith — and "reviewed" means "I have looked at this", never "I
// have cleared this athlete", which is the band override and is audited.

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, isAuthError } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { BAND_LABEL } from '@/lib/bands';
import { RESPONSE_OUTCOMES } from '@/lib/shared/facts';
import CompareAthletes from './CompareAthletes';

/**
 * The label for a recorded outcome.
 *
 * Falls back to the raw key rather than to a friendly placeholder: a value the
 * shared list does not know is a real disagreement between the database and
 * this build, and printing "Recorded" over it would hide exactly that.
 */
const outcomeLabel = (key: string) => RESPONSE_OUTCOMES.find((o) => o.key === key)?.label ?? key;

// "Since you last looked" — remembered HERE, in the reader's browser.
//
// The obvious place for this marker is a per-user row on the server, and that
// is what the first design assumed. It cannot be: storing it is a WRITE, and
// `coach` is read-only by a locked decision (MASTER_CLARIFICATIONS §12). The
// watchlist hit exactly that wall, `npm run audit:access` failed with "a
// read-only role completed a write", and the lock was kept in preference to the
// feature. A server-side marker would therefore have worked for medical and
// admin and been silently absent for coach — giving the role that most needs a
// squad summary the worst version of it.
//
// So the caller remembers instead and the server only filters. No write
// anywhere, and every role gets the same feature.
//
// The honest cost, stated in the manual (§22.4): it is per-DEVICE, and clearing
// browser storage forgets it. That failure direction is deliberate — a
// forgotten marker falls back to the rolling window and shows MORE than
// necessary, where the opposite would hide a change nobody ever saw.
const SEEN_KEY_PREFIX = 'airms_decisions_seen:';

/**
 * Per-user, because a shared clinic machine is the normal case at ISN and one
 * reader's "seen" must not silence another's changes.
 *
 * `user.id` and not `_id`: the auth routes return `id` on the session object
 * (unlike the serialiser's `_id` alias used for records), and a key built from
 * `undefined` would collide across every account on the machine.
 */
function seenKey(): string | null {
  const id = getSession()?.user?.id;
  return id ? `${SEEN_KEY_PREFIX}${id}` : null;
}

function readSeen(): string | undefined {
  try {
    const key = seenKey();
    if (!key) return undefined;
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    // A corrupt store must not be able to empty a clinical panel, so anything
    // unparseable is dropped here and the server falls back to the window.
    return Number.isFinite(new Date(raw).getTime()) ? raw : undefined;
  } catch {
    // Private mode, disabled storage, quota — all mean "no marker", not an error.
    return undefined;
  }
}

function writeSeen(at: string): void {
  try {
    const key = seenKey();
    if (key) window.localStorage.setItem(key, at);
  } catch { /* see readSeen */ }
}

export interface WorklistEntry {
  athleteId: string;
  name: string | null;
  sport: string | null;
  isInjured: boolean;
  /** 'red' | 'amber' | 'green' | 'never' | 'none' — 'never' is NOT a band. */
  band: string;
  ageDays: number | null;
  recall: string | null;
  reasons: string[];
  screeningId: number | string | null;
  reviewed: boolean;
  /**
   * The INSTITUTION's answer to this escalation (§103) — distinct from
   * `reviewed`, which is this reader's private tick. One of
   * RESPONSE_OUTCOME_KEYS, or null when nobody has recorded one.
   */
  responseOutcome: string | null;
  responseBy: string | null;
  responseAt: string | null;
}

interface BandChange {
  athleteId: string;
  name: string | null;
  from: string | null;
  to: string;
  direction: 'worse' | 'better' | 'new';
  at: string;
}

interface DecisionPayload {
  scope: string | null;
  windowDays: number;
  /** What the change list covers — reported by the server, not inferred here. */
  changesBasis: 'since' | 'clamped' | 'window';
  changesFrom: string;
  canMarkReviewed: boolean;
  canRecordResponse: boolean;
  headline: { verb: string; count: number; parts: string[] } | null;
  worklist: WorklistEntry[];
  changes: BandChange[];
}

/**
 * How an entry is labelled.
 *
 * `never` is deliberately NOT routed through BAND_LABEL: it is not a band, and
 * giving it one would collapse "nobody has assessed this athlete" into a
 * clinical finding — the §33 reassurance failure.
 */
function entryLabel(band: string): string {
  if (band === 'never') return 'Never screened';
  if (band === 'none') return 'No band yet';
  return BAND_LABEL[band as keyof typeof BAND_LABEL] ?? band;
}

export default function DecisionPanel({
  onOpenAthlete,
  limit = 5,
}: {
  /** Opening an athlete is the page's business, not this panel's. */
  onOpenAthlete?: (athleteId: string) => void;
  limit?: number;
}) {
  const [data, setData] = useState<DecisionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // The marker is read ONCE per mount and held here, so that a reload triggered
  // by ticking an athlete off still asks the same question. Re-reading it each
  // time would be harmless today and a trap later: the moment anything advances
  // the marker, every subsequent reload would return an empty change list and
  // the panel would look correct while showing nothing.
  const sinceRef = useRef<string | undefined>(undefined);
  // Whether the reader has pressed "mark as read" DURING THIS VIEW — not
  // whether a marker exists in storage.
  //
  // Wiring it to the stored marker was the first version and it was wrong in a
  // way only a real browser showed: a returning reader arrives with a marker
  // already set, so the button greeted them reading "Marked as read" over a
  // list of changes they had not yet read. The control has to describe THEIR
  // action, not the presence of state.
  const [justMarked, setJustMarked] = useState(false);

  // Which entry has its response form open, and what is typed into it. Keyed by
  // athleteId rather than a boolean, so opening one form closes any other —
  // two open forms invite a note being typed into the wrong athlete's.
  const [responding, setResponding] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>('');
  const [note, setNote] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const since = sinceRef.current;
      const qs = since ? `?since=${encodeURIComponent(since)}` : '';
      setData(await api.get<DecisionPayload>(`/decisions${qs}`));
      setError(null);
    } catch (e) {
      // A refusal and an outage need opposite handling, and a bare Error
      // collapses them (lib/api.ts). A worklist that cannot load must say so
      // rather than render as "nothing to do", which is the §C failure: an
      // empty state and a dead API look identical.
      setError(isAuthError(e) ? 'You do not have access to the worklist.'
        : 'The worklist could not be loaded. It is not empty — it is unavailable.');
    }
  }, []);

  useEffect(() => {
    sinceRef.current = readSeen();
    load();
  }, [load]);

  /**
   * Advance the marker — on an explicit click, never automatically.
   *
   * Advancing on render would be the tidier code and the wrong behaviour: a
   * reader who opens the dashboard, is interrupted, and comes back tomorrow
   * would have "seen" a worsening they never read, and it would never be shown
   * again. Requiring the click means the list can only grow stale in the
   * direction that shows too much.
   *
   * The current list stays on screen after the click — it clears on the NEXT
   * visit — because emptying the panel under the reader's cursor destroys the
   * thing they just asked to keep a record of having read.
   */
  function markChangesSeen() {
    writeSeen(new Date().toISOString());
    setJustMarked(true);
  }

  async function toggleReviewed(entry: WorklistEntry) {
    if (!data?.canMarkReviewed) return;
    setBusy(entry.athleteId);
    try {
      if (entry.reviewed) await api.delete(`/decisions/reviewed/${entry.athleteId}`);
      else await api.post(`/decisions/reviewed/${entry.athleteId}`, { screeningId: entry.screeningId });
      await load();
    } catch {
      setError('That could not be saved. Your list is unchanged.');
    } finally {
      setBusy(null);
    }
  }

  /** Open the response form for one entry, pre-filled if it already has one. */
  function openResponse(entry: WorklistEntry) {
    setResponding(entry.athleteId);
    // Pre-selecting the existing outcome makes "change my answer" the same
    // gesture as "record one", and means a re-open cannot silently blank a
    // previous decision by submitting the placeholder.
    setOutcome(entry.responseOutcome ?? '');
    setNote('');
    setSaveError(null);
  }

  /**
   * Record what was DONE about this escalation.
   *
   * Writes to the screening, not to the reader's tick list. That endpoint is
   * audited (`escalation.response`) and is the reason this control exists —
   * "Mark reviewed" beside it records only that somebody looked.
   */
  async function submitResponse(entry: WorklistEntry) {
    if (!data?.canRecordResponse || !entry.screeningId || !outcome) return;
    setBusy(entry.athleteId);
    setSaveError(null);
    try {
      await api.post(`/screenings/${entry.screeningId}/response`, {
        outcome,
        note: note.trim() || undefined,
      });
      setResponding(null);
      setNote('');
      await load();
    } catch (e) {
      // Kept local to the form rather than raised to the panel-level `error`,
      // which replaces the whole worklist with a warning — losing the note the
      // clinician just typed, and their place in the list, over one failed save.
      setSaveError(isAuthError(e)
        ? 'You do not have permission to record a clinical response.'
        : 'That could not be saved. Nothing was recorded.');
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return (
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="alert alert-warning" style={{ marginBottom: 0 }}>{error}</div>
      </div>
    );
  }
  if (!data) return null;

  const open = data.worklist.filter((w) => !w.reviewed && w.band !== 'green' && w.band !== 'none');
  const shown = showAll ? open : open.slice(0, limit);
  const done = data.worklist.filter((w) => w.reviewed).length;

  return (
    <div className="card decision-panel" style={{ marginBottom: 20 }}>
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>
          {data.headline
            ? `${data.headline.verb}: ${data.headline.count} athlete${data.headline.count === 1 ? '' : 's'}`
            : 'Nothing waiting on you'}
        </h2>
        <span className="card-sub">
          {data.headline
            ? <>{data.headline.parts.join(' · ')} — across {data.scope}.</>
            : <>No athlete in {data.scope} is flagged or unscreened right now.</>}
        </span>
      </div></div>

      {/* The one claim this panel is careful never to make. */}
      <p className="card-sub" style={{ marginTop: 0 }}>
        This orders who is worth a clinician&rsquo;s time. It does not predict injury, and
        the reasons below are the rules that fired — not a diagnosis.
      </p>

      {shown.length > 0 && (
        <ul className="decision-list">
          {shown.map((w) => (
            <li key={w.athleteId} className="decision-item">
              <div className="decision-item-main">
                <span className={`decision-band decision-band--${w.band}`}>{entryLabel(w.band)}</span>
                <strong className="decision-name">{w.name ?? w.athleteId}</strong>
                {w.isInjured && <span className="decision-flag">flagged injured</span>}
                {w.ageDays !== null && (
                  <span className="text-muted decision-age">{w.ageDays}d ago</span>
                )}
              </div>
              <ul className="decision-reasons">
                {w.reasons.map((r) => <li key={r}>{r}</li>)}
              </ul>
              <div className="decision-actions">
                {onOpenAthlete && (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onOpenAthlete(w.athleteId)}>
                    Open record
                  </button>
                )}
                {data.canMarkReviewed && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy === w.athleteId}
                    onClick={() => toggleReviewed(w)}
                    // Said plainly, because the difference matters clinically.
                    title="Marks that YOU have looked at this screening. It is not a clinical decision — to record one, use Record response."
                  >
                    {busy === w.athleteId ? 'Saving…' : 'Mark reviewed'}
                  </button>
                )}
                {/* Offered only where there is something to answer. A green or
                    never-screened entry is not an escalation, and inviting a
                    clinical response to one would manufacture records of
                    decisions nobody was asked to make. */}
                {data.canRecordResponse && w.screeningId
                  && (w.band === 'red' || w.band === 'amber') && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy === w.athleteId}
                    onClick={() => (responding === w.athleteId
                      ? setResponding(null) : openResponse(w))}
                    title="Records what was DONE about this escalation. Audited and attributed to you."
                  >
                    {w.responseOutcome ? 'Change response' : 'Record response'}
                  </button>
                )}
              </div>

              {/* ANSWERED, stated on the entry itself. Without this the list
                  looks identical whether nine escalations were dealt with or
                  none were — which is the gap §103 exists to close. */}
              {w.responseOutcome && responding !== w.athleteId && (
                <p className="decision-response">
                  <strong>{outcomeLabel(w.responseOutcome)}</strong>
                  {w.responseBy ? ` · ${w.responseBy}` : ''}
                  {w.responseAt ? ` · ${new Date(w.responseAt).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}` : ''}
                </p>
              )}

              {responding === w.athleteId && (
                <div className="decision-respond">
                  <p className="decision-respond-lead">
                    What was done about this? Recorded against the screening,
                    attributed to you, and written to the Activity Log.
                  </p>
                  <div className="decision-respond-options">
                    {RESPONSE_OUTCOMES.map((o) => (
                      <label key={o.key} className="decision-respond-option">
                        <input
                          type="radio"
                          name={`outcome-${w.athleteId}`}
                          value={o.key}
                          checked={outcome === o.key}
                          onChange={() => setOutcome(o.key)}
                        />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                  <label className="decision-respond-note">
                    <span className="text-muted">Note (optional)</span>
                    <textarea
                      className="band-override-textarea"
                      rows={2}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Anything the next clinician should know"
                    />
                  </label>
                  {saveError && (
                    <div className="alert alert-warning" style={{ marginBottom: 0 }}>{saveError}</div>
                  )}
                  <div className="decision-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!outcome || busy === w.athleteId}
                      onClick={() => submitResponse(w)}
                    >
                      {busy === w.athleteId ? 'Saving…' : 'Record response'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busy === w.athleteId}
                      onClick={() => setResponding(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {open.length > limit && (
        <button type="button" className="btn btn-outline btn-sm" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show all ${open.length}`}
        </button>
      )}

      {done > 0 && (
        <p className="card-sub" style={{ marginTop: 12, marginBottom: 0 }}>
          {done} marked reviewed by you. A new screening brings an athlete back — a
          review is of one assessment, not of a person.
        </p>
      )}

      {open.length >= 2 && <CompareAthletes entries={open} />}

      {data.changes.length > 0 && (
        <div className="decision-changes">
          <h3 className="quick-heading">
            {/* Named from what the SERVER did, not from whether we sent a
                marker — the two can differ, and the difference is exactly what
                a clinician would be misled about. */}
            {data.changesBasis === 'since' ? 'Moved since you last looked'
              : data.changesBasis === 'clamped' ? 'Moved in the last 90 days'
                : `Moved in the last ${data.windowDays} days`}
          </h3>
          {data.changesBasis === 'clamped' && (
            <p className="card-sub" style={{ marginTop: 0 }}>
              It has been a while — this is capped at 90 days, so there may be
              older changes not listed here.
            </p>
          )}
          {data.changesBasis === 'window' && (
            <p className="card-sub" style={{ marginTop: 0 }}>
              A fixed window, not &ldquo;since you last looked&rdquo; — this browser has no
              record of your last visit.
            </p>
          )}
          <ul className="decision-reasons">
            {data.changes.slice(0, 6).map((c) => (
              <li key={`${c.athleteId}-${c.at}`}>
                <strong>{c.name ?? c.athleteId}</strong>{' '}
                {c.direction === 'new'
                  ? <>first screening — now {entryLabel(c.to)}</>
                  : <>{entryLabel(c.from ?? 'none')} → {entryLabel(c.to)}{c.direction === 'worse' ? ' (worse)' : ' (better)'}</>}
              </li>
            ))}
          </ul>
          <div className="decision-actions">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={markChangesSeen}
              // The distinction is the whole point of the control, so it is
              // said rather than implied.
              title="Remembers, in this browser, that you have read these. It records nothing about the athletes and is not a clinical decision."
            >
              {justMarked ? 'Marked as read' : 'Mark these as read'}
            </button>
            <span className="card-sub">
              {justMarked
                ? 'Next visit on this browser starts from here.'
                : 'Kept in this browser only — nothing is written to an athlete’s record.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
