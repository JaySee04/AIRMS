# AIRMS — Design Decisions

> Why we chose what we chose. Read this **before** suggesting "improvements" — most obvious alternatives have already been considered and rejected, and the rejection rationale is here.
>
> This file is also the **FYP defensibility cheat-sheet**. Every entry has a one-liner JC can use in viva voce.

---

## 1. sRPE for internal training load

> **Implementation removed 2026-07-20.** The UI that captured this (Activity
> Tracking — `/athlete/activity`, the FYP I Module 1) was fully removed at JC's
> request, along with its backend model/route. The **decision below is still
> locked** for the report — the formula and its literature grounding are
> unchanged — but nothing in the running system computes it anymore. See
> `docs/MASTER_CLARIFICATIONS.md §4` and `docs/fyp/ACWR_REBUILD.md`.

**Decision:** Load (AU) = Duration (min) × RPE (1–10), self-reported by the athlete.

**Why:**
- Validated method per Inoue et al. (2022) and Yang et al. (2024)
- Captures **internal** load (how hard the athlete experienced the session) rather than external load (HR, GPS, power)
- Scales without any sensor hardware — works for every sport at every venue
- ISN does not have universal HRM/GPS coverage across its athlete pool

**Rejected alternatives:**
- **Heart-rate-zone-based load** — requires HRM hardware, sport-specific zone calibration
- **GPS / TRIMP** — only viable for outdoor field sports
- **Coach-rated intensity** — adds delay, doesn't scale

**Counter to "but isn't self-reporting gameable?":** The system tracks the *ratio* of acute to chronic. Even if an athlete consistently over- or under-rates, their personal trend is meaningful. Internal consistency matters more than inter-athlete comparability.

**Defensibility one-liner:** *"sRPE is the most widely cited method for capturing internal training load in team-sport literature, validated in contemporary contexts by Inoue et al. (2022) and Yang et al. (2024); Gabbett (2016) built ACWR around it. Self-reporting is by design — it captures how the athlete experienced the session, which is what predicts injury risk."*

---

## 2. Composite risk model (FYP differentiator)

> **No live caller as of 2026-07-20.** `classifyCompositeRisk()` is unchanged
> in `risk.ts` — the formula below is a locked decision — but its ACWR input
> came from Activity Tracking (the FYP I Module 1), which was fully removed.
> Nothing in the running system calls this function. See `docs/fyp/ACWR_REBUILD.md`.

**Decision:** Risk classification combines (a) standard ACWR thresholds personalised by the athlete's screening data, with (b) escalation when active injuries or high muscle-flag counts align with the workload.

**Implementation:** [frontend/src/lib/risk.ts](../frontend/src/lib/risk.ts) → `classifyCompositeRisk()` (kept, dormant).

