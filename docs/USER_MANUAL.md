# AIRMS — User Manual

> Walk-through of every shipped feature from the end-user's perspective. Read this when you need to know *what* a feature does, not *how* it's implemented.
>
> Each new feature added to the app gets a section here.

---

## 1. Getting started

### Demo accounts (seeded by [`backend/src/utils/seeder.js`](../backend/src/utils/seeder.js))

| Role | Email | Password |
|---|---|---|
| Athlete | `athlete@isn.gov.my` | `athlete123` (John Doe, ATH0001) |
| Athlete | `thung@isn.gov.my` | `thung123` (Thung Jin Seng, ATH0061 — seeded as a stale earlier assessment; import the sample HoloMotion PDF to watch his dashboard update to the printed report) |
| Medical | `medical@isn.gov.my` | `medical123` |
| Admin | `admin@isn.gov.my` | `admin123` |
| Admin (SMTP demo) | `poseidonapollo11@gmail.com` | `admin123` |

(Run `npm run seed` from project root to reseed.)

### Starting the app

From project root:
```powershell
npm run dev
```
Opens backend on `http://localhost:5000` and frontend on `http://localhost:3000`.

---

## 2. Login & app shell

### Login page (`/`)

Split-card layout on a cream gradient background.
- **Left panel (navy)**: AIRMS full logo, tagline, ISN address, version footer
- **Right panel (white)**: "Sign in" heading, email + password fields (with a show/hide password toggle), **Sign in** button, "Forgot password" link

There is no role selector — you just enter your email and password. After successful login the system reads your role from the JWT and redirects to that role's landing page.

### Sidebar

A 256px navy sidebar visible on every authenticated page:
- **Branding block** at top: square ISN logo + "AIRMS / SPORTS HEALTH"
- **Nav links** — varies by role (see below). The active page has a solid gold background with navy text
- **Footer**: "AIRMS Prototype v0.2"

Per-role nav:

| Athlete | Medical | Admin |
|---|---|---|
| My Dashboard | Athlete Dashboard | Injury Analytics |
| Activity Tracking | Injury Logging | PDF Reports |
| Injury Reporting | Self-Report Review | Staff Permissions |
|  | Data Uploading | Data Uploading |

Medical nav links are hidden individually when an admin has revoked that capability for the staff member (see §15).

**Note:** "My Profile" is **not** in the sidebar — it lives in the topbar avatar dropdown.

### Topbar

60px sticky top bar visible on every authenticated page:
- **Left**: page title (e.g. "My Dashboard", "Activity Tracking")
- **Right**:
  - Stacked "Signed in as" + bold role name
  - Theme toggle (rounded-rectangle button, sun/moon icon, persists to `localStorage`)
  - Initials avatar (e.g. "JD" for John Doe). Click to open dropdown
- **Avatar dropdown**: user name + role header → **My Profile** link → **Sign out** button. Click outside dropdown to close.

The initials avatar filters out honorifics — e.g. "Dr. Lim Wei Han" displays as "LH" not "DL".

---

## 3. Activity Tracking — `/athlete/activity` (Athlete only)

Two-column layout: log form on the left, history on the right.

### Log New Activity (left card)

Fields:
- **Activity Type** — dropdown: Strength, Endurance, Speed, Skill, Match, Recovery
- **Date** — defaults to today
- **Duration (minutes)** — 10–240
- **Intensity (RPE 1–10)** — perceived exertion
- **Notes** — optional free-text

**Live load preview** below the duration/intensity fields:
```
Load = Duration × Intensity
60 min × 6 = 360 AU
Moderate session — typical training load.
```

The qualitative band updates live as you change inputs:
- `0` → "Enter duration and intensity to compute load."
- `<200` → "Light session — feeds your chronic baseline."
- `<500` → "Moderate session — typical training load."
- `<800` → "High load session — ensure recovery is planned."
- `≥800` → "Very high load — verify duration and intensity values are accurate."

Hit **Save Activity** → POSTs to `/api/activities`, prepends the new row to the history table, shows a green success banner that auto-dismisses after 2.5s.

### Activity History (right card)

- Card header shows session count ("12 sessions logged")
- Filter dropdown to scope by activity type
- Table columns: Date, Type (pill badge), Duration, Intensity (x/10), Load (bold), Delete button
- Delete prompts a `confirm()` dialog before calling the backend

