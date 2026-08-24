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

### The database

It must be reachable from the public internet, so `localhost` is out. **Aiven's
free MySQL** is the recommendation, for one reason that outranks the size of the
free tier: it is *real* MySQL 8 on InnoDB, so engine-level foreign keys, the
`ENUM` columns and the `JSON` columns all behave exactly as they do locally.
MySQL-*compatible* engines are where a schema like this one quietly loses its
referential integrity.

Free tier: 1 GB storage, 1 GB RAM, 1 CPU, `max_connections` 76, backups
included, no credit card. The seeded database is a few megabytes, so storage is
not the constraint. Two caveats worth knowing before a stakeholder tries it:

- **Idle shutdown.** A free service with no continuous activity gets powered off
  after notification. Fine for a demo you drive; awkward for a link someone
  opens unannounced a fortnight later. If that bites, Railway is about $5/month
  with no idle policy.
- **One free service per type per organisation.**

Set up:

```
MYSQL_HOST=<service>.aivencloud.com
MYSQL_PORT=<the port Aiven shows — not 3306>
MYSQL_USER=avnadmin
MYSQL_PASSWORD=<from the console>
MYSQL_DATABASE=defaultdb
MYSQL_SSL=1
MYSQL_SSL_CA=<the ca.pem contents, newlines written as 
>
```

TLS is mandatory on every managed provider and off by default here, so a local
setup is unaffected. `MYSQL_SSL_CA` takes the certificate as inline PEM because
that is the only shape a platform environment variable can carry — there is no
filesystem to put a `.pem` on. Without a CA, verification stays ON against the
system trust store rather than silently downgrading; `MYSQL_SSL_INSECURE=1`
exists as an explicit, visible escape hatch.

Seed it once by pointing a local `backend/.env` at the hosted instance and
running `npm run seed`.

The connection pool caps at **2** under `VERCEL` rather than 5. Each serverless
instance holds its own pool against a single 76-connection ceiling: at 5 apiece
fifteen concurrent instances exhaust it, which a live demo can reach.
`MYSQL_POOL_MAX` overrides.

### Four things that bite, all found the hard way

The API and web app are live at `airms-api.vercel.app` and `airms-web.vercel.app`.
Getting there hit four faults, each hiding the next; they are recorded because
every one of them presents as the same opaque `FUNCTION_INVOCATION_FAILED`.

1. **The wrong branch.** Vercel tracks one branch for production, and a new
   project defaults to the repository's default branch. That was `main` — the
   pre-MySQL codebase — so the deployed API kept failing on a *MongoDB*
   connection error, for code nobody had touched in months. Check
   Settings → Environments → Production → Branch Tracking, and note that
   **Redeploy re-runs the same commit**: it cannot move a deployment onto a
   different branch.

2. **Root Directory versus where you deploy from.** With Root Directory set to
   `backend`, deploying *from* `backend/` makes Vercel look for `backend/backend`.
   Either deploy from the repository root with the setting in place, or clear the
   setting and deploy from the package directory. Deploying from the root fails
   on this machine for an unrelated reason — see gotcha 7 in `CLAUDE.md`, the
   OneDrive reparse points — so this repo uses the second option.

3. **Cron frequency is plan-gated.** Hobby accounts allow **daily** crons only;
   the hourly `0 * * * *` is rejected at deploy time. It is now `0 23 * * *`.
   This is survivable only because `isDue` asks whether the due moment has
   *passed* rather than matching an hour exactly, so a daily tick still sends on
   the right day — at worst later in it. A design that pinned the send to an
   exact hour would have needed rewriting for the platform.

4. **`mysql2` gets traced out of the bundle.** Sequelize resolves its dialect
   driver with a dynamic `require`, which static analysis cannot see, so the
   driver is omitted and every cold start dies with *"Please install mysql2
   package manually"* — at module scope, before any route runs. `config/db.js`
   now requires it explicitly and passes it as `dialectModule`.

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

## Keeping the free-tier database awake

Aiven's free tier powers a service off when it sees no activity. Two things break
when it does: the site returns `503 Database unavailable` to anyone who opens the
link, and the nightly mail tick finds no database — so the monthly digest and the
rescreen recall silently never send, because the marker is only consumed after a
successful send and the retry meets the same sleeping database tomorrow.

Paying for the $5/month tier disables the power-off and is the simplest fix. The
free one is to give the database some activity:

`GET /api/health` is unauthenticated, runs `SELECT 1` and returns
`{ok:true,db:"up"}` — or **503** with `db:"down"` when the pool cannot reach the
server, so a monitor reads a sleeping database as down rather than as healthy.
It reveals nothing about anybody, which is what makes it safe to call from
outside.

Point a free uptime pinger at it every 15 minutes:

```
https://airms-api.vercel.app/api/health
```

[cron-job.org](https://cron-job.org) and UptimeRobot both do this on a free plan
with no card. Fifteen minutes is comfortably inside the idle window and costs
about 2,900 requests a month, which is nothing against Vercel's Hobby limits.

Two things this does NOT do. It will not resurrect a database that has already
been powered off — that still needs **Power on** in the Aiven console, and the
pinger keeps it awake from then on. And it does not remove the power-off policy,
so if the pinger is ever paused or its free plan lapses, the idle clock starts
again.

## Not covered here

Where the app itself runs, how MySQL is hosted, TLS, and backups are ISN's
decisions and are not made in this repo. This file covers only the schedule,
which is the part that was tied to a developer's laptop.
