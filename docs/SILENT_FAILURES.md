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

**Not yet swept** (recorded so the gap is known rather than assumed absent):
timezone handling on `assessedAt` boundaries; sort stability where a score is
`null`; and the FYP report's quoted headline numbers against the live database
(`VIVA_FYP2 §2` must be re-measured before the viva regardless).

---

## 3. Standing guards

What now catches each class automatically, so the next instance fails a test
instead of reaching Dr Thung.

| Class | Guard |
|---|---|
| A — unreachable | `permissions.test.js` "UC-41 wiring", `athleteDisclosure.test.js` "wiring", `accountLifecycle.test.js` role pin. All read route **source**, because the predicates are pure and pass regardless. |
| B — by omission | `riskIndicators.test.js` + `screeningAlerts.indicators.test.ts` pin the two packages' indicator lists and **assert the LDH exclusion as a value**; `bands.test.ts` pins the labels; `athleteDisclosure.test.js` pins the note allow-list. |
| E — dead declarations | **`lib/cssTokens.test.ts`** — every `var(--x)` used without a fallback must be defined. Reports `token used at file:line`. Includes a corpus check, so deleting the walker cannot make it pass vacuously. |
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
