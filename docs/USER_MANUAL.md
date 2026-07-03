# AIRMS — User Manual

> Walk-through of every shipped feature from the end-user's perspective. Read this when you need to know *what* a feature does, not *how* it's implemented.
>
> Each new feature added to the app gets a section here.

---

## 1. Getting started

### Demo accounts (seeded by [`backend/src/utils/seeder.js`](../backend/src/utils/seeder.js))

| Role | Email | Password |
|---|---|---|
| Athlete | `athlete@isn.gov.my` | `athlete123` |
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
| Screening Report | Screening Reports | PDF Reports |
| Activity Tracking | Injury Logging | Staff Permissions |
| Injury Reporting | Self-Report Review | Data Uploading |
|  | Data Uploading |  |

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

### How this feeds the dashboard

Every activity saved here updates the athlete's ACWR calculation in real time on `/athlete/dashboard`. Sessions in the last 7 days contribute to the **acute load**; the last 4 weeks of weekly totals form the **chronic load**.

---

## 4. Athlete Dashboard — `/athlete/dashboard` (Athlete only)

The athlete's home page. Vertical sections from top to bottom:

### 4.0 Sport-Critical Screening Alert (when triggered)

At the very top — *above* the risk hero — a red/amber alert banner appears when a HoloMotion screening indicator for a body region **important to the athlete's sport** is out of a healthy range (e.g. an Ankle indicator for a Badminton player). It lists each flagged region with a Watch/High chip. Renders nothing when everything is in range. Full behaviour in [§13](#13-sport-critical-screening-alerts).

### 4.1 Composite Risk Hero

Full-width banner. Colour-coded by current risk band:
- 🟢 **Optimal** — green tint
- 🟡 **Elevated** — amber tint
- 🔴 **High Risk** — red tint
- 🔵 **Detraining Risk** — blue tint

Layout:
- **Left**: "Current Status" label → big risk level → explanation paragraph
- **Right**: ACWR value (large), "Personalised band" line showing the athlete's specific optimal range (e.g. `0.77 – 1.39`)

**Special states:**
- **Escalation badge** — if the system bumped the risk band because of active injuries or muscle flags, an "escalated from Optimal" pill appears next to the level
- **Risk modifier chips** — listed below the message, e.g. `2 active injury records`, `6 muscle flags from screening`
- **Sharp-drop prompt** — if acute load dropped >40% vs prior week, an inline banner appears: *"Sharp drop in activity detected. Were you ill or injured? [Add Note →]"* linking to `/athlete/injury-report`

### 4.2 Stat tiles (4 cards)

- **This Week's Load** — sum of session loads in last 7 days, with delta vs previous week (▲ green / ▼ red)
- **4-Week Average** — chronic baseline
- **ACWR** — acute ÷ chronic, two decimals
- **Sessions Logged** — count in last 7 days

### 4.3 Workload Trend chart

8-week bar chart of weekly load (navy bars, left y-axis "Load AU") overlaid with the ACWR line (gold line, right y-axis 0–2.0).

### 4.4 Risk Indicators radar

8-axis radar chart of ISN screening risks: Neck, Shoulder, Scoliosis, Spinal Disc, Lumbar/Pelvis, Joint Pain, Knee, Ankle. Values 0–30 (lower is better). Filled with translucent gold.

### 4.5 Muscle Assessment Map

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

### 4.6 Recent Activity table

Last 6 sessions in compact form. "View All →" link to `/athlete/activity`.

### 4.7 Injury Records

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

Two-column layout. **Left card** is the injury log form, **right card** shows the last 8 entries across all athletes.

**Form fields:**
- **Athlete picker** — `<input list="...">` datalist combining all athletes (search by name or ATH0001 ID). The page accepts `?athleteId=ATH0001` query param to deep-link from `/medical/dashboard`. Live validation shows "Selected: {name} · {sport}" when a valid ID is entered
- **Body Part** (10 options, locked enum)
- **Side** (Left / Right / Both / N/A)
- **Injury Type** (8 options, locked enum)
- **Severity** (Minor / Moderate / Severe)
- **Mechanism** (Contact / Non-contact / Overuse / Recurrent)
- **Date of Injury**
- **Recovery Status** — pre-set to Recovering, editable to Recovered / Chronic
- **Clinical Notes** — free-text textarea

Submit posts to `POST /api/injuries` and prepends the new entry to the "Recent Injury Logs" card on the right. The athlete picker is **not** reset after submit (allows logging multiple injuries for the same athlete in sequence).

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

**Top filter strip** — search box (name or ATH0001 ID, free text), Sport filter dropdown (populated from `/api/athletes/meta/sports`), Programme filter (auto-derived from roster).

**Roster grid** below — auto-fit grid of athlete cards (initials avatar, name, sport · programme, ID). Click selects (active card has gold border).

**On selection** — full athlete view renders below the roster:
- **Profile header card** with avatar, name, sport · programme · age · gender, "+ Log Injury" button (deep-links to `/medical/injury-log?athleteId=...`), and key-value grid of biometrics + screening scores
- **Sport-Critical Screening Alert** — the same banner the athlete sees, flagging a sport-important body region that's out of screening range (see [§13](#13-sport-critical-screening-alerts))
- **Composite Risk hero** — same component logic as the athlete's own dashboard. Shows the personalised band, escalation badge if triggered, and risk modifier chips
- **Workload Trend chart** + **Risk Indicators radar** (side by side, identical to the athlete dashboard)
- **Muscle Assessment Map** — front + back silhouette with flagged regions, plus the granular flag cards below
- **Injury History** — chronological list with severity-coloured recovery status badges

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

