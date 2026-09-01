# AIRMS — System Guide

**Athlete Injury Risk Management System · Institut Sukan Negara**

A guide to what each part of the system does, written for the people trying it
rather than for the people who built it. Every screen below was checked against
the live deployment on 26 August 2026.

The athlete's own view is not covered here.

---

## 1. What AIRMS does

ISN already screens athletes with HoloMotion, and every screening already
produces a PDF. AIRMS takes that PDF and turns it into one risk reading that a
clinician, a coach and management can each act on without opening the document.

Three things distinguish it from reading the report directly:

1. **An athlete is scored against their own peers**, not against a published
   threshold — same sport, same programme, same sex. A Total Score of 74 means
   something different in a squad averaging 68 than in one averaging 80.
2. **The institution governs the reference.** The norms every athlete is measured
   against are a named, saved, pinned set that an import cannot quietly move.
3. **A clinician can always override the verdict**, with a note that is recorded
   against the screening and in the activity trail.

---

## 2. Signing in

**Address:** https://airms-web.vercel.app

**Password for every account below: `airms2026`**

| Role | Sign in as | What it is for |
|---|---|---|
| Admin | `admin@isn.gov.my` | Running the programme — norms, people, settings, the trail |
| Medical | `medical@isn.gov.my` | The clinical view of an individual athlete |
| Coach | `coach@isn.gov.my` | One squad's readiness, read-only (Badminton) |
| Executive | `executive@isn.gov.my` | Institutional oversight, read-only |

**The athlete data is entirely fabricated.** No real ISN athlete information is
on this site. Names, IC numbers and screening values are generated.

The role decides what you see: there is no role selector on the login page, and
signing in takes you straight to that role's home screen.

---

## 3. What every screen shares

**Sidebar (left).** The pages available to your role, and nothing else. A page
you cannot use is not shown rather than shown-and-refused.

**Topbar (right).** Your name and role, a light/dark toggle, and a menu with
Profile and Sign out. The theme choice persists.

**Profile.** Your own account: name, password change, and per-notification email
opt-outs. Two gates apply in order — the institution decides whether AIRMS sends
that kind of mail at all, then you decide whether you still want it. You cannot
opt *in* to something an administrator has switched off, and nobody can mute
somebody else's clinical alerts.

---

## 4. Medical — the clinical view

**Athlete Dashboard** (`/medical/dashboard`) — the working screen.

*Search, then select an athlete.* The left rail searches by name **or IC
number**, filters by sport and programme, and lists the roster. Search tolerates
the name in either order ("faris ahmad" finds "Ahmad Faris") and IC numbers typed
with the punctuation printed on a form. Where two athletes share a name, the
result is marked as ambiguous — only the IC and the sport separate them.

*Before you select anyone*, the pane shows entry points: roster counts, athletes
currently flagged as injured, and recent activity.

*Once selected*, the athlete's full picture:

- **Profile header** — IC, sport, programme, age, events, and the **injury-status
  flag**. That flag is not an injury log; its purpose is norm eligibility.
  Setting it rebuilds the cohort norms and re-scores every athlete **in the same
  request**, and a one-time notice tells you so. Also: *Download PDF* and *Team
  PDF*.
- **Overall Risk Indicator** — the one verdict, in three bands. Green reads **"No
  indicators flagged"**, deliberately: a screen that cannot predict injury cannot
  certify its absence, and most athletes sit in green, so that is exactly where a
  false reassurance would do the most damage. The hero also states the
  screening's **age** and whether the athlete is due or overdue for re-screening.
- **Band override** — Green / Amber / Red with a required note. The override wins
  everywhere the band is read, and is recorded with your name.
- **Screening panel** — HoloMotion's own printed Total Score, the score gauges
  with tick marks at the instrument's 60/75/85 tiers, and the seven risk
  indicators as threshold strips.
- **Lateral symmetry** — which side is weaker per region and by how much. A low
  symmetry score with level sides is reported as "not side-to-side", because that
  is a different finding rather than a contradiction.
- **Training Prescription** — HoloMotion's own two-week programme, day by day,
  reproduced when the report carried one. This is the instrument's advice, not
  AIRMS's; the *Training Focus* card below it is AIRMS's own suggestion and
  speaks about load rather than treatment.
- **Muscle map** — front and back, HoloMotion's 22 individual muscles. Deep
  muscles are drawn with a dashed edge, the illustration convention for a
  structure lying beneath the plane shown.

**Cohort Norms** (`/medical/cohort-norms`) — read-only view of the norms in
force, so a clinician can see what an athlete is being compared against.

**Data Uploading** (`/medical/data-upload`) — see §6.

---

## 5. Coach — squad readiness

**Squad Readiness** (`/coach/dashboard`). Read-only, and scoped to the coach's
own sport: a coach sees their squad and no one else's.

- Each athlete's current band, their movement scores, and a trend arrow against
  their previous screening.
- **The arrow only calls a change real when it exceeds the detectable-change
  threshold**, and that threshold is computed across the whole institution, not
  this sport — a coach's view must be a slice of the institution's judgement,
  never a second opinion.
