# Things for JC to check — FYP II redesign

> Running list of items I can't verify myself (they need your eyes, your
> judgement, or a real device/inbox). Grouped by build stage. Tick them off as
> you go; tell me if any is wrong and I'll fix. Nothing here blocks me
> continuing to the next stage.

## ⏳ Open right now — your remaining actions (as of 2026-08-01)

The short list you asked me to keep in front of you. Fuller detail for each is
in the stage section linked.

- [ ] **Open the three PDFs in a real viewer** (Holistic / Individual ATH0061 /
  Team Badminton) — Stage D below. *You said "later, remind me."*
- [ ] **Eyeball the injury-floor band distribution** — confirm you're happy that
  a significant active injury floors a clean athlete to amber (toggle is ON).
  Stage "Decisions 2026-07-27" above. *"remind me."*
- [ ] **Double-check the FDD figure + Table 4.1 render** once pasted into the
  report Word doc (module-column merge, diagram leaf wrapping) — restructure
  section at the bottom. *"remind me."*
- [ ] **Report writing + viva rehearsal** — the remaining big rock; `VIVA_SCRIPT.md`
  / `VIVA_ANSWERS.md` are the starting point (note their FYP I dating). *"remind me."*
- [ ] **Judge the injury features' necessity** (2026-08-02) — the manual injury log + Injury Report Builder are kept for now but now *integrated* so you can see their value: the Screening Analytics dashboard shows a screening↔injury bridge (e.g. "5 athletes would read Safe on HoloMotion alone but a logged injury lifts them to Needs-attention"). Decide later whether they earn their place. See `HOLOMOTION_SCOPE_2026-08.md`.
- [~] **Update the FDD / report / CLAUDE.md for the HoloMotion-only cut (2026-08-02)** — **DRAFTED 2026-08-06, one decision left for you.** `REPORT_TABLE_4-1.md` is rewritten (44 → **47** use cases across the same six modules, *after* deleting one — ten injury use cases out, thirteen screening ones in, incl. the name-redaction step that was built but never enumerated); `fdd-updated.html` regenerated to match; `REPORT_EDIT_PACK.md` revised (three of its instructions had gone actively wrong); `MASTER_CLARIFICATIONS §1` now states mission/vision/non-goals; CLAUDE.md and the docs folder re-synced.
  - [ ] **YOUR CALL — what is Module 2 now?** Recommended and drafted: recast it as **Athlete Roster & Identity Management** (athlete CRUD, IC-number key, ISN directory lookup, roster search, event list, the surviving injured flag — all built, all currently homeless in the use-case model). Alternatives: drop to five modules, or keep a one-use-case module. Decision box is at the top of `REPORT_TABLE_4-1.md`. **If you pick five modules, the FDD figure needs a column removed and its connector geometry regenerated.**
  - [ ] **Four diagrams still need regenerating** — flagged in `REPORT_EDIT_PACK.md` R6: the general UC diagram (permissions renamed), the data-management UC diagram (still shows both import paths), the data-import activity diagram (missing the redaction step), and the **ERD** (still has `injuries` + `self_reports`, missing `cohort_norm_versions` and the new athlete columns).
  - [ ] **Two things to write that the report has never mentioned** — paste-ready in `REPORT_EDIT_PACK.md`: **R7a** on-device name redaction (the strongest defensible contribution in the system) and **R7b** the IC-as-key trade-off. Expect a panel question on R7b.
  - Dormant ACWR files (`lib/risk.ts`, `WorkloadChart`) stay — unchanged decision.
- [ ] **Dr Thung sign-off** — the deployment gate you're keeping in view (kiv).
- [ ] **Rename the pushed branch** if you still want `feat/mysql-migration` off the
  working name (has an upstream — your call; see 2026-07-17 decisions).

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
