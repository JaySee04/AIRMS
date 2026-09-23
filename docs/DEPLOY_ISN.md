# Deploying AIRMS on an ISN server

For installing AIRMS on hardware ISN controls, rather than on Vercel.
[`DEPLOY.md`](DEPLOY.md) covers the Vercel deployment and stays the reference
for that; this is the self-hosted path and the two differ in ways that matter.

**Everything here was run on 2026-09-22 except the parts marked NOT VERIFIED,
which say so because nobody has yet run AIRMS on a machine that is not this
one.** Treat those as the list of things to discover during the first install,
not as steps known to work.

---

## Why self-hosting is the better fit

Four limitations recorded against the hosted deployment are **properties of
Vercel, not of AIRMS**, and they disappear here.

| | Vercel | ISN server |
|---|---|---|
| Upload size | 4.5 MB — **rejects 19 of 24 real reports** | app's own 20 MB — **rejects none** (largest measured 13.2 MB) |
| Where the PDF goes | browser → third-party host → (maybe) vision provider | browser → ISN server. With no vision key, **it never leaves the institution** |
| Scheduled email | Hobby plans refuse sub-daily cron | ordinary OS scheduler |
| Post-response work | deferred until the next request thaws the instance (`SILENT_FAILURES.md` 3r) | a long-lived process; does not arise |

The redaction point is worth stating plainly because the honest version is
currently written down as a weakness: hosted, "on-device redaction" degrades to
"pre-provider redaction" — the un-redacted PDF traverses a third-party host. On
an ISN server reading reports from their text layer, **no part of the report
leaves ISN at all.**

---

## What you need

- **Node 22.x.** Pinned by `engines` in all three `package.json` files (`>=22`).
  Node 23+ is untested here.
- **MySQL 8.x.** Local or on the ISN network.
- **Two ports.** 5000 for the API and 3000 for the web app by default. They can
  sit behind one reverse proxy — see *Two origins, always* below.
- **Optional: a vision provider API key.** Since 2026-09-22 it is genuinely
  optional (`DESIGN_DECISIONS.md` §112). Without one, reports in the expanded
  28- and 38-page layouts import exactly, with no network call; the compact
  12-page layout is refused per file, and HoloMotion's written Summary is not
  captured. **Ask ISN which layout their HoloMotion produces before deciding.**
- **Optional: an SMTP relay.** Without it, invitations and scheduled reports do
  not send. The first administrator can still be created — see below.

---

## 1. Database

Create the database and a user that is not `root`. AIRMS connecting as `root` is
an open item on the hosted install (`SECURITY.md`, DD §97) and there is no
reason to repeat it on a fresh one:

```sql
CREATE DATABASE airms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'airms'@'localhost' IDENTIFIED BY 'a-long-random-password';
GRANT SELECT, INSERT, UPDATE, DELETE ON airms.* TO 'airms'@'localhost';
```

**Add `CREATE, ALTER, INDEX, REFERENCES` temporarily** for the schema build in
step 3, then revoke them. The application never issues DDL after that.

---

## 2. Configuration

`backend/.env`:

```
NODE_ENV=production
PORT=5000
JWT_SECRET=<64+ random characters — the process EXITS if this is unset>
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://airms.isn.gov.my

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=airms
MYSQL_PASSWORD='...'
MYSQL_DATABASE=airms

# Leave the SMTP block blank until ISN provides a relay. Blank means the mailer
# prints emails to the server log instead of sending — useful for the first
# install, and NOT acceptable once real clinicians are invited.
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM='AIRMS <injriskdashboard@isn.gov.my>'

# Leave blank unless ISN produces the compact 12-page layout.
VISION_API_KEY=
```

`frontend/.env.local`:

```
NEXT_PUBLIC_API_URL=https://airms-api.isn.gov.my/api
```

### Two origins, always

Three values have to agree or the app breaks in a way that looks like something
else:

- `FRONTEND_URL` (backend) is the **CORS allow-list**. If it does not name the
  web origin exactly, every page renders its shell with empty panels.
- `NEXT_PUBLIC_API_URL` (frontend) is where the browser calls **and** what the
  Content-Security-Policy's `connect-src` is derived from. Wrong here and the
  browser blocks the calls — which looks identical to the CORS failure.
- Both are **baked into the frontend at build time.** Changing
  `NEXT_PUBLIC_API_URL` requires a rebuild, not a restart.

> If dashboards render but every panel is empty, check these two before
> suspecting the CSP. That confusion is documented in CLAUDE.md and it has cost
> real time.

Serving both from one hostname on different paths is **NOT VERIFIED** — every
test run to date has used two origins.

---

## 3. Install and build

```powershell
npm run install:all
npm run sync:shared            # regenerates the shared facts into both packages
cd frontend; npm run build
```