- **Rescreen recall** — who in the squad is overdue, current, or has never been
  screened. This is the same list the monthly reminder emails, so the screen and
  the email cannot disagree about who is overdue.
- Clicking an athlete opens their screening detail, read-only.

**Reports** (`/coach/reports`) — the team report for their sport, and the
individual screening PDF for their own athletes. The holistic institutional
report is deliberately not available to a coach.

---

## 6. Admin — running the programme

This is the administrator's surface, built around what ISN needs to operate the
screening programme rather than to read one athlete.

### Screening Analytics (`/admin/dashboard`)

The squad's **shape**, not only its averages.

- **Direction of travel** — band mix over recent periods, at monthly, quarterly
  or yearly grain. The columns have two readings, switched by the toggle above
  them: *Athletes tested* scales height to headcount, *Band mix %* makes every
  column equal so a quiet month is comparable with a busy one. It alternates
  every 10 seconds and stops as soon as you click either button. The average
  Total Score runs over the columns against the **right-hand axis**, which prints
  its own range. Each athlete counts once per period, from their latest screening
  in it, so the bands always sum to the headcount shown.
- **Squad body map** — the same licensed figure fed the cohort's mean subitem
  scores.
- **Risk vs movement scatter** — quadrants split on the squad's own medians. The
  reading to look for is top-right: an athlete who moves well *and* scores risky.
  No averaged panel surfaces those.
- **Indicator distribution** — a mean of 50 is produced equally by everyone at 50
  and by half the squad at 30 and half at 70. Those are different squads.
- **Subitem heatmap and left–right asymmetry** — the 25-cell table aggregated,
  and a count of athletes with a notable side-to-side gap.

### Programme Activity (`/admin/activity`)

How the *programme* is running, rather than how an athlete is.

- **Coverage** — who has ever been screened.
- **Recall** — whether what is held on each athlete is still current: current,
  due soon, overdue, or never screened. "Never" is counted apart from "overdue"
  because it calls for a first assessment, not a call-back.
- **Throughput** per period, and **within-athlete change** between consecutive
  tests, where each athlete is their own control.
- **Seasonality** — which quarter carries the risk, every year pooled. It
  **declines to name a season below two years of data**, and says so before the
  table, because with one year "Q3 is worst" is indistinguishable from "Q3 is
  when the weaker squads were screened".

### Cohort Norms (`/admin/thresholds`)

The reference every athlete is scored against, and its governance.

- **Norming Settings** — minimum cohort size, and the escalation rules that
  decide the band. Sitting directly above the table they move.
- **Norm inclusion thresholds** — the floors that decide whether a screening
  counts toward the norm. They are **deliberately set to 0 (off)**: excluding low
  scores from a norm computed on those very scores biases the mean upward and
  over-flags whoever remains. Excluding *injured* athletes is different, and
  stays.
- **The norms table** — every cohort, its mean and standard deviation, its size,
  and whether it is approved.
- **Saved versions and pinning** — a saved version is an archive; a **pinned**
  one is the norms *in force*. While a version is pinned, recomputing holds its
  numbers instead of overwriting them, so an import cannot move the reference
  underneath everybody. The system also records what the data *would* say, so a
  frozen norm cannot go stale silently. Deleting a pinned version, or restoring
  another over it, is refused.

### Personnel (`/admin/personnel`)

Staff accounts, and what each may do.

- **Four roles can be created here** — coach (read-only, one sport), medical
  staff (clinical access), executive (read-only oversight) and administrator
  (everything you can do, including this page). Athlete accounts are not created
  here; see §9.
- Create an account **by invitation**: no password is typed by the administrator.
  One is generated, hashed and discarded unread, and the invitee sets the first
  password that ever really exists on the account from a six-digit code valid for
  seven days. Nobody, including the creator, can sign in as that person.
- Administrators and executives are listed under **Administration & oversight**,
  which carries no capability switches: those apply to medical staff only.
- **Send invite / Resend invite** appears only while nobody can get into the
  account yet — it has never been activated *and* never been signed into. Once
  somebody has used it, the control is gone: the invitation email tells its
  reader an account has just been created for them and asks them to finish
  setting it up, which is untrue for an existing member. Somebody locked out of a
  working account uses **Forgot password?** on the sign-in page.
- Per-capability permissions for medical staff: view records, upload data, edit
  norms. Every capability is on by default; unchecking one revokes it
  immediately, the feature disappears from that user's sidebar, and the backend
  refuses the call regardless.
- Activate / deactivate an account.

### Activity Log (`/admin/audit`)

An append-only record of who did what: imports, overrides, norm changes, settings
changes, user changes, **and report downloads**.

Downloads are logged because for a read-only role, reading is the only auditable
act — and an individual report carries a named athlete's clinical scores.
Downloads are counted separately from changes, so an account that only reads
cannot outrank the clinicians.

The actor's name and role are copied onto the row rather than looked up later: a
trail that changes when somebody is renamed is not a trail.

### Data Uploading (`/admin/data-upload`)

- **HoloMotion PDF import.** Two steps: extract and preview, then commit. The
  operator attaches each report to a roster athlete by name search. Batch upload
  is supported.
