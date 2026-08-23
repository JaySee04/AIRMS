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
function buildInviteEmail({ code, name, role, invitedBy, expiresInDays, maxAttempts, siteUrl }) {
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
    `Nobody at ISN knows or can see the password you choose — that is the point of this step. The code expires in ${expiresInDays} days and is single-use; after ${maxAttempts} incorrect entries it is invalidated and an administrator will need to send you a new one.`,
    '',
    'If you were not expecting this, please contact the person named above before using it rather than ignoring it — an account has been created either way.',
    '',
    '— AIRMS · Institut Sukan Negara',
  ].join('\n');

  return { subject, text };
}

module.exports = { sendMail, buildResetEmail, buildInviteEmail };
