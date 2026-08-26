'use client';

// The norm-affecting settings, rendered beside the norms they govern.
//
// These lived on the Cohort Norms page until 2026-08-02, were moved to a
// dedicated Settings page, and came back on 2026-08-26 at JC's request. He was
// right: you change `min_cohort_n` here and watch the cohort table below it
// move, where before the cause and the effect were two clicks apart.
//
// What did NOT come back is the rest of that page - email notifications, the
// scheduled-mail status and Send now, the import alert threshold. Those arrived
// later (DESIGN_DECISIONS 35/36) and have nothing to do with cohort norms;
// moving them here would recreate the crowding the original split fixed.
//
// A component rather than copied JSX, so two pages cannot drift into offering
// different knobs for the same settings.

export interface NormSettingsProps {
  /** Live values from GET /cohorts/settings/all. */
  set: Record<string, number | boolean | string>;
  /** PATCH one key, then refresh. */
  saveSetting: (key: string, value: number | boolean | string) => void;
  recompute: () => void;
  busy: boolean;
}

export default function NormSettings({ set, saveSetting, recompute, busy }: NormSettingsProps) {
  return (
    <>
    {/* Norming Settings — every knob feeds the overall risk indicator. */}
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Norming Settings</h2>
        <span className="card-sub">Tune how cohorts are formed and how athletes escalate. Recompute to re-score everyone after a change.</span>
      </div>
        <button type="button" className="btn btn-gold btn-sm" onClick={recompute} disabled={busy}>
          {busy ? 'Working…' : 'Recompute all'}
        </button>
      </div>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Min cohort size (n)</div>
          <input type="number" min={2} max={50} value={Number(set.min_cohort_n ?? 5)}
            onChange={(e) => saveSetting('min_cohort_n', Number(e.target.value))} style={{ width: 80 }} />
          <div className="stat-tile-delta">Smaller cohorts fall back a tier</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Bottom-k (worst) escalation</div>
          <div><label><input type="checkbox" checked={Boolean(set.escalation_bottom_k ?? true)}
            onChange={(e) => saveSetting('escalation_bottom_k', e.target.checked)} /> enabled</label></div>
          <input type="number" min={1} max={10} value={Number(set.bottom_k ?? 3)}
            onChange={(e) => saveSetting('bottom_k', Number(e.target.value))} style={{ width: 80, marginTop: 6 }} />
          <div className="stat-tile-delta">Worst k in cohort get +1 escalation. Capped at 20% of the cohort, so the applied share stays 10–20% at every size.</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Below-mean escalation</div>
          <div><label><input type="checkbox" checked={Boolean(set.escalation_below_mean)}
            onChange={(e) => saveSetting('escalation_below_mean', e.target.checked)} /> enabled</label></div>
          <input type="number" min={-3} max={0} step={0.1} value={Number(set.escalation_below_mean_z ?? -0.5)}
            onChange={(e) => saveSetting('escalation_below_mean_z', Number(e.target.value))} style={{ width: 80, marginTop: 6 }} />
          <div className="stat-tile-delta">
            +1 when the athlete is this many SD below the cohort mean. The most
            consequential number here: at 0 it is a sign test that flags about
            half of every cohort by construction. −0.5 means <em>meaningfully</em> below.
          </div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Fallback ladder</div>
          <div><label><input type="checkbox" checked={Boolean(set.fallback_enabled)}
            onChange={(e) => saveSetting('fallback_enabled', e.target.checked)} /> enabled</label></div>
          <div className="stat-tile-delta">spg → sg → s → all</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Auto-overwrite manual norms</div>
          <div><label><input type="checkbox" checked={Boolean(set.norm_auto_overwrite)}
            onChange={(e) => saveSetting('norm_auto_overwrite', e.target.checked)} /> enabled</label></div>
          <div className="stat-tile-delta">off (default): each import keeps your edited norm and flags it for review · on: each import replaces it with the freshly computed norm</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Per-indicator escalation</div>
          <div><label><input type="checkbox" checked={Boolean(set.escalation_indicator)}
            onChange={(e) => saveSetting('escalation_indicator', e.target.checked)} /> enabled</label></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <label style={{ fontSize: 'var(--fs-2xs)' }}>Elevated at
              <input type="number" min={0} max={100} value={Number(set.escalation_indicator_high ?? 25)}
                onChange={(e) => saveSetting('escalation_indicator_high', Number(e.target.value))}
                style={{ width: 64, marginLeft: 4 }} />
            </label>
            <label style={{ fontSize: 'var(--fs-2xs)' }}>outlier at
              <input type="number" min={0} max={5} step={0.1} value={Number(set.escalation_indicator_z ?? 1.5)}
                onChange={(e) => saveSetting('escalation_indicator_z', Number(e.target.value))}
                style={{ width: 64, marginLeft: 4 }} /> SD
            </label>
          </div>
          <div className="stat-tile-delta">
            +1 when an indicator is Elevated <em>and</em> the athlete is a peer-outlier on it.
            Both must hold: a threshold breach alone escalates over 90% of athletes.
          </div>
        </div>
      </div>
    </div>

    {/* Norm inclusion thresholds (B5) — an athlete's latest screening must meet
        ALL of these to shape a cohort norm; below any → excluded from the calc
        (still scored against it). 0 = no gate. */}
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header"><div>
        <h2 className="card-title" style={{ marginBottom: 0 }}>Norm inclusion thresholds</h2>
        <span className="card-sub">An athlete&apos;s latest screening must meet all of these to be counted in cohort-norm calculation — below any is excluded from the calc (but still scored against it). 0 = no threshold. Recompute to apply.</span>
      </div></div>
      <div className="stat-grid">
        <div className="stat-tile">
          <div className="stat-tile-label">Min Total Score</div>
          <input type="number" min={0} max={100} value={Number(set.norm_min_total ?? 0)}
            onChange={(e) => saveSetting('norm_min_total', Number(e.target.value))} style={{ width: 80 }} />
          <div className="stat-tile-delta">Exclude a screening below this Total Score</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Min ROM</div>
          <input type="number" min={0} max={100} value={Number(set.norm_min_rom ?? 0)}
            onChange={(e) => saveSetting('norm_min_rom', Number(e.target.value))} style={{ width: 80 }} />
          <div className="stat-tile-delta">Exclude a screening below this ROM</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">Min Stability</div>
          <input type="number" min={0} max={100} value={Number(set.norm_min_stability ?? 0)}
            onChange={(e) => saveSetting('norm_min_stability', Number(e.target.value))} style={{ width: 80 }} />
          <div className="stat-tile-delta">Exclude a screening below this Stability</div>
        </div>
      </div>
    </div>
    </>
  );
}
