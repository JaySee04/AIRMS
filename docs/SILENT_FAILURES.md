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
must never be throttled. (`skipSuccessfulRequests` was removed on 2026-09-11:
on a serverless host it un-counted nothing, so the deployed limiter counted
successes — **3r** below. The policy and the numbers are unchanged; this
account is left as written.) **My probe made 25 attempts. The limit is 30.** I
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
| B — cross-package drift | **`crossPackage.test.js`** pins every fact that exists in both packages AND enumerates them, so a constant newly added to both either gets pinned or fails the suite. The recurring problem was never a missing assertion — it was nobody noticing a new shared fact had appeared. |
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

### 3g. What the pages actually draw (2026-09-02)

`npm run e2e` grew from 24 checks to **59**, covering the last thing §3c named:
the pages rendered, but nothing said *what*.

**Nothing renders as a non-answer.** `NaN`, `undefined`, `Invalid Date`,
`[object Object]`, `Infinity` — these are what a wrong value looks like once it
reaches a template. They are the visible end of this document's whole subject,
they cost nothing to check, and no unit test sees them, because each is produced
by data meeting a page rather than by either alone. Nine routes are swept, and
each must also carry real content: a page that rendered its shell and nothing
else reads as an ordinary empty state.

**The body map and the charts draw.** The licensed figure is what the product is
built around, and a chart that renders blank looks exactly like a chart with no
data. Both are geometry, so both are counted — two figures, more than fifty
regions, at least two SVGs carrying real shapes — on the athlete dashboard and
in the coach and medical detail views, which the run reaches by clicking an
athlete. Thresholds sit well under what was measured (2 figures, 156 regions) so
ordinary content changes do not trip them: this asks *did it draw at all*, not
*is the design unchanged*.

**One of these checks was wrong when written, and a mutation found it.** Breaking
date formatting so every screening rendered `Invalid Date` produced **59/59
passing** — because the nine routes swept happened to be the nine that show no
dates. The check was real; its page list did not reach the code it guarded. With
the athlete pages added it fails on exactly the two that display a date. A
sweep's *coverage* needs testing as much as its logic.

Verified by mutation both ways: breaking date formatting fails
`/athlete/history` and `/athlete/dashboard`; renaming the figure class fails all
three body-map checks; restoring returns 59/59.

### 3h. A guard that held only where it was tested (2026-09-03)

The query-shape guard from H21 was **inert in production**, and nothing in this
repository could have told me. Measured against the live API, from the same
commit:

| | local | hosted |
|---|---|---|
| `?gender[$ne]=Male` | 400 rejected | **200, all 62 athletes** |
| `?sport[]=Badminton` | 400 rejected | **200, all 62 athletes** |

Express parses a bracketed parameter into a nested value, which `str()` refuses.
The hosted runtime does not parse it at all — the key arrives as the literal
string `sport[]`, so `req.query.sport` is undefined, the filter is skipped, and
the endpoint answers 200 with everything. No privilege issue: the roster is
already visible to every role that can call it. But the filter is silently
ignored, and **the test suite reported success the whole time**.

`assertPlainQuery()` now checks the KEYS, which covers both platforms, and runs
before any filter is read. Found only by comparing the two environments — which
is now worth doing after any change to request handling, because a guard that
holds where it is tested and not where it runs is worse than no guard at all.

### 3i. A pin can only cover the drift already found (2026-09-04)

Sub-pattern **A** (two definitions of one thing), and the clearest evidence yet
that the way this project had been fixing it does not scale.

The band vocabulary had been unified three times, each time after somebody found
a divergence, each time with a hand-written pin over the files then known to
carry a copy: `BAND_LABEL` with no green key and two call sites saying "Safe"
(§33); the frontend's six private maps and the red band spelled two ways (§19);
`SMALL_COHORT` written out three times, one under a comment claiming it was read
from elsewhere (§49).

Moving the vocabulary to a single generated source (§53) meant asking a
different question — *is this name re-typed in a file that has never heard of
the shared source?* — and asking it of the whole codebase rather than of the
files a previous investigation had visited. It immediately named
`ScreeningHistory.tsx`, which held a **fourth** band map rendering the bands as
`Green` / `Amber` / `Red`, plus a private `BAND_BADGE`.

Nothing was going to find that by pinning. Every pin is written after a drift is
discovered, so it can only ever cover the drift that was discovered. Three
rounds of them had each been correct and each been too narrow, and the file that
was wrong was wrong *consistently within itself*, so no test disagreed with it.

The wrongness was also the exact one §33 exists to prevent: a bare colour word
says nothing clinical, and "Green" on an athlete's own screening history reads
as *you are fine* — the reassurance a screening test cannot give, on the surface
where a false reassurance costs most.

**The guard.** `crossPackage.test.js` now enumerates the shared names
automatically and flags a literal declaration of any of them in a file that does
not import the shared source. Deriving is allowed and there are real examples
(`CohortFilters` prepends its filter-only "All ages" entry); re-typing is not.
`npm run e2e` additionally asserts in the browser that no dashboard names a band
by colour alone, because the vocabulary is chosen at render time and a component
reading the right constant and rendering the wrong field would satisfy any
source-level check.