- **The athlete's name is blacked out of the page image before it is sent for
  extraction**, so the one direct identifier never reaches the AI provider. This
  is working on the hosted site — a test import returned the name as `██████`.
- **The athlete need not already be on the roster.** If the report is for
  somebody AIRMS has never seen, the system looks them up in the **ISN athlete
  directory** and offers to create them pre-filled — name, IC, sport, programme,
  events — so a new athlete costs no separate data-entry step. The panel says
  *"new, from the ISN directory ... added when you commit"*, and the athlete is
  created only when you commit the report.
- **Data Backup** — the full dataset as an Excel workbook.

#### The three sample reports

Three real HoloMotion reports from the screening session of **29 July 2025** are
provided with this guide. They are set up to demonstrate the path above: all
three athletes are **in the ISN directory and not yet on the AIRMS roster**, so
uploading their reports both creates the athlete and records their first
screening.

| Report | Age on the report | Total Score | Exercise Risks |
|---|---|---|---|
| Nur Aina Danish | 18 | 77 (Good) | 14 (Low) |
| Nurin Syazwani Binti Rusli | 17 | 70 (Average) | 19 (Medium) |
| Nur Batrisyia Binti Yusof | 16 | 68 (Average) | 21 (Medium) |

Drop all three in at once — batch upload is supported. Each is matched to its
ISN record automatically from the file name, so there should be nothing to type;
the search controls below each report are there to correct a wrong match, not to
make one. All three are Badminton / PELAPIS, which is the same squad as the coach
demonstration account, so their scores appear on the coach's board once
committed.

Please do check each extracted value against the PDF in your hand before
committing — that preview step exists precisely so a misread never reaches the
record, and telling us about a misread is one of the most useful things you can
report back.

### Settings (`/admin/settings`)

Everything not about one particular page: the email surface, when each scheduled
mail last ran and whether it succeeded, a **Send now** control for demonstrating
or forcing a monthly mail, and the import-alert threshold.

---

## 7. Executive — oversight

Read-only, deliberately. An executive sees the admin's **Screening Analytics**,
**Programme Activity**, the **PDF reports** and the **Activity Log** — and can
write nothing at all: no import, no norm edits, no roster or personnel changes,
no settings, no backup.

It is **not** a super-admin. It holds strictly fewer powers than an admin, and
naming it otherwise would misdescribe it.

---

## 8. Reports

Five documents, all generated live and streamed as PDFs.

| Report | Who can download it |
|---|---|
| Individual screening | Medical, admin, executive; a coach for their own athletes |
| Team (per sport) | Medical, coach, admin, executive |
| Holistic (institution-wide) | Admin, executive |
| Programme Activity KPI | Admin, executive |
| Activity Log | Admin, executive |

The holistic report is also **attached to the monthly digest email**, using the
same code that generates the download, so the email and the download cannot
differ.

---

## 9. What does not work, or works differently, on this deployment

Stated plainly so nobody spends time reporting a known limit.

**Large HoloMotion PDFs are rejected.** The hosting platform caps an upload at
about 4.5 MB. The compact report (~1 MB) imports fine and was verified on the
live site, taking about 18 seconds. The expanded 38-page report (7.6 MB) is
refused. This is a hosting limit, not a system limit — it imports normally when
AIRMS is run on ISN's own machine.

**Email arrives from a personal Gmail address.** It will look unofficial and may
land in spam. Sending from an ISN address is a configuration change, not a
rebuild.

**The Activity Log lags the action by a few seconds.** Audit writes are
deliberately fire-and-forget so that logging can never fail the operation it
records; on this hosting that also makes them slightly late. Refresh the page. It
is not a lost entry.

**Scheduled email runs once a day, not hourly.** The hosting plan permits one
scheduled run per day, so the monthly digest and the rescreen reminder are
checked at 23:00 UTC rather than every hour. They still send on the correct day.

**The first page load may be slow.** The database is on a free tier that powers
down when idle. A keep-alive request runs every 15 minutes, but if it has been
asleep the first request wakes it and takes a few seconds. Try once more.

**"On-device" redaction is "pre-provider" redaction here.** When AIRMS runs on
ISN's machine, the athlete's name is removed before the image leaves that
machine. On this hosted demonstration the browser uploads the PDF to the AIRMS
server, which redacts before contacting the AI provider — so the name still never
reaches the provider, but it does traverse the hosted server first.

**Athlete accounts cannot be created by invitation.** Deliberate: an athlete
account also needs a roster record to attach to. Medical, coach, admin and
executive accounts can be invited.

**The data is fabricated**, so the band distribution demonstrates that the
pipeline runs — it is not evidence that the model is calibrated against real
injuries. That distinction is stated wherever the numbers appear.

---

## 10. Reporting a problem

Anything is useful — typos, wording that reads wrongly to a clinician, a control
that does not behave as expected, a panel that feels lacklustre.

The most useful report is:

1. **Which page** you were on, and **which role** you signed in as.
2. **What you did.**
3. **What you expected**, and what happened instead.
4. A **screenshot** if the problem is visual.

Small things are the easiest to fix. Please do not filter them out.
