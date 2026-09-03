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

### H20-H22 — what a failure says, and what a parameter is allowed to be

Three findings and **one false alarm that is the most useful entry here.**

**A 500 handed the caller the driver's own words.** 49 route handlers ended
`catch (err) { res.status(500).json({ message: err.message }) }`. Measured:
`?from=not-a-date` answered *"Incorrect DATETIME value: 'Invalid date'"* and
`?gender[$ne]=Male` answered *"Invalid value { '$ne': 'Male' }"*. Neither is
dangerous alone; together they confirm the engine, the ORM, and that a parameter
reached a query unvalidated. `utils/httpError.js` now decides once: a 4xx keeps
its message (it was written for the reader), an explicitly `expose`d error keeps
its message (the operator uploading a PDF needs to know why it failed), and
everything else gets a generic sentence while the real error goes to stderr with
the route that produced it. **The opposite mistake would be worse** — a blanket
"something went wrong" would have swallowed *"Could not render any pages from
the PDF"*, which is exactly what the person who hit it needs.

**Query parameters had no declared shape.** Express turns `?sport[]=x` into an
array and `?sport[$ne]=y` into an object. The array form produced an
undocumented multi-select (28 rows from a filter nobody designed or described in
the report); the object form produced a 500 for what is plainly a malformed
request. `utils/queryParams.js` asserts the shape and answers 400.

**`%` in the search box matched the entire roster.** `Op.like` with an
unescaped term makes `%` and `_` wildcards, so a clinician searching an IC
number containing `_` got quietly wrong results. Not a security hole — a
correctness one, and invisible, because "more rows than expected" reads as a
generous search.

#### The false alarm, and why it stays written down

I reported **"no login rate limiting: 25 wrong passwords in 5.6s, no lockout"**
and built a per-account throttle for it. Both the finding and the fix were
wrong.

`server.js` already mounts `express-rate-limit` on all of `/api/auth` — 30
failed attempts per 15 minutes per IP, `skipSuccessfulRequests: true`, with a
comment explaining that a demo signs in and out many times *successfully* and
must never be throttled. **My probe made 25 attempts. The limit is 30.** I
concluded "no limiter" from a probe that stopped short of the threshold, and my
grep missed it because the exclusion filter I used to remove reset-code noise
also removed the limiter.

Then the fix broke the thing it protected: the first version locked an address
for 15 minutes after five failures, and the probe proving it worked **locked the
demo administrator out of their own account** — which is the denial-of-service
lever NIST SP 800-63B §5.2.2 warns about, discovered by walking into it.

It was reverted in full. A second limiter with a different threshold and a
different message would have been exactly the drift this document exists to
prevent (§31, §42): two definitions of "too many attempts".

**Two real limitations of the existing limiter are recorded rather than
papered over**, because they are viva questions: it uses the default in-memory
store, so on a host running several instances each keeps its own counter; and it
is keyed by IP, so it does not bound guesses against one *account* from many
addresses. Both are fixable with a shared store; neither justifies a second
control days before a demo.

**The lesson is the probe, not the code.** A negative result is only evidence if
the probe was capable of producing a positive one. This one was not, and it
still read as a finding.

### H19 — the use-case diagrams against the authority (swept 2026-09-02)

`REPORT_TABLE_4-1.md` holds 60 use cases and CLAUDE.md names it the authority for
Chapter 4. Diffing the diagrams against it by label found **seven** use cases in
the table and in no diagram, every one a feature added after the diagram was
drawn:

| Diagram | Missing |
|---|---|
| `uc-general-updated.html` | UC-48 Invite User · UC-49 Activate Account · UC-50 Set Notification Preferences |
| `uc-datamgmt-updated.html` | UC-51 Pin Cohort Norm Version · UC-52 Send Scheduled Institutional Mail · UC-53 Force a Scheduled Mail Run · UC-56 Extract Training Prescription |

Plus one absent **actor**: `uc-general` drew Athlete, Medical Staff, Coach,
Administrator and System, but not **Executive** — although UC-49 and UC-50 both
name it. The role has existed since 2026-08-08.

And one node that today's own work invalidated: the activity diagram said the
commit *"append[s] immutable screening snapshot"*, which stopped being true the
moment the commit became idempotent (H13). It now reads "write screening
snapshot, keyed on (athlete, assessed-at) — re-import updates, never
duplicates". **A diagram can be made stale by the commit that fixes the code**,
which is an argument for reconciling figures in the same change rather than
later.

All corrected, re-diffed to zero unmatched, and rendered.

