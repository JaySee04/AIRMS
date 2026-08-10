// Event-driven email notifications (distinct from the import-commit alerts in
// alerts.js, which fire on a screening recompute). These fire on discrete,
// intentional actions and reuse utils/mailer.js (env SMTP, console/dry-run
// fallback in dev). Every one is fire-and-forget and NON-FATAL — a mail failure
// must never break the action that triggered it. Each is gated by its own
// default-on admin setting, matching how the import alerts use `alerts_enabled`.

const { User } = require('../models');
const { sendMail } = require('./mailer');
const { getSettings } = require('./settings');

const { BAND_LABEL } = require('./bands');
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

// An athlete was declared injured (or cleared) → tell the sport's coach(es).
// This has two consequences a coach cannot see any other way: the athlete is
// out, and they stop counting toward the cohort norm — so squad averages shift
// for reasons that are not that athlete's own screening.
//
// Fires in BOTH directions, unlike the band override. A clearance matters here:
// "back available" is the thing a coach is actively waiting to be told, whereas
// a band settling back to green is routine.
function notifyInjuryToCoach(athlete, injured, note, by) {
  if (!athlete || !athlete.sport) return Promise.resolve({ sent: false, reason: 'no sport' });
  return notify('notify_injury', activeUsers({ role: 'coach', coachSport: athlete.sport }), () => ({
    subject: injured
      ? `AIRMS — ${athlete.name} declared injured by the medical team`
      : `AIRMS — ${athlete.name} cleared to train`,
    text: (injured
      ? [
        `The medical team has declared ${athlete.name} injured.`,
        note ? `\nClinician note: "${note}"${by ? ` — ${by}` : ''}` : (by ? `\nDeclared by ${by}.` : ''),
        '',
        'Treat this athlete as unavailable until the medical team clears them.',
        'They are also excluded from their cohort norm while injured, so squad averages will shift.',
      ]
      : [
        `The medical team has cleared ${athlete.name} to train.`,
        by ? `\nCleared by ${by}.` : '',
        '',
        'They count toward their cohort norm again from now on.',
      ]
    ).concat(['', 'See AIRMS → Squad Readiness.', '', SIGNOFF]).join('\n'),
  }));
}

module.exports = { notifyOverrideToCoach, notifyInjuryToCoach };
