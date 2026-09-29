# The upload A/B — how to run it, and what to watch for

Two versions of AIRMS, side by side on one machine, so a stakeholder can use
both and say which they prefer.

**They share one repository.** This folder is a `git worktree` of the main
checkout on branch `demo/upload-b`. There is no fork: one git history, one set
of tests, and the winner merges back with an ordinary branch merge. That is
deliberate — `scripts/dev-isn.js` records why a second copy of this codebase is
a thing to avoid.

| | folder | web | api | what it is |
|---|---|---|---|---|
| **A** | `AIRMS (JC FYP)` | `localhost:3000` | `:5000` | the current build |
| **B** | `AIRMS-upload-b` | `localhost:3100` | `:5100` | the same thing, one screen changed |

## Running both

Two terminals:

```powershell
# A — the current build
cd "…\AIRMS (JC FYP)"
npm run dev

# B — the variant
cd "…\AIRMS-upload-b"
npm run dev:alt
```

Then open **http://localhost:3000/medical/data-upload** and
**http://localhost:3100/medical/data-upload**, sign in as
`medical@isn.gov.my` / `airms2026` on each.

`npm run dev:alt` moves the three values that have to move together — the API
port, the CORS allow-list and `NEXT_PUBLIC_API_URL` — so B's browser talks to
B's API and nothing crosses over.

**Both instances share one database.** That is intentional: the comparison is
about the screen, not the data. It also means an import done in B is visible in
A, so import in only one of them during a session unless you want to talk about
that.

## What is actually different

**Only the queue on the upload page.** The backend is untouched — both report the
same `build` fingerprint on `/api/health`, so anything a stakeholder notices is
the interface and not the extraction. The PDF is read identically in both: same
text-layer reader, same values, same number of tokens.

- **A** renders every report as a full editing card, in the order they were
  dropped.
- **B** puts the reports that need a human FIRST and expanded, collapses the
  ones that resolved by themselves to one line each, and heads the queue with
  *"N ready · M need you"*.

Measured on the same four reports, same backend: **A is 3958 px of page, B is
1776 px — 55% shorter.**

## A demo that shows both halves

Drop these four together:

| file | what happens | why |
|---|---|---|
| `backend/scripts/samples/nazwan.pdf` | **needs you** | the file is named `nazwan.pdf`, and "nazwan" matches nothing |
| the three `rpt_2025-07-29_*.pdf` reports | **ready**, collapsed | they resolve from the ISN directory, so name, IC, sport and programme all fill themselves |

That gives **3 ready · 1 need you** — both states on one screen.

It also demonstrates the weakness worth discussing: `nazwan.pdf` fails only
because the athlete is currently resolved from the FILENAME. He is on the
roster, and the report itself carries his full name — AIRMS reads it and
currently uses it for nothing. Resolving from the report instead is proposal 1
in the DESIGN_DECISIONS discussion and would turn that row green too.

## The question to put to them

Not "which looks nicer". Ask:

1. On a real session of 40–60 reports, which one tells you **how much work is
   left**?
2. Is collapsing a matched report **reassuring or worrying**? B assumes you do
   not want to read 54 identical cards; a clinician may reasonably want to see
   every one before it enters the record.
3. Does the **upload step itself** matter to you at all — or would you rather
   AIRMS picked the reports up from a folder and only showed you the
   exceptions?

Question 3 is the one worth the most. B makes the exceptions cheap; if the
answer is "I never want to see the other 54", that points somewhere further
than this screen.

## Finishing up

Keep it:

```powershell
cd "…\AIRMS (JC FYP)"
git merge demo/upload-b
```

Drop it:

```powershell
git worktree remove ../AIRMS-upload-b
git branch -D demo/upload-b
```

Neither touches the main branch until you run it.