**A caveat on my own tooling:** the first pass at the data-management fix
anchored on the string `"divider"`, which also appears in the file's header
prose. It therefore shifted **Module 3** as well as Module 4 — and the result
still rendered plausibly, with a taller box and its contents sitting lower.
Only checking the coordinates against their expected values caught it. The
anchor now requires the line to start with `<!--`.

**An inconsistency inside the authority, left for JC.** UC-1 to UC-4 (Login,
Reset Password, Change Password, View Profile) list four actors and omit
Executive, while UC-49 and UC-50 include it. An executive plainly logs in — they
must, to activate their account — so the omission looks like an oversight in the
table. It is **not** corrected here: `REPORT_TABLE_4-1.md` is the authority, and
silently editing an authority to match a diagram is the wrong direction of
travel.

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
| Leaky failures | `utils/httpError.js` is the only thing that answers a failed request; `httpHardening.test.js` reads every route source and fails if one returns a raw message on a 500. |
| Unshaped input | `utils/queryParams.js` — a parameter is a string or the request is a 400. Wired sites asserted from source. |
| Docs drifting from data | **`npm run measure:facts`** — prints the quoted headline numbers from the database, through the same utils the screens use, so the script cannot quote a different band rule than the dashboard. |
| F — unread output | `npm run guide:pdf` renders **and verifies** in one command; `verify-guide-pdf.js` reads the PDF back. `capturePdfText` / `capturePaintOps` patch `PDFDocument.prototype` *before* construction so an unwired guard fails. |

### 3b. What is still only a habit, and what is now a command

The sweeps that found everything on 2026-09-02 were **throwaway scripts in a
temp folder**. They found a settings read that swallowed its own database error,
three dead exports, a constant written out three times, seven missing use cases
and a coach able to test IC numbers — and then they were deleted. That is not a
process; it is luck plus a good afternoon.

Two of them now live in the repository:

| Command | Catches |
|---|---|
| `npx jest codebaseHygiene` | H1 (a `catch` returning an empty value) and H2 (an export nothing anywhere calls) — the two hypotheses no other test covered |
| `npm run audit:access` | The 52-endpoint × 4-role matrix. Needs a running server, so it is a script, not a suite. Fails if any read-only role *reaches* a write |
| `npm run coverage` | Now works at all — see below |
| `npm run measure:facts` | The headline numbers, from the database |

**`audit:access` checks for a REFUSAL, not for failure.** Its write probes carry
a deliberately invalid id, so a role RBAC waved through still ends at 404. An
earlier version only flagged a 2xx and would therefore have missed almost
everything. Mutation-tested: adding `executive` to one write guard produces
`executive reached POST /cohorts/versions/…/pin — expected 403, got 404`.

**Coverage had never been measurable.** `npm run coverage` failed with
`Cannot find module 'fs.realpath'` — a missing transitive dependency of the
instrumenter — so nobody had ever seen a number. It is 74.7% of statements and
63.5% of branches, and the shape matters more than the total: the gaps are
concentrated in **route handlers** (`screeningReports.js` 7%, `audit.js` 19%),
which is exactly where this session's defects lived. That is not an accident —
`CLAUDE.md` already says route bodies are only tested where their logic was
extracted into a util. It is the honest answer to "where is the next one".

### 3d. The blind spot, closed (2026-09-02)

Coverage said the gaps were in **route handlers**, and that was where three of
this session's defects lived. `tests/reportRoutes.test.js` mounts the real
routers behind a real Express app and drives them with supertest:

| | before | after |
|---|---|---|
| `routes/screeningReports.js` | 7% | **44%** |
| `routes/audit.js` | 19% | **42%** |
| backend statements | 74.7% | **79.6%** |
| backend branches | 63.5% | **67.8%** |

The properties it pins are the ones that were found broken by hand: a coach gets
the *same* status for an unknown athlete as for a foreign one, a refused
download writes no audit row, a missing screening is reported rather than drawn
as an empty document, and a 500 does not carry the driver's message. Five
mutations, all caught.

**Its own history is the lesson.** It began with pdfDraw, holisticReport,
programmeActivity and cohorts all mocked, and each stub in turn became the thing
under test:

- without `page.width` the handler threw, the route 500'd, and the RBAC
  assertion passed anyway — *a green test over a broken path*;
- with the geometry but a frozen `doc.y`, the activity-log route paginated for
  ever;
- a hand-written `programmeActivityData` return produced "write after end"
  mid-stream;
- a partial `cohorts` mock omitted `latestScreeningsByAthlete`, so the holistic
  route 500'd while "is not 403" still passed.

Every one of those is the same failure this document is about, produced *by the
test*. They went away when the mocks did. What is left is the minimum that
cannot be real in a unit test — the models, the auth middleware, and the audit
writer — and the models mock gives every table every finder, because a partial
one is what caused three of the four.

