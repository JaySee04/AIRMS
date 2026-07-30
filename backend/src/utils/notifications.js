// Event-driven email notifications (distinct from the import-commit alerts in
// alerts.js, which fire on a screening recompute). These fire on discrete,
// intentional actions and reuse utils/mailer.js (env SMTP, console/dry-run
// fallback in dev). Every function is fire-and-forget and NON-FATAL — a mail
// failure must never break the action that triggered it.
//
// Each is gated by its own admin setting (default on) so the notifications are
// individually governable, matching how the import alerts use `alerts_enabled`.

const { User, Athlete } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

const BAND_LABEL = { amber: 'Needs attention', red: 'Immediate assessment' };

// Athlete filed a self-report → prompt the medical team to review it, so an
// out-of-session report doesn't sit unseen in the queue. Recipients: active
// medical staff (the same people who see the review queue).
async function notifySelfReportSubmitted(report) {
  try {
    const settings = await getSettings();
    if (settings.notify_self_report === false) return { sent: false, reason: 'disabled' };

    const medical = await User.findAll({
      where: { role: 'medical', isActive: true },
      attributes: ['email'], raw: true,
    });
    const to = medical.map((u) => u.email).filter(Boolean);
    if (!to.length) return { sent: false, reason: 'no recipients' };

    const who = report.athleteName || report.athleteId;
    const subject = `AIRMS — new self-report from ${who} (${report.athleteId})`;
    const detail = [report.bodyPart, report.side, report.injuryType, report.severity].filter(Boolean).join(' · ');
    const text = [
      `${who} (${report.athleteId}) submitted an injury self-report.`,
      report.sport ? `Sport: ${report.sport}` : null,
      detail ? `Reported: ${detail}` : null,
      report.description ? `\n"${report.description}"` : null,
      '',
      'This is the athlete’s between-sessions channel — it is awaiting your review before it joins the official injury record.',
      'Open AIRMS → Self-Report Review to approve or reject it.',
      '',
      '— AIRMS · Institut Sukan Negara',
    ].filter((l) => l !== null).join('\n');

    await sendMail({ to: to.join(','), subject, text });
    return { sent: true, recipients: to.length };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[notify] self-report notification failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

// Medical set an athlete's band by override → tell the athlete's coach(es), so
// their squad-readiness view reflects a decision made outside their sight. Only
// fires for amber/red (an escalation worth flagging), never for a green clear.
async function notifyOverrideToCoach(athlete, band, note, by) {
  try {
    if (!['amber', 'red'].includes(band)) return { sent: false, reason: 'not an escalation' };
    const settings = await getSettings();
    if (settings.notify_override === false) return { sent: false, reason: 'disabled' };
    if (!athlete || !athlete.sport) return { sent: false, reason: 'no sport' };

    const coaches = await User.findAll({
      where: { role: 'coach', isActive: true, coachSport: athlete.sport },
      attributes: ['email'], raw: true,
    });
    const to = coaches.map((u) => u.email).filter(Boolean);
    if (!to.length) return { sent: false, reason: 'no coach' };

    const subject = `AIRMS — ${athlete.name} set to ${BAND_LABEL[band]} by the medical team`;
    const text = [
      `The medical team has assessed ${athlete.name} and set their status to: ${BAND_LABEL[band]}.`,
      note ? `\nClinician note: "${note}"${by ? ` — ${by}` : ''}` : (by ? `\nSet by ${by}.` : ''),
      '',
      band === 'red'
        ? 'Please treat this athlete as a clinical priority and hold high-load work until the medical team confirms.'
        : 'Please factor this into training until the medical team reviews the flagged areas.',
      'The status stays until the next HoloMotion screening is imported. See AIRMS → Squad Readiness.',
      '',
      '— AIRMS · Institut Sukan Negara',
    ].join('\n');

    await sendMail({ to: to.join(','), subject, text });
    return { sent: true, recipients: to.length };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[notify] override notification failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

module.exports = { notifySelfReportSubmitted, notifyOverrideToCoach };
