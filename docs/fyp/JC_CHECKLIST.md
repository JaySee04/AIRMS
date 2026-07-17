# Things for JC to check — FYP II redesign

> Running list of items I can't verify myself (they need your eyes, your
> judgement, or a real device/inbox). Grouped by build stage. Tick them off as
> you go; tell me if any is wrong and I'll fix. Nothing here blocks me
> continuing to the next stage.

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
  `verify:vision` (auto-selected by name; all 26 fields PASS via the `--json`
  path). *Still needs YOU for the true LIVE run:* I only have the report's
  rendered content, not the PDF bytes, and no vision key — so run
  `npm run verify:vision -- "<nazwan.pdf>"` from `backend/` with a key set to
  confirm the model itself reads it. Expect all-PASS.
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
- [ ] **`risk.ts` still runs** — it drives the recovery-baseline trigger and the
  medical prevention-insight card, and `/athlete/activity` is untouched. If a
  panellist asks "where did your graded composite model go?", the answer is
  `docs/fyp/ACWR_REBUILD.md` + those two live consumers. Confirm you're happy
  with that story.
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
- [ ] **Clinician override** — on the medical view, the Green/Amber/Red buttons
  prompt for a note and set the effective band (underlying stays). Try it on an
  amber/red athlete; confirm the flow + wording.

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

## Stage E — email alerts (upcoming)
- [~] **Test recipient supplied: `23005005@siswa.um.edu.my`** (2026-07-17). To
  demo a live alert landing in a checkable inbox, this should be a **recipient**,
  not the sender — point a seeded medical/coach account at it (I can wire that
  into the seeder on your word) so an import that flags an athlete emails it.
  - ⚠ **Sender caveat:** the current SMTP is a Gmail account
    (`poseidonapollo11@gmail.com`). Gmail will only send *as* its authenticated
    account or a verified alias — setting `SMTP_FROM` to the UM address will be
    rewritten or bounced by Gmail's SPF/DMARC. If you specifically want mail to
    originate *from* the UM address, you'd need UM's SMTP credentials in
    `backend/.env`. Otherwise keep the Gmail sender and use the UM address as the
    recipient. I did not touch the live `.env` (secrets; sending is your trigger).
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
- ACWR **demoted**, not deleted (secondary training-load view; rebuild spec to
  be written in Stage F).
- TMG files **not** ingested (different instrument); design language of their
  group report may inspire the team PDF only.
- Overall indicator = **equal-weighted z-score composite (Total Score of
  Athleticism method)**, cohort-normed, traffic-light banded.
- Min cohort size + fallback = **admin settings** (default n≥5).

*Started 2026-07-13. Updated as stages land.*
