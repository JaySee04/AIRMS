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
- **Subdividing library paths into the specific AIRMS muscles** — ~~possible but adds significant maintenance burden and risks visual misalignment with the underlying silhouette~~ **superseded 2026-08-04, see §4a**

---

## 4a. Body map: muscle-level partition to the HoloMotion vocabulary (2026-08-04)

**Supersedes the aggregation half of §4.** The asset, its MIT attribution and the
side cards are unchanged; what changed is the *grain* of the figure in Muscle
Flags mode.

**Decision:** In flags mode the figure draws HoloMotion's individual muscles, not
the library's workout regions. ROM & Stability mode still draws regions.

**Why:**
- §4's aggregation was set when AIRMS ingested a different data source. After the
  HoloMotion-only pivot the figure was rendering a *clinical postural* vocabulary
  (piriformis, iliopsoas, rectus capitis anterior) on a *workout* atlas (chest,
  biceps, quads). The taxonomies don't correspond
- The collapse was destroying clinically meaningful contrast. All four glute
  muscles shared one shape, so "piriformis weak **while** gluteus maximus tight"
  — a textbook deep-stabiliser compensation pattern, and exactly the pairing in
  the Nazwan 2025-08-13 report — rendered as one undifferentiated blob
- `Iliopsoas` was mapped to `adductors`, putting a deep hip-flexor finding on the
  inner thigh
- §4's stated risk (misalignment) applied to *drawing new paths*. It does not
  apply here: **16 of the 22 muscles are recovered from sub-paths the asset
  already contains** — the library draws the three vasti and the two glute heads
  as separate `d` strings and merely labels them all `quadriceps` / `gluteal`. No
  geometry is redrawn, so nothing can drift
- Sub-paths are selected by **measured geometry, not array index**: the asset does
  not order left and right limbs identically (`upper-back` left `[1]` is the large
  sheet, right `[2]` is), so index slicing would have mirror-swapped muscles.
  `bodymap-data/muscles.test.ts` asserts this — e.g. vastus medialis is medial to
  vastus lateralis on *both* legs
- The 6 genuinely deep/absent muscles (Piriformis, Gluteus Minimus, Iliopsoas,
  Internal Oblique, Rectus Capitis Anterior, Sartorius) are drawn as schematic
  insets derived from their parent's measured bounding box — the same convention
  the HoloMotion report itself uses, which shades piriformis *inside* the gluteal
  mass rather than as surface anatomy
- Mode grain now matches data grain: the Physical Fitness Subitem Score genuinely
  *is* five regions, so ROM & Stability mode still renders regions. The backend
  PDF figure is fed subitems only, so it needed no change

**Known collapse (deliberate):** `Middle Deltoid` and `Lateral Deltoid` share one
shape. HoloMotion names both, but they are the same anatomical head — this is not
information loss. Declared explicitly as `MUSCLE_ALIASES`.

**Defensibility one-liner:** *"The figure speaks the instrument's own vocabulary.
We partitioned the licensed geometry the asset already contained rather than
inventing anatomy — and the partition is verified by test, not by eye."*

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

**Decision:** Layer a per-user permission gate on top of coarse RBAC, letting an admin revoke individual capabilities (`viewRecords`, `uploadData`, `reviewReports`, `injuryReports` — the last two were **removed on 2026-08-02** with the self-report and injury-log features they gated, and `editCohortNorms` was added; the live catalogue is `viewRecords` / `uploadData` / `editCohortNorms`) from a specific medical staffer, or deactivate the account. **Opt-out model:** a capability is granted unless explicitly set `false`.

**Implementation:** [`utils/permissions.js`](../backend/src/utils/permissions.js) (catalogue + helpers) + [`middleware/permission.js`](../backend/src/middleware/permission.js) (`requirePermission`) on the protected routes; admin UI at `/admin/staff` *(since merged into `/admin/personnel`)*; mirrored client-side in [`lib/auth.ts`](../frontend/src/lib/auth.ts) so revoked features vanish from the sidebar.

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
Coaches are managed from `/admin/coaches` *(since merged into `/admin/personnel`)*
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

## 19. One status palette, four renderers (2026-08-06)

**Decision:** A status colour is defined once, in `globals.css`, as one of four
risk tokens. Everything that draws that status — CSS, inline styles, Chart.js,
and the backend's pdfkit reports — resolves to those same values.

```
--risk-low          green   Safe        · Low        · Excellent (≥85)
--risk-undertrained blue                             · Good (≥75)
--risk-moderate     amber   Needs att.  · Watch      · Average (≥60)
--risk-high         red     Immediate   · Elevated   · Below Average (<60)
```

**Why:** an audit found four renderers had drifted apart.

- **The PDF had invented a second palette.** Bands were `#2e9e5b / #d99a16 /
  #d14b4b` against the website's `#3d7c47 / #c89b3c / #b03030`. Worse, the same
  file's subitem tiers *already* used the website values — so a "Safe" pill and
  an "Excellent" disc were two different greens **on the same page**.
- **The radar's threshold ring was a hardcoded literal** (`#d14b4b`) while every
  other colour in that chart flipped with the theme. It sits inches from the
  risk hero, so in dark mode the hero lifted to `#e57373` and the ring did not.
- **The 60/75/85 tier was defined five times** — the panel, the subitem table,
  the body map, the import preview and the PDF. Boundaries agreed; wording had
  not. The lowest tier read **"Below Average"** in two and **"Below"** in three,
  and since the panel *renders the subitem table inside itself*, both words were
  on screen at once describing the same number.
- **Eight CSS-variable fallbacks carried the retired PDF palette**
  (`var(--risk-low, #2e9e5b)`), so a stylesheet failure would have repainted the
  app in a design system that no longer existed.

**Implementation:** [`lib/holomotionTiers.ts`](../frontend/src/lib/holomotionTiers.ts)
owns the tier (boundaries, ranks, wording, colours, legend ranges);
[`lib/chartTheme.ts`](../frontend/src/lib/chartTheme.ts) gains `riskLow/Mod/High`
so Chart.js gets theme-aware status colours; `pdfDraw.js` keeps a written-out
copy of the light-theme values, marked as a mirror, because a Node process
cannot read CSS custom properties.

**Contrast rule that comes with it:** the amber token is a light yellow. White
on it fails legibility, so any *filled* amber mark takes dark ink (`#3d2f05`),
and amber used as *text on white* darkens to `#8a6a16`. This already existed for
the PDF's "Average" tier and is now applied consistently — it caught a
white-on-amber pill in the import preview.

**Rejected:** *let print differ from screen.* Print legibility is a real
constraint, but it argues for the ink/onLight rule above, not for a second set
of hues — and the divergence here was accidental, not a print decision.

**Defensibility one-liner:** *"A risk band is one colour with one name, whether
you meet it on the dashboard, in a chart, or on the printed report. The tokens
live in one file, and the two places that can't read CSS — Chart.js and the PDF
generator — carry a copy that's marked as a mirror."*

---

## 20. Accountability, immediate norms, and reporting that happens unasked (2026-08-10)

Five decisions from one session. They share a shape: the *data* was usually
already there, and what was missing was either a way to read it or a guarantee
that it stayed true.

### 20a. The audit trail copies the actor, and is fire-and-forget

AIRMS could not say who imported a screening, who moved a norm, or who marked an
athlete injured. Six actions now write an append-only `AuditLog` row.

**Decided:** the actor's **name and role are copied onto the row**, not joined
from `users`.

**Why:** a trail that changes when someone is renamed, has their role changed, or
is deleted is not a trail. It has to say who they *were* when they acted. The
cost is duplication that cannot be normalised away, which is the correct cost for
this table and the wrong one almost everywhere else.

**Decided:** audit writes are **fire-and-forget**, never awaited inside the
caller's transaction.

**Why:** logging must not be able to fail the operation it describes. A missing
`audit_logs` table on an older dev DB would otherwise take down every import.

**The cost, stated plainly:** a lost audit row is silent to the user. That is the
right trade for *transparency* logging and the wrong one for anything the
institution must be able to **prove**. If AIRMS ever needs the latter, this
becomes an awaited write inside the caller's transaction — noted in
`utils/audit.js` for whoever needs it.

