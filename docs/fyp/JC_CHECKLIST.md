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

## Stage B — cohort thresholds (upcoming)
_(items will appear here as the stage lands)_

## Stage C — overall risk indicator (upcoming)
- [ ] Does the traffic-light read the way you expect on the athlete/medical/coach
  views (once built)?

## Stage D — the three PDF reports (upcoming)
- [ ] Do the reports look right / readable to a non-domain-expert (once built)?

## Stage E — email alerts (upcoming)
- [ ] Provide the dedicated test Gmail so alert mail can be verified against a
  real inbox.

## Decisions already logged (no action needed, just FYI)
- ACWR **demoted**, not deleted (secondary training-load view; rebuild spec to
  be written in Stage F).
- TMG files **not** ingested (different instrument); design language of their
  group report may inspire the team PDF only.
- Overall indicator = **equal-weighted z-score composite (Total Score of
  Athleticism method)**, cohort-normed, traffic-light banded.
- Min cohort size + fallback = **admin settings** (default n≥5).

*Started 2026-07-13. Updated as stages land.*