**The rule.** *When you find a duplicated definition, do not pin the copies you
found — remove the ability to make a copy, then ask what else the new question
catches.* The pin tells you about yesterday's bug. The question tells you about
the ones nobody has looked for.

### 3j. The zero that is not a blank (2026-09-04)

Sub-pattern **A** again (two definitions of one thing), reached by asking the
question 3i ends on — *what else is written out more than once?* — rather than
by anybody reporting a fault.

`num()`, the helper that turns a stored value into a number, existed **seventeen
times** across the two packages, under three different contracts. An empty
string was `null` in ten of them and **`0`** in four; `null` was `0` in one; a
non-numeric string was **`NaN`** there.

What makes it this document's business rather than a tidiness note is where the
disagreeing copies lived: `pdfDraw.js`, `symmetry.js` and `bodymap.js` — the
printed report and the body figure. **A missing reading that becomes 0 is not a
blank. It is a number, and it is drawn.** Zero on an exercise-risk gauge is the
best possible score, so an absent reading prints as *no risk found*. Zero
lateral symmetry prints as *perfectly balanced*. Neither looks like an error;
both look like a finding, on the copy that gets filed.

`NaN` is worse. `NaN < 15` is `false`, so a threshold check passes silently, the
bar draws at zero width, and `JSON.stringify` turns it into `null` on the way
out, so the frontend cannot tell either.

**The guard.** One `toNum` per package, and `num.test.ts` runs a single table
through BOTH implementations — coercion is behaviour, not a fact, so it is
deliberately not generated from `shared/facts.js` (§53.8) and the table is what
holds the two together instead. The rule it pins is *an unknown value stays
unknown*.

**The part worth remembering.** The table failed on its first run — against the
fix, not the old code. `Number([])` is `0`, so the first version of `toNum`
turned an empty array into a score of zero: the exact defect being removed,
reintroduced inside the removal, in a function whose entire purpose was to stop
fabricating numbers. Both implementations now reject any type that is not
`number`, `string` or `bigint` rather than coercing it.

Writing the table before believing the implementation is what caught it. A
hand-checked "looks right" would not have — `[]` is not an input anybody thinks
to try, which is precisely why it belongs in the table.

### 3k. The import that resolves and still binds nothing (2026-09-05)

A new sub-pattern, because it defeats every check this project already runs.

```js
// utils/num.js now owns median; screeningPeriods no longer re-exports it
const { median } = require('../src/utils/screeningPeriods');
```

The module **resolves**. The destructure **succeeds**. `median` is `undefined`,
and nothing says so until something calls it — `median is not a function`, which
names neither the function that moved nor the file that lost it.

Why the existing guards all miss it:

| Check | Why it passes |
|---|---|
| `node --check` | syntax only — this is valid syntax |
| a `require()` smoke test | the module loads fine |
| the 565-test suite | nothing under `scripts/` is covered by any suite |
| `npm run map` | it inventories routes and columns, not bindings |

It is a **silent failure of the tooling rather than of the product**, which is a
category this file had not recorded. The specific instance broke
`npm run measure:facts` — the command that exists to stop stale numbers being
quoted in the viva (H7). Nobody runs a measurement script except when they need a
number, so the discovery moment is the worst possible one.

**The guard:** `backend/tests/scriptImports.test.js` checks every
`const { … } = require('./relative')` in `src/` and `scripts/` against the names
the target actually exports. Two properties are deliberate:

- **Static.** It reads both files as text and never `require()`s the target.
  Several modules here build a Sequelize instance at import time and `seeder.js`
  used to reseed the database on import — a test that executes arbitrary modules
  to inspect them is a worse hazard than the one it detects.
- **It counts what it checked.** Modules whose export shape is not statically
  readable (a spread, a bare function) are skipped rather than guessed at, and
  the number of pairs checked is asserted against a floor. Without that, a
  parser that quietly stopped matching would report "no broken imports" and be
  believed — the §56.3 failure, where the first route parser found 15 of 59
  endpoints and rendered a plausible table.

**The generalisation, which is the useful part:** a refactor that moves a
definition is only as safe as the check that the *old* name is gone. Renaming a
helper is enough to escape a name-based sweep (§57.1, `numOrNull`); moving one is
enough to escape a resolution-based check. Both are found by asserting on
**behaviour and bindings**, never on identifiers.

**And the same shape has a documentation form**, found the same day: the viva
dossier told its reader to re-measure before quoting, and the rows
`measure:facts` covered stayed correct while the rows it did not cover drifted
by up to 300×. *An instruction to re-verify only protects what the tool it points
at actually verifies.* Every headline number now has a command behind it, or an
explicit statement that only a run can answer it.

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
   access gate (§3e), the page arithmetic and the browser run (§3f), and what
   the pages draw (§3g) are all covered now. What remains is genuinely harder
   and is not pretended away: `e2e` asserts that a chart has geometry, not that
   the geometry is *right* — a body map painting the wrong muscle, or a bar at
   the wrong height, would pass. Those are questions for a person looking at the
   screen, which is how the dead-band chart and the overprinting PDF column were
   both found. **The tests reduce how often you must look; they do not replace
   looking.**

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
about specificity; the permission matrix was produced by calling every endpoint as
each role, not by reading `rbac()` calls.

