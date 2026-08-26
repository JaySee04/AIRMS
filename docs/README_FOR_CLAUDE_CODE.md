# README for Claude Code — AIRMS Project Context

> **You are Claude Code. You are helping the user (JC) build AIRMS — the Athlete Injury Risk Management System — as his Final Year Project for Institut Sukan Negara (ISN) Malaysia.**
>
> This file is your map. Read this first. It states what the system is *for*, what it currently *is*, and how to keep building it without undoing settled decisions.
>
> **Note:** A shorter root-level [`CLAUDE.md`](../CLAUDE.md) is auto-loaded into every session and summarises commands, architecture, and locked decisions. This file is the *long-form* version — mission, stakeholder context, reading order, and the continuation guide. Read it when starting a new project or after a context reset.

---

> **Note:** this mission/vision/non-goals statement is mirrored in
> [`MASTER_CLARIFICATIONS.md §1`](MASTER_CLARIFICATIONS.md), which is the copy
> that reaches the submission repo (this file is stripped by the sync). Keep the
> two in step — §1 is the canonical one if they ever diverge.

## Mission (what AIRMS is for)

**Turn ISN's existing HoloMotion screening reports into a risk signal a clinician, a coach and an athlete can each act on — without any of them needing to read a PDF.**

Three parts, all load-bearing:

1. **Ingest what ISN already produces.** ISN screens athletes on a HoloMotion rig, which emits a per-athlete PDF. That PDF is the **single source of truth** for the whole system (directive of 2026-08-01/02). AIRMS does not ask anyone to key in data by hand, does not ask athletes to self-log, and does not invent a second measurement stream.
2. **Score each athlete against their own peers, not a textbook.** A raw HoloMotion number means little on its own. AIRMS builds **cohort norms** — mean/SD per (sport, programme, gender, discipline) — and expresses an athlete as a z-score-derived **0–100 Total Score of Athleticism**, banded green/amber/red with explicit **escalation rules**. The band is always accompanied by *why* it fired.
3. **Deliver the same truth in four shapes.** One computation, four audiences: the athlete's own dashboard, the clinician's assessment surface (with an override they must justify), the coach's sport-scoped readiness board, and the admin's cohort governance + PDF reports. (A fifth *role*, `executive`, was added 2026-08-08, but it is a read-only lens over the admin shape rather than a fifth audience with its own view.) Nobody sees a number the others can't reconcile.

**The one-sentence version, for viva:** *"AIRMS reads the screening reports ISN already generates, norms every athlete against their real peer group instead of a published threshold, and surfaces one explainable risk verdict to the athlete, the clinician, the coach and the administrator."*

## Vision (where this is going)

- **Institutional, not personal.** Norms are **admin-governed**: computed automatically on import, but approved, editable, versioned (named snapshots, restorable) and auditable. AIRMS is a system ISN could adopt, not a student's calculator.
- **Clinician-final.** Every automated band can be overridden by medical staff with a required note; the override is provenance-tagged (`Calculated` vs `In force`) and expires on the next import. The machine proposes; the clinician disposes.
- **Privacy by construction.** The athlete's name is OCR-located and **blacked out on-device** before any page image reaches the vision model — the sole direct identifier never leaves the machine. This is a design property to defend in viva, not a feature toggle.
- **Integration-ready.** ISN's athlete master directory is behind a **seam** (`mock/isnDirectory.js` → `searchIsn` / `getIsnByIC`). When ISN grants access, one module changes; routes and UI don't.
- **Defensible over impressive.** Every architectural call needs a one-liner answering *"why this and not X?"*, because JC has to say it to Dr Hoo.

## Non-goals (things that are deliberately NOT in AIRMS)

Do not propose these. Each was considered and settled:

| Not doing | Why |
|---|---|
| Athlete self-reporting of injuries | Removed 2026-08-02 by the HoloMotion-only cut |
| An injury table / injury history / recovery milestones | Same cut. What survives is a single clinician-set `isInjured` flag on the athlete row |
| Training-load logging (sRPE sessions), ACWR displays | Activity Tracking fully removed 2026-07-20. `lib/risk.ts` is kept (locked formula) but has **no live callers** |
| Posture Evaluation | Removed everywhere 2026-08-01 — not required by Dr Thung |
| Excel screening import | Retired 2026-07-12 → `archive/excel-upload/`. The Excel **backup export** stays |
| Lumbar Disc Herniation on any display | Extracted and stored, never shown — ISN's facilities can't support that assessment |
| Tailwind / CSS-in-JS / component libraries / a different chart lib | Locked styling + stack decisions |
| Features outside the 6-module FDD | The FDD is the scope ceiling |