**Why:**
- A textbook ACWR pipeline (Gabbett's 0.8 / 1.3 / 1.5 bands) ignores the rich screening data AIRMS already stores
- ISN cares about **per-athlete vulnerability** — same ACWR ≠ same risk if one athlete has knee weakness plus an active injury and the other doesn't
- Integrating workload + biomechanical screening + injury history into one classification is what makes AIRMS more than a re-implementation of textbook ACWR
- The model is explainable — every modifier surface as a chip on the UI ("escalated from Optimal", "2 active injury records")

**Rejected alternatives:**
- **Plain Gabbett bands** — too generic. Same 0.8–1.3 "sweet spot" applies to a recovering athlete and a robust one alike
- **Machine-learning classifier** — out of scope for an undergrad FYP; not enough labelled ISN data; loses explainability which is the whole point for a clinical user
- **Multiplicative-only personalisation** — escalation step (active injuries → bump band up) catches cases personalisation alone misses

**Defensibility one-liner:** *"The composite model is the system's main contribution. Workload alone misses the screening data; screening alone misses the workload. The model integrates them into a single explainable classification, which clinicians can interrogate factor by factor."*

---

## 3. Athletes self-report intensity

> **Feature removed 2026-07-20.** The self-report logging UI (Activity
> Tracking, the FYP I Module 1) was fully removed. The reasoning below explains a UX
> decision for a feature that no longer exists — kept for the report as the
> record of why the (now-dormant) design looked the way it did.

**Decision:** Athletes log their own session type, duration, and RPE intensity. No coach gating, no sensor integration.

**Why:**
- Coaches and medical staff cannot be present at every session, especially with athletes training across multiple sports and venues
- RPE has been validated as a stable measure when collected consistently from the same individual
- For ACWR purposes the **ratio** is the meaningful quantity, not the absolute number. Even noisy self-rating gives meaningful trend signal
- Removing the bottleneck of "wait for a coach to log this" is what makes daily logging actually happen

**Acknowledged limitation:** Athletes may game the system (rate up to look hard-working, rate down to avoid being pulled). The composite risk model mitigates this by cross-referencing with attendance, injury history, and biomechanical screening — gaming the load alone doesn't change the rest of the picture.

**Defensibility one-liner:** *"The whole product would fall apart if logging required a coach to be present. Self-reported RPE is industry-standard practice in sports science; the risk model is designed to be robust against single-channel manipulation."*

---

## 4. Body map: react-muscle-highlighter (MIT) — aggregated

**Decision:** Use the path data from `react-muscle-highlighter` by Sorooj Shehryar (MIT) as the body silhouette source. Aggregate AIRMS-specific muscles to library regions on the figure; preserve full granularity in side cards.

**Why:**
- The user explicitly rejected hand-drawn boxy silhouettes ("system is meant for international level athletes")
- Hand-drawing 26 anatomically accurate muscles at clinical detail is weeks of vector work
- MIT licence permits the use; attribution is preserved in every imported file and called out in this doc + FYP references
- The library lumps muscles to anatomical regions (e.g. one `quadriceps` path for Vastus Lateralis + Rectus Femoris + Vastus Medialis + Sartorius). This is a **clinical communication norm** — show region on figure, list specifics in panel
- Granularity is not lost — the flag cards below the figure list every specific AIRMS muscle with side. Tooltips on hover surface the specific muscles too

**Rejected alternatives:**
- **Hand-drawn primitives** — boxy, unprofessional, not befitting elite athletes
- **react-body-highlighter by Giavinh** — also evaluated; visually too cartoony, low-poly polygon shapes
- **Buying a commercial atlas** — out of scope for FYP budget
- **Subdividing library paths into the specific AIRMS muscles** — possible but adds significant maintenance burden and risks visual misalignment with the underlying silhouette

**Defensibility one-liner:** *"The figure communicates regions visually — the side cards communicate the specific muscles clinically. Both layers exist; nothing is lost. The asset is MIT-licensed and credited."*

---

## 5. MySQL with Sequelize (single persistence layer)

**Decision:** AIRMS persists all data in **MySQL** via Sequelize. There is one backend, one model tree, one seeder. The Next.js frontend reads a stable JSON shape, with Sequelize's numeric `id` exposed as a stringified `_id` field through `backend/src/utils/serialize.js` so frontend components have a consistent identifier to use as a React key.

| Layer | File |
|---|---|
| Entry | [`backend/src/server.js`](../backend/src/server.js) (port 5000) |
| Connection | [`backend/src/config/db.js`](../backend/src/config/db.js) |
| Models | [`backend/src/models/`](../backend/src/models/) (Sequelize) |
| Seeder | [`backend/src/utils/seeder.js`](../backend/src/utils/seeder.js) (deterministic, seed=42) |
| Routes | [`backend/src/routes/`](../backend/src/routes/) |
| Response shaper | [`backend/src/utils/serialize.js`](../backend/src/utils/serialize.js) |

### Why MySQL

- **ISN's production environment is MySQL.** Anything that gets deployed at ISN must run against MySQL; using it during development eliminates the cost of a future translation step.
- **Engine-level relational integrity.** Foreign keys on `athleteId` are enforced by MySQL itself across `activities`, `injuries`, `self_reports`, and `muscle_flags`. Orphaned clinical records cannot exist regardless of how badly a route handler is written.
- **ACID transactions are first-class.** The self-report → injury promotion in Module 2 (Injury & Recovery Logging) is wrapped in `sequelize.transaction()` so the status update and the new injury insert either both commit or both roll back.
- **Mature tooling.** MySQL Workbench gives a working schema inspector and query workbench out of the box, which made schema work during the migration much faster.

### Why not MongoDB

MongoDB was the original FYP I demo stack — see [`MONGO_RECOVERY.md`](MONGO_RECOVERY.md) for the historical record and an emergency restoration procedure. The reasons it was retired:

- **The FYP I review panel flagged document storage as inappropriate for a clinical-record system**, citing ACID and foreign-key concerns. The concerns are answerable on MongoDB 4.x+ (which has both), but defending the choice in viva voce is meaningfully harder than just using a relational engine when the deployment target is relational anyway.
- **Two backends, one frontend** was unsustainable maintenance overhead once the schema stabilised. Every model change had to be made twice; every route had to be ported.
- **The serialisation shim** ([`backend/src/utils/serialize.js`](../backend/src/utils/serialize.js)) proved the frontend never needed to know which database it was talking to. Once that was true, keeping both backends had no remaining technical justification.

### Rejected alternatives

- **MongoDB-only.** Leaves the panel's criticism unanswered and forces a migration before any ISN deployment can happen.
- **PostgreSQL.** Reasonable on technical merit but doesn't match ISN's production target.
- **SQLite.** Fine for local dev but doesn't represent the production environment and would have to be replaced before deployment anyway.

### Hierarchical-data note

The original Mongo rationale leaned on the hierarchical shape of athlete screening data — embedded `myodynamia[]` and `tension[]` arrays, a nested `risks` object. The Sequelize implementation handles this with:

- A single `muscle_flags` table discriminated by `flag_type` (`'myodynamia'` | `'tension'`), with an index on `(athlete_id, flag_type)` so the join is essentially free at read time.
- The 8 risk indicators stored as flat columns on `athletes`; reassembled into a nested `risks` object by the serialiser before the frontend sees the response.

The net result is the same JSON shape on the wire, with engine-enforced integrity behind it.

### Intentional snapshot denormalisation in `injuries` and `self_reports`

Both tables store `athlete_name`, `sport`, `gender`, and `athlete_age` as columns even though the same data exists on the `athletes` table. This is deliberate: an injury record is a clinical snapshot that must remain accurate regardless of future profile edits (name correction, sport transfer, etc.). The denormalised fields are written once at record creation and never updated. This is the same pattern used in financial ledgers — the line-item records the price at the time of the transaction, not the current catalogue price.

The `athletes` table and the normalised `muscle_flags` / `recovery_baselines` tables are fully normalised. Only the two event-log tables (`injuries`, `self_reports`) carry intentional snapshot columns.

**Defensibility one-liner:** *"Clinical and financial records both snapshot the relevant context at the time of creation. The athlete could be transferred to a different sport next month — the injury record from today must still reflect the sport they were playing when they were injured."*

**Defensibility one-liner:** *"MySQL matches ISN's production environment, provides engine-level foreign keys and ACID transactions for clinical records, and lets the same Sequelize model layer drive both schema validation and derived-field hooks like sRPE load computation. The original document-store choice is documented in MONGO_RECOVERY.md as a historical record."*

---

## 6. Next.js 14 App Router (frontend)

**Decision:** Next.js 14 with the App Router (`app/` directory), TypeScript, no separate SPA build step.

**Why:**
- Filesystem routing maps cleanly to the role-based URL structure (`app/athlete/dashboard/page.tsx` → `/athlete/dashboard`)
- TypeScript catches data-shape mismatches between frontend and Sequelize-defined backend models — important for an FYP where there's no QA team
- Client components (`'use client'`) handle interactivity; server components stay out of the way (we don't really use SSR here since the app is fully authenticated)
- `npm run dev` HMR is fast and reliable
- Easy to deploy to Vercel later if needed

**Rejected alternatives:**
- **Pages Router** — older, more boilerplate, no auto layout sharing
- **Vite + React Router** — would require manually setting up TS configs, routing, build pipeline
- **Plain CRA** — deprecated, slow build

**Defensibility one-liner:** *"App Router gives filesystem-driven routing that matches our role-based URL hierarchy. TypeScript catches schema drift between frontend and Sequelize models. No special build infrastructure needed."*

---

## 7. JWT in `localStorage` over httpOnly cookies

**Decision:** JWT stored in `localStorage`, attached to every API call via `Authorization: Bearer` header.

**Why:**
- Simpler — no CSRF token machinery, no cross-origin cookie attributes
- Suits the demo/FYP scope: the app is a single-tenant clinical tool not exposed to anonymous users
- Easy to clear on sign-out: `localStorage.removeItem('airms_token')`

**Acknowledged limitation:** Vulnerable to XSS if an attacker can inject JavaScript. The mitigation is that this is a controlled clinical app — not a public-facing site — and React naturally escapes most user-provided content.

**Defensibility one-liner:** *"The threat model is internal ISN use, not a public-facing application. localStorage with JWT keeps the implementation simple. A production deployment would migrate to httpOnly cookies with CSRF protection."*

---

## 8. Single-file global CSS (no Tailwind, no CSS-in-JS)

**Decision:** All styles in [frontend/src/styles/globals.css](../frontend/src/styles/globals.css), using CSS variables for theming.

**Why:**
- The prototype was already plain CSS. Migrating to Tailwind would have rewritten the whole UI for no functional gain
- CSS variables make light/dark theming trivial (`[data-theme="dark"] { --bg: ...; }`)
- A single stylesheet is easy to grep, easy to debug, easy to teach to a successor

**Rejected alternatives:**
- **Tailwind** — chosen against because we inherited a prototype already in CSS; Tailwind would force a full rewrite
- **CSS-in-JS (Emotion / styled-components)** — extra runtime overhead, harder for a single FYP author to maintain
- **Sass/SCSS** — modern CSS variables and nesting do everything Sass used to do

**Defensibility one-liner:** *"Plain CSS with variables matches the prototype we inherited and works for the scope. No build infrastructure overhead, easy to maintain, supports light/dark theming via one attribute swap."*

---

## 9. `concurrently` at the root for dev orchestration

**Decision:** Root-level `package.json` with `npm run dev` that spawns backend + frontend together via the `concurrently` package.

**Why:**
- Single-command dev experience matches what an FYP supervisor expects to see during a demo
- No need to maintain two terminal windows manually
- One `Ctrl+C` stops everything cleanly

**Rejected alternatives:**
- **Two separate terminals** — fine for production deploy but bad for demo
- **Docker Compose** — overkill for the FYP; would require Docker on the demo machine
- **PM2** — process manager for production; not what dev workflow needs

**Defensibility one-liner:** *"Single command boots the system. Logs prefixed by service. Stop both with one Ctrl+C. The supervisor never sees a "which terminal is which" moment during the demo."*

---

## 10. ACWR baseline thresholds 0.8 / 1.3 / 1.5 (with personalised modifier ±15%)

> **`personalisedThresholds()` has no live caller as of 2026-07-20** — it's
> unchanged code in `risk.ts`, reachable only if the composite model is
> rewired to a rebuilt training-load input (Activity Tracking was fully
> removed; see `docs/fyp/ACWR_REBUILD.md`). The thresholds stay locked/
> citable regardless.

**Decision:** Use Gabbett (2016)'s standard thresholds as the literature baseline; modify by ±15% per athlete via `personalisedThresholds()`.

**Why:**
- 0.8–1.3 is the most cited "sweet spot" in the team-sport literature
- 1.5 is the most cited danger threshold for non-contact injury risk
- ±15% modifier swing is intentionally small — it personalises without contradicting the well-established baseline

**Defensibility one-liner:** *"The textbook thresholds anchor the model. The personalisation modifier is small enough that an athlete at median vulnerability sees almost exactly Gabbett's numbers; only the outliers (very robust or very vulnerable) see meaningfully different bands. This is consistent with the literature while adding clinical nuance."*

---

## 11. Memory file system maintained outside the project repo

**Decision:** Auto-memory entries (`~/.claude/projects/.../memory/MEMORY.md`) live in JC's user folder, not in the project repo.

**Why:**
- Memory is for **JC + Claude** collaboration, not for collaborators or successors
- Putting it in the repo would either bloat the repo with session state or leak context unrelated to the FYP
- The docs folder is the canonical project knowledge; memory is just a faster path for Claude

**Implication:** If JC ever hands the project to another student, they get `docs/` not `memory/`. The docs are the source of truth.

---

## 12. Pragmatic decisions table

Minor calls that didn't get a full section but are worth recording:

| Topic | Choice | Reason |
|---|---|---|
| Chart library | Chart.js | Well-known, low ceremony, fits within Next.js client components |
| Avatar style | Initials in a navy circle | No external dependency (DiceBear etc.); brand-consistent |
| Theme persistence | `localStorage["airms_theme"]` | Survives reload; no cookie complexity |
| Date format in UI | ISO `YYYY-MM-DD` for inputs, `15 May 2026` style for display | Consistent across the app |
| Currency | None — health data, not financial | N/A |
| Numbers | `toLocaleString()` for thousand separators | Locale-aware |
| Error display | Inline `<div class="alert alert-error">` per card | Avoids modal interruption |

---

---

## 13. Excel→HoloMotion PDF ingestion (vision AI)

**Decision:** Add a HoloMotion-PDF ingestion path that renders the report's pages and reads them with a **configurable, provider-agnostic vision model**, mapping the result onto the existing `Athlete` + `muscle_flags` schema. The Excel uploader was initially kept alongside it as a fallback.

**Update (2026-07-12):** the Excel *import* was retired entirely. The PDF path became strictly superior once it gained **batch import** (drop a squad's reports at once; sequential extraction inside free-tier rate limits) and **name-match autofill** (the extracted name is matched against the roster to auto-fill Athlete ID / sport / programme; new athletes pick their sport from a searchable list of ISN's 52 sports). The removed Excel code is preserved verbatim in [`archive/excel-upload/`](../archive/excel-upload/README.md); the Excel **backup export** is unrelated and remains live.

**Implementation:** [`pdfRender.js`](../backend/src/utils/pdfRender.js) (render) → [`visionClient.js`](../backend/src/utils/visionClient.js) (provider adapter) → [`holomotionExtract.js`](../backend/src/utils/holomotionExtract.js) (prompt → JSON → mapping); routes in [`upload.js`](../backend/src/routes/upload.js); UI [`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx).

**Why:**
- Dr Thung's real workflow produces **HoloMotion PDFs**, not Excel rosters — ingesting them directly removes a manual transcription step
- The report has **no text layer**: it's generated by jsPDF as baked-in graphics. Verified — both `pdf-parse` and `pdfjs` extract zero characters. So text parsing is impossible and OCR is unreliable on the dark, gauge-embedded numbers (the most important values). A vision model is the only path that reads them automatically and accurately
- **Rendering to images** (not sending the PDF) is the portable choice: every vision provider accepts images, but not all accept raw PDFs. This is what makes the feature provider-agnostic
- The graded composite-risk logic ([`risk.ts`](../frontend/src/lib/risk.ts)) is **not** touched — only screening *ingestion* changed

**Provider-agnostic by design:** one OpenAI-compatible adapter covers OpenAI, Gemini (via its OpenAI-compatible endpoint — free-tier AI Studio keys work), Qwen (DashScope), OpenRouter, Together, Groq, and local Ollama/LM Studio; a second adapter covers Anthropic native. Switching is env-only (`VISION_PROVIDER` / `VISION_BASE_URL` / `VISION_MODEL` / `VISION_API_KEY`). Feature self-disables when unconfigured — same console-fallback philosophy as the SMTP mailer.

**Rejected alternatives:**
- **`pdf-parse` / text extraction** — impossible; no text layer
- **Local OCR (Tesseract)** — free and offline, but tested against the real report it misses the gauge-embedded scores (Total Score, Exercise Risks, the 8 injury-risk numbers) — i.e. the values that matter most — and would need a human-correction step that defeats the purpose
- **Hard-coding one provider (e.g. Anthropic only)** — locks the project to one vendor/key; the env-driven adapter costs little and keeps options open
- **Replacing Excel outright (at introduction)** — initially kept as a fallback + for bulk roster import. Revisited and retired on 2026-07-12: batch PDF import covers the bulk case and name-match autofill removes the manual-entry advantage, so the parallel path became maintenance without benefit (code archived, backup export retained)

**Defensibility one-liner:** *"HoloMotion reports are image-only PDFs, so the system renders the pages and reads them with a vision model — provider-agnostic, so any OpenAI-compatible or Anthropic key works — then maps the result onto the same athlete schema. OCR was tested and rejected because it can't reliably read the numbers locked inside the gauge graphics."*

---

## 14. Per-user feature permissions for medical staff (opt-out)

**Decision:** Layer a per-user permission gate on top of coarse RBAC, letting an admin revoke individual capabilities (`viewRecords`, `uploadData`, `reviewReports`, `injuryReports`) from a specific medical staffer, or deactivate the account. **Opt-out model:** a capability is granted unless explicitly set `false`.

**Implementation:** [`utils/permissions.js`](../backend/src/utils/permissions.js) (catalogue + helpers) + [`middleware/permission.js`](../backend/src/middleware/permission.js) (`requirePermission`) on the protected routes; admin UI at [`/admin/staff`](../frontend/src/app/admin/staff/page.tsx); mirrored client-side in [`lib/auth.ts`](../frontend/src/lib/auth.ts) so revoked features vanish from the sidebar.

**Why:**
- RBAC answers "what role are you"; ISN also needs "which features may *this* staffer use" — e.g. a junior physio who can view records but not upload screening data
- Opt-out keeps the default behaviour identical to before (everything on), so existing medical accounts are unaffected until an admin deliberately restricts one
- Enforced server-side (the frontend mirror is convenience, not security) — defense in depth, same principle as the password policy
- Scoped to **medical** only by deliberate choice: athlete access is self-only by nature, and admin is the one granting permissions, so neither needs the layer

**Rejected alternatives:**
- **Full RBAC permission matrix / custom roles** — over-engineered for a small, fixed-role institution (four roles); opt-out booleans on the existing role cover the actual need
- **Opt-in (everything off by default)** — would require configuring every existing account before it kept working; worse migration story for no benefit

**Defensibility one-liner:** *"RBAC sets the role; the permission layer lets an admin fine-tune exactly which features each medical staffer can use, enforced at every route. It's opt-out, so it changes nothing until an admin deliberately restricts someone."*

**Refinement (2026-07-06):** a revoked feature now *vanishes* rather than dead-ending — sidebar entry hidden, direct navigation redirects to the staffer's first still-permitted page, and the layout refreshes the session user from `/api/auth/me` on every load so revocations take effect without re-login. The access-denied panel was rejected as a dead end that advertises the existence of a feature the user can't reach.

---

## 15. Screening lives on the dashboards; the data is HoloMotion-only

**Decision:** The athlete's latest HoloMotion screening renders **inside the athlete and medical dashboards** (shared [`ScreeningPanel`](../frontend/src/components/dashboard/ScreeningPanel.tsx)) — there are no standalone screening pages. And AIRMS stores/seeds **only fields the HoloMotion report actually carries**: integer gauge scores, the eight risk indicators, and the two muscle lists. Weight/height (never on the report) are left null; sport/programme are operator-supplied at import.

**Implementation:** `ScreeningPanel` = five score gauges with tick marks at HoloMotion's own 60/75/85 tier boundaries + the eight indicators as **threshold strips** (tinted OK ≤15 / Watch ≤25 / High >25 zones, marker coloured by the zone it lands in, sport-critical regions starred via [`screeningAlerts.ts`](../frontend/src/lib/screeningAlerts.ts)'s shared region map). Seeder anchors: John Doe (Module 1 demo profile) and **ATH0061 Thung Jin Seng — transcribed 1:1 from the sample HoloMotion PDF** as pipeline ground truth (`thung@isn.gov.my / thung123`).

**Why:**
- The dashboard is where decisions are made — a separate screening page forced a context switch to read data that directly feeds the composite risk model shown on the same screen
- Threshold strips show the athlete's values *on their thresholds* (the report's own risk bands) instead of restating the report's numbers — colour + position answer "is this a problem?" at a glance
- Storing only report-carried fields keeps every displayed value traceable to the real ingestion source — nothing on screen is data the system couldn't actually have
- The ground-truth athlete makes the vision pipeline testable: the printed report values are pinned in `backend/scripts/verify-holomotion-extract.js` (`npm run verify:vision`), and ATH0061 is seeded as a deliberately *stale earlier assessment* so a live import of the sample PDF visibly updates his dashboard to those printed values — the update itself becomes the demo

**Rejected alternatives:**
- **Keeping the standalone screening pages** — duplicated the dashboard's audience with a poorer context; two places to maintain one view
- **Radar-only presentation** — the radar shows the *shape* of risk across regions but not threshold state; the strips carry the band semantics (the radar stays as the shape view)
- **Seeding Excel-era decimal values** — looked plausible but could not have come from the actual ingestion source; indefensible under "where did this number come from?"

**Defensibility one-liner:** *"Everything on the dashboard is the HoloMotion report, read against the report's own thresholds — and one seeded athlete is Dr Thung himself, seeded with his older assessment so that importing his actual report live updates the dashboard to the printed values, checked field-by-field against ground truth."*

**Extension (2026-07-08) — per-sport thresholds + training focus:**
- Every athlete takes the same eight tests, but each indicator is banded against **its region's sport-specific thresholds** ([`thresholdsFor()`](../frontend/src/lib/screeningAlerts.ts)): sport-critical regions are tightened to 12/20 (~20% stricter — deliberately the same personalisation scale as the composite model's ±15%), all others keep the instrument's 15/25. **Tightening only** — relaxing beyond the report's own Low boundary was rejected as clinically indefensible ("why did AIRMS wait longer than the instrument?"). The threshold strips draw each region's actual zones, so the tightened standard is visible, not just annotated.
- The panel closes with **Training Focus** ([`trainingFocus.ts`](../frontend/src/lib/trainingFocus.ts)) — AIRMS' counterpart of the report's closing Training Prescription: up to three out-of-range regions (sport-critical first) with corrective exercises and reps × sets · rest dosing, using the HoloMotion prescription exercise vocabulary. Rule-based, no model call. Ground-truth validated: for the sample report it selects Ankle / Knee / Neck — the same three problems the report's own summary flags ("neck pain, ankle sprain, ligament strain").

---

## 16. FYP II — cohort-normed overall risk indicator (ACWR demoted, then Activity Tracking removed)

> **Update 2026-07-20.** The "demote, not delete" framing below described the
> state from 2026-07-16 to 2026-07-20. On 2026-07-20 JC asked to fully remove
> Activity Tracking (the FYP I Module 1) — its only training-load input — with
> the fallout accepted. The ACWR/composite model is no longer a
> dormant-but-intact secondary view; its data source is gone. `risk.ts` itself
> is still not deleted (the formula is a locked decision), but there is
> nothing left to "demote" — see [`ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md) for
> the full history. The six-module set was also **restructured** that same day
> to fill the gap Activity Tracking's removal left — see
> `MASTER_CLARIFICATIONS.md §4` for the current module numbering.

**Decision:** make a **cohort-normed HoloMotion overall risk indicator** the
primary risk signal, and **demote** the ACWR/composite-workload model to a
secondary "Training Load" view (not deleted — see [`ACWR_REBUILD.md`](fyp/ACWR_REBUILD.md)).
Full design in [`FYP2_REDESIGN_SPEC.md`](fyp/FYP2_REDESIGN_SPEC.md).

**Method (Total Score of Athleticism):** each athlete's oriented screening
components (Total Score, ROM, Stability, Symmetry, inverted exercise-risk
burden over the 7 *shown* indicators, and L/R asymmetry from the subitem
scores) are **z-scored against the athlete's cohort** (sport + programme +
gender, with a spg → sg → s → all fallback) and averaged. z-score +
traffic-light against a sport/sex reference is the accepted sports-science
standard for cohort-normed screening; equal-weighted standardised components is
the published TSA default (removes arbitrary weighting).

**Escalation band (Dr Thung's spec):** base green; **+1 escalation** if below
the cohort mean, **+1** if in the cohort's bottom-k, **+1** (per-indicator, added
2026-07-19) if a single exercise-risk indicator is *both* over the Elevated
threshold (≥25) *and* the athlete is a clear peer-outlier on it (per-indicator
z ≥ 1.5 vs the cohort). Band: 0 = green, 1 = amber, **≥2 = red** (the count can
now reach 3; band caps at red). So a good raw score that is below cohort and
among the worst performers still escalates to red, and an athlete who is fine on
the composite but has one indicator that is both elevated and worse than their
squad is escalated for exactly that.

The per-indicator rule is deliberately the "peers **and** the threshold" form,
not "threshold alone": on the seeded squad a threshold-only rule would flag
54–93% of athletes (every indicator ≥15 hits everyone), whereas requiring a
1.5-SD per-indicator outlier flags 6 of 59 (z ≥ 1.0 flagged ~half; z ≥ 2.0 caught
nobody — so 1.5 is the selective sweet spot). It is an **admin toggle**
(`escalation_indicator`, with tunable `escalation_indicator_high` / `_z`) and the
escalation **reasons are persisted** (`screenings.factors`) and shown on the risk
badge ("Knee 27 — over threshold and worse than cohort"). Reuses the standard
Elevated boundary (25); per-indicator cohort mean/SD are computed in
`cohorts.js` alongside the component stats.

**Governance:** cohort thresholds are auto-computed but **admin-approved** (the
computed averages are pre-filled and editable); a **clinician can override** an
athlete's band after a real assessment (note required, auto-expires on the next
import). Minimum cohort size + fallback are **admin settings**. New amber/red
imports **email** medical staff + the sport's coaches.

