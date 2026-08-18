# Deletion Review — What's Useful, What Isn't

> **Superseded 2026-07-20.** The central "keep" call this review made — **B1,
> the ACWR retention set** — was reversed three days later: JC asked to fully
> remove Activity Tracking (the FYP I Module 1), and `lib/risk.ts`'s only two
> live consumers (the recovery-baseline trigger, the medical prevention-insight
> card) were removed along with it. `GET /api/activities/.../acwr` (A1) and
> the `Activity`/`RecoveryBaseline` models + routes are now **deleted**, not
> kept. `lib/risk.ts` itself is still kept (locked decision) but has zero
> live callers. `WorkloadChart.tsx`/`AcwrGauge.tsx` status is unchanged by
> this note — see `docs/fyp/ACWR_REBUILD.md` for current detail. The six-module
> set was also restructured the same day to fill the gap this left — "Module 1"
> now refers to Athlete Dashboard & Overall Risk Indicator, not Activity
> Tracking; see `MASTER_CLARIFICATIONS.md §4`. Everything below this banner is
> left as the historical record of what was decided and executed on
> 2026-07-17; don't treat the B1 row as still accurate.

> **Status:** prepared 2026-07-17; **executed 2026-07-17** on JC's "make the
> decisions for me". The safe, zero-regret-risk removals were done and verified
> (frontend `tsc` + `next build` clean, backend routes load); the items with any
> foreclosure or workflow risk were **kept**, with reasons. Original sweep method:
> import/reference counts for every component/lib/util/middleware/model, every
> endpoint traced to its callers, every dependency traced to a require/import.
>
> **What changed vs the original review:** two items I'd listed as candidates
> turned out to carry cost on closer inspection and were **kept** — see the
> ⟲ marks. Nothing was deleted that anything references.

## Executed (2026-07-17)

- **A2** — uninstalled `react-chartjs-2` (frontend) and `sequelize-cli` (backend). Build clean.
- **A3** — removed `frontend/public/images/logo2.png` (unreferenced duplicate). **Kept** the root `assets/` logos (plausible design source, harmless).
- **A4** — removed the orphaned ACWR-hero CSS (`.risk-hero-acwr-thresholds`, `.stat-tile-delta--up/--down`, the `.risk-hero--under` class family). Kept the `--risk-undertrained` variable (ScreeningPanel uses it).
- **A5 (part)** — moved `isn-csv-template.xlsx` into `archive/excel-upload/` beside the retired import code. `docs/data-samples/` is now empty.
- **A1 (part)** — removed `GET /api/coach/me` (no caller; readiness already returns the coach's sports).

## Kept, with reason (⟲ = revised from the original candidate list)

- ⟲ **`GET /api/screenings/athlete/:id`** — not deleted. It's a working, RBAC-guarded endpoint exposing screening *history*, which is a real (if currently unwired) capability the FYP2 research doc wants for an on-screen trend view. Unwired ≠ dead.
- ⟲ **`docs/MONGO_RECOVERY.md`, `docs/MYSQL_MIGRATION_PLAN.md`** — not deleted. They're **cross-referenced** by DESIGN_DECISIONS, MASTER_CLARIFICATIONS, PROJECT_GUIDE and README_FOR_CLAUDE_CODE as "why we did X" history; deleting them would dangle four links for no real gain.
- **`GET /api/activities/.../acwr`** — kept (ACWR retention set, §B1).
- **Branch rename `feat/mysql-migration` → `fyp2`** — **not done by me**: the branch has a pushed upstream (`origin/feat/mysql-migration`), so renaming rewrites a remote ref and touches the submission workflow. That's a push-class action — yours to run (`git branch -m fyp2 && git push origin -u fyp2 && git push origin --delete feat/mysql-migration`) if you want it.
- Everything in §B below (ACWR retention set, archive, prototype, FYP-I report, ground-truth script, report assets) — unchanged.

---

## A. Deletion candidates (dead by evidence — your call)

### A1. Orphaned backend endpoints (zero frontend callers)

| Endpoint | Evidence | Note |
|---|---|---|
| `GET /api/coach/me` ([coach.js](../../backend/src/routes/coach.js)) | ~~No caller~~ **Already deleted 2026-07-17** (noted in the route file's header) — the coach page reads its sport from the `/coach/readiness` response | Done |
| `GET /api/screenings/athlete/:id` ([screenings.js](../../backend/src/routes/screenings.js)) | ~~No caller~~ **Now called (2026-07-23)** by `ScreeningHistory.tsx` — the on-screen history/trend table this row anticipated, on the athlete/medical/coach views. Endpoint slimmed to summary columns + coach access sport-scoped when the caller was added | **Keep** |
| `GET /api/activities/athlete/:id/acwr` (`activities.js` *(deleted 2026-07-20)*) | No caller — both dashboards compute ACWR client-side for the recovery baseline | ⚠ Part of the **ACWR retention set** (§B1). Deleting narrows the rebuild insurance; decide it as a package, not in isolation |

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
