'use client';

// Admin · Settings. Everything that is not about one particular page: the email
// surface, the scheduled-mail status and the import alert threshold.
//
// The norm-affecting settings moved BACK to the Cohort Norms page on 2026-08-26
// (components/admin/NormSettings.tsx) so a knob sits beside the table it moves.
// The rest stayed here, having been
// page stays focused on the norm values. Reached from the "Settings" button on
// Cohort Norms. Admin-only — medical norm-editors never see these knobs.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { api } from '@/lib/api';

interface SettingsResp { settings: Record<string, number | boolean | string>; defaults: Record<string, number | boolean | string>; }
interface SendResult {
  sent: boolean; reason?: string; recipients?: number; emails?: number;
  attached?: boolean; sentTo?: string[];
}
interface MailOutcome { at: string; ok: boolean; detail: string }

// The stored outcome of the last attempt, success or failure. Parsed
// defensively: this is the one panel whose job is to report that something went
// wrong, so a malformed value must not blank it out.
function lastAttempt(raw: unknown): MailOutcome | null {
  if (typeof raw !== 'string' || !raw) return null;
  try {
    const o = JSON.parse(raw) as MailOutcome;
    return o && typeof o.at === 'string' ? o : null;
  } catch { return null; }
}

function AttemptLine({ raw }: { raw: unknown }) {
  const o = lastAttempt(raw);
  if (!o) return null;
  const when = new Date(o.at);
  return (
    <div
      style={{
        marginTop: 6, fontSize: 'var(--fs-xs)',
        color: o.ok ? 'var(--text-muted)' : 'var(--risk-high)',
      }}
    >
      <strong>{o.ok ? 'Last attempt' : 'Last attempt FAILED'}</strong>
      {' \u00b7 '}
      {Number.isNaN(when.getTime()) ? o.at : when.toLocaleString('en-GB')}
      {' \u2014 '}
      {o.detail}
    </div>
  );
}

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

  // Run one of the scheduled emails immediately. The existing control clears the
  // month marker and waits up to an hour, which is right for correcting a missed
  // month and useless for the two cases that actually come up — demonstrating the
  // feature, and an administrator who wants this month's report today.
  async function sendNow(kind: 'digest' | 'reminder', label: string) {
    setBusy(true); setMsg(null); setError(null);
    try {
      const r = await api.post<SendResult>(`/cohorts/settings/mail/${kind}/send-now`, {});
      if (r.sent) {
        setMsg(`${label} sent — ${kind === 'digest'
          ? `${r.recipients} recipient(s)${r.attached ? ', holistic report attached' : ' (summary only)'}`
          : `${r.emails} email(s): ${(r.sentTo || []).join('; ')}`}`);
      } else {
        // "Nothing was sent" needs the reason on screen. Silent success is how a
        // disabled switch or an all-opted-out roster reads as a working feature.
        setError(`${label} was not sent — ${r.reason === 'disabled'
          ? 'this notification is switched off above'
          : r.reason === 'no recipients'
            ? 'every eligible account has opted out of it'
            : r.reason}`);
      }
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Send failed'); } finally { setBusy(false); }
  }

  const set = settings?.settings ?? {};

  return (
    <DashboardLayout allowedRoles={['admin']} title="Settings">
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{ marginBottom: 16 }}>{msg}</div>}

      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/thresholds" className="btn btn-outline btn-sm">← Back to Cohort Norms</Link>
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
              <label style={{ fontSize: 'var(--fs-sm)' }}>day
                <input type="number" min={1} max={28} value={Number(set.digest_day ?? 1)}
                  onChange={(e) => saveSetting('digest_day', Number(e.target.value))}
                  style={{ width: 56, marginLeft: 4 }} />
              </label>
              <label style={{ fontSize: 'var(--fs-sm)' }}>hour
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
            <AttemptLine raw={set.digest_last_result} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                disabled={busy || !set.digest_enabled}
                onClick={() => sendNow('digest', 'Monthly summary')}
              >
                {busy ? 'Working\u2026' : 'Send now'}
              </button>
              {Boolean(set.digest_last_sent) && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => saveSetting('digest_last_sent', '')}
                >
                  Send at the next hourly check
                </button>
              )}
            </div>
          </div>

          {/* A screening programme runs on recall, and a page only tells you
              something when somebody opens it — the wrong shape for a fact that
              decays on its own. This is the interval EVERYTHING reads: the
              Programme Activity KPI, the KPI PDF and this email. Deliberately
              one number rather than a separate reminder threshold, which is how
              an email comes to say "overdue" while the dashboard says
              "current". */}
          <div className="stat-tile">
            <div className="stat-tile-label">Rescreen reminders</div>
            <div><label><input type="checkbox" checked={Boolean(set.rescreen_reminder_enabled)}
              onChange={(e) => saveSetting('rescreen_reminder_enabled', e.target.checked)} /> enabled</label></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 'var(--fs-sm)' }}>a screening stays current for
                <select
                  value={String(set.rescreen_due_days ?? 180)}
                  onChange={(e) => saveSetting('rescreen_due_days', Number(e.target.value))}
                  style={{ marginLeft: 6, width: 'auto', minHeight: 30 }}
                >
                  <option value="60">2 months</option>
                  <option value="90">3 months</option>
                  <option value="120">4 months</option>
                  <option value="180">6 months</option>
                  <option value="270">9 months</option>
                  <option value="365">1 year</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <label style={{ fontSize: 'var(--fs-sm)' }}>day
                <input type="number" min={1} max={28} value={Number(set.rescreen_reminder_day ?? 1)}
                  onChange={(e) => saveSetting('rescreen_reminder_day', Number(e.target.value))}
                  style={{ width: 56, marginLeft: 4 }} />
              </label>
              <label style={{ fontSize: 'var(--fs-sm)' }}>hour
                <input type="number" min={0} max={23} value={Number(set.rescreen_reminder_hour ?? 8)}
                  onChange={(e) => saveSetting('rescreen_reminder_hour', Number(e.target.value))}
                  style={{ width: 56, marginLeft: 4 }} />
              </label>
            </div>
            <div className="stat-tile-delta">
              Email admin and medical staff a monthly recall list: who is overdue, and who has never
              been screened &mdash; counted apart, because that one needs a first assessment rather than
              a call-back. The interval above is the SAME number Programme Activity and the KPI report
              use, so the email cannot disagree with the screen. Individual accounts can opt out on
              their own profile
              {set.rescreen_reminder_last_sent ? ` — last sent ${String(set.rescreen_reminder_last_sent)}` : ' — not sent yet'}
            </div>
            <AttemptLine raw={set.rescreen_reminder_last_result} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-gold btn-sm"
                disabled={busy || !set.rescreen_reminder_enabled}
                onClick={() => sendNow('reminder', 'Rescreen reminder')}
              >
                {busy ? 'Working\u2026' : 'Send now'}
              </button>
              {Boolean(set.rescreen_reminder_last_sent) && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => saveSetting('rescreen_reminder_last_sent', '')}
                >
                  Send at the next hourly check
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
