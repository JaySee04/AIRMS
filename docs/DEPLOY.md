# Running AIRMS's scheduled mail

AIRMS owes two emails a month:

| | Goes to | Setting |
|---|---|---|
| **Institute digest** — roster, band mix, activity, with the holistic PDF attached | admin + executive | `digest_enabled`, `digest_day`, `digest_hour` |
| **Rescreen recall** — who is overdue, who has never been screened | admin + medical, plus one email per coached sport | `rescreen_reminder_enabled`, `rescreen_reminder_day`, `rescreen_reminder_hour` |

Neither is triggered by anyone opening a page. Something has to **tick**: ask the
database "is either of these owed right now?" and act. This file is about where
that tick comes from.

## The tick

`backend/src/mailTick.js` runs exactly one pass and exits.

```bash
cd backend
npm run mail:tick
```

It reads the same settings, sends the same mail and writes the same outcome as
the in-process scheduler, because it calls the identical `tick()` — one
definition, so a deployment cannot end up sending the digest and silently never
sending the reminder.

Exit codes, which an OS scheduler records:

| Code | Meaning |
|---|---|
| `0` | nothing was owed, or something was sent successfully |
| `1` | an attempt failed — the month is **not** marked, so the next tick retries |
| `2` | the database was unreachable |

## Where the tick comes from

### Development — nothing to do

`npm run dev` starts an in-process ticker: once ~30 seconds after boot (to catch
a month that fell due while the machine was off) and hourly after that. This is
the default and needs no configuration.

Its limitation is the reason the rest of this file exists: it ties a **monthly
obligation to the uptime of a web server**. The marker design means a process
that is down when the mail falls due sends *late* rather than never — but "late"
means "whenever the backend next runs", which on a workstation means "whenever
somebody opens the project".

### A workstation that must actually send — Windows Task Scheduler

```powershell
cd backend\scripts
./install-mail-task.ps1              # register, hourly, this user
./install-mail-task.ps1 -ShowWindow  # ...but with a visible console, for debugging
./install-mail-task.ps1 -Uninstall   # remove completely
```

Per-user: no elevation, no SYSTEM account, nothing outside this user's own task
list. `-StartWhenAvailable` is set, so a machine asleep when the digest fell due
runs the missed tick on wake rather than skipping the month. It runs only while
that user is logged on — fine for a demo machine, wrong for an institution.

**No window.** A task action runs in the logged-on user's own session, so
pointing it at `node.exe` opens a console once an hour: a blank terminal that
appears, works for a second and vanishes — which on a workstation is
indistinguishable from something having gone wrong, and which people close.
The action therefore runs `scripts/run-hidden.vbs` (wscript has no console of
its own) with the window style set to hidden. It still **waits** for node, so
`-ExecutionTimeLimit` and `-MultipleInstances IgnoreNew` keep working, and it
exits with node's own code, so the 0 / 1 / 2 below still reach
`LastTaskResult`. `-ShowWindow` registers the direct, visible form instead.

Check it:

```powershell
Get-ScheduledTask -TaskName 'AIRMS mail tick' | Get-ScheduledTaskInfo
Start-ScheduledTask -TaskName 'AIRMS mail tick'     # run one now
```

### An institutional deployment — cron

```cron
# /etc/cron.d/airms-mail   —   hourly; the day/hour settings decide when it sends
0 * * * *  airms  cd /srv/airms/backend && /usr/bin/node src/mailTick.js >> /var/log/airms-mail.log 2>&1
```

Set `MAIL_SCHEDULER=off` in the backend's environment so the web process stops
ticking as well:

```
MAIL_SCHEDULER=off
```

Default is **on**, deliberately: the failure mode of a default-off switch is
silence, which is the one failure this whole feature exists to prevent.

## Running two tickers is safe

Both sends run under a cross-process lock (`backend/src/utils/lock.js`), so an OS
task and a dev server ticking at the same instant produce **one** email, not two.
Verified with six simultaneous ticks: one sent, five blocked, lock released.

That property used to be asserted in a comment and was not true — the month
marker is written only *after* a successful send, so two processes both read it
unset and both sent. Running one ticker is still tidier; running two is no longer
wrong.

## When something does not arrive

