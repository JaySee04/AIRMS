'use client';

// Clinician override of the overall risk band (redesign spec §5), Module 6.
// Replaces the old "Green/Amber/Red" outline buttons + window.prompt(): those
// named colours (the hero above names outcomes), never showed which band was
// in force vs. calculated, and dropped the whole action on a blank note. This
// states each choice's consequence, tags the calculated + in-force band, and
// takes the required note inline.

import { useState } from 'react';
import { api } from '@/lib/api';

export type Band = 'green' | 'amber' | 'red';

// Labels mirror OverallRiskBadge's BAND_META so the control and the hero never
// call the same band two different things; `action` is what it means for the
// athlete's week — the decision the clinician is actually making.
const CHOICES: { band: Band; label: string; action: string; cls: string }[] = [
  // The clinician IS entitled to clear an athlete — that is a human judgement,
  // not a screen output — so the ACTION still says cleared. The label matches
  // the band vocabulary, because whatever is chosen here displays everywhere.
  { band: 'green', label: 'No indicators flagged', action: 'Cleared to train as programmed', cls: 'low' },
  { band: 'amber', label: 'Needs attention', action: 'Train with modification; review the flagged regions', cls: 'mod' },
  { band: 'red', label: 'Immediate assessment', action: 'Hold high-load work until assessed', cls: 'high' },
];
const LABEL = (b: Band) => CHOICES.find((c) => c.band === b)!.label;

function formatDate(iso?: string | null) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export default function ClinicianBandOverride({
  screeningId, systemBand, effectiveBand, overrideBand, overrideNote, overrideBy, overrideAt, onSaved,
}: {
  screeningId: number;
  systemBand?: Band | null;
  effectiveBand?: Band | null;
  overrideBand?: Band | null;
  overrideNote?: string | null;
  overrideBy?: string | null;
  overrideAt?: string | null;
  onSaved: () => void | Promise<void>;
}) {
  // `pending` = a band the clinician has picked but not yet justified; the note
  // is captured before the PATCH so a half-finished assessment never ships.
  const [pending, setPending] = useState<Band | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const overridden = Boolean(overrideBand);

  function reset() { setPending(null); setNote(''); }

  async function submit(body: Record<string, string>, failMsg: string) {
    setBusy(true); setError('');
    try {
      await api.patch(`/screenings/${screeningId}/override`, body);
      reset();
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : failMsg);
    } finally { setBusy(false); }
  }

  function pick(band: Band) {
    if (busy) return;
    setError('');
    // Re-picking the band already in force is a no-op, not a re-justification.
    if (band === effectiveBand) { setPending(null); return; }
    setPending(band); setNote('');
  }

  return (
    <section className="band-override" aria-labelledby="band-override-title">
      <div className="band-override-head">
        <div>
          <h3 className="band-override-title" id="band-override-title">Clinical assessment</h3>
          <p className="band-override-help">
            The status above is calculated from this athlete&apos;s latest screening against their comparison
            group. After you examine them, record your own verdict — it replaces the calculated status on the
            athlete&apos;s and their coach&apos;s dashboard until the next HoloMotion report is imported.
          </p>
        </div>
        <span className={`band-override-source band-override-source--${overridden ? 'manual' : 'auto'}`}>
          {overridden
            ? `Showing your assessment${overrideBy ? ` · ${overrideBy}` : ''}${overrideAt ? ` · ${formatDate(overrideAt)}` : ''}`
            : 'Showing the calculated status'}
        </span>
      </div>

      <div className="band-choice-grid" role="radiogroup" aria-label="Set the athlete's risk status">
        {CHOICES.map((c) => (
          <button
            key={c.band}
            type="button"
            role="radio"
            aria-checked={effectiveBand === c.band}
            disabled={busy}
            onClick={() => pick(c.band)}
            className={`band-choice band-choice--${c.cls}${effectiveBand === c.band ? ' is-current' : ''}${pending === c.band ? ' is-pending' : ''}`}
          >
            <span className="band-choice-dot" aria-hidden="true" />
            <span className="band-choice-body">
              <span className="band-choice-label">{c.label}</span>
              <span className="band-choice-action">{c.action}</span>
            </span>
            <span className="band-choice-tags">
              {effectiveBand === c.band && <span className="band-choice-tag band-choice-tag--current">In force</span>}
              {systemBand === c.band && <span className="band-choice-tag">Calculated</span>}
            </span>
          </button>
        ))}
      </div>

      {pending && (
        <div className="band-override-note">
          <label htmlFor="band-override-note-input">
            Why are you setting this athlete to <strong>{LABEL(pending)}</strong>? The athlete and their coach
            see this note on their dashboard.
          </label>
          <textarea
            id="band-override-note-input"
            className="band-override-textarea"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Reassessed 24 Jul — left hamstring pain resolved, full ROM restored, cleared for full training."
            disabled={busy}
            autoFocus
          />
          <div className="band-override-actions">
            <button
              type="button"
              className="btn btn-gold btn-sm"
              onClick={() => submit({ band: pending, note: note.trim() }, 'Could not save the assessment. Try again.')}
              disabled={busy || !note.trim()}
            >
              {busy ? 'Saving…' : `Set to ${LABEL(pending)}`}
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={reset} disabled={busy}>Cancel</button>
            {!note.trim() && <span className="band-override-hint">A note is required — it is the clinical record for this decision.</span>}
          </div>
        </div>
      )}

      {overridden && !pending && (
        <div className="band-override-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => submit({}, 'Could not restore the calculated band. Try again.')}
            disabled={busy}
          >
            {busy ? 'Restoring…' : `Restore the calculated status${systemBand ? ` (${LABEL(systemBand)})` : ''}`}
          </button>
          {overrideNote && <span className="band-override-hint">Current note: “{overrideNote}”</span>}
        </div>
      )}

      {error && <div className="alert alert-error" style={{ marginTop: 10, marginBottom: 0 }}>{error}</div>}
    </section>
  );
}
