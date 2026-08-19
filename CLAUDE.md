# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project context

AIRMS (Athlete Injury Risk Management System) is JC's Final Year Project. Stakeholder: **Dr Thung** at Institut Sukan Negara (ISN). Supervisor: **Dr Hoo Wai Lam**. This is a graded academic artifact — every architectural decision needs to be defensible in viva voce, not just shippable.

**Mission:** *turn ISN's existing HoloMotion screening reports into a risk signal a clinician, a coach and an athlete can each act on — without any of them needing to read a PDF.* Ingest what ISN already produces (the HoloMotion PDF is the **single source of truth**), score each athlete against their real peer cohort rather than a published threshold, and deliver that one explainable verdict in four role-shaped views. Norms are institution-governed (approved, versioned, auditable); the clinician can always override with a note; the athlete's name is redacted on-device before any image leaves the machine.

Full **mission / vision / non-goals** — including the list of features that were deliberately cut and must not be revived — is at the top of [`docs/README_FOR_CLAUDE_CODE.md`](docs/README_FOR_CLAUDE_CODE.md). Read it before proposing anything new.

## Required reading before non-trivial work

The project ships its own extensive docs. Treat these as the source of truth — they win over inferences from code:

1. [`docs/README_FOR_CLAUDE_CODE.md`](docs/README_FOR_CLAUDE_CODE.md) — entry point, reading order, communication norms
2. [`docs/MASTER_CLARIFICATIONS.md`](docs/MASTER_CLARIFICATIONS.md) — locked architectural decisions; **this file wins** when other docs disagree
3. [`docs/MODULES_STATUS.md`](docs/MODULES_STATUS.md) — what's shipped vs deferred per module
4. [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md) — file-level map (models, routes, components, pages)
5. [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) — read before suggesting "improvements" that may have already been considered and rejected
6. [`docs/FYP_RUBRICS.md`](docs/FYP_RUBRICS.md) — current rubric weighting + pre-viva punch list

## Commands