Create the schema **once**, from the models:

```powershell
cd backend
$env:SQL_SYNC=1; npm start     # wait for "connected", then Ctrl-C
```

Then unset `SQL_SYNC` permanently. It is off by default for a reason — you do
not want a process altering the schema on every boot.

> **Do NOT run `npm run seed` on a real installation.** It drops the database
> and inserts ~60 fabricated athletes, demo screenings, and five accounts whose
> password is published in this repository's documentation. It is for
> development and demos only.

---

## 4. The first administrator

AIRMS has no self-registration by design: an administrator creates every
account, and the invitee sets the first password that ever exists on it. On a
fresh database there is no administrator, and `npm run seed` was the only thing
that could make one — which is why step 3 forbids it.

```powershell
cd backend
npm run bootstrap:admin -- --email "thung@isn.gov.my" --name "Dr Thung"
```

It prints a six-digit activation code. Go to `<FRONTEND_URL>/activate`, enter
the email and code, and choose a password.

- **No password is set by the script.** A random one is hashed and discarded
  unread, so whoever runs it cannot sign in as the administrator they created.
- **The code is printed, not emailed**, because a fresh install often has no
  SMTP yet — and an invitation that silently fails to send, for the one account
  that creates all the others, locks the institution out.
- **It refuses on a populated database.** A script that could mint an
  administrator on a live system would undo the whole access model.
- Valid 24 hours, single use, 5 attempts. If it expires, the ordinary
  "Forgot password" flow works on the account — provided SMTP is configured.

Everyone else is invited from **Admin → Personnel** (staff) or from the
**roster** (athletes), which records who invited whom in the audit trail.

---

## 5. Run it

```powershell
cd backend;  npm start          # API   :5000
cd frontend; npm start          # web   :3000  (after npm run build)
```

Both need a process manager so they restart on reboot and on crash. On Windows,
a scheduled task at startup or NSSM; on Linux, systemd units. **NOT VERIFIED** —
no unit files or service definitions ship with the project, and writing them is
part of the first install.

### Scheduled email

The backend runs an hourly in-process ticker by default, which is enough. To
drive it from the OS instead, set `MAIL_SCHEDULER=off` and schedule:

```powershell
cd backend; npm run mail:tick   # one pass, then exits
```

On Windows, `backend/scripts/install-mail-task.ps1` registers it hourly.
Running both is wasteful but safe — the sends take a cross-process lock.

---

## 6. Verify the install

In this order. Each answers a different question, and the first two need the
servers running:

```powershell
cd backend; npm run verify:schema     # does the database match the models?
cd backend; npm run verify:claims     # do the operational claims hold here?
cd backend; npm run audit:access      # call all 66 endpoints as every role
cd frontend; npm run e2e              # 110 checks in a real browser
```

`verify:schema` section 4 must report `none`. It asks `information_schema`
directly, which is the only thing that proves the schema is right — an endpoint
answering 200 does not, and believing otherwise broke the hosted API for six
days (`SILENT_FAILURES.md` 3z).

Then import one real HoloMotion report end to end and check the values against
the printed PDF. Nothing else substitutes for that.

---

## Known gaps for the first install

Honest list, because discovering these on the day is worse than reading them
now.

1. **No process-manager configuration ships.** Step 5 is the least-tested part
   of this document.
2. **Backups are not covered.** `GET /api/export/backup.xlsx` exports data for
   an administrator; it is not a database backup strategy. ISN's own MySQL
   backup policy should cover the `airms` database.
3. **TLS is assumed to terminate at a reverse proxy.** AIRMS speaks plain HTTP
   and has no certificate handling. Serving it without TLS would put IC numbers
   and clinical notes on the wire in clear.
4. **The vision throttle may bite during bulk onboarding.** The preview endpoint
   is capped at 60/hour per user — written when every call drew third-party
   quota, which most no longer do. Importing a large squad in one sitting will
   hit it. Raising it is a configuration decision, not a code change.
5. **Layout assumptions are current-version.** The text-layer reader is built on
   the layouts ISN produces today. A HoloMotion update that moves the data is
   handled safely — the report falls back to vision rather than storing nulls
   (§112) — but without a vision key that fallback is a refusal, not a rescue.
6. ~~**`npm run seed` must never be run against the production database.** There
   is no guard preventing it.~~ **Closed 2026-09-22.** The seeder now refuses on
   two independent signals — `NODE_ENV=production`, and a database holding user
   accounts that are not the demo ones — and prints the target it was pointed
   at. `--force` overrides both and has to be typed. Verified in all four
   directions: refused on `NODE_ENV=production`, refused against a database
   holding one real account, allowed on the demo database (11 users, 5 of them
   seeded), and `--force` seeded normally. Still worth knowing the command is
   destructive; it is simply no longer silent about it.
