const nodemailer = require('nodemailer');

// Env-driven SMTP transport. Works against any SMTP provider:
//   - Gmail:    SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_SECURE=true
//               (with a 2FA app password as SMTP_PASS)
//   - Mailtrap: SMTP_HOST=sandbox.smtp.mailtrap.io  SMTP_PORT=2525  SMTP_SECURE=false
//   - SendGrid: SMTP_HOST=smtp.sendgrid.net  SMTP_PORT=587  SMTP_USER=apikey
//
// If SMTP_HOST is not set, the mailer falls back to a console transport that
// prints messages to stdout. This lets the round-trip work end-to-end in
// local dev without credentials — the email content (including the reset
// link) is visible in the backend terminal.
//
// MAILER_DRY_RUN=true forces the console transport EVEN WHEN SMTP_HOST is
// configured (e.g. this project's real Gmail demo account) — set it for one
// process only (`MAILER_DRY_RUN=true node script.js`, no .env edit, no
// backend restart) whenever testing an email template/content change against
// real data. Added after a dev-testing session accidentally sent a real test
// alert to a live inbox because SMTP_HOST was already configured for the
// demo — this is the safe way to preview what would be sent without ever
// touching a real mailbox.

let transporterPromise = null;

function buildTransport() {
  if (!process.env.SMTP_HOST || process.env.MAILER_DRY_RUN === 'true') {
    return {
      isConsole: true,
      sendMail: async (msg) => {
        console.log('────────────────────────────────────────────────────────────');
        console.log(process.env.MAILER_DRY_RUN === 'true'
          ? '📧 [DRY RUN] MAILER_DRY_RUN=true — nothing was sent, printing to console:'
          : '📧 [DEV mailer] No SMTP_HOST configured — printing to console:');
        console.log('From:    ', msg.from);
        console.log('To:      ', msg.to);
        console.log('Subject: ', msg.subject);
        // Named explicitly: a dry run that silently omits the attachment would
        // let "the digest carries the report" go untested in the only mode it is
        // safe to test in.
        for (const a of msg.attachments || []) {
          console.log('Attached:', `${a.filename} (${a.content ? a.content.length : 0} bytes)`);
        }
        console.log('────────────────────────────────────────────────────────────');
        console.log(msg.text || msg.html);
        console.log('────────────────────────────────────────────────────────────');
        return { messageId: 'dev-console-' + Date.now() };
      },
    };
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

function getTransport() {
  if (!transporterPromise) transporterPromise = Promise.resolve(buildTransport());
  return transporterPromise;
}

// WHO AIRMS'S MAIL APPEARS TO COME FROM, reported so an administrator can see
// it rather than discover it from a clinician.
//
// The known limitation has been documented since the invitation flow shipped:
// invitations send from a personal Gmail, and to a clinician that reads as
// phishing. Real use needs ISN's relay or a controlled domain with SPF/DKIM.
// That is configuration rather than code — the mailer is entirely env-driven —
// which is exactly why it is the kind of thing that survives to handover: there
// is no build step to fail and nothing on any screen that says so. The first
// person to notice is the invitee, and what they do about it is ignore the
// email.
//
// So the fact is put where an administrator already looks. `concern` is null
// when there is nothing to say, mirroring `auditHealth` on the same payload:
// a permanently-green badge is a badge nobody reads.
const CONSUMER_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'mail.com', 'zoho.com',
]);

/** The address part of `Name <addr@host>`, or of a bare address. */
function addressOf(from) {
  const m = String(from || '').match(/<([^>]+)>/);
  return (m ? m[1] : String(from || '')).trim().toLowerCase();
}

function senderIdentity() {
  const configured = Boolean(process.env.SMTP_HOST);
  const dryRun = process.env.MAILER_DRY_RUN === 'true';
  const from = process.env.SMTP_FROM || 'AIRMS <no-reply@airms.local>';
  const domain = addressOf(from).split('@')[1] || null;

  let concern = null;
  if (!configured) {
    concern = 'No SMTP host is configured, so nothing is delivered — mail is printed to the server log instead.';
  } else if (dryRun) {
    concern = 'MAILER_DRY_RUN is set, so nothing is delivered — mail is printed to the server log instead.';
  } else if (domain && CONSUMER_MAIL_DOMAINS.has(domain)) {
    concern = `Mail is sent from a personal ${domain} mailbox. An invitation or a clinical alert arriving from a consumer address reads as phishing to a clinician; ISN's own relay, or a controlled domain with SPF and DKIM, is what real use needs. This is configuration, not code.`;
  }

  return { from, domain, delivering: configured && !dryRun, concern };
}

// `attachments` is nodemailer's own shape ([{ filename, content, contentType }]).
// It has to be listed here explicitly — this function destructures rather than
// spreads, so an unlisted field is dropped silently.
async function sendMail({
  to, subject, text, html, attachments,
}) {
  const transport = await getTransport();
  const from = process.env.SMTP_FROM || 'AIRMS <no-reply@airms.local>';
  return transport.sendMail({
    from, to, subject, text, html, attachments,
  });
}

