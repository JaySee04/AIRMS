# AIRMS — Changes since 2026-06-10

> Consolidated record of system and documentation changes between **2026-06-10**
> and **2026-07-11** (22 commits on `feat/mysql-migration`). Written as source
> material for the FYP II logbook, monitoring sessions, and the report's
> System Development chapter. Commit hashes reference this repo's history.

---

## The arc of the period

The period delivered the **HoloMotion pivot end-to-end**: AIRMS moved from
"Excel roster upload" to a system whose screening data enters as ISN's real
artefact (the image-only HoloMotion report PDF, read by a provider-agnostic
vision model), renders on the dashboards against **sport-personalised
thresholds**, closes with a **training prescription** mirroring the report's
own, and is validated against a **ground-truth athlete transcribed 1:1 from
Dr Thung's actual report**. Around that spine: a permission-control rework,
a professional-standard injury intake, admin screening analytics, and a full
documentation/viva-prep alignment pass.

---

## 1 · Module 4 — HoloMotion PDF ingestion (the pivot)

**System**
- **Vision-AI ingestion path** (`f5b56c0`, 2026-07-01) — the HoloMotion report
  is jsPDF-generated with no text layer, so the backend renders its pages to
  images and a vision model extracts scores, the eight risk indicators, and
  the muscle lists as strict JSON. Two-step preview → commit (the model is
  called once per upload); operator supplies only Athlete ID / sport /
  programme. Provider-agnostic: one OpenAI-compatible adapter (OpenAI, Qwen,
  OpenRouter, local Ollama) + Anthropic native, switched by env vars;
  self-disables cleanly when unconfigured.
- **Token optimisation** (`53ab871`, 2026-07-04) — pages are cropped to their
  four data-bearing bands (measured against the real sample) instead of sent
  whole: ~58% fewer image pixels on top of skipping pages 4–12; captioned
  images; output cap 1500→800 tokens. `VISION_FULL_PAGES=1` falls back to
  whole pages if the template drifts. Extracted muscle names are Title-Cased
  so real imports match the body-map vocabulary.
- **Excel backup export** (`1f6f77c`, 2026-07-01) — admin downloads the full
  dataset as a multi-sheet workbook (athletes + injuries + muscle flags),
  preserving the Excel-era data as ingestion shifts to HoloMotion.

**Documents** — `DESIGN_DECISIONS §13` (rationale + rejected alternatives:
text extraction impossible, OCR misses gauge digits); `MODULES_STATUS`
Module 4 rewritten; `CLAUDE.md` env reference (`VISION_*`).

## 2 · Screening on the dashboards (display → panel → personalisation)

**System**
- **Screening display + sport-aware alerts** (`0856d4d`, 2026-07-01) — first
  iteration: dedicated screening-report pages + the sport-critical alert
  banner (each sport mapped to its highest-stress body regions).
- **Alert hardening** (`fef8e53`, 2026-07-04) — case/whitespace-insensitive
  sport matching with aliases (Running → Athletics, Soccer → Football…),
  malformed-value guards, a `hasData` state ("no screening ingested" vs
  "healthy"), severity-matched recommended-action line, shared
  `WATCH_THRESHOLD` across surfaces.
- **Dashboard-embedded panel** (`35996d2`, 2026-07-07) — the standalone
  screening pages were removed; a shared `ScreeningPanel` renders the latest
  report on the athlete and medical dashboards: five score gauges with tick
  marks at HoloMotion's 60/75/85 tier boundaries + the eight indicators as
  bullet-style **threshold strips** (tinted OK/Watch/High zones, marker
  coloured by zone, sport-critical regions starred).
