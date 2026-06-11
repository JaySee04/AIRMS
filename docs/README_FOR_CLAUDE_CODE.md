# README for Claude Code — AIRMS Project Context

> **You are Claude Code. You are helping the user (JC) build AIRMS — the Athlete Injury Risk Management System — as his Final Year Project for Institut Sukan Negara (ISN) Malaysia.**
>
> This file is your map. Read this first. It tells you which other documents to read, in what order, and why.
>
> **Note:** A shorter root-level [`CLAUDE.md`](../CLAUDE.md) is auto-loaded into every session and summarises the commands, big-picture architecture, and locked decisions. This file is the *long-form* version with stakeholder context, reading order, and communication norms — read it when starting a new project or after a context reset.

---

## Who the user is

- **JC** — final-year computer science student, doing his FYP with ISN as the stakeholder
- **Stack he knows**: Next.js, Node.js, MySQL (Sequelize). Originally built AIRMS on MongoDB; migrated to MySQL once ISN's production target was confirmed. Not deep in DevOps, infra, or library evaluation — he relies on you to make those judgment calls and explain them
- **Communication style**: Direct, sometimes terse. Will tell you when something doesn't match his vision (Figma designs, body map quality, etc.) — listen and iterate
- **Has Memory entries about him**: see `~/.claude/projects/.../memory/MEMORY.md` for persistent context across sessions

## Who the stakeholders are

- **Dr Thung** — ISN sports scientist, primary stakeholder. His requirements drive what AIRMS must do. Transcript of meeting with him: [docs/stakeholder/meeting-2026-04-24-dr-thung.txt](stakeholder/meeting-2026-04-24-dr-thung.txt)
- **Dr Hoo Wai Lam** — JC's FYP supervisor. He drives the *academic* requirements (rubric, modules, deliverables). Same transcript covers his asks
- **ISN as institution** — Malaysia's national sports institute. Sample data from them: [docs/data-samples/isn-csv-template.xlsx](data-samples/isn-csv-template.xlsx) — this is the canonical schema for Module 4 (Data Management)

## What AIRMS is

AIRMS = Athlete Injury Risk Management System. A web app where:
- **Athletes** log their training activities and view their personal injury risk
- **Medical staff** review athletes, log injuries, see team-wide patterns
- **Admins** see analytics, manage data uploads

Built on top of a previous prototype (`airms-prototype/`) inherited from prior students Shewin and Keying. JC is continuing the project.

---

## The documents you need (in priority order)

### 🔴 MUST READ FIRST — in this exact order

1. **[MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md)** — architectural truth, locked decisions
   - Tech stack, the 3 roles, the composite risk model, the body map license/aggregation policy
   - UI design rules from JC's Figma
   - **Things that must NOT change without discussion**

2. **[MODULES_STATUS.md](MODULES_STATUS.md)** — current build state
   - 6 modules from JC's FDD
   - What's shipped (Modules 1 + 2), what's pending (Modules 3–6)
   - Specs for the unbuilt modules

3. **[USER_MANUAL.md](USER_MANUAL.md)** — how shipped features work from a user's perspective
   - Login, Activity Tracking, Athlete Dashboard
   - **This tells you what behaviors must be preserved end-to-end**

4. **[PROJECT_GUIDE.md](PROJECT_GUIDE.md)** — technical reference
   - File structure, routes, models, components
   - Where things live, how to run the system

### 🟡 READ WHEN YOU NEED CONTEXT

5. **[DESIGN_DECISIONS.md](DESIGN_DECISIONS.md)** — why we made each architectural call
   - Why sRPE for load calculation (validated by Inoue 2022 + Yang 2024)
   - Why we built a composite risk model instead of plain Gabbett ACWR
   - Why we use the MIT-licensed react-muscle-highlighter asset
   - Why aggregated body regions instead of per-spreadsheet-muscle granularity
   - **Read this before you suggest "improvements" that have already been considered and rejected**

6. **[ATHLETE_ASSESSMENT_FIELDS.md](ATHLETE_ASSESSMENT_FIELDS.md)** — every field in the ISN spreadsheet explained
   - What "Myodynamia" means, what "Overall Activity Score" is, etc.
   - Reference when working with athlete data

### 🟢 PRIMARY SOURCES (read when you need to verify something)

7. **[docs/stakeholder/meeting-2026-04-24-dr-thung.txt](stakeholder/meeting-2026-04-24-dr-thung.txt)** — full transcript of stakeholder meeting
   - What Dr Thung actually wants from AIRMS
   - What Dr Hoo says the FYP must contain

