// Admin-tunable settings with defaults. Redesign spec §3.3 — cohort minimum-n,
// fallback, escalation toggles, alert config are settings, not constants.
const { Setting } = require('../models');

const DEFAULTS = {
  min_cohort_n: 5,              // minimum athletes in a cohort before it norms/ranks
  fallback_enabled: true,      // spg → sg → s → all when a cohort is too small
  escalation_below_mean: true, // +1 escalation when the athlete is below the cohort mean
  escalation_bottom_k: true,   // +1 escalation when athlete in the worst k of cohort
  bottom_k: 3,                 // the "k" in bottom-k. Band: 0 escalations = green,
                               // 1 = amber (needs attention), 2 = red (immediate assessment)
  alerts_enabled: true,        // email medical + coaches on import
  alert_on_band: 'amber',      // fire at this band or worse ('amber' | 'red')
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
