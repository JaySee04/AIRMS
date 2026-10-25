# Deploying AIRMS to ISN — JC's working manual

**This file lives in the working repo only.** It is excluded from both syncs, so
it never reaches `AIRMS-ISN` and never reaches `AIRMS-submission`. It is written
for you, from your machine, and it assumes you know the project.

It is **not** the install runbook. That is [`docs/DEPLOY_ISN.md`](docs/DEPLOY_ISN.md),
which is written for whoever sets up the ISN server and ships *with* the code.
This file is the layer above it: which repo, what to run before you push, and
what has actually gone wrong.

---

## 1. Three repositories, and which is which

| | path | audience | remote |
|---|---|---|---|
| **working** | `AIRMS (JC FYP)` | you | `JaySee04/AIRMS` |
| **ISN** | `..\AIRMS-ISN` | the ISN server | `JaySee04/AIRMS-ISN` (**private**) |
| **submission** | `..\AIRMS-submission` | supervisor, examiner | per your submission setup |

**Deploy from `AIRMS-ISN`.** Never from the working repo — it carries the FYP
chapters, the decision log, the real athlete report PDFs under
`backend/scripts/samples/`, and the agent instructions. Never from the
submission repo either; it is the working repo with AI references scrubbed, not
a deployable build.

The ISN remote is owned by the **JaySee04** account, not JaySee11. To give ISN
access: Settings → Collaborators, or transfer the repo to an ISN organisation.

---

## 2. The release loop

Run from the working repo root. All four steps, in order, every time.

```powershell
# 1. make sure what you are about to ship is green HERE
cd backend;  npx jest
cd ..\frontend; npx jest; npm run typecheck
cd ..

# 2. mirror into the ISN repo (idempotent; deletions here propagate there)
.\sync-to-isn.ps1

# 3. PROVE IT THERE, not here  ← the step that earns its place
cd ..\AIRMS-ISN\backend
npx jest

# 4. commit and push — the sync mirrors FILES, it does not commit
cd ..
git add -A
git commit
git push
```

**Step 3 is not ceremony.** Both handover defects found on 2026-10-12 were
invisible in the working repo and only appeared by running the suite inside
`AIRMS-ISN`:

- the ISN copy failed **11 tests across 5 suites** — meta-guards that read
  `DESIGN_DECISIONS.md`, `docs/fyp/` and `CLAUDE.md`, none of which ships there;
- `..\AIRMS-ISN` was not a git repository at all — 406 files, no version control.

A handover whose tests are red on the first run teaches its recipient that red
is normal, and the next failure — a real one — reads the same way.

### What the sync deliberately removes

Worth knowing so a missing file does not read as a bug:

- everything under `docs/` except `DEPLOY_ISN.md`, `USER_MANUAL.md`,
  `HANDOVER.md`, `SECURITY.md`, `SYSTEM_MAP.md`;
- `docs/fyp/`, `reports/`, `report/`, `archive/`, `airms-prototype/`,
  `docs/stakeholder/`, `deploy/out/`;
- `backend/scripts/samples/` — **real athlete reports, under NDA**;
- `CLAUDE.md`, the three sync scripts, this file;
- four backend test files that guard documents the handover does not send
  (`decisionRefs`, `reportTable`, `codebaseHygiene`, `surfaceReach`).

`node_modules` is excluded from the copy but **deliberately not deleted** in the
destination, so a re-sync does not destroy ISN's install.

---

## 3. First deployment to a server

The server side is [`docs/DEPLOY_ISN.md`](docs/DEPLOY_ISN.md) §1–§5b, and it
assumes an empty database and a box that has never run this. Do not paraphrase
it from memory; it is the document that ships.

What you supply that it cannot:

- the **private repo URL**, and a deploy key or collaborator access for it;
- `deploy/` holds the systemd units (`airms-api`, `airms-web`, `airms-mail`
  + timer, `airms-backup` + timer), `nginx-airms.conf` and `airms-db-user.sql`.
  **These are written and reviewed but have never been run on a real ISN box.**
  Budget time for that being the part that bites.

---

## 4. The gate before real athlete data

**Run these on the server, in this order, before a single real athlete exists.**

```bash
cd backend
npm run verify:install   # the configuration
npm run verify:data      # is the database free of FABRICATED data?
npm run verify:schema    # does the database match the models?
npm run audit:access     # all 67 endpoints as every role   (needs the app up)
cd ../frontend && npm run e2e
```

`verify:data` is the one specific to real athletes, and it exists because
**nothing else can see a fabricated patient** — `verify:install` reads
configuration, `verify:schema` reads the schema, `verify:claims` reads
behaviour. An install can be green on all three while serving invented athletes
beside the real ones.

