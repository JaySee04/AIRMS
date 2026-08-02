// Admin-tunable settings with defaults. Redesign spec §3.3 — cohort minimum-n,
// fallback, escalation toggles, alert config are settings, not constants.
const { Setting } = require('../models');

const DEFAULTS = {
  min_cohort_n: 5,              // minimum athletes in a cohort before it norms/ranks
  fallback_enabled: true,      // spg → sg → s → all when a cohort is too small
  escalation_below_mean: true, // +1 escalation when the athlete is below the cohort mean
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
  alerts_enabled: true,        // email medical + coaches on import
  alert_on_band: 'amber',      // fire at this band or worse ('amber' | 'red')
  // Event-driven notifications (utils/notifications.js), each independently
  // governable, default on:
  notify_override: true,       // email the sport's coach when medical overrides an athlete to amber/red
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
  const [row, created] = await Setting.findOrCreate({ where: { key }, defaults: { value } });
  if (!created) await row.update({ value });
  return row;
}

module.exports = { DEFAULTS, getSettings, setSetting };