**Defensibility one-liner:** *"It records who they were when they acted, not who
they are now — and it can never be the reason an import fails."*

### 20b. Norm eligibility applies immediately, and says so

Marking an athlete injured, or unticking them on the Cohort Norms page, changed
who was **eligible** but left the published norm untouched until someone
happened to import a report. The route comment said so out loud — *"applied on
the next recompute"*.

**Decided:** both routes rebuild the norms and rescore every indicator **in the
same request**, awaited rather than queued like the import path.

**Why:** the admin is looking at the cohort table and expects it to move when the
tick does. Deferral made the exclusion real in the eligibility rules and
invisible in the numbers — the worst of both.

**Decided:** a one-time modal discloses that the norm moves, dismissible for
good.

**Why:** unticking one athlete silently shifts the baseline every *other* athlete
in that cohort is scored against. That is a governance action wearing the clothes
of a checkbox. Once, not every time: a confirmation that fires on every click
stops being read by the third one.

**Rejected:** *disclosure instead of immediacy.* JC offered either. Immediacy
without disclosure is surprising; disclosure without immediacy just explains a
stale number.

### 20c. Deep muscles are marked, not drawn

The muscle hero rendered five deep muscles (piriformis, iliopsoas, gluteus
minimus, internal oblique, rectus capitis anterior) as filled ellipses inside
their parent. The licensed asset is a *surface* atlas with no geometry for any of
them, so the ellipse was an attempt to draw a muscle that failed at it — and
**four of the eight muscles HoloMotion actually emits are in that set**, so the
instrument's commonest findings were the ones drawn worst.

**Decided:** a ring-and-dot **marker** at a fixed radius, hidden entirely when
unflagged.

**Why:** the marker makes a truthful claim — *this structure, at this location* —
where the ellipse claimed to be its shape. Always-visible markers were the first
attempt and were worse than the blobs: every deep muscle became a grey target
sitting on a healthy structure. A marker is an attention glyph and has to earn
its place.

**Defensibility one-liner:** *"A surface atlas cannot draw a deep muscle, so it
points at one instead of pretending."*

### 20d. Alerts group by recipient

`alertMany` called `sendMail` inside the per-athlete loop. A 15-PDF import where
all 15 landed amber sent **15 separate emails into every medical inbox**, over 15
sequential SMTP round-trips. The burst was already coalesced one layer up —
`queuePostImport` debounces so N commits produce one recompute — and that
batching stopped short of the mailer.

**Decided:** one email per recipient. Medical see every flagged athlete; each
coach sees only their own sport. A single finding keeps its full detail;
multi-athlete digests sort worst-first.

**Why:** an alert that arrives 15 times gets filtered, which makes the feature
worse than not having it. Worst-first because a red buried under six ambers is
the one thing that must not be missed.

**Rejected:** *sport-scope the medical alerts too.* A physio at ISN covers many
sports, so scoping would hide athletes from the people meant to see them.

### 20e. The monthly digest uses a marker, not a cron expression

**Decided:** an hourly tick asking *"is this month still owed?"* against a
`YYYY-MM` marker persisted in settings — no cron library.

**Why:** a cron expression fires at an *instant*. If the process is down at that
instant, the month is skipped with no error, no log and no email; for a monthly
report that means the year quietly has eleven entries. The marker approach is
idempotent (a restart cannot double-send), self-healing (down all of the 1st →
sends on the 2nd), and safe under two instances (the loser sees the month already
recorded). A cron library would have given none of those.

The marker is written only *after* a successful send, so an SMTP failure retries
next hour rather than losing the month — but it **is** written when there are no
recipients, so an empty admin list does not retry hourly for ever.

**Not done:** the holistic PDF is not attached. The report route streams straight
to `res`, so buffering it requires extracting the handler's data-fetching. The
email carries the headline numbers and points at PDF Reports.

**Defensibility one-liner:** *"It asks whether the month is owed, so being switched
off on the 1st delays the report instead of losing it."*

### 20f. One band vocabulary

`BAND_RANK` was defined in three files and `BAND_LABEL` in two. Identical, and
nothing stopped them drifting.

**Decided:** `utils/bands.js` is the single source, with `effectiveBand(screening)`
for the override-wins precedence.

**Why:** the repetition was not the problem — the drift was. A divergent
`BAND_RANK` makes "worse than" disagree between the alert threshold and the
period comparison, so an athlete is flagged in one place and not the other. A
divergent `BAND_LABEL` makes two emails call the same band different things.
Neither raises an error. Same failure mode as §19.

The inline `overrideBand || overallBand` was initially left alone at its ~20
pre-existing sites — it cannot drift to a wrong *value*, only be written
backwards. On JC's instruction all **14** remaining ones (six files: the athlete,
coach, cohort, screening and report routes, plus `pdfDraw`) now call
`effectiveBand`. The mechanical win is small; the real one is that the
override-wins precedence is no longer *restatable*, so a future reader cannot
introduce a backwards copy by pattern-matching the neighbouring line. It also
made every call null-safe, where the inline form threw on a missing screening.

### 20g. The digest attaches the report by sharing it, not by rebuilding it

The monthly digest carried headline numbers and pointed at PDF Reports. The
holistic report was composed **inline in its route handler, straight onto `res`**
— which is exactly what made it unattachable: a stream already handed to Express
cannot also be put in an email.

**Decided:** extract `holisticData(query)` (fetch) and `drawHolistic(doc, data)`
(draw) into `utils/holisticReport.js`; the route still streams, and
`renderHolisticPdf()` buffers the same drawing for the mailer.

**Why not just write a smaller report for the email:** two generators meant to
agree is the §19 failure mode with a month's latency on discovering the drift. The
email and the download now cannot disagree, because they are the same code.

**Verified byte-identical** against the previous handler across four query shapes
(unfiltered, month grain, sport+focus, gender+programme) before anything else was
changed — a faithful extraction has to be *demonstrated*, not asserted, when the
old code is about to be deleted.

**Decided:** a render failure downgrades the digest to summary-only, and the
wording follows what actually got attached.

**Why:** cancelling the email would lose the report *and* the numbers, which is
the silent-missing-month failure this feature exists to prevent. And claiming an
attachment that is not there sends the reader hunting for a file — a small lie
that costs a recurring report its credibility.

### 20h. Per-user email opt-out, with the institution switch still on top

The only control over who got mailed was the admin's institution-wide switches.
A physio wanting fewer import alerts could only ask an admin to turn them off
**for everyone** — so the realistic outcome was not an admin edit but an inbox
rule, and a filtered alert is worse than no alert because AIRMS still believes it
was delivered.

**Decided:** `users.notify_prefs`, an **opt-OUT** JSON column mirroring
`User.permissions`. Null means everything on.

**Why opt-out:** an opt-in default would have silenced every notification in the
system the instant the column was added — the worst possible migration for a
clinical alert. Only the opt-*outs* are stored (`{ digest: false }`), so a
notification added later defaults to on rather than inheriting a stale `true`
nobody actually chose.

**Decided:** two gates, in order. The institution setting decides whether AIRMS
sends this kind of mail at all; the per-user preference decides who still wants
it. A user cannot opt *in* to something the institution switched off.

**Why:** it keeps the admin switch as governance rather than a mere default.

**Decided:** the endpoint reads and writes `req.user` only — no id in the path.

**Why:** muting a colleague's clinical alerts would be quietly serious, and the
most reliable way to not allow it is to have no route that can express it.
`sanitizePrefs` additionally refuses keys the caller's role cannot receive, so a
coach cannot write a `digest` preference the UI would never show them.

### 20i. Seasonality reports its own limits

Dr Thung's §6 request — *"is it that particular quarter that they have more
injuries"* — needed the chronological period view folded so every Q3 pools
together. The aggregation is genuinely small.

**Decided:** build it, and have it **decline to name a season below two years of
data** (`yearsCovered`, `sufficient`), with the caveat drawn *before* the table.