8. **[docs/data-samples/isn-csv-template.xlsx](data-samples/isn-csv-template.xlsx)** — canonical ISN data schema
   - One athlete (John Doe) sample row
   - The full structure that Module 4 will need to import

9. **[reports/FYP-I-Report.pdf](../reports/FYP-I-Report.pdf)** — JC's FYP I report (his own writing)
   - Background, problem statement, methodology framing
   - **Use as reference for tone if you ever help him draft FYP II content**

---

## How to approach this work

### Golden rule #1 — Read before you code

Every time you start a new session or change major direction, re-read at least `MASTER_CLARIFICATIONS.md` and `MODULES_STATUS.md`. The locked decisions and current state may have changed.

### Golden rule #2 — Don't break what's shipped

Modules 1 and 2 work. If you're about to change something in `frontend/src/app/athlete/activity/`, `frontend/src/app/athlete/dashboard/`, or any of their components (`BodyMap.tsx`, `WorkloadChart.tsx`, `RiskRadar.tsx`, `risk.ts`), think twice. Touch the smallest surface that solves the problem.

### Golden rule #3 — Ask before destructive actions

JC has not authorized you to:
- Reset databases
- Force-push to git
- Delete unfamiliar files (they may be his in-progress work)
- Change stakeholder-affecting decisions (sRPE method, composite risk formula) without asking

When in doubt, ask one short clarifying question.

### Golden rule #4 — Respect the FYP framing

AIRMS is not a product. It is a graded academic artifact. Every architectural decision needs to be **defensible in viva voce**. When you propose something, also have a one-liner ready for "why this and not X?" — JC will need to say it to Dr Hoo.

Specifically: the **composite risk model** (personalised ACWR + screening-data integration) is the FYP differentiator. It is what makes AIRMS more than "a textbook ACWR calculator." Do not weaken or remove it.

### Golden rule #5 — Self-reported intensity is a feature, not a bug

Athletes log their own RPE intensity. This is deliberate — see [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) §1. If you ever feel tempted to suggest "but isn't this gameable?" — the answer is in that file. The method is validated by Inoue et al. (2022) and Yang et al. (2024).

---

## When the user sends a short message

JC sometimes writes ambiguously short messages. Interpret charitably:

| User says | Probably means |
|---|---|
| "Sure" | OK, proceed |
| "Do it for me" | Execute the plan we just discussed |
| "Run it" | Start the dev server / run the seeded migration / whatever's immediately next |
| "Why?" | Explain the reasoning briefly, not exhaustively |
| "Erm…" / "Well, …" | Soft pushback — listen, this is probably a problem he sees that you don't |
| "Change it" | Make the change he just described, don't propose alternatives |

When genuinely unsure, ask one short clarifying question rather than guessing.

---

## Common pitfalls (mistakes prior sessions have made)

1. **Suggesting features beyond FDD scope** — JC has 6 specific modules. Don't propose adding "team chat" or "calendar integration." Stay in scope.

2. **Over-engineering** — JC said early "I do not want to get ahead of myself." When in doubt, build the simpler version first.

3. **Hand-drawing SVGs to compete with polished libraries** — JC explicitly said the system targets international-level athletes and must look professional. Don't burn hours drawing primitives when an MIT-licensed asset is one fetch away. See [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) §4.

4. **Confusing memory entries with code state** — JC's auto-memory persists across sessions. The codebase may have moved on. **Always verify memory claims by reading the actual file before acting on them.**

5. **Documenting code patterns as memory** — code patterns belong in this docs folder, not in `~/.claude/.../memory/`. Memory is for user/preference/project-context facts, not "where is this function."

---

## Quick start (after reading the docs above)

```powershell
cd "c:\Users\posei\OneDrive\Documents\VSCode Projects Folder\AIRMS (JC FYP)"
npm install       # only first time; installs concurrently at root
npm run dev       # runs backend (:5000) + frontend (:3000) together
```

Demo login: `athlete@isn.gov.my` / `athlete123` (athlete; seeded as ATH0001 — John Doe)
Full credentials in [CLAUDE.md](../CLAUDE.md) §Demo credentials or [MASTER_CLARIFICATIONS.md](MASTER_CLARIFICATIONS.md) §3.

---

*Last updated: 2026-06-11 — fixed demo credentials, removed stale Foster citation references, added intentional snapshot denormalisation note to DESIGN_DECISIONS.md §5.*
