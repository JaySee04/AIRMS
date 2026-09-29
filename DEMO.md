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

Measured on the same four reports: **A is 3958 px of page, B is 1762 px — 55%
shorter — and B leaves nothing to fill in.**

## A demo that shows both halves

Drop these four together:

| file | what happens | why |
|---|---|---|
| file | in A | in B |
|---|---|---|
| `backend/scripts/samples/nazwan.pdf` | **needs you** — the filename is just "nazwan" | **ready** — placed from the name printed on the report |
| the three `rpt_2025-07-29_*.pdf` reports | **ready**, as four full cards | **ready**, collapsed to one line each |

So **A offers `Import all ready (3/4)` and B offers `4/4`** — and B has nothing
left for the operator to do at all.

To see B's "needs you" state as well, drop a report for somebody who is on
neither the roster nor the ISN directory, or open any collapsed row with
**Check**.

## The question to put to them

Not "which looks nicer". Ask:

1. On a real session of 40–60 reports, which one tells you **how much work is
   left**?
2. When B collapses a report, it has **cross-checked the match** — see below.
   Is that the right check, and is there another fact it should be using?
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

## Why collapsing a row is safe

Collapsing a matched report looked like a trade — the operator's afternoon
against their chance to check it. It is not one, because "read the card" was
never much of a check either: nobody scanning fifty-four cards reliably notices
that the thirty-seventh says *Male* where the athlete is *Female*.

A Malaysian IC encodes **date of birth and sex** (`YYMMDD-PB-###G`, the final
digit's parity). The HoloMotion cover prints **age and gender**. So the match can
be checked against two independent facts that came out of the report itself,
using an identifier the roster already returns — no new endpoint, no new column,
nothing for the operator to read.

**A row may only collapse once both agree.** Anything contradicted, or anything
that could not be checked, stays open and is counted as work. The collapsed row
says what was compared:

```
READY  Nur Aina Danish  070322080314 · Badminton · PELAPIS · from the ISN
       directory   ✓ sex and age match the IC                      [Check] [✕]
```

### Showing the check catching something

Drop `nazwan.pdf` (its cover reads *age 21 · Male*) and type a female athlete's
IC into the IC field — `070322080314` will do. The card objects:

> **This report may not belong to this athlete.** the report says Male and this
> IC is Female; the report says age 21 and this IC gives 18. Check you have the
> right person before importing — the scores will be filed against whoever is
> selected here.

Nothing in the current build objects to that at all. So B is not trading safety
for speed — it is checking something the old screen never did, and only spending
the operator's attention where the check could not be made.

Age is compared **at the screening date**, not today, so an old report does not
read as a mismatch. One year of slack is allowed, because the cover prints whole
years. If the IC cannot be read, or the report printed no age or gender, the
verdict is **unknown** — and an unknown is never treated as a pass.

## Two ways to find the athlete, because they fail differently

The current build resolves the athlete from the **filename**. That works while
ISN's own export naming survives, and stops the moment anyone renames a file or
saves one out of an email.

Measured over six real reports, under the app's own rule (exact full name,
unique hit):

| source | resolves |
|---|---|
| the filename | 4 of 6 |
| the name printed on the report | 4 of 6 |
| **either** | **5 of 6** |

A tie — but not the same four. `nazwan.pdf` has a useless filename; *MOHAMED
ELFFIE DANISH BIN KHIR JOHARI* truncates on the report because the name wraps
onto a second line. The sixth is the compact layout, which carries no text for
either to read.

So B tries **both**, and the matching is done on the server: the printed name is
used to look up an id and then discarded, so it never reaches the browser and is
never stored. The athlete's name on the record still comes from the roster, as
it always has.

**The visible effect on the demo deck:** A offers `Import all ready (3/4)`;
B offers `4/4`.

> **A note on the build fingerprints.** Up to this point both instances reported
> the same `build` on `/api/health`, which was a neat way to show the extraction
> was identical. B now has a backend change, so they differ. The extraction
> itself is still untouched — what was added is a roster lookup after it.
