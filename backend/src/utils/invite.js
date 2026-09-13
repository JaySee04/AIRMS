// What an invitation IS, in one place.
//
// Extracted from routes/users.js on 2026-09-13, when athletes gained their own
// invitation path (POST /athletes/:id/invite). Two routes minting invitations
// from two copies of this logic is how one of them ends up with a longer TTL, a
// reset attempt counter it forgot to clear, or a password the administrator can
// read — the same failure shape that put the one-time code itself into
// utils/resetCodes.js, and the band vocabulary into utils/bands.js.
//
// The account is created with a random password that is hashed on save and
// discarded unread. That is the whole point of the flow: an invited account
// must be unusable until its owner chooses a credential, and the administrator
// who created it must not be able to sign in as that person.
const crypto = require('crypto');
const { sendMail, buildInviteEmail } = require('./mailer');
const { issueCode, INVITE_CODE_TTL_MIN, RESET_CODE_MAX_ATTEMPTS } = require('./resetCodes');

// The site an invitation points at. Env rather than derived from the request:
// the invitee's link must go to the web app, and the API is on a different
// origin — deriving it from Host would send people to the API domain, where
// there is no activation page.
const siteUrl = () => (process.env.FRONTEND_URL || '').split(',')[0].trim() || null;

/** A password nobody ever sees. Used at create time and never returned. */
const unusablePassword = () => crypto.randomBytes(32).toString('hex');

// How a role is described to the person receiving the invitation. `medical`
// is the only one whose internal name reads oddly in a sentence addressed to a
// human ("has created an account for you as medical").
const ROLE_WORDING = { medical: 'medical staff' };

/**
 * Send (or re-send) an invitation. Mutates and SAVES the user.
 *
 * `creating: true` replaces the password with a fresh unusable one — used when
 * the account is being minted, so the value written by the caller to satisfy
 * the NOT NULL column never survives as a working credential.
 */
async function sendInvite(user, req, { creating = false } = {}) {
  if (creating) user.password = unusablePassword();
  const code = issueCode(user, { ttlMinutes: INVITE_CODE_TTL_MIN });
  user.invitedAt = new Date();
  await user.save();

  const mail = buildInviteEmail({
    code,
    name: user.name,
    role: ROLE_WORDING[user.role] || user.role,
    invitedBy: req.user?.name || null,
    // Minutes, and the mailer words them. It was `expiresInDays:
    // Math.round(TTL / 1440)`, which with the 24-hour window (§85) prints
    // "expires in 1 days" — and would print "expires in 0 days" for anything
    // shorter, i.e. an email telling the reader their code is already dead.
    expiresInMinutes: INVITE_CODE_TTL_MIN,
    maxAttempts: RESET_CODE_MAX_ATTEMPTS,
    siteUrl: siteUrl(),
  });
  // Awaited, unlike the reset mail: an administrator pressing "invite" needs to
  // know whether it actually went. A reset can be fire-and-forget because the
  // user is present and will simply ask again; nobody is watching an invitation
  // fail.
  await sendMail({ to: user.email, ...mail });
  return code;
}

/**
 * Whether an account can still be invited.
 *
 * The invitation mail says an account has just been created and asks the reader
 * to finish setting it up, which is false for somebody who joined weeks ago —
 * and re-issuing overwrites `invitedAt`, leaving a record in which the
 * invitation postdates the activation.
 *
 * `lastLoginAt` is checked alongside `activatedAt` because a seeded account
 * somebody signs into daily has never been "activated" and would otherwise
 * still be offered an invitation.
 *
 * Returns null when invitable, or the reason it is not.
 */
function inviteBlockedReason(user) {
  if (!user.isActive) return 'That account is deactivated. Reactivate it before inviting.';
  if (user.activatedAt || user.lastLoginAt) {
    return 'That account is already in use. They can reset their own password from "Forgot password?" on the sign-in page.';
  }
  return null;
}

module.exports = {
  sendInvite, inviteBlockedReason, unusablePassword, siteUrl, ROLE_WORDING,
};
