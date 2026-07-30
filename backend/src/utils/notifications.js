// Event-driven email notifications (distinct from the import-commit alerts in
// alerts.js, which fire on a screening recompute). These fire on discrete,
// intentional actions and reuse utils/mailer.js (env SMTP, console/dry-run
// fallback in dev). Every one is fire-and-forget and NON-FATAL — a mail failure
// must never break the action that triggered it. Each is gated by its own
// default-on admin setting, matching how the import alerts use `alerts_enabled`.

const { User } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

const BAND_LABEL = { amber: 'Needs attention', red: 'Immediate assessment' };
const SIGNOFF = '— AIRMS · Institut Sukan Negara';

// Shared skeleton: gate on `setting`, resolve recipients, build + send. Returns
// a small { sent, reason } summary and swallows errors (logged, non-fatal).
async function notify(setting, recipientsFn, buildFn) {
  try {
    if ((await getSettings())[setting] === false) return { sent: false, reason: 'disabled' };
    const to = (await recipientsFn()).map((u) => u.email).filter(Boolean);
    if (!to.length) return { sent: false, reason: 'no recipients' };
    await sendMail({ to: to.join(','), ...buildFn() });
    return { sent: true, recipients: to.length };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[notify] ${setting} failed:`, e.message);
    return { sent: false, reason: e.message };
  }
}

const activeUsers = (where) => () =>
  User.findAll({ where: { isActive: true, ...where }, attributes: ['email'], raw: true });

// Athlete filed a self-report → prompt the medical team to review it, so an
// out-of-session report doesn't sit unseen in the queue.
function notifySelfReportSubmitted(report) {
  const who = report.athleteName || report.athleteId;
  const detail = [report.bodyPart, report.side, report.injuryType, report.severity].filter(Boolean).join(' · ');
  return notify('notify_self_report', activeUsers({ role: 'medical' }), () => ({
    subject: `AIRMS — new self-report from ${who} (${report.athleteId})`,
    text: [
      `${who} (${report.athleteId}) submitted an injury self-report.`,
      report.sport ? `Sport: ${report.sport}` : null,
      detail ? `Reported: ${detail}` : null,
      report.description ? `\n"${report.description}"` : null,
      '',
      'This is the athlete’s between-sessions channel — it is awaiting your review before it joins the official injury record.',
      'Open AIRMS → Self-Report Review to approve or reject it.',
      '',
      SIGNOFF,
    ].filter((l) => l !== null).join('\n'),
  }));
}

// Medical overrode an athlete's band → tell the sport's coach(es) so their
// squad-readiness view reflects it. Only amber/red (an escalation worth
// flagging); never a green clear.
function notifyOverrideToCoach(athlete, band, note, by) {
  if (!['amber', 'red'].includes(band)) return Promise.resolve({ sent: false, reason: 'not an escalation' });
  if (!athlete || !athlete.sport) return Promise.resolve({ sent: false, reason: 'no sport' });
  return notify('notify_override', activeUsers({ role: 'coach', coachSport: athlete.sport }), () => ({
    subject: `AIRMS — ${athlete.name} set to ${BAND_LABEL[band]} by the medical team`,
    text: [
      `The medical team has assessed ${athlete.name} and set their status to: ${BAND_LABEL[band]}.`,
      note ? `\nClinician note: "${note}"${by ? ` — ${by}` : ''}` : (by ? `\nSet by ${by}.` : ''),
      '',
      band === 'red'
        ? 'Please treat this athlete as a clinical priority and hold high-load work until the medical team confirms.'
        : 'Please factor this into training until the medical team reviews the flagged areas.',
      'The status stays until the next HoloMotion screening is imported. See AIRMS → Squad Readiness.',
      '',
      SIGNOFF,
    ].join('\n'),
  }));
}

module.exports = { notifySelfReportSubmitted, notifyOverrideToCoach };