A note on the probes themselves: **more bugs were found in the probes than in the
code.** Reading the wrong payload key, counting CORS preflight `204`s as leaked
successes, matching `name`/`id` where the serialiser emits `label`/`_id`,
asserting a redirect to `/login` when the login page is `/`, and testing a coach
against an out-of-sport athlete so that a `403` masqueraded as a passing
assertion. Treat a probe that reports "clean" on the first run as suspect until
its control case has been seen to fail.

### 3l. The guard whose pattern could not match anything (2026-09-06)

The worst instance of this file's own subject matter found so far, because the
thing that failed silently was **a guard against silent failure**.

A scan was written to find private `Number()`-based coercions anywhere in either
package — the §57 lesson generalised, since §54 missed `numOrNull` by searching
for a name and the follow-up guard then missed `numOrZero` by naming two files.
The scan was correct in structure, ran over all 159 source files, and reported
**no offenders**. Two were sitting in the tree at the time.

The pattern was a regex literal. The editing pass that produced it had turned the
`\b` word boundaries into **literal BACKSPACE bytes (0x08)**. A regex containing a
raw backspace matches a literal backspace, which never occurs in source code, so
the pattern could not match anything at all.

**Every tool that would normally reveal this shows nothing.** `grep`, `sed`, the
editor and a `Read` all render 0x08 as either nothing or as `\b` — visually
identical to the intended escape. The file parsed, linted and passed. It took
`od -c` on one line to see it:

```
\   s   *   \   (   ?   [   ^   ;   {   ]   *  \b   (   ?   :   =   =
                                               ^^ this is 0x08, not backslash-b
```

The diagnosis only happened because the same pattern, built with
`new RegExp(<string>)` in a scratch file, DID match — identical source text,
different result. That contradiction is what pointed at the bytes.

**The standing fix is a canary, not a better regex.** The scan now asserts, before
scanning anything, that it flags a synthetic offending line and does *not* flag an
innocuous one. A pattern broken by any means — mangling, a bad edit, a rewrite
that no longer matches — fails there instead of reporting all-clear. Proven by
mutation: corrupting the pattern fails the canary.

This is the same shape as §62's timezone meta-assertion, and the pair of them
give the rule its general form: **a check must first demonstrate that it can
fail.** Coverage counted in files scanned, tests passed, or rules written is not
evidence; the only evidence is having watched the thing catch something.

Three separate defects this session came from one mechanical cause — a heredoc
turning `\n` into a newline twice and `\b` into a backspace once — so the working
note is also practical: **do not write regexes through a shell heredoc.** Use an
editor tool that writes bytes literally, and prefer a pattern held in a string
where the escaping is visible.

### 3m. The character you cannot see, caught in half a second (2026-09-06)

3l recorded a guard whose regex contained literal BACKSPACE bytes and could
therefore match nothing, while reporting all-clear. The diagnosis took a long
time because every ordinary tool renders 0x08 as nothing, or as `\b` — identical
to the intended escape. `od -c` on one line was what showed it.

`backend/tests/sourceHygiene.test.js` is the cheap version of that diagnosis. It
scans both packages for characters that should never appear in source — control
bytes, BOM, no-break space, soft hyphen, zero-width and directional marks — and
fails naming the file, the line and the character. Planting the exact byte in
`utils/recall.js` fails it in **0.4 seconds**, and the file still parses, which
is the whole point.

**Found on the first run:** four stray UTF-8 BOMs at the head of
`middleware/auth.js`, `models/Athlete.js`, `models/MuscleFlag.js` and
`models/User.js`. Harmless to Node, which strips them — but invisible,
inconsistent with the other 227 files, and exactly what makes a byte-level
comparison lie. Removed.

**And one false positive, which is why the rule was measured before it was
written.** `utils/pdfDraw.js` legitimately contains a no-break space and a BOM:
they are regex literals in `WIN_ANSI_SUBS`, the table that strips characters
pdfkit's Helvetica cannot render (§30f). The file that solves this problem is the
one file allowed to contain it. The exemption is written to **invalidate
itself** — a further assertion requires that `WIN_ANSI_SUBS` and `winAnsiSafe`
still exist, so if that table ever goes the exemption must be re-argued rather
than silently covering a real defect.

The wider rule, now recorded as CLAUDE.md gotcha 9: **do not edit code by
matching or slicing text through a shell heredoc.** Four defects in one day came
from that habit — `\n` becoming a newline twice, `\b` becoming a backspace, and a
slice anchored on a marker that also occurred in the inserted text — and every
one produced a file that parsed, linted and passed.

