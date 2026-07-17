// Import-commit email alerts (redesign spec §9). When a newly-imported
// screening leaves an athlete at amber/red (or escalated), email the medical
// staff and the coaches assigned to that athlete's sport — so they assess
// immediately rather than letting the finding sit. Reuses utils/mailer.js
// (env SMTP, console fallback in dev).

const { User, Athlete, Screening } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

const BAND_RANK = { green: 0, amber: 1, red: 2 };
// Title case, matching the band wording used on the dashboards and PDF reports.
// (Was 'IMMEDIATE ASSESSMENT' — all-caps reads as shouting, is inconsistent with
// the rest of the system, and is a spam-filter trigger in a subject line.)
const BAND_LABEL = { amber: 'Needs attention', red: 'Immediate assessment' };

// Batch form — one settings read, one recipients read, IN-queries for the
// athletes/screenings, then one email per flagged athlete. The post-import
// queue calls this with the whole burst. Returns a summary per athleteId.
async function alertMany(athleteIds) {
  const ids = [...new Set(athleteIds)].filter(Boolean);
  if (!ids.length) return [];

  const settings = await getSettings();
  if (!settings.alerts_enabled) return ids.map((id) => ({ athleteId: id, sent: false, reason: 'alerts disabled' }));
  const threshold = settings.alert_on_band || 'amber';

  const [athletes, screenings, users] = await Promise.all([
    Athlete.findAll({ where: { athleteId: ids }, raw: true }),
    Screening.findAll({ where: { athleteId: ids }, order: [['assessedAt', 'DESC'], ['id', 'DESC']], raw: true }),
    User.findAll({ where: { role: ['medical', 'coach'], isActive: true }, attributes: ['email', 'role', 'coachSports'], raw: true }),
  ]);
  const athleteBy = new Map(athletes.map((a) => [a.athleteId, a]));
  const latestBy = new Map();
  for (const s of screenings) if (!latestBy.has(s.athleteId)) latestBy.set(s.athleteId, s);
  const medicalEmails = users.filter((u) => u.role === 'medical').map((u) => u.email).filter(Boolean);
  const coaches = users.filter((u) => u.role === 'coach' && Array.isArray(u.coachSports));

  const results = [];
  for (const id of ids) {
    const athlete = athleteBy.get(id);
    if (!athlete) { results.push({ athleteId: id, sent: false, reason: 'no athlete' }); continue; }
    const s = latestBy.get(id);
    if (!s) { results.push({ athleteId: id, sent: false, reason: 'no screening' }); continue; }

    const band = s.overrideBand || s.overallBand;
    if (!band || BAND_RANK[band] < BAND_RANK[threshold]) {
      results.push({ athleteId: id, sent: false, reason: 'below alert threshold', band });
      continue;
    }

    const coachEmails = coaches.filter((c) => c.coachSports.includes(athlete.sport)).map((c) => c.email).filter(Boolean);
    const recipients = [...medicalEmails, ...coachEmails];
    if (!recipients.length) { results.push({ athleteId: id, sent: false, reason: 'no recipients', band }); continue; }

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
    results.push({ athleteId: id, sent: true, band, recipients: recipients.length });
  }
  return results;
}

// Single-athlete form (kept for direct callers/scripts). Same contract as
// before: non-fatal, returns a small summary.
async function alertIfNeeded(athleteId) {
  const [result] = await alertMany([athleteId]);
  return result || { sent: false, reason: 'no athlete id' };
}

module.exports = { alertIfNeeded, alertMany };