### 3e. The access gate, which had no test at all (2026-09-02)

`DashboardLayout` wraps every authenticated page and decides what renders. It
had no test, which is uncomfortable twice over: it is the one component whose
job is access, and it had been *changed* days earlier to confirm the session
with the server.

A DOM environment was added for it — `jest-environment-jsdom` and React Testing
Library, opted into **per file** with a `@jest-environment jsdom` docblock, so
the existing node-environment suites run exactly as before.
`DashboardLayout.test.tsx` pins nine properties, including the two that are easy
to get backwards:

- the **server's** answer beats the browser's `localStorage` claim, so a forged
  or stale snapshot is corrected rather than trusted;
- a 401 **clears the session** — a redirect alone would leave the stale token
  for the next page load to trust again;
- a network blink does **not** sign anybody out, which would drop the whole
  institute to the login screen the moment the API hiccupped.

Six mutations, all caught: removing the confirmation, dropping the role check,
not clearing on 401, signing out on *any* error, dropping the initial gate, and
ignoring a revoked capability.

**What it deliberately does not assert.** The gate renders *optimistically* from
the snapshot and corrects when the server answers, and `router.replace` is
mocked — so the content does not vanish in a test. Asserting an unmount would be
asserting the mock. The backend is the real boundary and is tested separately;
nothing here should be read as "the API is safe because this passes".

**Four setup faults, each failing differently**, which is why this took longer
than the tests themselves: a `useRouter` stub returning a fresh object per render
made the effect loop for ever (`Maximum update depth exceeded`) — real
`useRouter` is stable; `jest.mock('@/lib/api')` could not resolve the path alias
because SWC rewrites `@/` inside *imports* but `jest.mock` is resolved by jest,
which needed `moduleNameMapper`; the jest-dom matchers were installed but never
imported, so `toBeInTheDocument is not a function`; and once imported they still
needed a `.d.ts`, because runtime and `tsc` fail independently.

### 3f. The page arithmetic, and a browser that actually looks (2026-09-02)

Two gaps §3c named are now closed.

**The readiness arithmetic left the component.** The 88% bug lived inside the
coach dashboard, where nothing could test it. `lib/readiness.ts` now owns the
band vocabulary, the counts and the shares, with 18 cases against the seeded
squad; the page imports them and keeps **no** copy — verified, because an
extraction the caller ignores is just a second definition, which is the defect
this whole document is about.

One thing was nearly made worse in the process. The first version nudged the
largest band so the three shares summed to exactly 100 — and that is the wrong
trade. Nine of fourteen is 64%, and printing 65% to tidy a total makes the tile
disagree with the "9 athletes" written directly beneath it, where a reader can
check. A one-point sliver on a stacked bar is a cosmetic rounding artefact; a
percentage that contradicts its own count is not. **Twelve points of hidden
athletes and one point of rounding are not the same fault**, and the tests now
say which one they are guarding.

**`npm run e2e` drives a real browser against a real server.** Everything else
here is a unit test with the awkward parts mocked — the right shape for logic,
and exactly the shape that cannot catch a page that throws on mount, a redirect
that never fires in a real router, or a percentage that is right in a function
and wrong on screen. Three of this session's defects were only ever visible that
way.

24 checks: a signed-out visitor typing any dashboard URL is bounced, paints
nothing private and receives no data; a coach typing an admin URL likewise; each
role's own pages render with no failing request; the readiness tiles account for
the screened squad; and the body-map rows still show a keyboard focus ring.

It uses `puppeteer-core` against the Chrome already installed, so there is no
browser download. Mutation-tested by putting the denominator back: the tiles
rendered 56 / 19 / 13 and the run failed with `sum = 88%` — the original bug,
caught end to end.

### 3c. Three things that cannot be promised

1. **Absence cannot be proved.** Every sweep so far found something. That is
   evidence the method works, not that the work is finished.
2. **A guard only counts once it has been seen to fail.** `codebaseHygiene`
   needed **three** corrections before it behaved — it first fired eleven times
   and found nothing, then could not detect a dead function at all because a
   declaration counts as a use, then could not flag the historical examples
   because this file's own comments mentioned them. Reasoning found none of
   that; mutation runs found all three.
3. **The untested surface is where to look next.** Route handlers (§3d), the
   access gate (§3e), the page arithmetic and an end-to-end browser run (§3f)
   are all covered now. What is left is the rest of the page *rendering* — the
   charts, the body map, the report panels — which have no assertions beyond
   "the page did not fail to load". `npm run e2e` is the place to add them, and
   it is a smoke test rather than a suite: it proves the app works, not that it
   is correct.

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
