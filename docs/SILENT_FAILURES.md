# Silent failures: the defect class this project keeps producing

*Started 2026-09-02, after the fourth instance in a fortnight.*

Almost every real defect found in AIRMS has belonged to **one class**, and it is
not "the code threw". A crash is loud, lands in a log, and gets fixed the day it
happens. The defects that survived here were all the same shape:

> **A wrong answer that looks like a right one.**

An empty state where there should be an error. A guard that is correct and
unreachable. A number computed from the wrong denominator. A style rule that
silently does nothing. In every case the screen looked finished, the tests
passed, and nothing anywhere said otherwise.

This document exists because the pattern is now predictable enough to hunt
deliberately instead of stumbling over. It has three parts: the **taxonomy**,
the **hypotheses** used to sweep for each type, and the **standing guards** that
now catch them automatically.

---

## 1. The taxonomy

Six recurring sub-patterns, each with real instances from this repository.

### A. Correct, and unreachable

Code that is right, tested, and never runs. It passes every test, because a pure
function is correct whether or not anybody calls it.

| Instance | How it hid |
|---|---|
| `winAnsiSafe` | Defined, exported, unit-tested, **never called**. The wiring edit matched nothing. PDFs kept printing mojibake while its tests stayed green. |
| `isForeignAthleteRequest` | Correct self-scope check sitting *behind* an `rbac()` list that rejected every athlete first. Unreachable for weeks. |
| `serializeGeneric` / `serializeMany` / `withStringId` | Three exported helpers with zero callers, under a header comment asserting "every route emits its rows through one of these helpers". No route did. |

**Why it hides:** the unit test and the wiring are independent. Testing the
function proves nothing about whether it is installed.

**Detection:** for every guard, assert the *call site* as well as the function —
read the route source as text if necessary. And mutation-test: break the guard
and confirm something fails.

### B. Granting or denying by omission

A default that is implicit rather than stated, so adding a field, role or column
changes behaviour without anybody editing a policy.

| Instance | How it hid |
|---|---|
| `serializeAthlete` spread `...rest` | Every Athlete column shipped to every role. `injuryNote`, `injuryBy`, `injuryAt` — clinician free text — reached coach and executive payloads. Nothing rendered them, and the seed has zero injured athletes, so it was invisible and would have appeared the first time a clinician used the flag. |
| `BAND_LABEL` had no `green` key | Two call sites grew private copies saying "Safe". Three definitions of one vocabulary; the absence never errored. |
| `INVITABLE_ROLES` vs the form | The endpoint accepted four roles, the page offered two. Accepted-but-not-offered is *invisible*; the reverse crashes loudly. |

**Detection:** prefer allow-lists to spreads. Where a default exists, make it the
*restrictive* one, so a forgetful call site under-discloses.

### C. Empty is indistinguishable from failed

The most common shape, and the most dangerous, because "nothing here" is a
perfectly plausible reading of a page.

| Instance | How it hid |
|---|---|
| Personnel page showed **0 coaches / 0 staff** | The backend was down. A dead API and an empty institution render identically. |
| `getSettings()` caught its own DB error and returned `[]` | Every caller got a complete, plausible settings object built from DEFAULTS. `pinned_norm_version_id` would read as unset, so **a pinned norm silently releases** and those athletes get scored against live norms instead of the approved snapshot — different clinical numbers, no error anywhere. |

**Detection:** grep for `catch(() => [])`, `catch(() => ({}))`, `?? []`. Ask of
each: *would a total outage be distinguishable from a quiet day?*

### D. The wrong denominator

Arithmetic that is correct and answers a different question than the label claims.

| Instance | How it hid |
|---|---|
| Coach readiness tiles | 56% + 19% + 13% = **88%**. Three band tiles denominated over the whole squad while two athletes had no screening at all. They appeared in no tile and no bar segment, so the stacked bar stopped short of its track — reading as a rendering artefact rather than as two missing people. The card directly beneath already used the right denominator ("10 of 14 **screened** athletes"). |
| `escalation_below_mean` at `z < 0` | Flagged ~half of every cohort *by construction*. 27 of 58 athletes tripped it; 12 of 14 ambers rested on it alone, one at z = −0.163. |

**Detection:** every percentage set must be asked to sum. Every denominator must
be named in the copy next to it.

### E. Declarations that silently do nothing