---

## Who the user is

- **JC** — final-year computer science student, doing his FYP with ISN as the stakeholder
- **Stack he knows**: Next.js, Node.js, MySQL (Sequelize). Originally built AIRMS on MongoDB; migrated to MySQL once ISN's production target was confirmed. Not deep in DevOps, infra, or library evaluation — he relies on you to make those judgment calls and explain them
- **Communication style**: Direct, sometimes terse. Will tell you when something doesn't match his vision — listen and iterate
- **Has Memory entries about him**: see `~/.claude/projects/.../memory/MEMORY.md` for persistent context across sessions

## Who the stakeholders are

- **Dr Thung** — ISN sports scientist, primary stakeholder. His requirements drive what AIRMS must do. Transcript: [docs/stakeholder/meeting-2026-04-24-dr-thung.txt](stakeholder/meeting-2026-04-24-dr-thung.txt)
- **Dr Hoo Wai Lam** — JC's FYP supervisor. He drives the *academic* requirements (rubric, modules, deliverables). Same transcript covers his asks
- **ISN as institution** — Malaysia's national sports institute. The canonical data shape is the **HoloMotion report** itself. (The Excel-era `isn-csv-template.xlsx` sample is no longer in the repo — the import it described was retired 2026-07-12.)

---

## What AIRMS currently is (as of 2026-08-18)

**Five** roles, one shared computation:

| Role | Sees | Does not see |
|---|---|---|
| **Athlete** | Own cohort-normed risk hero, 7-axis risk radar, 22-muscle body map, embedded HoloMotion screening panel, screening **history**, same-sport **squad** readiness summary, own PDF | Any teammate's clinical detail |
| **Medical** | The athlete dashboard *plus* clinician affordances — band override with note, injured flag, screening date picker, HoloMotion PDF import, cohort norms (if granted `editCohortNorms`) | Admin governance pages |
| **Coach** | Read-only squad readiness for their **one** assigned sport — worst-first ordering, needs-attention list, squad focus, per-athlete trend, team + individual PDFs | Anything outside their sport; any clinical affordance |
| **Admin** | Screening cohort analytics, programme activity over time, the Activity Log, cohort-norm approval + versioning + **pinning** + membership, tunable settings, personnel management, PDF reports, Excel backup | — |
| **Executive** *(added 2026-08-08)* | Read-only institutional oversight — the admin analytics and the three PDF reports | **Anything that writes**: no import, no norm edits, no roster or personnel changes, no settings, no backup export. It is deliberately **not** a super-admin — it has strictly fewer powers than `admin`, and naming it that would misdescribe it |

### The end-to-end data path (learn this one thing)

```
HoloMotion PDF
  → pdfRender.js       render leading pages to PNG (pdfjs + @napi-rs/canvas alias)
  → redactName.js      local Tesseract OCR blacks out the name  ← privacy boundary
  → visionClient.js    provider-agnostic vision call (OpenAI-wire or Anthropic)
  → holomotionExtract  strict JSON → flat Athlete columns + muscle_flags rows
  → POST /upload/screening/pdf   commit (operator has attached a roster athlete)
  → postImport.js      write immutable Screening snapshot row
  → cohorts.js         recompute cohort norms (spgd → spg → sg → s → all)
  → overallIndicator   z-scores → 0–100 indicator → band + escalations
  → alerts.js          email medical + the sport's coaches if band ≥ threshold
  → dashboards / PDFs  athlete · medical · coach · admin all read the same row
```

Everything else in the codebase hangs off that spine.

### Where things live (the short version — full map in [PROJECT_GUIDE.md](PROJECT_GUIDE.md))

- **Scoring truth**: `backend/src/utils/cohorts.js` + `overallIndicator.js`. Both unit-tested. Touch with care.
- **Which indicators are shown**: `SHOWN_RISK_KEYS` in `utils/cohorts.js` (backend) and `INDICATORS` / `RADAR_AXES` in `frontend/src/lib/screeningAlerts.ts` (frontend). These two must agree; LDH is excluded in both.
- **All PDF drawing**: `backend/src/utils/pdfDraw.js` (the routes only compose pages). Smoke-tested headlessly by `backend/tests/pdfDraw.test.js`.
- **Body map geometry**: `frontend/src/components/dashboard/bodymap-data/` — MIT-licensed asset + `muscles.ts`, the HoloMotion-vocabulary partition, verified by `muscles.test.ts`.
- **ISN integration seam**: `backend/src/mock/isnDirectory.js`.

