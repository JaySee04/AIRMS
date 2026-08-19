// Admin-tunable settings with defaults. Redesign spec §3.3 — cohort minimum-n,
// fallback, escalation toggles, alert config are settings, not constants.
const { Setting } = require('../models');

const DEFAULTS = {
  // How long a screening stays current before the athlete is due again.
  //
  // A screening programme runs on RECALL: the coverage KPI could say "58 of 62
  // tested" for a window and still hide that a third of those 58 were last seen
  // ten months ago. Coverage answers "did we test them"; this answers "is what
  // we know about them still current", and only the second one tells an
  // administrator who to call.
  //
  // 180 days is a default, not a clinical standard — ISN sets its own cadence
  // and the seeded programme's own median retest gap is 35 days. It is a
  // setting precisely so the number is the institution's, not the software's.
  rescreen_due_days: 180,
  // Scheduled rescreen reminder (utils/scheduler.js). Deliberately has NO
  // threshold of its own: it reports against `rescreen_due_days` above, the
  // same number the Programme Activity KPI and the PDF read. A second setting
  // would let the email say an athlete is overdue while the dashboard says they
  // are current, which is worse than not sending the email at all.
  rescreen_reminder_enabled: true, // email admin + medical the recall list
  rescreen_reminder_day: 1,        // day of month (capped at 28 so February always fires)
  rescreen_reminder_hour: 8,       // hour of day, local time, 0-23
  rescreen_reminder_last_sent: '', // internal marker, set by the scheduler
  min_cohort_n: 5,              // minimum athletes in a cohort before it norms/ranks
  fallback_enabled: true,      // spg → sg → s → all when a cohort is too small
  // The saved norm version currently IN FORCE, or null when the live norms simply
  // track the data. A pin is the difference between "we archived a norm set" and
  // "this norm set governs, and an import may not move it" — see
  // routes/cohorts.js and DESIGN_DECISIONS §22.
  pinned_norm_version_id: null,
  escalation_below_mean: true, // +1 escalation when the athlete is below the cohort mean
  // How far below the mean counts. A plain z < 0 test flags ~half of every
  // cohort BY CONSTRUCTION — measured on the seeded set, 27 of 58 athletes
  // tripped it and 12 of the 14 ambers rested on it alone, one of them at
  // z = -0.163. "Below average" then means "lost a coin toss", which is not a
  // clinical finding and reads as noise once the reasons are shown to a
  // clinician. -0.5 SD keeps the rule meaning *meaningfully* below.
  escalation_below_mean_z: -0.5,
  escalation_bottom_k: true,   // +1 escalation when athlete in the worst k of cohort
  bottom_k: 3,                 // the "k" in bottom-k. Band: 0 escalations = green,
                               // 1 = amber (needs attention), 2+ = red (immediate assessment)
  // Per-indicator escalation: +1 when a single exercise-risk indicator is over
  // the Elevated threshold AND the athlete is a peer-outlier on it (see
  // overallIndicator.js). Selective by design — a threshold breach alone won't
  // escalate (>90% of the squad trips one).
  escalation_indicator: true,       // toggle the per-indicator escalation
  escalation_indicator_high: 25,    // indicator value (Elevated band) that arms the rule
  escalation_indicator_z: 1.5,      // per-indicator z cutoff vs cohort (a clear outlier;
                                    // 1.5 keeps it selective — 1.0 flagged ~half the
                                    // synthetic squad, 2.0 caught nobody)
  // Norm governance: a cohort norm auto-generates + goes live on every
  // HoloMotion import. When a human has manually edited a norm and a later
  // import recomputes a different value, the manual edit is KEPT and the cohort
  // is flagged "review — new data" (drift shown on the Cohort page). Flip this
  // ON to instead let each import overwrite the manual edit with the freshly
  // computed norm.
  norm_auto_overwrite: false,
  // Norm-inclusion thresholds (B5): an athlete's latest screening must meet ALL
  // of these to be counted in cohort-norm CALCULATION — below any → auto-excluded
  // (still scored against the norm, just not shaping it). 0 = no gate (default),
  // so existing behaviour is unchanged until an admin raises a threshold.
  norm_min_total: 0,           // minimum Total Score
  norm_min_rom: 0,             // minimum ROM
  norm_min_stability: 0,       // minimum Stability
  alerts_enabled: true,        // email medical + coaches on import
  alert_on_band: 'amber',      // fire at this band or worse ('amber' | 'red')
  // Event-driven notifications (utils/notifications.js), each independently
  // governable, default on:
  notify_override: true,       // email the sport's coach when medical overrides an athlete to amber/red
  notify_injury: true,         // email the sport's coach when medical declares an athlete injured or clears them
  // Scheduled monthly digest (utils/scheduler.js). `digest_last_sent` is the
  // YYYY-MM already delivered — it is the idempotency marker, not a preference,
  // and lives here so a restart cannot double-send or silently skip a month.
  digest_enabled: true,        // email admin + executive a monthly summary
  digest_day: 1,               // day of month to send (capped at 28 so February always fires)
  digest_hour: 7,              // hour of day, local time, 0-23
  digest_last_sent: '',        // internal marker, set by the scheduler
  // What happened on the last attempt of each scheduled email, success or
  // failure. NOT a preference — it is the only place a failed send is visible.
  // Both the hourly tick and a manual send write these; a failure that only
  // reached console.error on an unattended host is a mail nobody knows did not
  // arrive. Shape: { at, ok, detail } as JSON.
  digest_last_result: '',
  rescreen_reminder_last_result: '',
};

// Merge stored overrides over defaults. Unknown/legacy keys are ignored.
async function getSettings() {
  const rows = await Setting.findAll({ raw: true }).catch(() => []);
  const out = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) out[r.key] = r.value;
  return out;
}

async function setSetting(key, value) {
  if (!(key in DEFAULTS)) throw new Error(`Unknown setting "${key}"`);
  // Clearing a setting DELETES its row rather than storing null: Setting.value is
  // NOT NULL, so `setSetting(key, null)` used to throw — which meant releasing a
  // pinned norm version failed with a 500. Absence is also the more honest
  // representation of "no value": getSettings falls back to the default, so a
  // deleted row and a never-set row behave identically.
  if (value === null) {
    await Setting.destroy({ where: { key } });
    return null;
  }
  const [row, created] = await Setting.findOrCreate({ where: { key }, defaults: { value } });
  if (!created) await row.update({ value });
  return row;
}

module.exports = { DEFAULTS, getSettings, setSetting };
