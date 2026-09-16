# AIRMS — Athlete Injury Risk Management System

A web application for **Institut Sukan Negara (ISN)** Malaysia that turns the
HoloMotion screening reports ISN already produces into one explainable risk
verdict, shaped for four different readers — without any of them having to read
a PDF.

Final-year project by **JC**, with **Dr Thung** (ISN) as stakeholder and
**Dr Hoo Wai Lam** as academic supervisor.

**Mission in one line:** ingest the HoloMotion PDF (the single source of truth),
score each athlete against their *real peer cohort* rather than a published
threshold, and deliver that verdict in role-shaped views. Norms are
institution-governed — approved, versioned, auditable. A clinician can always
override with a note. The athlete's name is redacted on-device before any image
leaves the machine.

---

## Where to go next

| If you are… | Start here |
|---|---|
| **Taking this project over** | This file, then [`docs/README.md`](docs/README.md) — the documentation index |
| **Examining / marking it** | [`docs/fyp/VIVA_FYP2.md`](docs/fyp/VIVA_FYP2.md) (thesis, hard questions, measured numbers), then [`docs/MODULES_STATUS.md`](docs/MODULES_STATUS.md) |
| **Looking for *why* something is built this way** | [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) — and [`docs/MASTER_CLARIFICATIONS.md`](docs/MASTER_CLARIFICATIONS.md), which wins when docs disagree |
| **Trying to find a file** | [`docs/PROJECT_GUIDE.md`](docs/PROJECT_GUIDE.md) (file-level map) or [`docs/SYSTEM_MAP.md`](docs/SYSTEM_MAP.md) (generated inventory) |
| **Using the system as a clinician or coach** | [`docs/USER_MANUAL.md`](docs/USER_MANUAL.md) |
| **Deploying it** | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| **A new Claude Code session** | [`CLAUDE.md`](CLAUDE.md), then [`docs/README_FOR_CLAUDE_CODE.md`](docs/README_FOR_CLAUDE_CODE.md) |

---

## Quick start

Requires **Node ≥ 22 < 23** and a local **MySQL 8**.

```powershell
# First time only
npm install            # installs concurrently at root
npm run install:all    # installs deps in root + backend + frontend
npm run sync:shared    # regenerates the shared facts into both packages
npm run seed           # drops + reseeds MySQL with deterministic sample data

# Daily use
npm run dev            # backend (:5000) + frontend (:3000) in one terminal
```

Then open <http://localhost:3000>.

Backend configuration lives in `backend/.env` (not committed) and the frontend
reads `NEXT_PUBLIC_API_URL` from `frontend/.env.local`. Every environment
variable the backend reads is listed in
[`docs/SYSTEM_MAP.md` §7](docs/SYSTEM_MAP.md) — generated from the code, so it
cannot fall behind.

### Demo credentials

**Every seeded account uses the same password: `airms2026`.** One password, and
the address carries the role — handing a stakeholder five address/password pairs
means five chances to mix them up.

| Role | Email | Notes |
|---|---|---|
| Athlete | `athlete@isn.gov.my` | John Doe |
| Athlete | `thung@isn.gov.my` | Deliberately stale, so importing the sample HoloMotion PDF visibly updates it |
| Medical | `medical@isn.gov.my` | Medical Demo 01 |
| Admin | `admin@isn.gov.my` | Dr Thung's role |
| Coach | `coach@isn.gov.my` | Badminton — the squad the athlete logins sit in |
| Executive | `executive@isn.gov.my` | Read-only oversight: analytics + reports, no writes |

`npm run seed` prints each demo athlete's IC number (the athlete key). These
fixtures deliberately sit outside the password policy, which gates user-driven
password setting rather than seeded data. Real accounts are created by
**invitation** and set their own password — there is no self-registration.

---

## Stack