**Why:** with one year, *"Q3 is worst"* and *"Q3 is when the weaker squads
happened to be screened"* produce identical numbers. Four quarters with one
visibly worst is exactly the shape a reader converts into a policy decision at a
glance, so the caveat cannot be a footnote. This is the one output in AIRMS whose
plausible failure is a confidently wrong institutional decision.

**Decided:** rank by the **share** of screenings flagged, not the count.

**Why:** ISN does not screen the same number of athletes each quarter, so counts
rank by throughput. In the test fixtures a 4-test quarter with 1 flagged
outranks a 2-test quarter with 2 flagged under counting, and the second is
plainly the worse quarter.

**Rejected:** *month-of-year granularity.* Twelve buckets over ISN's volume is
two or three tests each — it looks like a pattern and is not one. `seasonality()`
accepts a month grain for future use, but `screeningPeriods` pins it to quarters.

**Rejected:** *leaving it as a documented gap.* It was defensible while
"unbuildable", but the aggregation is ~60 lines and the honest version is
self-enabling: it turns into a real reading when the second year of data arrives,
with no code change.

### 20j. Shared dashboard components take an audience and a tense (2026-08-11)

The history views (athlete Screening History; the medical/coach date picker) reuse
the dashboard components — deliberately, so all roles read one verdict. What came
with the reuse was the dashboard's **copy**, which is written for one context and
asserts things that are false in the other.

**Decided:** `OverallRiskBadge`, `ScreeningAlertBanner`, `ScreeningPanel` and
`BodyMap` take `historical`, and the hero also takes `audience`. Wording only —
band, indicator, factors and geometry are whatever that screening recorded.

**Why `historical`:** "Current Status" over a screening from March asserts
something the system does not know, and "before your next high-load session"
instructs about a session that has already happened. Worst of the set was Training
Focus, which prescribes corrective exercises: from a superseded screening, that is
not stale wording but stale *advice*.

**Rejected:** *hiding Training Focus in history.* "What did that screening say to
work on" is a fair question to ask of history. It is retitled *Training Focus at
This Screening* and its footnote says to work from the latest screening — the
block stops instructing rather than disappearing.

**Why `audience`, which was a real bug and not a wording preference:** `HERO_MSG`
was second-person only, so the **medical and coach dashboards told the clinician
that *they* were among the athletes most in need of attention, and to arrange an
assessment with *their* medical team**. Present on every staff view of a flagged
athlete, and it reads plausibly until you notice who is holding the screen. Found
by reading the rendered hero text per role, not by review — `ScreeningAlertBanner`
had had an `audience` prop all along, which is exactly why the hero's absence went
unnoticed.

Both defaults follow `ScreeningAlertBanner`: `audience` defaults to `'staff'` and
the athlete views pass `'self'` explicitly. One default across the shared
components, so "which way round is it again?" never costs a bug.

The phrasing itself is single-sourced in `lib/screeningAlerts.ts`
(`screeningRef`, `HISTORICAL_NOTE`) because three components have to agree — a
fourth divergent copy is the §19 failure mode.


## 21. Showing the printed score, not the derived one (2026-08-11)

JC, looking at the hero: *"Tell me what this indicator is"* — then *"is there no
other way to show this? Like just straight using the total score?"* That the owner
of the project had to ask what his own headline number meant is the finding; the
number was `50 + z x (50/3)`, a linear remap of a z-score, presented as if it were
a measurement.

### 21a. What HoloMotion's Total Score actually is

Established against the three 1:1-verified real reports, not from the vendor's
marketing (they publish no formula and no norms — checked their assessment,
technology and healthcare pages):

**Total Score is the mean of the Physical Fitness Subitem table** (5 regions x
{ROM L/R, Stability L/R, Symmetry}). It predicts the printed gauge to within ~1
point on all three reports (residuals -0.9 / -1.2 / -0.1); no other combination
came close.

**It excludes injury risk.** The report is titled *"Report of Physical Quality and
Exercise Risks"* — two halves, and Total Score sits under the first. In the real
data Total Score is flat at **77 / 78 / 78** while the worst risk indicator climbs
**23 -> 26 -> 29**.

**And it is not age- or sex-adjusted.** Thung is **51 and scores 77**; Nazwan is
**21 and scores 78**. On the raw number an elite 21-year-old and a 51-year-old are
indistinguishable — which is precisely what a cohort norm exists to fix, and it is
evidence from ISN's own reports rather than a hypothetical.

**Rejected: raw Total Score as the verdict.** Blind to injury risk in a system
named for injury risk, unadjusted for age or sex, and a black box we could not
defend in viva. It would also reduce the project to import-and-display: the
cohort norm is the contribution.

**Discarded as evidence:** the correlation between Total Score and the indicator
across the 58 screened athletes (r = 0.35). The seeder draws Total Score and the
risk indicators as *independent uniform randoms*, so that number measures the
seeder. Recorded because it is exactly the sort of figure that would collapse
under questioning.

### 21b. What the hero shows now

**Decided:** the printed **Total Score** is the headline; the 0-100 indicator is
retained internally (ranking, alerts, report ordering, coach table) and no longer
displayed.

**Why:** Total Score is the one value a clinician can check against the PDF in
their hand — a real trust win with Dr Thung — and it needs no explanation.

**Decided:** in place of the abstract score, a **signed per-component comparison**
against the athlete's cohort, and a **two-sided reason list**.

**Why:** the same z-scores, in units people already read. The case that settled it
is Nazwan: Total Score **+0.3** against his squad (dead average), stability
**+6.0** and symmetry **+6.3** *above* it — and amber because his **ROM is 7.8
below** his peers. The old hero said "47/100" and "below cohort average"; neither
could say that, and it is the only thing a clinician would act on.

**The trap this had to avoid:** showing a *positive* Total Score delta beside an
amber band reads as a contradiction — the same "competing verdicts" failure that
got ACWR pulled (2026-07-16). The per-component profile is what resolves it: the
delta that explains the band is visible, not just the headline one.

**Decided:** all deltas are **oriented** — positive always means better than the
group, on every row — and the copy says "better/worse than", never
"above/below".

**Why:** two components (`riskGood`, `balance`) are stored negated so that higher
= better for scoring. Left raw, the panel showed a clinician an injury-risk group
mean of **-14.1**, and the first draft of the reason text read *"Injury risk 4.9
below the group"* for an athlete at 19 against a group mean of 14.1 — the exact
opposite of the truth. Both were caught by reading the rendered page, not by
review. Test-pinned in `overallIndicator.test.js`.

**Decided:** reasons and escalations are **different things**. The rules look only
at the composite z, the bottom-k rank and the exercise-risk indicators, so a
single badly-below component escalates nothing: Nazwan's ROM sits 1.45 SD under
his squad with an empty escalation list. The panel therefore also names any
component at or below -1 SD, derived in the frontend from the deltas already sent.
The **band is untouched** — showing "no reasons to assess" for that athlete would
have been worse than the opaque score it replaced.

**Persisted, not derived on read:** `cohortZ`, `cohortRank`, `cohortSize`,
`cohortLabel`, `cohortDeltas`, `reasonsAgainst`. All but the last were already
being computed inside `recomputeIndicators` and thrown away. Persisted for the
same reason every other derived value here is: norms move when cohort membership
changes, so a screening must carry the comparison it was actually scored against.

### 21c. The below-mean rule became a cutoff

**Decided:** the below-cohort-mean escalation fires at `escalation_below_mean_z`
(default **-0.5 SD**), not at any `z < 0`.

**Why:** a sign test flags half of every cohort *by construction*. Measured: 27 of
58 tripped it, and **12 of the 14 ambers rested on it alone**, one at z = -0.163.
"Lost a coin toss" is not a clinical finding, and the moment the reasons became
visible a clinician would have asked why half the squad was flagged. Recomputing
moved the seeded distribution from 29/14/15 to **41 green / 13 amber / 4 red** —
which also retires the long-standing "red-heavy band distribution is a seed
artifact" note.

**Cost, stated:** the demo numbers changed materially, and 23 athletes moved band.
Worth knowing before viva.

### 21d. One indicator payload