Valid-looking syntax that the runtime discards without complaint.

| Instance | How it hid |
|---|---|
| `var(--bg-subtle)` — invented token | An undefined custom property makes the whole declaration **invalid at computed-value time**. Nine hover and pill backgrounds silently rendered with nothing. |
| `var(--primary)` on `.bm-card-item:focus-visible` | `outline` fell back to its initial value, `none` — and because that rule is *more specific* than the global `button:focus-visible` gold ring, it removed the keyboard focus indicator from six body-map rows. Measured in Chrome: `outlineStyle: "none"` there, `solid 2px rgb(245,197,24)` on every other button. |
| `var(--text-primary)` on the active muscle | `stroke` **inherits**, so the highlighted muscle silently took its parent's stroke instead of the intended one. |
| CSS escape `\2013` | Emitted bytes `C2 81 33` and rendered as "3". |

**Detection:** now automated — see §3.

### F. Output nobody looked at

Generated artefacts trusted because the generator ran without error.

| Instance | How it hid |
|---|---|
| `AIRMS-System-Guide.pdf` | Shipped **three times** without anybody opening it. Every block after a table ran off the page, `**bold**` printed its asterisks, `####` printed raw, table cells truncated mid-sentence. The generator exited 0 every time. |

**Detection:** if a thing is rendered, *read the rendering*. Where glyph
rasterisation is unavailable (it is here — pdfjs cannot polyfill `Path2D`),
substitute text-layer and geometry checks. Screenshot UI work.

---

## 2. The hypotheses, and the 2026-09-02 sweep

Each hypothesis is a question with a mechanical test. Findings and **clean
results are both recorded** — a negative result is evidence the discipline is
working, and it stops the next sweep re-treading the same ground.

| # | Hypothesis | Method | Result |
|---|---|---|---|
| H1 | A `catch` turns a failure into an empty state | grep `catch(() => [])` and friends | **1 found** — `getSettings()`. Fixed. The `lib/api.ts` ones are fine (parsing an error body). |
| H2 | Something is exported and never called | enumerate `module.exports`, grep for external references **including tests** | **3 found** — `serializeGeneric` / `serializeMany` / `withStringId`. Removed. `RISK_INDICATORS`, `EXCLUDED_RISK_KEYS`, `REPORT_LABEL` are test-only *by design* — checking `tests/` first avoided three false reports. |
| H3 | One fact has two definitions that have drifted | compare band labels, indicator lists, role lists across packages | **Clean.** Labels agree; the pins added in §31/§42 hold. |
| H4 | A percentage set does not sum | compute each set live | **1 found** — coach readiness, 88%. Fixed. |
| H5 | A `var(--token)` resolves to nothing | diff used-without-fallback against defined | **3 found** — `--primary`, `--text-primary`, `--bg-secondary`. Fixed, and now guarded by a test. |
| H6 | A generic serialiser leaks columns | trace every call site's payload | **1 found** — clinician notes to coach/executive (fixed under §43). |
| H9 | `x \|\| fallback` swallows a legitimate `0` | grep the fallback idioms | **Clean.** The only hits are `Map.get() \|\| 0`, which is correct. |
| H10 | A nav link points at a route that does not exist | every `href` vs `app/**/page.tsx` | **Clean.** All 16 resolve. |
| H15 | An aggregate returns `NaN` / `Infinity` on empty or degenerate input | call 20 utils with `[]`, `[one]`, zero-variance | **Clean.** No non-finite value produced anywhere. `meanSd([5])` returns `sd: 0`, and every z-score site guards with `!st.sd`; `compositeZ` guards the empty case with `if (!zs.length) return null`. |
| H7 | A number quoted in the docs no longer matches the database | measure it (`npm run measure:facts`) | **5 found.** See below — this was the largest single finding of the second sweep. |
| H11 | A sort sees `null` and puts an unscored athlete at the top of a "worst" list | grep numeric comparators, check each for a prior filter | **Clean.** `topRisk` sorts a pre-filtered `screened` array; the ranked team report uses `?? 0`, which lands a null-indicator athlete last, as intended. |
| H16 | Removing a swallowed error turns a wrong answer into an **outage** | inject the fault, drive the running server | **Clean, and it needed checking.** See below. |
| H12 | A row buckets into one period and **displays** as another | compare UTC vs institution-zone parts for every row, then check reachability | **1 found.** Buckets were UTC, dates were rendered in the viewer's zone. Fixed. |
| H13 | Two operators committing the same report create a **duplicate retest** | simulate the duplicate through the real reliability utils, then drive the live endpoint | **1 found, and aimed at the demo.** Fixed at both layers. |
| H14 | The report and checklist docs quote figures the system no longer produces | grep every number out of `docs/`, compare with `measure:facts` | **2 found.** The viva dossier was already correct. |

