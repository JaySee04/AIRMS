# AIRMS — handover guide for whoever maintains this next

**You are reading this because you have to change the code, not just run it.**
If you only need to install and operate AIRMS, read [`DEPLOY_ISN.md`](DEPLOY_ISN.md)
and [`USER_MANUAL.md`](USER_MANUAL.md) instead — this document is about the
codebase.

Everything stated here was measured on **2026-10-11** against the code in this
repository, not recalled. Where a number can go stale, the command that
produces it is given beside it.

---

## 1. What the system is, in one paragraph

AIRMS turns the musculoskeletal screening reports Institut Sukan Negara already
produces into one explainable risk signal, scored against each athlete's real
peer cohort rather than a published threshold, and delivers it in five
role-shaped views so that nobody has to read a PDF to act on it. The HoloMotion
report is the **single source of truth**: everything on every screen derives
from it.

**The claim it does not make:** AIRMS does not predict injury. It triages who is
worth a clinician's time. No surface says *safe*, *cleared* or *fit to play* —
the lowest risk band reads "No indicators flagged" for that reason, and if you
change that wording you have changed a clinical claim, not a label.

---

## 2. Tech stack

| Layer | Technology | Version | Note |
|---|---|---|---|
| Client | Next.js App Router + React | 15.5 / 19 | File-system routing *is* the access boundary |
| Language (client) | TypeScript | 6.0 | **6.0 is a ceiling**, see below |
| Styling | Plain CSS + custom properties | — | No Tailwind, no CSS-in-JS, no component library |
| Charts | Chart.js | 4.4 | |
| Client PDF | pdf-lib | 1.17 | Dynamically imported; page-slicing for oversize uploads |
| Server | Node + Express | ≥22 / 5.2 | Express 5 routes rejected promises to the error handler |
| ORM / DB | Sequelize / MySQL | 6.37 / 8.4 | |
| PDF output | PDFKit | 0.20 | Streams straight to the response |
| PDF rendering | pdfjs-dist + `@napi-rs/canvas` | 6.3 / 1.0.9 | **Coupled**, see below |
| OCR | tesseract.js | **5.1** | **Pinned**, see below |
| Text extraction | `@firecrawl/pdf-inspector` | 1.17 | Per-glyph; recovers the letter-spaced summary |
| Spreadsheet | SheetJS | 0.20 | From the vendor CDN, not the npm registry |
| Auth | jsonwebtoken + bcryptjs | 9.0 / 3.0 | |
| Hardening | helmet + express-rate-limit | 8.3 / 8.6 | |
| Mail | Nodemailer | 10.0 | Console transport when unconfigured |
| Browser tests | puppeteer-core | 25.9 | Uses the installed Chrome; downloads nothing |

### Three version constraints that are not preferences

- **`pdfjs-dist` and `@napi-rs/canvas` must be upgraded together or not at all.**
  Moving either alone **segfaults** the render path — a native crash with no
  stack, not an exception you can catch.
- **`tesseract.js` is pinned to 5.** Versions 6 and 7 stop locating the athlete's
  name and silently fall back to obscuring a large page region. The fallback
  still reports `redacted: true`, so **check the `method`, never the flag**.
- **TypeScript 7 cannot be used.** Next 15.5 fails the build on it, and every
  `@typescript-eslint` package under `eslint-config-next@15` declares
  `typescript: ">=4.8.4 <6.1.0"`. `npm outdated` will keep offering 7; that is
  not an oversight.

### Do not swap

The stack, the charting library, the styling approach and the body-map asset are
settled decisions. The body map is `react-muscle-highlighter` (MIT, Sorooj
Shehryar) — **the attribution is a licence obligation and must stay**. What this
project may claim as its own is the re-slicing of that geometry into the
instrument's 22-muscle vocabulary and the clinical mapping, not the paths. An
original redraw was attempted and reverted on the owner's verdict; do not
re-propose it.

---

## 3. First fifteen minutes

```bash
npm run install:all          # root + backend + frontend
npm run sync:shared          # regenerate the shared constants into both packages
npm run seed                 # drop + reseed MySQL with a deterministic dataset
npm run dev                  # backend :5000 + frontend :3000
```

