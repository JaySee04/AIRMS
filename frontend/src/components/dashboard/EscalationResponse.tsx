'use client';

// What a clinician DID about an escalation — recorded on the athlete's own page.
//
// It used to be an inline form inside the worklist entry, beside a "Mark
// reviewed" button. Both were wrong and went together (§107, JC): the tick was a
// private bookmark that let the queue be cleared without the record ever being
// opened, and recording a clinical decision from a summary row invites deciding
// from the summary row. The SOP is open the athlete, read the screening, decide
// here.
//
// This is the AUDITED act (`escalation.response`) — distinct from the band
// override above it, which says the band is WRONG. This one says the band is
// right and names what was done about it.

import { useState } from 'react';
import { api, isAuthError } from '@/lib/api';
import { RESPONSE_OUTCOMES } from '@/lib/shared/facts';

const labelOf = (key: string) => RESPONSE_OUTCOMES.find((o) => o.key === key)?.label ?? key;

export default function EscalationResponse({
  screeningId, band, outcome, by, at, onSaved,
}: {
  screeningId: number | string;
  /** The EFFECTIVE band. Only an escalation is owed a response. */
  band: string | null | undefined;
  outcome: string | null;
  by: string | null;
  at: string | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Offered only where there is something to answer. Inviting a clinical
  // response to an athlete with nothing flagged would manufacture records of
  // decisions nobody was asked to make.
  if (band !== 'red' && band !== 'amber') return null;

  const start = () => {
    setOpen(true);
    // Pre-selected, so "change my answer" is the same gesture as "record one"
    // and a re-open cannot blank a previous decision by submitting a placeholder.
    setChoice(outcome ?? '');
    setNote('');
    setError(null);
  };

  const submit = async () => {
    if (!choice) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/screenings/${screeningId}/response`, {
        outcome: choice,
        note: note.trim() || undefined,
      });
      setOpen(false);
      setNote('');
      onSaved();
    } catch (e) {
      setError(isAuthError(e)
        ? 'You do not have permission to record a clinical response.'
        : 'That could not be saved. Nothing was recorded.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"><div>
        <h3 className="card-title" style={{ marginBottom: 0 }}>Clinical response</h3>
        <span className="card-sub">What was done about this escalation</span>
      </div></div>

      {outcome && !open && (
        <p className="decision-response" style={{ marginTop: 0 }}>
          <strong>{labelOf(outcome)}</strong>
          {by ? ` · ${by}` : ''}
          {at ? ` · ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
        </p>
      )}

      {!open ? (
        <button type="button" className="btn btn-outline btn-sm" onClick={start}>
          {outcome ? 'Change response' : 'Record response'}
        </button>
      ) : (
        <div className="decision-respond">
          {/* One per line, never a row of chips: four similar sentences laid out
              horizontally scan as a severity scale, which they are not. */}
          <div className="decision-respond-options">
            {RESPONSE_OUTCOMES.map((o) => (
              <label key={o.key} className="decision-respond-option">
                <input
                  type="radio"
                  name={`response-${screeningId}`}
                  value={o.key}
                  checked={choice === o.key}
                  onChange={() => setChoice(o.key)}
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
          {error && <div className="alert alert-warning" style={{ marginBottom: 0 }}>{error}</div>}
          <div className="decision-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!choice || busy}
              onClick={submit}
            >
              {busy ? 'Saving…' : 'Record response'}
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