// Email-template builder for password reset OTP. Plain text only — the
// recipient reads the 6-digit code and enters it back on the reset screen
// in the SAME tab. This keeps the whole flow in one tab and eliminates the
// orphaned-tab UX issue that a link-based flow has.
function buildResetEmail({ code, expiresInMinutes, maxAttempts }) {
  const subject = 'AIRMS — Password Reset Code';
  const text = [
    'Password reset code',
    '',
    `Your AIRMS password reset code is:`,
    '',
    `    ${code}`,
    '',
    `Enter this code on the password reset screen in your browser to continue. The code expires in ${expiresInMinutes} minutes and is single-use. After ${maxAttempts} incorrect entries it is automatically invalidated, and you will need to request a new one.`,
    '',
    "If you did not request this reset, you can ignore this email — your current password is unchanged and the code will expire on its own. As a precaution, sign in to AIRMS normally and rotate your password from My Profile if you suspect any unauthorised activity.",
    '',
    '— AIRMS · Institut Sukan Negara',
  ].join('\n');

  return { subject, text };
}

// Email-template builder for an account INVITATION.
//
// Same one-time-code mechanism as the reset above, and deliberately so: one
// definition of what a code is means an invitation cannot end up weaker than a
// reset. What differs is what the recipient needs told, and it is a different
// situation in three ways.
//
// They did not ask for this, so the mail must say who did and why it exists —
// an unexplained six-digit code from an unfamiliar system reads as phishing,
// and a cautious clinician deleting it is the CORRECT response to a mail that
// fails to explain itself.
//
// They have no password to fall back on, so "ignore this if it wasn't you" is
// wrong advice here: ignoring it means never getting access.
//
// And the code lives for days rather than minutes, so the expiry is stated in
// days and the mail says plainly that it can be re-sent.
/**
 * The window, worded for a person rather than printed as a unit.
 *
 * The caller passes MINUTES because that is what the TTL is. Printing
 * `Math.round(minutes / 1440)` days gave "expires in 1 days" at the 24-hour
 * window and "0 days" at anything shorter — an email telling its reader the
 * code is already dead. Hours and minutes are pluralised too, since "1 hours"
 * is the same defect one step down.
 *
 * DAYS ONLY FROM TWO DAYS UP. A day is the correct unit for a week and the
 * wrong one for the window this actually uses: "expires in 1 day" reads as
 * "some time tomorrow", while "expires in 24 hours" is the same fact told
 * usefully to somebody deciding whether to deal with it now.
 */
function humaniseWindow(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return 'a short time';
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (m % (60 * 24) === 0 && m / (60 * 24) >= 2) return plural(m / (60 * 24), 'day');
  if (m % 60 === 0) return plural(m / 60, 'hour');
  return plural(m, 'minute');
}

function buildInviteEmail({ code, name, role, invitedBy, expiresInMinutes, maxAttempts, siteUrl }) {
  const subject = 'AIRMS — Your account is ready to activate';
  const who = invitedBy ? `${invitedBy} at Institut Sukan Negara` : 'Institut Sukan Negara';
  const text = [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    `${who} has created an AIRMS account for you${role ? ` as ${role}` : ''}.`,
    'AIRMS is the Athlete Injury Risk Management System used to read and act on',
    'HoloMotion screening results.',
    '',
    'Your activation code is:',
    '',
    `    ${code}`,
    '',
    siteUrl
      ? `To finish setting up, open ${siteUrl}/activate and enter your email address and this code. You will then choose your own password.`
      : 'To finish setting up, open the AIRMS activation page and enter your email address and this code. You will then choose your own password.',
    '',
    `Nobody at ISN knows or can see the password you choose — that is the point of this step. The code expires in ${humaniseWindow(expiresInMinutes)} and is single-use; after ${maxAttempts} incorrect entries it is invalidated.`,
    '',
    // The self-service remedy, stated in the email that creates the problem.
    // It is not a courtesy: the 24-hour window (§85) is only reasonable because
    // this path exists, and the invitee is the one person who cannot be told
    // about it later. Measured 2026-09-12 — forgot-password works on an
    // invited account that has never been activated.
    'If the code has expired by the time you read this, you do not need to ask anybody: use "Forgot password?" on the sign-in page and you will be emailed a fresh code straight away.',
    '',
    'If you were not expecting this, please contact the person named above before using it rather than ignoring it — an account has been created either way.',
    '',
    '— AIRMS · Institut Sukan Negara',
  ].join('\n');

  return { subject, text };
}

module.exports = {
  sendMail, buildResetEmail, buildInviteEmail, senderIdentity, humaniseWindow,
};
