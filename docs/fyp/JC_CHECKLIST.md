# Things for JC to check — FYP II redesign

> Running list of items I can't verify myself (they need your eyes, your
> judgement, or a real device/inbox). Grouped by build stage. Tick them off as
> you go; tell me if any is wrong and I'll fix. Nothing here blocks me
> continuing to the next stage.

## ⏳ Open right now — your remaining actions (as of 2026-08-01)

The short list you asked me to keep in front of you. Fuller detail for each is
in the stage section linked.

- [ ] **Open the three PDFs in a real viewer** (Holistic / Individual / Team
  Badminton) — Stage D below. *You said "later, remind me."* Note the holistic
  report has changed substantially since that note: it now opens with programme
  activity and takes cohort filters + a region focus. (The old "ATH0061" here
  was the retired ID scheme — pick any athlete by name.)
- [x] ~~**Eyeball the injury-floor band distribution**~~ — **closed 2026-08-19:
  the feature no longer exists.** There is no injury escalation and no
  `escalation_injury_floor` setting. `isInjured` is now read in exactly one place,
  `isEligibleForNorms` in `utils/cohorts.js`, where it excludes an athlete from
  norm COMPUTATION — everyone is still scored against the resulting norm. The
  three live escalations are `escalation_below_mean` (at -0.5 SD),
  `escalation_bottom_k` and `escalation_indicator`; there is no fourth.

  The injury floor depended on injury severity, which went with the `Injury`
  model in the HoloMotion-only cut (2026-08-02). **Do not assert this feature in
  the viva** — the band distribution quoted further down this file
  ("screening-only 44/31/25 → with the injury floor...") is from that era and no
  longer describes the system. Current latest-screening distribution is
  **38 green / 9 amber / 9 red** of 56 screened (measured 2026-08-19 after the
  seeder began deriving Total Score from the subitem table — `DESIGN_DECISIONS.md`
  §34b; it read 43/10/5 of 58 before that). Quote it as evidence the pipeline
  runs end to end, **never** as evidence the model is calibrated — §33f.
  Stage "Decisions 2026-07-27" above. *"remind me."*
- [ ] **Double-check the FDD figure + Table 4.1 render** once pasted into the
  report Word doc (module-column merge, diagram leaf wrapping) — restructure
  section at the bottom. *"remind me."*
- [ ] **Report writing + viva rehearsal** — the remaining big rock. Start from
  [`VIVA_FYP2.md`](VIVA_FYP2.md) (written 2026-08-19), **not** `VIVA_SCRIPT.md` /
  `VIVA_ANSWERS.md`, which are frozen FYP I artefacts describing deleted code. The
  dossier carries the thesis, ten hard questions with citations, the weaknesses
  worth volunteering, the demo landmines, and a numbers table measured against the
  live database — re-measure it before you quote it. *"remind me."*
- [x] ~~**Judge the injury features' necessity** (2026-08-02)~~ — **moot.** The
  injury log and the injury report builder were deleted on 2026-08-02; the
  decision this item was waiting for has been taken. What remains of the
  question is whether Dr Thung accepts the substitution — tracked below.
- [x] **Update the FDD / report / CLAUDE.md for the HoloMotion-only cut (2026-08-02)** — **DONE 2026-08-06.** `REPORT_TABLE_4-1.md` rewritten (44 → **47** use cases across the same six modules, *after* deleting one — ten injury use cases out, thirteen screening ones in, incl. the name-redaction step that was built but never enumerated). **Module 2 recast as Athlete Roster & Identity Management** (your call, ratified 2026-08-06; the two rejected alternatives are recorded so the choice is defensible). **All five diagrams regenerated.** `REPORT_EDIT_PACK.md` revised — three of its instructions had gone actively wrong. `MASTER_CLARIFICATIONS §1` now states mission/vision/non-goals. CLAUDE.md and the docs folder re-synced.
  - [ ] **Now it's Word work — nobody but you can do it.** Apply `REPORT_EDIT_PACK.md` R1–R10 to the document, screenshot the five regenerated diagrams in a browser at 100% zoom, re-export, replace `reports/FYP-I-Report.pdf`.
  - [ ] **Two sections the report has never contained** — paste-ready: **R7a** on-device name redaction (the strongest defensible contribution in the system) and **R7b** the IC-as-key trade-off. **Expect a panel question on R7b** — it's the one place the design argues against itself.
  - Dormant ACWR files (`lib/risk.ts`, `WorkloadChart`) stay — unchanged decision.