Sign in with any seeded account; they all use the same password, printed by the
seeder. `npm run seed` **refuses** to run against anything that looks like a
real installation — production mode, or a database holding non-demo accounts.

`npm run dev:stop` stops every AIRMS dev server. Use it rather than killing the
process on the port: killing the listener leaves `nodemon` alive, and it
restarts the server the moment any file under `backend/src` changes.

---

## 4. Architecture — the five things that are not obvious

**1. Derived values are persisted, not computed on read.** The composite
indicator, the risk band and the cohort statistics are written when the data
changes. Computing them per request would make every dashboard load a
squad-wide calculation whose result nobody could audit afterwards.

**2. The facts both tiers must agree on are GENERATED into each of them.**
`shared/facts.js` → `backend/src/shared/facts.js` and
`frontend/src/lib/shared/facts.ts` via `npm run sync:shared`. It is a generator
and **not** an npm workspace for a deployment reason: the two tiers build from
separate roots, so a package at the repository root is in neither build context
— it would resolve locally, pass every test, and fail on deploy.

> **Adding a shared constant takes TWO edits.** Add it to `shared/facts.js`
> *and* to both renderers in `shared/generate.js`, then sync. Editing only the
> first is a silent no-op, and `sync:shared` will report "already in sync".

**3. Extraction has two paths and the fallback is the point.** Where the report
carries a text layer — every expanded layout measured — every value is read
exactly, on the machine, with no external call. Where it does not — the compact
layout — pages are rendered and sent to a vision model. **Do not "simplify" this
to text-only**; the compact layout has no text at all.

**4. The athlete key is the identity-card number.** It reconciles directly
against ISN's own directory. It is also sensitive personal data that encodes
date of birth, birth state and sex, so the controls live at the boundaries:
on-device redaction before any transmission, identical refusals for
out-of-scope and non-existent athletes, the IC withheld from the squad view, and
log context recorded as the route pattern rather than the resolved path.

**5. Medical staff are unrestricted across the roster on purpose.** Clinical
cover is not organised by sport. The compensating control is that opening a
record is itself audited. If you ever scope clinicians by sport, you break
clinical cover; if you remove the audit, you remove the justification.

### Where things live

| Looking for | Go to |
|---|---|
| Which file holds what | [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) |
| Every column, endpoint, page, setting, audited action | [`SYSTEM_MAP.md`](SYSTEM_MAP.md) — **generated**, `npm run map` |
| Who can do what, measured | [`PERMISSIONS.md`](PERMISSIONS.md) |
| Why something is the way it is | [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) — 160 numbered sections |
| The defect class this project produces | [`SILENT_FAILURES.md`](SILENT_FAILURES.md) |
| What is shipped vs deferred, per module | [`MODULES_STATUS.md`](MODULES_STATUS.md) |
| The locked architectural decisions | [`MASTER_CLARIFICATIONS.md`](MASTER_CLARIFICATIONS.md) — **wins over every other document** |

---

## 5. How decisions are made and recorded

The project keeps **two kinds of writing**, and confusing them is itself a
documented mistake:

| | Rule |
|---|---|
| **Rules files** — `MASTER_CLARIFICATIONS`, `MODULES_STATUS`, `PROJECT_GUIDE`, this file | State the rule **in force**, positively. When a decision changes, **rewrite them** — do not strike through and annotate. A repository that states a rule it does not follow, with the real rule in a footnote, forces the next reader to reconstruct the current position from an argument about a previous one. |
| **Logs** — `DESIGN_DECISIONS`, `SILENT_FAILURES` | Keep the history; that is the whole job. Supersede with a banner and leave the original reasoning intact, **including estimates that turned out wrong**. |
| **Generated** — `SYSTEM_MAP` | Never hand-edit. Both test suites fail if the committed copy is stale. |

**When you make a non-trivial decision, record it as a numbered section in
`DESIGN_DECISIONS.md`** with: what was chosen, what was rejected, and the
measurement or reasoning that decided it. Reference it from the code it governs
(`// see DD §123`). A guard (`backend/tests/decisionRefs.test.js`) fails if code
cites a section that does not exist — a reader who follows `§155` and finds
nothing concludes they looked in the wrong place, not that the comment is stale.