**Why exclude Lumbar Disc Herniation** from all displays/scoring (still stored):
Dr Thung's direction — ISN's current facilities don't support that assessment,
so surfacing it would imply a capability the institute doesn't have.

**Rejected alternatives:** deleting ACWR outright (it is the FYP I graded
differentiator and lit-review anchor — demote + preserve instead); absolute
per-metric cutoffs (cohort-normed z-scores are the sports-science standard and
adapt per sport/sex); hand-picked component weights (equal-weighted z-scores
are the published TSA method).

**Defensibility one-liner:** *"FYP I personalised workload thresholds by an
athlete's own vulnerability; FYP II extends the same normed-threshold
philosophy to the screening domain — z-scoring each athlete against their
sport/programme/gender cohort, the accepted sports-science standard, with
admin-approved norms, clinician override, and escalation for the athletes who
look fine on paper but sit at the bottom of their group."*

---

## 17. Coach role evolution — one sport, athlete detail view, event disciplines

**Status:** **first-class 4th role (promoted 2026-07-19).** FYP II adds `coach`
to the athlete/medical/admin model — read-only and sport-scoped
(MASTER_CLARIFICATIONS §12 and CLAUDE.md updated to own it; FYP I shipped three
roles). Built incrementally through 2026-07-18/19 on JC's direction.