- [ ] **Put the injury-summary question to Dr Thung (2026-08-07).** His most
  specific ask in the 2026-04-24 meeting was an administrator view of injury
  CASES — how many, which body part, left or right, what type, trending over
  time (transcript 12:01–12:39). The HoloMotion-only cut removed it on
  2026-08-02. AIRMS answers the anatomical half from screening instead, but
  cannot answer "how many knee injuries last year". **He should decide** whether
  that substitution is acceptable or whether a thin injury-reporting layer comes
  back — this should not surface first in the viva. Full analysis, with quotes:
  [`../stakeholder/REQUIREMENTS_TRACEABILITY.md`](../stakeholder/REQUIREMENTS_TRACEABILITY.md) §4.
  - [x] ~~Offer him **scheduled monthly reports** (§16) — only the schedule is
    missing~~ — **stale, corrected 2026-08-20: the schedule shipped.** He asked in
    those words ("something standard, then you can actually generate every
    month"), and it now exists end to end: a **monthly digest** to admin +
    executive with the holistic PDF **attached** (the same bytes the download
    produces), driven by a persisted month marker rather than a cron instant so a
    process that was down when it came due sends late instead of never
    (`DESIGN_DECISIONS §35`), runnable off the web process entirely via
    `npm run mail:tick` (§36), with the outcome of the last attempt persisted and
    shown in red on the admin Settings tile when it failed. There is also a
    **Send now** button. Do not offer this as future work — **demo it**.
  - [x] ~~Restore the **sport-context** card on the medical view (§11)~~ — **done
    2026-08-09**, rebuilt from screening data.
  - [x] ~~Name **seasonality** (§6 — "which quarter is the risky one") as future
    work~~ — **stale, corrected 2026-08-20: it is built.** `seasonality()` in
    `utils/screeningPeriods.js` pools every screening by quarter with the year
    discarded and ranks by the **share** flagged, and the holistic report prints
    it. What is still true is the data limit — and the feature **states it
    itself**: below two years of history it **declines to name a season**
    (`yearsCovered` / `sufficient`), and the report draws that caveat *before* the
    table. Present it that way. "Refuses to answer on thin data" is a stronger
    story than "not built yet", and it is the honest one.
- [ ] **Dr Thung sign-off** — the deployment gate you're keeping in view (kiv).
- [x] ~~**Rename the pushed branch**~~ — **decided 2026-08-18: leave it.** The name
  is inaccurate (it was about MySQL for three commits and has been all of FYP II
  for 238), and a rename is technically cheap: history survives, commit hashes are
  unaffected, it is reversible. It still loses. The branch has an upstream on a
  public remote, so a rename is delete-and-recreate and dangles anyone's clone;
  and **five docs name it in prose**, one of them
  [`CHANGES_SINCE_2026-06-10.md`](CHANGES_SINCE_2026-06-10.md), which is source
  material for the FYP II logbook and the report's System Development chapter and
  states "22 commits on `feat/mysql-migration`". Renaming would make graded-report
  source material wrong to buy cosmetic accuracy, days before viva.

  **Do not merge this branch into `main` either.** `main` is frozen at 2026-06-05
  and the branch point is `chore: pre-viva polish` — `main` **is** the FYP I
  submission state. That boundary is the FYP I → FYP II comparison an examiner
  asks for, and `CHANGES_SINCE_2026-06-10.md` depends on it. "`main` is FYP I,
  this branch is FYP II" is a one-sentence answer at viva; a 238-commit merge
  destroys it to make the default branch look tidier.

  If the stale default branch on GitHub ever bothers you, the zero-risk fix is
  the repo's **default-branch setting** (a UI toggle, reversible, breaks no
  clones) — not a rename and not a merge.

**Done this session (2026-08-01), no action needed:**
- ✅ Submission repo committed + pushed (`07d2c42..5446118`, clean scrub, OneDrive
  files re-hydrated first).
- ✅ Live email-notification demo fired for real — a self-report notification went
  out via Gmail SMTP to the two active-medical addresses; the checkable one is
  **23005005@siswa.um.edu.my** (the other, `medical@isn.gov.my`, will bounce —
  harmless). `notify()` returned `{sent:true, recipients:2}`.