---

## 6. The rules to follow when developing

### 6.1 The defect class

**This project's characteristic bug is a wrong answer that looks like a right
one** — not a crash. A fabricated zero drawn on a gauge. A guard that matches
nothing and reports "all clear". A check whose own test agrees with it while
both are wrong. `SILENT_FAILURES.md` catalogues the sub-patterns. Everything in
this section exists because of one of them.

### 6.2 Writing a check

**A broken check is worse than no check — it answers the question you stopped
asking.** Each rule below cost this project something:

1. **A check you have never seen fail is a guess.** Break what it guards, watch
   it go red, restore — then register it in `backend/scripts/mutation-check.js`
   so the proof is standing rather than one-time.
2. **A check that could not measure must never read as clean.** Exit non-zero.
   An expired session, a renamed route and a skipped case all end on a screen
   with no problems on it.
3. **Assert the artifact, not the transport.** A streamed response writes its
   status *before* the work, so it cannot report what happens after.
4. **Ask "is this the thing I sent", not "is something there."**
5. **Read the payload's real keys.** A wrong key reads as zero, and zero is the
   most believable wrong answer there is.
6. **Hand a scoped actor its OWN data**, or you are testing the scope check.
7. **An upgrade is "shown to work" only where the environment differs.**
8. **One definition, or pin the copies to each other** in the direction that
   fails silently.
9. **Ask the system of record** — `information_schema`, the audit trail, the
   deployed function's stderr. Not the working tree, not a doc, not an endpoint
   answering 200 for its own reasons.
10. **Drive every entry to a control** — hover, focus and tap are three code
    paths wearing one name.
11. **Reproduce under a hypothesis before touching the code it accuses.**
    "Harness variance" is a verdict to earn, not to reach for.

### 6.3 Things that have already been tried and broke something

Each of these carries a "do not simplify this" comment in the code. They are not
style preferences:

- The shared-facts **generator** (not a workspace) — §4.2 above.
- The two-path **extraction** fallback — §4.3 above.
- The scheduled-mail **lock**: `where: { value: token }` matches nothing,
  because the column is JSON. The lock then leaks silently while every test
  passes.
- `ScreeningPanel` **resolving its own fields** from the nested screening
  object. Reverting it to flat props makes four dashboard cards render nothing,
  silently, for weeks.
- The **upload page-slicing ladder**. Narrowing can lose the prescription (an
  incomplete import); narrowing the head would lose the scores (a wrong one).
- The **detectable-change module declining** below its minimum pair count. The
  decline is the feature. Lowering the floor manufactures a threshold.
- The **norm-eligibility floors staying off**. Filtering a norm on the quantity
  being normed censors the lower tail and over-flags whoever remains.
- `InfoTip` opening on **hover, focus and click**. Hover-only is unreachable by
  touch and keyboard.

### 6.4 Editing files

**Do not edit code by matching or slicing text through a shell heredoc.** Four
separate defects came from this in one day, and every one produced a file that
parsed and passed. `\n` becomes a real newline; `\b` becomes a **backspace byte**
invisible to grep and to an editor; backticks get command-substituted; a slice
anchored on a marker that also appears in the inserted text inverts and deletes
a span. Use an editor that writes bytes literally. Commit messages go through
`git commit -F <file>`, never `-m` with prose.

### 6.5 Comments

This codebase is comment-heavy **on purpose**. The test:

> A comment that would still be true if the code beneath it were deleted is
> describing the code — cut it. A comment carrying a number, a date, a refused
> alternative or a measurement is carrying evidence — keep it.

Never quote a string that a test asserts on in a comment next to it;
`backend/tests/proseBlindness.test.js` exists because a comment once satisfied a
test on its own.

### 6.6 Colour

Three colour systems, three jobs, and mixing them is the fault that keeps
recurring: **band** (a clinical verdict), **tier** (the instrument's own 0–100
quality scale) and **series** (how much of a thing, no state implied). **A count
is never painted in a status hue.** Separately, a colour has three *roles* —
the fill (`--risk-*`), text on the card (`--risk-*-ink`) and text on that fill
(`--on-risk-*`). Never bind an ink token to a background or a border.

