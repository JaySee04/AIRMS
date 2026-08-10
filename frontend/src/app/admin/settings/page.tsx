'use client';

// Admin · Settings. The Norming Settings (how cohorts form and how athletes
// escalate) and Email Notifications, split out of the Cohort Norms page so that
// page stays focused on the norm values. Reached from the "Settings" button on
// Cohort Norms. Admin-only — medical norm-editors never see these knobs.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface SettingsResp { settings: Record<string, number | boolean | string>; defaults: Record<string, number | boolean | string>; }

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SettingsResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSettings(await api.get<SettingsResp>('/cohorts/settings/all')); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to load settings'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveSetting(key: string, value: number | boolean | string) {
    setBusy(true); setError(null);
    try { await api.patch('/cohorts/settings/all', { [key]: value }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); } finally { setBusy(false); }
  }

  async function recompute() {
    setBusy(true); setMsg(null); setError(null);
    try {
      const r = await api.post<{ cohorts: { cohorts: number }; indicators: { scored: number } }>('/cohorts/recompute', {});
      setMsg(`Recomputed ${r.cohorts.cohorts} cohorts; scored ${r.indicators.scored} athletes.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Recompute failed'); } finally { setBusy(false); }
  }

  const set = settings?.settings ?? {};

  return (
    <DashboardLayout allowedRoles={['admin']} title="Settings">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/thresholds" className="btn btn-outline btn-sm">← Back to Cohort Norms</Link>
      </div>

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
            <input type="number" min={1} max={10} value={Number(set.bottom_k ?? 3)}
              onChange={(e) => saveSetting('bottom_k', Number(e.target.value))} style={{ width: 80 }} />
            <div className="stat-tile-delta">Worst k in cohort get +1 escalation</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Below-mean escalation</div>
            <div><label><input type="checkbox" checked={Boolean(set.escalation_below_mean)}
              onChange={(e) => saveSetting('escalation_below_mean', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">+1 when below cohort average</div>
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
            <div className="stat-tile-delta">+1 when an indicator is Elevated <em>and</em> the athlete is a peer-outlier on it</div>
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

      {/* Email Notifications — governs the whole email surface (utils/alerts.js +
          utils/notifications.js). Backend-gated defaults are all on. */}
      <div className="card">
        <div className="card-header"><div>
          <h2 className="card-title" style={{ marginBottom: 0 }}>Email Notifications</h2>
          <span className="card-sub">Who gets emailed, and when. Uses the configured SMTP account (or the dev console fallback).</span>
        </div></div>
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile-label">Import alerts</div>
            <div><label><input type="checkbox" checked={Boolean(set.alerts_enabled)}
              onChange={(e) => saveSetting('alerts_enabled', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">Email medical + the sport&apos;s coaches when a screening import flags an athlete</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Import alert threshold</div>
            <div><select value={String(set.alert_on_band ?? 'amber')} onChange={(e) => saveSetting('alert_on_band', e.target.value)} disabled={busy || !set.alerts_enabled}>
              <option value="amber">Needs attention (amber) or worse</option>
              <option value="red">Immediate assessment (red) only</option>
            </select></div>
            <div className="stat-tile-delta">Fire the import alert at this band or worse</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Override → coach</div>
            <div><label><input type="checkbox" checked={Boolean(set.notify_override)}
              onChange={(e) => saveSetting('notify_override', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">Email the sport&apos;s coach when medical overrides an athlete to Needs attention or Immediate assessment (amber/red)</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Injury → coach</div>
            <div><label><input type="checkbox" checked={Boolean(set.notify_injury)}
              onChange={(e) => saveSetting('notify_injury', e.target.checked)} /> enabled</label></div>
            <div className="stat-tile-delta">Email the sport&apos;s coach when medical declares an athlete injured, and again when they are cleared &mdash; the athlete is unavailable and leaves the cohort norm while injured</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">Monthly summary</div>
            <div><label><input type="checkbox" checked={Boolean(set.digest_enabled)}
              onChange={(e) => saveSetting('digest_enabled', e.target.checked)} /> enabled</label></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <label style={{ fontSize: '0.78rem' }}>day
                <input type="number" min={1} max={28} value={Number(set.digest_day ?? 1)}
                  onChange={(e) => saveSetting('digest_day', Number(e.target.value))}
                  style={{ width: 56, marginLeft: 4 }} />
              </label>
              <label style={{ fontSize: '0.78rem' }}>hour
                <input type="number" min={0} max={23} value={Number(set.digest_hour ?? 7)}
                  onChange={(e) => saveSetting('digest_hour', Number(e.target.value))}
                  style={{ width: 56, marginLeft: 4 }} />
              </label>
            </div>
            <div className="stat-tile-delta">
              Email admin and executive accounts a roster, band-mix and activity summary once a month.
              Capped at day 28 so February always fires. If AIRMS is down when it falls due it sends
              late rather than skipping the month
              {set.digest_last_sent ? ` — last sent ${String(set.digest_last_sent)}` : ' — not sent yet'}
            </div>
            {/* Clearing the marker is the only way to see this fire without
                waiting for next month, so it is offered rather than left to a
                database edit. */}
            {Boolean(set.digest_last_sent) && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => saveSetting('digest_last_sent', '')}
              >
                Send again at the next hourly check
              </button>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
