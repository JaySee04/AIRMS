# Things for JC to check — FYP II redesign

> Running list of items I can't verify myself (they need your eyes, your
> judgement, or a real device/inbox). Grouped by build stage. Tick them off as
> you go; tell me if any is wrong and I'll fix. Nothing here blocks me
> continuing to the next stage.

## Stage A — screening history + expanded extraction

- [ ] **Uploader identity editing** — on the Data Uploading page, each queued
  report now has editable **Name / Age / Gender** fields (pre-filled from the
  report, or from the matched roster athlete). Confirm this reads/behaves right.
- [ ] **LDH in the upload preview** — Lumbar Disc Herniation is still shown in
  the upload *extraction-verification* table (so you can confirm the read). It
  is excluded from every actual **risk display** (dashboards/reports/alerts).
  Confirm you're OK with it appearing in the upload verification view only. If
  you want it hidden even there, say so.
- [ ] **Batch + layout-robust extraction** — importing Thung's PDF *and*
  Nazwan's PDF together should extract both (different page layouts). Thung
  updates stale→good; Nazwan matches the seeded ATH0062. *(I need Nazwan's PDF
  on disk to test the live batch — give me a path when ready, or confirm the
  in-chat copy is enough and where to find it.)*
- [ ] **Extraction cost** — extraction now sends the first 6 full pages
  (~6s, more tokens than the old 4-crop ~3.4s) because the two real reports use
  different layouts and fixed crops missed. Confirm the extra free-tier quota
  per import is acceptable, or we lower `VISION_RENDER_SCALE`.
- [ ] **Nazwan's cohort assignment** — seeded as ATH0062, **Badminton / PODIUM**
  (his report says sport "All/None", para athlete). Confirm that's a sensible
  sport/programme, or tell me what to use.

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
- [ ] **"⚠ critical" still fires for nearly every athlete.** Not the seed —
  the sport-critical watch threshold is 12, and real athletes routinely read
  14–27 across 7 regions, so *someone* is almost always above it. If you want
  the alert to mean something rarer, the lever is the sport-critical
  thresholds (12/20), not the data. Say the word and I'll model a few options.
- [ ] **~42% of athletes band red, and it's a ranking bug, not small cohorts.**
  The norms are computed over *everyone* at a tier, but the bottom-k **ranking
  group only contains athletes who fell back to that tier**. Measured live:
  11 resolved groups, two of which have **2 members** — with `bottom_k = 3`,
  *both* are automatically "bottom 3" → +1 escalation → red. Reds ≈ bottom_k ×
  number of resolved groups (3 × 11 ≈ 33; actual 25/59). Fix = rank an athlete
  against the same cohort they were normed against, not just the stragglers who
  resolved to that tier. That's a change to the graded indicator, so I left it
  alone — say the word.

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
- [ ] Provide the dedicated test Gmail so alert mail can be verified against a
  real inbox.
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