---

## 7. What to run before you commit

```bash
cd backend;  npx jest        # 75 suites / 1161 tests
cd frontend; npx jest        # 31 suites / 529 tests
cd frontend; npm run typecheck
cd frontend; npm run lint
```

**Run both suites even for a change that touches only one package.** Several
backend guards read the frontend; a frontend-only change has shipped three
backend failures before.

**Never run `npm run mutate` and `npx jest` at the same time.** `mutate` edits
source files in place, and several suites read those same files as text. Two of
six concurrent runs failed; none of five sequential ones did.

### The wider verification set

| Command | What only it can tell you |
|---|---|
| `npm run mutate` | That each registered guard can actually fail. 129 guards |
| `npm run map` | Regenerates `SYSTEM_MAP.md`; both suites fail if it is stale |
| `npm run audit:access` | The permission matrix, by **calling** all 67 endpoints as every role and with no token |
| `npm run verify:claims` | Operational claims against a **running** instance — things only true or false of a deployment |
| `npm run verify:schema` | Column and index drift between the models and the **live database**. The only thing that proves a migration landed |
| `npm run verify:reports` | That every PDF actually downloads and ends with a valid trailer |
| `npm run e2e` (frontend) | Real Chrome against the running app, 176 checks |
| `npm run verify:contrast` / `verify:a11y` / `verify:layout` | Colour, roles and geometry, measured in a browser |
| `npm run measure:facts` | Headline numbers from the database. **Run before quoting any figure** — the docs have carried four different band splits, each true when written |

---

## 8. Deploying

Read [`DEPLOY_ISN.md`](DEPLOY_ISN.md) for an institutional install and
[`DEPLOY.md`](DEPLOY.md) for the hosted demonstration, including four platform
faults that all present as the same opaque error.

**Before any deploy touching the schema, run `npm run verify:schema` against the
target database.** An endpoint answering 200 does not prove a migration landed;
six days of a broken hosted API turned on exactly that mistake. Ask
`information_schema`, which cannot be fooled.

Migrations are **expand-then-deploy**: a migrated database serves the old code,
but new code selecting a missing column fails on every query.

---

## 9. What was deliberately removed — do not revive

These were built and cut on the stakeholder's direction. Their absence is a
decision, not a gap:

- **Training-load monitoring and ACWR.** `frontend/src/lib/risk.ts` is retained
  as a locked, documented artefact with **no live callers**. Do not delete it;
  do not wire it up without asking.
- **Injury logging and athlete self-reporting.** No injury table, no history, no
  self-report. What survives is a clinician-set flag whose only purpose is
  cohort-norm eligibility.
- **The Excel screening import** (archived under `archive/excel-upload/`). The
  Excel *backup export* is unrelated and is live.
- **Posture evaluation** — cut on an inference from stakeholder silence rather
  than a refusal. The richest unused layer of the report; it would return with
  stakeholder backing.

Check [`fyp/DELETION_REVIEW.md`](fyp/DELETION_REVIEW.md) before deleting
anything that looks unused.

---

## 10. Known limitations, stated plainly

- **Nothing here is validated against injury outcomes.** The band thresholds are
  a defensible triage cut-off and would be indefensible as a clinical one.
- **Every scored athlete sits in a cohort of ten peers or fewer** (median seven).
  A *t*-based comparison is the correct refinement if the roster does not grow.
- **The detectable-change threshold is assumed, not earned** — 18 repeat pairs
  against the 20 the method needs. The system says so on every surface.
- **The instrument's reliability varies by domain** and the system does not
  weight for it.
- **63 of the body map's 87 regions are below the WCAG minimum target size.**
  Mitigated by an equivalent written listing of every finding, which has not
  been formally audited against the criterion's exemption.
- **The application connects to MySQL as `root`** in the default configuration.
  The least-privilege `GRANT` is written out in [`SECURITY.md`](SECURITY.md) §6.2.
- **CI does not gate the deploy.** A red run on the production branch is
  deployed over.

---

*Maintained as a rules file: state what is true now. If you change something
this document describes, change this document in the same commit.*