---

## The documents you need (in priority order)

### 🔴 MUST READ FIRST — in this exact order

1. **[MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md)** — architectural truth, locked decisions. **This file wins when other docs disagree.**
2. **[MODULES_STATUS.md](MODULES_STATUS.md)** — current build state of all 6 modules, including what was removed and why
3. **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)** — file-level map: models, routes, utils, pages, components, lib
4. **[USER_MANUAL.md](USER_MANUAL.md)** — how shipped features behave from a user's perspective. **This tells you what behaviours must be preserved end-to-end**

### 🟡 READ WHEN YOU NEED CONTEXT

5. **[DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)** — why each call was made. §4 + §4a (body map + the muscle-level partition), §13 (canvas alias), §18 (on-device name redaction). **Read before suggesting "improvements" already considered and rejected**
6. **[fyp/HOLOMOTION_SCOPE_2026-08.md](fyp/HOLOMOTION_SCOPE_2026-08.md)** — the directive that shaped the current scope: HoloMotion PDF is the sole data source
7. **[fyp/ROADMAP_2026-08-03.md](fyp/ROADMAP_2026-08-03.md)** — the live worklist (A–F). **Tick boxes as work lands**; it survives context resets
8. **[fyp/FYP2_MODULES_USECASES.md](fyp/FYP2_MODULES_USECASES.md)** — the six modules + use cases, Appendix A/B holds the old→new module renumbering
9. **[ATHLETE_ASSESSMENT_FIELDS.md](ATHLETE_ASSESSMENT_FIELDS.md)** — what every screening field means (Myodynamia, Overall Activity Score, …)
10. **[FYP_RUBRICS.md](FYP_RUBRICS.md)** — rubric weighting + the pre-viva punch list
11. **[fyp/ACWR_REBUILD.md](fyp/ACWR_REBUILD.md)** — how to wire `risk.ts` back up if a training-load input ever returns. Do not act on it unasked

### 🟢 PRIMARY SOURCES (read to verify something)

12. **[docs/stakeholder/meeting-2026-04-24-dr-thung.txt](stakeholder/meeting-2026-04-24-dr-thung.txt)** — what Dr Thung actually asked for
13. **[reports/FYP-I-Report.pdf](../reports/FYP-I-Report.pdf)** — JC's own writing; reference for tone if helping draft FYP II content

---

## How to approach this work

### Golden rule #1 — Read before you code

Re-read at least `MASTER_CLARIFICATIONS.md` and `MODULES_STATUS.md` at the start of a session or a change of direction. Locked decisions and current state move.

### Golden rule #2 — Don't break what's shipped

Module 1 (Athlete Dashboard & Overall Risk Indicator) is the FYP showcase and is audit-fixed. Touch `BodyMap.tsx`, `RiskRadar.tsx`, `OverallRiskBadge.tsx`, `ScreeningPanel.tsx` or the dashboard pages with the smallest possible surface. `WorkloadChart.tsx` renders on no page since 2026-07-16 — it's retained for the ACWR rebuild path, not dead code to delete.

### Golden rule #3 — Ask before destructive actions

JC has not authorized you to: reset databases, force-push, delete unfamiliar files (they may be his in-progress work), push to the submission repo, or change stakeholder-affecting decisions without asking. When in doubt, one short clarifying question.

### Golden rule #4 — Respect the FYP framing

AIRMS is a graded academic artifact, not a product. Every proposal needs a *"why this and not X?"* one-liner. The **cohort-normed overall indicator** is the current FYP differentiator; the **composite risk model** in `risk.ts` remains a locked, citable formula even with no live callers.

### Golden rule #5 — One source of truth per decision

The recurring bug class in this codebase is the same fact written in two places drifting apart. Examples already consolidated: which indicators are shown (`RADAR_AXES` / `SHOWN_RISK_KEYS`), how a report is drawn (`pdfDraw.js`), which athletes count toward a norm (`isEligibleForNorms`), how a cohort key is built (`cohortKeyOf`). **When you find yourself copying a list or a threshold, export it instead.**

---

## How to build the next thing (continuation guide)

### Adding a new screening-derived signal