Both pages render the same shared [`ScreeningUpload`](../frontend/src/components/upload/ScreeningUpload.tsx) component — the role just gates access. Two-column layout.

**Left card** — upload + actions:
- **Schema-in-flux infobox** at top making the ISN-format dependency explicit
- **Dropzone** accepting `.xlsx` / `.xls` via drag-drop or click. Shows filename and size when a file is selected
- **Preview & validate** button → `POST /api/upload/screening/preview` — parses the workbook, returns row-by-row preview with action (create / update) and per-row error list. Does NOT commit
- **Confirm & import** button → `POST /api/upload/screening` — actual upsert. Prompts a confirm if any preview rows have errors (errored rows are skipped)

**Right card** — tips + preview/result panel:
- Schema hints: ISO date format, muscle flag values (L / R / B), de-dup behaviour, never-commit-without-confirm
- After running preview: a green banner showing valid/invalid counts, plus a scrollable table of every row with action badge and error column (errored rows highlighted in red)
- After running commit: a green success banner with created / updated counts

### 12.1 HoloMotion PDF import (AI-assisted)

Below the Excel uploader sits a second card, **Import from HoloMotion PDF** — the path matching Dr Thung's real workflow. HoloMotion reports are image-only PDFs (no text), so the system renders the pages and a vision model reads them.

- **Drop a `.pdf`** → **Read & extract**. The backend renders the report's data pages and a configurable vision model returns the scores, the eight exercise-risk indicators, and the muscle flags. They appear in an "Extracted data" panel for review
- Because the report never contains them, you fill in three fields by hand: **Athlete ID, Sport, Program**
- **Confirm & import** upserts the athlete and replaces their muscle flags. No second AI call is made (the reviewed data is sent back directly)
- If no vision provider is configured (`VISION_API_KEY` / `VISION_MODEL` in the backend env), the card self-disables with a setup message — the Excel path is unaffected. Any OpenAI-compatible provider (OpenAI, Qwen, OpenRouter, local Ollama) or Anthropic works

### 12.2 Data Backup (admin only)

On `/admin/data-upload`, a **Data Backup** card offers a one-click **Download backup (.xlsx)** — a multi-sheet Excel workbook (Athletes + Injuries + Muscle Flags) snapshotting the whole dataset. Keep this as a record of the Excel-era data as ingestion shifts to HoloMotion.

---

## 13. Sport-Critical Screening Alerts

A sport-aware injury alert shown on the **athlete** and **medical** dashboards. Different sports stress different body regions — a runner's knees and ankles matter more than their neck — so the system flags a screening problem *in a region that matters for that athlete's sport* before the general workload signal.

**How it decides:**
- Each sport has a set of **critical body regions** (e.g. Swimming → Shoulder / Neck / Lumbar-Pelvis; Athletics → Knee / Ankle / Lumbar-Pelvis)
- Sport names are matched case- and whitespace-insensitively, and common variants map to the curated sets (e.g. *Running / Track & Field* → Athletics, *Soccer* → Football)
- It reads the eight HoloMotion exercise-risk indicators (0–40, lower is better) and bands each: **≤15 OK · 16–25 Watch · >25 High**
- An indicator is alerted when its region is **sport-critical and elevated**, or when it is **High for any region** (safety net)

**What you see:** a red (High) or amber (Watch) banner at the top of the dashboard listing each flagged region with a Watch/High chip and the value; sport-critical entries are marked, and the banner ends with a one-line recommended action matched to the severity. The banner is hidden entirely when nothing is out of range. It is informational and does not change the composite-risk classification.

The coach Squad Readiness table's Screening column also distinguishes athletes with **no ingested screening** (shown as *no data*) from athletes whose screening is simply in range (shown as —).

---

## 14. Screening Report — `/athlete/screening` and `/medical/screening`

A dedicated read-only view of an athlete's latest HoloMotion screening, shared by both roles via the same component.

- **Athlete (`/athlete/screening`)** — the athlete's own report: five score gauges (Total Score, ROM, Stability, Symmetry, Exercise Risks), the 8-indicator risk radar, the myodynamia/tension flag lists, and the muscle-assessment body map
- **Medical (`/medical/screening`)** — a searchable athlete picker (name or ID) → the same report for any athlete. Gated by the `viewRecords` permission (see §15)

---

## 15. Staff Permissions (Admin) — `/admin/staff`

Lets an admin control exactly what each **medical** staff member can do, beyond their role.

- A table lists every medical user with a checkbox per capability: **View athlete records**, **Upload screening data**, **Review/approve self-reports**, **View injury log & generate reports**
- **Opt-out model** — every capability is on by default; unchecking one revokes it for that staffer. The change saves immediately
- A revoked feature disappears from that user's sidebar and its page shows an access-denied message; the backend also blocks the underlying API calls
- An **Active / Inactive** toggle deactivates an account entirely (blocks sign-in)
- Athlete and admin accounts are not affected by this layer

---

*Last updated: 2026-06-28 — corrected demo credentials; documented HoloMotion PDF import (§12.1), data backup (§12.2), sport-critical screening alerts (§13), screening-report pages (§14), and staff permissions (§15); fixed the change-password note. Previous: 2026-05-18.*