### 3n. The card that was built, tested, documented — and never given data (2026-09-09)

The purest instance of this defect class yet found, because **every layer was
correct and the feature still did not exist.**

`ScreeningPanel` renders three cards from the report's own content: HoloMotion's
written Summary, its two-week Training Prescription, and Lateral Symmetry (which
side is weaker, and by how much). The API sends all three. The components render
all three. Both were built on 2026-08-23, are described as shipped in
`CLAUDE.md`, and Lateral Symmetry's own source comment says it exists because
the weaker side "was reachable only by downloading a PDF".

**It still was.** The API puts per-report detail on a `screening` sub-object and
leaves the flat athlete row alone. All four pages that render the panel lifted
exactly one field across by hand — `subitems` — which is the one field this
panel does not read. So `prescription` and `lateralSymmetry` arrived
`undefined` on every dashboard, for every role, for seventeen days, and the two
cards drew nothing.

**Why nothing caught it, layer by layer.** This is the part worth keeping:

- **Component tests passed** — the components are correct. A pure component is
  correct whether or not anybody passes it data, the same property that let
  `winAnsiSafe` ship exported, tested and never called (3d).
- **Backend tests passed** — the payload is correct. It carried the fields.
- **`tsc` passed** — every field involved is *optional*. A missing optional prop
  is not a type error; it is a card that silently does not appear. Making them
  required would have caught it, and would also break the narrowed objects the
  coach page builds on purpose.
- **`npm run e2e` passed** — 86 checks, and none of them says "this card is on
  this page". It asserts pages render, that no `NaN`/`undefined`/`Invalid Date`
  reaches the screen, and that geometry is drawn. A card that renders *nothing*
  produces none of those symptoms. **Absence is invisible to every check that
  looks for wrongness.**
- **Reading the code did not catch it either.** The hand-lift looked like it was
  doing work. It was cargo — copied to four call sites, ignored by the callee.

**How it was actually found:** by adding a fourth field of the same kind
(`summaryText`), and then *driving a real browser to look at the page* rather
than trusting a green suite. The card did not appear. The unit tests for it were
green at that moment, which is the whole lesson.

**The fix is structural, not local.** The panel now resolves the three fields
from `.screening` itself, so a field added to the payload cannot go dark because
somebody forgot one of four call sites. An explicit top-level value still wins,
so deliberately narrowed callers are unaffected.

`ScreeningPanel.test.tsx` pins presence from the shape the API actually sends —
verified by mutation: reverting the resolution turns 5 of its 10 red.

**The standing rule this adds:** when a change makes something *appear on a
page*, the check must be that it appears. A suite that only asserts the absence
of wrongness cannot tell a working feature from a missing one — and this project
now has two instances (3f, 3n) where the missing thing was shipped, documented
and believed in for weeks.

### 3o. The audit that said "all", and covered 49 of 62 (2026-09-09)

Found by fact-checking the documents against the code rather than by any failure.

`docs/PERMISSIONS.md` opened by claiming every line came from calling **all 49**
endpoints as every role. `CLAUDE.md` said 49 in two places and **59 in a third**.
`docs/SYSTEM_MAP.md`, which is generated from the code and checked against an
independent count, said **62**.

*(The figures above are written with emphasis marks on purpose: the hygiene test
described below scans these documents for an endpoint count in prose, and a
verbatim quotation of the old sentence would trip it. Guard working — the first
draft of this section duly failed the suite.)*

So the file the project treats as its authority on access control described a
sweep of 49 endpoints across a surface of 62. The word doing the damage is
**"all"** — without it the sentence is merely incomplete; with it, it is false.

**Ten endpoints had never been probed by any role**, and two of them are routes
`DESIGN_DECISIONS §43/§51` argues about explicitly: `GET /screenings/:id/full`
(where `executive` is deliberately refused so the capability is funnelled through
the audited PDF path) and the scoped record lookups. **The matrix was silent on
precisely the access decisions the project most wants to defend.** Also unprobed:
all three norm-governance writes — create, update and restore a norm version —
the controls that move the reference every athlete is scored against.

**Why the existing guard did not catch it, which is the interesting part.**
There *was* a test: `codebaseHygiene.test.js` asserted that no document quotes a
different endpoint count. It passed, because it compared the prose against the
**probe list** rather than against the routes. Both sides were the same
hand-maintained number, so the check was true by construction: as the audit fell
behind the code, the docs were kept in step with the audit and the guard
confirmed the two stale numbers agreed with each other. **A consistency check
between two copies of the same mistake reports success.**

Fixed in three places, and the order matters:

1. `audit-access.js` now reads the route table from the **same parser that
   generates `SYSTEM_MAP.md`**, compares its probes against it, and **exits
   non-zero** naming any endpoint that is neither probed nor explicitly exempt.
   Seven auth routes are exempt with a stated reason (unauthenticated by design,
   or self-scoped with no role boundary).
2. The ten missing probes were added. The role model **held** — no read-only
   role completed a write on any of them.
3. The hygiene test now checks the prose against the **route parser**, not the
   probe list, so the two numbers can no longer drift together.