`toIndicator` was hand-built in three routes. They had already drifted — the coach
payload silently dropped the clinician override, so a coach saw the generic band
message where the override card had promised them the clinician's note. Nothing
errored; the coach just got worse information. Adding six fields to three copies
was the moment to extract `utils/indicatorPayload.js`. §19 again.


## 22. A pinned norm set, not just a saved one (2026-08-11)

JC: *"I believe I asked for a like pinned or saved cohort norm no? Do that
properly."* He had, and what shipped in B1 (2026-08-03) was half of it.

**What existed:** save the current norms under a name, list, rename, **restore**,
delete. That is an *archive* — a manual undo.

**What was missing, and what makes it a pin:** nothing marked a saved set as the
one **in force**. `recomputeCohorts` overwrote `stats` on every import, so the
norm every athlete is scored against moved whenever a report landed. AIRMS claims
norms are "institution-governed (approved, versioned, auditable)"; without a pin
that was only true *between* imports.

### 22a. Pinning is a rule about recompute, not a label on a row

**Decided:** `pinned_norm_version_id` in settings, and `recomputeCohorts` holds
`stats`/`n` while it is set.

**Why not a flag on the version row:** the flag would have been decoration. The
behaviour that matters is the *recompute skipping the write*, so the pin lives
where the engine reads it.

**Decided:** pinning REUSES the restore installer (`applySnapshot`). "In force"
means the live `cohort_thresholds` rows genuinely are the snapshot.

**Why:** the scorer keeps reading one table. The alternative — teaching the scorer
to consult a pinned snapshot — would have created a second place that decides
which numbers apply, which is §19 with clinical consequences.

### 22b. A held norm must say how stale it is

**Decided:** while pinned, recompute still calculates and parks the answer in
`freshStats`/`freshN`/`freshAt`; `pinDrift()` reports the gap per component,
worst-first, plus the change in cohort size.

**Why:** a pin freezes the baseline, which is the point (one reference for a
season) and the danger (it silently ages). A frozen number with no way to see how
far reality has moved would be worse than no pin at all. Drift is measured against
the norm **actually in force**, so a manual override layered on a pinned snapshot
is what gets compared — comparing against the raw snapshot would report a gap
nobody is scored against. Test-pinned in `cohorts.test.js`.

**Decided:** `freshStats` is CLEARED when nothing is pinned.

**Why:** unpinned, `stats` *is* current, so the comparison is always zero. A stale
non-null value would leave the UI drawing a drift badge for a norm that has none.

### 22c. Three refusals, each protecting a specific lie

- **Restoring a different version while pinned → 409.** It would install one set of
  numbers and leave the pin naming another, so the page would claim norms are held
  to a version the athletes are not scored against.
- **Deleting the pinned version → 409.** The live rows would stay frozen with
  nothing to say what they are frozen *to*.
- **A cohort that appears after the pin is still created live**, flagged
  `addedSincePin`. It cannot be in the snapshot, and refusing to create it would
  leave its athletes with no norm and therefore no score at all — the pin must not
  be able to make an athlete unscoreable.

The banner sits at the TOP of the Cohort Norms page rather than in the versions
card, because a pin changes what every number below it *means*.

### 22d. A NOT NULL column that made "release" impossible

Verifying against the live database turned up a real bug: `Setting.value` is
`allowNull: false`, so `setSetting('pinned_norm_version_id', null)` threw — the
unpin endpoint would have 500'd every time.

**Fixed by making a null write DELETE the row.** Absence is the more honest
representation of "no value" anyway: `getSettings` falls back to `DEFAULTS`, so a
deleted row and a never-set row behave identically. Found by exercising the
feature end to end, not by review — the code read fine.


## 23. Charting what the instrument actually measures (2026-08-11)

JC, after two rounds of visual work: *"I am still not satisfied with the graphics
and charts used for the dashboard. Think what they really need to extract from the
Holomotion PDF, then build it."*

The previous passes fixed how things were DRAWN. This one asks what should be
drawn at all, from the source document rather than from what happened to be in
the API already.

### 23a. What the report contains, against what AIRMS used

| HoloMotion produces | AIRMS did with it |
|---|---|
| Total Score, ROM / Stability / Symmetry gauges | shown everywhere |
| 7 exercise-risk indicators | radar, threshold strips, admin ranked bars |
| Muscle imbalance lists | body map, admin bars |
| **25-cell subitem table** (5 regions × ROM L/R, Stability L/R, Symmetry) | printed as raw numbers on an individual; **the admin dashboard aggregated none of it** |
| **Left vs right, in every region** | **no dashboard visual at all** |

The subitem table is the densest thing the instrument produces — Total Score is
literally its mean (verified against three real reports, residual ≤ 1.2) — and the
squad-level view ignored it entirely while aggregating the seven summary
indicators derived from it.

### 23b. Left–right asymmetry was the real omission

It is the only bilateral data the report carries, it is what a movement screen
exists to find, and AIRMS collapsed it three separate ways: the body map paints a
region by the WORSE of L/R, the cohort composite averages every gap into one
`balance` number, and the subitem table prints L and R side by side and leaves the
subtraction to the reader.

The magnitudes in the verified reports are not marginal:

| athlete | region | ROM L / R | gap |
|---|---|---|---|
| Thung | Neck | 95 / 62 | **33** |
| Elffie | Neck | 86 / 71 | 15 |
| Elffie | Pelvis | 53 / 66 | 13 |
| Nazwan | Neck | 83 / 72 | 11 |

**Decided:** a matrix heatmap for the 5 × 5 table, and an asymmetry panel, both on
Screening Analytics, fed by a new `utils/subitemAggregate.js`.

**Decided: the asymmetry panel counts ATHLETES, it does not average gaps.** Looking
at the aggregate decided this. The mean gap is flat at 3–4 points across every
region and metric — it carries almost nothing. The number of athletes with a gap of
10+ runs from 0 to 9 and separates ROM from stability cleanly. A panel built on the
mean would have looked precise and said nothing.

**Decided:** the threshold is 10 points — one full HoloMotion band, since the
instrument's own boundaries are 60/75/85. Below that, screening noise and ordinary
handedness are not separable, and flagging them would bury the Thung-sized
findings.

**Decided:** report the mean ABSOLUTE gap and the mean SIGNED gap, and only name a
weaker side when the squad tips the same way. A squad split between left- and
right-dominant athletes has a large absolute gap and a signed mean near zero —
that is a technique or screening story, not a shared weakness, and reporting one
number without the other would hide the difference.

### 23c. A field name that was the wrong way round

The "which side" field was first called `leans`, and it returned `"right"` for a
squad scoring 95/62 in favour of the LEFT. Both readings of the name are
defensible — "leans left" means either "left is stronger" or "the deficit is on the
left" — which is exactly why it was wrong to use. Renamed `weakerSide`, which is
the thing a clinician acts on and has only one meaning.

Caught by a test written against the real reports rather than invented fixtures.
The same test run corrected two of my own wrong expectations about which cell is
weakest, which is the argument for using real data as fixtures.

### 23d. No charting library, despite being offered one

JC explicitly permitted libraries. A heatmap and a shared-axis count chart are
about forty lines of CSS each; Chart.js has no native heatmap at all and would
need a plugin, it would add roughly 70 KB to a page that currently ships 117 KB,
and it would reverse the E1 decision that removed it from this page on 2026-08-04.
The honest answer was that these two shapes do not need one — the reach for a
library would be for something like interactive zoom over a long time series,
which nothing here asks for.

**Caveat, stated because the seeded demo hides it:** the seeder draws subitem
cells uniformly at random, so the matrix reads flat at 75–76 and no weaker side is
ever named. The real reports vary hugely. The asymmetry COUNTS carry signal even on
seeded data (9 athletes at the pelvis, 0 for stability anywhere); the heatmap will
not look like much until real HoloMotion PDFs are imported.


## 24. The period chart: a continuous axis, and admitting when a grain is useless (2026-08-11)

JC: *"The monthly quarterly yearly one still needs work. Go research how other
websites do it."*

