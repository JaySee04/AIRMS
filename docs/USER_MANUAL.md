# AIRMS — User Manual

> Walk-through of every shipped feature from the end-user's perspective. Read this when you need to know *what* a feature does, not *how* it's implemented.
>
> Each new feature added to the app gets a section here.

---

## 1. Getting started

### Demo accounts (seeded by [`backend/src/utils/seeder.js`](../backend/src/utils/seeder.js))

| Role | Email | Password |
|---|---|---|
| Athlete | `athlete@isn.gov.my` | `athlete123` (John Doe — the athlete key is now the **IC number**, e.g. `070202021001`; `npm run seed` prints each demo athlete's IC) |
| Athlete | `thung@isn.gov.my` | `thung123` (Thung Jin Seng — seeded as a deliberately **stale** earlier assessment; import the sample HoloMotion PDF to watch his dashboard update to the printed values) |
| Medical | `medical@isn.gov.my` | `medical123` (Medical Demo 01) |
| Medical (alert inbox) | `23005005@siswa.um.edu.my` | `medical123` (Medical Demo 02 — a real deliverable inbox, so import-commit alerts demo against something checkable) |
| Coach | `coach@isn.gov.my` | `coach123` (read-only, **sport-scoped** — squad readiness, team + individual report download for their own sport's athletes) |
| Executive | `executive@isn.gov.my` | `executive123` (Datuk Executive — read-only institutional oversight: admin analytics + PDF reports, and **nothing that writes**) |
| Admin | `admin@isn.gov.my` | `admin123` |
| Admin (SMTP demo) | `poseidonapollo11@gmail.com` | `admin123` (real Gmail, so the email-reset flow demos against an inbox you can check) |

(Run `npm run seed` from project root to reseed.)

> The seeded passwords deliberately do **not** satisfy the 10-character +
> complexity policy: that policy gates *user-driven* password setting
> (`change-password` / `reset-password`), not seeded fixtures.

> **Five roles**, not three. `coach` became a first-class role in FYP II
> (2026-07-19) and `executive` was added 2026-08-08. `executive` is deliberately
> **not** a super-admin — it has strictly fewer powers than `admin`: no import,
> no norm edits, no roster or personnel changes, no settings, no backup export.

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
| Injury Reporting | Injury Logging | PDF Reports |
|  | Self-Report Review | Staff Permissions |
|  | Data Uploading | Data Uploading |

Medical nav links are hidden individually when an admin has revoked that capability for the staff member (see §15).

**Note:** "My Profile" is **not** in the sidebar — it lives in the topbar avatar dropdown.

### Topbar

60px sticky top bar visible on every authenticated page:
- **Left**: page title (e.g. "My Dashboard", "Injury Reporting")
- **Right**:
  - Stacked "Signed in as" + bold role name
  - Theme toggle (rounded-rectangle button, sun/moon icon, persists to `localStorage`)
  - Initials avatar (e.g. "JD" for John Doe). Click to open dropdown
- **Avatar dropdown**: user name + role header → **My Profile** link → **Sign out** button. Click outside dropdown to close.

The initials avatar filters out honorifics — e.g. "Dr. Lim Wei Han" displays as "LH" not "DL".

---

## 3. Activity Tracking — removed 2026-07-20

`/athlete/activity` (sRPE session logging: type/date/duration/intensity, a
live `duration × intensity` load preview, and a filterable session history)
was **fully removed** at JC's request. Its ACWR/composite-risk *display* had
already left every dashboard on 2026-07-16 (see the note under
[§4.1](#41-overall-risk-indicator--the-hero-the-one-verdict)); with nothing
left to surface its output, JC judged the logging page itself not worth
keeping. This was a deliberate, informed call with the fallout accepted, not
a bug — see `docs/MASTER_CLARIFICATIONS.md §4` for the full record.

**Fallout accepted:** the Recent Activity table on the athlete dashboard
([§4.5](#45-recent-activity-table-removed-2026-07-20)), the medical dashboard's
own Recent Activity table, its **recovery baseline** card, and its
**prevention insight** card all consumed this page's data (directly or via
the composite risk model's ACWR argument) and were retired alongside it. The
composite model itself (`frontend/src/lib/risk.ts`) is **not** deleted — the
formula is a locked decision — but it currently has no live callers anywhere
in the app. Rebuild spec, if the formula is ever wired to a different
training-load input: [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).

---

## 4. Athlete Dashboard — `/athlete/dashboard` (Athlete only)

The athlete's home page. Vertical sections from top to bottom:

### 4.0 "Regions behind this band" (when the band is amber/red)

Sits *below* the hero, and only when the athlete's band is **amber or red**. It answers the obvious follow-up question — *which regions put me here?* — listing each out-of-range region with a Watch/Elevated chip, and starring the ones the athlete's sport loads heavily (which AIRMS holds to a tighter standard). Full behaviour in [§13](#13-sport-critical-screening-alerts).

> **This used to be an always-on alarm at the top of the page**, keyed on absolute thresholds. It fired for **59 of 59** screened athletes — an alarm that never stops isn't an alarm. It also gave a *second* verdict competing with the indicator, using exactly the kind of absolute cut-off the cohort-normed design exists to replace. Since 2026-07-16 it explains the band instead of competing with it, and green athletes don't get one — their region detail is on the threshold strips and in Training Focus.

### 4.1 Overall Risk Indicator — the hero *(the one verdict)*

The dashboard's headline, and since 2026-07-16 the **only** risk verdict on it. A full-width banner tinted by band, side-by-side with the risk radar ([§4.2](#42-risk-indicators-radar)):

- **Left**: "Current Status" → the band in large type — 🟢 **Safe** / 🟡 **Needs attention** / 🔴 **Immediate assessment** — then a plain-English sentence explaining what it means for the athlete.
- **Right**: the **0–100 indicator** in large type, with "Comparison group average = 50" underneath.
- **"Why" chip**: when the band escalated, it states the rule that fired — *+1 for scoring below your comparison group, +1 for being among its lowest scorers*.
- **Clinician override**: if a medical staffer has assessed the athlete and set the band by hand, the hero says *"set by clinician"* and shows their note instead of the escalation reason.

Full behaviour of the score itself is in [§16](#16-overall-risk-indicator-cohort-normed).

> **What happened to the ACWR / Compound Risk hero?** It was removed from every dashboard on 2026-07-16. It sat *below* the overall indicator labelled "Secondary", but was several times larger — so the athlete met three competing verdicts in a row (the sport-critical alert, "Immediate assessment", and "Compound Moderate Risk") and couldn't tell which was the answer. Training load lived on **[Activity Tracking §3](#3-activity-tracking-removed-2026-07-20)** until that page was itself fully removed on 2026-07-20 — see §3 for the full record, including the recovery-baseline/prevention-insight fallout. The composite model itself is retained (`frontend/src/lib/risk.ts`, a locked decision) but has no live callers now — see [`docs/fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md).

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

### 4.5 Recent Activity table — removed 2026-07-20

Used to show the athlete's last 6 logged sessions with a "View All →" link
to `/athlete/activity`. Removed along with Activity Tracking — see
[§3](#3-activity-tracking-removed-2026-07-20).

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

## 5-7. Injury Reporting, Injury Logging & Self-Report Review — removed 2026-08-02

`/athlete/injury-report` (athlete self-report), `/medical/injury-log` (clinician
injury logging) and `/medical/review-reports` (self-report triage) were **all
removed** by the HoloMotion-only cut. The `Injury` and `SelfReport` models,
`routes/injuries.js`, `routes/selfReports.js` and the self-report → injury
promotion transaction went with them. **These three pages no longer exist and
their URLs 404** — the sections that described them have been deleted rather
than left to send a reader to a dead route.

**Why:** JC set the direction that the **HoloMotion PDF is the single source of
truth**. Self-reported pain and hand-logged injuries are a different input
stream, and keeping them would have meant AIRMS quoting two kinds of evidence
with different provenance under one verdict. See
`docs/fyp/HOLOMOTION_SCOPE_2026-08.md` and `MASTER_CLARIFICATIONS.md §1`.

**What survives:** a single clinician-set flag on the Athlete row
(`isInjured` / `injuryNote` / `injuryBy` / `injuryAt`), written by
`PATCH /api/athletes/:id/injury` from the medical and admin surfaces. Its
purpose is **cohort-norm eligibility** — an injured athlete should not shape the
norm their peers are scored against — **not** an injury history. There is no
injury table, no injury history and no athlete self-reporting anywhere in AIRMS.

Module 2 was recast accordingly as **Athlete Roster & Identity Management**
(ratified by JC 2026-08-06); `docs/fyp/REPORT_TABLE_4-1.md` is the authority for
Chapter 4.

---

## 8. Medical Dashboard — `/medical/dashboard`

The medical staff's home page — **search → select athlete → see their full risk picture**.

**Left rail** — search box (name or **IC number** — the athlete key became the 12-digit IC on 2026-08-04, replacing the old `ATH0001` scheme; the UI labels it "IC Number"), Sport + Programme filter dropdowns, athlete count, and the scrollable athlete list (initials avatar, name, sport · ID; the selected row is highlighted).

**Right pane, before any selection** — the clinician's entry points: roster/active-injury/pending-report stat tiles, plus two quick-access lists (athletes with active injuries; injuries logged in the last 14 days) that select the athlete on click.

**On selection** — the full athlete view renders in the right pane:
- **Profile header card** — avatar, IC number · sport · programme · age · gender, events editor, "Download PDF" / "Team PDF" buttons, and the **injury-status control**. (This was a "+ Log Injury" button deep-linking to `/medical/injury-log`; that page was removed 2026-08-02. What remains is a single clinician-set **flag** whose purpose is cohort-norm eligibility, not an injury log — setting it rebuilds the norms and rescores every indicator in the same request, and a one-time notice discloses that the published norm moves.)
- **Overall Risk Indicator hero** — the same cohort-normed verdict the athlete sees (see [§4.1](#41-overall-risk-indicator--the-hero-the-one-verdict)), with clinician-only **band-override buttons** underneath (Green / Amber / Red + a required assessment note)
- **Sport-Critical Screening Alert** — the same banner the athlete sees, flagging a sport-important body region that's out of screening range (see [§13](#13-sport-critical-screening-alerts))
- **Risk Indicators radar** — identical to the athlete dashboard
- **HoloMotion Screening panel** — the same tier-ticked gauges + indicator threshold strips the athlete sees (see [§14](#14-screening-panel--embedded-on-the-dashboards))
- **Muscle Assessment Map** — front + back silhouette with flagged regions, plus the granular flag cards below
- **Sport Context** and the **Injury History** list with severity-coloured recovery status badges

The medical view is intentionally **read-only** for the screening data. Edits flow through Module 3 (data re-upload).

> The **Recovery baseline card**, **Prevention insight card**, and **Recent Activity** table that used to sit here were removed 2026-07-20 along with Activity Tracking (see [§3](#3-activity-tracking-removed-2026-07-20)) — all three consumed data that page produced. The **Composite Risk hero** and **Workload Trend chart** were removed earlier, on 2026-07-16, in favour of the Overall Risk Indicator hero above (same change as the athlete dashboard).

---

## 9. Screening Analytics (Admin) — `/admin/dashboard`

> **Rewritten 2026-08-18.** This page was "Injury Analytics" and charted injury
> cases by body part / type / month. The injury half of Module 5 went with the
> HoloMotion-only cut (2026-08-02) — there is no injury table — so everything
> here is now **screening-derived**. The old KPI cards and the three injury
> charts no longer exist.

The admin's home page: **what the squad looks like, not just what it averages.**

**Filter strip** — sport / gender / programme / age, plus a **region focus**.
The distinction matters and the page rests on it: **population filters** (sport,
programme, gender, age, discipline) choose *who* is in the picture; a **region
focus** chooses *what the picture is about* and removes nobody. The focus chip is
drawn dashed and outside the filter count for that reason. Filters are shared
with `/admin/activity` (one `CohortFilters` component) so a comparison between
the two pages is meaningful — "Badminton · Female" means the same on both.

**Panels:**

- **Where the squad stands** — band distribution (green / amber / red), every
  slice carrying its count and share, so meaning is never colour-alone.
- **Physical Quality — which is weakest?** — the four top-level movement averages
  (Total, ROM, Stability, Symmetry) on a **zoomed** axis. They cluster within a
  few points of each other, so a 0–100 track drew four identical bars and hid the
  only thing the panel is for; the dot plot states its own zoom, so the
  exaggeration is declared rather than smuggled.
- **Exercise Risk Hotspots** — how many athletes sit **beyond Low** on each of the
  seven shown indicators, worst first, all rows on one shared count axis so
  “Ankle 13” and “Neck 6” can be compared by eye. Athletes at Low are not drawn —
  the bar is the problem, not the population. This is the panel the holistic PDF
  prints under the same name (§37d); it is one panel, not two.
- **Squad Body Map** — the licensed anatomical figure fed the **cohort mean**
  subitem readings. Added because the product's whole vocabulary is body regions
  and the squad had no anatomical view.
- **Risk vs Movement Quality** — a scatter with quadrants split on the cohort
  **medians**. Total Score and Exercise Risks measure different halves of the
  report, so an athlete can move well and still score risky; **13 seeded
  athletes do**, and no averaged panel surfaces them.
- **Indicator Distribution** — histogram of the cohort-normed indicator. A mean
  of 50 is produced equally by everyone scoring 50 and by half scoring 30 and
  half 70.
- **Movement Quality by Region** — the 5 × 5 subitem heatmap, tier-coloured on
  HoloMotion's own 60/75/85 bands.
- **Left–Right Asymmetry** — the only bilateral data the instrument carries, and
  previously collapsed three different ways. Reports the **count of athletes
  with a ≥10-point gap** rather than a mean gap, because the means are flat at
  3–4 everywhere while the counts run 0–9.
- **Most-Flagged Weak / Tight Muscles** — myodynamia and tension hotspots.
- **By sport / gender / age group / programme** — each slice ordered worst-first
  by the **share** elevated, not the headcount, because policy follows
  proportion.

See `DESIGN_DECISIONS §23` and `§25` for why each of these exists.

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
- **Seven indicator threshold strips** — each exercise-risk indicator drawn on **its sport's zones** (standard ≤15/≤25; sport-critical regions tightened to ≤12/≤20, visibly shorter zones and starred) with a marker at the athlete's value, coloured green / amber / red by the zone it lands in — same threshold source as the §13 alerts. Lumbar Disc Herniation is not among them (see [§4.2](#42-risk-indicators-radar))

  **Band vocabulary (one scheme everywhere).** AIRMS reads exercise risks as **Low ≤15 · Watch 16–25 · Elevated >25**. The HoloMotion report itself prints *Low 0–15 · Medium 16–55 · High 56–100* — so AIRMS keeps the report's **Low** boundary exactly and **subdivides the report's broad Medium band** into Watch and Elevated, because ISN wants to act well before an athlete drifts up through Medium. AIRMS deliberately never says **"High"**: the report reserves that for 56–100, far above anything the instrument produces in practice (the two real reports top out at 27). The dashboards, the alert chips, the admin cohort chart and the three PDF reports all use these same words, so the same number never reads two ways. *(Until 2026-07-16 the screens said "HIGH RISK" for a 26 while the PDFs said "Medium Risk".)* The one deliberate difference: the PDFs show the **standard** bands, while the dashboards tighten **sport-critical** regions to 12/20 — so a sport-critical region can band one step higher on screen than on the PDF, which the PDF states.
- **Training Focus** — the panel's counterpart of the report's closing *Training Prescription*: for up to the three most pressing out-of-range regions (sport-critical first), a block of corrective exercises with reps × sets · rest dosing, drawn from the HoloMotion prescription exercise vocabulary. Shows a "maintain current programme" state when everything is within thresholds. Informational — medical staff remain the authority
- The muscle lists render on the adjacent **body-map card** (figure + per-category flag cards)
- Athletes with no ingested report see an explicit "no screening ingested yet" state instead of empty charts

---

## 15. Personnel & Staff Permissions (Admin) — `/admin/personnel`

> **Route renamed.** This page was `/admin/staff` in earlier builds; that URL no
> longer exists. It also now manages **all** staff accounts (create, edit,
> activate/deactivate) rather than permissions alone.

Lets an admin control exactly what each **medical** staff member can do, beyond their role.

- A table lists every medical user with a checkbox per capability. There are **three**: **View athlete records** (`viewRecords`), **Upload screening data** (`uploadData`) and **Edit cohort norms** (`editCohortNorms`)
- Earlier builds had two further capabilities — "Review/approve self-reports" and "Log & view injuries" — which were **removed along with the features they gated** in the 2026-08-02 HoloMotion-only cut. Nothing stale remains in the catalogue
- The checkbox list is not written in the page. It is fetched from `GET /api/users/permission-meta`, which serves `PERMISSION_KEYS` + `PERMISSION_LABELS` straight from `backend/src/utils/permissions.js` — so the admin screen cannot drift from what the backend actually enforces, and adding a capability is a one-file change
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
- **+1** if the athlete is among the **worst performers** of their cohort — the bottom `k`, where `k` is the admin's **bottom-k** setting (default 3) capped at **20% of the cohort**. The cap keeps the rule meaning the same thing in a squad of 5 as in a squad of 30: bottom-3 of 30 is the worst 10%, but bottom-3 of 5 would be the worst 60% — most of the group, which is not "among the worst". The athlete is ranked against **everyone in the cohort they're compared against**, not just those who fell back to the same tier.

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
2. **Individual:** one athlete — their scores, muscle legend, risk levels, **their thresholds vs their peers**, and **progress deltas between HoloMotion reports** (from the screening history). Also downloadable by medical staff (athlete header), by a coach for their sport's athletes (detail view), and by the **athlete themselves** (Screening History card on their dashboard) — every role's access enforced server-side. The same progress appears on-screen as the **Screening History** table on the athlete dashboard and the medical/coach detail views.
3. **Team / group:** one sport + programme + gender cohort — the group thresholds, **everyone ranked against them**, plus an **attention table** listing each athlete's parts that need follow-up (built for the coach).

Each streams straight to the browser as a download.

---

## 20. Email Alerts & Coach View

**Email alerts (automatic):** when an import is **committed**, any athlete in that batch who lands **amber/red or escalated** triggers an email to the **medical staff** and to the **coaches assigned to that athlete's sport**. New data means "assess now" — the alert stops it sitting unseen. Alert behaviour (on/off, which band) is an admin setting ([§17](#17-cohort-thresholds--settings-admin--adminthresholds)). With no SMTP configured the mailer falls back to printing the email to the backend console.

**Rescreen reminders (monthly, automatic).** A page only tells you something
when somebody opens it, which is the wrong shape for a fact that decays on its
own — so the recall list (§21.1) is also **emailed monthly** to admin + medical,
with *never screened* listed apart from *overdue*. It reports against
`rescreen_due_days` and **nothing else**: giving the reminder its own threshold
is how an email comes to say "overdue" while the dashboard says "current".
**Coaches get their own sport only** — the recall is computed once on the full
roster and each coach's email is a *slice* of it, so a coach's copy cannot
disagree with the institution's about who is overdue; one email per **sport**,
not per coach, so two coaches on one squad get one message. A coach with nothing
to chase is skipped, while the institution-wide copy still sends when empty,
because "the roster is current" is itself the assurance an administrator wants.
`executive` is deliberately **not** a recipient: oversight, not the worklist.

**Monthly digest.** Admin + executive receive a monthly summary with the
**holistic PDF attached** — the same bytes the download produces, not a second
rendering of it. If the render fails the digest downgrades to summary-only and
the wording follows what actually got attached, rather than losing the month.

Both run on an hourly tick against a persisted *month marker*, not a cron
instant, so a process that was down when one came due sends **late rather than
never**.

**Per-user opt-out.** Every profile page carries notification preferences. Two
gates, in order: the institution setting decides whether AIRMS sends this kind
of mail at all, then the user decides whether they still want it — a user cannot
opt *in* to something an admin switched off. Only the opt-**outs** are stored, so
a notification added later defaults to on. There is deliberately **no route by
which one account can mute another's** clinical alerts.

**Coach view — `/coach/dashboard`** (FYP II first-class role): a read-only squad-readiness board scoped to the coach's **one admin-assigned sport**. Every athlete appears with their HoloMotion overall-risk badge and a Full-Go / Observation / Restricted readiness band (mapped straight from the same cohort-normed band the medical team sees), sorted worst-first with each athlete's **worst screening region named** (e.g. "Ankle 27") and their active-injury count — so the coach sees at a glance who needs the medical team's attention. The board is **filterable by programme / gender / event**, and **selecting an athlete opens a read-only screening detail** (risk badge, radar, threshold strips, body map, events); the coach can also **download the team screening PDF** for their sport, and — from an athlete's detail view — the **individual screening PDF** for that athlete (athletes outside the coach's sport are refused server-side). Coaches cannot edit anything. A coach account is created and assigned their sport from **`/admin/personnel`** (there is no `/admin/coaches` route).

## 21. Pages added since this manual was last revised (2026-08-18)

These surfaces existed in the app but had never been written up here.

### 21.1 Programme Activity — `/admin/activity` (admin + executive)

The institution's screening programme over **time**, as opposed to §9's snapshot
of the current squad.

- **Coverage & recall** — how much of the roster has ever been tested, and
  whether what is held on them is still **current**. `rescreen_due_days`
  (default 180) drives *current / due-soon / overdue / never*, and **never** is
  counted apart from **overdue** because it calls for a first assessment, not a
  call-back. Recall is read across **all time**, never the selected window —
  when someone was last seen is a fact about the athlete, and windowing it would
  report a screened athlete as never screened.
- **Throughput** by month / quarter / year. The period axis is **continuous**: a
  quarter with no screening is drawn with zero tests rather than vanishing,
  because for a screening programme that gap *is* the finding.
- **Change between successive tests** — one diverging bar per metric on a shared
  **delta** axis. Bars point right for *better* rather than for a positive
  number (exercise risks improve by falling) while the printed figure keeps its
  true sign. The shaded band either side of centre is change too small to be
  told from measurement error; a bar drawn as an outline sits inside it.
- **Seasonality** — every screening pooled by quarter of the year with the year
  discarded ("which quarter is the risky one"). It **declines to name a season
  below two years of data** and says so before the table.
- **Download** the whole thing as `programme-activity.pdf`, drawn from the same
  code the page reads, so the screen and the filed document cannot quote
  different KPIs.

### 21.2 Activity Log — `/admin/audit` (admin + executive)

The append-only accountability trail: who did what, when. Filterable by action,
entity and date, with a **Staff activity** rollup and a PDF export.

**Downloads are counted apart from changes.** `coach` and `executive` cannot
write anything, so a write-only trail could never show them however much athlete
data they pulled — and an individual screening PDF carries a named athlete's
clinical scores. For a read-only role, *reading is the only auditable act*.
Summing reads and writes together would let an account that only reads outrank
the clinicians, so the two are reported separately.

Rows record the actor's name and role **copied onto the row**, not joined from
`users` — a trail that changes when someone is renamed or deleted is not a
trail. There is no edit or delete path anywhere.

### 21.3 Settings — `/admin/settings` (admin)

Institution-wide switches: minimum cohort size and tier fallback, the two
escalation rules, alert on/off and the band that triggers one, the monthly
digest, and the **rescreen interval** (2 / 3 / 4 / 6 / 9 months or 1 year).

### 21.4 Cohort Norms — `/medical/cohort-norms` (medical, with `editCohortNorms`)

The clinician-facing view of the norms an athlete is scored against: current
cohorts and their `n`, the membership panel (who is in, who is excluded and
why), and saved **versions**. A version can be **pinned** to become the norm *in
force* — while pinned, an import can no longer move the norms underneath a
cohort, and the page shows the **drift** between the pinned figures and what the
data would now say.

### 21.5 Athlete self-service — `/athlete/history` and `/athlete/squad`

**History** — the athlete's own screenings over time, led by **small-multiple
sparklines** (one panel per score, each scaled to its own range — the scores are
not commensurable, so they cannot share an axis). It deliberately asserts no
improving/declining verdict, because the detectable-change threshold is computed
cohort-wide and is not on the athlete-scoped payload. Selecting a past date puts
the whole dashboard into historical mode, where it stops speaking in the present
tense and stops advising on the next session.

**My Squad** — the athlete's own team, with their standing shown as a
**percentile** beside the raw rank.

### 21.6 Coach reports — `/coach/reports`

A coach downloads the **team** report for their own sport, and the
**individual** report for an athlete in it. Athletes outside the coach's sport
are refused server-side, and every download is written to the Activity Log
(§21.2).

---

---

*Last updated: 2026-08-18 — **brought back in step with the app after four months of drift.** This manual had been describing pages that no longer exist: `/athlete/injury-report`, `/medical/injury-log` and `/medical/review-reports` (all removed by the HoloMotion-only cut on 2026-08-02) had full sections, `/admin/staff` and `/admin/coaches` were cited as live routes, and §9 documented an Injury Analytics page whose KPIs and three charts had gone with the same cut. Those are corrected or replaced with dated removal records rather than deleted silently. Added: the five-role demo table (`coach` and `executive` were missing entirely), the IC number as the athlete key (it still said `ATH0001`), the rewritten §9 Screening Analytics, and §21 covering six surfaces that existed in the app but had never been written up — Programme Activity, the Activity Log, Settings, Cohort Norms, athlete History/My Squad and coach reports — plus the rescreen reminders, the monthly digest and the per-user email opt-out in §20. Previous: 2026-07-20 (later same day) — **the six FDD modules restructured** after Activity Tracking's removal (below): rather than leave a hole at "Module 1" or drop to five modules, the surviving feature set was redistributed across a fresh six (old Data Management split into Screening Data Ingestion and Cohort Norms & Governance). Module numbers used elsewhere in this manual's prose now refer to the **new** numbering — see `docs/fyp/FYP2_MODULES_USECASES.md` Appendix B if you're holding an older reference. Previous (2026-07-20, earlier same day): **Activity Tracking (then Module 1) removed entirely.** §3 rewritten as a retirement notice; §4.5 (Recent Activity table) removed from the athlete dashboard; §8 (medical dashboard) loses its Recent Activity table, Recovery baseline card, and Prevention insight card — all consumed data only that module produced. `risk.ts` (composite model, §6/§16 machinery) is unchanged code-wise but now has no live callers. Previous: 2026-07-16 — **ACWR removed from every dashboard.** §4 rewritten: the cohort-normed indicator is now the single risk verdict (§4.1 hero, paired with the §4.2 radar); the composite ACWR hero, load stat tiles and Workload Trend chart are gone from athlete + medical, and the coach's readiness now derives from the HoloMotion band (§20). Lumbar Disc Herniation removed from the radar, threshold strips, cohort chart and alerts (it was being shown against Dr Thung's requirement). Previous: 2026-07-14 — FYP II screening-centred redesign: §16 (cohort-normed overall indicator), §17 (admin cohort thresholds + settings), §18 (clinician override), §19 (three screening PDF reports), §20 (import-commit email alerts + coach view). Earlier: 2026-07-06 — §14 dashboard-embedded screening panel; §15 permission revocations vanish features; five-step injury intake. 2026-06-28 (HoloMotion PDF import, backup, staff permissions).*