**Four wrong answers before the right one.** The scanner used to find this
reported 31 uncovered, then 20, then 22, then 11, then 10 — each correction a
normalisation the first pass missed: template-literal probes evaluated to
concrete ids, `{SELF}`/`{OTHER}` placeholders, a `:kind` route probed with a
concrete kind, and a file extension after an id (`/individual/{SELF}.pdf`). Every
intermediate answer was confidently wrong and would have sent somebody to
"fix" endpoints that were already carefully covered. **A coverage number is
worthless until the tool producing it has been checked against known-covered
cases** — which is the same lesson as 3l and 3n, arriving through a third door.

### 3p. The suite that tested the previous build, and the guard that could not see it (2026-09-10)

Two failures in one, and the second is the sharper lesson.

**The original.** `next dev` bumps to :3001 when :3000 is taken, in one line of a
startup banner. The backend refuses outright. So starting a second `npm run dev`
over a running one gives: backend dead, new frontend on :3001, and **the stale
frontend still answering :3000** — which is exactly where `npm run e2e` and every
browser probe point. On 2026-09-09 a probe duly reported **nine failures for a
panel that worked**, because it was reading a build made before the change.

That is the worst shape of this defect class. The suite does not error. It passes,
against code nobody is shipping. `CLAUDE.md` gotcha 1 had described the symptom
for months as a CORS nuisance; the testing-integrity half went unnoticed.

`scripts/preflight-ports.js` now stops `npm run dev` when either port is held,
naming the port, the PID and the reason — so the state cannot be reached rather
than merely being documented.

**Then the guard failed the same way it was built to prevent.** Its first
implementation asked "can I bind this port?" and treated `EADDRINUSE` as the
signal. Run against **both dev servers actually running**, it reported both ports
**free**: `next dev` binds `0.0.0.0`, and Windows grants a second socket
`127.0.0.1:3000` alongside it.

And the test agreed with it — because the test held the port on `127.0.0.1`, the
same address the check probed. **A fixture that mimics the wrong holder proves
nothing.** Both the check and its test were self-consistent and jointly wrong,
which is the identical structure as 3o, where a hygiene test compared prose
against a probe list that was itself stale.

Fixed by asking the question that actually matters — *is something already
answering here?* — with a connect probe, which is independent of the interface
the holder bound. The test now binds `0.0.0.0` as `next dev` does; reverting the
probe to the bind-based version fails two of its three cases.

**The rule this adds:** when a check tests an environment rather than a pure
function, the fixture must reproduce the REAL actor, not a convenient stand-in.
Binding loopback because it is easy, when the thing you are detecting binds all
interfaces, is the environment-level version of asserting on a payload you built
yourself.

It was caught only by running the guard against the real situation — and it had
already been written, tested, and committed-adjacent by then.

---

## 4. The standing mutation check (2026-09-10)

Four entries in this document now share one shape: **a check and its own test
agreeing with each other while both were wrong.**

| | The check | Its test | Jointly |
|---|---|---|---|
| 3l | a guard whose `\b` was a backspace byte | asserted "no offenders found" | agreed, found nothing |
| 3n | components correct in isolation | rendered with hand-built payloads | agreed, drew nothing on a page |
| 3o | an access audit listing 49 endpoints | prose compared to *that same list* | agreed on a stale number |
| 3p | a port probe that bound loopback | a fixture that held loopback | agreed both ports were free |

The remedy has been stated in this repo since the `winAnsiSafe` incident and it
is the right one: **break the thing the test guards and confirm the test fails.**
It has also been **entirely manual** every single time. Which means the guarantee
was never "this guard can fail" — it was "somebody remembered to check that this
guard can fail, once, on the day it was written".

`backend/scripts/mutation-check.js` (`cd backend; npm run mutate`) makes it run.
Each entry names a guard, a mutation that must break it, and the test that must
notice. **A surviving mutation is a failure** and exits non-zero: the test is not
testing what it claims.

Eight guards are registered, spanning both packages — the port preflight, the
logger's two redaction rules, the rate-limit counter, the roster payload
exclusion, the audit failure counter, `ScreeningPanel`'s field resolution, and
the report-summary rejoin check. All eight are currently caught.

**The runner was itself verified the way it demands of others**, because a
mutation checker nobody has seen report a survivor is exactly the thing this
section is about:

- a **control mutation** that edits only a comment is reported `SURVIVED`, and
  the process exits **1** — so the runner is capable of failing;
- a **stale registry entry**, whose target text no longer exists, is reported as
  an error rather than silently applying nothing and passing;
- guard files are **restored in a `finally`**, verified clean via `git status`
  after a deliberately failing run — a crashed check that leaves a mutated guard
  in the tree would be worse than never running it.

It is deliberately outside `npx jest`: it spawns a jest run per mutation and
costs tens of seconds. It is the gate before committing a change to a guard.