Researched, and the answer was not a better-looking bar. The data explains the
complaint entirely: monthly gives 5 periods (4 / 17 / 34 / 21 / 1), quarterly
gives 2, yearly gives 1. **No chart makes a single data point impressive.**

### 24a. A continuous axis

Standard practice, stated plainly by the sources: *"On a continuous date axis each
period is accounted for whether data exists for that period or not, which clearly
shows periods missing a transaction, whereas discrete date axes hide missing
values."*

AIRMS bucketed only the periods that HAD screenings. A quarter in which nobody was
screened vanished, and the quarters either side sat adjacent as though
consecutive. For a screening PROGRAMME that is backwards — an unscreened period is
not absent data, it is the finding.

`bucketByPeriod` now fills the calendar between the first and last period that has
data. Nothing is invented before the first screening or after the last: a gap means
"we ran the programme and tested nobody", whereas padding earlier would assert a
period before the programme existed.

**Consequence, deliberately accepted:** a period following a gap no longer reports
a delta. Its predecessor is now the empty period, whose averages are null. That is
more honest than the old behaviour, which compared Q4 against Q1 and presented the
difference as a quarter-on-quarter move. The test that asserted the old skipping
behaviour was rewritten rather than deleted, and says why.

### 24b. One period is not a trend

**Decided:** a single period renders as a SUMMARY — the figures, the band split,
and an explicit sentence that there is nothing to compare against — not as a lone
column under a "Direction of travel" heading.

**Why:** the previous version drew one bar and printed an apology underneath. The
apology was the honest part; the bar was decoration pretending to be a chart.

### 24c. Say which grains are worth clicking, before they are clicked

**Decided:** `grainCounts` travels with every periods response, and each grain
button carries how many periods it would draw ("5 periods" / "2 periods" /
"1 period"). A grain with none is disabled.

**Why:** this is the actual fix for the complaint. Quarterly and yearly look
disappointing because they ARE disappointing for four months of data — that is a
property of the dataset, not of the rendering. The guidance is to align
granularity with what is being reviewed; the interface can simply say so, and then
the user picks Monthly knowing why rather than clicking through three views to
find out.

### 24d. What was researched and NOT adopted

- **Padding to a fixed window** (last 12 months / 8 quarters), which several
  dashboards do to keep a constant footprint. Rejected: it would draw quarters
  before ISN's programme began as though they were unscreened, which is a
  different and false claim.
- **Switching to a line chart past ~20 periods.** Sound advice, and not yet
  reachable — the trend strip caps at 6 periods and the activity page has 5. Noted
  for when a second year of data exists rather than built speculatively.


## 25. Three graphics that show what an average cannot (2026-08-11)

JC: *"I want a new graphic."* Offered three, he said **"Everything"**. All three
answer the same complaint from different directions: this page was entirely
composed of AVERAGES, and an average cannot describe a population.

### 25a. Squad body map — the same figure, at cohort level

The admin dashboard had **no anatomical view at all**, in a product whose entire
vocabulary is body regions and which already licenses a body map used per athlete.

**Decided:** feed the cohort's mean subitem table into the existing `BodyMap`
rather than building a squad-specific figure.

**Why:** the clinician and the administrator then read the same picture at
different scales, and there is no second anatomical component to keep in step with
the first. The muscle-flag mode lights a muscle if ANYONE in the cohort was
flagged for it, with side `'B'` — a squad has no single left or right, and the
per-muscle counts already live in the two ranked lists above it.

### 25b. Risk vs movement quality — the athlete no single number surfaces

**Decided:** a scatter, one dot per athlete, Total Score against Exercise Risks,
quadrants split on the cohort MEDIANS.

**Why:** these are the two halves of the report and they measure different things —
§21 established that HoloMotion's Total Score excludes injury risk entirely. An
athlete can therefore move well and still score risky, and no averaged panel will
ever show them. On the seeded cohort the top-right quadrant holds **13 athletes**,
including one at Total Score 90 with Exercise Risks 30.

**Why medians, not fixed cut-offs:** a fixed line would call an entire strong squad
high-risk, or an entire weak one safe. The quadrant has to mean "high for this
group", which is the same argument the cohort norm rests on.

### 25c. Distribution — the shape averages destroy

**Decided:** a histogram of the cohort indicator with the average marked.

**Why:** a mean of 50 is produced equally by everyone sitting on 50 and by half the
squad at 30 and half at 70. Those are different squads and different decisions, and
every other panel on the page renders them identically. The indicator is relative
by construction so the centre always sits at 50 — the SPREAD is the entire point,
and the panel says so rather than letting the flat centre read as a finding.

### 25d. Still no charting library

Same conclusion as §23d, re-examined for these three shapes: a scatter is absolute
positioning, a histogram is flex children with heights, and the body map already
exists. Chart.js would have added a dependency to draw two of the three worse and
could not draw the third at all.

**Cost, stated:** the analytics response now carries one row per athlete
(`points`) rather than only aggregates — 58 rows here. Server-side binning would
have been smaller but would fix the bucket edges, and the client legitimately
wants to move them.


## 26. Two periods and one period get their own chart types (2026-08-11)

JC: *"Just find a better way to present the quarterly and yearly part of this."*

§24 made the sparse grains HONEST — a continuous axis, a summary instead of a lone
bar, grain buttons that declare their own thinness. It did not make them USEFUL.
Two throughput columns still showed one number each and left the reader to do the
subtraction; a single period still showed one number and an apology.

The fix is that two periods and one period are different chart problems, and
neither of them is a time series.

### 26a. Exactly two periods → the CHANGES, not the values

With two points there is no trend to trace; there is a BEFORE and an AFTER, and
the comparison is the entire content. So the chart inverts: instead of one metric
(headcount) across two columns, it draws every metric as a line between the two
periods.

On the current data that immediately says something the columns could not:

| metric | Q2 → Q3 | |
|---|---|---|
| ROM | 77.6 → 72.4 | **−5.2 declining** |
| Stability | 75.4 → 78.0 | **+2.6 improving** |
| Overall indicator | 50.8 → 48.6 | −2.2 declining |
| Exercise risks | 18.2 → 20.5 | +2.3 declining |

Range of motion fell while stability rose. Two headcount bars cannot express that
at all, and it is the only thing on the panel a programme lead could act on.

**First attempt, and why it failed.** This shipped as a SLOPEGRAPH — every metric
as a line between the two periods on one shared vertical scale, so the steeper
line would be the bigger move.

It was unusable, and JC sent a screenshot saying so. A shared scale only works
when the metrics are COMMENSURABLE, and these are not: Total Score, ROM,
Stability and Symmetry cluster at 72–78, the overall indicator sits at ~50 by
construction, and exercise risks live at ~18 on a scale that runs the other way.
Forced onto one axis the four movement scores collapsed into a few pixels of
overlapping lines with labels printed on top of each other.

**That is the same mistake already documented in §23** — a 0–100 track flattening
four values that differ by 2.8 points — reintroduced two sections later by the
same reasoning ("one scale so magnitudes compare") applied where it does not hold.

**Decided instead:** plot the CHANGES on a shared delta axis with zero in the
middle, and print before → after as text.

**Why this works where the slopegraph did not:** the values are incommensurable
but the changes are not — every delta here falls between −5.2 and +2.6 points, the
same unit and the same order of magnitude. A shared scale is legitimate for the
deltas precisely because it was illegitimate for the levels.

**Decided:** bar direction is the ORIENTED gain — right is always better, on every
row — while the printed number keeps its true sign.

**Why:** exercise risks rose 18.2 → 20.5, which is worse. A sign-driven bar would
draw that to the right alongside the genuine improvements. The bar answers "better
or worse", the number answers "by how much", and neither has to lie for the
other.

**Decided:** colour also comes from the API's `direction`, never from the sign of
the delta.

