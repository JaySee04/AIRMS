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

## Stage D — the three PDF reports (built)
- [ ] **Open the three PDFs in a real viewer** (Admin → PDF Reports → HoloMotion
  Screening Reports): Holistic, Individual (try ATH0061), Team (Badminton).
  *Note: text renders only in a real PDF viewer — my offline check could only
  confirm the bars/layout, not the text.* Confirm they read well for a
  non-domain-expert and the data is right.
- [ ] **Individual report progress section** shows only one row until an athlete
  has ≥2 screenings — import a newer report for Thung to see the stale→good
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