All commands run from project root (PowerShell on Windows; backtick is the line-continuation char, not `\`):

```powershell
# First-time setup
npm install                # root deps (concurrently)
npm run install:all        # installs root + backend + frontend
npm run seed               # drops + reseeds MySQL with deterministic PRNG (seed=42)

# Day-to-day
npm run dev                # backend :5000 + frontend :3000 via concurrently
npm run dev:backend        # backend only
npm run dev:frontend       # frontend only

# Frontend type-check / lint
cd frontend; npx tsc --noEmit -p tsconfig.json
cd frontend; npm run lint  # next lint

# Frontend production build
cd frontend; npm run build

# Unit tests (jest, in both packages — no linter configured for the backend)
cd backend; npx jest      # 18 suites: cohorts, overallIndicator, permissions, rbac, pdfDraw,
                          # screeningPeriods, cohortFocus, visionUsage, alerts, scheduler,
                          # bands, mailPrefs, holisticReport, programmeActivity, subitemAggregate,
                          # reliability, rescreenReminder, riskIndicators
cd frontend; npx jest     # 8 suites: lib/risk.ts, lib/screeningUploadStore.ts, bodymap-data/muscles.ts,
                          # components/charts (rendered via react-dom/server — no jsdom needed),
                          # lib/bands.ts, lib/athleteSearch.ts, lib/rank.ts,
                          # lib/screeningAlerts.indicators.ts
```

Jest covers the pure logic: scoring/permissions (`backend/tests/`), the PDF
drawing toolkit (`backend/tests/pdfDraw.test.js` — renders reports headlessly
against a fake `res`, no DB needed), the holistic report's filter/filename logic
and drawing (`holisticReport.test.js` — mocks the models, so no DB), the band
vocabulary and the email opt-out (`bands.test.js`, `mailPrefs.test.js` — both
guard failure modes that are *silent*: a band comparison that disagrees between
two call sites, or a preference that reads as consent), the composite risk model
(`frontend/src/lib/risk.test.ts`) and the body-map muscle partition
(`frontend/src/components/dashboard/bodymap-data/muscles.test.ts`).

**The silent-failure suites are the point.** Three more were added for the same
reason — a wrong answer that looks like a right one: `reliability.test.js`
(the derived detectable-change threshold, which must *decline* rather than
invent one below `MIN_PAIRS`), `rescreenReminder.test.js` (a coach's recall
slice must never disagree with the institution's about who is overdue), and
`riskIndicators.test.js` + `frontend/src/lib/screeningAlerts.indicators.test.ts`,
which pin the two packages' indicator lists to each other and **assert the LDH
exclusion across every derived view** — a leaked indicator would render as an
ordinary row, so the constraint is asserted rather than left as an absence.

**PDF tests assert on the OUTPUT, and are proven by mutation.** `winAnsiSafe`
once shipped defined, exported, unit-tested and **never called** — the wiring
edit silently matched nothing, and every test passed, because a pure function is
correct whether or not anybody calls it. `tests/helpers/capturePdfText.js` now
patches `PDFDocument.prototype.text` *before* construction, which puts the
recorder **underneath** the instance-level guard, so an unwired guard fails;
`capturePaintOps` does the same for `fill`/`stroke`, since the dead-band outline
(§30a) leaves no trace in page text. Every such assertion was checked by
**breaking the code and watching it fail** — un-wiring `guardText`, refilling the
outlined bar, deleting the reason sub-line, removing `changeCell`'s zero case.
**When adding a PDF test, mutate the thing it guards and confirm it fails**; a
test nobody has seen fail is a guess about what it covers — and re-confirm
after any refactor of the test file, since a refactor can quietly neuter an
assertion. Write new cases through the `paintOf` / `textOf` lifecycle helpers
(both route through `startDoc`, deliberately: a bare `PDFDocument` would skip
the guard installation the tests exist to verify). Note also that
counting paint ops is a trap — the dead-band *zone* is itself a fill, so fill
counts coincide between opposite renderings; assert on the fill **colour**.

There are still no page or end-to-end tests, and **route handlers are only tested
where their logic has been extracted into a util** (`holisticReport`). Anything
touching a route body, a page or the import flow is verified manually: run
`npm run dev`, log in with the demo credentials below, click through the affected
flow. Some paths are additionally checked by driving the util directly against the
dev database from a `node -e` script — see the verification notes in recent commit
messages for what that looked like.

## Demo credentials (seeded)

| Role | Email | Password |
|---|---|---|
| athlete | `athlete@isn.gov.my` | `athlete123` (John Doe — the athlete key is now the IC number, e.g. `070202021001`; `npm run seed` prints each demo athlete's IC) |
| athlete | `thung@isn.gov.my` | `thung123` (Thung Jin Seng — seeded as a deliberately STALE earlier assessment so importing the sample HoloMotion PDF visibly updates his dashboard to the printed values; extraction ground truth lives in `backend/scripts/verify-holomotion-extract.js`) |
| medical | `medical@isn.gov.my` | `medical123` (Medical Demo 01) |
| medical (alert inbox) | `23005005@siswa.um.edu.my` | `medical123` (Medical Demo 02 — real deliverable inbox; import-commit alerts land here so the email feature demos against a checkable inbox) |
| admin | `admin@isn.gov.my` | `admin123` |
| admin (SMTP demo) | `poseidonapollo11@gmail.com` | `admin123` (real-Gmail account so the email-reset flow demos against an inbox you can check) |
| executive | `executive@isn.gov.my` | `executive123` (Datuk Executive — **read-only oversight**: admin analytics + PDF reports, and nothing that writes) |

Seeded passwords intentionally do not satisfy the 10-char + complexity password policy — the policy gates user-driven password setting via `change-password` / `reset-password`, not seeded fixtures.

## Architecture overview

Three-tier monorepo orchestrated by `concurrently` from the root `package.json`. There is no shared types package — frontend and backend each maintain their own type definitions.

**Backend** (`backend/`, Node + Express + Sequelize on MySQL, JWT auth on every protected route):
- Entry: `backend/src/server.js` mounts routes, connects to MySQL via Sequelize, registers CORS for both `:3000` and `:3001`
- RBAC enforced via `middleware/rbac.js` — `rbac('medical', 'admin')` style — on top of `middleware/auth.js` which verifies the `Authorization: Bearer <jwt>` header
- Models in `backend/src/models/` use Sequelize hooks for derived/computed behaviour (e.g. `User`'s `beforeSave` hashes a changed password) — derived values are persisted, not computed on read
- The canonical foreign key across tables is `athleteId` (VARCHAR) — its VALUES are now the athlete's **IC number** (12 digits, e.g. `"890202021001"`), replacing the old `ATH0001` scheme (A2, 2026-08-04). The column name stays `athleteId` (internal) and is serialised as `_id`; the UI labels it "IC Number". Engine-level FKs are defined in `models/index.js`
- Every response goes through `utils/serialize.js`, which aliases the numeric `id` to a stringified `_id` field and reassembles Athlete's flat columns into the nested `risks` / `myodynamia[]` / `tension[]` shape the frontend reads
- Module 2 is **Athlete Roster & Identity Management** (athlete CRUD keyed by IC number, roster search, event vocabulary, ISN directory lookup, clinician injury-status flag). It was **Injury & Recovery Logging** until the HoloMotion-only cut (2026-08-02) deleted the `Injury` and `SelfReport` models, `routes/injuries.js`, `routes/selfReports.js` and the self-report→injury promotion transaction. There is no injury table, no injury history and no athlete self-reporting; what survives is a single clinician-set flag on the Athlete row (`isInjured` / `injuryNote` / `injuryBy` / `injuryAt`), written by `PATCH /api/athletes/:id/injury` (medical + admin), whose purpose is cohort-norm eligibility. **The recast was ratified by JC on 2026-08-06** along with the UC-1–47 rewrite in `docs/fyp/REPORT_TABLE_4-1.md` — that file is the authority for Chapter 4. Module numbering is now settled; **still do not renumber or rename modules on your own**
- Module 5 (Analytics & Reporting) PDF generation streams `application/pdf` directly from `routes/screeningReports.js` using `pdfkit` (no temp files). Its injury-analytics half went with the same cut; what remains is screening-derived reporting (holistic / individual / team), plus two document exports: the **Activity Log** (`activity-log.pdf`) and the **Programme Activity KPI report** (`programme-activity.pdf`, added 2026-08-11 — coverage, throughput, within-athlete change, seasonality and activity-by-account, drawn from the same `utils/programmeActivity.js` the page reads so the screen and the document cannot quote different KPIs). **All pdfkit drawing (palette, gauges, radar, tables, body figure, the interpretation generator) lives in `utils/pdfDraw.js`** — the route file is routing, data fetching and page composition only. The **holistic** report went one step further (2026-08-10): its fetch and draw live in `utils/holisticReport.js` so the monthly digest can attach the identical bytes instead of a second definition of the report. `backend/tests/pdfDraw.test.js` and `holisticReport.test.js` render headlessly against a fake `res` / an in-memory doc, so PDF changes have smoke coverage without a DB
- **Screening Analytics shows the squad's SHAPE, not only its averages** (2026-08-11). Three graphics: a **squad body map** (the licensed per-athlete figure fed the cohort mean subitem table — the page had no anatomical view in a product built on body regions), a **risk-vs-movement scatter** with quadrants split on cohort medians (Total Score and Exercise Risks measure different halves of the report, so an athlete can move well and still score risky — 13 do, and no averaged panel surfaces them), and an **indicator distribution histogram** (a mean of 50 is produced equally by everyone at 50 and by half at 30 / half at 70). The analytics response now carries one `points` row per athlete for these. See `docs/DESIGN_DECISIONS.md §25`
- **PDF text is sanitised at the drawing boundary** (`winAnsiSafe` / `guardText` in `utils/pdfDraw.js`, 2026-08-18). pdfkit's built-in Helvetica is **WinAnsi**: a character outside that set measures **zero width** and prints as mojibake, without warning or throwing. The toolkit avoided arrow glyphs in code it authored, but text from the **database** was unprotected — `screenings.factors` carries a real `≥` and the coach-sport audit summary a real `→`, both fine on the web and unreadable once printed. `doc.text` is wrapped once in `startDoc`/`bufferDoc`, so every draw is covered and **already-stored rows are repaired** without a rescore. Do not "fix" this by editing the producers: the constraint belongs to pdfkit, and the dashboards render those glyphs correctly. `—`, `·`, `×`, `±` and `–` all render and are deliberately left alone. See `docs/DESIGN_DECISIONS.md §30f`
- **The holistic report draws its programme activity** (2026-08-18). An audit of which drawing primitives each report actually calls found the holistic report — the flagship admin document, and the one the monthly digest **attaches** — using 4 of 17, presenting as a *table* what Programme Activity draws as a **throughput chart** and as a *text list* what it draws as a **change chart**, off the identical data. Both are now drawn there too, chart-then-table in the same pairing and for the same stated reason: the chart answers "is this going up" at a glance, the table is what someone quotes in a meeting, and neither replaces the other. See `docs/DESIGN_DECISIONS.md §30`
- **The team report draws the squad's body** (`squadMuscleFigure` in `utils/pdfDraw.js`, 2026-08-18). The group was described anatomically twice — a muscle-flag hotspot bullet list and a numeric heatmap — and drawn never, in a product whose whole vocabulary is body regions and whose individual report opens with a front/back figure. It reuses that same licensed figure fed the group's **mean** subitems from `aggregateSubitems`, so the map cannot quote a different average from the heatmap printed beside it; the tier key was extracted to `tierLegend` rather than written twice. The mean-is-not-the-group caveat is drawn with it. Found by **printing six reports and reading them** — which also caught a `bar()` value column overprinting the row beneath it, and a change chart whose longest bar was a sub-threshold move labelled "steady" (the dead band is now part of the scale, drawn as a shaded zone, and bars inside it are outlined rather than filled — a chart that contradicted the §27 caveat printed directly above it). All three passed every unit test: they are properties of the rendered page, not of the values. See `docs/DESIGN_DECISIONS.md §30`
- **The subitem table is charted at squad level** (`utils/subitemAggregate.js` → Screening Analytics, 2026-08-11). The 25-cell Physical Fitness Subitem table is the densest thing HoloMotion produces — Total Score is literally its mean — and the admin dashboard aggregated none of it. Two panels: a 5×5 **heatmap** (tier-coloured from `lib/holomotionTiers.ts`, so a 74 is the same amber as every gauge), and **left–right asymmetry**, which nothing in AIRMS showed anywhere. Asymmetry is the only bilateral data the report carries and it was collapsed three ways — the body map paints the WORSE of L/R, the cohort composite averages every gap into `balance`, and the subitem table left the subtraction to the reader. The panel **counts athletes with a ≥10-point gap** rather than averaging gaps: the means are flat at 3–4 everywhere, the counts run 0–9. `weakerSide` is named for what a clinician acts on (it was `leans`, which returned "right" for a left-dominant squad). See `docs/DESIGN_DECISIONS.md §23`
- **Sparse grains get their own chart type** (2026-08-11). Two periods draw a **change chart** — one diverging bar per metric on a shared DELTA axis, so "ROM fell 5.2 while stability rose 2.6" is visible where two headcount columns showed only headcount. This started as a slopegraph and was unusable: a shared VALUE scale needs commensurable metrics, and these cluster at 72–78 (movement), ~50 (indicator) and ~18 inverted (risks), so four lines collapsed into overlapping pixels — the §23 flattening mistake, reintroduced. The values cannot share a scale; the changes can. Bar direction is the ORIENTED gain (right is always better) while the printed number keeps its true sign. Line colour comes from the API's `direction`, never the sign of the delta, because exercise risks improve by going DOWN. One period shows its **composition** (the same rows one grain finer: year → quarters, quarter → months) rather than a number and an apology. See `docs/DESIGN_DECISIONS.md §26`
- **The period axis is CONTINUOUS** (`utils/screeningPeriods.js`, 2026-08-11). Buckets are filled between the first and last period that has data, so a quarter with no screening is drawn with zero tests instead of vanishing — for a screening programme that gap IS the finding. Nothing is padded before the first screening. A period after a gap reports NO delta (its predecessor is empty), which replaced comparing across the gap as though the two were consecutive. `grainCounts` ships with every response so the grain buttons can show what each view would draw; one period renders as a summary, not a chart. See `docs/DESIGN_DECISIONS.md §24`
- **Seasonality** (`seasonality()` in `utils/screeningPeriods.js`, a section in the holistic report) answers Dr Thung's "*which quarter* is the risky one" by pooling every screening by quarter of the year with the year discarded. It **declines to name a season below two years of data** (`yearsCovered` / `sufficient`) and the report draws that caveat *before* the table — with one year, "Q3 is worst" is indistinguishable from "Q3 is when the weaker squads were screened", and this is the one output whose plausible failure is a confidently wrong institutional decision. Ranks by the *share* of flagged screenings, not the count, because throughput differs by quarter
- **"Is this change real?" has an answer now** (`utils/reliability.js`, 2026-08-12).
  Every direction-of-travel verdict in AIRMS — the change chart, the
  between-tests panel, seasonality, the coach's arrows — used one hardcoded
  `noise = 2`. Nothing derived it, which is the single most-cited weakness of
  traffic-light systems generally (Robertson et al., *IJSPP* 2017, list
  "evidence-based guidelines … for the boundaries used for categories" as open
  work). It now computes the **typical error** (SD of within-athlete differences
  / √2) and **MDC95** (2.77 × TE) per score from repeat screenings, and uses
  MDC95 as the dead band. Two honesty properties, both deliberate: the repeats
  are months apart so they contain real change as well as measurement error,
  making this an **upper bound** that under-calls change rather than over-calls
  it; and it **declines** below `MIN_PAIRS` (20) or when a score never moved,
  falling back to the documented 2 and saying so on screen and in the PDF. On
  the seeded data it correctly declines — 19 pairs, and four scores identical in
  every pair. `PERIOD_SCORES` moved to `utils/periodScores.js` to break the
  require cycle. **Do not "fix" the decline by lowering the floor** — the whole
  point is that the threshold is earned or labelled as an assumption
- **Rescreen reminders** (`runReminderOnce` in `utils/scheduler.js`, 2026-08-16).
  A page only tells you something when somebody opens it, which is the wrong
  shape for a fact that decays on its own — so the recall list is also emailed to
  **admin + medical** monthly, with `never screened` listed apart from `overdue`
  because that one needs a first assessment rather than a call-back. Reports
  against `rescreen_due_days` and **nothing else**: giving the reminder its own
  threshold is how an email comes to say "overdue" while the dashboard says
  "current". Same marker-not-cron design as the digest (`rescreen_reminder_last_sent`,
  day capped at 28, marked only after a successful send, marked even with no
  recipients so an all-opted-out institute is not retried hourly), its own
  try-block on the shared tick so a digest failure cannot cost the reminder its
  month, and a per-user opt-out (`rescreen_reminder` in `NOTIFY_KEYS`). The admin
  Settings tile offers the interval as 2/3/4/6/9/12 months. `executive` is
  deliberately NOT a recipient — oversight, not the worklist. **Coaches get
  their own sport only** (2026-08-16): the recall is computed ONCE on the full
  roster and each email is a *slice* of it, so a coach's copy cannot disagree
  with the institution's about who is overdue; one email per SPORT rather than
  per coach, so two coaches on one squad get one message; and a coach with
  nothing to chase is skipped, while the institution-wide copy still sends when
  empty because "the roster is current" is itself the assurance an administrator
  wants
- **Rescreen recall** (`rescreenRecall` in `utils/programmeActivity.js`,
  2026-08-12). Coverage says whether an athlete was ever tested; recall says
  whether what we hold on them is still current, which is the question a
  screening programme actually runs on. `rescreen_due_days` (setting, default
  180) drives current / due-soon (last 20% of the interval) / overdue / **never**
  — and `never` is counted apart from `overdue` because it calls for a first
  assessment, not a call-back. Read across **all time**, never the report's
  from/to window: when someone was last seen is a fact about the athlete, and
  windowing it would report a screened athlete as never screened
- **Per-athlete trend + percentile framing (2026-08-12).** `ScreeningHistory`
  leads with **small-multiple sparklines** (one panel per score, each scaled to
  its own range) — the same non-commensurable-axis rule as §23/§26, which is why
  it is six panels and not one chart. It deliberately asserts no
  improving/declining verdict, because the detectable-change threshold is
  computed cohort-wide and is not on the athlete-scoped payload. The hero now
  reads the cohort standing as a **percentile** (`lib/rank.ts`, mid-rank
  `(r-0.5)/n`) beside the raw rank
- **Accountability & transparency (2026-08-10).** These actions write an append-only
  `AuditLog` row: `screening.import`, `screening.override`, `screening.reinstate`,
  `athlete.injury`, `norm.restore`, `norm.pin`, `norm.unpin`, `norm.member`,
  `settings.update`, `user.create`, `user.update`, `report.download`,
  `export.backup`. The last three were added **2026-08-11**: the trail recorded
  only writes, so `coach` and `executive` — who cannot write anything — could
  never appear in it however much athlete data they pulled. For a read-only role
  *reading is the only auditable act*, and an individual screening PDF carries a
  named athlete's clinical scores, so all five report endpoints and the backup
  export now log (`entityId` = the athlete on an individual report). Downloads are
  counted **apart from** changes in Staff activity (`ACCESS_ACTIONS` in
  `routes/audit.js`) — summing them would let an account that only reads outrank
  the clinicians. Rows are written at the point the response commits to
  streaming, so a 403 or 404 logs nothing. Surfaced at
  **Admin → Activity Log** (`/admin/audit`, admin + executive; 403 for medical and
  coach) with action/date filters, a **Staff activity** rollup, and a PDF export
  (`GET /api/screening-reports/activity-log.pdf`). Audit writes are
  **fire-and-forget** — logging must never fail the operation it describes — so a
  lost row is silent; that is the right trade for transparency logging and the
  wrong one for anything the institution must *prove*. Provenance already stored
  on the records themselves (`Screening.importedBy`, `Screening.overrideBy`,
  `Athlete.injuryBy`) is now displayed in Screening History and the cohort
  members panel
- **Cohort norms can be PINNED (2026-08-11).** Saving a norm version was an archive; a **pin** makes one saved set the norms *in force*, and `recomputeCohorts` then HOLDS `stats`/`n` instead of overwriting them, so an import can no longer move the norm every athlete is scored against. `pinned_norm_version_id` in settings is the switch the engine reads; pinning reuses the restore installer so the live `cohort_thresholds` rows genuinely ARE the snapshot and the scorer still reads one table. While pinned, recompute parks what the data *would* say in `fresh_stats`/`fresh_n` and `pinDrift()` surfaces the gap — a frozen norm with no staleness signal would be worse than none. Restoring another version over a pin, and deleting the pinned version, both 409; a cohort first seen after the pin is still created live (`added_since_pin`) because the pin must never leave an athlete unscoreable. `norm.pin` / `norm.unpin` are audited. See `docs/DESIGN_DECISIONS.md §22`
- **Green is not "Safe", and a stale screening says so** (2026-08-19, `DESIGN_DECISIONS.md §33`). A clinical review of all five dashboards against the screening literature. The green band reads **`No indicators flagged`** (`None flagged` compact): a screen that cannot predict injury cannot certify its absence, and since most athletes are low-risk, green is exactly where false reassurance lands. Implementing it found `BAND_LABEL` in `utils/bands.js` **had no green key at all**, so `pdfDraw.js` and `athlete/squad/page.tsx` had grown private copies saying "Safe" — three definitions, now one. The hero also states the screening's **age and recall state** when not current, classified by `utils/recall.js`, which was **extracted** so the hero and the monthly recall email cannot disagree about who is overdue. Cohorts below 10 peers now caveat themselves (49 of 58 athletes are scored against fewer than 11). Asymmetry is a **percentage** at the threshold (`NOTABLE_GAP_PCT`) but deliberately NOT in the composite's `balance`, which is z-scored and so already scale-free. **Do not present the seeded 43/10/5 band split as calibration evidence** — the seeder randomises the movement components independently, so their real-world collinearity is invisible here.
- **The norms in force are PINNED, and the eligibility floors are off** (2026-08-19). `Pre-viva baseline 2026-08-19` snapshots all 50 cohorts and is pinned, so an import can no longer move the reference every athlete is scored against; verified by recomputing while pinned — 50 of 50 held, all 50 parked `fresh_stats` for `pinDrift()`. Releasable from the same page. The three `norm_min_*` floors stay **0 (off)** on purpose: excluding low scores from a norm computed on those very scores is selection on the dependent variable — it censors the left tail, biases the mean up, shrinks the SD and over-flags whoever is left. Excluding the *injured* is different and stays, because injury is an external fact about whether a screening represents the athlete at all. See `docs/DESIGN_DECISIONS.md §32`
- **Norm eligibility is immediate.** Declaring an athlete injured
  (`PATCH /api/athletes/:id/injury`) or clearing their tick
  (`PATCH /api/cohorts/members/:athleteId`) rebuilds the cohort norms and rescores
  every indicator **in the same request** — it used to be deferred to "the next
  recompute", which made the exclusion real in the rules and invisible in the
  published norm. Both surfaces re-read the cohort rows afterwards, and a one-time
  `NormChangeNotice` modal discloses that the norm moves (dismissible for good)
- **Email.** Import alerts are grouped **one email per recipient** (medical see
  every flagged athlete, each coach only their own sport) — they were one email per
  *athlete*, so a 15-PDF batch sent 15 mails to every medical inbox. Injury
  declarations notify the sport's coach in **both** directions (`notify_injury`).
  A **monthly digest** (`utils/scheduler.js`) emails admin + executive: hourly tick
  against a persisted `digest_last_sent` month marker rather than a cron instant,
  so a process that was down when it came due sends late instead of never. It
  **attaches the holistic PDF** — fetch and draw live in `utils/holisticReport.js`
  so the email sends the same bytes the download does; a render failure downgrades
  to summary-only and the copy follows what actually got attached
- **Per-user email opt-out** (`utils/mailPrefs.js`, `users.notify_prefs`, on every
  profile page). **Two gates, in order:** the institution setting decides whether
  AIRMS sends this kind of mail at all, then the user decides if they still want
  it — a user cannot opt *in* to something an admin switched off. Opt-**out** shape
  like `User.permissions` (null = everything on), and only the opt-outs are stored,
  so adding the column could not silence an existing alert and a notification added
  later defaults to on. The endpoint addresses `req.user` only: there is
  deliberately no route by which one account can mute another's clinical alerts
- **Vision token usage** is captured per import (`utils/visionClient.js`
  normalises OpenAI-compatible `prompt/completion` and Anthropic `input/output`)
  and shown on the Activity Log row. A HoloMotion report costs ~11,400 tokens
  (~9,288 image + ~700 prompt + ~1,400 reply) at the default 6 pages
- **The seven shown risk indicators have one definition PER PACKAGE** — `utils/riskIndicators.js` on the backend and the `INDICATORS` list in `frontend/src/lib/screeningAlerts.ts` (2026-08-18). This list is not a display detail: it encodes Dr Thung's instruction that `spinalDiscHerniation` (LDH) is stored but **never** scored, charted, printed or named, so "which indicators are shown" and "LDH is excluded" are the same decision — and it had been hand-maintained in **eight** places (five backend, three frontend), each with a comment pointing at the others. `routes/athletes.js` held an inline copy *and* the shared import, one per handler. Two label vocabularies are kept on purpose and are not synonyms: `label` is the terse UI wording ("Knee"), `reportLabel` is HoloMotion's own printed wording ("Ligament Strain") so a clinician can check a line against the PDF in hand. `EXCLUDED_RISK_KEYS` names the exclusion as a value so it can be **asserted** rather than left as an absence; `riskIndicators.test.js` and `screeningAlerts.indicators.test.ts` pin the packages together. Verified byte-identical report output. See `docs/DESIGN_DECISIONS.md §31`
- **Risk band vocabulary has one definition PER PACKAGE** — `utils/bands.js` on the backend and `frontend/src/lib/bands.ts` on the frontend (added 2026-08-11; six frontend files had their own map and the red band was "Immediate assessment" in the risk hero but "Immediate" in the trend legend and admin distribution bar). The frontend module exports BOTH a full `BAND_LABEL` and a compact `BAND_SHORT` deliberately — a legend has no room for the long form — and `lib/bands.test.ts` pins the full labels to the backend's wording, since there is no shared types package to enforce it. Grain labels and the screening-date format live in `lib/periods.ts` for the same reason. Backend: (`BAND_RANK`,
  `BAND_LABEL`, `effectiveBand`, `atLeastAsBad`). `BAND_RANK` had stood in three
  files and `BAND_LABEL` in two; new code should call `effectiveBand(screening)`
  rather than inline `overrideBand || overallBand`, which is the one expression
  here that could be written backwards and silently ignore every clinical override
- Module 3 (Screening Data Ingestion) is **HoloMotion PDF only** (the Excel import was retired 2026-07-12; code archived in `archive/excel-upload/`). Two-step flow: `POST /api/upload/screening/pdf/preview` (render + vision-extract, no commit) → `POST /api/upload/screening/pdf` (commit the previewed JSON). The uploader is batch-capable (sequential extraction). **The athlete's name is redacted on-device (page-1 OCR locates it, blacks out the value) before any image reaches the vision model** — so the sole direct identifier never leaves the machine (`utils/redactName.js`; see `docs/DESIGN_DECISIONS.md §18`). The operator then attaches each report to a roster athlete by **name search** (`AthleteSearchSelect`), which fills Athlete ID/sport/programme from the roster; the commit backfills the name server-side. The Excel **backup export** (`GET /api/export/backup.xlsx`, Module 4 — Cohort Norms & Governance) remains

**Frontend** (`frontend/`, Next.js 14 App Router, TypeScript, plain CSS with variables):
- Pages live under `frontend/src/app/<role>/<slug>/page.tsx` — the URL hierarchy is the role-based access boundary (`/athlete/*`, `/medical/*`, `/admin/*`)
- Every authenticated page wraps its content in `<DashboardLayout allowedRoles={[...]} title="...">` (`components/layout/`). The layout enforces client-side role gating; backend RBAC is the actual security
- Auth state is JWT in `localStorage`, managed via `lib/auth.ts` (`saveSession` / `getSession` / `clearSession`). API calls go through `lib/api.ts` which auto-attaches the bearer token
- Modules 1 and 6 (Athlete Dashboard & Overall Risk Indicator, Clinical & Squad Monitoring) share the same dashboard components (`BodyMap`, `WorkloadChart`, `RiskRadar`, `ScreeningPanel` — the embedded HoloMotion report with threshold strips; there are no standalone screening pages) and the same `classifyCompositeRisk()` from `lib/risk.ts` — the medical view is "the athlete dashboard with a clinician's affordances added"
- Styling: a single `frontend/src/styles/globals.css` with CSS custom properties. Dark mode via `[data-theme="dark"]` on `<html>`. **Do not introduce CSS-in-JS, Tailwind, or component libraries.**
- **There is a design scale — use it (2026-08-16, `DESIGN_DECISIONS.md §29`).** Type `--fs-2xs|xs|sm|md|lg|xl|2xl`, radius `--r-xs|sm|md|lg` (+ `999px` for pills), spacing `--sp-xs|sm|md|lg|xl`. Named for ROLE, not size. The file previously held 31 distinct font-size literals and the markup another 160 inline ones that bypassed the stylesheet entirely — **do not add a new literal**; pick the nearest step, or change what the step means. `--radius` is an alias of `--r-md`, kept because it was already in use.

**The FYP differentiator — `frontend/src/lib/risk.ts`:**

> **Status change 2026-07-16 — read this first.** ACWR / composite risk is no
> longer shown on ANY dashboard. JC removed it: the "SECONDARY · Training Load"
> card visually dominated the primary cohort-normed indicator, and the athlete
> was reading three competing verdicts at once. Removed from athlete + medical
> (hero, ACWR gauge, load stat tiles, Workload Trend chart) and from coach
> (readiness now derives from the HoloMotion band; ACWR + Risk-level columns
> gone).
>
> **Status change 2026-07-20.** Activity Tracking (the FYP I Module 1 — sRPE
> session logging, `/athlete/activity`) was **fully removed** — frontend page,
> Sidebar link, `Activity`/`RecoveryBaseline` backend models + routes, seeder
> data all deleted. It was `risk.ts`'s only training-load input, so the
> recovery-baseline auto-trigger and the medical prevention-insight card (both
> of which depended on `classifyCompositeRisk()`'s ACWR argument) were retired
> alongside it. **`risk.ts` is NOT deleted** — the composite risk model
> formula is a locked decision — but it currently has **no live callers
> anywhere in the app**. The full rebuild spec (and this feature's fuller
> history) is `docs/fyp/ACWR_REBUILD.md`. Do not "restore" the ACWR heroes or
> Activity Tracking without asking; do not delete `risk.ts` either.
>
> **Restructure, same day.** Rather than leave a hole at "Module 1" or drop to
> five modules, JC asked to redistribute the surviving feature set across a
> fresh six — the old Data Management module split into **Screening Data
> Ingestion** and **Cohort Norms & Governance**. Every "Module N" reference
> elsewhere in this file uses the **current** numbering (Module 1 = Athlete
> Dashboard & Overall Risk Indicator, ..., Module 6 = Clinical & Squad
> Monitoring). Full mapping: `docs/fyp/FYP2_MODULES_USECASES.md` Appendix A/B.

> **Status change 2026-08-11 — what the hero SHOWS changed, not the model.**
> The cohort-normed 0-100 indicator is no longer the hero's headline number.
> HoloMotion's own **Total Score, as printed on the report**, is — because it is
> the one value a clinician can check against the PDF in their hand, and because
> "what is 54?" was a question the abstract score could not answer. The indicator
> is still computed, still persisted and still drives ranking, alerts, report
> ordering and the coach table; it is simply not the thing displayed. In its place
> the hero shows a **signed per-component comparison against the cohort** plus a
> **two-sided reason list** (why assess / why not). Rationale, the evidence that
> HoloMotion's Total Score excludes injury risk entirely, and why raw Total Score
> alone was rejected: `docs/DESIGN_DECISIONS.md §21`.

It implements `classifyCompositeRisk()` which:
1. Computes a vulnerability score from the athlete's screening data (injury risk index, overall activity score, mobility, stability, symmetry)
2. **Personalises** the textbook Gabbett ACWR thresholds (0.8 / 1.3 / 1.5) by ±~15% based on vulnerability
3. **Escalates** the risk band when active injuries or muscle flags align with the current workload

Do not weaken this to plain Gabbett ACWR. If a refactor touches `risk.ts`, mention it in the response and re-check against `docs/MASTER_CLARIFICATIONS.md §6`.

## Locked decisions (cannot change without discussion)

From `docs/MASTER_CLARIFICATIONS.md §12`:

- The role model: FYP I shipped **3 roles** (athlete / medical / admin); **FYP II promotes `coach` to a first-class 4th role** (read-only, sport-scoped — squad readiness, team-report download, athlete screening detail, individual screening-PDF download for their sport's athletes). **A 5th role, `executive`, was added on JC's instruction 2026-08-08** — read-only institutional oversight (admin analytics + the three PDF reports) with no write access anywhere: no import, no norm edits, no roster or personnel changes, no settings, no backup export. It is deliberately NOT a "super admin": it has strictly fewer powers than `admin`, and naming it super-admin would misdescribe it. Adding *further* roles still needs discussion.
- The composite risk model formula
- sRPE method for load calculation (`load = duration × intensity`) — validated by Inoue (2022) for scale reliability and Yang (2024) for physiological correspondence. **Retired 2026-07-20** along with Activity Tracking (the only thing that computed it) — the formula itself stays locked/citable for the FYP report, it's just not implemented anywhere right now
- The body map asset source — path data adapted from MIT-licensed [`react-muscle-highlighter`](https://github.com/soroojshehryar/react-muscle-highlighter) by Sorooj Shehryar; lives in `frontend/src/components/dashboard/bodymap-data/` with MIT attribution preserved at the top of every file. **This attribution must stay in the FYP references section.**
- ~~The aggregation policy: figure shows regions, side cards show specific muscles~~ — **changed 2026-08-04.** The body map's Muscle Flags mode now draws HoloMotion's 22 individual muscles (`bodymap-data/muscles.ts` partitions the licensed geometry; 16 come from sub-paths the asset already had, 6 deep ones are insets). ROM & Stability mode still draws regions — the subitem score is genuinely 5 regions. Side cards unchanged. The **asset source + MIT attribution stay locked**; only the grain changed. See `docs/DESIGN_DECISIONS.md §4a`
- The Figma-derived UI (split login card, sidebar branding, topbar dropdown)
- The MySQL schema for `Athlete` and `Screening` (Sequelize models in `backend/src/models/`). ~~`Injury`~~ — that model was deleted by the HoloMotion-only cut (2026-08-02); the lock no longer has a subject
- ACWR thresholds 0.8 / 1.3 / 1.5 as the baseline
- The escalation rules that set the band (below-cohort-mean, bottom-k, per-indicator outlier). **Changed 2026-08-11:** the below-mean rule now fires at `escalation_below_mean_z` (default **-0.5 SD**) instead of any `z < 0`. A sign test flagged ~half of every cohort by construction — 27 of 58 seeded athletes tripped it and 12 of the 14 ambers rested on it alone, one at z = -0.163. Recomputing moved the seeded distribution from 29/14/15 to **41 green / 13 amber / 4 red**

The live models are exactly: `User`, `Athlete`, `AthleteDiscipline`, `Screening`, `MuscleFlag`, `CohortThreshold`, `CohortNormVersion`, `Setting`, `AuditLog` (see `backend/src/models/index.js`).

`AuditLog` is append-only: rows are written by `utils/audit.js` from the routes that
perform an action and only ever read back. There is no update or delete path
anywhere, and the actor's name and role are **copied onto the row** rather than
joined from `users` — a trail that changes when someone is renamed or deleted is
not a trail. Its table is created by `npm run seed`, or by boot-time
`sequelize.sync()` **only when `SQL_SYNC=1`**.

~~Injury enums are locked (`docs/MASTER_CLARIFICATIONS.md §9`)~~ — **no longer applicable.** The `Injury` model and its enums are gone, so the old "`Overuse` is a mechanism, not an `injuryType`" seeder trap cannot occur. `MASTER_CLARIFICATIONS.md §9` is retained as a historical record of the FYP I schema.

## Environment

**Backend** (`backend/.env`, not committed):
```
PORT=5000
JWT_SECRET=...
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000,http://localhost:3001

MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD='...'             # wrap in single quotes if it contains # $ % ^
MYSQL_DATABASE=airms

# SMTP for the password-reset emails (UC-2). If unset the mailer falls back
# to a console transport that prints the email body to the backend terminal.
SMTP_HOST=smtp.gmail.com         # leave blank for the console-fallback dev mode
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=...@gmail.com          # any provider works; Gmail / Mailtrap / SendGrid all tested
SMTP_PASS=...                    # for Gmail use a 16-char App Password (NOT your normal password)
SMTP_FROM='AIRMS <...@gmail.com>'

# Vision provider for HoloMotion PDF (Module 3 — Screening Data Ingestion) ingestion — the sole screening
# import path (Excel import retired; archive/excel-upload/). If unset, the PDF
# uploader self-disables (backup export unaffected). Provider-agnostic:
# the 'openai' wire format covers OpenAI / Gemini / Qwen (DashScope) /
# OpenRouter / Ollama; 'anthropic' is the native format. Switch with env only.
# Gemini free tier (AI Studio key) via its OpenAI-compatible endpoint:
#   VISION_PROVIDER=openai
#   VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
#   VISION_MODEL=gemini-flash-lite-latest   # verified 18/18 vs ground truth 2026-07-12
#   (gemini-2.0-flash has zero free quota; gemini-2.5-flash-lite is closed
#   to new users — use the -latest aliases)
# Ground-truth test once a key is set (from backend/):
#   npm run verify:vision -- "<path to thung jin seng_0122663031.pdf>"
VISION_PROVIDER=openai           # openai | anthropic
VISION_API_KEY=...               # leave blank to disable PDF ingestion
VISION_BASE_URL=                 # optional endpoint override (Qwen/OpenRouter/Ollama)
VISION_MODEL=gpt-4o-mini         # any vision-capable model id
VISION_MAX_PAGES=                # leading pages sent to the model (default 6 — covers
                                 # both compact & expanded HoloMotion layouts). Extraction
                                 # renders full pages of the data section (layout-robust),
                                 # not fixed crops — HoloMotion ships >1 page layout.
VISION_RENDER_SCALE=             # render scale 1-4 (default 2). Does NOT reduce Gemini
                                 # tokens: its crop unit is floor(min(w,h)/1.5), derived
                                 # from the image's own dimensions, so an A4 page is 2x3
                                 # = 6 tiles at every scale (measured 9,288 image tokens
                                 # at scales 1, 1.5, 2 and 3). VISION_MAX_PAGES is the
                                 # real lever — 1,548 tokens per page. Lowering the scale
                                 # only costs gauge legibility.
```

When you change `SMTP_*` values, restart the backend — the mailer transport is built once and cached.

**Frontend** (`frontend/.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

## Known dev-environment gotchas

1. **Stale Next.js process holds port 3000** → new instance auto-bumps to 3001 → CORS blocks API calls. Backend allows both as a safety net, but the cleaner fix is `Stop-Process -Id <pid> -Force` and restart `npm run dev`. Never edit CORS as a workaround.
2. **MySQL password with special characters** (`#`, `$`, `%`, `^`) must be wrapped in single quotes in `backend/.env` so `dotenv` doesn't interpret them.
3. **Seeder enum errors** — the classic offender (`Injury` enums) went with the model. The live enums to check seed data against are:
   - `User.role` — `athlete` | `medical` | `admin` | `coach` | `executive` (adding a value needs an `ALTER TABLE users MODIFY COLUMN role ENUM(...)` on an existing dev DB; a fresh clone gets it from `npm run seed`)
   - `cohort_thresholds` gained `fresh_stats` (JSON), `fresh_n` (INT), `fresh_at` (DATETIME) and `added_since_pin` (TINYINT default 0) for norm pinning on 2026-08-11 — `ALTER TABLE` them on an existing dev DB, same `SQL_SYNC=1` caveat
   - `users.notify_prefs` (JSON, per-user email opt-out, added 2026-08-10) likewise needs `ALTER TABLE users ADD COLUMN notify_prefs JSON NULL AFTER permissions` on an existing dev DB — boot-time `sequelize.sync()` only runs when `SQL_SYNC=1`. `NULL` is the correct default and means "every notification on"
   - `Athlete.gender` — `Male` | `Female`; `Athlete.sex` — `M` | `F` (two separate columns)
   - `Athlete.program` — `PODIUM` | `PELAPIS` | `OTHERS`
   - `MuscleFlag.flagType` — `myodynamia` | `tension`; `MuscleFlag.side` — `L` | `R` | `B`
   - `Screening.overallBand` / `overrideBand` — `green` | `amber` | `red`
   - `CohortThreshold.tier` — `spgd` | `spg` | `sg` | `s` | `all`; `CohortThreshold.status` — `pending` | `approved`
4. **`Access denied for user 'root'@'localhost'`** during seed/boot means either the password is wrong or MySQL isn't running. Confirm with `Get-NetTCPConnection -LocalPort 3306`.
5. **The prototype folder** `airms-prototype/` is the inherited HTML reference from prior students (Shewin, Keying). It is **not deployed**, but design copy and component layouts are cherry-picked from it. Don't delete it.
6. **HoloMotion PDF rendering uses a `canvas` npm alias** → `@napi-rs/canvas` (prebuilt, declared in `backend/package.json`). Do **not** `npm install canvas` (node-canvas) — it needs a native compiler and fails on this Windows/Node setup. The alias is what lets `pdfjs` render the image-only HoloMotion PDFs. See [docs/DESIGN_DECISIONS.md §13](docs/DESIGN_DECISIONS.md).
7. **`Error: UNKNOWN, read (errno -4094)` from `next build` / `next lint`** — the repo lives inside OneDrive, and OneDrive's "Free up space" converts `node_modules` files into cloud reparse points that Node's ESM loader cannot read (even after hydration; plain `fs` reads work, the ESM fast path doesn't). Diagnose with `dir /s /a:l /b node_modules | find /c ":"` (counts reparse files); fix with `npm ci` in the affected package (rewrites plain files). It recurs whenever OneDrive frees space again — the durable fix is keeping OneDrive from dehydrating the project (right-click → "Always keep on this device") or moving the repo out of OneDrive.
8. **`npm run build` while `npm run dev` is running corrupts the dev server.** Both write `frontend/.next`. A production build wipes and rewrites the chunk files underneath the running dev server, whose in-memory manifest then points at files that no longer exist — every route 500s with **`Cannot find module './NNN.js'` from `.next/server/webpack-runtime.js`**, which is unrecognisable unless you have seen it. If the build runs second it fails instead, with `EINVAL: invalid argument, readlink '.next/package.json'` (it cannot delete a file the dev server holds), leaving BOTH broken. Two `next dev` instances on the same tree do the same thing. **Order matters:** stop dev → `rm -rf frontend/.next` → build → restart dev. Recovery is the same three steps; `.next` is gitignored and regenerates.

## Submission workflow

This repo has a sibling clean-snapshot repo at `..\AIRMS-submission\` for academic-submission purposes (no Claude artefacts). The sync script and reference guide are both gitignored:

- [`sync-to-submission.ps1`](sync-to-submission.ps1) — idempotent mirror + scrub script. Run when JC asks to "sync to submission" or similar.
- [`SUBMISSION_WORKFLOW.md`](SUBMISSION_WORKFLOW.md) — full how-to, the safety-net warning behaviour, and when to patch the script vs. hand-edit the submission.

Commit cadences are independent — JC will commit many times in this repo between each submission sync. Never push to the submission repo without explicit instruction; treat that as a destructive-by-default action.

## Working norms for this repo

- The user (JC) writes terse messages. Soft pushback ("Erm…", "Well…") usually means he sees a problem you don't — listen, don't argue.
- Module 1 (Athlete Dashboard & Overall Risk Indicator) is an FYP showcase and is audit-fixed. Touch its components (`BodyMap.tsx`, `WorkloadChart.tsx`, `RiskRadar.tsx`, `risk.ts`, the dashboard pages) with the smallest possible surface. **`WorkloadChart.tsx` no longer renders on any dashboard** as of 2026-07-16 (see the risk.ts status note above) — it is retained for the ACWR rebuild path. **Activity Tracking (the FYP I Module 1) was fully removed 2026-07-20**, and the six-module set restructured the same day to fill the gap — there is no longer an activity page to protect.
- The 6-module FDD is the scope ceiling. Do not propose features outside it.
- Do not propose swapping the tech stack, charting library, body map asset, or styling approach without explicit discussion.
- When a memory entry mentions a specific file or function, verify it still exists before acting — memory can lag behind the code.