### H7 in full — the docs had drifted from the database

The largest finding of the second sweep, and the one with a viva in front of it.
`CLAUDE.md` carried **four different band splits** (29/14/15, 41/13/4, 43/10/5,
38/9/9) and **two different reliability pair counts** (18 and 19). Every one was
true when written; the seeder changed underneath them (§34 derived Total Score
from the subitems, which moved the whole distribution) and prose does not
recompute. A reader — including an examiner — cannot tell which line is current.

Measured 2026-09-02, through the application's own utils:

| Quoted | Measured | |
|---|---|---|
| 41/13/4, or 43/10/5 | **38 green / 9 amber / 9 red of 56** | confirmed against the app's own `bandDistribution` |
| "19 pairs" | **18** | the other line already said 18 |
| "all 56 of 56" cohorts below 10 peers | **55 of 56** | the caveat is `size < 10`; one athlete sits on exactly 10 |
| "13 do" move well and score risky | **15–17** | the count moves with median tie-handling, so quote the range |
| 58 athletes | **62** (56 scored, 6 never screened) | older "of 58" lines are historical and now labelled as such |

Two of my first four comparisons were **wrong**, and only became right by being
checked: I measured cohort *rows* (49, median 3) against a claim about each
athlete's *resolved* cohort after the fallback ladder (56, median 7), and I used
my own median tie convention. A doc/code disagreement is only a finding once you
have matched the definition.

The durable fix is not the five corrections — those will rot again — it is
**`cd backend; npm run measure:facts`**, which prints every one of these numbers
from the database through the same utils the screens use. Run it before quoting
anything in the report or the viva.

### H16 — check that the fix is not worse than the defect

Removing the swallow from `getSettings()` (see §C) meant it could now reject.
Express 4 does not catch a rejected promise from an async handler, and Node ≥15
treats an unhandled rejection as fatal — so the fix could have traded a silent
mis-scoring for a **crashed process**, which is worse. Static analysis said "10
call sites outside a try", but most were utils whose callers wrap them, so the
static answer was not the real one.

Injecting the failure and driving the running server settled it: affected
endpoints return 500, unaffected ones still return 200, and the process survives
every probe. The scheduler is safe for a separate reason worth knowing —
`recordOutcome` swallows its own errors, so the error path inside `tick()`'s
`catch` cannot itself reject.

**Always ask this of a fix that converts silence into an error.**

### H12 — bucketed in one calendar, dated in another

`periodKeyOf()` bucketed on `getUTC*()`. `fmtScreeningDate()` rendered with
`toLocaleString(undefined, …)` — the **viewer's** zone. On the hosted instance
the API runs in UTC and a clinician's browser runs in MYT (UTC+8), so a
screening taken between 00:00 and 07:59 local falls on the previous UTC day.
Across a month end the same row was drawn in one column of the trend chart and
dated into the next month on the row beneath it.

Nothing on record triggers it — all 74 screenings sit at 11:00 UTC (19:00 MYT)
— but a **morning** screening is entirely normal at an institute, and
seasonality is the output the docs call the one whose plausible failure is a
confidently wrong institutional decision (§24).

Both packages now name one `INSTITUTION_TZ` (`Asia/Kuala_Lumpur`), because a
screening belongs to the day it happened at ISN. Verified before shipping that
re-bucketing every row in that zone moves **none** of them at any grain: a
correctness fix for data not yet collected, not a restatement of numbers already
quoted. `periods.test.ts` pins the two constants together and both were
mutation-tested. One existing backend assertion legitimately **changed** —
`2026-03-31T23:59:59Z` is Q2 at ISN, not Q1 — and now says which calendar it
means.

### H13 — a duplicate commit manufactured a retest

