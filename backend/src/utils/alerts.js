// Import-commit email alerts (redesign spec §9). When a newly-imported
// screening leaves an athlete at amber/red (or escalated), email the medical
// staff and the coaches assigned to that athlete's sport — so they assess
// immediately rather than letting the finding sit. Reuses utils/mailer.js
// (env SMTP, console fallback in dev).

const { User, Athlete, Screening } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

const BAND_RANK = { green: 0, amber: 1, red: 2 };
const BAND_LABEL = { amber: 'Needs attention', red: 'IMMEDIATE ASSESSMENT' };

// Check the athlete's latest band and email if it meets the alert threshold.
// Non-fatal by contract — callers wrap in try/catch; returns a small summary.
async function alertIfNeeded(athleteId) {
  const settings = await getSettings();
  if (!settings.alerts_enabled) return { sent: false, reason: 'alerts disabled' };

  const athlete = await Athlete.findOne({ where: { athleteId }, raw: true });
  if (!athlete) return { sent: false, reason: 'no athlete' };
  const s = await Screening.findOne({
    where: { athleteId }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true,
  });
  if (!s) return { sent: false, reason: 'no screening' };

  const band = s.overrideBand || s.overallBand;
  const threshold = settings.alert_on_band || 'amber';
  if (!band || BAND_RANK[band] < BAND_RANK[threshold]) {
    return { sent: false, reason: 'below alert threshold', band };
  }

  const medical = await User.findAll({ where: { role: 'medical', isActive: true }, attributes: ['email'], raw: true });
  const coachesAll = await User.findAll({ where: { role: 'coach', isActive: true }, attributes: ['email', 'coachSports'], raw: true });
  const coaches = coachesAll.filter((c) => Array.isArray(c.coachSports) && c.coachSports.includes(athlete.sport));
  const recipients = [...medical, ...coaches].map((u) => u.email).filter(Boolean);
  if (!recipients.length) return { sent: false, reason: 'no recipients', band };

  const subject = `AIRMS alert — ${athlete.name} (${athlete.athleteId}): ${BAND_LABEL[band]}`;
  const text = [
    `Screening alert for ${athlete.name} (${athlete.athleteId})`,
    '',
    `Sport: ${athlete.sport} · Programme: ${athlete.program} · ${athlete.gender ?? ''}`,
    `A new HoloMotion screening places this athlete at: ${BAND_LABEL[band]}.`,
    `Overall risk indicator: ${s.overallIndicator ?? '—'}/100 vs cohort · ${s.escalations} escalation(s).`,
    '',
    band === 'red'
      ? 'This athlete is flagged for immediate assessment. Please review before the next high-load session.'
      : 'This athlete needs attention. Please review at the next opportunity.',
    '',
    'Open AIRMS → Athlete Dashboard to review the full screening and, after assessment, set the risk band.',
    '',
    '— AIRMS · Institut Sukan Negara',
  ].join('\n');

  await sendMail({ to: recipients.join(','), subject, text });
  return { sent: true, band, recipients: recipients.length };
}

module.exports = { alertIfNeeded };