**One sport per coach.** `User.coachSports` (JSON array) → `User.coachSport`
(scalar string). A coach's jurisdiction is exactly one squad; enforced in
[`routes/coach.js`](../backend/src/routes/coach.js) and the team-report scope
check in [`routes/screeningReports.js`](../backend/src/routes/screeningReports.js).
Coaches are managed from [`/admin/coaches`](../frontend/src/app/admin/coaches/page.tsx)
(create, reassign the sport, activate/deactivate) via `POST` / `PATCH /api/users` —
no reseed needed, unlike the original seed-only setup.

**Coach can read an athlete's screening detail.** Coach board rows are now
selectable → a READ-ONLY detail view (risk badge, radar, `ScreeningPanel`
threshold strips, body map, events) reusing the same components the medical view
uses, minus every clinical affordance (no override, no injury logging).

**Individual PDF unblocked for coaches (2026-07-23, reversing the 07-19 call).**
The original stance was "on-screen read-only detail is within remit, a portable
clinical report is not". JC reversed this: a coach may now download the
individual screening PDF for athletes **in their assigned sport only** — the
same `coachSport` scope check the team report applies, enforced server-side in
[`routes/screeningReports.js`](../backend/src/routes/screeningReports.js)
(athlete is fetched first, then sport compared). The report content is
screening-derived data the coach already sees on the detail view, so the PDF
adds portability, not new disclosure. Read-only remit is unchanged.