The screening commit was an unconditional `INSERT` and the
`(athlete_id, assessed_at)` index is **not unique**, so committing the same
report twice appended an identical row. `consecutivePairs()` then paired the two
as a retest with a difference of **zero on every score**.

Measured against the real rows: **two** duplicate commits took the engine from
18 pairs — correctly declining, dead band 2, labelled an assumption — to 20
pairs and a *derived* dead band of 5.7 to 11.5. That is precisely the failure
`reliability.js` exists to prevent, reached by inflating the numerator rather
than by lowering the floor, which is the direction nobody was watching.

It is not hypothetical: the demo hands **the same three reports to two people**.

Fixed at both layers, because either alone leaves a hole. The commit is now
idempotent on `(athleteId, assessedAt)` — matching the intent already stated for
the muscle-flag and event replaces — and `consecutivePairs` collapses readings
that share an instant, since two rows at the same moment are not a retest
whatever produced them. Verified by driving the live endpoint: the same payload
twice yields one row (`action: "re-imported"`), a genuinely later session still
appends, and the probe cleans up after itself.

**A remaining hardening, deliberately not applied:** a unique index on
`(athlete_id, assessed_at)` would close the millisecond-wide TOCTOU window
between the `findOne` and the `create`. It needs an `ALTER TABLE` on the local
and hosted databases, and the realistic scenario is two people minutes apart,
not milliseconds — so it is recorded here rather than forced through during
demo preparation.

### H14 — the checklist described a deleted feature

The viva dossier and `MODULES_STATUS.md` were already correct. Two documents
were not: `PROJECT_GUIDE.md` carried the same "19 pairs" as CLAUDE.md, and
`JC_CHECKLIST.md` claimed *"19/62 athletes (31%) carry an active injury"* —
describing the `Injury` model, which the HoloMotion-only cut deleted on
2026-08-02. **0 of 62** carry the surviving `isInjured` flag. Marked superseded
in the file's own convention rather than deleted, since the entry is a record of
what was once true.

### H17 — two recomputes at once (swept 2026-09-02)

`postImport.js` prevented overlapping recomputes **within** one process, with an
`inFlight` promise. That stopped being enough when a second process became
normal: `npm run mail:tick` is its own process by design (§36), and the hosted
API can run more than one instance. Rebuilding rewrites `cohort_thresholds`
while rescoring reads those rows back — two overlapping passes can score an
athlete against a table the other is halfway through replacing, producing a
published indicator assembled from part of one norm set and part of another.

Ten call sites did the sequence directly, which is how `riskIndicators` came to
be maintained in eight places (§31). They now go through **one** function,
`utils/recompute.js`, which takes the same cross-process lock as the scheduled
mail:

- `recomputeAll()` **queues** for the lock (20s) and **throws** on timeout.
  Returning `{cohorts: 0}` would say "recomputed nothing" when the truth is "did
  not recompute", and those are different answers to an administrator.
- `tryRecomputeAll()` yields immediately for background work, and the import
  queue **re-queues its batch** rather than dropping it — the running pass
  refreshes the norms institution-wide but knows nothing about this batch's
  alerts, so a dropped batch means a flagged athlete never gets emailed about.

Verified against the real database: six simultaneous attempts → one ran, five
declined, max concurrency 1; six queueing attempts → all six ran, still max
concurrency 1; no lock row left behind. Five mutations, all caught.

The unique index on `(athlete_id, assessed_at)` from H13 was also applied — it
closes the millisecond window between the commit's `findOne` and its `create`
that no application-level check can. Confirmed to reject a duplicate, to allow
multiple **undated** screenings (MySQL treats NULLs as distinct, which is the
wanted behaviour), and to allow a genuinely later session. **The hosted database
still needs it**; the statement and its pre-check are in `CLAUDE.md` gotcha 3.

### H18 — the report diagrams (swept 2026-09-02)

The ERD and FDD are figures in a graded document that no test reads. Both had
drifted, and both were caught by *rendering them and looking*:

- **`erd-corrected.html` (Fig 4.9) showed eight tables; there are nine.**
  `audit_logs` has existed since 2026-08-10 and had never reached the diagram.
  Added, drawn deliberately with **no relationship line** — it has no foreign key
  to `users` because the actor's name and role are copied onto the row, since a
  trail that re-reads the actor through a join changes when somebody is renamed.
