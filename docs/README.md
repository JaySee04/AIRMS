# AIRMS documentation — index

Thirty-odd documents live here. This page says what each one is, **whether it is
current or historical**, and which you may edit freely.

If you are new: read [`MASTER_CLARIFICATIONS.md`](MASTER_CLARIFICATIONS.md)
first. It is the architectural truth, and **it wins when any other document
disagrees with it.**

---

## The three kinds of document, and why it matters

This distinction is not filing — it decides what you are allowed to do to a
file, and it is enforced by a test (`backend/tests/codebaseHygiene.test.js`).

| Kind | Rule |
|---|---|
| **Reference** | Describes the system *as it is now*. Every number in it must be current — a stale one misleads. **Update these freely.** |
| **Log** | Records what was true on a date. **Do not rewrite the numbers**; a record that changes is not a record. Add a new dated entry instead. |
| **Generated** | Produced from the code by a script. **Never hand-edit** — regenerate, or both test suites fail. |

Why the rule exists. A dated verification block recording that the access audit
ran clean back when the system had sixty-eight of them was true when it was
written — editing that figure down to today's would falsify the record. But a
reference page stating how many are left unthrottled, using a figure from two
removals ago, is simply wrong, and somebody will believe it. Same kind of
number, opposite handling.

(Those two examples are spelled out in words on purpose: the guard scans for
digits next to the word *endpoints*, and a document explaining the rule should
not trip it.)

---

## Start here

| Document | Kind | What it is |
|---|---|---|
| [`MASTER_CLARIFICATIONS.md`](MASTER_CLARIFICATIONS.md) | Reference | **The architectural truth.** Locked decisions. Wins over every other document, including this one. |
| [`README_FOR_CLAUDE_CODE.md`](README_FOR_CLAUDE_CODE.md) | Reference | Entry point for a Claude Code session: reading order, communication norms, mission and the deliberately-cut features that must not be revived. |
| [`MODULES_STATUS.md`](MODULES_STATUS.md) | Reference | What is shipped vs deferred, per module. Includes the removed FYP I modules, kept as a record rather than a spec. |

## Current reference — keep these accurate

| Document | Kind | What it is |
|---|---|---|
| [`PROJECT_GUIDE.md`](PROJECT_GUIDE.md) | Reference | **File-level map**: every model, route, page, component and lib module, with what each is for. The fastest way to find where something lives. |
| [`SYSTEM_MAP.md`](SYSTEM_MAP.md) | **Generated** | Every attribute of the system, read from the code: 9 models with all columns and enum values, 66 endpoints with their RBAC lists, 25 pages, every setting, audited action, shared fact, env var and script. Regenerate with `cd backend; npm run map`. |
| [`PERMISSIONS.md`](PERMISSIONS.md) | Reference | **Who can actually do what — measured** by calling every endpoint as every role, not described from intent. Read before touching RBAC or answering a viva question about access. |
| [`SECURITY.md`](SECURITY.md) | Reference | The security posture, **measured**: nine checks, each with the command that produced the answer. Re-run the commands before quoting a number. |
| [`DEPLOY.md`](DEPLOY.md) | Reference | Deployment, and the platform faults that all present as the same opaque error. Read before deploying. |
| [`USER_MANUAL.md`](USER_MANUAL.md) | Reference | Every shipped feature from the end user's point of view — *what* it does, not how. |
| [`SYSTEM_GUIDE.md`](SYSTEM_GUIDE.md) | Reference | The stakeholder-facing guide, written for people trying the system. Renders to `AIRMS-System-Guide.pdf` via `cd backend; npm run guide:pdf`, which renders **and verifies** in one command. |
| [`ATHLETE_ASSESSMENT_FIELDS.md`](ATHLETE_ASSESSMENT_FIELDS.md) | Reference | Domain glossary: every column, score and label in an athlete assessment, for someone reading the data for the first time. |

## Decision and defect records — append, don't rewrite

| Document | Kind | What it is |
|---|---|---|
| [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) | **Log** | Numbered sections, ~109 of them. **Read before proposing an "improvement"** — it may already have been considered and rejected, with the reasoning and the measurement. The single most useful document for a handover. |
| [`SILENT_FAILURES.md`](SILENT_FAILURES.md) | **Log** | **The defect class this project keeps producing** — a wrong answer that looks like a right one — with its sub-patterns, the sweeps that find each, and the standing guards. Read before an audit or a bug hunt; add to it when you find a new instance. |