- **Frontend:** Next.js 15.5 (App Router) · React 19 · TypeScript 6 · Chart.js · plain CSS with custom properties
- **Backend:** Node.js · Express · Sequelize · JWT auth
- **Database:** MySQL 8 (matches ISN's production target)
- **Ingestion:** HoloMotion PDF via a provider-agnostic vision model, with on-device name redaction first
- **Body map:** path data adapted from [`react-muscle-highlighter`](https://github.com/soroojshehryar/react-muscle-highlighter) (MIT, © 2024 Sorooj Shehryar)

No Tailwind, no CSS-in-JS, no component library — [a recorded decision](docs/DESIGN_DECISIONS.md), not an omission.

---

## Modules

Six modules, renumbered on 2026-07-20 when Activity Tracking was removed. **The
numbering below is current**; older documents may use the FYP I decomposition.

| # | Module | Primary role | Status |
|---|---|---|---|
| **G** | General — auth, RBAC, password management | all | ✅ complete |
| 1 | Athlete Dashboard & Overall Risk Indicator | athlete | ✅ complete — the FYP showcase |
| 2 | Athlete Roster & Identity Management | admin + medical | 🟢 functional |
| 3 | Screening Data Ingestion (HoloMotion PDF) | admin + medical | 🟢 functional |
| 4 | Cohort Norms & Governance | admin | 🟢 functional |
| 5 | Analytics & Reporting | admin + coach | 🟢 functional |
| 6 | Clinical & Squad Monitoring | medical + coach | 🟢 functional |

**No module has a deferred item.** One known gap remains and it is *external,
not unbuilt*: Module 3's real ISN directory access, where the seam is mocked and
ready pending Dr Thung granting it. Full per-module detail, including the
removed FYP I modules kept as a record:
[`docs/MODULES_STATUS.md`](docs/MODULES_STATUS.md).

### Five roles

`athlete` · `medical` · `admin` · `coach` · `executive`. The last two are FYP II
additions; `executive` is **read-only oversight** and deliberately *not* a
super-admin — it has strictly fewer powers than `admin`. Who can actually do
what is **measured**, not described, in [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md).

---

## The FYP differentiator

The verdict on every dashboard is a **cohort-normed risk indicator**: each
athlete is scored against their real peer cohort — sport, programme, gender, age
group, with a documented fallback ladder when a cohort is too small — rather
than against a published threshold. The norms in force are pinned, versioned and
auditable, and a clinician can override any band with a note.

Two properties are worth knowing before reading the code:

- **The system declines rather than inventing a number.** Below `MIN_PAIRS`
  repeat screenings it refuses to derive a detectable-change threshold and says
  so on screen; below two years it refuses to name a risky season; a small
  cohort caveats itself.
- **Green never reads "Safe."** A screen that cannot predict injury cannot
  certify its absence.

The **composite ACWR risk model** ([`frontend/src/lib/risk.ts`](frontend/src/lib/risk.ts))
is a locked decision and remains in the tree, but has had **no live callers**
since Activity Tracking was removed on 2026-07-20 — it is retained as a
documented rebuild path ([`docs/fyp/ACWR_REBUILD.md`](docs/fyp/ACWR_REBUILD.md)),
not as shipped behaviour. **Do not delete it, and do not restore the ACWR heroes
without asking.**

---

## Verifying it

This project's signature defect is *a wrong answer that looks like a right one*
([`docs/SILENT_FAILURES.md`](docs/SILENT_FAILURES.md)), so most checks exist to
catch output that reads as ordinary.

```powershell
cd backend;  npx jest              # 58 backend suites
cd frontend; npx jest              # 22 frontend suites
cd frontend; npm run typecheck
cd frontend; npm run lint

cd backend;  npm run mutate        # break each guard, prove its test fails (needs ports free)
cd backend;  npm run map           # regenerate docs/SYSTEM_MAP.md from the code
cd backend;  npm run measure:facts # print headline numbers FROM THE DATABASE
```

These need a running instance (`npm run dev`):

```powershell
cd backend;  npm run audit:access  # call every endpoint as every role, and anonymously
cd backend;  npm run verify:claims # check operational claims against a live process
cd frontend; npm run e2e           # real Chrome, 112 checks
cd frontend; npm run verify:csp    # the CSP in real Chrome against a production build
```

**Run `npm run measure:facts` before quoting any number** in the report or the
viva. The docs have carried four different band splits, each true when written.

CI (`.github/workflows/ci.yml`) runs the suites, typecheck, lint, mutation and
CSP jobs. `audit:access`, `verify:claims` and `e2e` need a live instance and are
deliberately left out rather than half-wired.

---

## Folder tour

```
.
├── airms-prototype/   inherited HTML prototype from prior students — reference only, not deployed
├── archive/           retired code kept as a record (excel-upload/)
├── assets/            source logos
├── backend/           Node + Express + Sequelize API
│   ├── src/           models, routes, middleware, utils, mock ISN directory
│   ├── scripts/       migrations, verification and measurement commands
│   └── tests/         jest suites
├── docs/              all documentation — see docs/README.md for the index
│   ├── fyp/           academic artefacts: viva dossier, report tables, slides
│   └── stakeholder/   meeting transcripts, requirements traceability
├── frontend/          Next.js 15 App Router
│   └── src/           app/ (pages), components/, lib/, styles/
├── reports/           FYP report PDFs
├── scripts/           dev orchestration — dev.js, dev-alt.js, dev-stop.js, preflight-ports.js
├── shared/            facts.js — the ONE source both packages are generated from
├── CLAUDE.md          working instructions for Claude Code sessions
└── sync-to-submission.ps1   mirror + scrub to the clean submission repo
```

**`shared/facts.js` is generated into both packages, not imported by them.**
Each package must stay self-contained because Vercel builds them with different
root directories — a package at the repo root would be in neither build context.
Run `npm run sync:shared` after editing it; both suites fail if a committed copy
is stale.

---

## Deployed instance

| | |
|---|---|
| Web | `https://airms-web.vercel.app` |
| API | `https://airms-api.vercel.app` |
| Database | Aiven managed MySQL 8.4, TLS required |

A push to `feat/mysql-migration` deploys both. Platform faults that all present
as the same opaque error, and the settings that cause them, are in
[`docs/DEPLOY.md`](docs/DEPLOY.md) — read it before deploying.

---

## Acknowledgements

- **Dr Thung** (ISN) — stakeholder requirements
- **Dr Hoo Wai Lam** — academic supervisor
- **Shewin** and **Keying** — prior student work this project iterates on
- **Sorooj Shehryar** — [`react-muscle-highlighter`](https://github.com/soroojshehryar/react-muscle-highlighter) body-map path data (MIT). *This attribution is a locked decision and must remain in the FYP references section.*

Academic citations for the risk model and load methodology are collected in
[`docs/fyp/REFERENCES.md`](docs/fyp/REFERENCES.md).