- **`fdd-updated.html` (Fig 4.1) was missing two Module 5 leaves.** UC-54 *View
  Activity Log* and UC-55 *Generate Programme Activity Report* were in
  `REPORT_TABLE_4-1.md` — the authority for Chapter 4 — but not in the diagram
  drawn from it. 46 leaves → 48.

The render check earned its place immediately: the first ERD edit corrected the
footer to "Nine tables" and left the **subtitle** saying eight. Reading the HTML
would not have caught it; looking at the page did.

`panel_slides.html` and `risk-algebra-slide.html` are ACWR-era FYP I artefacts
and are **left alone** — `REPORT_EDIT_PACK.md` already records what is stale in
them, and rewriting frozen history is not the same as correcting a current
figure.

**Still not swept:** `uc-general-updated.html`, `uc-datamgmt-updated.html` and
`activity-dataimport-updated.html` were rendered and read but not checked
use-case by use-case against `REPORT_TABLE_4-1.md`.

---

## 3. Standing guards

What now catches each class automatically, so the next instance fails a test
instead of reaching Dr Thung.

| Class | Guard |
|---|---|
| A — unreachable | `permissions.test.js` "UC-41 wiring", `athleteDisclosure.test.js` "wiring", `accountLifecycle.test.js` role pin. All read route **source**, because the predicates are pure and pass regardless. |
| B — by omission | `riskIndicators.test.js` + `screeningAlerts.indicators.test.ts` pin the two packages' indicator lists and **assert the LDH exclusion as a value**; `bands.test.ts` pins the labels; `athleteDisclosure.test.js` pins the note allow-list. |
| E — dead declarations | **`lib/cssTokens.test.ts`** — every `var(--x)` used without a fallback must be defined. Reports `token used at file:line`. Includes a corpus check, so deleting the walker cannot make it pass vacuously. |
| D — wrong denominator, in TIME | `periods.test.ts` + `screeningPeriods.test.js` pin one `INSTITUTION_TZ` across both packages and assert the boundary instants explicitly, in a named calendar. |
| Concurrent recompute | One `utils/recompute.js` takes a cross-process lock; `recompute.test.js` asserts the sequencing AND reads the route sources, so a call site that bypasses it fails. |
| Report figures | Rendered headless and checked for overflow before shipping (`scratchpad` harness); leaf and table counts reconciled against `REPORT_TABLE_4-1.md` and the live models. |
| Duplicate ingest | `reliability.test.js` collapses same-instant readings and asserts duplicates cannot push the engine over `MIN_PAIRS`; the commit is idempotent on `(athleteId, assessedAt)`. |
| Docs drifting from data | **`npm run measure:facts`** — prints the quoted headline numbers from the database, through the same utils the screens use, so the script cannot quote a different band rule than the dashboard. |
| F — unread output | `npm run guide:pdf` renders **and verifies** in one command; `verify-guide-pdf.js` reads the PDF back. `capturePdfText` / `capturePaintOps` patch `PDFDocument.prototype` *before* construction so an unwired guard fails. |

### The rule that makes the guards real

**Mutation-test every guard: break the thing it protects and watch it fail.**

A test nobody has seen fail is a guess about what it covers. This is not
ceremony — it is how `winAnsiSafe` was caught, and re-confirming after a refactor
matters just as much, because a refactor can quietly neuter an assertion.

Both fixes on 2026-09-02 were mutation-tested: seven mutations against the
disclosure guards (each caught, failing 1–5 cases), and reintroducing
`--text-primary` against the CSS guard (caught, reported at `globals.css:1369`).

### Verify against the running system, not the reasoning

Several findings here were *cascade* or *middleware-order* arguments, and this
project has a poor record on those. The focus-ring defect was confirmed by
focusing the element in Chrome and reading `getComputedStyle`, not by reasoning
about specificity; the permission matrix was produced by calling 52 endpoints as
each role, not by reading `rbac()` calls.

A note on the probes themselves: **more bugs were found in the probes than in the
code.** Reading the wrong payload key, counting CORS preflight `204`s as leaked
successes, matching `name`/`id` where the serialiser emits `label`/`_id`,
asserting a redirect to `/login` when the login page is `/`, and testing a coach
against an out-of-sport athlete so that a `403` masqueraded as a passing
assertion. Treat a probe that reports "clean" on the first run as suspect until
its control case has been seen to fail.
