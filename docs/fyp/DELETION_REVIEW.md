# Deletion Review — What's Useful, What Isn't

> **Status:** prepared 2026-07-17 for JC's inspection. **Nothing has been
> deleted.** Every item below was found by systematic sweep (import/reference
> counts for every component, lib, util, middleware and model; every backend
> endpoint traced to its frontend callers; every npm dependency traced to a
> require/import; CSS classes and image assets spot-traced) — not by guessing.
> Tick what you want gone and say the word; §D has the execution plan.

---

## A. Deletion candidates (dead by evidence — your call)

### A1. Orphaned backend endpoints (zero frontend callers)

| Endpoint | Evidence | Note |
|---|---|---|
| `GET /api/coach/me` ([coach.js](../../backend/src/routes/coach.js)) | No caller — the coach page reads its sports list from the `/coach/readiness` response | Safe to delete |
| `GET /api/screenings/athlete/:id` ([screenings.js](../../backend/src/routes/screenings.js)) | No caller — screening history only surfaces in the individual PDF, which queries the DB directly | Safe to delete **unless** you want an on-screen history/trend view later (FYP2 research doc floats one); then keep as its API |
| `GET /api/activities/athlete/:id/acwr` ([activities.js](../../backend/src/routes/activities.js)) | No caller — both dashboards compute ACWR client-side for the recovery baseline | ⚠ Part of the **ACWR retention set** (§B1). Deleting narrows the rebuild insurance; decide it as a package, not in isolation |

### A2. Unused npm dependencies

| Package | Where | Evidence |
|---|---|---|
| `react-chartjs-2` | frontend | 0 imports — all charts drive `chart.js` directly on canvas refs |
| `sequelize-cli` | backend | No migrations folder, no `.sequelizerc`, no npm script uses it (schema comes from `sequelize.sync` in the seeder) |

Removal = `npm uninstall <pkg>` in the right folder; zero code changes.

### A3. Unreferenced image assets

| File | Evidence |
|---|---|
| `assets/logo1.png`, `assets/logo2.png`, `assets/logofull.png` (repo root) | Referenced nowhere — the app serves its own copies from `frontend/public/images/` |
| `frontend/public/images/logo2.png` | Only `logo1.png` and `logofull.png` are referenced in the UI |

If the root `assets/` folder is your design-source stash, keep it and say so —
otherwise it's duplicate weight.

### A4. Orphaned CSS (left behind by the ACWR-hero removal)

In [globals.css](../../frontend/src/styles/globals.css), classes with **zero**
TSX references:

- `.risk-hero-acwr-thresholds` (the old "Personalised band" block)
- `.stat-tile-delta--up` / `.stat-tile-delta--down` (the load-delta arrows)
- the `.risk-hero--under` family (light + dark variants + its `.risk-hero-level`
  colour rules) — the "Detraining Risk" hero tint that no hero can render anymore

⚠ Keep the `--risk-undertrained` CSS **variable** — `ScreeningPanel`'s quality
tiers still use it. Only the `.risk-hero--under` *class* rules are dead.

### A5. Era-leftover files

| File | Why it's a candidate |
|---|---|
| `docs/data-samples/isn-csv-template.xlsx` | The Excel-*import* template; that import was retired 2026-07-12. Either delete or move into `archive/excel-upload/` beside the code it belonged to |
| `docs/MONGO_RECOVERY.md` | Mongo-era incident doc; the system has been MySQL-only for months |
| `docs/MYSQL_MIGRATION_PLAN.md` | The migration it planned is long complete |
| `docs/fyp/FYP2_RESEARCH_AND_MODULES.md` | The "new research directions / new modules" menu — superseded by `FYP2_SIX_MODULES.md` + `FYP2_MODULES_USECASES.md` after you chose to reframe the existing six. Only worth keeping if you want the R1–R4 research clusters as FYP-2-proposal raw material |

*Related observation, not a file:* the working branch is still named
`feat/mysql-migration` — cheap to rename to something honest (e.g. `fyp2`)
whenever convenient.

---

## B. Deliberately retained — do NOT delete without reversing a recorded decision

| Item | Why it stays |
|---|---|
| **B1. The ACWR retention set:** [`lib/risk.ts`](../../frontend/src/lib/risk.ts), [`WorkloadChart.tsx`](../../frontend/src/components/dashboard/WorkloadChart.tsx), [`AcwrGauge.tsx`](../../frontend/src/components/dashboard/AcwrGauge.tsx), the `/acwr` endpoint (A1) | Your "demote, not delete" decision. `risk.ts` **still executes** (recovery-baseline trigger + prevention insight); the two components are unrendered but are the documented rebuild path (`ACWR_REBUILD.md`, CLAUDE.md status note). WorkloadChart/AcwrGauge cost nothing at runtime — they're code-split and never loaded |
| `archive/excel-upload/` | Deliberate archive of the retired import — the audit trail for "why did Excel go away" |
| `airms-prototype/` | Locked in CLAUDE.md: inherited reference, design copy still cherry-picked from it |
| `reports/FYP-I-Report.pdf` | Stale draft, but the rubric punch-list says **replace with the current draft**, not delete |
| `backend/scripts/verify-holomotion-extract.js` | The extraction ground truth (`npm run verify:vision`) |
| `docs/fyp/*.html` figures, `VIVA_*`, `PROGRESS_PACK_*`, `CHANGES_SINCE_*`, `REPORT_EDIT_PACK.md` | Report/viva working assets — history you'll cite, not dead weight |

---

## C. Verified in use — no action (the false suspects)

Things that look deletable but aren't:

- **`mysql2`** — never `require`d directly, but it's Sequelize's dialect driver; the app dies without it.
- **`pdfjs-dist`** — loaded via dynamic `import()` in `pdfRender.js` (a plain grep for `require` misses it).
- **`react-dom`** — no direct imports, required by the Next.js runtime.
- **`canvas`** (→ `@napi-rs/canvas` alias) — what lets pdfjs render on this Windows/Node setup (DESIGN_DECISIONS §13).
- **`xlsx`** — powers the backup *export* (the import died, the export didn't).
- **`seeder.js`** — 0 references from `src/`, but it's `npm run seed`.
- **`scripts/dev.js`** — it *is* `npm run dev`.
- Every frontend component except the B1 pair, every lib module, every backend util/middleware/model, and all four bodymap-data files: reference count ≥ 1, traced.

---

## D. Execution plan (once you tick)

1. **A1** — delete the route handlers (+ the coach `/me` block, the screenings GET, optionally the activities `/acwr` if you also amend `ACWR_REBUILD.md`'s "what still runs" list); re-run the smoke flow.
2. **A2** — `npm uninstall react-chartjs-2` (frontend), `npm uninstall sequelize-cli` (backend); `npm run build` + backend boot to confirm.
3. **A3** — `git rm` the four images (or keep `assets/` if it's your source stash).
4. **A4** — remove the listed CSS blocks; re-shoot the dashboards to confirm nothing shifts.
5. **A5** — `git rm` / `git mv` per file as you decide; each is independent.

Tell me which letters/numbers to execute and I'll do exactly those, with a
verification pass after each.

*Prepared 2026-07-17. Sweep method and raw counts are reproducible — ask if you
want the commands.*