- ✅ Coach "Suggested focus" + risk radar enhanced (clickable affected-athlete
  chips; over-threshold radar spokes now highlight red) — committed `1bc721c`.

## Decisions made on JC's behalf (2026-07-17)

You said "make the decisions for me." These are now **decided and in the code**
— listed so you can veto any one; silence = ratified. None needs action from you.

- **20% bottom-k cap** kept (the one change to the graded indicator; worth a line
  in the report — reasoning in `FYP2_REDESIGN_SPEC.md` §5.1).
- **"Elevated"** kept as the third band word (report reserves "High" for 56–100).
- **Sport-critical alert stays demoted** to "Regions behind this band" (amber/red only).
- **PDFs use standard bands; dashboards tighten sport-critical to 12/20** — the
  one-step difference is left as-is and stated on the PDF (unifying would mean
  duplicating the sport→region map server-side, which drifts).
- **Mobile out of scope** — one future-work line in Ch. 7; no half-fix.
- **Synthetic seed subitems** kept (Nazwan keeps his real values).
- **Nazwan seeded Badminton / PODIUM** kept (sensible demo cohort; hits n≥5).
- **LDH visible in the upload verification table only** kept (operator confirms the read).
- **Instant import commit** kept (dashboard ~2s stale right after; re-await is a
  one-line change I'll make *if* the gap ever shows in a live demo).
- **Cleanup executed** — see `DELETION_REVIEW.md`. Two candidates revised to
  "keep" (the screenings-history endpoint; the Mongo/MySQL history docs, which
  are cross-referenced). **Branch rename left to you** (it has a pushed upstream).

## Decisions made on JC's behalf (2026-07-27)

You said "make your own decisions." Decided and in the code — veto any; silence = ratified.

- **Active injuries now move the overall indicator (as a floor).** Previously
  injuries were logged / reported / analysed but never touched the risk score
  (the old `risk.ts` composite escalated on them, but it went dormant when
  ACWR/Activity were removed). A **clinically significant** active injury —
  Moderate/Severe, or any Chronic — now **floors the band at amber** ("needs
  attention"). A Minor still-recovering niggle is logged/shown but doesn't count.
  Admin-toggleable (`escalation_injury`, default ON, Thresholds page). Logging an
  injury / approving a self-report / editing recovery status re-scores in the
  background.
  - **Why a floor, not a +1 escalation** (decided after measuring): stacking it
    as another escalation took the squad to **36% red** — near the 42%-red
    over-escalation you fixed before, because it conflated the injury stream with
    the cohort signal. As a floor, red stays anchored to the **screening verdict
    (~25%)** and injuries lift clean athletes to amber instead. Measured:
    screening-only 44/31/25 (green/amber/red) → with the injury floor, greens
    with a significant injury move to amber; **red unchanged at ~25%**.
  - [ ] **Eyeball it.** If you'd still rather injuries not touch the score,
    flip the toggle off. Spec: `FYP2_REDESIGN_SPEC.md §5–6`.
  - [ ] **Confirm the escalation is what you want on the graded indicator** — it's
    the FYP II cohort model (extensible), NOT the locked ACWR `risk.ts` formula,
    so this didn't touch a locked decision — but it does change the headline
    score, so it's worth a line in the report.

## Stage A — screening history + expanded extraction

- [ ] **Uploader identity editing** — on the Data Uploading page, each queued
  report now has editable **Name / Age / Gender** fields (pre-filled from the
  report, or from the matched roster athlete). Confirm this reads/behaves right.
- [ ] **LDH in the upload preview** — Lumbar Disc Herniation is still shown in
  the upload *extraction-verification* table (so you can confirm the read). It
  is excluded from every actual **risk display** (dashboards/reports/alerts).
  Confirm you're OK with it appearing in the upload verification view only. If
  you want it hidden even there, say so.
- [x] ~~Batch + layout-robust extraction~~ — **pipeline validated 2026-07-17**
  against Nazwan's full 38-page report (provided in chat). The extraction
  prompt's section keys + `mapToAthlete` mapping match the report exactly
  (Anterior pelvic tilt→lumbar/pelvis, Ligament Strain→knee, Lumbar Disc
  Herniation→stored-hidden), and Nazwan is now a **second ground-truth set** in
  `verify:vision` (auto-selected by name). **LIVE RUN DONE 2026-07-17** — ran
  the real vision model (`gemini-flash-lite-latest`) against the actual PDF
  (JC-supplied path): **all 26 fields PASS**, ground truth reproduced exactly
  (identity + 8 scores + 8 risk indicators + both muscle lists + all 25 subitem
  values + 8/8 posture axes + 478-char summary), 5.7s across pages 1–6. The
  ingestion pipeline is now verified end-to-end against **both** real report
  layouts (Thung compact, Nazwan expanded).
- [x] ~~Extraction cost~~ — **resolved with evidence.** Nazwan's report proves
  the 6-page window is *minimal, not wasteful*: the data section is exactly
  pages 1–6 (Info+Summary p1, Muscle Imbalance p3, Posture p4, Risk Screening +
  Subitems p5, **Exercise Risk Evaluation p6**), and pages 7–38 are image
  analysis / trajectory / prescription we don't read. Dropping to 5 pages would
  lose all eight exercise-risk indicators. 6 is the floor for this layout.
- [x] ~~Nazwan's cohort assignment~~ — **confirmed.** The report carries no
  sport (HoloMotion doesn't capture it), so Badminton / PODIUM is an
  operator assignment and stands (ratified). Everything the report *does*
  contain — age 21, Male, all 18 scores, 6 muscle flags, 25 subitems — matches
  the seeded ATH0062 exactly (verified against the full report).

## Layout audit — ACWR removal + seed reshape (2026-07-16)

- [ ] **ACWR is gone from all three dashboards.** Athlete + medical lost the
  composite hero, the ACWR gauge, the load stat tiles and the Workload Trend
  chart; the cohort indicator is now a proper hero (big band + big 0–100 +
  plain-English "why"), paired with the risk radar. Coach lost the ACWR and
  Risk-level columns and its readiness now maps off the HoloMotion band.
  Athlete dashboard is ~650px shorter. **Eyeball all three.**
- [x] ~~`risk.ts` still runs — it drives the recovery-baseline trigger and the
  medical prevention-insight card, and `/athlete/activity` is untouched~~ —
  **superseded 2026-07-20.** Activity Tracking was fully removed (see the new
  section at the bottom of this file); `risk.ts` now has no live callers at
  all. If a panellist asks "where did your graded composite model go?", the
  answer is `docs/fyp/ACWR_REBUILD.md` — kept as a rebuild spec, not a "it
  still runs" story.
- [ ] **Seed injuries are realistic now** — recovery status is a function of how
  long ago the injury happened, so 19/62 athletes (31%) carry an active injury
  instead of 61/62 (98%). Coach readiness went 4/96/0% → 43/14/39%.
- [ ] **I tried skewing the seeded risk scores healthier and reverted it** — the
  two real reports (Thung 15/18/14/24/9/26/27, Nazwan 14/8/12/16/15/21/26) sit
  at a median of ~15 with half of all regions above 15, which is exactly what
  the existing `range(2,28)` reproduces. The seed was already faithful; the
  alert volume is a threshold problem (next item), not a data problem.

### Two things I found that need YOUR decision

- [x] ~~PDFs and dashboards disagreed about the same number~~ — **fixed
  2026-07-16.** One vocabulary now, everywhere: **Low ≤15 · Watch 16–25 ·
  Elevated >25**. AIRMS' Low boundary is the report's Low boundary exactly;
  above it AIRMS subdivides the report's broad Medium (16–55) into Watch and
  Elevated so ISN can act early, and **never says "High"** — the word the report
  reserves for 56–100, which no real reading approaches. Boundaries unchanged
  (15/25), so nothing re-banded; this was vocabulary + consistency only.
  Verified on ATH0061: Ankle 27 "Elevated", Ligament 26 "Elevated", Shoulder 18
  "Watch" — identical on screen and on the PDF.
  - [ ] **Confirm you're happy with the word "Elevated"** (it replaces "High"
    on the strips, alert chips, Training Focus and cohort chart) and with the
    reconciliation line each surface now carries.
  - [ ] **One place they can still differ by a step, by design:** PDFs show the
    standard bands; the dashboards tighten **sport-critical** regions to 12/20.
    So a 22 on a Badminton ankle is "Watch" on the PDF and "Elevated" on screen.
    The PDF now states this. Tell me if you'd rather the PDFs apply the
    sport-tightened thresholds too (means duplicating the sport→region map
    server-side, which will drift — I'd avoid it).
- [x] ~~"⚠ critical" fires for nearly every athlete~~ — **fixed 2026-07-16.**
  Measured: it fired for **59/59**. No threshold rescues it (to make it rare the
  sport-critical boundary would have to exceed the standard one — ~26 vs 25 —
  contradicting its tightening-only design; both real athletes trip it too). It
  was an *absolute* cut-off competing with the cohort-normed indicator, i.e. the
  exact thing the redesign argues against. Now it renders **only when the band
  is amber/red**, sits **below** the hero, and reads "Regions behind this band".
  The coach's squad-level version (listed 27 of 28) is gone; the coach table's
  Screening column now names the worst region (**"Ankle 27"**) instead of
  "⚠ critical" on every row.
- [x] ~~~42% of athletes band red~~ — **fixed 2026-07-16**, two causes:
  - **Ranking bug**: ranked against fallback stragglers (two groups of **2**
    with `bottom_k = 3` → auto-red) instead of the cohort's full membership.
  - **k vs cohort size**: fixing the ranking alone only moved red 42% → 41%.
    `bottom_k = 3` means the worst ~10–20% of a real ISN cohort (~15–30) but the
    worst **60%** of a 5-athlete one. `k` is now capped at 20% of the cohort,
    with `bottom_k` as the admin's ceiling.
  - Result: **green 51% · amber 31% · red 19%**; anchors preserved (Thung red
    42 / 2 esc, Nazwan green 57, John green 65).
  - [ ] **Confirm you're happy with the 20% cap** — it's the one judgement call
    here. It's derived, not arbitrary (bottom-3 of a realistic ~15-athlete
    cohort *is* 20%), but it does change the graded indicator, so it's worth a
    line in the report. Spec §5.1 has the full reasoning for the viva.

### Decision: mobile is OUT of scope (2026-07-16)

All 17 pages overflow horizontally at 390px (the sidebar is a fixed 256px and
never collapses; the grids already collapse at 980px). **Called out of scope,
deliberately:** AIRMS is an ISN institutional tool — staff import PDFs and review
dashboards on desktops — the viva runs on a laptop, responsive/mobile is not in
the 6-module FDD (the scope ceiling), and no mobile design exists in the locked
Figma UI. Half-doing it is worse than declaring it.

- [ ] **If you disagree, say so** — it's a contained change (turn the fixed
  sidebar into an off-canvas drawer under a media query; desktop untouched), not
  a redesign. Otherwise I'd put one line in Ch. 7 future work: *"the athlete
  surfaces are desktop-first; a responsive/mobile athlete view is future work."*

## Stage B — cohort thresholds (built)
- [ ] **Admin → Cohort Thresholds page** — eyeball it: settings (min cohort n,
  bottom-k, toggles), the approval queue (approve/revert), and editing a
  cohort's component means. Recompute button re-scores everyone.
- [ ] **Red-heavy band distribution is a seed artifact** — small demo cohorts
  (n≈5–8) make "bottom-3" a large fraction, so ~half seed as red. Real ISN
  cohorts (20–50) won't. Confirm you're fine with this for the demo, or raise
  `min_cohort_n` / concentrate the seed further.
- [ ] **Cohort assignment** — seed roster is concentrated into 5 sports
  (Badminton/Swimming/Athletics/Football/Hockey) so cohorts hit n≥5. OK?

## Stage C — overall risk indicator (built)
- [ ] **Traffic-light badge** reads right on the athlete dashboard, the medical
  per-athlete view, and the coach table (compact column). Green=safe,
  amber=needs attention, red=immediate assessment.
- [ ] **Clinician override** — redesigned 2026-07-25 into `ClinicianBandOverride`
  (replaced the bare Green/Amber/Red buttons + `window.prompt`). On the medical
  view it's the "Clinical assessment" card under the risk hero: outcome-labelled
  Safe / Needs-attention / Immediate-assessment cards, `In force` + `Calculated`
  provenance tags, and the required note captured inline (not a browser prompt).
  Try it on an amber/red athlete; confirm the flow + wording, and that the set
  band + note render on that athlete's own dashboard and the coach's view.

## Stage D — the three PDF reports (rebuilt at TMG scale, 2026-07-15)
- [ ] **Open the three PDFs in a real viewer** (Admin → PDF Reports → HoloMotion
  Screening Reports): Holistic, Individual (try ATH0061), Team (Badminton).
  Now rebuilt to the TMG report density you asked for: Exercise Risk Evaluation
  on the printed legend (Low 0–15 / Medium 16–55 / High 56–100) with radar,
  the Physical Fitness Subitem Score disc table (60/75/85 tiers), an
  Interpretation section, per-athlete snapshot blocks in the team report, and
  page numbers. *This time every page was rendered to an image and eyeballed —
  text included — so this is a taste check, not a smoke test.*
- [ ] **Synthetic subitems in the seed** — all screened athletes now carry a
  plausible generated subitem table so the reports/balance component have
  signal (Nazwan ATH0062 keeps his real page-5 values; real imports carry real
  ones). Thung's seeded indicator shifted 42 → 38 (still red, 2 escalations)
  because balance now participates. OK?
- [ ] **Risk names in the PDFs use the printed HoloMotion labels** (Neck Pain,
  Anterior Pelvic Tilt, Ligament Strain, Ankle Sprain…) rather than AIRMS's
  internal column names — confirm you want the printed vocabulary.
- [ ] **Individual report progress section** shows only one row until an athlete
  has 2+ screenings — import a newer report for Thung to see the stale→good
  delta appear.

## Stage E — email alerts
- [x] ~~Provide a test recipient inbox~~ — **wired 2026-07-17.**
  `23005005@siswa.um.edu.my` is now a seeded active **medical** user (Medical
  Demo 02, password `medical123`). Medical staff receive an alert for *every*
  flagged athlete, so any import that lands an athlete amber/red emails this
  real inbox. Verified via `alertMany(['ATH0061'])`:
  `To: medical@isn.gov.my, 23005005@siswa.um.edu.my, coach@isn.gov.my`.
  - **To see it live:** the vision key is configured + working, so just import a
    PDF that flags an athlete (Thung's stale→good, or any red athlete) and check
    the UM inbox. (An alert also fires on the seed's own recompute, so it can be
    triggered without any import too — ask me.)
  - ⚠ **Two bounce-backs per alert are expected:** the other two recipients
    (`medical@isn.gov.my`, `coach@isn.gov.my`) are fake seed addresses, so the
    Gmail SMTP account gets a bounce for each. Harmless; delete them. If you
    want a *pristine* demo with zero bounces, say so and I'll make the seeded
    medical/coach emails deliverable (or gate dev sends to real addresses only).
  - ⚠ **Sender stays Gmail** (`poseidonapollo11@gmail.com`): Gmail only sends
    *as* its authenticated account, so the UM address can't be `SMTP_FROM`
    without UM's own SMTP credentials. Used as a recipient, which is what a
    live-inbox demo needs. Live `.env` untouched (secrets; sending is your trigger).
- [ ] **Stray bounce mail (one-off, 2026-07-15)** — while testing the new
  post-import queue I discovered `SMTP_HOST` is now live (Gmail), so one real
  alert email went out to the seeded fake addresses
  (`medical@isn.gov.my`, `coach@isn.gov.my`). Expect 1–2 bounce-backs in the
  poseidonapollo11 inbox; safe to delete. Subsequent tests forced the console
  mailer.

## Perf pass 2 — post-import queue (2026-07-15)
- [ ] **Commit responses are now instant** — the cohort/indicator recompute +
  alerts run in a debounced background queue (~1.5s) after each commit, and a
  batch of N PDFs coalesces into ONE recompute instead of N. Trade-off: for a
  couple of seconds after an import commits, a dashboard you already have open
  may still show the pre-import indicator until the queue flushes (a refresh
  after that shows the new value). Verified live: 3-commit burst → 1 recompute,
  alert only for the red athlete. Confirm the demo flow feels right (import →
  open dashboard) — if the gap ever shows in a viva demo, we can re-await the
  queue on single-file commits.

## Decisions already logged (no action needed, just FYI)
- ACWR **demoted 2026-07-16, then Activity Tracking (its only input) fully
  removed 2026-07-20** — see the section below. The formula stays locked/
  citable for the report; nothing computes it anymore.
- TMG files **not** ingested (different instrument); design language of their
  group report may inspire the team PDF only.
- Overall indicator = **equal-weighted z-score composite (Total Score of
  Athleticism method)**, cohort-normed, traffic-light banded.
- Min cohort size + fallback = **admin settings** (default n≥5).

## Activity Tracking removed (2026-07-20)

> Note: "Module 1" below means the **original FYP I decomposition** (Activity
> Tracking). After the same-day restructure documented further down, "Module
> 1" now refers to Athlete Dashboard & Overall Risk Indicator instead.

- [x] **Module 1 (FYP I numbering) fully removed, at your request.** `/athlete/activity`
  (frontend page + Sidebar link), `backend/src/models/Activity.js` +
  `routes/activities.js`, and `backend/src/models/RecoveryBaseline.js` +
  `routes/recoveryBaselines.js` are all deleted. Seeder no longer generates
  activity logs or recovery baselines. This was an explicit, accept-the-
  fallout decision (ACWR's dashboard display was already gone since
  2026-07-16, so nothing surfaced the module's output anymore) — not a bug.
- [x] **Fallout, all cleaned up rather than left dangling:** the athlete
  dashboard's Recent Activity table, the medical dashboard's Recent Activity
  table + recovery-baseline card + prevention-insight card, and the athlete
  profile's Activity-derived stat tiles (sessions logged, sessions in last
  30 days, total training load) are all gone. `frontend/src/lib/risk.ts` is
  **kept** (locked decision) but now has zero live callers anywhere.
- [x] **Docs updated:** `CLAUDE.md`, `MASTER_CLARIFICATIONS.md`,
  `MODULES_STATUS.md`, `PROJECT_GUIDE.md`, `USER_MANUAL.md`,
  `README_FOR_CLAUDE_CODE.md`, plus this checklist, `DELETION_REVIEW.md`,
  `ACWR_REBUILD.md`, `REPORT_TABLE_4-1.md`, `FYP2_SIX_MODULES.md`,
  `FYP2_MODULES_USECASES.md`, `FYP2_RESEARCH_AND_MODULES.md`,
  `SYSTEM_ALGEBRA.md`, `STORAGE_MECHANISMS.md`, `DESIGN_DECISIONS.md`, plus
  the `fdd-updated.html` / `erd-corrected.html` diagrams. `VIVA_SCRIPT.md` /
  `VIVA_ANSWERS.md` were deliberately left as historical record (already-
  delivered FYP I viva) with a dated note instead of a rewrite.
- [x] **Report/FDD story decided:** you asked to keep six modules rather than
  drop to five — see the restructure section below. Module 1 no longer reads
  as "removed"; it's a different, live module now.

## Module set restructured to stay at six (2026-07-20, same day)

- [x] **You asked to redistribute the surviving 44 use cases across six
  modules** rather than leave a gap at "Module 1" or drop to a five-module
  system. Decision made via two rounds of `AskUserQuestion`: (1) keep six by
  redistributing vs. drop to five — you chose redistribute; (2) which split —
  you confirmed the recommended one.
- [x] **The split:** the old "Screening Data Management & Cohort Norms"
  module (10 UCs, the largest) is now two modules — **Screening Data
  Ingestion** (import/extract/preview/match/commit) and **Cohort Norms &
  Governance** (recompute/alerts/thresholds/settings/backup, plus "View
  Screening Cohort Analytics" moved in from the old Analytics module).
  Every other module kept its shape, renumbered down by one to close the gap.
- [x] **Clean UC-1–44 renumbering** — no gaps, all cross-references (Appendix
  A/B in `FYP2_MODULES_USECASES.md`, `REPORT_TABLE_4-1.md`,
  `FYP2_SIX_MODULES.md`, the FDD diagram, `MASTER_CLARIFICATIONS.md §4`,
  `MODULES_STATUS.md`) updated to match.
- [ ] **Double-check the FDD figure and Table 4.1 render correctly** once
  pasted into the actual report Word doc — the module-column merge in Word
  and the diagram's leaf wrapping are worth a visual pass.

*Started 2026-07-13. Updated as stages land.*