1. Confirm HoloMotion actually reports it — if it isn't on the PDF, it isn't in scope.
2. Extract it in `utils/holomotionExtract.js` (prompt + mapping) and add the column/JSON field to `models/Screening.js` **and** `models/Athlete.js` if it's part of the latest-state row.
3. Decide whether it's a **scoring** input. If yes it belongs in `orientedComponents()` in `utils/cohorts.js` — and it must be oriented higher-is-better. Add a test to `backend/tests/cohorts.test.js`.
4. Surface it through `utils/serialize.js` so the frontend's nested shape carries it.
5. Display it in `ScreeningPanel.tsx` (the shared surface — all three dashboards inherit it at once).

### Adding a page

1. `frontend/src/app/<role>/<slug>/page.tsx`, wrapped in `<DashboardLayout allowedRoles={[...]}>`. The URL hierarchy *is* the role boundary.
2. Add the nav entry to `components/layout/Sidebar.tsx`'s per-role NAV map.
3. Back it with an Express route that carries **both** `auth` and `rbac(...)` — client-side gating is UX, backend RBAC is the security.
4. If it's a medical capability, gate it with `requirePermission('<key>')` and mirror the key in `frontend/src/lib/auth.ts`.

### Changing anything in a PDF report

Edit `backend/src/utils/pdfDraw.js`, not the route. Run `cd backend; npx jest pdfDraw` — it renders all three reports against a fake `res` with no DB.

### Changing the body map

`bodymap-data/muscles.ts` partitions the licensed geometry by **measured geometry, never array index** (the asset does not order left/right sub-paths identically). Run `cd frontend; npx jest muscles` — the test asserts the anatomical relationships that catch a mirror-swap.

### Before you say you're done

```powershell
cd backend;  npx jest                       # 5 suites
cd frontend; npx jest                       # 2 suites
cd frontend; npx tsc --noEmit -p tsconfig.json
cd frontend; npm run lint
```

There are **no route, page or end-to-end tests**. Anything touching routes, pages or the import flow is verified by hand: `npm run dev`, log in, click the flow.

---

## When the user sends a short message

| User says | Probably means |
|---|---|
| "Sure" | OK, proceed |
| "Do it for me" | Execute the plan we just discussed |
| "Run it" | Start the dev server / run the seed / whatever's immediately next |
| "Why?" | Explain the reasoning briefly, not exhaustively |
| "Erm…" / "Well, …" | Soft pushback — he sees a problem you don't. Listen, don't argue |
| "Change it" | Make the change he just described, don't propose alternatives |

---

## Common pitfalls (mistakes prior sessions have made)

1. **Proposing features beyond the FDD** — 6 modules, that's the ceiling.
2. **Over-engineering** — "I do not want to get ahead of myself." Build the simpler version first.
3. **Hand-drawing SVGs to compete with polished assets** — the system targets international-level athletes and must look professional. See [DESIGN_DECISIONS.md §4](DESIGN_DECISIONS.md).
4. **Confusing memory entries with code state** — memory persists across sessions; the codebase moves on. **Verify by reading the file before acting.**
5. **Documenting code patterns as memory** — code patterns belong in this docs folder. Memory is for user/preference/project-context facts.
6. **Reviving cut features** — injury logging, self-reports, ACWR heroes, posture evaluation and Excel import are all *deliberately* gone. Their docs sections are kept as a record, not as a spec to rebuild from.
7. **Renumbering the modules** — the FDD and Table 4.1 still describe the pre-cut Module 2. That rewrite is **JC's open item**. Do not renumber or rename modules unilaterally.

---

## Quick start

```powershell
cd "c:\Users\posei\OneDrive\Documents\VSCode Projects Folder\AIRMS (JC FYP)"
npm run install:all
npm run seed      # drops + reseeds MySQL, deterministic PRNG (seed=42); prints each demo athlete's IC
npm run dev       # backend :5000 + frontend :3000
```

Demo login: `athlete@isn.gov.my` / `airms2026` (John Doe). The athlete key is the **IC number** since 2026-08-04 — `npm run seed` prints them. Full credentials in [CLAUDE.md](../CLAUDE.md) §Demo credentials.

---

*Last updated: 2026-08-18 — role table corrected to **five** roles (`executive`, added 2026-08-08, was missing entirely) and the admin row extended with programme activity, the Activity Log and norm pinning. Previous: 2026-08-06 — rewritten around an explicit Mission / Vision / Non-goals statement after the HoloMotion-only cut (2026-08-02) and the 2026-08 roadmap batch made the previous framing (injury logging, sRPE, aggregated body regions, 3 roles) inaccurate. Added the end-to-end data path, the continuation guide, and Golden rule #5 (one source of truth per decision).*