**What it does not solve.** It only covers guards somebody registered. A new
guard with no entry is exactly as unverified as before — the registry is a list,
and a list is the thing that went stale in 3o. The honest scope is: it makes the
known guards provably fallible, and it makes adding a new one to that set a
one-line act rather than a remembered ritual.

### 4b. Deriving the set, so the registry cannot go stale (2026-09-10)

§4's mutation runner has one weakness, and it is the weakness of every list in
this document: **it only verifies the guards somebody registered.** A new guard
with no entry is exactly as unverified as before — and a hand-kept list is
precisely what rotted in 3o.

`backend/tests/guardCanaries.test.js` does not keep a list. It **derives** the
set:

> a test that **enumerates a directory** and asserts its **offender list is
> empty** is a corpus scanner — and a corpus scanner that has never been shown
> finding an offender is indistinguishable from one that cannot.

That second clause is 3l stated as a rule. Because the set is computed, a scanner
written next month is covered on the day it is written, by nobody remembering
anything. **Verified by planting one**: a throwaway test that enumerates a
directory and asserts emptiness is reported as missing a control immediately,
registered nowhere.

**The definition took three attempts, and the failures are the useful part.**
"Asserts absence anywhere" matched **53 of 62** test files — a rule that broad
becomes a ritual, and a ritual gets suppressed, which this document already warns
about. "Reads a file and asserts absence" still pulled in ordinary logic tests
whose `toBe(0)` was a legitimate count. Only *enumerates a directory* isolates the
scan-a-corpus-and-report-nothing shape, and it lands on **9 files**.

**A corpus floor is not a positive control.** `codebaseHygiene` asserts it walked
more than 150 files; that proves the walk works, not that the detector does.
`sourceHygiene` is the model — a floor **and** a canary that runs the real
predicate over a planted backspace.

**Six of the nine had no control at all**, which is the finding. They could each
report "all clear" with nothing anywhere proving they could report anything else.
`scriptImports` now has one — it plants a module exporting `realThing`, an
importer asking for `realThing` and `movedAway`, and asserts the real parsers
report the dangling name. The remaining five are a **debt register** inside the
test, and it is safe in the way a hand-kept list normally is not:

- it may only shrink;
- a new scanner is not on it, so it fails immediately;
- an entry that has become untrue — the file gained a control, was renamed, or
  stopped being a scanner — **fails the register's own accuracy test**, so it
  cannot quietly outlive its reason. Verified by putting a since-fixed file back
  on the list and watching it fail.

**The honest limit.** This proves a scanner *can* detect something; it does not
prove it detects the right things. A canary is a floor under vacuity, not a
substitute for thinking about what the scanner should catch.

### 4c. The debt register lasted about an hour (2026-09-10)

§4b shipped with six scanners on a debt register and one worked example. That was
deferral dressed as design — JC said so, and was right. A register that makes a
gap *visible* is only worth having while somebody is closing it; left standing it
becomes the exemption list this document warns about twice.

All six now have controls, and each runs the scanner's **own** predicate over a
planted offender rather than a re-implementation of it:

| Scanner | What it now proves it can find |
|---|---|
| `crossPackage` | a planted `SCREAMING_CASE` constant in each package's dialect — and that it ignores indented and lower-case declarations |
| `pageWiring` | a missing `audience` prop, a present one, the **brace-aware** case (`n={a > b}` must not end the tag early), and a longer component name it must not match |
| `cssTokens` | an undefined token used without a fallback — and that a use *with* a fallback is correctly skipped, which is the distinction the whole check turns on |
| `httpHardening` | both leaking forms of `res.status(500)…message: err.message`, and that a 4xx or a `GENERIC` message is left alone |
| `systemMap` | a document differing by a trailing line, and by **one digit inside a count** |
| `codebaseHygiene` | `catch(() => [])`, `catch(() => ({}))`, `catch(() => null)` — and that an empty **handler** `catch(() => {})` does not match, the distinction that made the first version fire eleven times and find nothing |

Two of them needed the pattern lifted out of the scan into a named constant
(`LEAKS_ON_500`, `TOKEN_DEFINITION` / `VAR_USE`) so the control exercises the
same regex the scan does. Writing the pattern out twice in the canary would have
recreated the four-copies problem the band vocabulary had.

`AWAITING_CONTROL` is now empty, and the note above it says what it is for: a
deliberate, reviewable act — not a place to put a scanner nobody felt like
verifying.

### 4d. What the derivation still excludes, and why that is not settled (2026-09-10)

Asked to look for guards not yet touched, the honest answer is that the
derivation rule in 4b — *enumerates a directory* — matched the **instance** more
than the **class**, which is the mistake this document records four times
already.

Widening it to *reads project source and asserts no offenders* finds **nine
more**, none with a control:

`accountLifecycle`, `athleteDisclosure`, `cohorts`, `recompute`, `reliability`,
`riskIndicators`, `sharedFacts`, `symmetry`, and `frontend/src/lib/shared/facts`.

I assumed four of those were ordinary logic tests whose `readFileSync` was
incidental. **They are not** — every one reads project source and asserts a
property of it. Checking beat assuming, again.

