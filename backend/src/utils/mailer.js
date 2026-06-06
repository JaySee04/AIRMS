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

let transporterPromise = null;

function buildTransport() {
  if (!process.env.SMTP_HOST) {
    return {
      isConsole: true,
      sendMail: async (msg) => {
        console.log('────────────────────────────────────────────────────────────');
        console.log('📧 [DEV mailer] No SMTP_HOST configured — printing to console:');
        console.log('From:    ', msg.from);
        console.log('To:      ', msg.to);
        console.log('Subject: ', msg.subject);
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

async function sendMail({ to, subject, text, html }) {
  const transport = await getTransport();
  const from = process.env.SMTP_FROM || 'AIRMS <no-reply@airms.local>';
  return transport.sendMail({ from, to, subject, text, html });
}

// Email-template builder for password reset. The HTML uses inline styles so
// it renders consistently across mail clients (Gmail strips <style> blocks).
function buildResetEmail({ name, resetUrl, expiresInMinutes }) {
  const subject = 'AIRMS — Password Reset Request';
  const text = [
    `Hi ${name || 'there'},`,
    '',
    'We received a request to reset the password on your AIRMS account.',
    `Use the link below within the next ${expiresInMinutes} minutes:`,
    '',
    resetUrl,
    '',
    "If you didn't request this, you can safely ignore this email — your password will remain unchanged.",
    '',
    '— AIRMS · Institut Sukan Negara',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;background:#f1f3f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1a1d2e">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0">
    <tr><td align="center">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(20,30,70,0.08);overflow:hidden">
        <tr><td style="background:#0f2c4a;padding:24px 32px;color:#fff">
          <div style="font-size:20px;font-weight:700;letter-spacing:0.04em">AIRMS</div>
          <div style="font-size:12px;color:#f5c518;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">Sports Health</div>
        </td></tr>
        <tr><td style="padding:32px">
          <h1 style="font-size:20px;margin:0 0 12px">Password reset request</h1>
          <p style="font-size:14px;line-height:1.6;color:#2c3142">Hi ${name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;color:#2c3142">We received a request to reset the password on your AIRMS account. Use the button below within the next <strong>${expiresInMinutes} minutes</strong>:</p>
          <p style="text-align:center;margin:28px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#0f2c4a;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:14px">Reset Password</a>
          </p>
          <p style="font-size:12px;color:#6b7280;line-height:1.6">If the button doesn't work, copy and paste this URL into your browser:</p>
          <p style="font-size:12px;color:#3373c4;word-break:break-all"><a href="${resetUrl}" style="color:#3373c4">${resetUrl}</a></p>
          <hr style="border:none;border-top:1px solid #e7eaf2;margin:24px 0">
          <p style="font-size:12px;color:#6b7280;line-height:1.6">If you didn't request this, you can safely ignore this email — your password will remain unchanged.</p>
          <p style="font-size:11px;color:#9aa3b2;margin-top:24px">— AIRMS · Institut Sukan Negara</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

module.exports = { sendMail, buildResetEmail };