It blocks on six things, and treats **any** fabricated artefact as a blocker.
There is no safe amount of fake patient data in a clinical system, and "we know
which ones are fake" is exactly the knowledge that does not survive a handover.

Two of the six are worth knowing by name:

- **the norms in force.** A cohort norm is the ruler every band is measured
  against, so norms computed over fabricated athletes score a real athlete
  against invented peers — and the verdict looks exactly like a real one.
- **the published password, wherever it appears.** Not the same check as "are
  there demo accounts": somebody copies `airms2026` out of the docs while
  setting up, and that account passes every other check.

### Three things that must be true on an ISN box

| | |
|---|---|
| `NODE_ENV=production` | arms the seeder's refusal **and** the directory default below |
| `AIRMS_ISN_DIRECTORY` | leave **unset**, or `none`, or a path to an ISN export |
| `npm run seed` | **never run it there.** It drops the database |

On `AIRMS_ISN_DIRECTORY`: the records built into the source are **fabricated** —
nine invented or demo people with invented IC numbers — and roster entry fills
name, IC, date of birth, sport and programme straight from a hit. Unset with
`NODE_ENV=production` the directory is empty, which is the safe state. Empty is
not broken: the operator types the athlete's details, exactly as they already do
for anyone the directory does not know.

If ISN produce a real export, it is a JSON array of records and one environment
variable. A malformed file refuses at boot rather than loading half of itself.

---

## 5. Updating a live install

After the release loop has pushed to `AIRMS-ISN`, on the server:

```bash
sudo airms-update              # fetch, install, test, build, check schema, swap, verify
sudo airms-update --rollback   # put the previous version back
```

It prepares the new version in `/opt/airms-next` while the live site keeps
serving, swaps directories only once every step passed, and reverses the swap
by itself if the restarted site is not healthy or is not the code just built.
**Do not update in place** (`git pull` + `npm run build` inside `/opt/airms`):
the build rewrites `.next` underneath the running site, and a failed build
leaves it broken. See the header of `deploy/airms-update.sh`.

**Migrations are expand-then-deploy.** Apply the migration *before* the code
that selects the new columns, or every query answers
`Unknown column '...'`. `verify:schema` §4 asks `information_schema`, which is
the only thing that proves a migration landed — an endpoint answering 200 does
not, and believing otherwise broke the hosted API for six days.

**`npm run migrate:norm-stamp` is still unapplied on the hosted demo**, and will
need applying on any new install that carries forward data. A fresh ISN database
built from the models already has those columns.

---

## 6. Traps that have actually bitten

- **A 200 does not prove a migration landed.** Ask `information_schema`.
- **Reasoning about a deployed build from the working tree.** This has been
  wrong twice in the same direction. `node scripts/assert-fresh.js --url ...`
  answers "is the running server the code I am reading".
- **Green CI does not gate the deploy.** Vercel builds on push without waiting
  for GitHub Actions. Irrelevant to a self-hosted ISN box, but do not carry the
  habit over.
- **`sync-to-isn.ps1` mirrors the working TREE, not the index.** Gitignored
  files arrive anyway — that is how `sync-to-isn.ps1` itself was being shipped
  to the examiner by the submission sync.
- **Never run `npm run mutate` and `npx jest` at once.** `mutate` edits source
  in place; a concurrent jest reads a file mid-mutation and fails on a defect
  that does not exist.

---

## 7. Still ISN's to decide

Named here so they are not discovered on the day. All four are in
`docs/DEPLOY_ISN.md` under *Known gaps*.

1. **TLS certificates and hostnames.** AIRMS speaks plain HTTP and has no
   certificate handling; without a proxy terminating TLS, IC numbers and
   clinical notes travel in clear.
2. **An SMTP relay.** Until ISN provide one, invitations send from a personal
   Gmail — which to a clinician reads as phishing. It is configuration, not
   code: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` move together.
3. **The least-privilege database grant.** `deploy/airms-db-user.sql` has it
   written out; the app currently connects as `root`.
4. **Backup policy.** The mechanism ships (nightly dump, verified, rotated).
   Where copies live, retention, and whether an off-box copy is required are
   ISN's. An on-box backup alone does not survive the event most backups exist
   for.

And one that is yours: **whether an athlete's record can be erased**.
`DELETE /api/athletes/:id` **deactivates** — it sets `isActive: false` and the
name, IC, screenings and clinical notes all remain. That may well be correct for
clinical records, but it is a retention decision somebody should make on
purpose rather than discover.