**But they are not the same risk, and the difference is worth naming**, because
it is the reason the narrower rule was defensible without my having articulated
it. There are two ways a guard passes vacuously:

1. **The corpus came back empty.** A directory walk that matches nothing reports
   no offenders. This is the `readdirSync` class, and a floor on the corpus size
   is the specific defence. Every one of the nine reads a **known file**, so a
   missing or unreadable file throws rather than passing.
2. **The pattern stopped matching.** `\b` becomes a backspace and the scan is
   inert (3l). This risk applies to **both** classes, and a canary is the only
   defence.

So the corpus scanners carried both risks and now have both defences. The nine
carry risk 2 only. That makes them lower priority, **not** safe — `athleteDisclosure`
greps route source for a predicate name, and if that name changes the check goes
quietly inert while continuing to report that no clinician note leaks to a coach.

**This is recorded as unfinished rather than shipped as a register.** The last
attempt to hold this kind of gap in a list lasted an hour before it was correctly
called deferral dressed as design (4c). Nine canaries is a real pass of work; the
right form is to do them, not to enumerate them somewhere comfortable.

### 4e. Nine turned out to be three, and the reason matters (2026-09-10)

4d named nine guards as having no positive control. **Six of them already had
one** — my marker regex simply could not see the shape.

The shape is a **bracketing positive assertion**: a negative claim sandwiched
between assertions that the scan found its subject at all.

```js
const at = src.indexOf(route);
expect(at).toBeGreaterThan(-1);        // the route WAS found
expect(decl).toMatch(/rbac\(/);        // the slice IS a real rbac call
expect(decl).not.toMatch(/'executive'/); // …and only now, the negative
```

That cannot pass vacuously: if the scan finds nothing, the first two fail. It is
a positive control written inline rather than as a separate canary — and it is
arguably the better form, because it guards the *specific* slice the negative
claim is about rather than a synthetic one.

Six were already safe this way:

| Guard | What brackets its negative |
|---|---|
| `athleteDisclosure` | route index found, slice contains `rbac(` |
| `riskIndicators` | `EXCLUDED_RISK_KEYS` asserted to CONTAIN LDH before five views are asserted not to |
| `accountLifecycle` | `INVITABLE_ROLES` asserted to equal all four roles before `not.toContain('athlete')` |
| `cohorts` | `toMatch(/import { SMALL_COHORT }/)` before `not.toMatch(/const SMALL_COHORT/)` |
| `symmetry` | not a scan at all — direct calls on controlled garbage, with positive assertions on real input |
| `reliability` | same: `toEqual([])` is the expected RESULT for a controlled input |

**Three were genuinely exposed, and two of those were the same hole:**

- `frontend/src/lib/shared/facts.test.ts` and `backend/tests/sharedFacts.test.js`
  both iterate the keys of the shared-facts module. **If that module ever
  exported nothing, every check would pass** — an empty filter is `[]` and a loop
  over nothing asserts nothing. These are the two tests whose entire job is to
  catch the `shared/generate.js` template drift described in `DESIGN_DECISIONS
  §60`, so a vacuous pass there is the specific failure they exist to prevent.
  Both now assert a key-count floor **and** a named anchor, so ten unrelated
  exports could not satisfy it. Verified by emptying `shared/facts.js`: 6 backend
  and 4 frontend assertions fail where all previously passed.
- `recompute` had a bracketing positive proving the file was read, but nothing
  proving its two `not.toMatch` patterns could match. Both now run against a
  planted call, a longer name they must ignore, and the comment case.

