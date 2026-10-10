# What to ask at ISN

Take this with you. Deployment is **not** blocked on code — the install bundle
is generated and the runbook is written (`deploy/out/INSTALL.md`). It is blocked
on answers only ISN can give.

Ordered by lead time: **the first three are slow**, so ask them first even if
the conversation goes somewhere else. The rest can be settled on the day.

---

## A · Dr Thung — decisions, not technical

1. **Is anyone's approval needed to put athlete health data on an ISN system?**
   Names, IC numbers, screening scores, clinician notes. Some institutions need
   a data-protection review, a named data owner, or a form. *Ask this first —
   if the answer is yes it runs in parallel with everything else; if no, you
   have lost nothing.*
2. **Who owns the system after handover?** Who gets the administrator account,
   who adds staff, who is called when it stops. Currently the design assumes
   that is you.
3. **How long should screening data be kept?** It is never deleted today. If
   ISN has a retention period, say so now rather than retrofitting it.
4. **Is this a pilot or production?** Changes how much the gaps below matter.

## B · ISN IT — the slow ones

5. **A Linux host.** Ubuntu/Debian preferred, sudo access, MySQL 8 installed or
   installable. A VM is fine; it is a small application.
6. **Two hostnames** — one for the web app, one for the API. *They must be
   different names* (e.g. `airms.isn.gov.my` and `airms-api.isn.gov.my`). The
   API address is compiled into the frontend, so changing it later means a
   rebuild, not a config edit.
7. **Is the server reachable from outside ISN, or internal only?** This decides
   the certificate question below, and whether staff can use it from home.
8. **SMTP — ask for the EASY option first:**
   > *"Does ISN have an internal SMTP relay the server can send through? If so,
   > the host and port — and can this server's IP be allowed to relay as
   > `injriskdashboard@isn.gov.my`?"*
   An IP allowlist on an internal relay is usually a far lower bar than issuing
   an application its own mailbox and password. **If they say no**, then ask for
   a mailbox: host, port, username, password, and the From address — and expect
   it to take longer.
   **Why this matters more than it sounds:** AIRMS has no self-registration by
   design. Accounts are created by invitation and the invitation carries a
   one-time code. No mail means nobody but the first administrator can sign in.
9. **TLS certificates.** If the host is internet-facing, Let's Encrypt handles
   it and you need nothing. **If it is internal only, Let's Encrypt cannot
   work** — no public DNS — so you need a certificate from ISN's internal CA.
   That is usually a separate request to a different team, so ask in the same
   conversation.
10. **Database backups.** ISN almost certainly has a MySQL backup policy. Ask
    what it is and whether the `airms` schema can be added to it. AIRMS ships a
    nightly dump (`deploy/airms-backup.*`) but an on-box backup does not survive
    the event most backups exist for.

## C · On the day — quick

11. Where should the application live? (default `/opt/airms`)
12. Can a system user `airms` be created?
13. Is there a reverse proxy already (nginx/Apache), or do we install one?
14. Outbound internet from the server — yes or no? Only matters if ISN uses the
    **compact 12-page** HoloMotion export, which needs an AI provider. The
    expanded report is read locally and needs nothing.
15. Roughly how many athletes and staff accounts in year one?

---

## Things to tell them, unprompted

Say these before they are found. All are measured, not estimated.

- **AIRMS does not predict injury.** It ranks who to look at next against their
  own peer group. No surface says "safe", "cleared" or "fit to play".
- **A clinician can always override the band**, with a note, and the override is
  audited.
- **Opening an athlete's record is logged** (`athlete.view`). That is the trade
  for medical staff being unscoped across sports.
- **The athlete's name is blacked out on-device** before any page reaches an AI
  provider — and on the expanded report layout, no page is sent at all.
- **One known accessibility gap:** 63 of 87 body-map regions are below the WCAG
  2.2 minimum touch-target size. Every finding is also listed in words beside
  the figure, so nothing is reachable only by hitting a small target.
- **The server configuration has never been run on a real machine.** Budget an
  hour for first-boot surprises rather than ten minutes.

## What you do NOT need to ask for

Already built, so do not let these turn into requests:

- TLS config, systemd services, the database user, nightly backups — all in
  `deploy/`, generated with your values by `sh deploy/configure.sh`.
- A way to create the first administrator on an empty database —
  `npm run bootstrap:admin`. It sets no password; the owner sets their own.
- Anything about the demo data. **`npm run seed` must never be run at ISN.**