## Academic and FYP artefacts — [`fyp/`](fyp/)

| Document | What it is |
|---|---|
| [`fyp/VIVA_FYP2.md`](fyp/VIVA_FYP2.md) | **The FYP II viva dossier**: the thesis, fifteen hard questions with citations, weaknesses to volunteer, demo landmines, and headline numbers measured against the live database. Re-measure §2 before quoting it. |
| [`fyp/REPORT_TABLE_4-1.md`](fyp/REPORT_TABLE_4-1.md) | UC-1–47, the authority for report Chapter 4. |
| [`fyp/FYP2_MODULES_USECASES.md`](fyp/FYP2_MODULES_USECASES.md) | The six-module decomposition and its use cases; Appendix A/B maps old module numbers to new. |
| [`fyp/REFERENCES.md`](fyp/REFERENCES.md) | Academic citations. The body-map MIT attribution belongs here and is **locked**. |
| [`fyp/ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md) | The dormant composite-risk model's history and its rebuild spec. Why `risk.ts`, `AcwrGauge` and `WorkloadChart` are retained with no callers. |
| [`fyp/JC_CHECKLIST.md`](fyp/JC_CHECKLIST.md) · [`fyp/ROADMAP_2026-08-03.md`](fyp/ROADMAP_2026-08-03.md) | Working checklists. |
| [`fyp/DELETION_REVIEW.md`](fyp/DELETION_REVIEW.md) | What was considered for deletion and what was kept, with reasons. **Check here before deleting anything** that looks unused. |
| [`fyp/VIVA_SCRIPT.md`](fyp/VIVA_SCRIPT.md) · [`fyp/VIVA_ANSWERS.md`](fyp/VIVA_ANSWERS.md) | **Frozen FYP I artefacts.** Superseded by `VIVA_FYP2.md`. |
| `fyp/*.html` | Slide and diagram assets (ERD, FDD, use-case and panel slides). |

Also in `fyp/`: `FYP2_REDESIGN_SPEC.md`, `FYP2_RESEARCH_AND_MODULES.md`,
`FYP2_SIX_MODULES.md`, `HOLOMOTION_SCOPE_2026-08.md`, `REPORT_EDIT_PACK.md`,
`PROGRESS_PACK_2026-07.md`, `CHANGES_SINCE_2026-06-10.md` — scope directives and
progress snapshots, each dated.

## Stakeholder — [`stakeholder/`](stakeholder/)

| Document | What it is |
|---|---|
| [`stakeholder/REQUIREMENTS_TRACEABILITY.md`](stakeholder/REQUIREMENTS_TRACEABILITY.md) | Stakeholder requirement → where it is implemented. |
| `stakeholder/meeting-2026-04-24-dr-thung.txt` | Meeting transcript. |

## Historical — describes things that no longer exist

**These are kept deliberately.** They are cross-referenced by the documents
above as "why we did X", and two of them were explicitly reviewed for deletion
and retained (`fyp/DELETION_REVIEW.md`). Do not act on their instructions.

| Document | Why it is still here |
|---|---|
| [`MONGO_RECOVERY.md`](MONGO_RECOVERY.md) | The original MongoDB stack and an emergency restoration path. AIRMS has been MySQL-only since 2026-06-05. |
| [`MYSQL_MIGRATION_PLAN.md`](MYSQL_MIGRATION_PLAN.md) | The migration design — marked `Status: EXECUTED`. Still the best explanation of *why the SQL schema looks the way it does*. |
| [`STORAGE_MECHANISMS.md`](STORAGE_MECHANISMS.md) | Both mechanisms it documents were removed with Activity Tracking on 2026-07-20. Carries its own banner saying so. |
| [`SYSTEM_ALGEBRA.md`](SYSTEM_ALGEBRA.md) | Most of its sections describe sRPE load, removed the same day. Carries the same banner. |
| [`FYP_RUBRICS.md`](FYP_RUBRICS.md) | Rubric weighting and the pre-viva punch list, from PDFs shared 2026-05-24. |

---

## Before you quote a number

Numbers in prose decay. Three commands produce them from the live system:

```powershell
cd backend; npm run measure:facts   # roster, band split, cohort sizes, norms in force
cd backend; npm run map             # regenerate SYSTEM_MAP.md from the code
cd backend; npm run audit:access    # the permission matrix, by calling every endpoint
```

`measure:facts` exists because this documentation has carried **four different
band splits**, each true when it was written. Run it before the report or the
viva rather than trusting a sentence.