If no activities yet: "No activities logged yet. Use the form on the left to log your first session."

### How this feeds the rest of the system

Sessions in the last 7 days contribute to the **acute load**; the last 4 weeks of weekly totals form the **chronic load**; acute ÷ chronic is the **ACWR**.

Since 2026-07-16 this page is the **only** place training load is shown — the ACWR hero, load stat tiles and Workload Trend chart were removed from the dashboards so that the cohort-normed screening indicator is the single risk verdict there (see [§4.1](#41-overall-risk-indicator--the-hero-the-one-verdict)). Load still does work behind the scenes: it drives the **recovery baseline** a clinician sees on the medical dashboard, and a sharp drop in training still prompts the athlete to add a note.

---

## 4. Athlete Dashboard — `/athlete/dashboard` (Athlete only)

The athlete's home page. Vertical sections from top to bottom:

### 4.0 Sport-Critical Screening Alert (when triggered)

At the very top — *above* the risk hero — a red/amber alert banner appears when a HoloMotion screening indicator for a body region **important to the athlete's sport** is out of a healthy range (e.g. an Ankle indicator for a Badminton player). It lists each flagged region with a Watch/High chip. Renders nothing when everything is in range. Full behaviour in [§13](#13-sport-critical-screening-alerts).

### 4.1 Overall Risk Indicator — the hero *(the one verdict)*

The dashboard's headline, and since 2026-07-16 the **only** risk verdict on it. A full-width banner tinted by band, side-by-side with the risk radar ([§4.2](#42-risk-indicators-radar)):

- **Left**: "Current Status" → the band in large type — 🟢 **Safe** / 🟡 **Needs attention** / 🔴 **Immediate assessment** — then a plain-English sentence explaining what it means for the athlete.
- **Right**: the **0–100 indicator** in large type, with "Comparison group average = 50" underneath.
- **"Why" chip**: when the band escalated, it states the rule that fired — *+1 for scoring below your comparison group, +1 for being among its lowest scorers*.
- **Clinician override**: if a medical staffer has assessed the athlete and set the band by hand, the hero says *"set by clinician"* and shows their note instead of the escalation reason.

Full behaviour of the score itself is in [§16](#16-overall-risk-indicator-cohort-normed).

> **What happened to the ACWR / Compound Risk hero?** It was removed from every dashboard on 2026-07-16. It sat *below* the overall indicator labelled "Secondary", but was several times larger — so the athlete met three competing verdicts in a row (the sport-critical alert, "Immediate assessment", and "Compound Moderate Risk") and couldn't tell which was the answer. Training load now lives solely on **[Activity Tracking §3](#3-activity-tracking)**, which is unchanged: sRPE logging, the live load preview and the history table are all still there. The composite model itself is retained and still runs behind the scenes (it opens recovery baselines and feeds the medical prevention-insight card) — see [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).

**Sharp-drop prompt** — a slim banner still appears under the hero if the athlete's training drops sharply: *"Sharp drop in activity detected. Were you ill or injured? [Add Note →]"*, linking to `/athlete/injury-report`.

### 4.2 Risk Indicators radar

7-axis radar chart of the shown ISN screening risks: Neck, Shoulder, Scoliosis, Lumbar/Pelvis, Joint Pain, Knee, Ankle. Values 0–30 (lower is better). Filled with translucent gold. Sits to the right of the hero.

> Lumbar Disc Herniation is **not** an axis — it is extracted and stored but excluded from every risk display, because ISN's facilities do not support that assessment (Dr Thung). Until 2026-07-16 it was incorrectly shown here and on the threshold strips, cohort chart and alerts.

### 4.3 HoloMotion Screening panel

The athlete's latest ingested report, read against its thresholds (full detail in [§14](#14-screening-panel--embedded-on-the-dashboards)):

- **Five score gauges** — Total Score, ROM, Stability, Symmetry, Exercise Risks — with tick marks at HoloMotion's 60/75/85 tier boundaries and the tier label coloured by band
- **Eight indicator threshold strips** — each indicator on tinted OK/Watch/High zones with a marker at the value, coloured by the zone it lands in; the athlete's sport-critical regions are starred
- Athletes with no ingested report see a "no screening ingested yet" state

### 4.4 Muscle Assessment Map

**Front + back** athletic silhouettes side-by-side. Adapted from the MIT-licensed `react-muscle-highlighter` library.

- Default: unflagged regions blend with the body fill (light grey)
- **Flagged regions** light up by category:
  - 🔵 Weakness (Myodynamia) — blue tint
  - 🟠 Tension (Over-activation) — orange tint
  - 🟣 Both (Compensation pattern) — purple tint
- Hovering a flagged region brightens the whole region (group hover, not per-segment). Inert regions outside ISN's tracked muscles (head, hands, feet, knees, etc.) don't react.

**Below the figures:**
- **Summary tile** — total flag count
- **Legend** — what each colour means + L/R/B side notation
- **Three flag cards** — preserve the granular ISN data:
  - Myodynamia Deficiency (list specific muscles + side)
  - Muscle Tension (list specific muscles + side)
  - Compensation Pattern (muscles that appear in both — flagged as clinically significant)

Tooltip on hover shows which specific AIRMS muscles map to the region you're hovering ("Vastus Lateralis — weak", "Rectus Femoris — tight", etc.).

### 4.5 Recent Activity table

Last 6 sessions in compact form. "View All →" link to `/athlete/activity`.

### 4.6 Injury Records

Tabbed view:
- **Active** — injuries with `recoveryStatus !== 'Recovered'`
- **All History** — full list

Each entry:
- **Body part (side) — Injury type** (bold)
- Meta line: date · severity · mechanism
- Recovery status badge (low / moderate / high colour by status)
- Notes (if any)

"Report Injury →" button at top right links to `/athlete/injury-report`.

---

## 5. Injury Reporting (Athlete self-report) — `/athlete/injury-report`

Two-column layout. **Left card** is the submission form, **right card** lists the athlete's own past submissions.

**Submission form** — body part (10-option dropdown), side, suspected injury type, severity (your own assessment), description textarea (required). Submitting calls `POST /api/self-reports`, prepends the new entry to the right card list with a "Pending" badge.

**My Submissions** — chronological list of all the athlete's submissions. Each entry shows:
- Body part + side + suspected type
- Submitted date + severity
- Status badge: 🟡 Pending / 🟢 Approved / 🔴 Rejected
- Original description
- Reviewer's note (if reviewed) — italicised, prefixed with reviewer name

Self-reports do **not** appear on the official injury record until a medical staff member approves them in `/medical/review-reports`. On approval, an `Injury` record is auto-created with `source: 'Athlete Self-Report'`.

---

## 6. Injury Logging (Medical) — `/medical/injury-log`

Two-column layout. **Left card** is the intake form, **right card** shows the last 8 entries across all athletes. The form follows the five-step structure professional sports-medicine teams record injuries in (IOC / STROBE-SIIS variable set) — same stored fields, better capture workflow:

1. **Athlete** — datalist picker (search by name or ATH0001 ID; accepts `?athleteId=` deep-link from `/medical/dashboard`). Selecting a valid athlete surfaces their **clinical context**: active injuries with status badges, or "no active injuries · N total in history"
2. **Incident — when & how** — date of onset (capped at today) + mechanism, with a helper line explaining the selected mechanism. If the athlete has prior records at the chosen body part, a **recurrence hint** appears with a one-click "Recurrent" apply
3. **Location — where** — body part (10 options, locked enum) + side as segmented buttons (Left / Right / Both / N/A)
4. **Classification — what** — injury type (8 options, locked enum) + severity as segmented buttons with **time-loss anchors** (Minor 1–7 days · Moderate 8–28 · Severe >28)
5. **Plan — status & notes** — recovery status (pre-set Recovering) + clinical notes with an Assessment / Treatment / RTP-criteria prompt

Submit posts to `POST /api/injuries` and prepends the new entry to the "Recent Injury Logs" card. The athlete picker is **not** reset after submit (allows logging multiple injuries for the same athlete in sequence).

---

## 7. Self-Report Review (Medical) — `/medical/review-reports`

**Tabbed list** at top: Pending (N) / Approved (N) / Rejected (N). Counts come from a live count over the full self-reports list.

**Report rows** are clickable cards showing athlete name, body part/side/type, sport, submitted date, status badge, and a truncated description preview.

**Click row → modal review:**
- Header: "Review submission — {athlete name}"
- Key-value grid: athlete, sport, body part, suspected type, severity, submitted date
- Full athlete description in a quoted block
- Reviewer note textarea (required for Reject)
- Footer buttons (Pending only): Cancel / Reject / **Approve & add to record**

Approving calls `PATCH /api/self-reports/:id/review` with status=Approved, which server-side creates the official `Injury` record. Rejecting requires a non-empty reviewer note. Already-decided reports open in read-only mode with the reviewer name + date.

---

## 8. Medical Dashboard — `/medical/dashboard`

The medical staff's home page — **search → select athlete → see their full risk picture**.

**Left rail** — search box (name or ATH0001 ID), Sport + Programme filter dropdowns, athlete count, and the scrollable athlete list (initials avatar, name, sport · ID; the selected row is highlighted).

**Right pane, before any selection** — the clinician's entry points: roster/active-injury/pending-report stat tiles, plus two quick-access lists (athletes with active injuries; injuries logged in the last 14 days) that select the athlete on click.

**On selection** — the full athlete view renders in the right pane:
- **Profile header card** — avatar, ID · sport · programme · age · gender, "+ Log Injury" button (deep-links to `/medical/injury-log?athleteId=...`)
- **Sport-Critical Screening Alert** — the same banner the athlete sees, flagging a sport-important body region that's out of screening range (see [§13](#13-sport-critical-screening-alerts))
- **Composite Risk hero** — same component logic as the athlete's own dashboard. Shows the personalised band, escalation badge if triggered, and risk modifier chips
- **Recovery baseline card** (when open) + **Prevention insight card** — clinician-facing return-to-play target and cross-referenced watch points
- **HoloMotion Screening panel** — the same tier-ticked gauges + indicator threshold strips the athlete sees (see [§14](#14-screening-panel--embedded-on-the-dashboards))
- **Workload Trend chart** + **Risk Indicators radar** (side by side, identical to the athlete dashboard)
- **Muscle Assessment Map** — front + back silhouette with flagged regions, plus the granular flag cards below
- **Recent Activity** (athlete-logged sessions with notes), **Sport Context**, and the **Injury History** list with severity-coloured recovery status badges

The medical view is intentionally **read-only** for the screening data. Edits flow through Module 4 (data re-upload).

---

## 9. Injury Analytics (Admin) — `/admin/dashboard`

The admin's home page. **Filterable injury KPIs and breakdown charts.**

**Filter strip** (7 filters, all changes trigger a live re-fetch):
- Sport (from `/api/athletes/meta/sports`)
- Gender
- Programme (PODIUM / PELAPIS / OTHERS)
- Body Part
- Injury Type
- From / To dates
- **Reset** clears all filters; **Generate PDF Report** navigates to `/admin/reports`

**4 KPI cards** populated from `/api/injuries/analytics/summary`:
- Total Cases (within filter)
- Athletes Affected (unique athleteIds)
- Currently Recovering (active cases)
- Sports Affected (distinct sports)

**3 charts** (Chart.js):
- **Injuries by Body Part** — vertical bar chart, navy, ordered by the canonical body-part list
- **Injuries by Type** — vertical bar chart, gold, ordered by the canonical injury-type list
- **Cases Over Time** — line chart, monthly aggregation

---

## 10. PDF Reports (Admin) — `/admin/reports`

**Two-column live PDF generator.**

**Left card** — configuration form. Same filter dimensions as the analytics dashboard so what you see on the dashboard is what comes out in the PDF:
- Report Type: Monthly Standard / Quarterly Programme Review / Custom Filtered (each picks sensible default dates)
- Period start / end
- Sport · Programme · Gender · Age group · Body Part · Injury Type filters
- Section toggles: severity + recovery breakdown, monthly trend chart, athlete index
- **Generate & download PDF** button

**Right card** — at-a-glance preview pane:
- "Filters that will be applied" — the active filter summary, mirrored from the form
- "Sections in the generated PDF" — checklist that updates live as you toggle section options
- "Download complete" success banner with filename after a successful generate

**On submit** — the form POSTs to `/api/reports/injuries-pdf`. The backend (server-side `pdfkit`) queries the live `Injury` collection against the filters, assembles a multi-page A4 PDF, and streams it back. The browser saves it as `airms-<reportType>-<YYYY-MM-DD>.pdf`.

**Sections that always appear:**
- Cover with AIRMS branding, report type, generated-on timestamp, generated-by, filter summary
- Executive summary table (total cases, athletes affected, sports affected, currently recovering)
- Distribution by body part (horizontal bar chart, navy)
- Distribution by injury type (horizontal bar chart, gold)
- Appendix (filter context, data source note, report version)

**Sections that depend on toggles:**
- Severity + recovery status breakdowns
- Cases-over-time monthly trend chart
- Athlete index (paginated, up to 80 entries)

Every page has a footer with "AIRMS · Page X of Y".

---

## 11. Profile — `/medical/profile` and `/admin/profile`

Accessed from the topbar avatar dropdown's "My Profile" link. Both pages share the same `ProfileShell` component; the role-specific stats are the only difference.

**Hero** — large initials avatar (e.g. "MD" for "Medical Demo 01"), display name, email, role chip (gold), and a role-specific blurb.

**Stat tiles** — live KPIs loaded on mount:
- **Medical:** Athletes under care · Recovering injuries · Self-reports pending review · Total injuries on record
- **Admin:** Total athletes · Sports covered · Injuries this month · Currently recovering

**Account information** — read-only card listing display name, email, role, athlete ID (if applicable), and user ID.

**Account actions:**
- **Change password** opens a modal with current / new / confirm fields. Submitting calls `POST /api/auth/change-password` after enforcing the password policy (≥10 chars, upper + lower + digit + symbol, confirmation match)
- **Sign out** prompts a confirm, then clears the JWT and redirects to login

---

## 12. Data Uploading — `/admin/data-upload` and `/medical/data-upload`

Screening data enters AIRMS one way: **importing HoloMotion report PDFs** — the artefact Dr Thung's real workflow produces. HoloMotion reports are image-only PDFs (no text layer), so the system renders their pages and a vision model reads them. *(The original Excel import was retired 2026-07-12; its code is archived in `archive/excel-upload/`. The Excel backup **export** in §12.2 is unaffected.)*

### 12.1 HoloMotion PDF import (AI-assisted, batch-capable)

- **Drop one or many `.pdf` files** into the dropzone (or click to browse — multi-select works). Each file appears in a queue with a status chip (Queued → Reading → Ready to import → Imported)
- **Read & extract** processes the queue sequentially — one vision call per file, spaced 3 seconds apart to stay inside free-tier rate limits. Importing afterwards costs no further calls
- **Name-match autofill:** the athlete name printed on each report is matched against the existing roster (case-insensitive, must be unambiguous). A match auto-fills **Athlete ID, Sport, and Programme** — editable, in case the match is the wrong person. A new name gets manual entry: the Athlete ID field offers the roster as a suggestion list, the **Sport field is a searchable dropdown of ISN's 52 sports**, and Programme is PODIUM / PELAPIS / OTHERS
- Each queue item shows the extracted scores, the eight risk indicators, and both muscle lists for review — **nothing is committed until you confirm that item** (or use *Import all ready* for the batch)
- If no vision provider is configured (`VISION_API_KEY` / `VISION_MODEL` in the backend env), the card self-disables with a setup message. Any OpenAI-compatible provider (Gemini, OpenAI, Qwen, OpenRouter, local Ollama) or Anthropic works

### 12.2 Data Backup (admin only)

On `/admin/data-upload`, a **Data Backup** card offers a one-click **Download backup (.xlsx)** — a multi-sheet Excel workbook (Athletes + Injuries + Muscle Flags) snapshotting the whole dataset at any time.

---

## 13. Sport-Critical Screening Alerts

A sport-aware injury alert shown on the **athlete** and **medical** dashboards. Different sports stress different body regions — a runner's knees and ankles matter more than their neck — so the system flags a screening problem *in a region that matters for that athlete's sport* before the general workload signal.

**How it decides:**
- Each sport has a set of **critical body regions** (e.g. Swimming → Shoulder / Neck / Lumbar-Pelvis; Athletics → Knee / Ankle / Lumbar-Pelvis)
- Sport names are matched case- and whitespace-insensitively, and common variants map to the curated sets (e.g. *Running / Track & Field* → Athletics, *Soccer* → Football)
- Every athlete takes the same eight tests, but each indicator is banded against **its region's sport-specific thresholds**: standard regions use the instrument's own bands (**≤15 OK · 16–25 Watch · >25 High**), while the sport's critical regions are held to **tightened bands (≤12 OK · 13–20 Watch · >20 High)** — tightening only, so no region is ever less protected than the report's own scale
- An indicator is alerted when its region is **sport-critical and out of its tightened bands**, or when it is **High for any region** (safety net)

**What you see:** a red (High) or amber (Watch) banner at the top of the dashboard listing each flagged region with a Watch/High chip and the value; sport-critical entries are marked, and the banner ends with a one-line recommended action matched to the severity. The banner is hidden entirely when nothing is out of range. It is informational and does not change the composite-risk classification.

The coach Squad Readiness table's Screening column also distinguishes athletes with **no ingested screening** (shown as *no data*) from athletes whose screening is simply in range (shown as —).

---

## 14. Screening Panel — embedded on the dashboards

The athlete's latest HoloMotion screening lives directly on the **athlete dashboard** and inside the **medical dashboard's** per-athlete view (there is no separate screening page — the dashboard is the working surface). The shared panel renders the report *against its thresholds*:

- **Five score gauges** (Total Score, ROM, Stability, Symmetry on 0–100; Exercise Risks on the risk scale) with tick marks at the HoloMotion tier boundaries (60 / 75 / 85) and the tier name coloured by band
- **Eight indicator threshold strips** — each exercise-risk indicator drawn on **its sport's zones** (standard ≤15/≤25; sport-critical regions tightened to ≤12/≤20, visibly shorter OK/Watch zones and starred) with a marker at the athlete's value, coloured green / amber / red by the zone it lands in — same threshold source as the §13 alerts
- **Training Focus** — the panel's counterpart of the report's closing *Training Prescription*: for up to the three most pressing out-of-range regions (sport-critical first), a block of corrective exercises with reps × sets · rest dosing, drawn from the HoloMotion prescription exercise vocabulary. Shows a "maintain current programme" state when everything is within thresholds. Informational — medical staff remain the authority
- The muscle lists render on the adjacent **body-map card** (figure + per-category flag cards)
- Athletes with no ingested report see an explicit "no screening ingested yet" state instead of empty charts

---

## 15. Staff Permissions (Admin) — `/admin/staff`

Lets an admin control exactly what each **medical** staff member can do, beyond their role.

- A table lists every medical user with a checkbox per capability: **View athlete records**, **Upload screening data**, **Review/approve self-reports**, **Log & view injuries**
- **Opt-out model** — every capability is on by default; unchecking one revokes it for that staffer. The change saves immediately
- A revoked feature simply ceases to exist for that user: it disappears from the sidebar, and navigating to its URL directly redirects to their first still-permitted page (no dead-end error screen). The backend blocks the underlying API calls regardless. Revocations take effect on the staffer's next page navigation — the app refreshes its session from the server on every dashboard load, no re-login needed
- An **Active / Inactive** toggle deactivates an account entirely (blocks sign-in)
- Athlete and admin accounts are not affected by this layer

---

## 16. Overall Risk Indicator (cohort-normed)

The FYP II primary risk signal, shown as a traffic-light badge on the athlete, medical, and coach dashboards.

**What it means:**
- 🟢 **Green — Safe:** the athlete is at or above their cohort's typical screening profile.
- 🟡 **Amber — Needs attention:** one escalation triggered.
- 🔴 **Red — Immediate assessment:** two escalations triggered.

**How the score is built (for the viva):** the system takes six screening components — Total Score, ROM, Stability, Symmetry, an inverted exercise-risk burden (mean of the 7 *shown* risk indicators; Lumbar Disc Herniation is deliberately excluded from all displays), and a left/right asymmetry penalty from the subitem scores — and **z-scores each against the athlete's cohort** (same sport + programme + gender). The z-scores are averaged with equal weight (the *Total Score of Athleticism* method) and mapped to a **0–100** display score where 50 = the cohort average.

**Escalation (Dr Thung's rule):**
- **+1** if the athlete is **below the cohort average**.
- **+1** if the athlete is among the **bottom `k`** (default 3) of their cohort.

So an athlete with a decent raw score who is nonetheless below their peers and among the cohort's worst escalates twice → red. This is intentional: a "good" number is not "safe" if everyone around them is doing better.

**Cohort fallback:** if the most specific cohort (sport + programme + gender) has fewer than the admin-set minimum (`min_cohort_n`, default 5), the system falls back a tier — sport + gender → sport → everyone — to the first cohort large enough to be meaningful. If none qualifies, the badge shows "insufficient cohort data" and no escalation is applied.

**Hover / expand** the badge to see the escalation factors driving the band (e.g. "below cohort average", "bottom 3 of 6 in cohort").

---

## 17. Cohort Thresholds & Settings (Admin) — `/admin/thresholds`

Where the admin approves the reference norms every indicator is measured against.

- **Approval queue:** every import recomputes the affected cohorts. New or changed cohorts land as **pending** rows, with the computed per-component **mean / SD pre-filled and editable**. The admin **Approve**s a cohort (or edits a mean first) to make it the live reference; **Revert** returns it to pending. Only approved cohorts are used for scoring.
- **Recompute** button re-derives all cohorts from the latest screenings on demand.
- **Settings** (tunable, not hardcoded): minimum cohort size (`min_cohort_n`), fallback on/off, the two escalation toggles, `bottom_k`, and the alert toggles / alert band. These directly change how every indicator is computed and when alerts fire.

---

## 18. Clinician Override (Medical) — on `/medical/dashboard`

After a medical staffer **actually assesses** an athlete, they can override the computed band from the athlete's overall-risk badge:

- Choose **green / amber / red** and enter a **required note** explaining the clinical judgement.
- The override wins over the computed band on every surface until the **next import** for that athlete, at which point it auto-expires (the new screening starts fresh).
- Use case: the system flags an athlete amber/red on the numbers, the clinician checks them and clears them to green with a note — or, conversely, escalates someone the numbers didn't catch.

---

## 19. Screening PDF Reports (Admin) — on `/admin/reports`

A **Screening Reports** card offers three cohort-normed PDFs (separate from the injury-analytics report in [§10](#10-pdf-reports-admin--adminreports)):

1. **Holistic (admin):** organisation-wide, non-expert-friendly **visualisations** — band distributions, most-flagged regions, screened coverage, and worst/attention lists.
2. **Individual:** one athlete — their scores, muscle legend, risk levels, **their thresholds vs their peers**, and **progress deltas between HoloMotion reports** (from the screening history).
3. **Team / group:** one sport + programme + gender cohort — the group thresholds, **everyone ranked against them**, plus an **attention table** listing each athlete's parts that need follow-up (built for the coach).

Each streams straight to the browser as a download.

---

## 20. Email Alerts & Coach View

**Email alerts (automatic):** when an import is **committed**, any athlete in that batch who lands **amber/red or escalated** triggers an email to the **medical staff** and to the **coaches assigned to that athlete's sport**. New data means "assess now" — the alert stops it sitting unseen. Alert behaviour (on/off, which band) is an admin setting ([§17](#17-cohort-thresholds--settings-admin--adminthresholds)). With no SMTP configured the mailer falls back to printing the email to the backend console.

**Coach view — `/coach/dashboard`** (experimental 4th role): a read-only, sport-scoped squad-readiness board. A coach sees **all athletes in their sport(s)** with their HoloMotion overall-risk badges side by side, filterable by **sport + programme**, so they can see at a glance who needs the medical team's attention. Coaches cannot edit anything.

---

*Last updated: 2026-07-16 — **ACWR removed from every dashboard.** §4 rewritten: the cohort-normed indicator is now the single risk verdict (§4.1 hero, paired with the §4.2 radar); the composite ACWR hero, load stat tiles and Workload Trend chart are gone from athlete + medical, and the coach's readiness now derives from the HoloMotion band (§20). Training load lives only on §3 Activity Tracking. Lumbar Disc Herniation removed from the radar, threshold strips, cohort chart and alerts (it was being shown against Dr Thung's requirement). Previous: 2026-07-14 — FYP II screening-centred redesign: §16 (cohort-normed overall indicator), §17 (admin cohort thresholds + settings), §18 (clinician override), §19 (three screening PDF reports), §20 (import-commit email alerts + coach view). Earlier: 2026-07-06 — §14 dashboard-embedded screening panel; §15 permission revocations vanish features; five-step injury intake. 2026-06-28 (HoloMotion PDF import, backup, staff permissions).*
