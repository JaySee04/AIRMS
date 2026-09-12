// WHO AIRMS'S MAIL APPEARS TO COME FROM, and whether an administrator is told.
//
// The limitation was documented from the day the invitation flow shipped:
// invitations send from a personal Gmail, and to a clinician that reads as
// phishing. Real use needs ISN's relay or a controlled domain with SPF/DKIM.
//
// It stayed a doc entry for three weeks, and the reason is instructive: it is
// CONFIGURATION rather than code. No test fails, no build breaks, no page
// renders wrong. The first person to notice is the invitee, and the correct
// response to an unexplained six-digit code from a gmail.com address is to
// delete it — so the failure is an account that is never activated and a
// clinician who never says why.
//
// `senderIdentity()` puts the fact on the admin Settings payload, and this pins
// the three things about it that could quietly stop being true.
const { senderIdentity } = require('../src/utils/mailer');

const ENV_KEYS = ['SMTP_HOST', 'SMTP_FROM', 'MAILER_DRY_RUN'];

function withEnv(over, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => { delete process.env[k]; });
  Object.entries(over).forEach(([k, v]) => { process.env[k] = v; });
  try { return fn(); } finally {
    ENV_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    });
  }
}

describe('the sending identity AIRMS reports to its administrator', () => {
  it('flags a consumer mailbox, which is what ships today', () => {
    const id = withEnv(
      { SMTP_HOST: 'smtp.gmail.com', SMTP_FROM: 'AIRMS <poseidonapollo11@gmail.com>' },
      senderIdentity,
    );
    expect(id.domain).toBe('gmail.com');
    expect(id.delivering).toBe(true);
    expect(id.concern).toMatch(/personal gmail\.com mailbox/i);
    // The reason, not just the fact — an administrator who cannot see WHY will
    // read it as pedantry and dismiss it.
    expect(id.concern).toMatch(/phishing/i);
    expect(id.concern).toMatch(/SPF and DKIM/);
  });

  it('says nothing when the domain is the institution\'s own', () => {
    const id = withEnv(
      { SMTP_HOST: 'smtp.isn.gov.my', SMTP_FROM: 'AIRMS <no-reply@isn.gov.my>' },
      senderIdentity,
    );
    expect(id.domain).toBe('isn.gov.my');
    expect(id.delivering).toBe(true);
    // Null rather than a reassuring green note. A tile that is always present
    // is a tile nobody reads — the same rule `auditHealth` follows on the same
    // payload.
    expect(id.concern).toBeNull();
  });

  it('reports the two NOT-DELIVERING modes as distinct from each other', () => {
    // These matter separately: no SMTP host is the developer's default and
    // expected, while MAILER_DRY_RUN left on by accident is a configured
    // instance that silently delivers nothing — the failure the whole
    // scheduled-mail observability work (§35) exists to prevent.
    const unset = withEnv({ SMTP_FROM: 'AIRMS <x@isn.gov.my>' }, senderIdentity);
    expect(unset.delivering).toBe(false);
    expect(unset.concern).toMatch(/No SMTP host is configured/);

    const dry = withEnv(
      { SMTP_HOST: 'smtp.isn.gov.my', SMTP_FROM: 'AIRMS <x@isn.gov.my>', MAILER_DRY_RUN: 'true' },
      senderIdentity,
    );
    expect(dry.delivering).toBe(false);
    expect(dry.concern).toMatch(/MAILER_DRY_RUN/);
    expect(dry.concern).not.toBe(unset.concern);
  });

  it('reads the address out of either From shape, and survives neither', () => {
    // `SMTP_FROM` is free text in .env. A bare address is as likely as the
    // display-name form, and a malformed one must not make this throw on a
    // payload the Settings page needs in order to render at all.
    const bare = withEnv(
      { SMTP_HOST: 'h', SMTP_FROM: 'someone@gmail.com' }, senderIdentity,
    );
    expect(bare.domain).toBe('gmail.com');
    expect(bare.concern).toMatch(/phishing/i);

    const messy = withEnv({ SMTP_HOST: 'h', SMTP_FROM: 'not an address' }, senderIdentity);
    expect(messy.concern).toBeNull(); // unknown domain: no claim either way
    expect(() => withEnv({ SMTP_HOST: 'h', SMTP_FROM: '' }, senderIdentity)).not.toThrow();

    // Case-insensitive, because .env is hand-edited.
    const shouty = withEnv(
      { SMTP_HOST: 'h', SMTP_FROM: 'AIRMS <Someone@GMAIL.com>' }, senderIdentity,
    );
    expect(shouty.domain).toBe('gmail.com');
    expect(shouty.concern).toMatch(/phishing/i);
  });

  it('is on the admin settings payload, not just available', () => {
    // The whole point is that it reaches a screen. This is the §70 failure in
    // miniature — a fact the system held and never showed — and `auditHealth`
    // on this very payload was the proof it can happen: delivered by the API
    // for weeks and read by no page.
    const fs = require('fs');
    const path = require('path');
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'routes', 'cohorts.js'), 'utf8',
    );
    expect(route).toMatch(/mailSender: senderIdentity\(\)/);

    const page = fs.readFileSync(
      path.join(__dirname, '..', '..', 'frontend', 'src', 'app', 'admin', 'settings', 'page.tsx'),
      'utf8',
    );
    expect(page).toMatch(/mailSender\?\.concern/);
    expect(page).toMatch(/auditHealth\?\.count/);
  });
});
