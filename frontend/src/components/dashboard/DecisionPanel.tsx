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

import { useCallback, useEffect, useState } from 'react';
import { api, isAuthError } from '@/lib/api';
import { BAND_LABEL } from '@/lib/bands';

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
  canMarkReviewed: boolean;
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

  const load = useCallback(async () => {
    try {
      setData(await api.get<DecisionPayload>('/decisions'));
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

  useEffect(() => { load(); }, [load]);

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
                    title="Marks that YOU have looked at this screening. It is not a clinical decision — to record one, set the band override on the athlete."
                  >
                    {busy === w.athleteId ? 'Saving…' : 'Mark reviewed'}
                  </button>
                )}
              </div>
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

      {data.changes.length > 0 && (
        <div className="decision-changes">
          <h3 className="quick-heading">Moved in the last {data.windowDays} days</h3>
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
        </div>
      )}
    </div>
  );
}
