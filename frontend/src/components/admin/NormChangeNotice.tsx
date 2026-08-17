'use client';

// One-time disclosure that changing who counts REBUILDS the institutional norm.
//
// The recompute is immediate (see the injury and membership routes), which is
// what makes the disclosure necessary rather than optional: unticking one athlete
// silently moves the baseline every other athlete in that cohort is scored
// against. That is a governance action wearing the clothes of a checkbox, and the
// person clicking it should know that once.
//
// Once, not every time. A confirmation that fires on every click stops being read
// by the third one, so it is acknowledged and dismissed for good.

import { useCallback, useState } from 'react';

const ACK_KEY = 'airms_norm_change_ack';

function acknowledged(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(ACK_KEY) === '1'; } catch { return false; }
}

export function useNormChangeNotice() {
  // Holds the deferred action. Wrapped in an object because React would
  // otherwise treat a bare function as a state updater and call it.
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const [dontShow, setDontShow] = useState(false);

  // Wrap any action that alters norm eligibility. Runs it straight through once
  // the notice has been acknowledged.
  const guard = useCallback((run: () => void) => {
    if (acknowledged()) { run(); return; }
    setPending({ run });
  }, []);

  const close = () => { setPending(null); setDontShow(false); };

  const proceed = () => {
    if (dontShow) {
      try { window.localStorage.setItem(ACK_KEY, '1'); } catch { /* private mode — just re-ask next time */ }
    }
    const run = pending?.run;
    close();
    run?.();
  };

  const notice = pending ? (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="norm-change-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 500 }}
      >
        <div className="modal-header">
          <h2 id="norm-change-title" style={{ margin: 0, fontSize: 'var(--fs-lg)' }}>This changes the norm</h2>
          <button type="button" className="modal-close" onClick={close} aria-label="Cancel">×</button>
        </div>
        <div className="modal-body">
          <p style={{ marginTop: 0, fontSize: 'var(--fs-md)' }}>
            Including or excluding an athlete — whether by the tick box or by declaring them
            injured — <strong>rebuilds the cohort norm immediately</strong>.
          </p>
          <p style={{ fontSize: 'var(--fs-md)' }}>
            The norm is the baseline every athlete in that cohort is scored against, so their
            risk bands can move as a result. Excluded athletes are still scored; they just stop
            contributing to the average.
          </p>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-md)', marginTop: 14 }}>
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            Don&rsquo;t show this again
          </label>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={close}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={proceed}>Continue</button>
        </div>
      </div>
    </div>
  ) : null;

  return { guard, notice };
}