1. **Admin → Settings → Email Notifications.** Each tile shows the outcome of the
   last attempt, in red if it failed. This is the first place to look — a failed
   send otherwise leaves no trace anywhere a person goes.
2. **Send now**, on the same tile, runs the mail immediately and reports what
   happened. It skips the schedule, never the institution's on/off switch.
3. **Admin → Activity Log**, filtered to `mail.send`, records every manual send
   and who pressed it — including the ones that sent nothing, and why.
4. The task's own history: `LastTaskResult` (Windows) or the cron log.

Common causes, in the order they actually occur: the notification is switched off
above the tile; every eligible account has opted out on their own profile page;
`SMTP_*` is unset, so the mailer is in console-fallback mode and printed the mail
to the backend terminal instead; the month is already marked as delivered.

## Vercel

Both halves deploy to Vercel as **two projects from one repository**, because
they build differently and scale differently.

| Project | Root directory | Framework |
|---|---|---|
| `airms-web` | `frontend` | Next.js (auto-detected) |
| `airms-api` | `backend` | Other — `backend/vercel.json` drives it |

The API is not rewritten for serverless. `api/index.js` imports the same Express
app `npm start` runs and hands it the request; `src/server.js` exports the app
and only calls `listen()` when it is the program (`require.main === module`), the
same guard `utils/seeder.js` has carried since 2026-08-19. A route added to the
app is therefore live in both, and the two cannot describe different APIs.

### Environment

On `airms-api`: every variable from `backend/.env` (`JWT_SECRET`, the `MYSQL_*`
block, `SMTP_*`, `VISION_*`) plus:

```
FRONTEND_URL=https://<your-web-project>.vercel.app   # the CORS allowlist
CRON_SECRET=<a long random string>                   # guards the cron route
MAIL_SCHEDULER=off                                   # Vercel Cron drives it instead
```

On `airms-web`:

```
NEXT_PUBLIC_API_URL=https://<your-api-project>.vercel.app/api
```

The database must be reachable from the public internet — a managed MySQL
(Aiven, TiDB Cloud, Railway) rather than `localhost`. Seed it once by pointing a
local `backend/.env` at the hosted instance and running `npm run seed`.

### Scheduled mail

`setInterval` cannot work here: the function is frozen between invocations, so
the in-process ticker never fires. `vercel.json` registers an hourly cron
against `/api/cron/mail-tick`, which runs the **same** `tick()` the CLI and the
in-process ticker run. The month markers and the cross-process lock are
unchanged, so a missed run still sends late rather than never, and an
overlapping invocation still produces one email.

Set `MAIL_SCHEDULER=off` so the app does not also try to tick.

### What is different once it is hosted

Two things change materially, and neither is a bug to fix later.

**Uploads are capped at 4.5 MB.** That is a platform limit on the request body,
below the 20 MB the app allows. Typical HoloMotion exports are ~1 MB and are
unaffected — the sample compact report is 1.02 MB — but the expanded 38-page
layout in `backend/scripts/samples/nazwan.pdf` is **7.58 MB** and will be
rejected before it reaches the handler. Generated reports are unaffected in the
other direction: the largest measured is 0.05 MB.

**"On-device redaction" becomes "pre-provider redaction".** The privacy property
the system is designed around is that the athlete's name never leaves the
operator's machine (`utils/redactName.js`, `DESIGN_DECISIONS §18`). On a hosted
deployment the browser uploads the **un-redacted** PDF to the API first, and
redaction happens there. The name still never reaches the vision provider, which
is the disclosure the design was chiefly guarding against — but it does now
traverse and briefly reside on a third-party host. Say it that way in the report
and the viva; the on-device claim is true of the local deployment ISN would run,
not of a public test instance.

Other consequences worth knowing: rate limiting is per-instance because
`express-rate-limit` keeps its counters in memory, so limits are looser than
they look under load; and Tesseract re-downloads its ~15 MB English model on
each cold start, into the platform temp directory
(`TESSERACT_CACHE_PATH` overrides it), which makes the first import after an
idle period noticeably slower than the rest.

## Not covered here

Where the app itself runs, how MySQL is hosted, TLS, and backups are ISN's
decisions and are not made in this repo. This file covers only the schedule,
which is the part that was tied to a developer's laptop.