**Coach-scope hardening sweep (same day).** Auditing for the pattern behind the
above turned up three pre-coach routes gated only by `auth +
requirePermission` — their athlete self-check let the coach role fall through
**unscoped**: `GET /screenings/athlete/:id`, `GET /athletes/:id` and
`GET /injuries/athlete/:id`. The first two now sport-scope coaches (screening
detail is in remit); the third 403s coaches outright — clinical injury records
were never in the remit (coaches get active-injury *counts* via
`/coach/readiness`). Rule of thumb going forward: any route relying on an
in-handler self-check instead of `rbac(...)` must decide the coach case
explicitly.

**Athlete events ("disciplines").** New `athlete_disciplines` join table
(`Athlete hasMany`) — an athlete can hold multiple events (a badminton player may
play Men's Singles AND Men's Doubles), so a join table, not a column. The DB
stores free strings, so events are **not a fixed catalogue**: on the PDF-import
identity step the operator uses a **combobox** ([`PdfScreeningUpload.tsx`](../frontend/src/components/upload/PdfScreeningUpload.tsx))
to pick an already-used event (autocomplete via `GET /api/athletes/meta/disciplines`,
distinct (sport, event) pairs on record) **or type a brand-new one** — for any
sport. `lib/disciplines.ts` (`SPORT_DISCIPLINES`) now only ships **seed
suggestions** (the racket/pair sports — badminton, tennis, table tennis, squash —
which share Singles/Doubles/Mixed), pre-populating the autocomplete before any
events exist. Events are also **editable after import** on the medical athlete
header (same combobox → `PATCH /athletes/:id`, no re-import). Roster **filters
are data-driven**: the medical and coach event dropdowns list the distinct events
actually present on the loaded athletes, so an admin-added event is immediately
filterable (no catalogue edit). Sport / programme / gender / event are all
filterable (the `/api/athletes` list already filtered the first three;
`discipline` was added).

