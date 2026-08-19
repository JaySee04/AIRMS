<#
.SYNOPSIS
  Register (or remove) a Windows scheduled task that ticks AIRMS's scheduled mail.

.DESCRIPTION
  AIRMS owes two emails a month: the institute digest and the rescreen recall.
  Both were driven by a setInterval inside the Express process, which ties a
  monthly obligation to the uptime of a web server - on a workstation that means
  "whenever somebody opens the project".

  This registers a per-user Task Scheduler entry that runs `src/mailTick.js`
  once an hour, independently of whether the backend is running. The tick asks
  the database whether either mail is owed and exits; ~730 times a month it does
  nothing, which costs about a second of CPU each time.

  PER-USER, ON PURPOSE. No elevation, no SYSTEM account, nothing outside this
  user's own task list, and `-Uninstall` removes it completely. It runs only
  while this user is logged on - correct for a workstation demo, and the wrong
  shape for the institution, which should run the Linux cron line in DEPLOY.md
  against an always-on host.

  Safe to run alongside `npm run dev`: both sends take a cross-process lock
  (src/utils/lock.js), so a duplicate tick is wasteful rather than wrong. In a
  real deployment set MAIL_SCHEDULER=off so only one of them ticks at all.

.PARAMETER Uninstall
  Remove the task instead of creating it.

.PARAMETER TaskName
  Override the task name (default: AIRMS mail tick).

.EXAMPLE
  ./install-mail-task.ps1
  ./install-mail-task.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [switch]$Uninstall,
  [string]$TaskName = 'AIRMS mail tick'
)

$ErrorActionPreference = 'Stop'

# backend/ - resolved from this script's own location so the task keeps working
# regardless of where it was invoked from.
$BackendDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Script     = Join-Path $BackendDir 'src\mailTick.js'

if ($Uninstall) {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($null -eq $existing) {
    Write-Host "No task named '$TaskName' - nothing to remove."
    return
  }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'."
  return
}

if (-not (Test-Path $Script)) {
  throw "Cannot find $Script - run this from the repo, with the backend present."
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw 'node was not found on PATH. Install Node, or edit this script to hard-code the path.'
}

# .env sits in backend/, and mailTick.js calls dotenv.config() relative to the
# working directory - so the task must start there or it gets no credentials.
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$Script`"" -WorkingDirectory $BackendDir

# Hourly, for ever. The mail's own day/hour settings decide when it actually
# sends; this only decides how often AIRMS is allowed to notice.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date.AddMinutes(7) `
  -RepetitionInterval (New-TimeSpan -Hours 1)

# StartWhenAvailable is the point of the whole design: a machine asleep when the
# digest fell due runs the missed tick on wake rather than skipping the month.
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
  -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Replaced the existing '$TaskName' task."
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Runs one AIRMS scheduled-mail pass (monthly digest + rescreen reminder). See backend/src/mailTick.js.' | Out-Null

Write-Host ''
Write-Host "Registered '$TaskName'" -ForegroundColor Green
Write-Host "  runs      : $node `"$Script`""
Write-Host "  in        : $BackendDir"
Write-Host '  every     : 1 hour (catches up after sleep/shutdown)'
Write-Host '  as        : this user, only while logged on'
Write-Host ''
Write-Host 'Check it:   Get-ScheduledTask -TaskName ''AIRMS mail tick'' | Get-ScheduledTaskInfo'
Write-Host 'Run it now: Start-ScheduledTask -TaskName ''AIRMS mail tick'''
Write-Host 'Remove it:  ./install-mail-task.ps1 -Uninstall'