- **Per-sport thresholds + Training Focus** (`b32497e`, 2026-07-11) — every
  athlete takes the same eight tests, but each indicator is banded against
  its region's **sport-specific thresholds**: critical regions tightened to
  12/20 (~20% stricter, the composite model's personalisation scale), others
  keep the instrument's 15/25. Tightening-only by design. The panel closes
  with **Training Focus** — corrective exercises with reps × sets · rest
  dosing drawn from the report's own Training Prescription vocabulary, for
  up to three out-of-range regions. Ground-truth validated: the sample
  report resolves to Ankle/Knee/Neck — the same three problems the report's
  own summary flags.

**Documents** — `USER_MANUAL §13–14`; `DESIGN_DECISIONS §15` (embedded
screening + HoloMotion-only data policy + thresholds/prescription extension);
`PROJECT_GUIDE` component/lib maps; `VIVA_ANSWERS §14` (threshold provenance,
personalisation axes, prescription answer).

## 3 · Data: HoloMotion-only + ground truth

**System** (`a977aee`, 2026-07-07)
- Seeded screening values are HoloMotion-shaped only: integer gauge scores,
  report-band indicators, muscle lists; weight/height null (not on the
  report); ~1 in 10 athletes unscreened so "no data" states are demoable.
- **ATH0061 Thung Jin Seng** — Dr Thung's own report transcribed 1:1
  (77/12/88/72/75, the eight printed risk circles, 3+3 muscle flags) with a
  login (`thung@isn.gov.my / airms2026): an ingest of the same PDF must
  reproduce this row exactly, so the pipeline has verifiable ground truth.
- John Doe (ATH0001) reshaped to HoloMotion-form integers preserving the
  Module 2 demo profile; Thung gets an 8-week masters-volume activity history.

**Documents** — demo-credential tables in `CLAUDE.md` and `USER_MANUAL`;
`PROJECT_GUIDE` seeder notes.

## 4 · Permission control (General Module)

**System**
- **Per-user feature permissions** (`a73032f`, 2026-07-01) — admin revokes
  individual capabilities (`viewRecords`, `uploadData`, `reviewReports`,
  `injuryReports`) per medical staffer or deactivates the account; opt-out
  model; enforced server-side by `requirePermission()` on every affected
  route; admin UI at `/admin/staff`.
- **Revocations vanish instead of dead-ending** (`6ecf169`, 2026-07-07) —
  the layout refreshes the session user from `/api/auth/me` on every load
  (revocation reaches the staffer's UI on next navigation, no re-login);
  blocked pages redirect to the first still-permitted page instead of an
  access-denied panel; the misleading "View injury log & generate reports"
  label became "Log & view injuries".

**Documents** — `DESIGN_DECISIONS §14` (+ refinement note);
`MODULES_STATUS` General Module; `USER_MANUAL §15`.

## 5 · Injury intake (Module 3)

**System** (`fdd3684`, 2026-07-07) — the injury-log form restructured around
the professional sports-medicine recording pattern (IOC / STROBE-SIIS
variable set) without touching the locked schema: five numbered sections
(Athlete → Incident → Location → Classification → Plan); the athlete's
active injuries surface on selection; prior records at the same body part
trigger a one-click **Recurrent** suggestion; severity as segmented buttons
with time-loss anchors (Minor 1–7d / Moderate 8–28d / Severe >28d);
structured notes prompt (Assessment / Treatment / RTP criteria).

**Documents** — `USER_MANUAL §6` rewritten to the five-step flow.

## 6 · Admin analytics (Module 5)

**System** (`2b44448`, 2026-07-07) — new "Screening Cohort — HoloMotion"
section: `GET /api/athletes/analytics/screening` aggregates
screened/unscreened counts, per-indicator OK/Watch/High band counts, cohort
averages, and most-flagged muscles; rendered as KPI tiles, per-indicator
stacked proportion bars in status colours, and ranked muscle bars.

**Documents** — `PROJECT_GUIDE` routes; `MODULES_STATUS` Module 5.

## 7 · Coach role (experimental, outside FYP I scope)

**System** (`55a3c73`, 2026-07-01) — read-only squad-readiness view scoped to
a coach's assigned sports, reusing `classifyCompositeRisk()` unchanged.
Deliberately outside the locked 3-role model and the FYP I artefacts — kept
as an FYP II option de-risker. Aligned to HoloMotion labelling on 2026-07-07.

## 8 · Performance, quality, tooling

**System**
- **Theme-aware charts** (`0d54fd3`, 2026-07-05) — Chart.js surfaces rebuild
  with a palette hook watching `data-theme`; dark-mode risk palette; fixed a
  nonexistent CSS token that left alert chips white in dark mode.
- **Perf pass** (`03ace82`, 2026-07-08) — dashboards lazy-load Chart.js and
  the body-map path data (first-load JS: athlete 210→114 kB, medical
  214→117 kB); `GET /api/injuries?limit=N` caps the injury-log payload
  (223→8 rows); the panel's duplicate muscle-flags card removed (BodyMap's
  flag cards already carry it).
- **Working lint + dead deps** (`31c67f1`, 2026-07-08) — ESLint had never
  been installed (the documented `npm run lint` couldn't run); added
  eslint@8 + eslint-config-next; whole codebase lints clean. Removed unused
  `axios`, `js-cookie`, `@types/js-cookie`. npm-audit decision documented
  (advisories require Next 15/16 — breaking; stack locked; localhost demo).

**Dev environment** — root-caused `errno -4094` build/lint crashes: OneDrive
"Free up space" turns `node_modules` files into cloud reparse points Node's
ESM loader can't read; fixed via `npm ci`, documented as `CLAUDE.md`
gotcha #7 (`ad340ae`, 2026-07-05) with the durable fix ("Always keep on this
device").

## 9 · FYP deliverables & viva prep

- **Report review fixes** (`6ee1d77`, 2026-06-11) — Foster citations removed,
  denormalisation note, `FYP_RUBRICS` punch list updated from the
  `FYP I REPORT (3)` review.
- **Deliverables-shift audit** (`96b0bac`, 2026-07-04) — the report/slides
  predate the pivot; `FYP_RUBRICS §5` gained nine shift items and
  `REPORT_EDIT_PACK.md` (R1–R10) provides paste-ready replacement prose.
  Four screenshot-ready diagram sources added (FDD, General + Data
  Management use-case diagrams, dual-path import activity diagram); the ERD
  was corrected (phantom `import_records` table removed — no such model —
  and `users` columns fixed).
- **Viva docs synced** (`436c35f`, 2026-07-05; extended 2026-07-07/08/11) —
  `VIVA_ANSWERS` gained the post-pivot Data Management Q&A (no-text-layer
  story, hallucination controls, token/cost, NDA/local-model answer), the
  sport-alert section, and threshold/prescription answers; `VIVA_SCRIPT`
  slides 16/20/24/29/37/38 renarrated (the old slide-37 ERD narration
  described entities that don't exist); rehearsal one-liners updated.
- **Doc-consistency audits** (`836739e` 2026-07-01, `20751ab` 2026-07-07,
  `31c67f1` 2026-07-08) — `MODULES_STATUS`, `PROJECT_GUIDE`, `USER_MANUAL`,
  `MASTER_CLARIFICATIONS`-adjacent references, and the demo-defensibility
  cheat sheet kept in lockstep with each feature wave.

---

## Still outstanding (as of 2026-07-11)

1. **Word report + slides edits** — apply `REPORT_EDIT_PACK.md` R1–R10 and
   re-screenshot the five diagram figures (sources in `docs/fyp/`)
2. **Live vision-API test** — set `VISION_API_KEY` and ingest the sample PDF;
   the result must reproduce ATH0061's seeded row exactly
3. **Visual pass** — click through all four role dashboards in both themes
4. Replace the stale `reports/FYP-I-Report.pdf` with the current draft

---

## Commit index

| Date | Hash | Change |
|---|---|---|
| 2026-06-11 | `6ee1d77` | docs: report-review fixes (Foster removal, denorm note, rubrics) |
| 2026-07-01 | `a73032f` | feat: per-user permission control for medical staff |
| 2026-07-01 | `f5b56c0` | feat: HoloMotion PDF ingestion (provider-agnostic vision) |
| 2026-07-01 | `1f6f77c` | feat: admin Excel data backup export |
| 2026-07-01 | `0856d4d` | feat: screening display + sport-aware injury alerts |
| 2026-07-01 | `55a3c73` | feat: experimental coach role (squad readiness) |
| 2026-07-01 | `836739e` | docs: sync to the above wave |
| 2026-07-04 | `fef8e53` | feat: harden sport-critical screening alerts |
| 2026-07-04 | `53ab871` | feat: token-optimised PDF ingestion (cropped bands) |
| 2026-07-04 | `96b0bac` | docs: deliverables-shift punch list, edit pack, diagrams |
| 2026-07-05 | `ad340ae` | docs: OneDrive reparse-point gotcha |
| 2026-07-05 | `436c35f` | docs: viva Q&A bank + script sync |
| 2026-07-05 | `0d54fd3` | feat: theme-aware chart palette |
| 2026-07-07 | `35996d2` | feat: screening folded into dashboards (threshold panel) |
| 2026-07-07 | `a977aee` | feat: HoloMotion-only seed data + ground-truth athlete |
| 2026-07-07 | `2b44448` | feat: admin screening-cohort analytics |
| 2026-07-07 | `6ecf169` | feat: revoked features vanish (hide + redirect + live refresh) |
| 2026-07-07 | `fdd3684` | feat: structured injury intake (pro-team workflow) |
| 2026-07-07 | `20751ab` | docs: sync to embedded screening + permission rework |
| 2026-07-08 | `03ace82` | perf: code-splitting, capped payloads, panel dedupe |
| 2026-07-08 | `31c67f1` | chore: working ESLint, dead deps removed, doc audit |
| 2026-07-11 | `b32497e` | feat: per-sport thresholds + Training Focus prescription |

*Compiled 2026-07-11 from `git log --since=2026-06-10` on `feat/mysql-migration`.*