**Locked-schema note.** Adding `athlete_disciplines` and renaming `coachSport`
touch schema §12 calls locked. Done with JC's explicit go-ahead: the Athlete
TABLE itself is unchanged (a new *related* table), coach is experimental, and
disciplines model ISN's real badminton event structure — defensible as domain
fidelity, not scope creep.

**Rejected alternatives:** one discipline per athlete as a single column
(rejected — real players compete in several events); a hardcoded per-sport event
taxonomy for all 52 sports (rejected — events are admin-extensible free strings
via the import combobox, so no code change is needed to introduce a sport's
events; badminton's five are only seed suggestions); a fixed dropdown that
forbids new values (rejected — JC asked for "add a new one OR choose an existing
one"); keeping the coach multi-sport (rejected — JC scoped a coach to exactly
one squad).

---

## 18. On-device name redaction before vision extraction (PII minimisation)

**Decision:** Before a HoloMotion page image is sent to the vision model, the athlete's **name is located and blacked out locally**, on the server, so the only direct identifier on the report never reaches the (potentially cloud) vision provider. Implemented in [`redactName.js`](../backend/src/utils/redactName.js), invoked from [`pdfRender.js`](../backend/src/utils/pdfRender.js) for **page 1 only** (the sole page carrying the name — verified against both layouts).

**Why:** the rendered page images are the only athlete data that leaves the machine during ingestion. Auditing the two real report layouts showed the **only** direct identifier printed on the pages is the **name** (top-left "Information" block, page 1 only); the phone number, when present, lives solely in the *filename* — never on the page, and filenames are not sent to the model. So redacting the name from page 1 means the vision provider only ever sees a de-identified report. Age/gender/time and every score are **left intact** (only the name value is covered, not the whole Information block), so extraction — including the screening timestamp — is unaffected.

**Why OCR to locate it (and why that isn't contradicted by §13):** the two HoloMotion layouts place the name at very different vertical positions (~16 % of page height on the compact layout, ~35 % on the expanded one), and the compact layout packs the Summary directly beneath it — so no single fixed rectangle is both safe (won't cover the timestamp/gauges/summary) and sufficient (covers the name on both). The name must be *located*, not guessed. A lightweight local **Tesseract** pass (`tesseract.js`, pure WASM) reads page 1, finds the "Name" line, and the value to its right is blacked out. This does **not** contradict §13's rejection of OCR: §13 rejected OCR for **reading the gauge-embedded scores** (which it genuinely can't do reliably) — here OCR only has to find one plain, high-contrast label ("Name"), a task it does easily. Vision still does all the actual data extraction.