**The lesson is about the rule, not the guards.** A marker-based check ("does
this file contain the word canary") measures a convention, not a property. The
six it wrongly accused were better protected than some of the files it passed.
A derived rule is still worth having — it found the three — but its output is a
list of files to **look at**, not a verdict.

### 4f. Checking the claim instead of asserting it (2026-09-10)

4e concluded that six guards were already safe because they carried a
"bracketing positive". **That conclusion was reached by reading them** — the one
form of evidence this document repeatedly shows to be worthless.

Four of the six are now in the mutation registry, and the mutations break the
**guarded property** rather than the detector, which is the stronger check:

| Registered mutation | Result |
|---|---|
| add `'executive'` to the `/:id` rbac list | caught |
| empty `EXCLUDED_RISK_KEYS` (un-exclude LDH) | caught |
| add `'athlete'` to `INVITABLE_ROLES` | caught |
| replace the `SMALL_COHORT` import with a local const | caught — **on the second attempt** |

That second attempt is the useful part. The entry was first registered against
the frontend facts suite, which does not look at that file, and the runner
reported **SURVIVED**. A misregistered guard is indistinguishable from an absent
one, and it is the failure mode a registry was always most likely to have. The
runner found it on its own registry.

The remaining two of the six — `symmetry` and `reliability` — are **not scanners
at all**. Their `toEqual([])` is the expected *result* of a direct call on
controlled garbage input, asserted alongside positive cases on real input. There
is no corpus to come back empty and no pattern to stop matching, so there is
nothing a mutation entry would add.

**12 of 12 mutations now caught**, and every mutated file verified restored
afterwards with `git status`.

### 3q. "634 passed, 0 failed" — with a whole suite that never ran (2026-09-10)

Caught during the dependency work, and it is the cleanest example in this file of
a green result that is not a green result.

`npm audit fix --omit=dev` **prunes devDependencies from `node_modules`** while
it rewrites the tree. `supertest` disappeared, so `tests/reportRoutes.test.js`
could not even be imported. Jest then printed:

```
Test Suites: 1 failed, 43 passed, 44 total
Tests:       634 passed, 634 total
```

**The `Tests:` line has no failure on it, because a suite that fails to LOAD
contributes zero tests.** Its 19 tests are not counted as failing — they are not
counted at all. Anyone reading the line that names "tests" sees an unbroken pass.

It was caught only by comparing 634 against the 653 from ten minutes earlier.
Nothing in the output said "19 tests vanished".

**Two rules from it:**

1. **Read the `Test Suites:` line, not the `Tests:` line.** A load failure only
   ever appears on the first one. This is why `CLAUDE.md` records both counts —
   the suite total is the half that catches a suite going missing, and quoting
   "653 tests" without "44 suites" would not have caught this.
2. **Never run `npm audit fix --omit=dev` in a working tree.** It is not a
   read-only filter; it changes what is installed. Use plain `npm audit fix`, or
   `npm install` immediately afterwards to restore the dev tree.

The general shape is one this document keeps returning to: a count that only
includes what succeeded cannot report what disappeared. It is the same reasoning
as the corpus floors in §4b — an empty scan and a clean scan look identical
unless something asserts the scan happened.

### 3r. The limiter that counted successes, on the host where it mattered (2026-09-11)

**Found by being locked out of the deployed API while running `npm run e2e`
against it** — not by a test, and not by any local run.

`/api/auth` is throttled at 30 failures / 15 minutes / IP. The mechanism was
`express-rate-limit`'s `skipSuccessfulRequests: true`, which un-counts a request
that turned out to succeed. On the hosted instance it un-counted nothing:

```
five consecutive SUCCESSFUL logins against airms-api.vercel.app
  remaining=28 -> 27 -> 26 -> 25 -> 24      and it never recovered
```

So the deployed policy was **"30 requests / 15 min"** while the `RateLimit`
response header, the comment above the limiter, `CLAUDE.md`, `MODULES_STATUS.md`
and this file all said **"30 failures"**. ISN sits behind one NAT address:
thirty sign-ins in fifteen minutes — correct passwords, an ordinary demo
morning — and the whole clinic is refused for the rest of the window, with
nothing anywhere explaining why.

#### Why every test passed

`skipSuccessfulRequests` decrements from a `res.on('finish')` handler, i.e.
**after the response has been flushed**. With the old in-process Map that
decrement was a synchronous mutation and completed. The 2026-09-10 move to a
database-backed store (§ the entry above, and `DESIGN_DECISIONS` §75) turned it
into an awaited query — and Vercel freezes the instance once the response is
out, so the write is issued and never lands.

Nothing local could see it. A nodemon process lives long enough to finish the
write, so the store worked correctly on this machine, its unit suite passed,
and the local e2e signed in dozens of times without a 429. **The store was
never the broken part.** What was wrong lived in *when* the un-counting ran,
which only a deployed request can show.

This is the sub-pattern worth naming: **a correct component, wired to a
lifecycle hook the platform does not guarantee.** Unit tests assert the
component; integration tests assert the wiring; neither asserts that the host
will still be running when the callback fires. The only instrument that sees it
is the deployed system answering a real request.

#### The fix, and why it is shaped this way

The forgiveness moved **inside** the request: a successful sign-in awaits
`clearRateLimit()` before responding, so it depends on nothing the platform may
decline to run afterwards. Same policy and same numbers; the counter resets on
success rather than decrementing.

The key comes from one exported `authThrottleKey`, shared by the limiter and the
reset. Two definitions would be this document's favourite failure in miniature —
a reset that clears a counter nobody reads, forgiving nothing, silently, with
every test still green.

Verified by re-running the measurement that found it:

```
failure #1 -> remaining=29     failure #3 -> remaining=27
failure #2 -> remaining=28     failure #4 -> remaining=26
SUCCESS     -> remaining=25    (increments, then clears)
next req    -> remaining=29, reset=899   <- a full window again
```

#### And a vacuous test, found while writing its replacement

The suite's `Setting.destroy` mock ignored the write-fail mode, so a new
*"fails OPEN when the settings table is unreachable"* case passed without ever
exercising a failure — it resolved without throwing whether or not the code
caught anything. Caught by making `clearRateLimit` rethrow and watching the test
**still pass**. The mock now honours the mode; with the rethrow it fails, and
without it 20 pass.

Same standing lesson as 3l/3n/3o/3p: a guard is worth what its test has been
*seen* to catch, and a mock that cannot produce the failure makes the test a
statement of intent.