**Why:** exercise risks improve by going DOWN. A sign-based colour paints that
decline green and the genuine improvement red — the same trap already documented
for the delta arrows (see the `Move` component's comment on the activity page).
The API also classifies small moves as "steady", so noise does not get painted as
a finding.

Rows are sorted biggest-mover-first, because the reader wants what changed rather
than the metric list in schema order. The throughput rows stay underneath as
context: the changes say WHAT moved, the rows say how many athletes it was
measured on, and 22 athletes is a materially weaker basis than 43.

### 26b. Exactly one period → what it is made of

A year of four months of screening is one number. Nothing rescues one number —
but that year is MADE of quarters, and those are real content.

**Decided:** `screeningPeriods` returns a `composition` — the same rows bucketed
one grain finer (year → quarters, quarter → months). A single-period view shows
its own breakdown.

**Why:** the previous version told the reader to go and change the grain
themselves. Showing the finer buckets in place is the same information, one click
earlier, and turns a dead panel into the answer they were leaving to find.

Suppressed when the finer breakdown is also a single bucket, since a "breakdown"
of one row is the same dead panel with an extra heading.

---

## 27. A detectable-change threshold, or an admission that there isn't one (2026-08-12)

Every direction-of-travel verdict in AIRMS ran off one constant. `directionOf()`
took `noise = 2`: a score that moved 2 points or more had changed, less than 2
was "steady". The change chart, the between-tests panel, seasonality's
worst-quarter ranking and the coach's arrows all consumed it. Nothing derived
it. On a 0-100 scale, 2 was a guess - and it silently decided which athletes a
clinician is asked to look at.

**This is the standing criticism of the entire category, not a local oversight.**
Robertson, Bartlett & Gastin (*IJSPP* 12(s2), 2017), reviewing traffic-light
decision-support systems in team sport, put "establishment of evidence-based
guidelines related to the determination of benchmarks and baselines and the
subsequent boundaries used for categories" on their future-work list. A viva
question of the form "where did that threshold come from?" was unanswerable.

### What replaced it

`utils/reliability.js` computes, per score, from the repeat screenings already
in the database:

```
typical error   TE    = SD of the within-athlete differences / sqrt(2)
minimal detectable change
                MDC95 = 1.96 x sqrt(2) x TE   ( = 2.77 x TE )
```

MDC95 becomes the dead band. A change smaller than it cannot be told apart from
measurement noise at 95% confidence, which is the standard construction in the
musculoskeletal reliability literature (published MSK examples land around
4.8-6.1 points on comparable scales - i.e. potentially double the old guess).

### Two properties that are deliberate, not limitations

**It is an upper bound and says so.** A true test-retest needs two measurements
close enough together that nothing real changed. AIRMS only has screenings
months apart, which contain genuine change *on top of* measurement error. That
inflates the SD, so the resulting MDC95 over-estimates the instrument's error.
That errs toward calling real changes "steady" - under-claiming, not
over-claiming - which is the right direction for a threshold that decides
whether someone gets assessed. Every surface that shows it prints the caveat
rather than presenting a bound as a measurement.

**It declines.** Below `MIN_PAIRS` (20), or when a score never moved across any
pair, it reports `sufficient: false`, falls back to the documented 2, and labels
it *"an assumption, not a measurement"* on screen and in the PDF. Same
discipline as `seasonality()` refusing to name a quarter under two years of data
(section 20i): a confidently wrong threshold here quietly changes who gets seen.

On the seeded data it **correctly declines** - 19 repeat pairs against a floor of
20, and four of the six scores identical in every pair. The floor is not to be
lowered to make a demo produce a number; that would be the original sin with
extra steps.

An SD of zero is refused rather than believed, because a dead band of 0 would
make every rounding wobble a "change". A score identical in every repeat is not
a perfectly reliable instrument - it is an instrument that was not re-measured,
which is the ingestion gap section 26's panel already reports.

### Rejected

- **Lowering `MIN_PAIRS` to 15** so the seeded data derives a threshold. The
  decline *is* the honest output; manufacturing a number from 19 pairs to make a
  demo look better is exactly the failure mode being fixed.
- **Per-athlete direction verdicts on the trend sparklines.** The threshold is
  computed cohort-wide and is not on the athlete-scoped payload, so the
  sparklines show movement and deliberately name no direction. Showing movement
  without labelling it is honest; labelling it from a threshold that is not
  there would not be.

### Smaller decisions in the same pass

- **Rescreen recall** (`rescreenRecall`). Coverage answers "did we test them";
  recall answers "is what we hold still current", which is the question a
  screening programme runs on. Read across **all time**, never the report's
  window - when an athlete was last seen is a fact about the athlete, and
  windowing it would report a screened athlete as never screened. `never` is
  counted apart from `overdue` because it calls for a first assessment, not a
  call-back.
- **Percentile beside rank.** Derived from the rank already computed, so the two
  cannot disagree. Mid-rank `(r - 0.5)/n`, so the best and worst members of a
  group never read as a meaningless 100th or 0th percentile.

---

## 28. The app had no narrow layout, and one line was most of it (2026-08-12)

Driving every route as every role at 360-1280px found the same defect nearly
everywhere: the page scrolled sideways, 245-692px on a phone and up to 277px on
a tablet. ISN's clinicians and coaches are exactly the people who would open
this on a tablet.

Two causes, one structural and one subtle:

1. **No breakpoint for the shell.** `.sidebar` is a fixed 256px column and
   `.main-area` is offset by exactly that margin. The fourteen media queries in
   `globals.css` all governed inner grids; none touched the shell. A 390px phone
   gave the content 134px of usable width.
2. **`min-width: auto` on a flex item.** `.main-area` is a flex child, and the
   CSS default means "never shrink below my content's intrinsic width". It
   measured **671px inside a 390px viewport**. This produced most of the
   overflow - the first round of `flex-wrap` and control-width fixes barely
   moved the numbers, because they were treating symptoms of it.

`min-width: 0` on that column is the fix; below 900px the sidebar becomes a
drawer (menu button, scrim, Escape, closes on navigate) and the margin goes
away. **Desktop is untouched** - the Figma-derived layout is a locked decision
(`MASTER_CLARIFICATIONS section 12`), and this adds a narrow behaviour rather
than changing the wide one. Same reasoning for the login card, which stacks
below 700px instead of shrinking its two panels to ~143px and clipping the
product name mid-word.

Also found: only controls wrapped in `.form-group` were ever styled, so bare
`<select>`s on Reports and Settings rendered at the browser default of 19px next
to styled inputs - visually inconsistent and under the 24px touch-target
guidance. There is an element-level baseline now, which component classes still
override.

**A note on method, because it is the transferable part.** The first three
fixes were guesses at which page was at fault and achieved almost nothing. What
worked was walking the DOM from the widest element up through its ancestors,
printing each one's width and computed `min-width` - the cause was visible
immediately and was two levels above anything the symptom list named. The same
technique found the remaining 9px: a row declaring `flexWrap: 'wrap'` *and*
`flexShrink: 0`, which is self-contradictory.


---

## 29. One type scale, one radius scale, one spacing scale (2026-08-16)

The interface had drifted. Not in any way a reader could name, but measurably:

| | before | after |
|---|---|---|
| distinct `font-size` literals in `globals.css` | **31** | 7 tokens |
| of those, values between 0.62 and 0.95rem | 18 | 4 steps |
| distinct `border-radius` values (excl. pills) | **11** | 4 tokens |
| inline `fontSize` literals in TSX | **160** | 0 |

Eighteen font sizes inside a third of a rem is not a set of decisions. The
difference between `0.74rem`, `0.75rem` and `0.76rem` is invisible to anyone
reading the page, and radii of 2, 3, 4 and 5px are the same non-difference — but
together they guarantee that two cards written a week apart never quite agree,
and that a new component has no size to reach for except whatever looked right
that afternoon.

### The scales

Seven type steps and four radii, both named for **role** rather than measurement
(`--fs-md`, not `--fs-14`), so a component asks for "the caption size" and
inherits any later change to what that means. Spacing follows the same pattern.
Every existing literal was mapped to its nearest step, so nothing on screen
moved by more than a hair — the point was not to restyle anything, it was to
make the next change possible to make consistently.

`--radius` is kept as an alias of `--r-md` rather than deleted: it was already
in use, and two names for 8px is exactly the kind of drift being removed.

### Why the markup mattered more than the stylesheet

The stylesheet was the easy half. The 160 inline `fontSize` literals in the
pages were the real disunity — several of them (`0.85rem`, `0.78rem`) are not
even steps on the scale, so a design system existed in the CSS while the markup
quietly ignored it. A system the markup does not use is not a system.

### Compaction, honestly measured

Card padding, the gap under a card title and the gap between cards were
20/16/20px by habit. They are now `--sp-lg` / `--sp-md`, a step tighter. On a
12-card dashboard that reclaims roughly 70px of a 4,300px page — **about 1.7%**,
which is not the win. The win is that the three numbers now agree and there is
one place to change them. Any real density gain would need a deliberate call
about how tight is too tight, which is a judgement for JC rather than a cleanup.

Nine genuinely dead rule blocks were removed (`.grid-4`, `.grid-2-1`,
`.posture-list`, `.region-chip`, `.seg-btn--minor/moderate/severe` and friends —
mostly leftovers of the injury module deleted in August).

### The mistake this pass made, and the lesson

The dead-rule sweep deleted a rule it should not have. `@media (max-width:
980px) { .grid-1-2, .grid-2, .grid-2-1, .grid-3, .grid-4 { ... } }` collapses
every multi-column page grid to one column on a tablet. Two of its five
selectors were dead, and matching a rule by **any one member of a grouped
selector** took the whole rule with it — so `.grid-3` stayed three columns wide
on a phone and put 115px of sideways scroll back on the Reports page, undoing
part of section 28.

It was caught by re-running the responsive sweep, not by reading the diff. The
lesson is the one that keeps recurring in this file: **a mechanical edit across a
whole file needs a mechanical check afterwards.** An automated audit found the
drift, an automated rewrite fixed it, and only an automated re-measurement
caught what the rewrite broke.

Verified afterwards across five roles and six widths (360-1280px) with controls
exercised: no sideways scroll, no exceptions, no error banners; tap-target
findings unchanged at 11, all of them inline text at its natural line height.


## 30. The reports were read on paper, and three things only paper shows (2026-08-18)

Six generated PDFs were printed and read as documents rather than diffed as code.
Three defects surfaced that every unit test passed straight through, because each
is a property of the *rendered page*, not of the values on it.

### 30a. A bar chart whose longest bar meant "ignore this"

`changeBars` scaled every bar to the largest absolute change on the figure. On
the Programme Activity report every one of the six deltas sat inside the +-2
dead band - so the biggest of them, an overall-indicator move of **-1.8**, was
drawn at the **full half-width of the track** and labelled `steady`.

The most visually dominant element on the page asserted a change that §27 exists
to say is indistinguishable from measurement error. §27 computes the threshold
honestly, declines when the data cannot support one, and prints the caveat - and
then the chart beside that caveat contradicted it.

The fix makes the dead band part of the geometry rather than a footnote:

- the scale includes the dead band (`max = max(|gain|..., deadBand...)`), so a
  sub-threshold change can never reach the end of the track;
- the band is **drawn** as a shaded zone either side of centre, so a bar inside
  it is *seen* to be inside it;
- a bar whose magnitude is below its own dead band is stroked as an **outline**
  instead of filled - present and measured, visibly not claiming to be a move.

When nothing clears the threshold the shading now fills the whole track, which
is the correct reading: this chart found no detectable change anywhere. The
alternative considered and rejected was suppressing sub-threshold bars entirely;
that hides the measurement, and a reader cannot tell "small" from "missing".

### 30b. A value column sized by guess, on a report whose values grew

`bar()` reserved a fixed 50pt for its value text. `58 of 62 (94%)` needs about
70pt at 9pt bold, so on the Programme Activity cover the value wrapped and its
second line landed **on top of the row beneath it** - two KPI rows overprinted.
The value column is now measured with `doc.widthOfString()` and the bar takes
what is left, so a long value shortens the bar instead of colliding with the
next row.

### 30c. The squad had no body

The team report described the group's body twice - a muscle-flag hotspot bullet
list and a numeric heatmap - and drew it never. In a product whose entire
vocabulary is body regions, whose individual report opens with a front/back
figure, and whose Screening Analytics page (§25) added a squad body map for
precisely this reason, the team PDF was the one place a squad had no anatomy.

`squadMuscleFigure` reuses the individual report's licensed figure, fed the
group's **mean** subitem readings. The means come from `aggregateSubitems` - the
same function behind the heatmap printed beside it and behind the analytics page
- so the figure cannot quote a different average from the grid it sits above.
The tier key was extracted out of `squadSubitemHeatmap` into `tierLegend` rather
than written a second time, for the same reason.

On the seeded Badminton squad this immediately reads as a finding the bullet
list did not carry: the squad is "Good" almost everywhere and **amber at the
pelvis/gluteal region**, visible without reading a number.

The caveat is drawn with it, because a group mean is not a group: a region can
read amber because a few athletes score badly, so the caption sends the reader
to the attention table rather than letting the figure stand as a squad verdict.

### 30d. The flagship report was the least drawn one

Asked afterwards whether the reports were "optimised", the honest answer needed
a measurement rather than a memory — so each report was audited for which of the
17 drawing primitives it actually calls.

The **holistic** report used four. It is the institution-wide document, the one
an executive opens and the one the monthly digest **attaches** — and it printed
the period series as a table where the Programme Activity report draws a
throughput chart, and the between-tests averages as a list of signed numbers
where that report draws the change chart. Same data, same toolkit, two
presentations, and the weaker one on the more widely-read document.

Both are now drawn there, chart-then-table, in the pairing the sibling report
already justified in a comment: the chart answers "is this going up" at a
glance, the table is what someone quotes in a meeting, and neither replaces the
other.

The general lesson is the §19 one wearing different clothes. Two report
generators drawing the same data will drift, and the drift is invisible from
inside either one — it shows up only when something compares them. Here that
something was a per-report inventory of toolkit calls, which is cheap and worth
repeating whenever a drawing primitive is added.

**What this says about testing here.** All three defects lived in code with
passing tests, and none was a wrong number - a collision, a scale and an absence.
`pdfDraw.test.js` renders headlessly and asserts bytes, which catches crashes and
regressions but cannot see a layout. Reading the printed artifact remains the
only way these are found, and it is worth doing before the viva rather than
during it.

## 31. Optimising by measuring first, and finding the duplication instead (2026-08-18)

Asked to "optimize all the code", the honest first step was to find out whether
there was anything to optimise. There largely was not - and saying so is part of
the result.

**What was measured, and found healthy.** A scan for sequential `await`s inside
loops returned eight, of which seven are deliberately serial: SMTP pacing in
`alerts.js`, pdfjs page rendering, and the documented batch import
(`screeningUploadStore`). No N+1 query exists anywhere - `recomputeCohorts`
already preloads its rows in one `findAll` with a comment saying why. Every model
already declares `indexes`. And the live dataset is **62 athletes and 77
screenings**: micro-optimising array passes over 62 rows would have been theatre,
producing churn in a graded artifact and defending nothing at a viva.

So no performance work was done, because none was warranted.

**What was actually wrong: one clinical decision, written out eight times.**

The seven shown exercise-risk indicators were declared independently in five
backend files (`cohorts.js`, `overallIndicator.js`, `cohortFocus.js`,
`routes/athletes.js`, `pdfDraw.js`) and three frontend ones
(`screeningAlerts.ts` twice, `ScreeningPreview.tsx`). `routes/athletes.js` was
the clearest symptom: it held an inline copy *and* imported the shared list, and
used one in each of two handlers.

This is not a display detail. The list encodes Dr Thung's instruction that
`spinalDiscHerniation` (Lumbar Disc Herniation) is stored but never scored,
charted, printed or named - ISN cannot perform that assessment. "Which
indicators are shown" and "LDH is excluded" are the same decision, so it had
eight independent chances to go wrong, and its failure mode is silent: a leaked
indicator renders as an ordinary row.

Every copy carried a comment pointing at the others - *"Mirrors SHOWN_RISK_KEYS
in cohorts.js"*, *"the keys and their order are identical ... so INDICATORS
remains the one place deciding WHICH indicators are shown"*. The second is from
`RADAR_AXES`, and it was false precisely because `RADAR_AXES` existed. The
comments documented the hazard; they could not prevent it.

`utils/riskIndicators.js` (backend) and the extended `INDICATORS` (frontend) are
now the single definitions, one per package - the same shape as `bands.js` /
`bands.ts`, because there is still no shared types package. Two label
vocabularies are preserved deliberately, since they are not synonyms: the terse
UI wording ("Knee") and HoloMotion's own printed wording ("Ligament Strain"),
which exists so a clinician can check a printed line against the report in their
hand. `EXCLUDED_RISK_KEYS` names the exclusion as a value, so the constraint can
be asserted rather than left as an absence nobody checks.

**Verification.** The team report was regenerated and diffed against the
pre-refactor bytes: identical apart from the 66 bytes of embedded creation
timestamp. `riskIndicators.test.js` and `screeningAlerts.indicators.test.ts` pin
the two packages to each other and assert the LDH exclusion across every derived
view.

### 31a. The branding panel that was four addresses

The ISN panel of the split auth card - logo, tagline, institute name, postal
address - stood as identical markup in all four auth pages. Identical is the
problem: the address was hardcoded four times, so changing it would have updated
one page and left three stale, on the only screens an outside visitor sees.

Extracted to `components/auth/LoginBrand.tsx`. The split login card is a locked
Figma-derived design, so this had to be provably invisible: all four pages were
screenshotted at 1280px before and after and compared byte-for-byte - **all four
pixel-identical**. One copy instead of four, not a redesign.

**What was left alone, deliberately.** 31 exported-but-unreferenced symbols were
found; most are internal-only exports whose functions are live (`runDigestOnce`
and `runReminderOnce` are called by the scheduler's own tick - deleting them on
the strength of a usage scan would have silently killed the digest and the
rescreen reminder), and several are named in `CLAUDE.md`. Trimming them is
cosmetic and carries more risk than value. `AcwrGauge` and `WorkloadChart` show
as unimported and are retained on purpose for the ACWR rebuild path.

---

---



*Last updated: 2026-08-18 (later) - **31** added: an optimisation pass that measured first and found no performance problem to fix (no N+1, indexes present, 62 athletes and 77 screenings), then fixed the real one - a single clinical decision, the seven shown indicators and the LDH exclusion that rides with them, hand-maintained in eight places whose comments pointed at each other; now one definition per package, pinned by tests, verified byte-identical output. Plus the auth branding panel that was four copies of the institute's address, extracted and proven pixel-identical. Previous: 2026-08-18 - **30** added: six reports were printed and read as documents, finding three defects no unit test could see - a change chart whose longest bar was a sub-threshold move labelled "steady" (the dead band is now drawn, and bars inside it are outlined rather than filled), a fixed-width value column that overprinted the row beneath it, and a team report that described the squad's body twice in words and drew it never (the squad body map, fed the same means as the heatmap beside it). Previous: 2026-08-16 - **29** added: the interface was put on one type, radius and spacing scale - 31 font-size literals and 11 radii collapsed to 7 and 4 tokens, and the 160 inline font sizes in the markup that had been bypassing the stylesheet entirely; nine dead rule blocks removed; and a note on the grouped-selector regex that deleted a live responsive rule in the process. Previous: 2026-08-12 - **27** and **28** added: the improving/steady/declining dead band is now a DERIVED minimal detectable change (typical error from repeat screenings) that declines and says so when the data cannot support one, plus rescreen recall, per-athlete trend sparklines and percentile framing; and the app gained a narrow layout at all, the bulk of the sideways scroll tracing to `min-width:auto` on one flex column. Previous: 2026-08-11 (really final) — **§26** added: two periods draw a CHANGE CHART, one diverging bar per metric on a shared DELTA axis (this shipped first as a slopegraph and was scrapped the same day: a shared VALUE scale across non-commensurable metrics collapsed the lines into overlapping pixels) — which is how "ROM fell 5.2 while stability rose 2.6" became visible at all) and one period shows the finer buckets it is composed of instead of a number and an apology. Previous: 2026-08-11 (final) — **§25** added: three new graphics on Screening Analytics — a cohort-level squad body map reusing the licensed figure, a risk-vs-movement scatter with median-split quadrants (which finds 13 athletes who move well AND score risky, invisible to every averaged panel), and an indicator distribution histogram. Previous: 2026-08-11 (last of the day) — **§24** added: the period chart now draws a CONTINUOUS calendar axis (an unscreened period is the finding, not an absence), renders a single period as a summary rather than a lone bar, and labels each grain with how many periods it would draw so quarterly/yearly announce their own thinness before being clicked. Previous: 2026-08-11 (later again) — **§23** added: the admin dashboard now charts the 25-cell subitem table as a matrix and, for the first time anywhere in AIRMS, surfaces LEFT–RIGHT asymmetry — the only bilateral data the report carries, previously collapsed three different ways. Counts rather than mean gaps, because the means are flat and the counts are not. Previous: 2026-08-11 (later still) — **§22** added: cohort norms can now be PINNED, not merely saved — a pinned version is held against imports, reports its own drift from what the data would say, and cannot be deleted or restored over while in force; a NOT NULL settings column that would have made release impossible was found and fixed by live verification. Previous: 2026-08-11 (later same day) — **§21** added: the hero now shows HoloMotion's printed Total Score with a signed per-component cohort comparison and a two-sided reason list, the derived 0-100 indicator having been the thing nobody could explain; the below-mean escalation became a -0.5 SD cutoff rather than a sign test; one shared indicator payload. Previous: 2026-08-11 — **§20j** added: the shared dashboard components now take `historical` (so the history views stop speaking in the present tense) and the risk hero takes `audience` — the latter fixing a live bug in which the medical and coach dashboards addressed the clinician as the at-risk athlete. Previous: 2026-08-10 (later same day) — **§20g–i** added: the digest attaches the holistic report by sharing its code rather than rebuilding it (fetch/draw extracted, verified byte-identical), per-user email opt-out under the institution switch, and seasonality that declines to name a season below two years of data. **§20f** revised — the 14 remaining inline band-precedence reads were migrated after all. Earlier same day: **§20** added: accountability (audit trail that copies the actor, fire-and-forget writes), immediate norm eligibility with one-time disclosure, deep muscles marked rather than drawn, alerts grouped per recipient, the monthly digest's marker-not-cron design, and one band vocabulary in `utils/bands.js`. Previous: 2026-08-06 (later same day) — **§19** added: one status palette across CSS, inline styles, Chart.js and the PDF reports. An audit found the PDF had a second band palette (and disagreed with its own tier colours), the radar's threshold red was a non-theme-aware literal, the 60/75/85 tier was defined five times with two different words for its lowest band, and eight CSS-variable fallbacks still carried the retired PDF palette. Earlier same day: **§4a** added: the body map's Muscle Flags mode now draws HoloMotion's 22 individual muscles by re-slicing the same MIT-licensed geometry (16 recovered from existing sub-paths, 6 deep ones as measured insets, selection by geometry not index, test-guarded); supersedes the aggregation half of §4 while leaving the asset and its attribution locked. Previous: 2026-08-03 — §18 on-device name redaction before vision extraction (Tesseract-located, page-1-only, fail-closed; verified against both HoloMotion layouts). Previous: 2026-07-20 — Activity Tracking (the FYP I Module 1) fully removed at JC's request; §1, §2, §3, §10 and §16 annotated to mark their decisions as locked-but-dormant (no live caller) rather than actively running. The six-module set was restructured the same day to fill the gap this left — see `MASTER_CLARIFICATIONS.md §4` for the current numbering. Previous: 2026-07-19 (§16 gains the per-indicator escalation — threshold + peer-outlier, z ≥ 1.5, admin toggle, persisted factors), 2026-07-18 (§17 coach one-sport + athlete detail view + event disciplines), 2026-07-13 (§16 FYP II cohort-normed overall indicator + ACWR demotion), 2026-07-06 (§15 dashboard-embedded screening), 2026-06-28 (§13–14).*