**Fail-closed:** if OCR is unavailable or can't find the name, the pass blacks out the top-left Information quadrant (still clear of the right-hand gauges) rather than sending page 1 unredacted — privacy is preserved even on an unrecognised layout, at worst losing the timestamp on that one page.

**Downstream:** the model no longer returns a name, so the operator attaches each report to a roster athlete by **Athlete ID** (the retired name-match is now an ID-match that fills identity/sport/programme back from the roster), and the commit backfills `name` from the roster record ([`upload.js`](../backend/src/routes/upload.js)). Identity therefore comes from AIRMS's own data, never from the model.

**Verification:** [`verify-redaction.js`](../backend/scripts/verify-redaction.js) renders page 1, redacts, and writes before/after PNGs + the detected box — confirmed on **both** sample layouts that the name (short and long) is fully covered while Gender/Age, time, both gauges, and the Summary survive. Real athlete PDFs are gitignored (`backend/scripts/samples/`).

**Rejected alternatives:** a fixed-coordinate redaction box (rejected — the two layouts differ too much; a box safe for one leaks or clobbers on the other); redacting the whole Information block and re-sourcing age/gender + operator-entered date (rejected — needlessly drops the objective screening timestamp and eats the Summary on the compact layout); routing to a self-hosted/local vision model instead of redacting (viable and complementary — the provider is already env-swappable to Ollama — but redaction protects identity *regardless* of which provider is configured, so it's the stronger default).

**Defensibility one-liner:** *"The report images are the only thing that leaves the machine, and the athlete's name is the only direct identifier on them — so AIRMS locates and blacks out the name locally, with a fail-closed fallback, before any image reaches the vision model. The name never leaves the machine; the operator re-attaches identity by Athlete ID from our own roster."*

---

*Last updated: 2026-08-03 — §18 on-device name redaction before vision extraction (Tesseract-located, page-1-only, fail-closed; verified against both HoloMotion layouts). Previous: 2026-07-20 — Activity Tracking (the FYP I Module 1) fully removed at JC's request; §1, §2, §3, §10 and §16 annotated to mark their decisions as locked-but-dormant (no live caller) rather than actively running. The six-module set was restructured the same day to fill the gap this left — see `MASTER_CLARIFICATIONS.md §4` for the current numbering. Previous: 2026-07-19 (§16 gains the per-indicator escalation — threshold + peer-outlier, z ≥ 1.5, admin toggle, persisted factors), 2026-07-18 (§17 coach one-sport + athlete detail view + event disciplines), 2026-07-13 (§16 FYP II cohort-normed overall indicator + ACWR demotion), 2026-07-06 (§15 dashboard-embedded screening), 2026-06-28 (§13–14).*
