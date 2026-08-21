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

## Not covered here

Where the app itself runs, how MySQL is hosted, TLS, and backups are ISN's
decisions and are not made in this repo. This file covers only the schedule,
which is the part that was tied to a developer's laptop.
