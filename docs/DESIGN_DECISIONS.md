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

## 6. Next.js App Router (frontend)

> **Version moved 2026-09-10: 14 → 15.5.24.** Everything this section argues is
> unchanged — the framework, the App Router, TypeScript, no SPA build step, and
> the last bullet below (client components carry the interactivity, SSR is
> unused) is precisely *why* the move was cheap. It was taken for security, not
> for features: seventeen advisories against 14, including two RCEs, all clear at
> 15.5.24. React stays at **18.3.1**. See **§78**.

**Decision:** Next.js with the App Router (`app/` directory), TypeScript, no separate SPA build step. Originally 14; now 15.

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

**Implementation:** `ScreeningPanel` = five score gauges with tick marks at HoloMotion's own 60/75/85 tier boundaries + the eight indicators as **threshold strips** (tinted OK ≤15 / Watch ≤25 / High >25 zones, marker coloured by the zone it lands in, sport-critical regions starred via [`screeningAlerts.ts`](../frontend/src/lib/screeningAlerts.ts)'s shared region map). Seeder anchors: John Doe (Module 1 demo profile) and **ATH0061 Thung Jin Seng — transcribed 1:1 from the sample HoloMotion PDF** as pipeline ground truth (`thung@isn.gov.my / airms2026).

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

> **Partly superseded by §38 (2026-08-25).** The *reasoning* below stands and the
> change chart still exists — but it is no longer drawn INSTEAD of the columns,
> and the three-period row layout is gone. Switching chart type on the number of
> periods a filter happened to produce turned out to be the defect, not the fix:
> one card rendered four different graphics. Read §38 for what is on screen now.

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

### 30e. Two more, found only by opening the files in a real viewer

The five reports were finally read as rendered documents rather than through a
headless harness (which cannot rasterise fonts, so it had never shown a composed
page). Both fixes above held. Two further defects appeared, and both are the
same shape as 30a — **a non-event presented as an event**:

**Zero reported as an improvement.** The individual report's *Progress Between
Reports* row printed `+3 +0 +0 +0 +0`, with every `+0` coloured green. The cause
is that `0` satisfies both `d >= 0` and `d <= 0`, so a score that did not move
passed the "improved" test in either orientation. On the most clinically-read
document AIRMS produces, four of the five columns were claiming an improvement
that did not happen. Zero now prints as `0` and is drawn neutral. This table
deliberately still applies **no** detectable-change threshold: the dead band is
cohort-derived and is not on an athlete-scoped payload — the same reason the
trend sparklines printed directly beneath it assert no verdict.

**A count of zero rendered as a dash.** In the Activity Log's *Activity by
account* table, one row showed three different treatments of the same value —
`actions 0`, `downloads -`, `screenings 0` — because `0` is falsy and the
downloads cell tested truthiness. On an accountability document that is not
cosmetic: `-` reads as *not tracked*, and "we hold no record" is a different
claim from "we hold a record of none", particularly for `coach` and `executive`
whose downloads are the only auditable thing they do. The `vs prev` column keeps
its dash, where a zero genuinely means *no change* rather than a count.

**The pattern across 30a, 30e and the dashboard work is now explicit enough to
state as a rule:** anywhere AIRMS renders a delta, the code must distinguish
*moved down*, *moved up* and *did not move* as three cases, not two. Every defect
in this section came from collapsing the third into one of the first two.

### 30f. Why each athlete is flagged, and the glyph that could not be printed

**The flagged list gave a verdict and no reason.** The holistic report's
*Athletes Flagged for Assessment* named each athlete, their indicator and their
band - and stopped. But the band comes from the escalation COUNT, not from the
indicator value, so an athlete above the cohort average can still be flagged: on
the seeded data the highest-scoring name on that list reads **58 against an
average of 50**. A reader had to take that on trust, and "why is your
best-scoring flagged athlete flagged?" is the first question anyone asks of it.

Each entry now carries a muted second line with the escalations that set the
band, drawn from the `factors` already persisted on the screening - the same
strings the dashboards show, so the page and the report cannot give different
reasons. Three presentations were considered: appending to the primary line
(rejected - it is already ~70 characters and the factors contain their own
em-dashes, which would collide with any separator), showing only the first
factor (rejected - red athletes carry three, and the third, the per-indicator
outlier, is usually the actionable one), and a muted indented sub-line, which is
the pattern `staffTable` already uses in this same toolkit. The sub-line is
measured with `heightOfString` before the page-break check, so a three-factor
athlete cannot overrun. The list also now says so when it truncates: one headed
"Athletes Flagged for Assessment" that silently drops names is worse than a
shorter one that admits it.

This incidentally fixed the near-empty final page noted earlier - the longer
entries fill it rather than leaving five bullets in white space.

**A character that does not render, does not warn, and does not throw.**
Printing the reasons immediately exposed `over threshold ("e25)`. pdfkit's
built-in Helvetica is **WinAnsi**-encoded, and a character outside that set
measures **zero width** and prints as mojibake - silently. The toolkit already
knew this: `periodTable` carries a comment explaining why it uses a signed
number rather than an arrow glyph. What that note could not protect is text
arriving from the **database**. `screenings.factors` contains a real U+2265, and
the audit summary written when a coach's sport changes contains a real U+2192 -
both correct on the web, both unreadable the moment a report prints them. The
second is still latent: it appears the first time anyone changes a coach's sport.

A scan of every non-comment line in the backend, measuring each non-ASCII
character with `widthOfString`, separated the genuinely dangerous from the
harmless: em-dash, middot, multiplication sign, plus-minus and en-dash all render
(non-zero widths) and carry meaning in these reports; U+2265, the arrows,
true-minus and the box-drawing characters do not.

The fix is a substitution applied at **drawing** time, not at the producers.
Three reasons it belongs there: the constraint is a property of pdfkit's
encoding, not of the data; the same strings render correctly on the dashboards,
so editing them would degrade a working surface to repair a broken one; and
sanitising at the boundary repairs rows **already stored**, which editing the
producers could not do without a full rescore. `doc.text` is wrapped once in
`startDoc` and `bufferDoc`, so every draw is covered - including code written
later that never hears about any of this.

**A note on how this nearly shipped broken.** The wiring was applied by a script
that asserted its first edit and not its other two. The file is CRLF; the
replacement strings were LF; the two multi-line edits silently matched nothing.
`guardText` was defined, exported, unit-tested and **never called**, and the
tests still passed because they tested the function rather than its
installation. It was caught only by rendering the report again and seeing the
same mojibake. Assert every edit, and verify at the output rather than at the
unit.

### 30g. Testing the installation, not the function

The `guardText` near-miss in 30f was a test-suite failure as much as a wiring
failure, so the suite was rebuilt around the property it had been missing: **a
test must fail when the thing it describes is not connected.**

**Why the original tests could not fail.** `winAnsiSafe(input) === expected`
asserts a pure function, and a pure function is correct whether or not anybody
calls it. The one test that looked like an integration test attached a spy to the
document *after* construction — but `guardText` replaces `text` on the
**instance**, so a spy added afterwards sits *above* the guard and records the raw
string either way. It asserted that the raw string was still raw, which is true in
both the working and the broken build.

**What replaced them.** `tests/helpers/capturePdfText.js` patches
`PDFDocument.prototype.text` *before* the document is constructed, which puts the
recorder **underneath** any instance guard. What it captures is what pdfkit was
actually asked to draw. A second helper, `capturePaintOps`, does the same for
`fill` / `stroke` / `fillAndStroke`, because some decisions here are geometric and
leave no trace in the page text at all.

**Every new assertion was verified by breaking the code.** This is the part that
matters, and it is cheap:

| Mutation applied | Tests that failed |
|---|---|
| `guardText` removed from `startDoc` and `bufferDoc` | 3 in `pdfDraw`, 2 in `holisticReport` |
| the sub-threshold outline changed back to a fill | 1 (`outlines rather than fills`) |
| the flagged list's reason sub-line deleted | 3 in `holisticReport` |
| `changeCell`'s zero case removed | 1 (`zero as neutral`) |

The old tests passed under every one of those mutations. A test nobody has seen
fail is a guess about what it covers.

**Counting paint operations was itself a trap.** The first version of the
dead-band assertion compared how many `fill` calls each variant performed and
failed immediately: the dead-band **zone** is a filled rect, so a chart that
outlines two bars and shades two zones performs exactly as many fills (4) as one
that fills two bars and shades nothing. The counts coincide while the meaning is
opposite. `fill(tone)` carries the colour, so the honest question — *is any fill
painted in the bar tone?* — is answerable, and the tone is **derived** by drawing
the same magnitudes with the dead band removed rather than hardcoded in the test.

**`changeCell` was extracted so it could be tested at all.** The zero-as-a-gain
defect lived in a route handler, and this repo only tests route logic once it has
been lifted into a util. The rule now sits in `pdfDraw.js` beside the other
tone decisions, the route calls it, and the extraction was confirmed
behaviour-preserving by re-rendering the report over HTTP (`Change +3 0 0 0 0`).

**One honest gap.** The route's *use* of `changeCell` is still not covered by
jest — only the function and the drawn output are. That installation is verified
by rendering the report over HTTP, which is exactly the manual step 30f says to
prefer over a unit assertion. It is recorded here rather than papered over.

**Finishing the job: the three fixes that were still only smoke-tested.** 30g
rebuilt the method; applying it to the rest of section 30 found three fixes with
no assertion behind them at all.

- **30b, the measured value column.** `bar()` reserved a fixed 50pt, so
  "58 of 62 (94%)" overran its slot. Nothing in the page text records the
  geometry, so `capturePaintOps` now also records `rect` / `roundedRect`
  coordinates, and the test asserts the property the fix actually establishes:
  whatever the value says, its right edge stays inside the page margin — checked
  across four value lengths, and separately that a longer value *shortens the
  bar* rather than overlapping it.
- **30c, the squad body map.** "Returns true and produces a PDF" passes equally
  well if the figure never draws a single muscle. `muscleFigure` paints each
  region with `fillAndStroke`, so counting those separates a drawn figure (dozens
  of paths, both views) from an empty frame (zero).
- **30d, the holistic report's two charts.** Each is pinned by the caption its
  own helper writes — "Column height is tests performed" and
  "worse <- change -> better" — so deleting either call fails a test rather than
  silently returning the report to tables. Writing these exposed a thin fixture:
  the mocked history had one date and no repeat screenings, so neither chart
  *could* draw. A throughput chart needs more than one period and a change chart
  needs within-athlete pairs; the fixture now supplies both, which is a more
  honest model of the data anyway.

All four were confirmed by mutation, then confirmed *again* after the test file
was refactored — a refactor that quietly neuters an assertion is exactly the
failure this section is about.

**The harness was the root cause, so it was fixed too.** The document lifecycle
(`fakeRes` -> `startDoc` -> draw -> `finish` -> await) stood in **twelve** copies.
That is why the original test was written badly: the correct thing was tedious to
write and the wrong thing was easy. It is now one `lifecycle()` factory with two
capture modes, `paintOf` and `textOf`, both routed through `startDoc` **on
purpose** — a helper that constructed a bare `PDFDocument` would skip the very
guard installation these tests exist to verify, recreating the hole from the
inside.

The collapse itself misfired first, and instructively: the substitution was run
over the whole file *after* the new helper was inserted, so the pattern matched
**the helper's own body** and produced `const paintOf = (draw) => paintOf(...)`
— infinite recursion, caught immediately by the suite. Same family as the CRLF
mismatch in 30f: a mechanical edit applied without asking what else it might
match. Insert-then-substitute is the wrong order; substitute first.

**And a note on the tooling that caused it.** The failed wiring edit came from a
script whose replacement strings used LF against a working-tree file that
checks out CRLF. `.gitattributes` declares `* text=auto eol=lf`, so the
repository stores LF and the mismatch is invisible in a diff — it only breaks
in-place edits. Scripts that patch source here should normalise to LF in memory,
edit, and write LF; and they should assert **every** replacement, not the first.

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

## 32. The norm floors stay off, and the norms are pinned (2026-08-19)

Two governance decisions taken before assessment, recorded because both are
positions rather than defaults nobody got round to changing.

### 32a. `norm_min_total` stays 0 - the gate is deliberately off

`isEligibleForNorms` supports three floors (`norm_min_total`, `norm_min_rom`,
`norm_min_stability`) that drop an athlete out of norm COMPUTATION when a score
falls below them. Each fires only above 0, and all three are 0.

They stay off, because the criterion is **the very quantity being normed**.
Excluding low Total Scores from the calculation of a Total Score norm is
selection on the dependent variable: it censors the left tail, which biases the
mean upward and shrinks the SD, which inflates every z-score and therefore
**over-flags the athletes who remain**. That is the opposite of what a reference
population is for. With cohorts as small as n=5-9 in this data, dropping even one
athlete moves the norm materially.

Excluding the **injured** is a different act and stays: injury is an external
fact about whether a screening represents the athlete's capacity at all. A low
score is the signal itself, not a data-quality problem - and finding it is the
whole purpose of a cohort norm.

The floors remain in the code for genuine data-quality use (a garbage
extraction), but on real HoloMotion data Total Score runs roughly 52-98, so any
floor low enough to be safe would never fire. The honest answer is that the gate
exists, is off on purpose, and turning it on would bias the norm.

### 32b. The norms in force are now a named, pinned set

Until now the norms were whatever the last import produced, and there were **zero
saved versions** - so the versioning and pinning built in section 22 had nothing
to demonstrate against, and worse, an import during assessment would have moved
the reference every athlete is scored against, mid-demonstration.

`Pre-viva baseline 2026-08-19` snapshots all 50 cohorts and is **pinned**.
Verified by recomputing while the pin is in force: **50 of 50 cohorts held, none
moved**, and all 50 parked their recomputed figures in `fresh_stats` so
`pinDrift()` can still report how far the live data has travelled from the frozen
norm - a frozen norm with no staleness signal would be worse than none, which is
why that half exists. The band distribution is unchanged at 43 green / 10 amber /
5 red of 58 screened (the pin installed the norms that were already live), the
`norm.pin` audit row is written, and all five reports still render with the pin
in place.

The pin is releasable from the same page, so this constrains nothing permanently
- it makes the reference explicit instead of incidental.

> **Figures superseded the same day — the argument is not.** The reseed recorded
> in §34c rebuilt the database, so the version now pinned holds **49** cohorts
> (49 live rows, 0 `added_since_pin`) and the band split is **38/9/9 of 56**, per
> §34b. The 50-of-50 verification above describes the pin operation as it ran on
> the pre-reseed data and is left as the record of that check.

## 33. What a sports-medicine review of the dashboards changed (2026-08-19)

All five role dashboards were reviewed against the screening literature rather
than against the FDD. Four changes followed, one review finding was **wrong**, and
one outcome is a rule about how to present a result rather than a code change.

The framing that survived scrutiny, and is the right viva answer: **AIRMS does not
claim to predict injury.** Validating a screen for prediction needs a prospective
association, adequate test properties in the population, and evidence that
intervening on screen-identified athletes beats intervening on everyone (Bahr,
*BJSM* 2016) — and no published screening test has cleared all three. The best
known threshold in the field, an FMS composite of 14 or below, is not
significantly associated with injury risk once studies are pooled.

> **Which reference to cite for this (2026-09-09).** The three-step argument
> above is Bahr's, and it is named here because it is the argument's origin. But
> the project cites **post-2022 sources only**, so the reference for the report
> and the viva is **Velarde-Sotres et al. (2025)** — a systematic review of this
> exact instrument class reaching the same conclusion on current evidence, and
> reporting FMS's "limited prognostic ability" directly. Full entry and the
> reasoning: `docs/fyp/REFERENCES.md` A1 and §6.

Scoring against
a real peer cohort rather than a published cut-off avoids inheriting that failure,
and the escalation COUNT (requiring two independent rules to agree before red) is
the standard defence against the false-positive rates that make flagging systems
unusable in practice.

### 33a. Green is no longer "Safe"

A screen that cannot predict injury cannot certify its absence either, and because
most athletes are low-risk, the green band is precisely where a false reassurance
would land — 43 of 58 athletes carried it when this was written on 2026-08-19,
and **38 of 56 when re-measured on 2026-09-09** (`npm run measure:facts`). The
roster and the seeder have both changed since; the proportion has not, which is
the point. The label now describes the FINDING
(`No indicators flagged`, `None flagged` in legends) rather than the ATHLETE.

**The citation for this, added 2026-09-09** (`docs/fyp/REFERENCES.md` A1) — the
premise was argued from first principles here for three weeks without one, and it
is the most defensible position in the project, so it should be sourced:

> Velarde-Sotres, Á., Bores-Cerezal, A., Alemany-Iturriaga, J., &
> Calleja-González, J. (2025). Tensiomyography, functional movement screen and
> counter movement jump for the assessment of injury risk in sport: a systematic
> review of original studies of diagnostic tests. *Frontiers in Sports and Active
> Living*, 7, 1565900. doi:10.3389/fspor.2025.1565900

A 2025 systematic review of the exact instrument class HoloMotion belongs to,
whose conclusion reads almost as a specification for AIRMS: such tools "should be
considered as assessment tests and technologies to individualize training
programs and identify injury risk **factors**", not standalone predictors — and
FMS specifically showed "limited prognostic ability to accurately identify
athletes who might be at risk of injury".

This decision is that finding expressed as an interface rule, and it is the
answer to the hardest question available in the viva — *"does your system predict
injury?"* It does not, and the wording of the green band is where that honesty is
most visible.

Implementing it found something worse than the wording. `BAND_LABEL` in
`utils/bands.js` — the file whose entire purpose is to be the single band
vocabulary — **had no green key at all**. `utils/pdfDraw.js` had quietly grown a
private full map saying "Safe", and `app/athlete/squad/page.tsx` another. So
renaming green in the "single source" would have left the PDFs and the squad table
still saying Safe. Three definitions are now one, and the test asserts that
neither the full nor the compact form can contain "safe".

The clinician override card keeps `Cleared to train as programmed` as its ACTION:
a clinician examining an athlete is entitled to clear them. That is a human
judgement, which is a different kind of claim from a screen output.

### 33b. The screening's age is stated where the decision is made

The band renders in the present tense. The system already computed each athlete's
recall state (`rescreen_due_days` → current / due-soon / overdue / never) and
emailed it monthly to administrators — but surfaced it **only** as an aggregate on
the admin Programme Activity page. On the athlete, medical and coach dashboards
the assessment date appeared only inside the date dropdown, so an athlete last
screened eight months ago presented exactly like one screened last week.

The hero now states the age and the recall state whenever it is not current. The
classifier was **extracted, not copied**, into `utils/recall.js`: the hero and the
recall email read one rule, so they cannot disagree about who is overdue — the
same argument the reminder itself is built on. `recall.test.js` pins the boundary
at `>=` rather than `>`, because that off-by-one would silently have moved every
athlete sitting exactly on the interval.

### 33c. Small cohorts now say they are small

The fallback ladder resolves to the most specific cohort meeting
`min_cohort_n = 5`, and in practice **every scored athlete is compared against
fewer than eleven peers** — 49 of 58 when this was written, and re-measured on
2026-09-09 it is **all 56 of 56**, min 5, median 7, max 10, so the caveat fires
for everyone. (`npm run measure:facts` reports *55* of 56 for the same roster
because it counts "below 10" while this counts "fewer than 11"; both are correct
and the difference is the athlete whose cohort is exactly 10.) An SD estimated
from five observations is unstable, and the
below-mean escalation fires at −0.5 SD, which sits inside the sampling error of
such an estimate. The comparison header now carries `n=`, and below ten peers a
caveat states that the group mean and spread are themselves uncertain — the same
"say what the data can support" rule as the detectable-change threshold and
seasonality.

> **The sharpest form of this objection, added 2026-09-09 — volunteer it rather
> than defend it.** The normative-testing literature holds that comparing an
> individual against a normative sample by **z-score** becomes unreliable at
> small n, and that below roughly n=50 the correct instrument is a **t-based
> comparison** (Crawford & Howell's method) rather than a z. AIRMS computes
> `cohortZ` against a median of **seven** peers.
>
> This is not a defect and the mitigation is already in place and visible: every
> cohort in the database sits at or below `SMALL_COHORT`, so the caveat fires on
> **every** athlete's hero, and the indicator drives triage rather than a
> diagnosis. But it is the strongest methodological challenge an examiner with a
> statistics background can make, and the honest answer is the short one — the z
> is computed against seven peers, every cohort says so on screen, and a t-based
> comparison is the correct refinement if the roster does not grow. See
> `docs/fyp/REFERENCES.md` §7.2.

`min_cohort_n` is deliberately unchanged. Raising it trades an unstable comparison
for a less specific one, and that is an institutional judgement about whether ISN
would rather compare an athlete with four closely matched peers or thirty roughly
matched ones. **Still open for JC.**

### 33d. Asymmetry is expressed as a percentage, where it is a threshold

Left–right difference was a raw point gap, so 80 vs 70 (a 12.5% deficit in a
strong limb) and 40 vs 30 (25% in a weak one) counted identically. The inter-limb
asymmetry literature states the measure as a percentage, and return-to-sport
criteria are given as a limb symmetry index of 85–90%. `NOTABLE_GAP = 10` points
became `NOTABLE_GAP_PCT = 10` percent of the better side, with the raw points kept
beside it so a clinician can still reconcile against the printed HoloMotion table.

The 10 figure was retained deliberately: it is the most commonly cited value, and
it is *not* a hard boundary — asymmetry above 10% is common in uninjured athletes
and the threshold is itself debated. What changed is how the quantity is
**expressed**, not a claim about where the cut belongs.

Not applied to the composite's `balance` term, and the reason matters: that value
is z-scored against the athlete's cohort, and z-scoring already removes the scale,
so normalising it would move nobody's band while making the code harder to follow.
The un-normalised form only did damage at the **absolute** cut-off.

### 33e. A finding that was wrong, kept visible

The review claimed the bottom-*k* escalation flagged a fixed count out of a
variable squad — 60% of an n=5 cohort against 10% of an n=31 one. **It does not.**
`effectiveK()` caps *k* at `BOTTOM_SHARE = 0.2` of the cohort (minimum 1), so the
applied share is 10–20% at every size, which is exactly what the review went on to
recommend. The code comment already described the 60% problem and recorded that it
once banded 42% of the squad red.

The error was arithmetic on the wrong number: `bottom_k / n` computed from the raw
setting without reading how the setting is consumed. It is the same mistake as the
permissions catalogue earlier in the month — asserting from a stored value instead
of the code path that reads it. **Before reporting a defect derived from a setting,
read the consumer.** The retraction is left in the published review rather than
deleted, and it doubles as the answer if a panel raises the small-cohort objection.

### 33f. The seeded distribution is not evidence of calibration

The composite averages six z-scored components, four of which (Total Score, ROM,
stability, symmetry) are functions of the same 25 subitem cells — Total Score *is*
their mean. They should therefore be strongly correlated, weighting movement
quality far above injury burden. Measured across all 58 athletes, every pairwise
correlation is near zero (|r| ≤ 0.21).

That independence is an artefact of the seeder, which draws `stability` and
`symmetry` as independent randoms and generates `subitems` separately, so Total
Score is not the mean of anything. **The collinearity concern is therefore still
live for real HoloMotion data — it is merely invisible in this database.**

Consequence for how results are presented: 43 / 10 / 5 is evidence the pipeline
runs end to end, which is a real claim. It is not evidence the model is calibrated,
and it should not be offered as such.

### 33g. The boundary, stated rather than apologised for

The literature's own recommendation is to start from movement quality and then add
context — injury history, pain, load. AIRMS has the movement quality and, by
deliberate decision (the HoloMotion-only cut), none of the context. Prior injury
is the strongest known single predictor and AIRMS does not hold it.

This is a scope decision and should be volunteered as one. Adding load and history
would not clear Bahr's three steps either; it would be a larger untested claim.
The defensible position is the one the interface now takes throughout: report
indicators, triage them for assessment, name the uncertainty, and leave the
verdict with a clinician who can override it.

## 34. The seeded data now obeys the instrument's own arithmetic (2026-08-19)

### 34a. min_cohort_n stays at 5, and the reason is bias, not variance

The open question from §33c. Raising the floor looks like the statistically
careful move — 15 athletes are scored against five peers or fewer, where an SD
carries four degrees of freedom.

It loses, because of where the fallback ladder actually sends them. Athletes
currently resolve at `sport · gender` (n = 5–9) or `sport · programme · gender`
(n = 7). Raising `min_cohort_n` pushes those cohorts up to **sport alone**, which
means comparing a female athlete's ROM and stability against a squad of men. Sex
differences in those measures are real and substantial.

So the alternative to a small, specific cohort is not the same comparison with
more people — it is **a different and less valid comparison**. Raising the floor
trades *sampling variance* for *systematic bias*, and bias does not shrink with n.
A noisy like-for-like comparison beats a stable unlike one, and the §33c caveat
makes the noise visible where it matters.

Left as future work rather than done: scaling the escalation cutoff with cohort
size (the standard error of a z widens as n falls) would address the variance
directly without touching the tier. It is a change to a locked escalation rule and
was judged not worth introducing days before assessment.

### 34b. Total Score is now DERIVED in the seeder, and the collinearity appeared

§33f recorded that the composite's four movement components ought to be strongly
correlated on real data — Total Score *is* the mean of the 25-cell subitem table —
while measuring near-zero correlation in the seeded database, and concluded with a
presentation rule: do not offer the seeded band split as evidence of calibration.

Measuring the actual fidelity turned that into a defect worth fixing:

```
|totalScore − mean(subitems)|   mean 9.9   median 10.0   max 34.9
documented residual on three real HoloMotion reports:  ≤ 1.2
athletes obeying the instrument's own arithmetic:      11 of 58
```

The cause was one line. `genSubitems` builds its cells around `mobility`,
`stability` and `symmetry`, so those three and the subitems were consistent — but
`overallActivityScore`, which becomes `totalScore`, was drawn independently with
`range(55, 95)`. One value in the whole model was connected to nothing.

Since the table is 10 ROM cells, 10 stability and 5 symmetry, its mean is
`0.4·mob + 0.4·stab + 0.2·sym`. Deriving Total Score that way reproduces the real
instrument's relationship, with residual left over only from the per-cell jitter:

```
after:  mean 0.94   median 0.88   max 2.52      (documented: ≤ 1.2)
```

And the predicted collinearity duly appeared:

```
                 before      after
totalScore × rom        0.05  →   0.70
totalScore × stability  0.01  →   0.73
totalScore × symmetry  −0.03  →   0.21     (weight 0.2, so lower — as expected)
riskGood   × totalScore 0.07  →   0.11     (still independent — correctly so)
```

Three of the six components now share roughly half their variance, so the
composite does weight movement quality above injury burden, exactly as §33f
argued. That injury risk stays independent of movement quality is not a flaw — it
is the premise of the risk-vs-movement scatter in §25, and this is the first
measurement confirming it on data shaped like the real thing.

The band split moved from 43/10/5 of 58 to **38 green / 9 amber / 9 red of 56**.
The §33f presentation rule still holds and is now better founded: this is a
distribution produced by correlated components, which is what real imports will
produce, but it remains evidence that the pipeline runs rather than evidence the
model is calibrated.

### 34c. How this was found, and a mistake worth recording

`node -e "require('./src/utils/seeder')"` was run to check that the edited file
parsed. **`seeder.js` executes on import** — it dropped and recreated the schema
and reseeded the database. That was an unrequested destructive action and it cost
the pinned norm version and the whole audit trail, both created earlier the same
day.

Everything else regenerated identically, because the seed is deterministic
(PRNG seed 42): the same 62 athletes, the same ICs, the same eight demo logins.
The norm version was re-saved and re-pinned (49 cohorts), and all five reports and
all four demo logins were verified afterwards. The audit rows are genuinely gone
and were not recoverable; they were development traffic, not institutional record.

**The lesson is about the check, not the seeder** — but the seeder was fixed
anyway, because relying on everyone remembering is not a fix. `seed()` is now
called only behind `if (require.main === module)`, so `npm run seed` (which runs
the file directly) works exactly as before while `require()` is inert. Nothing can
trigger it by accident any more, including a test that happens to pull in a module
which requires this one. `node --check <file>` remains the right way to ask whether
a file parses.

**The audit trail was restored by DOING things, not by writing rows.** An
append-only accountability log is worth exactly as much as its correspondence to
what happened, so backdating invented entries to repair it would have destroyed
the property the feature exists to provide — and would have been far worse under
questioning than an empty table. Instead the operations were performed again for
real: eleven report downloads spread across admin, medical, coach and executive, a
clinician injury flag set and cleared, a norm membership excluded and re-included,
and a settings change. Twenty-one genuine rows across five action types.

That happens to demonstrate §20a better than the lost traffic did, because the
rollup now shows the shape the design is *for*:

```
Admin User (admin)            4 changes   10 downloads
Medical Demo 01 (medical)     2 changes    1 download
Coach Demo 01 (coach)         0 changes    2 downloads
Datuk Executive (executive)   0 changes    2 downloads
```

The two read-only roles appear with downloads and no changes, which is the whole
argument for counting reads separately: for an account that cannot write, reading
is the only auditable act it has.


### 34d. The same fix was missing from the other half of the seeder

§34b derived Total Score from the movement components in `buildScreenings`. The
seeder has a **second** screening producer — the prior-snapshot block that gives
about a third of athletes an earlier test, so the coach's trend arrows and the
between-tests panel have something to compare — and it was not touched.

That block nudged `totalScore` by ±3 and copied `rom`, `stability` and
`symmetry` across **unchanged**. So on those 18 rows the instrument's own
arithmetic was violated by exactly the nudge:

```
|totalScore − (0.4·rom + 0.4·stab + 0.2·sym)|
  latest rows   mean 0.27   max 1.60
  prior rows    mean 2.94   max 3.40      <- the ±3 nudge, showing through
```

A retest whose Total Score moved while ROM, stability and symmetry stayed
bit-identical is arithmetic HoloMotion cannot produce, and it is visible in the
product: the between-tests panel would report movement in Total Score beside
three components that never budged.

The fix applies the nudge to the **components** and derives Total Score from
them. Because `0.4n + 0.4n + 0.2n = n`, the demonstrated trend is arithmetically
unchanged — 17 of 18 Total Scores are identical afterwards, the eighteenth moving
by one point from clamping — while a retest now differs in the things a retest
measures. Prior-row residual fell **2.94 → 0.21**.

Two consequences worth recording:

- **The 18 existing rows were patched in place rather than reseeded.** Re-running
  the seeder would have cost the pinned norm version and the audit trail a second
  time (§34c). Norms and indicators read each athlete's **latest** screening only
  — verified in `cohorts.js` and `overallIndicator.js` before touching anything —
  so rewriting prior rows cannot move a band, a norm or the pin, and none moved.
- **`reliability()` now sees movement in five of six scores instead of two.**
  Before, `rom`, `stability`, `symmetry` and `exerciseRisks` were identical across
  all 18 pairs, so even at 20 pairs four of the six would have been refused as
  "identical in every repeat — not re-measured". Now only `exerciseRisks` is,
  which is honest: the prior snapshot genuinely does copy injury risk unchanged.

**What was deliberately NOT done: seeding more repeats.** At 18 pairs against a
`MIN_PAIRS` of 20, the detectable-change threshold still declines. Adding two
more athletes' worth of history would make it compute — from fabricated jitter.
That is the same error as lowering the floor, which `CLAUDE.md` already forbids,
approached from the other side: the threshold would then exist because it was
manufactured to, not because it was earned. The decline is the output.

**How it was found:** compiling the numbers table for `docs/fyp/VIVA_FYP2.md`
against the live database instead of quoting the docs. Three figures in the docs
were stale in the same pass. Measuring a claim is not the same as having written
it down.

## 35. The mail nobody could see (2026-08-19)

Every scheduled email in AIRMS worked. None of them could be **observed**, which
for a background process is nearly the same as not working.

### 35a. A failed send reached only `console.error`

The scheduler's error handling was already right in the part that matters: a
failed send does **not** mark the month, so the attempt retries next hour instead
of losing the report. What was missing is that nobody is told. The failure
printed to `console.error` — on a host that, by this feature's own design
argument, is expected to run unattended for a month at a time.

So the outcome of the last attempt is now persisted (`digest_last_result`,
`rescreen_reminder_last_result`) and rendered on the admin Settings tile, in red
when it failed. **A month that quietly stopped arriving is otherwise
indistinguishable from a month with nothing to say** — and of the two, the
second is the one an administrator will assume.

The write is fire-and-forget for the same reason the audit writes are: recording
an outcome must never be the reason a send is reported as failed.

### 35b. "Send now", because an hour is not a wait

The page already offered *"send again at the next hourly check"*, which clears
the month marker and lets the tick pick it up. That is the correct control for
one case — correcting a month that was missed — and useless for the two that
actually arise: demonstrating that the feature works, and an administrator who
wants this month's report today. An hour is not a wait; it is a reason not to
use the button.

`force` skips the **due** check and nothing else. It deliberately does *not*
override `digest_enabled` / `rescreen_reminder_enabled`: those switches are the
institution's answer to whether AIRMS sends this kind of mail at all, and a
button that ignored them would be a second gate contradicting the first — the
same two-gates-in-order rule the per-user opt-out follows (§20h).

Audited as **`mail.send`**, not as `settings.update`. It changes no setting, and
it is the one control on that page that puts athlete-derived content into
somebody's inbox; filing that under a settings label would misdescribe the most
consequential action available there. The audit row is written whatever the
outcome — including `disabled` and `no recipients` — because "I pressed send and
nothing arrived" is exactly the event somebody later needs explained.

### 35c. Two email paths could never be shown arriving

Five of the eight seeded accounts use `@isn.gov.my` addresses, which bounce. Two
consequences were invisible rather than broken: the digest's **executive** copy,
and the **coach's sport-scoped slice** of the rescreen recall. Both are slices of
emails other recipients do receive, so the code ran — nobody could see the result.

Fixed the way the project already fixed it once, for `Medical Demo 02`: the
canonical `@isn.gov.my` logins are **left alone** — they are documented, and
churning credentials days before assessment buys nothing — and a second account
with a deliverable inbox is added beside them. Plus-addressing
(`poseidonapollo11+coach@`, `+exec@`) delivers to one mailbox while remaining
distinct addresses, so a single inbox can verify every role and each message
still shows which role it was addressed to.

`Coach Demo 02` shares Badminton with `Coach Demo 01` **on purpose**: the
reminder sends one email per *sport*, not per coach, so the pair demonstrates
that rule rather than merely asserting it — two coaches, one message, delivered
somewhere checkable.

### 35d. What was verified, and what still is not

Verified by running it: a forced reminder produced two emails (institution-wide
to 4, Badminton to 2) and a forced digest reached 4 recipients with the holistic
PDF attached; a send against an unreachable SMTP host recorded
`{ok:false, detail:"getaddrinfo ENOTFOUND ..."}` and **left the month marker
empty**, so the retry survives. Three mutations of the guarded behaviour were
each confirmed to fail the new suite.

**Still not solved, and it is the real one:** the scheduler is a `setInterval`
inside the API process. The marker design means a process that is down when the
digest falls due sends *late* rather than never — but "late" means "when the
backend next runs". On a development laptop, monthly reporting is therefore
aspirational. That is a deployment gap, not a code gap, and it is the same gate
as the ISN sign-off. The other standing limitation: mail sends from a personal
Gmail with an app password, which is fine for a demo and wrong for clinical
alerts at an institution — an env change, no code.

## 36. The schedule leaves the web process (2026-08-19)

§35d closed by naming what was still unsolved: the digest and the rescreen
recall are monthly obligations, and both were driven by a `setInterval` inside
Express. The marker design means a process that is down when the mail falls due
sends **late** rather than never — but "late" means "whenever the backend next
runs", which on a workstation means "whenever somebody opens the project". A
feature nobody has to open is precisely what these two were built to be.

### 36a. One tick, three places it can come from

`backend/src/mailTick.js` runs exactly one pass and exits (`npm run mail:tick`).
It calls the **same** `tick()` the interval calls — which had to be lifted out of
the `startScheduler` closure to module level for the purpose. Two definitions of
"what a tick does" is how a deployment comes to send the digest and silently
never the reminder; the digest already follows that rule for the holistic report
it attaches (§20g).

- **Development:** the in-process ticker, unchanged and still the default.
- **A workstation that must really send:** `backend/scripts/install-mail-task.ps1`
  registers a per-user Windows scheduled task — no elevation, no SYSTEM account,
  `-Uninstall` removes it — with `StartWhenAvailable`, so a machine asleep when
  the digest fell due runs the missed tick on wake.
- **The institution:** an hourly cron line, with `MAIL_SCHEDULER=off` so the web
  process stops ticking too. Default is **on**: the failure mode of a default-off
  switch is silence, the one failure this feature exists to prevent.

Operational detail is in [`docs/DEPLOY.md`](DEPLOY.md).

### 36b. "Safe to run twice" was asserted, and was false

The scheduler's own header explained its concurrency safety as *"two instances
race on the same marker, and the loser's send is skipped because the month is
already recorded."* That holds for a **restart** and fails for genuine
concurrency: `setSetting` is a read-then-write, and the marker is deliberately
written only AFTER a successful send (so a failure retries rather than losing the
month) — so two processes ticking together both read it unset, both send, and
both then record the month. Two identical monthly reports, and the trail says one.

It cost nothing while exactly one process ever ticked. Adding an OS task makes
two tickers the normal case, so the property had to become true rather than
merely stated: both sends now run under a compare-and-swap lock
(`utils/lock.js`), namespaced `lock:*` in the settings table — invisible to
`getSettings()`, which ignores keys absent from DEFAULTS, so no new table and no
migration. Verified with six simultaneous ticks: **one sent, five blocked, lock
released**.

The lock expires (10 minutes). Without expiry a process that dies mid-send
deadlocks the digest for ever — the exact failure this module exists to prevent,
reintroduced by its own safety mechanism. Takeover of a stale lock is itself
conditional on the stale value, so two processes finding the same one still
produce exactly one winner.

### 36c. Two bugs written while writing the fix, both invisible to the obvious test

Recorded because the pattern is the point, not the bugs.

**The release never released.** `Setting.value` is a **JSON** column, so
`destroy({ where: { value: token } })` binds a plain string against JSON and
matches nothing. Locks were acquired correctly and never freed, leaving a row
that blocked the next send until the TTL expired. **The race test passed anyway**
— exactly one process sent, which is what it asserted. What caught it was
checking the lock row was gone afterwards. Comparisons now go through
`JSON_UNQUOTE`, written as explicit SQL so the atomicity is reviewable rather
than inferred from an ORM's behaviour.

**A bare `catch` disguised a broken INSERT as contention.** `settings` has NOT
NULL `created_at` / `updated_at` with no database default, so a hand-written
INSERT threw `ER_NO_DEFAULT_FOR_FIELD` — which `catch { return null }` read as
"somebody else holds the lock". Every acquire would have failed for ever and the
digest would have silently stopped sending, with the lock that exists to protect
it as the cause. The insert goes through the model (which supplies timestamps),
and only `UniqueConstraintError` counts as losing the race; anything else is
re-thrown so it surfaces as a failed tick and lands in `*_last_result`.

Both are now pinned by `tests/lock.test.js`, which asserts on the **SQL issued**
and on the **error that comes back out** rather than on the happy path, and all
four guards were confirmed by mutation. A fifth mutation removed the `withLock`
wrapper from the scheduler entirely, to check that deleting the protection breaks
a test rather than nothing.

### 36d. Verified end to end, with the backend not running

The Windows task was registered, `npm run dev` confirmed not running, the month
marker cleared, and the task triggered by hand. It sent — `digest_last_sent`
became `2026-08` and the outcome row recorded *"sent to 4 recipient(s) with the
holistic report attached"*. The mailer was in dry-run for that pass, so the chain
(task → node → database → due check → render → send → mark → record) is proven
without a second real email.

**What is still not solved, and cannot be here:** the Windows task runs only
while that user is logged on, and the cron line needs a host ISN provides. Where
the app runs, how MySQL is hosted, TLS and backups remain the institution's
decisions and are not made in this repo. What has changed is that the schedule is
no longer tied to a developer opening a laptop.

## 37. A whole-project audit that mostly found nothing (2026-08-20)

A sweep for dead code, responsive defects and useless content. Recorded because
the **negative** result is the finding: after §29 (design scale) and §31
(single-definition sweep), there is very little left to cut, and a report that
invented work would have been the wrong answer.

### 37a. What was measured

| Checked | Result |
|---|---|
| Backend files nothing requires | **0** |
| Frontend files nothing imports | **2** — `AcwrGauge`, `WorkloadChart`, both deliberately dormant and protected |
| Unused npm dependencies | **0** of 20 deps + 10 devDeps |
| CSS classes defined but never used | **8** of 479 |
| Empty rule blocks | **1** |
| Tables without a horizontal-scroll parent | **1**, and it does not need one |
| Fixed widths that cannot shrink | **0** |

Removed: `.cohort-bar-seg--*`, `.muscle-chip-title--*`, `.muscle-rank-bar--*`
(orphaned colour modifiers whose base classes exist in neither the CSS nor the
markup) and `.posture-finding--normal`, left over from the Posture Evaluation
removed on 2026-08-01. Plus an empty `@media (max-width: 980px) { }`. Ten lines.

### 37b. Five false positives, and what they teach about this kind of scan

Every automated finding in this audit had to be checked by hand, because the
first pass of each scanner was wrong:

1. **`RiskRadar` reported as orphaned** — it is loaded through
   `dynamic(() => import(...))`, which a `from '...'` regex does not see.
2. **`.screening-strip-legend` reported as an uncollapsing grid** — it is a
   wrapping flexbox; the selector-tracking mis-attributed a rule inside a media
   block.
3. **Seventeen `.bodymap-*` classes reported dead** — built as
   `` `${base}--${state}` `` where `base` is a *variable*, so neither a literal
   search nor a `prefix--${` search finds them.
4. **`.page-content` reported as `flex: 1` without `min-width: 0`** — the
   `min-width: 0` is there, in a separate rule 120 lines earlier (the §28 fix).
5. **`BodyMap` reported missing from the clinician view** — it is at
   `medical/dashboard/page.tsx:729`; a `head -14` on the scan output truncated it.

The pattern is the one §33e already named: **a finding derived from a scan is a
hypothesis, not a defect.** Four of the five would have produced a confidently
wrong claim, and the fifth would have deleted live styling from Module 1. The
rule that caught them all was checking the consumer before reporting.

### 37c. Responsive layout: no defects found

Verified rather than assumed: Next 14 injects
`width=device-width, initial-scale=1` by default (confirmed in
`next/dist/lib/metadata/default-metadata.js`), so the breakpoints do apply on a
phone — with no `viewport` export in `app/layout.tsx`, that was worth checking
rather than trusting.

The two fixed dimensions found are both correct: `.login-card` is
`width: 760px; max-width: 100%`, and `.heatmap`'s `min-width: 520px` sits inside
`.heatmap-wrap { overflow-x: auto }`, which is the right pattern for a wide
table. 15 of 16 tables sit in a scroll container; the sixteenth
(`.cohort-profile-table`) is four columns of short values at `width: 100%` and
wraps rather than overflowing.

**What this audit cannot tell you.** Layout is an emergent property of a
rendering engine, and there is no browser in this toolchain. Everything above is
structural: it establishes that the known overflow *causes* are absent, not that
every page looks right at 360px. That still needs a person with a device.

### 37d. Content: one panel had two names

The dashboards and the PDFs were read for redundancy. The admin dashboard's
thirteen panels survive scrutiny — the three that sound alike are different
grains (top-level score averages, the 25-cell subitem heatmap, and the licensed
body figure fed those same means), and the histogram earns its place for the
reason §25 gives.

What did not survive: the admin dashboard and the holistic report drew the **same
two panels under different names**. "Where the risk sits" on screen is "Exercise
Risk Hotspots" in the PDF; "Where the Squad Sits" on screen is "Indicator
Distribution" in the PDF. §19's single-source rule was applied to *values*, and
the vocabulary drifted the same way — an administrator reading both cannot tell
they are looking at one thing. The dashboard adopts the report's names, which
were the clearer pair.

**The fix was one surface short.** The finding named two surfaces and there are
three: `docs/USER_MANUAL.md` is what an administrator reads to learn the panels,
and it still listed `Where the Squad Sits` after the screen had stopped saying
it. A rename that reconciles the screen with the report but leaves the manual
behind has not removed the second name — it has moved it somewhere nobody looks.
The manual now carries the report’s names, and the two panels it had never
documented at all (`Physical Quality — which is weakest?`, `Exercise Risk
Hotspots`) were written up while the list was open.

The dashboard subtitle briefly explained the rename to the reader — “the same
panel the holistic report prints under this name” — and that clause was removed.
Every other subtitle on that page describes the DATA: units, ordering, the
caveat. This one described AIRMS. It is also self-defeating (a rename that
worked needs no announcement) and it is a prose assertion about another file’s
headings, which is the drift this very section exists to close, restated in copy
nobody greps. The cross-reference is a fact about the product, so it lives in
the manual, where it now is.

Reordering the manual’s panel list to **page order** — the only order in which
“the third card down” and “the third bullet” are the same thing — turned up two
more instances of the same defect, which is why the reorder was worth doing
rather than cosmetic:

- **`Direction of travel`**, the trend strip drawn at the top of every load, was
  not in the manual at all. The one panel on the page that says which *way*
  things are moving was the one panel undocumented.
- **`By sport / gender / age group / programme`** was a manual heading that
  exists nowhere on screen. It is the four slice tables *inside*
  `Where ⟨indicator⟩ concentrates`, which renders **only while a region focus is
  set** — so the manual named a panel that does not exist, and omitted the
  condition under which the real one appears. Now folded into the real heading,
  with the focus-conditional trio marked as conditional.

Left alone deliberately: heading capitalisation across that page is inconsistent
(`Where the squad stands` beside `Most-Flagged Weak Muscles`). It is cosmetic,
it is subjective, and it is not worth a thirteen-heading rewrite of a showcase
page days before assessment.

### 38. The squad page shipped two teammates' worth of somebody else's identity

`/athlete/squad` (C3, 2026-08-04) was built to a decision recorded with a viva
note: **same-sport readiness only — programme, band, indicator — and no peer
clinical detail**. The page honours it. Its API did not.

`GET /athletes/teammates` returned an `athleteId` per teammate. When C3 shipped
that was a roster serial. **Two days earlier, A2 had made the athlete key the IC
number** — so from 2026-08-04 the endpoint sent every squad member's national
identity number, which encodes date of birth, birth state and sex, to every other
athlete's browser. Sixteen of them, in one response, used by the page as a React
`key`. Neither change was wrong on its own; the defect lives in the seam, which
is why no review of either caught it.

It is worth being blunt about the shape of this: §18 renders the athlete's **name**
unreadable on-device before a screening image may leave the machine, and is
described in the report as the strongest defensible contribution in the system.
The same system handed out NRICs to draw a table. **A privacy control is a
property of the whole surface, not of the one place you were thinking about
privacy.** Teammate rows now carry no id; the caller's own row keeps one, since
identifying yourself to yourself discloses nothing. `gender` went too — nothing
rendered it.

**Also fixed: the amber band was drawn with a colour that does not exist.** The
file declared a private band map — the seventh — whose amber read
`var(--risk-med)`. The token is `--risk-moderate`. Green and red were right, so
the map looked correct in review and only the middle band rendered from an
invalid custom property. Now `BAND_COLOR` from `lib/bands`, which is what that
module was created for (§19 / §33).

**And the number nobody could read correctly.** The table lists the whole SPORT;
the Indicator column beside each name is normed against a much narrower cohort
(sport + programme + gender — five people, for the demo athlete, against a squad
of sixteen). Nothing said so, so "I am 3rd of 16" is the natural and wrong
reading of a column that ranked 3 of 5. The page now states its own cohort, its
size, and the small-group caveat when it is under ten (§33).

**What was added instead, once the leak was closed: the squad's SHAPE.** The
page answered "how many are in each band" with three tiles and "who" with a
table, and nothing in between — the §25 gap exactly, where three counts are
produced equally by a squad clustered in the middle and by one split between two
tails. It now draws the same `Histogram` the admin view uses, over every scored
indicator in the sport, with a **neutral** marker at the reader's own position
(a coloured vertical rule on a chart reads as a threshold, and this one is a
position). Aggregate, and strictly less identifying than the named table beneath
it.

One thing is deliberately NOT copied from the admin version: its note says the
centre sits at 50 by construction. **Here it does not.** That page draws a single
filtered cohort; a squad is a whole sport spanning several cohorts, and each
athlete is normed against their own — so the middle of this shape is the squad's
spread, not a guaranteed 50 (measured: median 48.5 across 14 scored Badminton
athletes, near 50 by overlap rather than by arithmetic). Copying the sentence
would have reintroduced, one panel later, the same conflation the context line
above it exists to prevent. Below five scored athletes the chart is skipped, on
§24's reasoning: a histogram of three is single-athlete spikes inviting noise to
be read as shape.

The marker's POSITION is now tested (`Charts.test.tsx`), not just its existence.
The pre-existing test asserted a marker renders and its label appears, which
passes with every marker pinned to the left edge — verified by pinning it there
and watching the two new cases fail while the old one stayed green. For a mark
that tells an athlete where they stand among their squad, where it lands is the
entire message.

**What was deliberately NOT added:** teammates' per-component scores, muscle
flags or trends. That is the C3 decision, it is recorded with the viva note
attached, and reversing it is a stakeholder call rather than a UI improvement.
The norms themselves needed nothing built — the athlete's own dashboard hero has
carried a `Measure / Score / Group / Difference (SD)` table since §21.

---


## 38. One card, four charts — and the two readings of a column (2026-08-25)

JC, on the Direction of travel card: *"this ... is the old design, and if you
apply certain filters it will not be this one, which is concerning."* Then, of
the replacement: *"whatever this coarse shit is."* Then the shape of the answer:
*"combine them, make a toggle ... maybe every 10 seconds it would change unless
the user made a toggle click, then there should be grids to make the bars more
obvious."*

Three defects, found in that order, each hidden by the one before it.

### 38a. The card rendered FOUR different graphics

`PeriodChart` branched on how many periods the selection produced:

| periods | what rendered |
|---|---|
| 1 | a text summary plus a composition breakdown |
| 2 | the metric change chart with throughput rows under it |
| 3 | full-width rows, and no chart at all |
| 4+ | stacked columns with a score line |

On the seeded data those map exactly onto the three grain buttons — Monthly 4,
Quarterly 2, Yearly 1 — so each click produced a different-looking panel under
one heading. Switching chart idiom is a strong signal and it was firing on a
property of the FILTER, not on anything about the data.

The threshold also contradicted its own comment. `COLUMN_MIN_POINTS = 4` was
justified for "one or two periods", but 1 and 2 both returned earlier, so it only
ever caught **3** — a case its rationale never argued for.

§26's reasoning survives: with two periods the comparison IS the content, and two
columns leave the reader to do the subtraction. So the change chart is still
drawn — BENEATH the columns rather than instead of them. The card keeps one
primary graphic across every grain and the comparison is an addition. One period
is still a summary, because that is not a threshold: there is nothing to compare.

### 38b. Bar height encoded headcount, which buried the mix

Throughput swings hard on a real screening calendar — 33 athletes one month, 4
the next. With height as the count, the band MIX (the point of the card) was an
unreadable sliver exactly in the periods where a small group most needs reading,
and a quiet month drew a *small* bar, which reads like a good one. It also spent
the vertical axis answering a programme question ("how many did we test") that
belongs to a different reader than the clinical one ("how are they doing").

Making every column equal fixed that and broke the opposite thing: volume
disappeared. **Each scaling hides precisely what the other shows**, which is the
argument for drawing both rather than choosing:

- a toggle — *Athletes tested* / *Band mix %*
- rotating every 10s until the reader clicks, then held. Content that keeps
  moving under somebody who has already chosen is the failure mode of every
  rotating panel
- the rotation announces itself and the toggle is the stop (WCAG 2.2.2), and it
  does not run at all under `prefers-reduced-motion`
- the headcount stays on the x-axis in BOTH views, because it is exactly what the
  share view cannot encode

### 38c. The score line had no axis

This was the original fault, and splitting the line into its own strip was the
wrong fix for it — it repaired the scale and threw away the comparison.

The line had been overlaid on the count axis, padded by 60%, with unlabelled
gridlines and its range never printed. Its slope was therefore an artefact of a
scale the reader could not see, which is the one thing a trend line must never
be. Nothing on the chart could be read without hovering, which is why it carried
a three-line footnote.

Both series now share one plot with **two labelled axes** — columns left, score
right, the right axis inked in the line's own navy so two identical-looking axes
do not leave the reader guessing which series reads which. Gridlines come from a
round-number step rather than `max/4` (33 athletes over four gives ticks at
8.25). The zoom is declared, as `DotPlot` already declares its own. The footnote
dropped to one line, which is the real measure of the change: the chart says what
it is instead of being explained.

### What it cost to get here

Three redesigns in one day, two of them wrong, and the corrections came from JC
rather than from the tests — every version passed. A chart's defects are
properties of the rendered page, the same lesson as §30.

Two tests were also found **passing by accident**: one asserted the string
`periodchart-score`, which is a prefix of `periodchart-scoredot`, so it held
whether or not an axis was ever labelled; another asserted a score value that the
SVG's own `aria-label` also contained. Both now assert the markup they mean.
Every guard was mutation-tested — restoring height-as-count, removing the
gridlines, `max/4` ticks, deleting the rotation notice, dropping the headcount,
removing the right axis, unwiring the change chart.

### Also on 2026-08-25

- **A prescription row halved by a page break.** HoloMotion's text layer emits a
  row's numeric cells BEFORE the tail of a name that wrapped across a page, so
  one row in 48 lost three words from its name (dropping the side it applies to)
  and the stranded `-2` suffix became the next row's number. Fixed by anchoring
  the row number to a whitespace boundary and appending text bounded by two rows
  to the preceding name — that fragment can only be the cell it follows.
  Strictness here means not LOSING printed text as much as not inventing it.
- **Lateral symmetry had been dropping Lower Limbs for every athlete.** The
  region list was retyped during the §33 extraction with `lower` for
  `lowerLimbs`. Silent by construction: `symmetryFindings` omits a region with no
  symmetry score, so a mistyped key is indistinguishable from a region the
  screening never captured. Four of the five call sites are in `pdfDraw`, so the
  printed table lost the row too — the extraction existed so the screen and the
  report could not name different sides, and they did not: they agreed, and both
  omitted the region that matters most in most sports. Three copies of that list
  existed; `symmetry.js` now owns it. `tests/symmetry.test.js` is new and pins
  the KEYS against the extraction schema, because the values were never wrong.
- **The API root returns a service descriptor** instead of `Cannot GET /`. It
  deliberately does not report health — `/api/health` earns that by running
  `SELECT 1`.
- **Git deploys work again**, with the trap that comes with them: reconnecting
  the repository re-registers the webhook AND silently resets Production Branch
  to the repo default, which here is the pre-MySQL `main`. See `docs/DEPLOY.md`.


## 39. A cleanup pass, and what measuring first protected (2026-08-25)

JC: *"optimize the code, the website css, the layout, the code comments to clear
up space."*

§31 and §37 had both already looked, so the honest expectation was that little
would be found. That held — but the search was worth running, because two of the
four findings were defects rather than fat, and one of them was mine from the
same morning.

### 39a. The CSS scan is mostly false positives, again

509 class selectors are defined; 51 are never written literally in the source.
Deleting those 51 would have broken thirteen features. All but two families are
composed at runtime — `bodymap-region--${tier}`, `risk-hero--${band}`,
`pdf-status--${state}` and so on — which is exactly the trap §37 recorded when an
automated pass nearly deleted live Module 1 styling.

Verifying each prefix against the source left **two** genuine finds:

- `.bodymap-muscle--{weak,tight,both}` — three rules nothing has ever used. The
  body map paints flags through `.bodymap-region*`; the string `bodymap-muscle`
  appears nowhere in the app.
- `.chart-hostable` — named in a CSS comment as though it were a rule. It has
  never been defined. The comment was the bug, not a missing rule.

**The lesson is the ratio, not the rules.** 51 flagged, 2 real. An automated CSS
scan on a codebase with dynamic class names is a list of suspects, never a list
of deletions.

### 39b. Two things this morning's chart work left behind

- `.slope-throughput` was orphaned when the change chart moved beneath the
  columns instead of sitting over throughput rows (§38a).
- Its test assertion, `expect(html).not.toContain('slope-throughput')`, had
  become **unfailable**: the class no longer exists anywhere, so nothing could
  make it appear. It now asserts the property it stood for — that a two-period
  selection draws no rows — which a mutation can still break.

That is the third assertion this week found passing for the wrong reason. The
pattern is always the same: a test that names a *string* rather than a
*behaviour* survives the change that made it meaningless.

### 39c. A layout defect, six hours old

`.periodchart-xaxis` reserved a 38px gutter on BOTH sides so each period label
sits under its own column. The left gutter matches the count axis, the right one
matches the score axis — but the score axis is conditional, and the gutter was
not. With no line to draw, every label sat 38px away from the column it names.

Invisible to all 136 tests, because it is a property of the rendered page rather
than of any value — the same class of defect as §30 and §38. Now a modifier
class, guarded by a test, confirmed by mutation.

### 39d. What was measured and found clean

Recorded because "we checked" is worth as much as "we fixed":

| checked | result |
|---|---|
| backend exported symbols | 232, **0** referenced only at their own definition |
| font-size literals bypassing the scale | 3, and all three are correct |
| border-radius literals in new CSS | 2, moved onto `--r-xs` |

The three surviving font-size literals are not drift. `html { font-size: 15px }`
is the root the entire rem scale is built on and must stay a literal. `.ring-value`
and `.ring-total` are SVG `<text>` inside a `viewBox`, so their units are user
units, not CSS pixels — a rem token there would scale against the wrong thing.
§29 collapsed 31 literals to 7 tokens and these three are the correct remainder.

---

## 40. The column and the segments inside it counted different things (2026-08-25)

Found by rendering the chart against payloads pulled from the PRODUCTION API
rather than test fixtures — the substance of a click-through, since no browser
automation is installed and adding it is a stack change.

The column height was the ATHLETE count. The bands stacked inside it were
counted per SCREENING. They agree only when nobody is screened twice inside one
bucket:

| grain | column said | segments summed to |
|---|---|---|
| Monthly (Jun) | 33 athletes | 33 |
| Quarterly (Q2) | 34 athletes | **42** |
| Yearly (2026) | 56 athletes | **74** |

Monthly agreed by luck, which is why it survived review: the seeded calendar
rarely re-screens anybody inside one month.

### Why per-athlete wins, and it is not a matter of taste

The decisive argument is internal. AIRMS already has a canonical meaning for
"band": `latestScreeningsByAthlete()`, used by the cohort scorer, the admin
distribution and the viva dossier, whose headline is **38 green / 9 amber /
9 red**. The yearly column drew **53 / 11 / 10** for the same population in the
same year. Two admin screens, one squad, two answers — and the one nobody quotes
was the one being charted.

The external literature says the same thing for the same reason. Clinical
reporting uses **patient-level rather than encounter-level denominators**
precisely because an encounter denominator counts the frequently-seen twice;
prevalence estimates shift by more than 20% on that choice alone
([Denominators Matter, PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6659575/)).
Our own gap was +24% at quarter and +32% at year.

### Is the HoloMotion report compatible with counting this way?

The objection deserves stating: HoloMotion issues one report per session, so a
quarter containing two sessions genuinely holds two assessments, and collapsing
them discards one.

It resolves. The band is not HoloMotion's — it is AIRMS's cohort-normed
escalation count, and "which band is this athlete in" is a claim about the
ATHLETE, not about a document. Every report carries a timestamp, so "their most
recent assessment inside this period" is always well defined, and a historical
period still reflects what was true then rather than what is true now. Nothing
in the source PDF resists it, and nothing is lost: the screening count survives
as `tests`, which is what Programme Activity plots.

### What was built

`bucketByPeriod` now returns TWO tallies and the difference is documented at the
point of divergence:

- `bands` — one per SCREENING. `seasonality()` ranks quarters by the share of
  flagged screenings, which is a statement about throughput; changing it would
  have moved a second feature to fix a first.
- `athleteBands` — one per ATHLETE, from their latest screening in that period.
  The only tally that sums to `athletes`, and therefore the only one that may be
  drawn inside a column whose height is the athlete count.

The chart, its in-slice counts and the legend row beneath it all read
`athleteBands`; the frontend falls back to `bands` if an older API response
lacks the field, so a stale deploy degrades rather than crashes.

### One definition of counting a band

The two tallies differ only in what they are handed — every screening, or one row
per athlete — so the counting itself is written once as `tallyBands`, and
`seasonality()` was migrated onto it as well. It had grown its own copy. Three
places applying `effectiveBand` by hand is three places for the clinical override
to be dropped, which is the failure `utils/bands.js` exists to prevent; a
mutation replacing `effectiveBand(r)` with `r.overallBand` in the shared helper
fails two tests, where before it would have had to be made three times.

Deliberately NOT done: fusing the three passes over `rows` into one. There are 74
screenings. §31's rule stands — measure before optimising, and three named loops
read better than one that does everything.

**Verified on the hosted database**: every bucket at every grain now satisfies
`sum(athleteBands) === athletes`, and the yearly column reads 38 / 9 / 9 —
identical to the dossier headline it used to contradict. Three mutations run:
counting every screening, keeping the earliest rather than the latest, and
making `bands` per-athlete too (which breaks seasonality's denominator). Each
caught.

---

## 41. Where the code lives (2026-08-26)

A structural review rather than a hunt for dead code. What was checked and found
sound, because "we looked" is worth recording:

| checked | result |
|---|---|
| frontend modules never imported | 0 of 80 |
| npm dependencies never referenced | 0 (4 frontend, 16 backend) |
| utils claiming purity that touch the DB | 0 — the one flagged case scopes its claim to a single function, correctly |
| logic living in route files | none; the module-level helpers there are data-fetching and route plumbing, which is what a route file is for |

The one real finding was **private reimplementations of things that already have
a canonical home** — the pattern this codebase has now hit five times (band
labels, risk indicators, symmetry regions, the region list, and here).

- `ScreeningPreview` carried its own `riskBand` with the thresholds INLINED
  (`v > 25`, `v > 15`) and its own colour table. That is the same value shown
  twice in one workflow: the operator checks a report in the preview, commits
  it, and sees it again on the panel — from two definitions nothing kept in
  step. `BAND_META`, `INSTRUMENT_BANDS` and `riskBand` now live in
  `lib/screeningAlerts.ts` beside the thresholds they read, and both consumers
  import them. Proven by mutation: changing `HIGH_THRESHOLD` in the lib now
  moves the preview, which it could not before.
- `ScreeningHistory` formatted dates as `toISOString().slice(0, 10)`. Wrong
  twice, on the one screen where it matters most: day-only, when the shared
  `fmtScreeningDate` goes to the minute precisely because **two screenings can
  share a day**; and in UTC, so a late-evening local assessment displayed as the
  following day.
- `DataBackupCard` read `localStorage.getItem('airms_token')` directly. A rename
  in `lib/auth.ts` would have left the backup export silently unauthenticated.

Three helper names still appear in more than one file and are correct: they are
local aliases of a canonical import (`const tier = tierMeta`), not second
implementations.

### Deliberately dead, and it must stay that way

A dead-code scan flags four things that are retained on purpose, so they are
listed here rather than rediscovered every audit: `lib/risk.ts` (the composite
model — no live callers since ACWR left the dashboards, locked and citable),
`WorkloadChart.tsx` and `AcwrGauge` (the ACWR rebuild path),
`archive/excel-upload/`, and `airms-prototype/`.

---

*Last updated: 2026-08-26 - **41** added: a structural review. 0 unimported modules of 80, 0 unused dependencies, 0 false purity claims, no logic stranded in route files - and one real finding, three private reimplementations of things that already had a canonical home, including an import preview that banded risk against its own inlined thresholds and a screening history that printed day-only UTC dates on the one screen where two screenings can share a day. Previous: 2026-08-25 (bands) - **40** added: the Direction of travel column counted ATHLETES while the bands stacked inside it counted SCREENINGS, so the yearly column drew 53/11/10 where every other surface in AIRMS says 38/9/9 for the same squad. Fixed by counting each athlete once per period from their latest screening there - the patient-level denominator clinical reporting uses for exactly this reason - while leaving the per-screening tally for seasonality, which legitimately needs it. Found by rendering the chart against production payloads rather than fixtures. Previous: 2026-08-25 (cleanup) - **39** added: a cleanup pass that mostly confirmed there is nothing to clean - 51 CSS classes flagged as unused, 49 of them composed at runtime, and 0 unused backend exports of 232 - but which found two real defects instead of fat: a test assertion that had become unfailable because the class it named no longer exists, and an x-axis gutter reserved unconditionally for a conditional axis, so every period label sat 38px from its own column whenever there was no score line. Both were six hours old. Previous: 2026-08-25 - **38** added: the Direction of travel card rendered FOUR different graphics depending on how many periods the active filter produced, and the fix took three attempts - two of which JC rejected on sight, because a chart's defects are properties of the rendered page and every version passed its tests. Columns now serve every grain, with the change chart beneath rather than instead; height offers BOTH readings (headcount and band mix) on a 10s rotation that stops the moment the reader chooses, because each scaling hides exactly what the other shows; and the score line is back over the columns with a labelled right-hand axis, the original fault having been the missing axis rather than the shared plot. Two tests were found passing by accident. Also: a prescription row halved by a page break, and lateral symmetry that had been silently dropping Lower Limbs for every athlete on screen and on paper alike. Previous: 2026-08-20 - **37** added: a whole-project audit for dead code, responsive defects and useless content, whose main finding is that there is almost nothing left to cut - 0 unused dependencies, 0 orphaned backend files, 8 dead CSS rules of 479. Five automated findings were FALSE and are recorded as such, including one that would have deleted live Module 1 styling. The one real content defect: the dashboard and the holistic PDF drew the same two panels under different names - and the first fix was one surface short, reconciling the screen with the report while the user manual went on using the old names. Putting the manual into PAGE order then found two more: the trend strip drawn on every load was undocumented, and one manual heading named a panel that exists nowhere on screen (it is four tables inside a focus-conditional one). Previous: 2026-08-19 (deploy) - **36** added: the schedule left the web process. `npm run mail:tick` runs one pass and exits for an OS scheduler to drive (a Windows task script, a cron line, MAIL_SCHEDULER=off), sharing ONE `tick()` with the interval. Making two tickers normal exposed that "safe to run twice" was asserted and false - the marker is written after the send, so both processes send - now enforced by a compare-and-swap lock, proven with six simultaneous ticks. Two bugs were written while writing that lock, both invisible to a passing race test: a release that never matched (JSON column) and a bare catch that disguised a broken INSERT as permanent contention. Previous: 2026-08-19 (mail) - **35** added: every scheduled email worked and none could be OBSERVED. A failed send reached only console.error on a host designed to run unattended, so the outcome of the last attempt is now persisted and shown in red when it failed; "send now" was added because the existing control waits an hour, and it skips the DUE check only - never the institution's on/off switch; audited as `mail.send` rather than `settings.update`, because it is the one control there that puts athlete data in an inbox. Two accounts with deliverable inboxes were added (not swapped) so the executive digest copy and the coach's sport slice can be seen ARRIVING. Verified against a real send and a real failure, and by mutation. Previous: 2026-08-19 (last) - **34d** added: the §34b Total Score derivation was missing from the seeder's OTHER screening producer, so 18 prior snapshots nudged Total Score while copying ROM, stability and symmetry unchanged - arithmetic the instrument cannot produce (residual 2.94 vs 0.27 on the latest rows). Fixed by nudging the components instead, which leaves the trend identical; the existing rows were patched in place rather than reseeded, because a reseed would have cost the pin and the audit trail again. Seeding more repeats to make the detectable-change threshold compute was deliberately refused. Found while measuring the numbers for the new FYP II viva dossier. Previous: 2026-08-19 (later still) - **34** added: min_cohort_n stays at 5 because raising it trades sampling variance for systematic bias (the ladder's next rung compares women against men), and the seeder now DERIVES Total Score from the subitem table as the instrument does - residual fell from 9.9 to 0.94 against a documented <=1.2, and the predicted collinearity duly appeared (totalScore x rom 0.05 -> 0.70). Includes a mistake worth recording: `require()` on seeder.js reseeds the database, because the module executes on import. Previous: 2026-08-19 (later) - **33** added: a sports-medicine review of all five role dashboards. Green stopped being "Safe" (a screen that cannot predict injury cannot certify its absence, and green is where false reassurance lands) - which exposed that green was missing from the single band map entirely, so two files had grown private copies; the screening's AGE and recall state now appear on the hero, classified by one extracted rule the recall email also reads; small cohorts declare themselves (49 of 58 athletes are scored against fewer than 11 peers); asymmetry became a percentage where it is a threshold, deliberately not where it is z-scored; one review finding was WRONG and is kept visible with the correction. Previous: 2026-08-19 - **32** added: the norm floors stay off (excluding low scores from a norm computed on those very scores is selection on the dependent variable - it biases the mean up, shrinks the SD and over-flags everyone left in), and the norms in force are now a named, PINNED set, verified by recomputing while pinned with 50 of 50 cohorts holding. Previous: 2026-08-18 (later) - **31** added: an optimisation pass that measured first and found no performance problem to fix (no N+1, indexes present, 62 athletes and 77 screenings), then fixed the real one - a single clinical decision, the seven shown indicators and the LDH exclusion that rides with them, hand-maintained in eight places whose comments pointed at each other; now one definition per package, pinned by tests, verified byte-identical output. Plus the auth branding panel that was four copies of the institute's address, extracted and proven pixel-identical. Previous: 2026-08-18 - **30** added: six reports were printed and read as documents, finding three defects no unit test could see - a change chart whose longest bar was a sub-threshold move labelled "steady" (the dead band is now drawn, and bars inside it are outlined rather than filled), a fixed-width value column that overprinted the row beneath it, and a team report that described the squad's body twice in words and drew it never (the squad body map, fed the same means as the heatmap beside it). Previous: 2026-08-16 - **29** added: the interface was put on one type, radius and spacing scale - 31 font-size literals and 11 radii collapsed to 7 and 4 tokens, and the 160 inline font sizes in the markup that had been bypassing the stylesheet entirely; nine dead rule blocks removed; and a note on the grouped-selector regex that deleted a live responsive rule in the process. Previous: 2026-08-12 - **27** and **28** added: the improving/steady/declining dead band is now a DERIVED minimal detectable change (typical error from repeat screenings) that declines and says so when the data cannot support one, plus rescreen recall, per-athlete trend sparklines and percentile framing; and the app gained a narrow layout at all, the bulk of the sideways scroll tracing to `min-width:auto` on one flex column. Previous: 2026-08-11 (really final) — **§26** added: two periods draw a CHANGE CHART, one diverging bar per metric on a shared DELTA axis (this shipped first as a slopegraph and was scrapped the same day: a shared VALUE scale across non-commensurable metrics collapsed the lines into overlapping pixels) — which is how "ROM fell 5.2 while stability rose 2.6" became visible at all) and one period shows the finer buckets it is composed of instead of a number and an apology. Previous: 2026-08-11 (final) — **§25** added: three new graphics on Screening Analytics — a cohort-level squad body map reusing the licensed figure, a risk-vs-movement scatter with median-split quadrants (which finds 13 athletes who move well AND score risky, invisible to every averaged panel), and an indicator distribution histogram. Previous: 2026-08-11 (last of the day) — **§24** added: the period chart now draws a CONTINUOUS calendar axis (an unscreened period is the finding, not an absence), renders a single period as a summary rather than a lone bar, and labels each grain with how many periods it would draw so quarterly/yearly announce their own thinness before being clicked. Previous: 2026-08-11 (later again) — **§23** added: the admin dashboard now charts the 25-cell subitem table as a matrix and, for the first time anywhere in AIRMS, surfaces LEFT–RIGHT asymmetry — the only bilateral data the report carries, previously collapsed three different ways. Counts rather than mean gaps, because the means are flat and the counts are not. Previous: 2026-08-11 (later still) — **§22** added: cohort norms can now be PINNED, not merely saved — a pinned version is held against imports, reports its own drift from what the data would say, and cannot be deleted or restored over while in force; a NOT NULL settings column that would have made release impossible was found and fixed by live verification. Previous: 2026-08-11 (later same day) — **§21** added: the hero now shows HoloMotion's printed Total Score with a signed per-component cohort comparison and a two-sided reason list, the derived 0-100 indicator having been the thing nobody could explain; the below-mean escalation became a -0.5 SD cutoff rather than a sign test; one shared indicator payload. Previous: 2026-08-11 — **§20j** added: the shared dashboard components now take `historical` (so the history views stop speaking in the present tense) and the risk hero takes `audience` — the latter fixing a live bug in which the medical and coach dashboards addressed the clinician as the at-risk athlete. Previous: 2026-08-10 (later same day) — **§20g–i** added: the digest attaches the holistic report by sharing its code rather than rebuilding it (fetch/draw extracted, verified byte-identical), per-user email opt-out under the institution switch, and seasonality that declines to name a season below two years of data. **§20f** revised — the 14 remaining inline band-precedence reads were migrated after all. Earlier same day: **§20** added: accountability (audit trail that copies the actor, fire-and-forget writes), immediate norm eligibility with one-time disclosure, deep muscles marked rather than drawn, alerts grouped per recipient, the monthly digest's marker-not-cron design, and one band vocabulary in `utils/bands.js`. Previous: 2026-08-06 (later same day) — **§19** added: one status palette across CSS, inline styles, Chart.js and the PDF reports. An audit found the PDF had a second band palette (and disagreed with its own tier colours), the radar's threshold red was a non-theme-aware literal, the 60/75/85 tier was defined five times with two different words for its lowest band, and eight CSS-variable fallbacks still carried the retired PDF palette. Earlier same day: **§4a** added: the body map's Muscle Flags mode now draws HoloMotion's 22 individual muscles by re-slicing the same MIT-licensed geometry (16 recovered from existing sub-paths, 6 deep ones as measured insets, selection by geometry not index, test-guarded); supersedes the aggregation half of §4 while leaving the asset and its attribution locked. Previous: 2026-08-03 — §18 on-device name redaction before vision extraction (Tesseract-located, page-1-only, fail-closed; verified against both HoloMotion layouts). Previous: 2026-07-20 — Activity Tracking (the FYP I Module 1) fully removed at JC's request; §1, §2, §3, §10 and §16 annotated to mark their decisions as locked-but-dormant (no live caller) rather than actively running. The six-module set was restructured the same day to fill the gap this left — see `MASTER_CLARIFICATIONS.md §4` for the current numbering. Previous: 2026-07-19 (§16 gains the per-indicator escalation — threshold + peer-outlier, z ≥ 1.5, admin toggle, persisted factors), 2026-07-18 (§17 coach one-sport + athlete detail view + event disciplines), 2026-07-13 (§16 FYP II cohort-normed overall indicator + ACWR demotion), 2026-07-06 (§15 dashboard-embedded screening), 2026-06-28 (§13–14).*

## 42. The account lifecycle, and two ways an institution locks itself out (2026-09-01)

Adding `admin` and `executive` to the Personnel page was a two-line change to a
`<select>`. Everything that broke around it was code written when there were
only ever two roles, and none of it announced itself.

**The endpoint had accepted four roles for weeks; the form offered two.**
`INVITABLE_ROLES` in `routes/users.js` has listed `medical, coach, admin,
executive` since it was written, but the page had its own narrowed
`type Role = 'coach' | 'medical'`. So Dr Thung — who *is* the administrator —
could not create a colleague or an executive at all without somebody editing the
database. Nothing failed; the roles were simply absent from a dropdown.

**Three controls assumed a binary.** The submit button read "Create medical
staff" while Administrator was selected. The "Full clinical access" box was the
*else* branch of "is this a coach?", so it promised clinical access to an
executive — the role defined by writing nothing. And the Active/Inactive badge
was **dead**: `PATCH /users/:id` returned early for anything that was not
medical or coach, so `isActive` never ran. An executive who left ISN could not
be switched off.

All three were found by rendering the page and looking at it, not by reading the
diff. The diff was correct; the page was wrong.

### The two guards

Deactivation is the one action here an institution cannot undo through its own
interface — the way back is the database. Two guards:

* **You cannot deactivate your own account.** Verified live: 409.
* **The last active administrator cannot be switched off.**

The second is **unreachable today**, and is kept anyway. An actor must be active
(the auth middleware re-reads the row on every request) and must be an admin, so
if the target is the last active admin then the target *is* the actor, whom the
self-check has already refused. It stays because the two protect different
things: one says you may not remove your own access, the other that the
institution must keep an administrator — and only the second still holds if a
later route lets anything other than the owner switch an admin off. The route
comment and the test both say this, rather than implying a live path. That
distinction matters here: `winAnsiSafe` once shipped defined, exported,
unit-tested and never called (§30f), and the lesson was that a test passing
tells you nothing about whether the code runs.

### Deactivation is immediate

`middleware/auth.js` loads the user row on every request and rejects an inactive
one, so switching an account off ends its session on the next click rather than
when the 7-day token expires. This was already true; it was not written down,
and it is the property an administrator needs when somebody leaves.

### Least privilege you can see

The role picker now lists what the chosen role can and cannot reach, updating as
it is chosen, with the administrator option marked. `admin` sits directly under
`medical` in the list and the mistake between them is silent — one of the two
can create accounts and move the cohort norms. Least privilege only means
something if the person granting it can see what they are granting.

The restrictions read "Cannot …" in words. The `+` / `–` markers are `::before`
pseudo-elements and the colour is decorative, so a screen reader heard a
restriction as a capability — the same WCAG 1.4.1 rule the band vocabulary
follows (§33).

### The pin

`tests/accountLifecycle.test.js` pins the two packages' role lists to each
other, in the direction that fails silently: a role the endpoint accepts but the
form does not offer is uncreatable with no error anywhere. The reverse crashes
loudly (`ROLE_INFO[role]` undefined), so it needs no guard. Mutation-tested —
removing the executive option, and adding a role to the backend alone, each fail
it. This is the same remedy as §31, for the same reason: a comment pointing at
the other file documents the hazard without preventing it.

---

## 43. What a scoped role may LEARN, which is not what it may call (2026-09-02)

`rbac()` answers "may you call this". It says nothing about what comes back, or
about what a refusal itself tells you. Auditing the four non-admin roles by
calling every endpoint as each of them (46 at the time) - rather than by reading the guards -
found the role model sound and two disclosures underneath it.

**The role model itself held.** Every write is refused for coach, executive and
athlete (21 write probes, all 403). `executive` has no write reach anywhere,
which is the property that names it. Coach is refused every athlete outside
their sport across detail, history, individual PDF and team PDF; athlete is
refused every record but their own. Each of the three medical capabilities has a
matching `requiredPermission` on both the page and the route, so a revoked one
hides the nav entry, blocks the page and 403s the API — no dead controls, and
`/admin/thresholds` correctly withholds pin/restore/delete from medical and says
so in its own copy.

### A refusal is an answer

A coach could tell a real IC number from an invented one:

```
/athletes/030109371036          (real, other sport)  -> 403
/athletes/000000000000          (not real)           -> 404
```

`isForeignAthleteRequest` already reasons about exactly this and refuses
**before** the lookup, because "a 404 for an unknown id and a 403 for a known one
would tell an athlete probing IC numbers which ones are on the roster". The
coach's scope compares `sport`, so it *cannot* run before the row is loaded —
and every route that loaded first answered 404 for a stranger and 403 for a
foreigner. The care taken for one scoped role was structurally unavailable to
the other.

`notFoundStatusFor(user)` returns 403 for coach and athlete and 404 for everyone
else, so a missing row and a forbidden one are one answer. Three sites use it:
`/athletes/:id`, `/screening-reports/individual/:id.pdf`, `/screenings/:id/full`.
It fails **closed** on a missing user. This matters because the IC encodes date
of birth, birth state and sex — the stated reason `/teammates` withholds it — so
confirming one is on the ISN roster discloses something real.

A bare 404 elsewhere in those files is correct and deliberately left: nothing
`PATCH /:id/injury` looks up is scoped, because the route is medical-only.

### Granting by omission

`serializeAthlete` and `serializeAthleteList` build their result by spreading the
row, so every column on the model shipped to every role that could read one.
That put `injuryNote`, `injuryBy` and `injuryAt` — the clinician's free-text
working record — on coach and executive payloads. Nothing renders them outside
the medical dashboard and the admin cohort-members panel, and the seed holds
zero injured athletes, so it was invisible and would have appeared the first
time a clinician used the flag.

Both serialisers now take a `viewer` and strip those three unless the caller is
`medical` or `admin`. **`isInjured` deliberately stays for everyone** — it is a
roster fact a coach needs and the institution's coverage figures rest on, and
stripping it would be the opposite mistake.

The structural half matters more than the field: an allow-by-omission serialiser
means the *next* column added to `Athlete` ships to every role automatically.
`users.js` already does the opposite, with an explicit `attributes:` list and a
comment about this exact property. `viewer` is optional in the signature and the
omitted case **withholds**, so a call site that forgets to say who is asking
under-discloses rather than over-discloses.

### Why the tests read the route source

`tests/athleteDisclosure.test.js` is 20 cases, and the last four read
`routes/*.js` as text. The predicates are pure, so they pass whether or not
anything calls them — the `winAnsiSafe` failure, and the one that left
`isForeignAthleteRequest` correct and unreachable for weeks. All seven guards
were mutation-tested: un-scoping the coach, failing open on a missing user,
adding `executive` to the note allow-list, dropping either strip, reverting the
route to a bare 404, and dropping `req.user` from a serialiser call each fail
between 1 and 5 cases. Re-probed live afterwards: all eight enumeration probes
uniformly 403, and the roster field diff shows medical retaining exactly the
three fields executive lost.

### Left alone, on purpose

`medical` cannot reach Screening Analytics (`/athletes/analytics/screening`,
403). Consistent with the sidebar and deliberate — those two endpoints are
institutional oversight — but Screening Analytics is squad *shape*, which is
arguably more a physiologist's tool than an administrator's. Recorded here
because it is a judgement worth defending rather than a gap to close quietly.

`coachSport` is on neither `/auth/login` nor `/auth/me`, and that is harmless:
the coach pages read their sport from `/coach/readiness` and handle the null case
explicitly, and `SessionUser` does not declare the field, so nothing can reach
for it.

---

## 44. The defect class, swept deliberately (2026-09-02)

Nearly every real defect in AIRMS has been the same shape — *a wrong answer that
looks like a right one* — and after the fourth in a fortnight it was worth
hunting rather than stumbling over. [`docs/SILENT_FAILURES.md`](SILENT_FAILURES.md)
names the six sub-patterns, the hypotheses that sweep for each, and the standing
guards. This section records what the first sweep changed.

**Five fixes.** Three CSS custom properties were used and defined nowhere, which
does not warn or throw — the declaration is invalid at computed-value time and
the property silently falls back. `--primary` on `.bm-card-item:focus-visible`
computed `outline: none`, and because that rule is *more specific* than the
global `button:focus-visible` gold ring it removed the keyboard focus indicator
from six body-map rows; measured in Chrome, `outlineStyle: "none"` there against
`solid 2px rgb(245,197,24)` on every other button. `--text-primary` left the
active muscle inheriting its parent's `stroke`; `--bg-secondary` left the audit
page's JSON block with no panel.

`getSettings()` caught its own database error and returned `[]`, so every caller
received a complete, plausible settings object assembled from DEFAULTS. The
dangerous key is `pinned_norm_version_id`: unset, **a pinned norm silently
releases** and those athletes are scored against live norms rather than the
approved snapshot — different clinical numbers, nothing on screen. The catch was
incidental to the file's creation, not a diagnosed need, and `getSettings` is not
called at boot, so it now throws. If that table cannot be read the database is
down and the rest of the request is about to fail regardless.

The coach's readiness tiles summed to **88%**. Three band tiles were denominated
over the whole squad while two of sixteen athletes had no screening at all, so
they appeared in no tile and no bar segment and the stacked bar stopped short of
its track — reading as a rendering artefact rather than as two missing people.
The card immediately beneath already used the right denominator ("10 of 14
*screened* athletes"). Percentages are now over `coverage.scored`, and the
unscreened are stated in their own line: a band is a claim about a screening, so
an athlete without one is not "not cleared", they are unknown, and what they need
is a first assessment rather than a review.

`serializeGeneric`, `serializeMany` and `withStringId` had zero callers anywhere
including the tests, under a header comment asserting "every route emits its rows
through one of these helpers". Removed, and the header corrected — a comment
asserting a convention nothing follows is worse than no comment, because the next
person extends the dead branch.

**Four hypotheses came back clean**, which is recorded rather than discarded so
the next sweep does not re-tread them: no aggregation util produces `NaN` or
`Infinity` on empty or degenerate input (20 cases; `!st.sd` guards every z-score
site and `compositeZ` guards the empty case), all 16 nav links resolve, no
`x || fallback` swallows a legitimate zero, and the cross-package vocabularies
have not drifted.

**The new guard is `frontend/src/lib/cssTokens.test.ts`**, which asserts every
`var(--x)` used without a fallback is defined, and reports `token used at
file:line`. It guards a class rather than an instance — this is the third time an
undefined token has shipped. It carries a corpus assertion so that neutering the
file walker cannot make it pass vacuously, and it was mutation-tested by
reintroducing `--text-primary`.

---

## 45. The three sweeps that were left open (2026-09-02)

§44 named three areas as unswept rather than implying they were clean. These are
their results. Two produced real defects; both were latent, and one is aimed
squarely at the stakeholder demo.

### The calendar a screening belongs to

`periodKeyOf()` bucketed with `getUTC*()`; `fmtScreeningDate()` rendered with
`toLocaleString(undefined, …)`, the viewer's zone. Hosted, the API runs in UTC
and a clinician's browser runs in MYT, so a screening between 00:00 and 07:59
local sits on the previous UTC day — and across a month end the trend chart drew
it in one column while the row beneath carried a date in the next month.
Seasonality is where that matters most (§24).

Both packages now name one `INSTITUTION_TZ = 'Asia/Kuala_Lumpur'`. A screening
belongs to the day it happened at ISN, and a coach opening the dashboard abroad
should read what their colleague in Bukit Jalil reads. Verified before shipping
that re-bucketing all 74 rows in that zone moves none of them at any grain — a
fix for data not yet collected, not a restatement of published numbers. One
existing assertion legitimately changed: `2026-03-31T23:59:59Z` is Q2 at ISN,
and the test now says which calendar it is asserting.

### A duplicate commit was counted as a retest

The screening commit was an unconditional `INSERT` and `(athlete_id,
assessed_at)` is not a unique index, so the same report committed twice appended
an identical row — which `consecutivePairs()` then paired as a retest with a
difference of zero on every score.

Two such commits take the engine from 18 pairs (declining, dead band 2, labelled
an assumption) to 20 pairs and a **derived** dead band of 5.7–11.5. That is the
failure `reliability.js` exists to prevent, reached by inflating the numerator
rather than lowering the floor — the direction nobody was guarding. And it is the
expected path, not an edge case: the demo hands the same three reports to two
people.

Fixed at both layers. The commit is idempotent on `(athleteId, assessedAt)`,
matching the intent already stated for the muscle-flag and event replaces; and
`consecutivePairs` collapses readings sharing an instant, because two rows at the
same moment are not a retest whatever produced them. Verified by driving the live
endpoint — same payload twice gives one row, a later session still appends.

A unique index would additionally close the TOCTOU window between the `findOne`
and the `create`. It needs an `ALTER TABLE` on two databases and the realistic
case is two people minutes apart; recorded in `SILENT_FAILURES.md` rather than
forced through during demo preparation.

### The documents

The viva dossier and `MODULES_STATUS.md` were already correct.
`PROJECT_GUIDE.md` carried the same stale "19 pairs", and `JC_CHECKLIST.md`
claimed 19 of 62 athletes carry an active injury — describing the `Injury` model
deleted on 2026-08-02, where the surviving flag is set on **none** of them.
Marked superseded in the file's own convention, since the entry records
something that was once true.

### On the guards themselves

A mutation run caught a test of mine that was not doing its job: asserting the
`Screening.update` call *exists* passes when it sits inside `if (false)`. The
assertion now pins the branch. The mutation harness had the matching flaw — it
counted any non-zero exit as "caught", so a test file that failed to **parse**
scored as a pass; it now requires the suite to have actually run. Both are the
same shape as the defects being hunted, which is the argument for mutation
testing rather than a reason to distrust it.

---

## 46. Closing the last two, and the index that had to wait (2026-09-02)

§45 left three things open. All are now closed.

### One recompute at a time, across processes

`postImport.js` serialised recomputes **within** a process with an `inFlight`
promise. §36 made a second process normal, and the hosted API can run several
instances. Rebuilding rewrites `cohort_thresholds` while rescoring reads them
back, so two overlapping passes can publish an indicator assembled from part of
one norm set and part of another.

Ten call sites ran that sequence directly. They now go through one
`utils/recompute.js` taking the same cross-process lock as the scheduled mail —
a function rather than a lock repeated ten times, because ten call sites is how
`riskIndicators` came to live in eight places (§31) and a recompute that forgets
the lock looks exactly like one that takes it.

The two entry points differ on purpose. `recomputeAll()` **queues** for the lock
and **throws** on timeout: every caller reports a count to somebody watching a
screen, and returning zeros would say "recomputed nothing" where the truth is
"did not recompute". `tryRecomputeAll()` yields immediately for background work,
and the import queue **re-queues its batch** — the winning pass refreshes the
norms institution-wide but knows nothing about this batch's alerts, so dropping
it would mean a flagged athlete silently never gets emailed.

Verified against the real database: six simultaneous attempts gave one run and
five refusals at max concurrency 1; six queueing attempts gave six runs, still
at concurrency 1; no lock row survived.

### The unique index, applied

`(athlete_id, assessed_at)` is now UNIQUE. The application check added in §45
handles the real case — two operators minutes apart — but its `findOne` and
`create` are separate statements, so simultaneous commits can both find nothing
and both insert. Only the engine closes that. Confirmed to reject a duplicate,
to allow multiple **undated** screenings (MySQL treats NULLs as distinct, which
is wanted: an undated row matches nothing so it always inserts), and to allow a
genuinely later session.

**The hosted database still needs it.** `.env` here points at localhost and
there are no Aiven credentials on this machine, so the statement and its
duplicate pre-check are recorded in `CLAUDE.md` gotcha 3 rather than run. The
seeder needs no change: the existing 74 rows came from it and contain zero
duplicates, which is the evidence — reseeding to prove it would have destroyed
the pinned norm version, exactly as it did once before (§32).

### The report figures had drifted

The ERD and FDD are figures in a graded document that no test reads.

`erd-corrected.html` (Fig 4.9) said **eight tables**; there are nine.
`audit_logs` has existed since 2026-08-10 and had never reached it. It is drawn
with **no relationship line**, deliberately: there is no foreign key to `users`
because the actor's name and role are copied onto the row, and a trail that
re-reads its actor through a join changes when somebody is renamed or deleted.

`fdd-updated.html` (Fig 4.1) was missing two Module 5 leaves — UC-54 *View
Activity Log* and UC-55 *Generate Programme Activity Report*, both already in
`REPORT_TABLE_4-1.md`, the authority for Chapter 4. 46 leaves became 48.

Both were caught by **rendering the page and looking at it**, and the habit paid
immediately: the first ERD edit fixed the footer to "Nine tables" and left the
*subtitle* saying eight. Reading the diff would not have found that.

`panel_slides.html` and `risk-algebra-slide.html` are ACWR-era FYP I artefacts
and are left alone — `REPORT_EDIT_PACK.md` already records what is stale in
them, and rewriting frozen history is not correcting a current figure.

---

## 47. The use-case diagrams, reconciled against Chapter 4 (2026-09-02)

The last figures nobody had checked. `REPORT_TABLE_4-1.md` holds 60 use cases and
is the authority for Chapter 4; diffing the diagrams against it by label found
**seven** use cases present in the table and in no diagram — UC-48/49/50
(invitation onboarding and notification preferences) missing from the General
Module diagram, and UC-51/52/53/56 (norm pinning, scheduled mail, forcing a mail
run, prescription extraction) missing from the data-management one. Every one is
a feature added after its diagram was drawn.

`uc-general` was also missing the **Executive actor** entirely, though UC-49 and
UC-50 both name it and the role has existed since 2026-08-08. Its caption still
said "all four roles" and described personnel management as "creating a coach or
medical account", both superseded by §42.

The activity diagram was invalidated by *this session's own work*: it said the
commit "appends immutable screening snapshot", which stopped being true when the
commit became idempotent (§45). It now says the snapshot is keyed on
(athlete, assessed-at) and that a re-import updates rather than duplicates. A
figure can be made stale by the commit that fixes the code — an argument for
reconciling the two together rather than leaving the diagram for later.

All corrected, re-diffed to zero unmatched, and rendered and read.

**Two notes worth keeping.** The first attempt at the data-management fix
anchored on the string `"divider"`, which also appears in that file's header
prose, so it shifted Module 3 along with Module 4 — and *still rendered
plausibly*, as a taller box with its contents sitting lower. Only comparing the
coordinates against their expected values caught it, which is the same lesson as
everything else in `SILENT_FAILURES.md`.

And an inconsistency **inside** the authority is left for JC rather than
patched: UC-1 to UC-4 list four actors and omit Executive, while UC-49 and UC-50
include it. An executive must log in to activate their account, so the omission
reads as an oversight — but `REPORT_TABLE_4-1.md` is the authority, and editing
an authority to agree with a diagram is the wrong direction of travel.

---

## 48. What a failure says, and what a parameter is allowed to be (2026-09-02)

Three hardening fixes and one retraction.

### One place decides what a failed request reveals

49 route handlers ended `catch (err) { res.status(500).json({ message: err.message }) }`,
which hands the driver's own words to whoever asked. Measured against the running
server: `?from=not-a-date` answered *"Incorrect DATETIME value: 'Invalid date'"*,
and `?gender[$ne]=Male` answered *"Invalid value { '$ne': 'Male' }"*. Neither
matters alone. Together they confirm the engine, the ORM, and that a parameter
reached a query unexamined; a unique constraint would have volunteered its index
name.

`utils/httpError.js` decides once, and the rule is about **intent, not status**:
a 4xx keeps its message because a 4xx is a statement about the request and was
shaped deliberately; anything marked `expose` keeps its message, for operational
failures that are genuinely the caller's business; everything else is our fault,
so the caller gets one generic sentence and the server gets the real error with
the route that produced it.

The opposite mistake would have been worse, and this project has made it before:
a blanket "something went wrong" would also have swallowed *"Could not render any
pages from the PDF"* — which is precisely what the operator uploading it needs to
read. Those three extraction errors and the two vision-provider failures are
marked exposable for that reason.

### A query parameter is a string, or it is a 400

Express turns `?sport[]=x` into an array and `?sport[$ne]=y` into an object, and
both reached Sequelize unexamined. The array form quietly produced an
**undocumented multi-select** — 28 rows from a filter nobody designed, tested or
described in Chapter 4. The object form was refused by Sequelize (so: no operator
injection) but reported as a *server* fault. `utils/queryParams.js` asserts the
shape and answers 400, which is the truthful status.

Separately, `Op.like` was interpolating the raw search term, so `%` matched the
entire roster and `_` matched any character. A correctness bug rather than a
security one, and invisible: more rows than expected reads as a generous search.

### The retraction: there was already a rate limiter

I reported "no login rate limiting — 25 wrong passwords in 5.6s, no lockout" and
built a per-account throttle for it. The finding was wrong and the fix was worse.

`server.js` already mounts `express-rate-limit` across `/api/auth`: 30 failed
attempts per 15 minutes per IP, `skipSuccessfulRequests: true`, commented with
the reasoning that a demo signs in and out repeatedly and successfully and must
never be throttled. (That option was **removed on 2026-09-11** — it un-counts
from a post-response hook a serverless host never runs, so the deployed limiter
was counting successes. The policy is unchanged; a successful sign-in now
forgives the failures before it, awaited inside the request. See
`SILENT_FAILURES.md` 3r. The account below is left as it was written.) **My probe made 25 attempts against a limit of 30** — it was
incapable of producing a positive result, and I read its silence as a finding.

The throttle I wrote then demonstrated the hazard it was supposed to avoid: its
first version locked an address for fifteen minutes after five failures, and the
probe proving it worked locked the demo administrator out of their own account —
the denial-of-service lever NIST SP 800-63B §5.2.2 warns about, met head-on. It
was reverted in full, because a second limiter with a different threshold and a
different message is precisely the drift §31 and §42 exist to prevent.

Two real limitations of the existing limiter are recorded rather than fixed: the
default store is in-memory, so several instances keep several counters; and it is
keyed by IP, so it does not bound guesses against one account from many
addresses. Both want a shared store; neither justifies a second control days
before a stakeholder demo.

---

## 49. Optimisation: one duplicated constant, and a lot of measurement (2026-09-02)

Asked to optimise, the honest first step was to find out whether anything was
slow. Mostly it is not, and the numbers are recorded here so the question does
not have to be re-opened — and so "did you consider performance?" has an answer
better than an opinion.

### What was actually wrong: a constant written three times

`SMALL_COHORT = 10` — the peer count below which a cohort caveats itself — was
declared in the risk badge, in the individual PDF route, and in the measurement
script. Each carried a comment naming the others, which is the §31 pattern:
a comment documents the hazard without preventing it. One of those comments had
already drifted into a **falsehood**, claiming the value was "read from the
component rather than retyped" in a file that retyped it.

There is now one backend definition in `utils/cohorts.js`, imported by both
backend callers. The frontend keeps its own because there is no shared types
package, and `cohorts.test.js` pins the two — mutation-tested by drifting each
side and by making the report restate it. `median()` was likewise
re-implemented in the measurement script and now comes from
`screeningPeriods.js`: a script that computes its own median will eventually
report a number the screens do not, which is precisely what it exists to detect.

### What was measured and left alone

| | |
|---|---|
| Queries per endpoint | **2–9, independent of roster size.** No N+1 anywhere — the batching helpers do their job |
| Endpoint latency | 3–75 ms (heaviest: holistic PDF at 75 ms) |
| Payloads | 12–79 KB (heaviest: `/cohorts`, which carries both pinned and fresh stats by design) |
| `latestScreeningsByAthlete()` | 3 ms at 62 athletes; ~90 ms extrapolated to a 30× roster |
| Frontend build | Succeeds, 29 static pages, 87.4 KB shared, heaviest route 136 KB |

`latestScreeningsByAthlete()` does load every athlete and every screening to
compute peer means for a cohort of five to ten, which is wasteful by
construction. It is left alone deliberately: 3 ms now and ~90 ms at thirty times
ISN's current roster is not a problem, and it sits on the clinical path that
produces the per-cell peer means built on JC's explicit instruction. Rewriting a
working clinical query on a speculative scaling argument, days before a
stakeholder demo, would be the wrong trade. The measurement is here so a future
decision starts from numbers.

`AcwrGauge.tsx` and `WorkloadChart.tsx` have no importer. They are the
documented ACWR rebuild path and are **kept**; Next tree-shakes them, so they
cost nothing in the bundle. Six test suites construct their own source-reading
scaffolding, and that is left too — boilerplate is not a duplicated *fact*, and
this codebase's real hazard is semantic duplication, not repeated `path.join`.

---

## 50. The recall list names people, and the dashboards open on the two scores (2026-09-04)

Four requests from JC. Three shipped; the fourth is a discussion opened rather
than a change made.

### A count is a finding; a name is an action

Programme Activity reported that six athletes had never been screened, and did
not say who. `rescreenRecall` had carried a per-athlete array all along, but with
only the `athleteId` on it — which is the IC number, and nobody reads an IC
number as a person. The roster query behind it selected `athleteId` alone, so
adding `name` to the row without widening that query would have produced `null`
on every line: present, plausible, useless.

Both the report and the dashboard now carry **Athletes needing a screening** — a
named checklist, never-screened first, because those need a first assessment
rather than a recall. That is the same distinction the counts already drew; it
just had nowhere to land. The PDF draws tick boxes, since it is used on paper.

### People screened, not screenings run

The period buckets already carried both `tests` and distinct `athletes`, and the
throughput chart already drew the second as a darker inner column — but printed
only the first as a number, so the people figure was visible and unlabelled. The
report now prints a per-period table of people, screenings and retests.

**On the dashboard the fix was smaller than it first looked, and the first
attempt was wrong.** A new "People screened over time" card was added, and the
table directly beneath it already had an `Athletes` column carrying exactly those
numbers. That is a second definition of one fact — this codebase's signature
defect — introduced while fixing a request about clarity. The new card was
removed and the existing columns renamed to **Screenings** and **People
screened**, which is what the request actually needed: the figure was there and
unreadable, not missing.

### The two scores lead every dashboard

`HeadlineScores` puts HoloMotion's Total Score and Exercise Risks at the top of
the admin, medical and coach dashboards. The admin page previously opened on a
per-region Focus card, so the two figures a clinician can check against the
printed report in their hand sat several scrolls down under a heading about
something else. §21 had already decided Total Score is the headline *because* it
is the verifiable one; this is the layout catching up with the reasoning.

One component, not three copies — three dashboards rendering "the same" pair from
three implementations is how the band vocabulary came to say "Safe" on two
screens and something else on a third (§33). The card states that the two point
in opposite directions (higher is better; lower is better), because printing 74.9
beside 16.4 without saying so invites reading them the same way. Both averages
are taken over **screened** athletes only, since an athlete with no screening has
no score and counting them as zero would drag both toward a number nobody
measured — the §44 denominator rule, applied on the way in.

### Permissions: the picture before the change

JC asked to rediscuss what an administrator grants. The answer is
[`docs/PERMISSIONS.md`](PERMISSIONS.md), which changes nothing: a measured table
of what all five roles actually reach, produced by calling every endpoint rather
than by reading these documents, plus four decisions worth taking deliberately —
medical reaching every athlete in the institute, executive reaching named
athletes rather than only aggregates, per-account capabilities existing for
medical alone, and those three capabilities being coarse. Each is defensible as
it stands, which is why none was changed on my own judgement.

---

## 51. Reading is an act (2026-09-04)

Four permission questions were left open in §50 for JC to decide. Asked to argue
them out and act, I did — two produced changes, two did not, and the two that
did turned out to be the same decision seen from opposite ends.

### The question underneath all four

*Should medical staff be scoped by sport, the way a coach is?*

The case for scoping is least privilege: a physiotherapist who only ever works
with swimmers can read every badminton athlete's clinical record. The case
against is that clinical cover is not organised by sport — whoever is on duty may
be asked about anybody, and an athlete arriving at a clinician who cannot see
their history is a worse failure than a colleague reading one they did not need.

The second argument wins, but **only if the reading is accountable** — and it was
not. The trail logged report *downloads*, for the explicit reason that "for a
read-only role reading is the only auditable act". Opening the same athlete's
full record on screen left no trace whatsoever. A clinician could read every
record in the institute invisibly, while downloading one PDF was permanent.

So the answer "accountability rather than restriction" was being given for a
system that did not have the accountability. `GET /athletes/:id` now writes an
**`athlete.view`** row.

Three properties, each deliberate. It is written after every permission check, so
a **refused** request logs nothing — a trail recording reads that never happened
is worse than none. An athlete opening their **own** record is skipped: that is
not an access anybody needs to review, and logging it would bury the ones that
are. And it is counted as a **read** in the staff rollup, because summing views
with changes would let an account that only ever looked outrank the clinicians
doing the work — the same reasoning that separated downloads originally.

### The same decision, from the other end

`executive` reached every athlete's raw record and screening history. No
executive screen ever called those endpoints; it was reach nobody used.

They are now refused. The individual **report** stays open, because following a
figure down to the case genuinely is oversight — and that is the point rather
than a concession. The PDF download is audited; the JSON endpoint was not.
Funnelling an executive through the logged door means oversight of the
institution is itself visible.

`athlete` remains on every one of those `rbac()` lists and must: the self-scope
check lives inside the handler, and a list that omitted athlete would leave it
correct and unreachable — exactly how `isForeignAthleteRequest` sat dead for
weeks.

### The two that did not change

Per-account capabilities stay medical-only. Coach and executive are each narrow
enough that there is nothing meaningful to tune, and a permission surface nobody
has asked for is complexity that must then be tested, explained and kept correct.
**The capability model exists where capabilities vary.**

The three medical capabilities stay coarse. The tempting fourth switch was "read
but not export" — but exports were already audited and views now are too, so the
distinction that switch would have drawn is drawn in the trail instead.

### Verification

Five mutations, all caught: un-auditing the view, logging refused and self views,
demoting `athlete.view` from a read to a change, readmitting executive, and
dropping athlete from an rbac list. The live matrix confirms executive refused on
all three record endpoints and still reaching the analytics, the activity log and
all three reports. A probe of the audit itself confirmed a clinician's view is
recorded with actor and sport, a self-view is not, and a refused view is not.

One test of mine was wrong first time and a failure caught it: it anchored on
`const isSelf`, which also appears in `/teammates`, so it inspected the wrong
function — the same ambiguous-anchor mistake that once shifted half an SVG.

---

## 52. Optimising for maintenance: the check that finds the next one (2026-09-04)

Asked to optimise the whole codebase for maintainability, the first job was
deciding what NOT to do. Performance was already measured and is not the problem
(§49: 2–9 queries per endpoint regardless of roster size, 3–75 ms, healthy
bundles). The largest files are `pdfDraw.js` at 1,575 lines and `Charts.tsx` at
1,135 — both cohesive toolkits, both heavily tested, and splitting either days
before a stakeholder demo would trade real risk for a feeling of tidiness.

So the question became: where does this codebase actually cost maintenance? The
answer is written all over its own history. There is **no shared types package**,
so every fact that must agree across the frontend/backend boundary agrees by
discipline. That has failed repeatedly and identically — `BAND_LABEL` (§33),
`INVITABLE_ROLES` (§42), `SMALL_COHORT` (§49) — and each time the remedy was a
new pin in whichever file the fault surfaced in.

Measured: **nine** names are declared in both packages. Five were pinned. Four
were not — `BANDS`, `GENDERS`, `RISK_AXIS_MAX` and `AGE_GROUPS` — and three of
those four carried a comment *pointing at the other file*, which is the §31
pattern: documents the hazard, prevents nothing. `AGE_GROUPS` even said
"Boundaries and labels MUST match backend/src/utils/cohortFocus.js".

### Why a tenth pin was not the answer

Writing four more assertions would have closed four instances of a class that has
now recurred four times. The useful change is the part that has been missing
every time: **nothing noticed when a new shared fact appeared.**

`crossPackage.test.js` therefore does two things. It pins the four unpinned facts
— with `AGE_GROUPS` comparing only the shared tail, since the frontend carries an
extra "All ages" entry that is a filter option rather than a band. And it
**enumerates** the SCREAMING_CASE constants declared in each package, intersects
them, and fails if any shared name is neither pinned here, nor listed as pinned
elsewhere (naming the file, which is itself asserted to exist and to contain the
name), nor explicitly recorded as a coincidental collision with a reason.

Adding a constant to both packages tomorrow now forces a choice: pin it, or write
down why it does not need pinning. That is the maintenance property worth having.

### Verified by breaking it

Five mutations, all caught: reversing the band order, offering a gender the
database enum rejects, scaling the risk axis differently on screen, drifting an
age boundary — and, the one that matters, **adding a new constant to both
packages with no pin**, which nothing in the repository would previously have
noticed.

The literal reader was wrong first time and the suite caught it: it required a
newline before the closing bracket, so every single-line literal like
`const GENDERS = ['Male', 'Female'];` returned a fragment that failed to parse. A
reader that quietly returns the wrong span is precisely the defect this file
exists to catch, so it is now bracket-counted rather than regex-matched.

---

## 53. One source for the shared facts, generated rather than imported (2026-09-04)

JC asked for a real shared types package. I argued for deferring it until after
the demo; he reaffirmed, so it was built. He was right to, and the reason is in
§53.4 — it found a live defect on its first run that four rounds of hand-written
pinning had walked past.

### 53.1 Why not a workspace, which is the textbook answer

The obvious implementation is an npm workspace at the repository root that both
packages import. It cannot be used here, and the reason is deployment rather
than taste.

Vercel builds `airms-api` with Root Directory `backend` and `airms-web` with
Root Directory `frontend`. Each build sees only its own subtree. A package at
the repository root is in **neither build context**: it would resolve locally,
pass every test on this machine, and fail on deploy — taking the live instance
down in the week the stakeholder demo runs on it.

That is not hypothetical. `DEPLOY.md` records four platform faults that all
present as the same opaque `FUNCTION_INVOCATION_FAILED`, and one of them —
`mysql2` traced out of the bundle — is exactly this shape: a dependency plainly
present in the repository and absent from what actually ran.

So the constraint is fixed and the design has to fit it: **the two packages must
stay self-contained.**

### 53.2 What was built

`shared/facts.js` at the repository root is the single source. `npm run
sync:shared` generates two committed files from it:

    shared/facts.js  --->  backend/src/shared/facts.js       (CommonJS)
                     \-->  frontend/src/lib/shared/facts.ts  (TypeScript, typed)

Each package imports its own copy. Nothing at build or run time reaches outside
its Root Directory, so the deployment is untouched.

**Confirmed against the hosted instance** (commit `b5527c4`, 2026-09-04). A
local green suite cannot establish that a deploy is safe, and protecting the
deploy is the entire reason for this design, so it was checked rather than
assumed:

- **The frontend build that is being served is the new one.** Established by a
  string that differs precisely between the two versions — the served bundle
  carries `" — clinician override by "` and does NOT carry the old
  `"Clinician override by"` or the colour-word map `{green:"Green",…}`. The
  probe was itself checked against a fixture containing both old markers, so
  "absent" is evidence rather than a grep that matches nothing. An earlier
  attempt to read the Next `buildId` returned empty on every poll and was a
  probe fault (the value is backslash-escaped inside the RSC payload), not a
  finding — the same trap §44 records.
- **The API boots**, which is the check that matters for the enum change: the
  models are defined with `DataTypes.ENUM(...GENDERS)` and friends, so a bad
  import would be a dead function, not a wrong value. Login succeeds and the
  roster returns 62 athletes whose genders are exactly `Male` / `Female` and
  whose programmes are exactly `PODIUM` / `PELAPIS` / `OTHERS`.
- **The shared lists drive real responses.** The focus breakdown slices by
  `['Male','Female']`, `['PODIUM','PELAPIS','OTHERS']` and the four age-band
  labels, in the shared order; all three period grains return; and the band
  distribution comes back keyed `green` / `amber` / `red` at 38/9/9, the
  measured split.

A clean local `next build` (29 pages) was run before pushing, with the dev
server stopped first — see gotcha 8, where building over a running dev server
breaks both.

Twelve facts moved in: `INSTITUTION_TZ`, `BANDS`, `BAND_RANK`, `BAND_LABEL`,
`GENDERS`, `PROGRAMMES`, `AGE_GROUPS`, `GRAINS`, `RISK_AXIS_MAX`,
`EXCLUDED_RISK_KEYS`, `RISK_INDICATORS` and `SMALL_COHORT`.

`BAND_RANK` is **derived** from the order of `BANDS` rather than restated. It is
the one value here that could be written backwards and still look right, and a
hand-written rank map is how "worse than" silently inverts.

### 53.3 What deliberately did NOT move

Facts, not presentation. The indicator list is a fact — its keys, their order,
their body region, HoloMotion's own printed wording, and which key is excluded.
The wording each package puts on its own screens is not: the backend labels an
indicator `Joint Pain` and the frontend labels it `Joint pain`, and the frontend
additionally needs a terser `axisLabel` for a chart axis. Those differ on
purpose, and unifying them would be erasing a difference rather than removing a
duplication.

So each package composes the shared list with its own wording, and **throws at
require time if a shared indicator has no local label**. An indicator added to
`shared/facts.js` without a label would otherwise render as `undefined` on a
clinical report and in an email subject line. A dead process is the correct
outcome; the error names the key and the file to fix.

`AGE_GROUPS` shows the same line drawn the other way. The shared list holds the
four age BANDS the report prints; `CohortFilters` prepends its own `All ages`
entry, because that is a filter option and not a band.

### 53.4 What it found

The guard that replaced the old literal comparisons asks a different question:
*is one of these names re-typed in a file that has never heard of the shared
source?* On its first run it named `ScreeningHistory.tsx`, which carried a
**fourth** band vocabulary — green as `Green`, amber as `Amber`, red as `Red` —
and a private `BAND_BADGE` beside it.

That is §33 walking back in through a side door. A bare colour word says nothing
clinical, and "Green" on an athlete's screening history reads as *you are fine*,
which is precisely the reassurance a screening test cannot give. Every unit test
passed over it, because the wording was internally consistent within that one
file. Four previous rounds of hand-written pins had not found it either — each
pin was written after a drift was discovered, and could only ever cover the
drift that had already been discovered.

It now renders `BAND_SHORT` with `BAND_LABEL` as the accessible name, and
`npm run e2e` asserts in the browser that no dashboard names a band by colour
alone. That check was confirmed by restoring the colour words and watching it
fail — on `/athlete/dashboard` specifically, which is the only route in the
check that mounts `ScreeningHistory` unconditionally.

### 53.5 The hazard this trades for, and what covers it

Generating into committed files buys deployment safety at the cost of exactly
one new failure mode: **somebody edits `shared/facts.js` and forgets to run
`npm run sync:shared`**, so the packages quietly disagree — which is the whole
class of defect the change was made to remove.

Both packages therefore regenerate in memory and fail if what is committed
disagrees, and **each checks BOTH files**, because a developer working on the
frontend runs the frontend suite and a stale copy in either package is the same
bug. Editing a generated file by hand fails the same way.

The generated values are also checked against the SOURCE — a renderer that
dropped an escape would produce a file that is perfectly in sync and carries the
wrong values — and the facts are checked against their own invariants: age bands
with no gap and no overlap, no duplicate indicator keys, LDH absent from the
shown list, and every string restricted to characters pdfkit can actually print
(§30f: an en-dash typed into a label measures zero width and prints as mojibake
in three documents, silently).

Thirteen mutations were run and all thirteen were caught: source edited without
syncing, a generated file hand-edited, only one package synced, a private
literal returning to `overallIndicator.js`, the colour words returning to
`ScreeningHistory.tsx`, a missing label in either package, an en-dash in a
label, a gap in the age bands, LDH added to the shown indicators, and a new
shared constant appearing in both packages unaccounted for.

Two of those thirteen initially reported as misses. They were not: the module
refuses to load, so the suite correctly never runs, and the harness's "did the
suite run" check — added earlier precisely so a parse failure could not count as
a catch — produced a false negative in the opposite direction. Those two cases
now assert the diagnostic MESSAGE instead, so a plain syntax error in the same
file still cannot pass.

### 53.6 The schema reads the same lists

The strongest version of this is that the database columns are now defined from
it: `Athlete.gender`, `Athlete.program` and both `Screening` band columns take
their enum values from `shared/facts.js`, and the import validator checks
against the same arrays it will insert into. A filter offering a value the
column rejects returns nothing and looks like an empty cohort — loud at the
bottom of the stack, silent at the top, which is this project's signature shape.

### 53.7 What `crossPackage.test.js` is for now

The per-fact comparisons it used to make would now be asserting that a file
equals itself, so they are gone. What survives is the half that was always the
valuable one: it enumerates every SCREAMING_CASE name declared in both packages
and demands an answer for each — generated from the single source, pinned in a
named test, or explained as a collision. The recurring problem was never a
missing assertion. It was that nobody noticed a new shared fact had appeared.

`BAND_LABEL` is the one live collision, and it is recorded as one: the shared
`BAND_LABEL` is the green/amber/red clinical wording, while
`lib/screeningAlerts.ts` exports its own for the ok/watch/high risk-strip bands,
which is a different axis entirely.

### 53.8 What this does NOT solve

The facts agree by construction; the LOGIC that reads them still does not. Both
packages compute a band, and nothing here makes those two computations the same
— only the vocabulary they express the answer in. That is the right boundary for
a generator (values are trivially portable, behaviour is not), but it should be
stated rather than left for somebody to assume.

---

## 54. Seventeen coercions, three contracts, and the zero that isn't a blank (2026-09-04)

Found by asking the §53 question — *what else is written out more than once?* —
rather than by a bug report. The answer was `num()`, the helper that turns a
stored value into a number, and it existed **seventeen times**.

MySQL DECIMAL columns arrive as strings (`'72.50'`), JSON columns carry whatever
the extractor wrote, and either can be null, so nearly every module doing
arithmetic on a screening needed one. Repetition alone would be untidy. The
problem is that they did not agree:

| input | 10 files | bodymap / pdfDraw / symmetry | screenings.js | reliability / ScreeningHistory |
|---|---|---|---|---|
| `''` | `null` | **`0`** | **`0`** | `null` |
| `null` | `null` | `null` | **`0`** | `null` |
| `'abc'` | `null` | `null` | **`NaN`** | `null` |
| `'Infinity'` | `Infinity` | `Infinity` | `Infinity` | `null` |

### 54.1 Why a zero is worse than a blank

The divergence matters because **a missing reading that becomes 0 is not a
blank — it is a number, and it gets drawn.**

- On a printed exercise-risk gauge, 0 is the best possible score. An absent
  reading renders as *no risk found*.
- On lateral symmetry, 0 is *perfectly balanced*.
- On a movement score, 0 is the worst possible result.
- On the body map, 0 paints the region at one extreme of the scale.

Three of those four surfaces are in `pdfDraw.js` and `symmetry.js` — the printed
report, which is the copy that gets filed and the copy a clinician holds while
checking a line. None of it looks like an error. It looks like a finding.

`NaN` is worse still, and `screenings.js` produced it for any non-numeric
string: `NaN < 15` is `false`, so a threshold check silently passes, the bar
draws at zero width, and `JSON.stringify` turns it into `null` on the way out so
the frontend never sees what happened either.

### 54.2 One rule, resolving every divergence the same way

`backend/src/utils/num.js` and `frontend/src/lib/num.ts` now hold `toNum`, and
the rule is: **an unknown value stays unknown.** Null, undefined, empty or blank
string, a non-number type, and anything not finite all give `null`, so a caller
has to decide what to draw for "we do not have this" instead of being handed a
plausible zero.

Non-finite is included deliberately — ten copies returned `Infinity` unchanged,
which draws off the end of any axis it reaches; the two that already used
`Number.isFinite` were right.

`numOr(v, fallback)` covers the few places that genuinely need a number. It is
named so the fabrication is **visible at the call site**: `numOr(v, 0)` says a
zero may be invented here, which a bare `num(v)` did not.

### 54.3 The one that was allowed to keep differing

`GET /screenings/:id/full` reshapes a Screening into the athlete payload the
dashboard components take, and that type is all-numeric — so a null genuinely
has to become a number there. It now calls `numOr(v, 0)` explicitly.

Behaviour unchanged, intent now stated. This is §53's rule applied again: *if a
value must differ locally, give it a different NAME.* An accidental divergence
became a deliberate one, and the next reader can see which it is.

### 54.4 The test found a fabricated zero in the fix itself

`num.test.ts` runs one table through **both** packages' implementations, since
`toNum` is behaviour rather than a fact and so is deliberately not generated
from `shared/facts.js` (§53.8).

On its first run it failed on `[]`. `Number([])` is `0`, so the first version of
`toNum` — which only guarded null, undefined and blank strings — turned an empty
array into a score of zero: exactly the defect the function was written to
remove, reintroduced inside the removal. Both implementations now reject any
type that is not `number`, `string` or `bigint` rather than coercing it, because
JS invents zeros from `[]`, `null` and `false` alike.

Six mutations, all caught: either package dropping the empty-string guard,
either dropping the type guard, `Number.isFinite` weakened to `Number.isNaN`,
and `numOr` swallowing a real `0` as though it were missing.

### 54.5 What it did not change

Nothing on the seeded data moves: all five PDFs render, 63/63 browser checks
pass, and the access matrix is unchanged. That is expected — DECIMAL columns
return `null` or a numeric string, never `''`, so the divergent branch is
reachable mainly from the **vision extractor**, whose output is a model's JSON
and can carry anything. The fix is for data not yet collected, like §45's
timezone fix before it, and it is worth having for the same reason: the failure
it prevents is one nobody would see.

### 54.6 Confirmed on the hosted instance

Deploy `c6c8c3e`, 2026-09-04. `num()` feeds every score on every surface, so
"nothing moved" had to be checked rather than asserted.

Establishing that the new build was actually being served took two attempts, and
the first was wrong in the way this document keeps recording. A probe for
`bigint` — a token that appears in `toNum`'s new type guard — reported the new
build live on its first poll, which was too fast to be true. It was a **false
positive**: `bigint` also occurs in the vendor chunks, so the probe could not
have produced a negative. The sound discriminator is the **chunk hash filenames**,
compared against a set captured from the previous deploy: they are content
addressed, so they change if and only if the bundle did.

With that settled: all five PDFs render (`%PDF-` magic on each), the analytics
endpoint returns 56 scatter points with **none missing a score**, and the band
distribution is 38/9/9 — unchanged, which is the expected result and the one
worth confirming.

---

## 55. Compacting CLAUDE.md: what the measurement actually said (2026-09-04)

Attempted on request, and reported here mainly so nobody spends the effort twice
on the assumption that there is a lot of fat to cut.

`CLAUDE.md` is loaded into context every session, so its size is a real running
cost: 744 lines, 12,520 words, 86 KB, of which the single "Architecture
overview" section is 42 KB — half the file.

Seven of the largest bullets were rewritten, cutting the historical narrative
and the measurements (both of which this document already holds in full) and
keeping the rule, the file locations and the section pointer. The result:

**86,185 → 83,417 chars, a 3.2% reduction across the seven biggest bullets.**

Extrapolated across the remaining ~35 bullets that is roughly 12–15%, for a
large amount of careful prose surgery on the one file whose job is preventing
regressions. That is a poor trade, and the reason is worth stating: **the bulk
of CLAUDE.md is not padding.** Nearly every long bullet exists because something
broke, and the sentence that looks redundant is usually the one naming the
failure mode. Compressing it does not remove words so much as remove the reason
a rule exists, which is what makes the rule survivable.

The compaction that *was* worth doing is the kind in §53 and §54: not shorter
prose, but fewer definitions. Twelve facts and one coercion helper moved from
seventeen scattered copies to one source each, which shrinks the thing a reader
has to hold in their head rather than the thing they have to scroll past.

**How the seven rewrites were checked.** All 55 directive sentences ("do not",
"never", "must", "stays", "is not negotiable") were extracted before the edit
and matched against the file after. Fifty-four survived verbatim. The one that
did not was a *rationale* clause, not a rule — the explanation of why read-only
roles would otherwise never appear in the audit trail, which the rewrite states
more briefly; the rule it justifies (reads are logged, and counted apart from
changes) is intact. That check is the reason this was safe to do at all, and any
future attempt should start by rerunning it.

---

## 56. Three medians, and a map that reads itself (2026-09-04)

Two pieces of the same request: make the code simpler, and make the system
legible to whoever maintains it next.

### 56.1 The median that moved a quadrant boundary

Sweeping for the §54 shape again — *what else is one concept written more than
once?* — turned up `median`. Three implementations, and they disagreed on the
even case:

| set | `screeningPeriods.js`, `scheduler.js` | `Charts.tsx` |
|---|---|---|
| `[70, 75]` | **73** (rounded) | **72.5** |
| `[71, 72]` | **72** | **71.5** |

The backend copies rounded; the chart's did not. That matters because **the
risk-vs-movement scatter splits its quadrants on the median** (§25), so an
athlete sitting between 72.5 and 73 was drawn in a different quadrant depending
on which implementation produced the boundary. The docs had already recorded the
symptom — "15 to 17 do, depending on how ties on the median are counted" — for
weeks, without anybody connecting it to a cause.

One `median` now, in `utils/num.js` / `lib/num.ts` beside `toNum`, and it is
**exact**. Rounding moved to the two call sites that want a whole number of
days, which is where somebody can see it — the same reasoning as `numOr`.

**No published figure moved, and that was checked rather than assumed.** The
retest interval is 35 days with min = max = 35, so every implementation agrees
on it. The recall median was recomputed against the live database both ways: 58
either way, because the new code is `Math.round(median(ages))` and the old was
`Math.round` of the same average — the arithmetic relocated, not changed.

`mean` came along for the ride, with one deliberate property: **unreadable
values are dropped, not counted as zero.** A zero in the set drags the average
down and looks like a reading.

Nine mutations, all caught, including the two that matter most — either package
re-introducing the rounding, and `median` forgetting to sort.

**`pct` was left alone**, deliberately. It appears in ten files and looked like
the same duplication; reading them showed ten *different* local things — a
fraction, a percentage, a clamp to an axis. They are correctly named locally,
and unifying them would have invented a shared concept that does not exist. The
check was worth running to find that out.

### 56.2 docs/SYSTEM_MAP.md — every attribute, read from the code

`cd backend; npm run map`. One document listing what the system *is*: **9
models with all 138 columns** (types, nullability and enum VALUES), **59
endpoints** with their `rbac` allow-list and permission gate, **25 pages** with
their `allowedRoles`, every institution setting and its default, every audited
action, every shared fact, every environment variable the backend reads, and
every npm script.

Generated, not written, and the reason is the one this project keeps relearning:
a hand-maintained inventory is wrong the first time somebody adds a column, and
*slightly* wrong is worse than absent — you trust it, and it lies about the one
row you did not check. Models are introspected; routes, pages and settings are
parsed from source. It needs **no database**, so it runs on a clean clone.

It is deliberately only the *what*. The why is this file; the measured figures
are `npm run measure:facts`, which needs the database and changes with it; the
access model argued in prose is `PERMISSIONS.md`.

### 56.3 The generator's own first draft was quietly wrong

Worth recording, because it is this document's whole thesis in one example.

The first route parser matched middleware with `[^)]*?`, which cannot span
`rbac('medical', 'admin')`. It found **15 of 59 endpoints** — and rendered a
clean, plausible, well-formatted table of those fifteen. Nothing in the output
suggested anything was missing. The only reason it was caught is that 15 looked
too low against a number I already knew.

So the freshness test does not stop at "the committed file matches the
generator". Each section is checked against an **independent count of the thing
it describes**: endpoints against a raw count of `router.<verb>(` across the
route files, models and columns against the introspected models, pages against
a filesystem walk. Every row must also name at least one role, since a row whose
`rbac` failed to parse renders an empty cell that reads as *unrestricted*.

That last test was itself wrong first: it asserted the enum values appeared as
`PODIUM | PELAPIS | OTHERS`, which fails against a CORRECT document, because
pipes inside a markdown table cell must be escaped or they split the row. It now
asserts the escaped form — matching the bare one would have passed against a
broken table and failed against a good one.

---

## 57. What escaped the last sweep, and two mistakes made fixing it (2026-09-04)

The §54/§56 sweeps searched for `num` and `median` **by name**. This one
enumerated every function and const defined in more than one non-test file, and
asked of each whether it is one concept or several. Fourteen names; most were
the deliberate per-package pairs. Three were not.

### 57.1 `numOrNull` — the same defect, spelled differently

`indicatorPayload.js` and `BodyMap.tsx` each carried a `numOrNull`:

| input | `indicatorPayload.js` | `BodyMap.tsx` | `toNum` |
|---|---|---|---|
| `''` | **`0`** | **`0`** | `null` |
| `'abc'` | **`NaN`** | `null` | `null` |
| `'Infinity'` | **`Infinity`** | **`Infinity`** | `null` |

This is §54 exactly, and §54 did not find it, because §54 searched for the name
`num`. Renaming a helper is all it takes to escape a name-based sweep — which is
why the guard for these asserts on **behaviour** (`toNum('')` is null) and on
the absence of the old function BODY, not on the identifier.

It matters where it sat. `indicatorPayload.js` shapes `totalScore` and
`cohortZ` — the two figures every dashboard hero leads with — so an unread total
score would have rendered as **0** on the hero, and a non-numeric one as `NaN`,
which `JSON.stringify` turns into `null` on the way out so the frontend cannot
tell what happened either. `BodyMap` paints regions, where a fabricated 0 paints
one end of the scale as though it had been measured.

### 57.2 `mean` — three copies of my own leaving-behind

§56 added `mean` to `utils/num.js` and did not remove the three local copies in
`cohortFocus.js`, `screeningPeriods.js` and `subitemAggregate.js`, which then
**shadowed** it. Each was `(vals.length ? +(…).toFixed(1) : null)` — "the mean,
to one decimal".

Split into `round(mean(vals), 1)`: one mean, which drops unreadable values
rather than counting them as zero, and the presentation choice visible at the
call site.

### 57.3 The two mistakes, which are the point of this section

**`round` was very nearly the wrong function.** The obvious body is
`Math.round(n * 10 ** dp) / (10 ** dp)`. That is *not* `toFixed(dp)`: 77.85 is
held as 77.8499…, so `toFixed(1)` gives 77.8 and multiplying first gives 77.9.
Brute-forced over 300,000 random sets, they disagreed on **1.1%** of them.

Every cohort average, period average and subitem cell on every dashboard and
printed report is rounded here. Shipping that would have moved published numbers
across the whole system with nothing to attribute the change to — the §45
class of defect, introduced by a refactor whose entire purpose was to change
nothing. `round` now uses `toFixed`, and a test runs 20,000 random values
through both to pin it.

**Unifying `loadCanvas` created a require cycle.** `pdfRender.js` and
`redactName.js` both loaded the native canvas binding, and `pdfRender` already
requires `redactName` — so pointing `redactName` at `pdfRender` made a cycle,
under which the second module receives a half-built exports object,
`loadCanvas` is `undefined`, and redaction fails with *"loadCanvas is not a
function"*, which says nothing about canvas. Caught by a Node warning on the
first `require`, not by any test.

It now lives in `utils/canvasLoader.js`, its own module for the same reason
`periodScores.js` is one. The shared message names which half of the system
stops working (screening import) and which does not, and is marked `expose` so
`httpError` keeps the sentence on a 500.

### 57.4 Proving the refactor changed nothing

An A/B against the hosted instance — still running the old code — showed the
focus breakdown identical but the period payloads **differing**. That looked
like a regression for about a minute. It was not: the counts differed
(`athleteBands` headcounts, which no arithmetic here touches), the totals
matched at 74 tests and 62 athletes, and the two databases were seeded at
different times, so screenings fall in different months. **The A/B was
contaminated by the comparison, not by the change.**

The clean test is old code versus new code against the **same** database, run
in-process with no server: all three period grains, the focus breakdown and the
subitem aggregates, 27,945 bytes of JSON, **byte-identical**.

Six mutations, all caught — including the two mistakes above, so both are now
things the suite refuses rather than things somebody has to remember.

---

## 58. The guard that was missing from the tool that guards everything (2026-09-05)

Five small jobs, done together because four of them turned out to be the same
job: **a claim that nothing recomputes**.

### 58.1 `npm run measure:facts` was broken, and it is the anti-drift tool

The §56 sweep moved `median` out of `screeningPeriods.js` into `utils/num.js`.
Fourteen call sites were updated. `scripts/measure-facts.js` was not, and kept:

```js
const { median } = require('../src/utils/screeningPeriods');
```

That line is **not a resolution error.** The module resolves, the destructure
binds `undefined`, and nothing complains until something *calls* it — at which
point the script dies with `median is not a function`, naming neither the
function that moved nor the file that lost it.

It survived 565 passing tests for a fortnight, and the reasons matter more than
the bug:

- `node --check` checks **syntax**; a dangling named import is valid syntax
- a `require()` smoke test would have loaded the module **fine**
- nothing under `scripts/` is covered by any suite

And the script it broke is the one whose entire job is to stop stale numbers
being quoted in the viva (SILENT_FAILURES H7). The guard was absent from exactly
the tool that guards everything else — and the failure was silent in the way that
matters, because *nobody runs a measurement script except when they need a
number*, which is the worst possible moment to discover it does not run.

`tests/scriptImports.test.js` now checks every `const { … } = require('./x')` in
`src/` and `scripts/` against what `x` actually exports. It works **statically**,
reading both files as text: several modules here build a Sequelize instance at
import time and `seeder.js` used to reseed the database on import (§34), so a
test that executes arbitrary modules to inspect them is a worse hazard than the
one it detects. Modules whose export shape cannot be read statically are
**skipped rather than guessed at**, and the number of pairs actually checked is
asserted against a floor — the §56.3 lesson, where the first route parser found
15 of 59 endpoints and rendered a plausible table.

Verified by reintroducing the exact bug and watching it fail with a message that
names the file, the symbol and the module.

### 58.2 A re-measurement instruction only protects what it re-measures

`VIVA_FYP2.md` §2 tells its own reader to re-measure before quoting. Four of its
rows were stale anyway:

| Row | Said | Measured 2026-09-05 |
|---|---:|---:|
| Audit rows | 11 hosted / 1 local | **324** |
| Commits | 291 | **386** |
| Backend tests | 382 (24 suites) | **572 (36)** |
| Frontend tests | 137 (8) | **261 (15)** |

The pattern is exact and worth stating plainly: **the rows `measure:facts`
covered stayed right, and the rows it did not cover drifted.** Bands, cohort
sizes, reliability pairs and the roster were all still correct, because a command
recomputed them. Audit rows, commits and test counts had no command, so they
aged into prose. An instruction to re-measure is only as good as the coverage of
the tool it points at.

`measure:facts` now prints every row of that table a database or the repository
can answer. It deliberately does **not** compute per-test totals by counting
`it(` — only a run knows how many cases a suite holds, and a plausible number
obtained by counting call sites is precisely the kind of figure this script
exists to stop anyone quoting. It declines and says how to get the real one,
which is the `reliability.js` rule applied to the tooling.

It also does not call `recomputeCohorts()` to check the pin, though that is the
directest evidence: **a measurement script must not write to the thing it is
measuring.** It reports the live rows, the snapshot they were installed from and
how many park `fresh_stats` — read-only evidence of the same property.

### 58.3 Two numbers that were internally contradictory

**CLAUDE.md** claimed the pinned baseline "snapshots all **49** cohorts … verified
by recomputing while pinned — **50 of 50** held, all 50 parked `fresh_stats`."
Both halves were true when written and they were never true together: the 50
belonged to the 2026-08-19 version, which a reseed destroyed. Re-verified:
`pinnedHeld: true`, **49 of 49**, 49 parking. A sentence that contradicts itself
in a document a panel may read is worse than a sentence that is simply out of
date, because it invites the question of which half to trust.

**Five documents** said the permission matrix came from "calling all **52**
endpoints as every role". `scripts/audit-access.js` has a `ROUTES` list with
**46** entries. Corrected everywhere. The neighbouring figure — 59 endpoints in
`SYSTEM_MAP.md` — is a *different* measurement (every route the system defines,
against the subset the access audit drives) and is correct; the two were never
in conflict, but nothing said so, which is how a panel finds a contradiction that
is not one.

### 58.4 The hero got the first test above `lib/`

`OverallRiskBadge` is the panel every role reads first, and it had no test.
Everything it *displays* was covered only by `npm run e2e`, which needs both
servers running and so cannot gate a commit — the wrong shape of coverage for
this component in particular, because several locked clinical decisions are
properties of the rendered page rather than of any function:

- a **missing** Total Score prints as a dash; a **real zero** prints as `0`
  (§54/§57 — this is the exact screen a fabricated zero would have reached, and
  it is why `??` is right here and `||` is not: swapping them passes the first
  assertion and fails the second)
- green never reads **"Safe"** (§33), and no band is named by **colour** alone
  (SILENT_FAILURES 3i)
- the compact badge differs by **glyph**, not hue — the encoding red/green
  deficiency destroys, and one a `title` tooltip rescues for neither a screen
  reader nor a touch device
- a clinician **override** beats the computed band
- a **stale** screening states its age; a **historical** one does not, because a
  past screening is settled rather than overdue
- the **staff** copy never addresses the reader as the at-risk athlete — a real
  shipped bug, in which the medical dashboard told a clinician to arrange an
  assessment with their own medical team

All **nine** mutations were caught, including the `??` → `||` swap and the
boundary flip on the small-cohort caveat.

### 58.5 The two tests that were wrong, and what they taught

Both failed on the first run, and **both were the test's fault** — worth
recording, because the reasoning in each looked sound.

**The small-cohort fixture was impossible.** It passed an empty delta list and a
rank of *12 out of 9*. The caveat renders inside the comparison table, so with no
deltas there is no table and no caveat; the assertion failed for two reasons,
neither of which was the property under test.

**The LDH assertion tested an input that cannot exist.** It handed the hero a
`cohortDelta` for `spinalDiscHerniation`, expecting the component to filter it.
But `cohortDeltas` is not the indicator list: it is built in
`overallIndicator.js` from a closed set of **six aggregate components**
(`totalScore, rom, stability, symmetry, riskGood, balance`), so an indicator
cannot appear in it at all. Asserting against an impossible payload would have
added a green tick and no coverage.

That one is left in the file **as a comment explaining why there is no test
there**, with a pointer to where the exclusion genuinely is pinned
(`riskIndicators.test.js`, `screeningAlerts.indicators.test.ts`). A test deleted
in silence teaches nobody; the next person to notice the hero "does not check for
LDH" deserves to find the reason rather than repeat the work.

### 58.6 A retired guard that was skipping quietly

`httpHardening.test.js` carries four checks on the temporary migration endpoint
removed on 2026-09-04. Three now early-return — which is the desired end state,
but **an early return is invisible in a green run**, and four quietly-skipping
tests look exactly like four passing ones.

The block now **asserts** the end state (`present: false`) rather than merely
reaching it. The other three are kept rather than deleted: they are dormant, and
they re-arm the moment the file reappears, so whoever adds it back inherits
admin-only on every verb, the shared migration util instead of inline SQL, and a
deadline. That is worth more than four fewer lines.

---

## 59. The prop whose default is the bug (2026-09-06)

`OverallRiskBadge` and `ScreeningAlertBanner` are shared by the athlete, coach
and medical pages. They were once second-person only, so the medical dashboard
told a clinician that **they** were among the athletes most in need of attention
and should arrange an assessment with their own medical team (§20j). Nobody
reported it; it reads perfectly until you notice who is holding the screen.

The `audience` prop fixed that, and moved the failure rather than removing it.
The prop **defaults to `'staff'`** — a sensible default for a component used
mostly by staff — which means **forgetting it on an athlete page reproduces the
original bug exactly**, in the one direction where the sentences still scan as
English. A default that is correct for the majority of call sites is a trap for
the minority, and the minority here is the athlete's own dashboard.

`OverallRiskBadge.test.tsx` (§58.4) pins what each *value* renders. Nothing
pinned that the pages pass the right one, and that is a different property: one
is about the component, the other about eight call sites in four files.

`frontend/src/app/pageWiring.test.ts` now reads the pages as text and requires
that every render of either component declares the `audience` its role directory
implies. Three details are load-bearing:

- **The missing case is tested separately from the wrong case.** Because of the
  default, absence *is* a failure and not merely an omission. Both mutations were
  run; both fail.
- **`compact` is exempt.** The compact badge returns a glyph, a number and an
  accessible name — no sentence addressed to anybody — so requiring `audience`
  there would be a false positive on a correct line
  (`coach/dashboard/page.tsx:829`). Checking the real call sites first is what
  found that; a rule written from the principle alone would have flagged it.
- **The tag scan is brace-aware.** These props span lines and carry expressions:
  `historical={!!picked}` contains no `>`, but an arrow function would, and a
  naive scan to the next `>` truncates the tag and loses the prop it is looking
  for — a check that silently examines half a tag and reports all clear.

**Why source and not a mounted page.** Mounting `medical/dashboard` means
standing up `next/navigation`, `@/lib/api` and a dozen fetches for a 900-line
page, to assert one prop. Reading the source is what
`backend/tests/athleteDisclosure.test.js` already does for route wiring, for the
same reason: this is a fact about how the call site is *written*.

**What it does not do**, stated because the gap is easy to overclaim away: it
cannot see a prop computed at runtime, it covers one prop on two components, and
it is **not** the page-mounting test CLAUDE.md says is still missing. That
blind spot is narrower now, not closed.

---

## 60. Six copies of one clinical boundary, and the hole in the mechanism meant to prevent that (2026-09-06)

An optimisation pass that started as consolidation and turned into a defect
report about the consolidation machinery itself.

### 60.1 The duplication

Where an exercise-risk indicator stops being **Low** and stops being **Watch**
— the two numbers that decide what a clinician is told, on screen and on paper —
was written out six times:

| Site | Form |
|---|---|
| `routes/athletes.js` | `const WATCH = 15; const HIGH = 25;` |
| `utils/cohortFocus.js` | the same pair again |
| `utils/pdfDraw.js` | inside `RISK_ZONES`, **and** again inline at the hotspot list |
| `utils/holisticReport.js` | bare `> 15 && <= 25` / `> 25` |
| `routes/screeningReports.js` | bare `> 15` |
| `lib/screeningAlerts.ts` | its own exported pair |

Three carried comments naming the others and asserting they must not
contradict — a comment doing a test's job, which is §31 exactly.

**The bare-literal copies are the dangerous ones.** A search for the NAME finds
five of six; `holisticReport.js` and `screeningReports.js` are invisible to it.
That is precisely how `numOrNull` survived the §54 sweep, and it is why these are
now guarded by comparing the ANSWERS both packages give rather than by grepping
for identifiers.

All six were checked before changing anything and all six **agreed** — strictly
greater-than at both edges, so a value on a boundary takes the lower band. So
this fixes no live bug. What it removes is the standing opportunity for the
seventh copy to use `>=` and move a boundary athlete a whole band on one surface
and not the other.

**What was deliberately NOT unified:** the frontend's sport-tightened thresholds
(12/20 for a region a sport loads heavily). The dashboards apply them, the PDFs
print the standard bands and say so on the page, and that divergence is a
recorded decision awaiting sign-off — duplicating the sport-to-region map
server-side would drift, which the checklist entry already says. The shared
constants are the *instrument baseline* that tightening starts from.

### 60.2 The real finding: a single source that silently is not one

Adding the constants to `shared/facts.js` and running `npm run sync:shared`
printed **`shared: already in sync`**, and neither generated file changed.

`shared/generate.js` renders each package from a **hand-written template that
names every constant**. Adding a fact to the source and forgetting the template
is a no-op, and the "in sync" check compares the committed file against that same
template — so it is comparing the renderer with itself and can never notice.

The backend half was guarded: `backend/tests/sharedFacts.test.js` walks the
source key by key, so dropping a constant from the backend template fails at
once. **The frontend half was not.** Its tests import a FIXED list of names, so a
fact nobody thought to import is a fact nobody checks. Verified by mutation
rather than by reading:

| Mutation | Result before the fix |
|---|---|
| backend template drops `HIGH_THRESHOLD` | **caught** (1 failed) |
| frontend template drops `HIGH_THRESHOLD` | **caught by nothing** — backend 11/11 green, frontend 19/19 green, constant absent from `facts.ts` |

So a fact could be added to the single source, reach one package, never reach the
other, and leave every signal a developer looks at — the generator's own message
and both suites — saying it had worked. **The asymmetry is what made it
dangerous**: two runtimes disagreeing about a shared value is the one thing the
mechanism exists to prevent (§53), and this is the mechanism's own blind spot.

`frontend/src/lib/shared/facts.test.ts` now enumerates the source's keys against
a **namespace import** of the generated module — not a written-down list, which
is the whole point — and checks name, value, and that nothing extra appears. The
frontend mutation is caught twice over.

### 60.3 Proving it changed nothing

Every integer from 0 to 45 banded through `bandOf`, `riskZone` and `tally`,
hashed, on the refactored tree and then on the stashed pre-refactor tree via the
identical probe: **`1768fadc…` both times**, same tally
(`ok 16 / watch 10 / high 20`), same boundary answers (15 → Low, 25 → Watch).
Old code versus new code against one input set, which is the §57.4 method — the
first A/B in that section was contaminated by comparing two *databases* instead.

---

## 61. A launch checklist, triaged against what this system actually is (2026-09-06)

JC passed over a generic "20 things before you launch a website" list. Most of it
does not apply, and saying which and why is the useful part — AIRMS is an
invitation-only clinical tool for one institute, not a public site with an
audience to win.

**Already true, verified rather than assumed:** HTTPS is forced (the hosted
instance answers `http://` with a 308 to `https://`); no secrets reach the
frontend (the only `NEXT_PUBLIC_*` is the API base URL, which is public by
design); every `<img>` carries `alt`; images are 50-60 KB, so there is nothing to
compress; no broken internal links (all five `href="/…"` targets resolve to real
routes); page load was measured in §49; mobile layout in §28; colour contrast in
§19 and §33; form validation and the `/api/auth` rate limiter already exist.

**Does not apply.** Terms & conditions, a social preview image, and "one clear
call to action" are all for a site persuading strangers. There are no strangers:
there is no self-registration and never will be, and every route is behind a
login. A cookie consent banner has nothing to consent to — the session token
lives in `localStorage` and there is no tracking cookie.

**Deliberately refused: analytics.** A third-party script on a page that renders
a named athlete's clinical scores would send athlete-associated data to a party
with no relationship to ISN, to answer a question nobody has asked. The audit
trail (§20) already records who read what, and it does so inside the institution.
This is a non-goal, not an omission.

**A privacy policy is a real question and it is not mine to answer.** The system
does hold personal health data under an identifier that encodes date of birth,
birth state and sex (§43). But the controller is ISN, the lawful basis is theirs,
and a policy page written by a student and pasted into their system would be
worse than none. Raised for Dr Thung; the §18 redaction design and the §43
disclosure work are the parts that were in scope.

**Two were genuinely missing, and one of them inverts.**

1. **`robots.txt` — to BLOCK, not to promote.** Measured: the hosted instance
   served no robots.txt (404) and no `X-Robots-Tag`, so it was crawlable. The
   practical exposure is small — protected routes bounce to sign-in and the API
   answers 401 — but "small" is not the standard for a system holding clinical
   records. `app/robots.ts` disallows everything, and `metadata.robots` adds
   `noindex, nofollow` so a crawler that fetched anyway still will not index.
   The two fail independently; neither is a security control, and the API's auth
   remains the actual boundary. **No `sitemap.ts`** — a sitemap advertises
   routes, which is the opposite of the intent here.

2. **A custom 404.** Next's stock page is unstyled, speaks in the framework's
   voice and names the framework. It is also one of the few AIRMS screens
   reachable *without a session*, so it must say nothing about what exists behind
   the login: it reads identically for a typo, a stale bookmark and a probe. It
   links to `/` and nowhere else, because an unauthenticated visitor has no role
   and guessing a dashboard would be wrong. Verified to return a real **404
   status**, not a 200 with 404-shaped content.

**And one I got wrong, recorded because the mistake is instructive.** I reported
a missing favicon and "added" one by copying `logo1.png` to `app/icon.png`. That
file was already committed in `03dcd3f`, byte-identical — same blob hash — so
the copy produced no diff at all. The check that misled me was `find . -name
"favicon*"`, which looks for the OLD convention; Next's App Router uses the
`app/icon.png` file convention instead, and the name never contains "favicon".
Searching for the implementation's name rather than the capability is the same
error as §54's sweep for `num`, in a smaller key: **ask what the system DOES, not
what a file is called.** The correct check is the one that would have settled it
in one line — request `/icon.png` and look at the status.

Verified after: 268 frontend tests, tsc and lint clean, and **63/63 e2e**, which
matters here because `not-found.tsx` is app-level routing and the auth-boundary
checks are exactly what a bad interaction would break.

---

## 62. The half of §45 that was never applied, and a test that passed for the wrong reason (2026-09-06)

Asked to optimise the whole system, the first job was deciding whether there was
anything left worth doing. §31, §49, §52, §54, §56, §57 and §60 have each swept
for duplication and the returns are visibly diminishing. So this pass looked for
a different thing: a decision the codebase has already MADE and only partly
applied.

### 62.1 §45 fixed bucketing and left display alone

§45 established that a screening belongs to ISN's calendar, named
`INSTITUTION_TZ`, and fixed period **bucketing**. Date **display** is a separate
code path and was never converted:

| Path | Zone |
|---|---|
| `screeningPeriods.js` bucketing | `Asia/Kuala_Lumpur` ✓ |
| `lib/periods.ts` labels | `Asia/Kuala_Lumpur` ✓ |
| `pdfDraw.js` `fmtDate` / `todayStamp` | **UTC**, via `toISOString()` |
| 8 frontend display sites | **the viewer's zone**, via bare `toLocaleDateString()` |

`fmtDate` prints the assessment date on the individual report — the document a
clinician files and checks against the HoloMotion PDF — and names the downloaded
file. On the hosted instance the API runs UTC, so any screening between 00:00 and
07:59 Malaysian time printed the previous day, while the period chart placed it
correctly. That is the same window §45 identified, left open on the display half.

### 62.2 The measurement corrected the claim

The prediction was that this was latent: all 74 `assessedAt` values sit at 19:10
MYT, the same date in both zones, so **0 of 74** screenings are affected. That
part held.

Rendering *every* stored instant through both rules told a different story:
**45 of 537 differ**. The movers are `createdAt`, `injuryAt` and audit
timestamps — real clock events in the Malaysian evening. `2026-08-24T19:31:02Z`
is 03:31 on the **25th** in Kuala Lumpur, and was displayed as the 24th.

So the defect was **live, not latent**, on exactly the columns nobody had
checked, and the "no impact" conclusion came from measuring one column and
generalising. The 45 differences are the fix working: the audit trail now dates
an action to the institution day on which it happened.

### 62.3 The test passed for the wrong reason, and mutation said so

`utils/dates.js` + `lib/dates.ts` render in `INSTITUTION_TZ`, with one table run
through both packages (the `num.test.ts` shape). Sixteen assertions, all green.

Mutation testing then showed three of six mutations **uncaught** — including the
two that matter most, deleting `timeZone: INSTITUTION_TZ` from either formatter,
which is the precise defect the module exists to prevent.

The reason is the sharpest thing in this section: **the development machine's own
zone is `Asia/Kuala_Lumpur`.** A formatter that falls back to the system default
produces byte-identical output there. "The zone is stated explicitly" and "the
zone happens to match" are indistinguishable on that machine, so every assertion
was green for a reason unrelated to what it claimed to check — and would have
stayed green until the code ran on a UTC host, which is where it runs.

Two attempts to fix the harness, and the first failed instructively:

- Setting `process.env.TZ` **inside the test file** does nothing. Jest resolves
  the environment before the test module is evaluated, so the assignment lands
  too late. This looked correct and was not.
- `jest.globalSetup.js` runs in the main process before the workers fork, so the
  variable is inherited. All 17 frontend suites pass under UTC, which also
  establishes that nothing else depended on the developer's location.

The suite now carries a **meta-assertion** — that it is running in a zone which
is *not* the institution's, and that the ambient formatter genuinely disagrees
with the explicit one on the boundary case. Without it the file is theatre. It is
what caught the failed first attempt. All six mutations are now caught.

**The general rule this earns:** a test for environment-dependent behaviour must
first prove the environment can expose the bug. Otherwise it is asserting that
the machine is configured the way the code hopes — which is not a property of the
code at all.

---

## 63. The eighteenth coercion, the nineteenth, and the guard that was inert (2026-09-06)

§54 unified seventeen private `num()` helpers. §57 found an eighteenth spelled
`numOrNull` and concluded that guards must assert on behaviour rather than on
names. This pass applied that conclusion and found it had not been applied.

### 63.1 Two more, both found by shape rather than by name

`routes/coach.js` declared `numOrZero = (v) => (v == null ? 0 : Number(v))` and
shipped the eight risk indicators and five headline scores through it.
`utils/seeder.js` had `bump`, the same shape.

The contracts diverged where it matters: `'abc'` gave **NaN**, `'Infinity'` gave
**Infinity**, and both get DRAWN — the §54 clinical argument exactly. Measured,
those inputs are unreachable today (MySQL DECIMAL yields null or a numeric
string), so this is **preventive like §60, not a live bug**, and the coach payload
was verified byte-identical across all 806 values on real data.

One thing the measurement did change: 30 real NULLs exist, all five headline
scores on the 6 never-screened athletes. Those already took a `?? undefined`
path, so they were correct — but it is worth stating that the null case here is
live while the coercion divergence is not.

### 63.2 The guard against this was itself the defect

The obvious fix is a scan for the SHAPE of a private coercion anywhere in either
package, replacing the previous guard that named two files — which was §54's
name-based mistake one level up, and had duly missed both of the above.

The scan was written, ran over all 159 source files, and reported **no
offenders** while two sat in the tree.

Its pattern was a regex literal whose `\b` word boundaries had become literal
**BACKSPACE bytes (0x08)** during editing. A regex containing a raw backspace
matches a literal backspace, which never appears in source, so it could not match
anything. `grep`, `sed` and an editor all render 0x08 identically to the intended
`\b`; the file parsed and linted. `od -c` on one line was what showed it.

What actually produced the diagnosis was a contradiction: the same pattern built
via `new RegExp(<string>)` in a scratch file matched, while the literal did not,
on identical-looking source. Two results that cannot both be right are worth more
than any amount of re-reading.

### 63.3 The fix is a canary, and it generalises

The scan now proves it works before it is trusted: it must flag a synthetic
offending line, and must NOT flag an innocuous one, before scanning anything.
A pattern broken by any means fails there rather than reporting all-clear.

Three mutations, all caught — reintroducing each private coercion, and corrupting
the pattern itself.

Together with §62's timezone meta-assertion this gives the general rule, and it
is the most portable thing in these two sections:

> **A check must first demonstrate that it can fail.** Files scanned, tests
> passed and rules written are not evidence of coverage. The only evidence is
> having watched the check catch something.

Both §62 and §63 were found by asking the same question — *which decisions has
this codebase already made and only partly applied?* — which has now outperformed
searching for duplication three times running.

---

## 64. A broad survey: seven dimensions measured, two worth acting on (2026-09-06)

Asked to look for improvements beyond the seam the last several passes worked,
this one deliberately measured dimensions that had never been examined together,
rather than sweeping for duplication a ninth time. **Most of it found nothing**,
and that is recorded here in full — an audit whose negative results are discarded
is an audit that gets repeated.

### 64.1 What was measured, and what it said

| Dimension | Result |
|---|---|
| Security middleware | `helmet`, `cors` with an origin allow-list, `express-rate-limit` on `/api/auth`, `express.json()` at its 100 KB default — **complete** |
| Upload hardening | `multer` with `fileSize: 20 MB` **and** a `fileFilter` — bounded |
| API latency | **4–38 ms** across nine representative endpoints; payloads 1.0–79.2 KB. §49's conclusion holds: there is no performance problem to fix |
| Database indexes | 22 indexes; every filtered column covered. One redundancy (§64.3) |
| Error / empty / loading states | Handled. Four pages initially looked bare and all four were false positives — two thin compositions, one six-line re-export, one delegating to `ProfileShell`, which has `statsError`, `prefsError` and catch blocks |
| Accessibility of the heatmap | Already exemplary: every cell carries its VALUE as text beside its colour, `scope` on both header axes, a `title` with full context, and a comment stating the colour-blind rationale |
| Guard coverage | One real gap (§64.2) |

Five of seven dimensions needed no change. That is consistent with §37 and §39,
which reached the same conclusion about dead code and CSS — and the useful part
of saying so is that it stops the next person paying for the same measurement.

**The four false positives are the point of the row about them.** A crude probe
counted `loading`/`error`/`empty` keywords per page and flagged four pages with
zero of each. Reading them showed all four were correct. Fixing what a probe
reports without opening the file is how a cleanup pass breaks working code (§37,
where five automated findings were false and one would have deleted live Module 1
styling).

### 64.2 The one guard gap: colour-word coverage was 4 routes of 12

SILENT_FAILURES 3i established that no surface may name a band by its colour —
"Green" reads to an athlete as reassurance a screening test cannot give. The
browser check enforced it on **four** routes, and its own comment said so
honestly, explaining that `/athlete/dashboard` is the one that actually guards
`ScreeningHistory`.

Section 6 of the same suite already visits **twelve** routes for the
non-answer check. Folding the colour check into that existing loop triples
coverage for **no extra page loads and no extra runtime** — the cheapest coverage
increase available anywhere in this project. 63 checks became 75.

Proven by planting `Amber` on `/admin/personnel`, a page the old four-route pass
could not see: the run fails at 74/75 and names it. The narrow 6b pass is KEPT
rather than replaced, for the reason its comment gives, and both now read one
shared `COLOUR_WORDS` — two lists of band colours would be the fifth private band
map, which is exactly what 3i is about.

### 64.3 The one thing found and deliberately NOT done

`screenings` carries two indexes on identical columns in identical order:

```
UNIQ screenings_athlete_assessed_unique   athlete_id, assessed_at
idx  screenings_athlete_id_assessed_at    athlete_id, assessed_at
```

The unique index fully subsumes the non-unique one; the second is dead weight on
every insert. It is a leftover: the model declares **only** the unique index, so
`npm run seed` produces a clean schema and any fresh database is already correct.
`sequelize.sync()` does not drop indexes, so existing databases kept it when §45
added the unique key.

**Not dropped, on purpose.** The gain at 74 rows is unmeasurable; the change would
have to be applied to BOTH the local and the hosted database to avoid a schema
divergence; and the hosted credentials are write-only in Vercel and not readable
from this machine (DEPLOY.md), so "both" cannot be done in one sitting from here.
Making a schema change to the demo system days before it is shown, for no
measurable benefit, is a bad trade. Recorded so it is a decision rather than an
oversight:

```sql
-- when convenient, on BOTH databases:
ALTER TABLE screenings DROP INDEX screenings_athlete_id_assessed_at;
```

### 64.4 What this pass suggests about where value now is

Three consecutive passes (§62, §63, §64) found more by asking *"which decisions
has this codebase made and only partly applied?"* than by asking *"what is
duplicated?"*. The duplication seam is close to exhausted — nineteen coercions,
six band boundaries, four band maps, three medians and one indicator list have
all been unified — while half-applied decisions keep turning up: a timezone fixed
for bucketing but not display, a behaviour-not-names rule stated but implemented
as a file list, a colour rule enforced on a third of the pages it applies to.

The lens generalises: **find a decision the codebase already believes in, then
check every surface it should reach.** The gap is never in the decision; it is in
the surfaces nobody enumerated.

---

## 65. The roster could not answer the question the role exists to ask (2026-09-06)

Asked to find what the system LACKS rather than what could be tidied, the honest
place to start was the project's own record of it. `MODULES_STATUS.md` lists
three deferred items; this is the one worth building.

### 65.1 What was actually missing

The medical landing pane already had more than the deferred note suggested:
roster size, screened, never-screened, **flagged injured**, institute averages, a
by-sport breakdown, and a "Highest exercise risk" shortlist. The "3 with active
injuries" half of the deferred example existed.

What was missing is sharper than "a summary card", and the existing code said so
itself. The shortlist ranks by HoloMotion's printed Exercise Risks score, and its
subtitle reads:

> the instrument's reading, not the cohort verdict. **Open an athlete for that.**

That is an accurate disclaimer and a description of the gap. The only roster-wide
view was the instrument's raw reading, and the system's own verdict — the
cohort-normed band, which is what §21 made the headline everywhere else — was
reachable only one athlete at a time. For the role whose entire job is deciding
who to see next, that is the wrong way round.

**Not a duplicate of the coach's readiness tiles.** Coach is sport-scoped and
reads readiness (Full-Go / Observation / Restricted); medical is unscoped and
reads the clinical band across the whole institute. Different population,
different vocabulary, same underlying screening.

### 65.2 How it was built, and what it cost

`GET /athletes` now returns `latestBand` and `lastScreenedAt` per row.
`latestBand` is the **effective** band — a clinician's override beats the computed
one — resolved server-side, so this list cannot disagree with the athlete's own
dashboard, the coach's table or the printed report. That is the whole reason it
is not derived in the browser from `injuryRiskIndex`: a second surface computing
the band slightly differently is this codebase's defect class.

One extra query, deliberately not `latestScreeningsByAthlete()` — that helper
re-fetches every athlete and every screening including heavy columns, duplicating
the query the endpoint already makes. Four columns, ordered, first row per
athlete wins. **Measured over 8 runs: min 7 ms, median 8 ms, max 13 ms; payload
40.4 KB → 44.2 KB.** The same steady state as before.

The serialiser's third argument is optional and absent by default, so the only
endpoint that pays for the band is the one that needs it.

### 65.3 The clinical decisions it inherits rather than reinvents

- **Never screened is not a band.** It is counted apart, because "no screening"
  and "nothing flagged" are different facts and collapsing them is the §33
  reassurance failure. An e2e check asserts no athlete carries a band without a
  screening; the mutation that defaults them to green fails it with "6 with a
  band but no screening".
- **Counts are read by GLYPH and word, never hue.** ■ / ▲ / ● beside the count
  and the band's clinical wording, so the row survives greyscale and a red-green
  deficiency — the compact badge's rule (SILENT_FAILURES 3i) applied to a
  summary.
- **Empty is not "all clear".** With nothing above the low band the card says
  *"No athlete is currently above the low band. This says nothing was flagged,
  not that nobody is at risk."*
- **The vocabulary comes from the generated source**, so this pane cannot spell a
  band differently from the page it links to.

### 65.4 Verification, including one harness fault

The band split from the new payload is **38 green / 9 amber / 9 red**, identical
to `npm run measure:facts` and to every other surface. 62 = 56 banded + 6 never.

Three e2e checks were added (78 total) and the mutation above proves they catch.

One diagnostic detour worth recording, because it looked like a product bug: a
scratch probe reported the card missing and the page at 586 characters. The cause
was the probe loading the page from `127.0.0.1:3000` while CORS allows
`localhost:3000`, so the browser blocked every API call and the pane rendered
zeros. The page was correct; the harness was not — the same shape as the hosted
e2e settle-time fault, and the second time in two days that a "failure" was the
measurement.

---

## 66. The watchlist, and two decisions it forced (2026-09-06)

Module 6's last deferred item: "Watchlist / starred athletes — designed in
prototype, not built." Built. Two things about it were harder than the feature.

### 66.1 Where per-user state lives, when the database cannot be migrated

The natural home is a `users.watchlist` JSON column beside `permissions` and
`notify_prefs` — same shape, same idea, and the project has done this three times
before.

It is not there, for a deployment reason. Adding an attribute to the User model
makes Sequelize select it on **every** user query, including the one behind
`/auth/login`. Until the column exists, every login on that database fails with
`Unknown column`. The hosted credentials are Sensitive in Vercel and **write-only
— they cannot be read from this machine** (DEPLOY.md), so the migration cannot be
applied in the same change that needs it. Shipping the column would break the
deployed instance between the deploy and a migration nobody here can run, days
before it is demonstrated.

So the rows live in the existing `settings` table, keyed `watchlist:<userId>`.
That table already exists everywhere, is key/value with a JSON value, and — the
property that makes this safe rather than merely convenient — **the institution's
settings reader ignores unknown keys by construction**: `getSettings()` keeps only
keys present in `DEFAULTS`, and `setSetting()` refuses to write anything else. The
admin Settings page therefore cannot see or edit these, which is correct, because
they are not institution settings.

The trade is recorded rather than hidden: a key/value table is holding per-user
data. If the schema is ever migrated with access to both databases,
`users.watchlist` is the better home and `utils/watchlist.js` is the only file
that changes.

### 66.2 The coach was removed from it, by the audit, on purpose

`coach` was in the allowed roles — it is the squad-monitoring role, so a
watchlist seems to belong there. `npm run audit:access` failed:

```
1 WRITE REACHED BY A READ-ONLY ROLE:
  coach reached DELETE /watchlist/__nope__ — expected 403, got 200
```

The distinction is real: a watchlist writes to the caller's own preference, not
to institutional data — the same category as a notification opt-out, which coach
already has. The audit script has no such category, because it has never needed
one.

**Adding the category was the wrong call and the feature lost instead.** Coach is
read-only by a **locked decision** (`MASTER_CLARIFICATIONS §12`), and the audit's
headline property — *no read-only role completed a write* — is worth more than
the convenience. It is one unqualified sentence in a viva; introducing its first
exemption would replace it with a paragraph about which writes count. That is a
bad trade for a shortcut list, made days before the system is shown.

Medical and admin have it. Extending to coach is one line in `routes/watchlist.js`
plus a preference-write category in the audit script — left as a decision for JC,
because it changes what a locked role means, which is not a change to make while
implementing something else.

### 66.3 The smaller decisions, which are all the same decision

- **It is not audited.** `AuditLog` records acts on the institution's data (§20).
  Starring changes nothing an athlete or the institute would recognise. Opening
  the record is still logged (`athlete.view`, §51), unchanged — the watchlist is a
  shortcut to records whose opening is audited exactly as before.
- **No account can read or edit another's**, exactly like `notify_prefs`. An
  administrator editing a clinician's list would change what that clinician sees
  without telling them.
- **Scope is filtered on the way OUT, not only on the way in.** A coach
  reassigned to another sport would otherwise keep rows naming athletes they may
  no longer see. (Moot while coach has no watchlist, and kept because the
  filtering is the correct shape regardless of who is currently allowed.)
- **DELETE checks nothing.** Removing an id from your own list cannot disclose
  anything, and someone who can no longer see an entry must still be able to
  clear it.
- **An absent or malformed list reads as empty, never as a failure.** A personal
  shortcut must never be why a clinician's dashboard fails to load.
- **The UI says what it is not**: "Your own shortcut list — private to you, and
  not part of the athlete's record." A star on a clinical record otherwise
  invites the reading that it means something about the athlete.

### 66.4 Verification

18 unit tests on the list logic with `Setting` mocked (no database): duplicates,
order preservation, the cap refusing rather than silently dropping, malformed
storage, and per-user separation. Five e2e checks covering the boundaries rather
than the rendering — coach and athlete refused, double-starring adding one row,
another account not seeing it, unstarring leaving no residue. 78 → **83 checks**.
`npm run audit:access` passes with the matrix showing every refusal. Endpoints
46 → 49 in the audit, 59 → **62** in the system map.

The star was also driven in a real browser: toggle, reload, and the athlete
appears in the landing group. Test rows were then removed from `settings`, since
the seeder creates none and a reseed would otherwise silently change what the
demo shows.

---

## 67. Checking the things today's own changes could have broken (2026-09-06)

Asked what had not been checked, the honest answer was: the surfaces most exposed
to the changes made hours earlier. Two were unexamined, and one of them was a
fix I had half-applied to myself.

### 67.1 §62 reached the screens and stopped short of the mail

§62 moved date DISPLAY onto `INSTITUTION_TZ` — `pdfDraw`, the audit summary and
eight frontend sites. It did not reach four producers, found by asking the same
question a second time rather than trusting that the first sweep was complete:

| Site | Was | Consequence |
|---|---|---|
| `scheduler.js` ×2 | `now.toLocaleString('en-GB', { month, year })` | the monthly digest's **subject line** |
| `scheduler.js` | same | the rescreen reminder's opening sentence |
| `export.js` | `toISOString().slice(0, 10)` | the backup filename's date |

The digest one is the one that matters. It ticks hourly and sends when the month
marker turns over, so the send lands whenever that happens to be — and 03:00 on 1
September in Kuala Lumpur is 19:00 on 31 August in UTC, which is what the hosted
process runs. **A monthly summary was subject-lined with the previous month**:
wrong in the one field a reader files it by, wrong exactly once a month, and
therefore in the pattern least likely to be noticed and most likely to confuse
the record later.

`isnMonth()` now renders it in ISN's calendar. Verified against the boundary —
`2026-08-31T19:00:00Z` gives *September 2026* where the server clock gives
*August 2026* — and against a year boundary. It returns an empty string for an
unparseable value rather than `Invalid Date`, because this lands in an email
**subject**.

**The general point, and the reason this section exists:** §62 was a sweep, it
was careful, and it still stopped at the surfaces I happened to be looking at.
"I already fixed that" is not a measurement. The same question asked twice found
four more sites.

### 67.2 The reports, which the same change could have broken

`fmtDate` is used by every PDF and by every downloaded filename, and §62 changed
it. The unit tests passed, but they assert on drawing primitives, not on a
rendered document — and §30 established that a report's defects are properties of
the page rather than of the values.

All five were rendered against the live database and read back through pdfjs:

| Report | Pages | Dates | Junk |
|---|---:|---|---|
| Individual | 3 | 2026-06-14 | none |
| Holistic | 4 | 2026-09-07 | none |
| Team | 3 | 2026-09-07 | none |
| Activity log | 13 | a real range | none |
| Programme activity | 3 | 2026-09-07 | none |

No `NaN`, no `undefined`, no `Invalid Date`, no U+FFFD. Filenames carry the
institution's date.

That last row is worth stating plainly: the run happened while UTC was still
2026-09-06 and Malaysia was already the 7th, so **the filenames demonstrate the
fix rather than merely passing a test**. Before §62 they would have said the 6th.

### 67.3 What this pass did not do

`npm run mail:tick` was deliberately NOT run. It is marker-based and would
usually be a no-op, but "usually" is doing real work in that sentence, and the
recipients are live inboxes including the stakeholder-facing ones. Sending an
unexpected monthly digest to demonstrate that a subject line is correct is not a
trade worth making; the boundary is covered by tests, and `scheduler.test.js`
covers the tick.

---

## 68. The last deferred item, and the scan that was too narrow to find its neighbours (2026-09-06)

Module 5's "PODIUM vs PELAPIS comparison view" was the last deferred item across
all six modules. Building it required one field on the analytics payload, and
adding that field is where the more interesting finding was.

### 68.1 The guard from §63 was narrower than it claimed

§63 replaced a file-list guard with a shape scan and said a nineteenth private
coercion "fails here without anyone having to think of the name first". That was
overstated, and asking the question a second time — the §67 habit — showed why.

The pattern required an `=>` and stopped at `{`, so it matched a private HELPER
and missed the identical coercion written **inline**: in an object literal, or
inside a block-bodied arrow. `routes/athletes.js` had four and `routes/cohorts.js`
a fifth, sitting in the tree while the guard reported clear. Three of them shape
`totalScore`, `exerciseRisks` and `indicator` — **the three values the scatter and
the histogram plot**.

Widening it naively produced three FALSE positives, and they are the useful part:

| Idiom | Verdict |
|---|---|
| `Number.isNaN(Number(d))` in a guard clause | correct — tests, does not produce |
| `Number.isFinite(Number(p))` | correct — same |
| `while ((m = RE.exec(s)) !== null) … Number(m[1])` | correct — the exec-loop idiom |

So the shape is now what a defect actually **is**: a null/undefined guard that
*produces* a value through `? … : Number(…)`. The test carries both halves of the
calibration — two strings it must catch, four it must not — so a pattern widened
until it flags correct code fails just as loudly as one broken until it flags
nothing. Verified by restoring an inline coercion and watching it fail.

**The pattern:** each of §57, §63 and this section found the same defect one
level further out, and each time the previous guard was written against the
example rather than the class. A scan that matches the instance you just fixed is
not yet a scan.

### 68.2 A pair that had silently drifted

`round()` was added to `backend/src/utils/num.js` in §57 and never to
`frontend/src/lib/num.ts`, a pair this project keeps deliberately in step and
tests with one shared table. Nothing noticed for two days because nothing on the
frontend had needed it — this panel is the first thing that did.

Added, matching `toFixed` exactly, and `num.test.ts` now runs `round` through
both packages. Had it been written locally instead, a panel would have rounded
77.85 to 77.9 while every figure it sits beside rounds to 77.8 (§57).

### 68.3 The panel, and the sentence that makes it defensible

Computed from `points`, which the payload already carried for the scatter and the
histogram, so the comparison costs **no extra request** — one field (`programme`)
was added to each point.

**The caveat is the feature.** Athletes are *selected* into PODIUM, so any gap
between programmes reflects who was chosen at least as much as anything the
programmes did. "PODIUM scores better, therefore PODIUM works" is a causal claim
this data cannot support — the same selection error §32 refuses when it keeps the
norm floors off. It is printed **above** the table, because a caveat underneath is
read after the conclusion has formed.

The seeded data makes the point unusually well: **PODIUM 74.8, PELAPIS 74.4** —
close enough that anyone hoping for a programme effect would have to argue for a
0.4-point difference across 34 and 19 athletes. `OTHERS` (n=3) self-caveats as
indicative, below `SMALL_COHORT`.

Averages cover athletes with a screening; never-screened are not counted as
zeros, the rule the institute headline already follows.

### 68.4 Verification, and a mistake in the middle of it

The split reconciles with the figure printed beside it: the institute mean
recomputed from the same points is **74.9**, identical to the headline's
`overallActivityScore`, and the groups sum to 56 = the screened count. Three e2e
checks assert exactly that (83 → **86**), because a split that does not add up to
its own headline is the two-surfaces disagreement this codebase keeps finding.

The mistake: a scripted edit sliced the file between two marker strings, and the
second marker also appeared **inside a comment in the text being inserted**, so
the indices inverted and the slice deleted a span of JSX. `tsc` caught it
immediately, the file was restored from git, and the edit was redone with the
editor rather than index arithmetic. Recorded because it is the fourth
string-manipulation failure of the day and they share one cause: **editing code
by matching text is fragile in exactly the cases where the text is about the
code.**

---

## 69. Making the day's own failure mode impossible to repeat (2026-09-06)

Four defects on one day shared a single cause: editing code by matching or
slicing text through a shell heredoc. Each produced a file that parsed, linted
and passed its tests.

| What was written | What landed | How it surfaced |
|---|---|---|
| `\n` in a pattern | a real newline, splitting the regex | test suite failed to parse |
| `\n` again | same | same |
| `\b` word boundary | **literal BACKSPACE (0x08)** | nothing — the guard went green while two defects sat in the tree |
| a slice between two markers | the second marker occurred inside the inserted text, so the indices inverted and JSX was deleted | `tsc` |
| quotes in `git commit -m` | the shell ended the argument and git read prose as pathspecs | git errored |

Only one of those was caught by a tool. The backspace was found by noticing that
the same pattern, built with `new RegExp(<string>)`, matched where the literal
did not — a contradiction, not an inspection.

**The durable fixes are two.**

`backend/tests/sourceHygiene.test.js` scans both packages for characters that
should never appear in source and fails in under a second naming file, line and
character. It carries its own canary, because a scanner that cannot find what it
looks for is exactly what 3l was about. Verified by planting a backspace in
`utils/recall.js`: the file still parses, and the test still fails.

CLAUDE.md **gotcha 9** states the rule — use the editor tools, hold patterns in a
string rather than a literal when a script really is the right shape, never
anchor a slice on text that also appears in what is being inserted, and
`git commit -F` rather than `-m` with prose.

**What the first run found**, which is the argument for having written it: four
stray BOMs in `middleware/auth.js`, `models/Athlete.js`, `models/MuscleFlag.js`
and `models/User.js` — invisible, inconsistent with 227 other files, and
pre-dating today entirely.

**And what it did not find**, which is the argument for measuring before ruling:
`pdfDraw.js` contains a no-break space and a BOM on purpose, as regex literals in
`WIN_ANSI_SUBS` — the table that strips exactly these characters before they
reach pdfkit (§30f). The file that solves the problem is the one file allowed to
contain it, and the exemption asserts that table still exists so it cannot
outlive its reason.

## 70. The instrument's own words, and the three cards that had no data (2026-09-09)

JC: *"Find things to upgrade on the dashboards. MAKE THE MOST OF THE DATA FROM
THE HOLOMOTION PDF."*

### 70.1 What the PDF holds that the dashboards did not show

Swept every field the extractor asks for against every surface that renders it.
Exactly one was dark: **`summaryText`** — the numbered comment HoloMotion writes
under "Summary" on page 1, in its own words, about this athlete.

It was extracted (`utils/holomotionExtract.js` asks for it verbatim), asserted by
the ground-truth script (`summary read`, non-empty, >20 chars), stored in
`screenings.summary_text` — and rendered on **one** surface: the individual PDF
report. So the only way to read the instrument's own verdict was to download a
PDF, which contradicts the mission statement directly: *turn these reports into
something each role can act on **without any of them needing to read a PDF**.*

Everything else checked out. Posture is **not** a gap — it was deliberately cut
on 2026-08-01 and sits in the `MASTER_CLARIFICATIONS` non-goals table ("do not
revive without discussion"), so it stays cut.

### 70.2 Carried on the detail payload only

`DETAIL_ATTRS = [...INDICATOR_ATTRS, 'summaryText']`, used by the single-athlete
paths. The roster query keeps `INDICATOR_ATTRS`: it fetches one screening **per
athlete**, and `summary_text` is a TEXT column no roster renders.

`toIndicator` omits the key entirely when the row does not carry the column, so
a roster payload is **byte-identical** to before — verified against the live
database, not assumed. Three states are kept distinct because they are different
facts: absent (this payload does not carry summaries), `null` (the report had no
Summary section — true of the compact layout), a string (the instrument's words).

### 70.3 Reproduced, never paraphrased

The card names HoloMotion as the author, exactly as the Training Prescription
card does. Restating somebody else's clinical hedge in our own words would make
it ours.

`lib/reportSummary.ts` splits the joined text back into the printed numbered
points, under one rule: **if the pieces do not rejoin to the original, we did not
understand the text and it is rendered whole instead.** The marker pattern
requires whitespace after the period, which is what keeps "12.5 degrees" and
"1.5 months" intact — a decimal has no space after its point.

**No new disclosure.** Every role that sees this panel — athlete (own record),
coach (own sport), medical, admin — can already download the individual report,
which has always printed this text. What changes is that reading it no longer
requires opening a PDF.

**The seeder does not fabricate one.** All 74 seeded screenings have `null`, and
that is deliberate: inventing clinical prose for demo data is the silent-failure
class itself. The card appears when a real report is imported — which is the
demo, and the three ISN reports carry it.

### 70.4 What the browser check found, which no test could

The card did not render. Every unit test was green and the payload was correct.

The four pages each hand-lifted **one** field from `.screening` — `subitems`,
the one field this panel does not read — so `prescription` and
`lateralSymmetry` had been arriving `undefined` **on every dashboard since they
were built on 2026-08-23**. Two cards described in `CLAUDE.md` as shipped
clinical surfaces had never once rendered, and Lateral Symmetry's own comment
claimed it had fixed the very "PDF-only" problem it was still suffering from.

Nothing caught it because every field is optional (no type error), the
components are correct in isolation (component tests pass), the payload is
correct (backend tests pass), and e2e asserts the *absence of wrongness* — a
card that renders nothing produces no `NaN`, no `undefined`, no missing
geometry. Full analysis: `SILENT_FAILURES.md` **3n**.

Fixed structurally: the panel resolves the three fields from `.screening`
itself, so a field cannot go dark by somebody forgetting one of four call sites.
An explicit top-level value still wins, so the coach page's deliberately
narrowed object keeps working — and that page now passes `screening` through,
adding no reach it did not already have via its sport-scoped PDF download.

**Do not "tidy" the resolution back to reading only the flat props.** That is
the defect, and reverting it turns 5 of `ScreeningPanel.test.tsx`'s 10 red.

### 70.5 Guards added

- `frontend/src/lib/reportSummary.test.ts` — 16 cases, mostly about what the
  splitter must **refuse**. Mutation-checked: relaxing the marker's trailing
  `\s+` fails the decimal cases; dropping the ordered or rejoin checks each
  fails one.
- Three of the first draft's four guards proved **individually unreachable** —
  disabling any one changed no result. They were deleted rather than kept as
  reassurance, which left the rejoin check genuinely load-bearing. A guard that
  cannot fire still reads as protection, and this project has already been
  bitten by one that matched nothing (`SILENT_FAILURES` 3l). One test was also
  renamed: it claimed to cover an empty point, and an empty point turned out to
  be unreachable.
- `backend/tests/reportSummaryPayload.test.js` — 9 cases pinning both halves of
  the contract, including that the roster JSON never contains the string
  `summaryText`. Mutation: always emitting the key fails 3.
- `frontend/src/components/dashboard/ScreeningPanel.test.tsx` — 10 cases
  asserting each card renders **from the shape the API actually sends**. This is
  the assertion the whole stack was missing.

## 71. The same sweep, run over the rest of the site (2026-09-09)

JC: *"Now do the same for the other parts of the website as well."*

§70 found three cards drawing nothing. This is that hunt generalised: what else
is computed, sent or built, and never reaches a reader?

### 71.1 The scan that had to be checked before it was believed

The first version reported **364 of 379** payload keys as never used by the
frontend — including `cohortZ` and `effectiveBand`, which the hero obviously
reads. That was the tell. Its matcher was ``new RegExp(`\b${k}\b`)``: inside a
template literal `\b` is a **backspace character**, not a word boundary, so the
pattern matched nothing and everything looked dark.

**That is SILENT_FAILURES 3l reproduced exactly, in the sweep written to find
silent failures** — and by the same mechanism CLAUDE.md gotcha 9 warns about,
since `\b` typed into a shell heredoc arrives as `\b`. Rewritten with the
editor tool, holding the pattern as a string, and given a **canary**: the script
now refuses to report anything until it has found four keys known to be present.
Every scan in this project should carry one.

Corrected, it reported 24 candidates against 284 keys.

### 71.2 What was actually dark: seasonality

`seasonality` is computed by `utils/screeningPeriods.js`, shipped on
`GET /athletes/analytics/periods`, and drawn **only by the PDF** (`seasonTable`).
The Programme Activity page received it on every load and rendered nothing.

That contradicts this project's own stated property, which CLAUDE.md puts in
writing: the KPI report is *"drawn from the same `utils/programmeActivity.js`
the page reads **so the screen and the document cannot quote different KPIs**"*.
They did. The document had a section the screen did not.

It also answers a **named stakeholder question** — Dr Thung's "which quarter is
the risky one" — which made it the most expensive thing on the list to leave
hidden.

**The refusal is the feature, and it is drawn more prominently than any finding
the card can produce.** On the current data the panel declines twice over:
`sufficient: false` (all 74 screenings fall in 2026), and the two quarters with
data sit 0.4 points apart, well inside the dead band. So it says *"Not yet a
seasonal reading"*, explains that a worst quarter here is indistinguishable from
the quarter the weaker squads happened to be screened in, and names nothing.

Three properties mirror `seasonTable` deliberately, because the two must not
read differently: ranked by **share** not count (throughput differs by quarter);
the caveat printed **above** the numbers (§68's rule — underneath, it is read
after the reader has already picked a quarter); and a quarter with no screening
shown as **"not screened"**, never as 0%, which would invent a reassuring
reading out of an absence.

Bars are never band-coloured. A red bar would read as a verdict on that quarter,
which is the exact claim the card refuses to make without two years of data.

### 71.3 The one-time code stated its own expiry from memory

`/verify-otp` printed *"The code expires in 10 minutes"* as a literal, while the
server was already sending `expiresInMinutes` on the response nobody read. The
two agreed on the day — `RESET_CODE_TTL_MIN` is 10 — so this is a latent defect,
not a live one: a number stated in two places, in the one flow where being wrong
locks a clinician out of their own account.

Now carried from the server and refreshed by a resend, which issues a new code
with a fresh clock. When it was not told a TTL (a direct navigation), the page
**makes no claim at all** rather than falling back to a second hardcoded 10.

### 71.4 What the sweep cleared, and why that is worth recording

Reported honestly, because "we looked and it was fine" is a result:

- **No dead components.** The four with no JSX call site are a hook
  (`NormChangeNotice`), a module of named exports (`Charts`), and the two ACWR
  components retained by a documented decision.
- **`notifyPrefs`, `freshStats`, `minN`, `fallbackEnabled`** — false positives.
  The first two reach the UI under different wire names (`preferences`,
  `drift`); the last two are function arguments, not payload.
- **`BodyMap.interaction`** — flagged as never passed, and it is: BodyMap builds
  it internally and passes it as a positional argument. The focus ring works and
  its e2e check is honest.
- **`autoRotate`** — never passed because it **defaults to true**, which is the
  documented §38 behaviour. Absence is correct here.
- **`Charts.reference` / `referenceLabel`** — a genuine unused capability: a
  chart can draw a reference marker and nothing asks it to. Left alone. It
  withholds no data, so adding a caller would be a new feature rather than a
  fix, and that is JC's call.

### 71.5 Guard

`npm run e2e` gained section **4e** (86 → 93 checks): the card is on the page,
it states the refusal while insufficient, it names no quarter, the caveat is
**above** the table, empty quarters read "not screened", and every share the
util computed appears on screen. Mutation-verified — hiding the card fails 5 of
the 7.

This is §70's standing rule applied rather than restated: **presence is asserted
where a reader would notice its absence, because a suite that only looks for
wrongness cannot see a missing panel.**

## 72. Hunting fodder, and finding almost none (2026-09-09)

JC: *"remove the fodder code and elements throughout the website"*.

The result is mostly a **negative** one, and it is worth recording as such: after
scanning five categories, two things were removed. A codebase that has shed the
Excel import, the injury model, ACWR, Activity Tracking and Posture Evaluation
could reasonably be full of stumps. It is not — those cuts were made properly,
with code archived or deliberately retained and labelled.

### 72.1 The scan nearly deleted 25 live CSS classes

The first dead-CSS run reported 28 unused selectors. **Twenty-five were live**,
in two distinct ways the scanner could not see:

1. **Modifiers built from a variable.** `const base = 'bodymap-region'` then
   `` `${base}--${state}` ``. The literal `bodymap-region--weak` appears nowhere,
   and all 17 body-map state classes were listed as dead. Deleting them would
   have broken the body map — Module 1, the component CLAUDE.md calls audit-fixed
   and asks to be touched with the smallest possible surface.
2. **A class followed by a template interpolation.** `` `app-shell${navOpen ? ' nav-open' : ''}` ``
   — the trailing delimiter set omitted `$`, so 8 more live classes read as dead,
   including `.sidebar-link` and `.upload-dropzone`.

Both were caught by checking candidates against the source by hand *before*
deleting anything, which is the only reason this section is not a bug report.
Corrected, the answer is **0 dead classes out of 534**.

The scanner was then **mutation-tested**: a planted `.zzz-definitely-dead-canary`
is found. A planted `.card--zzz-dead-modifier` is **not** — the base-is-used rule
excuses it. So the honest claim is not "the stylesheet is provably clean" but
"no plain dead class remains, and 47 modifier classes are excused by a rule that
cannot distinguish a live modifier from a dead one." That blind spot is stated
rather than hidden.

### 72.2 What was actually removed

- **`DotPlot`'s `reference` / `referenceLabel`** — a comparison-line capability
  no caller ever used: two props, the marker span, a sentence of legend copy, and
  the `.dotplot-ref` rule. Removed rather than wired, because wiring it would be
  a new feature and this instruction was to remove, not to add.
- **`alertIfNeeded(id)`** — a one-athlete wrapper whose comment said it was
  "kept for direct callers/scripts". Nothing in `src`, `tests` or `scripts` ever
  called it: the callers it was kept for were never written. `alertMany([id])`
  returns the same object.

### 72.3 What was deliberately NOT removed

- **`AcwrGauge.tsx`, `WorkloadChart.tsx`, `risk.ts`** — unrendered and
  unimported, and **locked**. CLAUDE.md: *"do not delete `risk.ts` either."* The
  ACWR rebuild path (`docs/fyp/ACWR_REBUILD.md`) depends on them. Their CSS
  (`.acwr-gauge-band--*`) stays with them: removing the styles of a retained
  component leaves it broken on the day it is restored, which is worse than an
  unused rule.
- **`ScreeningData.subitems`** — the panel never reads it and four call sites
  pass it (the cargo noted in §70.4). Removing it forces every caller to strip a
  field it legitimately holds, and broke the coach page's narrowed object at the
  type level. The comment explaining the quirk is worth more than the deletion.
- **`fs.realpath`** — the one backend dependency nothing imports, and it is the
  documented transitive `npm run coverage` needs to run at all.
- **57 unreferenced exports** — almost all TypeScript `interface`/`type`
  exports, which are a component's public surface whether or not this repo
  consumes them, plus constants used inside their own module. Churn, not fodder.

### 72.4 Everything else came back clean

0 dead CSS classes, 0 orphan source files (the four candidates are a directory
import, an ambient `.d.ts`, and the two locked ACWR components), 0 unused
dependencies, and no commented-out code — the `^\s*// *(const|return|if…)` sweep
returned six hits, all of them prose beginning with a keyword.

**A third heredoc-escaping failure happened during this pass** (`\$&` arriving
as `\$&`, an invalid regex), which is now three in two days from the same
shortcut. Gotcha 9 is not advice; scripts get written with the editor tool.

## 73. Operational readiness, and a finding I got wrong (2026-09-09)

An assessment of whether AIRMS would hold up in a large sport enterprise named
five gaps. Acting on them found that **one of the five did not exist**, and the
correction matters more than the work.

### 73.1 The health endpoint was already there, and better than the one proposed

`GET /api/health` has existed at `server.js` throughout: `SELECT 1` rather than a
model query, **503 rather than 500** so an uptime monitor reads a sleeping
database as down, and the driver error deliberately logged rather than returned
because the endpoint is unauthenticated. It exists because Aiven's free tier
powers the database off when idle.

The scan reported it missing because it grepped for `'/health'`, `'/healthz'`
and `'/readyz'` — and the route is registered as `'/api/health'`. **A scan is a
claim about the code, and it inherits the blind spots of its pattern.** Third
time this week: `\b` becoming a backspace, the CSS scan calling 25 live classes
dead, and now a route missed by a prefix. Recorded rather than quietly dropped.

### 73.2 Structured logging — `utils/logger.js`

63 `console.*` calls and no logger. On a laptop a human reads the terminal; on
the hosted instance the API is serverless and its output lands in a platform
viewer where nothing can be filtered by severity, grouped by route, or alerted
on. The failure mode is not a missing message, it is a message nobody can find.

**No new dependency** — pino or winston would each add a tree to a project whose
shape is deliberately self-contained packages. One JSON line per event is the
part that matters and it is forty lines.

**The important part is what it refuses to write.** A log is not an audit row:
the audit trail is deliberate and access-controlled, a log lands in a third-party
viewer with weaker access control and longer retention. So `redact()` drops
athlete names, IC numbers, clinician notes, bands, scores, tokens and request
bodies — by key, and by value shape for anything credential-looking — and **fails
closed**: an object it does not positively recognise becomes `[object]` rather
than being serialised, so `logger.error('failed', { athlete })` cannot leak a
roster row. Nine tests, and the two guards that carry the weight were checked by
mutation: serialising nested objects fails the "handed a row whole" case, and
dropping the key filter fails three.

Wired at the **error boundary** (`sendError`) rather than mass-replacing 63
calls: that is where every unshareable failure in every route converges, so
`level:"error"` there is the alert condition for the whole API.

Timestamps are **UTC**, deliberately diverging from `INSTITUTION_TZ` — logs
correlate against platform timestamps, screening *dates* belong to ISN's calendar.

### 73.3 Server-side paging on the roster — opt-in on purpose

`GET /athletes` was unbounded, and the roster UIs filter client-side, so the
whole active roster travels on every load. Measured: **45.3 KB for 62 athletes**,
730 bytes each — about 3.5 MB at 5,000 and 14 MB at 20,000. Fine for ISN, and
the first wall this API meets at institutional scale.

`limit` / `offset` are now accepted, validated (400 outside 1–`MAX_PAGE`=500),
and `X-Total-Count` **always** carries the unpaged total so a caller cannot be
paged without being told what it did not receive.

**The default is deliberately unchanged.** Four pages consume this endpoint as a
plain array and filter it themselves; silently returning the first N would show a
physiotherapist a roster that looks complete and is not — this project's whole
defect class, applied to the list a clinician decides from. So the capability
exists and is tested, and **migrating the UI to use it is a separate, visible
step that has not been taken.** Do not "finish" this by adding a default cap
without also moving the filtering server-side.

Verified live: default 62 rows uncapped, `limit=10` returns a true **prefix** of
the default ordering (so paging cannot drop or repeat an athlete), filters
compose, tail pages work, and a page is 7.3 KB against 45.3 KB. Six e2e checks
(section 4f, 93 → 99).

### 73.4 What was assessed and deliberately not built

Named so the omissions are decisions. **No multi-tenancy** — no `orgId` on any
model, and cohort norms are institution-governed by design, so this is one
institution by construction rather than by oversight. **No SSO/OIDC or MFA.**
**Audit writes remain fire-and-forget**, which the project already records as the
right trade for transparency logging and the wrong one for anything that must be
proven. **The rate limiter is still in-memory and per-IP.** Each is an addition
rather than a fix, and each is JC's call — the first two are the difference
between a strong single-institution tool and an enterprise product.

## 74. The four enterprise gaps, argued and settled (2026-09-10)

§73 named four things AIRMS lacks for enterprise use. JC: *"debate yourself then
do them."* Two were built. Two are refusals with reasons, because building them
would have damaged the artefact rather than improved it.

### 74.1 Multi-tenancy — REFUSED

**For:** it is the single blocker to serving more than one institution, and §73
named it first.

**Against, and decisive:** three separate reasons, any one sufficient.

1. It contradicts a locked decision. Cohort norms are **institution-governed** —
   approved, versioned, pinned as one set (`MASTER_CLARIFICATIONS §12`). AIRMS is
   one institution *by construction*, not by omission. Tenancy is not a column,
   it is a different governance model.
2. **The hosted database cannot be migrated from here.** The Aiven credentials
   are write-only in Vercel (`DEPLOY.md`, 2026-09-04). An `orgId` on nine models
   is an `ALTER TABLE` on both databases, and one of them is unreachable — so the
   change would deploy code the hosted schema cannot satisfy.
3. It is outside the six-module FDD, which CLAUDE.md sets as the scope ceiling.

**What is honest instead:** say in the viva that AIRMS is single-institution by
design, and that tenancy is the first thing a second customer would require.

### 74.2 SSO / OIDC and MFA — REFUSED

**For:** enterprise procurement usually mandates both.

**Against:** there is no identity provider to integrate with. ISN has not offered
one, so an OIDC client would be written against a hypothetical endpoint and
**could not be tested against anything** — untested integration code in a graded
artefact is worse than a documented absence. MFA is more tractable (TOTP), but is
a whole enrolment, recovery-code and reset surface, and is equally outside the
FDD.

**What was done instead:** the adjacent thing that *is* testable — the login
throttle it shares a threat model with (§74.4).

### 74.3 Audit durability — BUILT, but not the way it was framed

The obvious move is to await the audit write inside the caller's transaction.
**Rejected.** A broken audit table would then take down the clinical read it
describes, and refusing a physiotherapist an athlete's record because a logging
table is full is a worse failure than an incomplete trail — and it is the one
that happens at 8am before a session.

But the *silence* was indefensible, because `athlete.view` logging is the stated
justification for leaving medical staff unscoped (§51): "any clinician may open
any record because every open is recorded" only holds if the recording happens.

So the non-blocking property stays and the silence goes. Failures are counted
in-process (the only counter that still works when the database is what broke),
persisted best-effort, logged as `audit.write_failed` so they can be alerted on,
and surfaced on the admin settings payload as `auditHealth` — **null unless
something has actually failed**, because a permanently-green badge teaches people
not to read it. Same shape as §35's scheduled-mail outcomes.

Seven tests. The dead-export guard (`codebaseHygiene` H2) caught the first
attempt: `auditFailures` was exported and wired to nothing, which is the
`winAnsiSafe` pattern exactly — a guard nobody installed. It is now on a route.

### 74.4 Rate limiting — BUILT, and it exposed an older fault

`express-rate-limit`'s default store is a Map in the process. Hosted, the API is
serverless: concurrent invocations each get their own memory and every cold start
empties the counter, so "30 failures / 15 min / IP" was really a limit on how
fast one instance could be hit. Now backed by the `settings` table — the same
place `utils/lock.js` already keeps cross-process state. **The address is hashed
with an HMAC keyed on `JWT_SECRET`**, because an IP is personal data under the
PDPA and a limiter needs to know only that it is the *same* address.

It **fails open** with a loud log: a settings-table hiccup must not become
"nobody at ISN can sign in".

**THE OLDER FAULT.** Making the counter shared exposed that `trust proxy` was
never set, so `req.ip` is the socket address — which on Vercel is the platform's
proxy, *the same for every user*. The in-memory store hid this by rarely filling.
A shared persistent counter would have turned it into **"30 failed logins by
anyone locks out the whole institution"**. Fixed with `app.set('trust proxy', 1)`
— one hop, not `true`, because trusting every hop lets a caller forge
`X-Forwarded-For` and skip the limiter.

Verified against the running server, which is the only way this could have been
caught: 30 failures from one forwarded client return 429 at the 31st, **a second
forwarded client is unaffected** (the property that was broken), and loopback is
exempt.

**Loopback is skipped deliberately.** `npm run audit:access` calls every endpoint
as four roles and *expects* refusals; `npm run e2e` signs in repeatedly. With a
persistent store those accumulate across runs, so the two commands that gate a
commit locked the developer out of the API — which is exactly what happened
mid-verification. Hosted, requests arrive through the proxy and never appear as
loopback, so this exempts nothing in production.

Expired counters are pruned on the scheduler's existing hourly tick, in its own
try-block: housekeeping must not cost the digest its month.

## 75. Dependency audit — one upgrade removed five of seven (2026-09-10)

A whole-project scan for upgrades found the genuinely unexamined area:
**`npm audit` had never been run this session, and the production tree carried a
critical.**

### 75.1 The finding, and its single root

Backend: **13 vulnerabilities — 6 moderate, 6 high, 1 critical.** Five of the
seven high/critical traced to **one** package:

```
pdfjs-dist@4.0.379
  └── canvas@2.11.2            ← the REAL node-canvas
      └── @mapbox/node-pre-gyp
          └── tar@6.2.1        ← the critical
```

The irony is worth stating: `package.json` aliases `"canvas":
"npm:@napi-rs/canvas"` precisely so AIRMS never builds node-canvas (gotcha 6) —
but `pdfjs-dist` declared its own nested copy, so it was in the tree anyway,
dragging a critical `tar` behind it.

**`pdfjs-dist@4.10.38` has no dependencies at all** — upstream dropped both
`canvas` and `path2d`. And it sits **inside the existing `^4.0.379` range**, so
this is a lockfile move, not a version-range decision.

Result: **13 → 8, and 6 high + 1 critical → 2 high + 0 critical.** Real
node-canvas is gone from the tree; only the `@napi-rs` alias remains, which is
what the design always intended.

### 75.2 Verified by rendering, not by the suite passing

PDF rendering is the one thing this upgrade could plausibly break, and no unit
test covers the pdfjs path (`pdfDraw.test.js` exercises **pdfkit**, the writing
side). So it was checked against both real HoloMotion layouts, before and after:

| | before | after |
|---|---|---|
| thung.pdf p1 / p2 / p3 | 459650 / 527924 / 460831 bytes | **identical** |
| nazwan.pdf (38pp, expanded) | — | pages 1, 4, 6 render; `renderForExtraction` returns 1–6 |

**Byte-identical output on every page.** The `Cannot polyfill Path2D` warning is
also gone, because pdfjs no longer attempts it — one less alarming line in the
import log that was never actually a fault here.

### 75.3 The two that remain, and why neither is being fixed

- **`xlsx` (high, no fix available).** SheetJS prototype pollution and ReDoS.
  **Both are parsing-side**, and AIRMS never parses a spreadsheet: the only use
  is `XLSX.write` in `routes/export.js`, generating the backup from its own
  database. The Excel *import* was retired on 2026-07-12 and archived. So the
  advisory is real and **unreachable in this codebase** — which is the answer to
  give if an examiner greps the audit output, rather than a shrug.
- **`nodemailer` (high, fix is a MAJOR to 10.x).** Not taken. A major version of
  the mail client, days from a viva, against a documented SMTP setup that
  already has a stated deliverability caveat, is a poor trade for a
  vulnerability in a path that sends institution-authored text to fixed
  recipients. **JC's call**, recorded rather than silently skipped.

### 75.4 The frontend is deliberately untouched

3 vulnerabilities (2 high, 1 critical), all in **`postcss`**, and `npm audit`'s
only remedy is `next@16` — a **major** framework upgrade. `MASTER_CLARIFICATIONS`
locks the tech stack, `CLAUDE.md` forbids proposing a stack swap without
discussion, and Next 14 → 16 days before submission would put every page at risk
to fix a build-time CSS tool. **Not done, and not a close call.**

## 76. Best available fix for each remaining advisory (2026-09-10)

§75 left three problems marked "not fixed". Asked for the best solution to each,
the answer turned out to be different for all three — and two of them were
fixable without the breaking change npm proposed.

### 76.1 Frontend: override the transitive, do not upgrade the framework

`npm audit` offered exactly one remedy for all three frontend advisories:
`next@16`, a major framework upgrade. That is not the remedy for two of them.

`postcss` (high, 4 advisories) and `nanoid` (high) are **transitive** — Next
merely depends on them, and both have patched releases. An `overrides` block
pins them without touching Next:

```json
"overrides": { "postcss": "^8.5.28", "nanoid": "^3.3.18" }
```

postcss 8.4.31 → **8.5.28**, nanoid → **3.3.18**. Frontend went **3 → 1**, and
`npm run build` succeeds with the whole route table intact.

**The remaining critical is Next itself**, and it is worth knowing what it is
rather than carrying it as a number. The four advisories are: SSRF in **rewrites**,
disclosure of **Server Function** endpoints, RCE on **Windows-hosted** servers,
and RCE in the **Image Optimization API via AVIF**. Measured against this app:

| Advisory | Reachable here? |
|---|---|
| SSRF via rewrites | **No** — `next.config` defines no rewrites |
| Server Function disclosure | **No** — no `'use server'` anywhere |
| Windows-host RCE | **No** — production is Vercel (Linux) |
| Image Optimization AVIF RCE | **No** — the only two `next/image` uses are local PNGs, and no `remotePatterns`/`domains` is configured, so remote images are refused by default |

So the critical is real upstream and unreachable in this deployment. `next@16`
before submission would risk 25 pages to close it.

### 76.2 Backend: the major upgrade was safe, and testing said so

`nodemailer` needed a major (8 → 10). §75 declined it on risk. That was a guess,
and the empirical answer is better:

- AIRMS's entire surface is `createTransport` + `sendMail({to, subject, text, attachments})`.
- Node 22 here, nodemailer 10 requires ≥20.
- After upgrading: **653 tests pass**, the console-fallback transport renders a
  correct reset email, and — the decisive check — **a real Gmail SMTP handshake
  verifies** (`transport.verify()` against the live credentials).

Taken. Five advisories closed, including two highs.

The reachability analysis is kept because it is the viva answer if asked why it
mattered less than it looked: all five needed either an API AIRMS never calls
(`raw`, `resolveContent`, domain allow-lists) or an **attacker-controlled
recipient address** — and there is no such path. `forgot-password` accepts an
email but sends to `user.email`, the *stored* address, using the submitted one
only as a lookup key.

### 76.3 What remains, and the honest recommendation

**Backend 13 → 5** (4 moderate, 1 high). **Frontend 3 → 1.** Both criticals gone.

The last high is `xlsx`, still with no npm fix. Two real options, neither taken
unilaterally:

- **Swap to `exceljs`.** The surface is four calls — `book_new`,
  `json_to_sheet`, `book_append_sheet`, `write` — so the change is contained to
  `routes/export.js`. Removes the advisory outright, from npm, with no CDN.
- **Install SheetJS's own 0.20.x tarball** from `cdn.sheetjs.com`, which is the
  vendor's published fix. It works, but adds a **build-time dependency on a
  non-npm host** — and `DEPLOY.md` already records four separate deploy faults
  that each presented as one opaque error.

**Recommendation: the `exceljs` swap, but not this week.** The advisory is
parse-side and AIRMS only ever calls `XLSX.write` on its own database rows
(§75.3), so the gain is a clean audit rather than closed exposure — worth having
before an examiner runs `npm audit`, not worth churning a working export days
before a viva. **JC's call.**

## 77. The xlsx decision, argued three ways (2026-09-10)

§76.3 left this as JC's call with a recommendation. Asked to settle it, the
recommendation turned out to be **wrong**, and the evidence that overturned it
came from a question asked two messages earlier about Vercel storage.

### 77.1 Option A — swap to `exceljs`. REJECTED on measurement.

The plan in §76.3. Four call sites, contained to one file. Then the numbers:

| | unpacked | direct deps |
|---|---|---|
| `xlsx` | **7.5 MB** | bundled |
| `exceljs` | **21.8 MB** | **9** |

Those nine include `saxes@^5`, `archiver@^5` and `unzipper@^0.10` — all pinned to
majors behind current (6.x, 8.x, 0.12.x) — and `uuid@^8.3.0`, *the same uuid
already flagged moderate through Sequelize*. Swapping would import a fresh
advisory surface to close one.

And the decisive part: the Vercel free tier is at **75% of its 10 GB Function
Storage**, with roughly 44 deploys a week. Adding **+14 MB to every backend
deployment** to fix an advisory that cannot be reached would make a live problem
worse in exchange for a cosmetic one. Rejected.

### 77.2 Option B — SheetJS's own 0.20.3. TAKEN.

npm reports `xlsx` as `range: *, fixAvailable: false`, which reads as "nothing
can be done". That is an artefact of SheetJS having left npm at 0.18.5. The
**individual advisories have real boundaries**:

- Prototype Pollution — vulnerable `<0.19.3`
- ReDoS — vulnerable `<0.20.2`

So **0.20.3 is outside both**, and the vendor publishes it on their own CDN.
Installed from there, with **zero code change** — the four calls AIRMS makes
(`book_new`, `json_to_sheet`, `book_append_sheet`, `write`) are unchanged.

Verified rather than assumed, because a backup that writes without error and
does not open is precisely the §F failure: the real workbook was generated from
the live database **and read back** — 2 sheets, **62 athlete rows and 336 muscle
flags**, matching `measure:facts` exactly.

**Production audit: 4 moderate, 0 high, 0 critical.** From 13 (6 high, 1 critical)
at the start of this pass.

### 77.3 The cost, accepted with eyes open

This adds a **build-time dependency on a non-npm host**. It is documented in
`DEPLOY.md` as the fifth way a build can fail, with the one-line rollback.

Two things make it acceptable where the CDN risk would otherwise have decided it:

1. It fails **loudly and at build time**, with npm naming the URL — unlike the
   four faults in `DEPLOY.md`, which all present as one opaque runtime error.
2. `package-lock.json` pins the **integrity hash**, so the bytes are verified
   even though the registry is not npm's. A substituted tarball fails to install
   rather than shipping.

### 77.4 Option C — leave it. Rejected, but it was close.

The advisories are parse-side and unreachable here, so the security gain is
genuinely near zero; the gain is an examiner running `npm audit` and seeing no
high. That was not worth a 14 MB dependency swap (A), but it *is* worth a pinned
tarball that changes no code and no behaviour (B).

## 78. Next 15, not Next 16 — npm proposed the wrong upgrade (2026-09-10)

§76.1 declined the Next upgrade because npm said the only fix was `next@16`, two
majors ahead, and the advisories looked unreachable. **npm was proposing the
wrong version, and that changed the answer.**

### 78.1 The aggregate range hid the real boundaries

`npm audit` reports one aggregate — `9.5.0 - 15.5.23` — and one remedy,
`next@16.3.4`, because its resolver picks **latest**, not the minimum that fixes.
Broken out, all **seventeen** advisories have a 15.5.x boundary:

```
>=13.4.0  <15.5.24   RCE, Windows-hosted
>=10.0.0  <15.5.24   RCE, Image Optimization API (AVIF)
>=12.0.0  <15.5.21   SSRF in rewrites
>=13.4.0  <15.5.16   XSS in App Router
…and thirteen more, none above 15.5.24
```

**`15.5.24` clears every one.** One major, not two.

### 78.2 Three facts made the migration small

The reasons Next 14 → 15 is usually painful do not apply here, and each was
checked rather than assumed:

| Usual blocker | Here |
|---|---|
| Next 15 needs React 19 | **No** — its peer range is `^18.2.0 \|\| ^19.0.0`; React stays at 18.3.1 |
| `cookies()` / `headers()` / `params` became async | **No such call anywhere** in `src` |
| App Router server-component churn | **57 `use client` files across 25 pages** — the app is client-rendered |

### 78.3 Verified, in this order

`npm audit --omit=dev` → **found 0 vulnerabilities**. Then `tsc` clean, `next
lint` clean, **328 unit tests**, a full `next build` producing all 25 routes as
static — and finally the check that actually settles it: **`npm run e2e`, 99/99**,
a real Chrome driving every role through every page, including the body map
(155/156 regions) and the charts.

Frontend production advisories: **3 → 0**, including the critical.

### 78.4 Backend tail: override what is safe, refuse what is not

`qs` was still moderate at 6.15.3 — the top of its own vulnerable range — pinned
there by Express 4. An override to `^6.16.0` clears it and Express with it,
without an Express 5 major.

**`uuid` was deliberately left.** npm's proposed "fix" is
`sequelize@3.30.0` — a *downgrade* from 6.37.8, which is nonsense — and forcing
`uuid@11+` would hand Sequelize 6 an ESM-only package with a different API to
close a moderate in an internal id generator. Refused, and recorded rather than
carried silently.

**Backend production: 13 → 2 moderate, 0 high, 0 critical.**

---

## 79. Decision support, and how a read-only role got a stateful feature (2026-09-11)

Four things were asked for — name the next action, show what changed, work a
triage queue, compare athletes. They are **four views of one ranking**, so the
ranking lives once in `utils/decisionSupport.js` and every surface reads it.
Built separately they would each grow their own idea of "worst first", and this
project has already paid that bill twice: the band vocabulary ended up defined
four ways, `SMALL_COHORT` five.

### 79.1 The refusals, which are the load-bearing part

- **It does not predict injury. It ORDERS a worklist.** The wording throughout
  is *"see this athlete next"*, never *"this athlete will be injured"* — §33
  applied to a recommendation rather than to a badge.
- **It never invents a reason.** Every entry carries the rules that put it
  there, read from the screening's own persisted `factors`, so the worklist
  cannot disagree with the record it points at and a clinician can dispute the
  ordering on evidence rather than on faith.
- **Never-screened is ranked, but never AS A BAND.** `PRIORITY.never` sits
  *above* green: an athlete nobody has assessed is unknown, not low risk.
  Collapsing those is the §33 reassurance failure, and the mutation registry
  carries an entry that breaks this on purpose.
- **"Reviewed" means "I have looked at this", never "I have cleared this
  athlete."** Clearing an athlete is the band override, and that is audited.
  The tick is keyed on the **screening**, not the athlete, so a new import
  returns them to the worklist — a tick taken in July must not silence a
  September red.

### 79.2 The marker problem, and why the obvious answer was wrong

"What changed **since you last looked**" needs somebody to remember when that
was. The obvious home is a per-user row on the server — and it cannot be, because
storing it is a **write**, and `coach` is read-only by a locked decision
(`MASTER_CLARIFICATIONS §12`). The watchlist (§66) hit this exact wall:
`npm run audit:access` failed with *"a read-only role completed a write"*, and
the lock was kept in preference to the feature.

So the first version shipped a fixed 7-day window for everyone and said so
honestly. That was defensible and still wrong in effect: a server-side marker
would have worked for medical and admin and been silently absent for coach,
giving **the role that most needs a squad summary the worst version of it**.

The resolution is that the marker does not have to live on the server at all.
**The caller remembers it** — the browser holds the timestamp, keyed per user id
because a shared clinic terminal is the normal case at ISN — and sends it as
`?since=`. The server only *filters* by it. No write anywhere, so every role
gets the real feature, including the read-only one the compromise was penalising.

Accepting a timestamp from the client discloses nothing: it **narrows** a set the
caller can already request in full via `windowDays`, and the scope is still
derived from `req.user`, never from the query.

### 79.3 Every failure of the marker points the same way

A client-supplied value has failure modes, and each was resolved toward showing
**more** than necessary rather than less. A noisy panel is a nuisance; a quiet
one is a missed athlete, which is the single outcome this panel exists to
prevent.

| Input | Result | Why |
|---|---|---|
| Valid, recent | used as given (`basis: 'since'`) | the feature working |
| Older than 90 days | pulled forward to the floor (`'clamped'`) | an untouched store must not turn one request into a full-history scan |
| Unparseable | falls back to the window (`'window'`) | a corrupt store must not be able to **empty a clinical panel** |
| In the **future** | falls back to the window (`'window'`) | a shared terminal with a wrong clock would otherwise set the cutoff past every real screening and report *"nothing moved"* over an athlete who went red today |

The future-clock case was **not** in the first implementation. It was found by a
test whose name promised one behaviour while its assertion pinned the opposite —
the name was right and the code was wrong, so the code changed.

### 79.4 The server reports which rule it applied

`GET /api/decisions` returns `changesBasis` and `changesFrom`, and the panel
renders its heading from those — never from whether it happened to send a marker.
The two can differ (clamped, or rejected), and the difference is precisely what a
reader would be misled about: *"Moved since you last looked"* printed over a
7-day window converts **"I have not shown you five weeks"** into **"there was
nothing to show"**.

That is this project's defect class in one sentence, so it is guarded rather than
commented. `DecisionPanel.test.tsx` pins the three headings to the three bases,
and two mutation entries break them.

**Why a jsdom test and not an e2e check:** the change list only renders when
something moved, and on the seeded data nothing has moved inside the default
window — measured 2026-09-11, **0 changes at 7 days and 36 at 90**. `npm run e2e`
walks straight past the entire section and reports green. The one thing worth
guarding here is invisible to the suite that would otherwise cover it.

### 79.5 The marker advances on a click, not on render

Advancing it automatically is tidier code and worse behaviour: a reader who opens
the dashboard, is interrupted, and returns tomorrow would have "seen" a worsening
they never read, and it would never be shown again. **Mark these as read** is
explicit, and the list stays on screen after the click — clearing the panel under
the reader's cursor destroys the thing they just asked to keep a record of having
read.

The honest cost is in the manual (§22.4): the marker is **per device**, and
clearing browser data forgets it. Both of those degrade to the window, which
shows more.

---

## 80. The optimisation pass, and the two places it did NOT find anything (2026-09-11)

Measured before changed, and most of what was measured turned out to be fine.
Recording the negatives matters as much as the fix: a future pass should not
re-audit these from scratch, and "we looked and it was already good" is a
finding.

### 80.1 Latency told us nothing, and query COUNT was the right question

Every endpoint answers in 3–10 ms locally:

| endpoint | median | payload |
|---|---|---|
| `/coach/readiness` | 10 ms | 42.8 KB |
| `/decisions` | 9 ms | 15.0 KB |
| `/athletes?limit=100` | 9 ms | 44.2 KB |
| `/cohorts` | 7 ms | 79.2 KB |
| `/audit?limit=50` | 5 ms | 16.9 KB |

That figure is close to meaningless: MySQL is on loopback here. Hosted, the
database is Aiven across a network and the API is serverless, so what a request
costs is roughly **how many round trips it makes**, not how fast each runs on
this machine — and a stopwatch on a laptop cannot see it.

Counted by hooking Sequelize's own `query` rather than by reading the code,
because an N+1 hides in a loop nobody reads as a loop:

```
5  /api/decisions          5  /api/coach/readiness
5  /api/athletes           4  /api/cohorts
```

**No N+1 anywhere.** Every route already batches: one roster query, one ordered
screening fetch keyed by `IN (...)`, settings, and the auth middleware's user
re-read. Nothing to fix, and that is the answer.

**A false positive, caught by being suspicious of the instrument.** The first
run truncated each statement to 90 characters and reported `/api/decisions`
reading the settings table **twice**. It does not: one is `getSettings()`'s
`findAll`, the other is `reviewed.js`'s `findByPk` for a single key, and the
`WHERE` clause that distinguishes them sat past the cut. Re-run at 240
characters they are plainly different queries. A measurement tool has a
resolution, and a duplicate that only exists below it is the same silent failure
this project keeps finding, one level up in the toolchain.

### 80.2 The real finding was on the client, and dev could not show it

A browser probe against the **dev** server showed four identical `/decisions`
requests per dashboard load. That number is an artefact: React StrictMode
double-invokes effects in development on purpose and not in a production build.
Optimising against it would have been chasing the tooling.

Measured properly against `next start` — a real production bundle, following
gotcha 8's stop-dev → clear `.next` → build order — `/decisions` fires **once**.
But something else did not:

```
                     BEFORE            AFTER
/medical/dashboard   7 calls, me x3    5 calls, no repeats
/athlete/dashboard   6 calls, me x3    4 calls, no repeats
/coach/dashboard     4 calls, me x2    3 calls, no repeats
```

`DashboardLayout`'s session check listed **`allowedRoles` — an array prop — in
its effect dependencies**. Every page passes it as a literal
(`allowedRoles={['medical', 'admin']}`), so React builds a fresh array on each
render and the effect re-ran on every parent re-render; a dashboard re-renders
several times as its panels' data arrives. Three identical round trips to
confirm one session, on a serverless API where each can be a cold start — and on
the very endpoint whose budget ordinary navigation was spending (§3r in
`SILENT_FAILURES.md`).

Fixed by comparing the roles **by value** (`allowedRoles.join('|')`) and
deriving the array back inside the effect, so it has no dependency on the prop's
identity at all. The gate is not weakened: if a page genuinely changes which
roles it admits, the string changes and the check re-runs — pinned by a test
that asserts exactly that, alongside one asserting an equal-but-new array does
not.

**This is the same trap `DashboardLayout.test.tsx` already warned about at the
top of the file** — "a router stub returning a fresh object each render loops
for ever" — reached through an ordinary prop instead of a mock. The mock version
was caught immediately because it hung the test suite; the prop version was
invisible, because its symptom was merely *doing the work three times*. A
correctness bug announces itself. A waste bug does not, which is why it needs
measuring rather than reviewing.

Registered in `npm run mutate` (21 guards): restoring the array dependency fails
the test.

---

## 81. Future-proofing: guarding a defect CLASS, and backing claims that only a deployed system can settle (2026-09-11)

Two problems, and they are the same problem seen from either end.

§79 and §80 fixed specific things. `SILENT_FAILURES` 3r was not really a specific
thing: it was **a correct component wired to a lifecycle hook the platform does
not promise to run**. Unit tests assert the component, integration tests assert
the wiring, and *neither asserts the host is still alive when the callback
fires*. Nothing in this repository could have caught it, because everything in
this repository reads the code or runs it locally.

### 81.1 The line between safe and unsafe, measured rather than reasoned

Two pieces of unawaited work, both looking equally careless in a review, behave
differently on the hosted API:

| scheduled from | lands on Vercel? | when |
|---|---|---|
| during the handler, unawaited (`recordAudit`) | **yes** | immediately — already in flight |
| `res.on('finish')` | **yes** | **3 ms** after the request |
| `setTimeout(…, 1500).unref()` | **yes** | **7.25 s** later, on the *next* request |

**Corrected 2026-09-11.** This section first said the instance is *frozen and
the work discarded*. Measured with a temporary diagnostic (added, measured,
reverted), that is wrong: post-response work is **deferred until the instance is
thawed by another request**, not lost. See `SILENT_FAILURES.md` 3r (continued).

Deferred is the worse failure, because it looks healthy. Anything that must be
ready **before the next request** is reliably too late — that request reads the
old value first, and the store's read-modify-write then writes over the late
update. Reproduced in isolation on the host, six successful requests through a
`skipSuccessfulRequests` limiter three seconds apart:

```
local    999 999 999 999 999 999     decrement always in time
hosted   999 998 997 997 996 995     mostly too late
```

Same code, same store; the only variable is the host.

`tests/serverlessLifecycle.test.js` now guards the class: no `res.on('finish')`
anywhere, `skipSuccessfulRequests` not re-enabled, and `recordAudit` not
"made reliable" by converting it into a post-response hook.

### 81.2 The one the sweep found, and its evidence status

`utils/postImport.js` queues the cohort recompute *and* the at-risk alert email
behind `setTimeout(flush, 1500)` — **`.unref()`ed**, which explicitly asks Node
not to stay alive for it — while the commit route responds immediately. On a
serverless host that is strictly more exposed than the thing that already failed.
If it never runs, an import reports success having refreshed no norms and
emailed nobody.

**It was unmeasured when first written, and is now measured.** The original note
said so honestly — no import has ever run on the hosted instance (0
`screening.import` audit rows), there is no forensic trace either way, and
committing one of the three demo reports to find out would spend an athlete's
first-screening moment belonging to Dr Thung and Dr Hoo.

The temporary diagnostic settled it without touching clinical data. An unref'd
`setTimeout(…, 1500)` scheduled during a hosted request landed **7.25 seconds
later, on the next request** — so the timer is not discarded, it is *deferred
until something else thaws the instance*.

**That makes the case stronger, not weaker.** "The work is lost" would at least
be consistent; "the work happens whenever somebody next calls the API" is a
queue whose latency is set by unrelated traffic. After the last import of a
Friday afternoon, the next call may be Monday — and the alert email about a red
athlete waits with it, while the import reports success.

Fixed for that reason, and the cost is small and measured: awaiting is
**50–200 ms** (a full local recompute, three runs). Where deferring is unsafe the work runs inside the request; on a
long-lived process the debounce survives untouched, so N commits are still ONE
recompute. Both halves are asserted by **behaviour under both platforms**, not by
grepping for the constant, and the in-request path is **bounded**: `flush()`
re-queues when another process holds the recompute lock, so an unbounded drain
loop would hang an HTTP request for as long as somebody else's recompute lasted.

### 81.3 `npm run verify:claims`

Every other guard here checks the code. This one asks a **running instance** and
prints the number it got:

```
cd backend; npm run verify:claims              # local  (8/8, 1 not measurable)
cd backend; npm run verify:claims -- --hosted  # deployed (10/10, 2026-09-11)
```

It covers exactly the claims that a code reading cannot settle: the throttle
counts failures and a success forgives them; `/auth/me` is outside it; an
`athlete.view` row actually lands; the change marker is honoured, clamped, falls
back on garbage, and cannot be hidden by a wrong clock; and `coach` gets the
feature while still being refused the write.

Two properties are deliberate. It **skips** the throttle claims locally rather
than passing them — loopback is exempt from the limiter by design, so a green
tick there would be meaningless, and a guard that reports success where it cannot
measure is the exact failure this document is about. And it is **paced**:
verifying a rate limiter by hammering the host is how this machine tripped
Vercel's bot protection and locked itself out for twenty minutes.

### 81.4 The scanner that was silently inert, again

The new lifecycle scanner stripped comments with `^\s*//.*$` per line. In
JavaScript `.` does not match `\r`, and this repository holds **mixed line
endings** — files committed earlier are CRLF, files written this session are LF.
So the stripper matched nothing on every pre-existing file, and the scan reported
`routes/auth.js` as an offender for a line that is a *comment about* the hazard.

The canary did not catch it. The canary checked `utils/authThrottle.js` — a file
written that same day, in LF, the single format where the stripper worked. **A
control that only exercises the happy path is not a control**, which is
`SILENT_FAILURES` 3l one layer out: the guard was fine, its *verification* picked
the wrong subject. The control now checks one CRLF file and one LF file, and
asserts the stripper still leaves real code behind.

The three pre-existing strippers (`codebaseHygiene`, `scriptImports`,
`recompute`) were checked against a CRLF sample and are all safe — they do not
anchor with `$`. Recorded as a checked negative so nobody re-audits them.

---

## 82. The dependency upgrade pass — and the four refusals it earned (2026-09-12)

Every package was considered. What shipped is everything that could be **shown
still to work**; what did not ship is recorded here with the measurement that
stopped it, because "we are on an old version of X" is a viva question and
"nobody tried" is a bad answer.

### 82.1 The fingerprint that made the risky half decidable

The PDF pipeline has no unit test that can see it — it needs a real report, a
real canvas and a real OCR pass. So a baseline was taken **before** anything
moved, from two genuine HoloMotion reports:

| | render | OCR redaction box | prescription |
|---|---|---|---|
| `thung.pdf` | 1191×1684 @2 | `ocr {144, 258, 96, 20}` | `null` (compact layout) |
| `nazwan.pdf` | 1192×1686 @2 | `ocr {233, 576, 415, 29}` | 48 exercises |

Those numbers are the instrument. Every upgrade below was judged by whether they
came back identical — and the prescription figures match the ground truth
CLAUDE.md has carried since the parser was written.

### 82.2 Upgraded

**In-range across all three packages** (`npm update`), then these majors:

| package | from → to | what it cost |
|---|---|---|
| `express` | 4.22 → **5.2** | nothing. Every route pattern here is simple — no wildcards, optionals or regex — which is where Express 5 breaks. Both query-shape guards (§48) still answer 400. |
| `multer` | 1.4.5-lts → **2.3** | nothing. Verified with a real multipart upload of a 12-page report. |
| `pdfjs-dist` | 4.10 → **6.3** | one API change, below. |
| `@napi-rs/canvas` | 0.1.100 → **1.0.9** | see the coupling, below. |
| `bcryptjs` | 2.4 → **3.0** | nothing. New hashes are `$2b$`; **6/6 existing `$2a$` hashes in the database still verify**, which is the only question that mattered — a failure there locks out every account. |
| `pdfkit` | 0.18 → **0.20** | one resolution fix, below. |
| `dotenv` | 16 → **17** | a promotional banner on every load, silenced with `quiet: true` at all seven call sites. |
| `concurrently` | 8 → **10** | one path fix, below. |

**pdfjs and canvas are COUPLED, and neither can move alone.** Upgrading either
one by itself **segfaults** the render path — a hard native crash, not an
exception. Together they work and reproduce the baseline exactly. Anyone
bisecting these must move both.

pdfjs 6 also removed `doc.destroy()`; teardown is now `loadingTask.destroy()`.
Fixed at all three call sites and wrapped in `try/finally`, which the old code
was not — `prescriptionFromPdf` released nothing at all, so every import leaked a
document, and under 6 that is a worker process each time.

**The end-to-end proof.** A real report through the live API on the new stack:
the name comes back `██████`, every value matches, and
`npm run verify:vision` reports **GROUND TRUTH REPRODUCED** — all scalars, all
25 subitem cells, muscle flags and the summary.

### 82.3 Refused, with the measurement

- **`tesseract.js` 5 → 6 or 7.** Breaks name redaction. The OCR stops finding the
  name and the code falls back to blanking a large region:
  `method "ocr" box {144,258,96,20}` becomes
  `method "fallback:name-not-found" box {0,101,691,758}`.
  It still reports `redacted: true` — a naive check passes — but a 691×758
  blackout covers the gauges the vision model reads, so extraction would degrade
  while redaction *looked* fine. Both 6 and 7 do it; 5.1.1 is exact.

- **`@napi-rs/canvas` 1.0.9 alone** and **`pdfjs-dist` 6 alone** — segfault, as
  above. Only the pair is viable, and the pair shipped.

- **Next 15 → 16** (and the `eslint` 9 + flat-config migration it forces).
  Next 16 builds, type-checks and passes all 339 frontend tests. It was still
  refused, on what comes next: `eslint-config-next@16` requires ESLint ≥9, and
  its new `react-hooks` rules report **38 errors across 19 files** — 24
  `set-state-in-effect`, 14 `refs`. These are new opinions, not newly found bugs,
  and the prescribed fix does not fit this app: the flagged effects read
  `localStorage`, which is unavailable during SSR, so the lazy-initialiser form
  the rule wants would break hydration. **14 of the 38 are in `BodyMap.tsx`** —
  Module 1, audit-fixed, "touch with the smallest possible surface". Refactoring
  it for a style rule, days before a viva, against a version that fixes no
  vulnerability and adds no feature we need, is a bad trade.
  Next 15.5.25 is current, supported and clean on `npm audit`.
  *If it is ever revisited:* Next 15.5 already warns that `images.qualities` must
  be configured for 16 — that is a real prerequisite, not a guess.

- **`uuid` 11 / `sequelize`'s 2 moderate advisories** — unchanged and still
  refused for the reason in §76: it would hand Sequelize 6 an ESM-only package
  with a different API, to close a moderate in an internal id generator.

### 82.4 Two breakages that looked like corrupt installs

Both were absolute paths into `node_modules`, and both failed with a bare
`MODULE_NOT_FOUND` naming a file that plainly exists — which reads as a broken
install rather than a moved entry point, and costs ten minutes each time.

- `guide-to-pdf.js` required pdfkit by **absolute directory path**. pdfkit 0.20
  dropped `main` for `exports`, and Node does not consult `exports` for absolute
  paths. Now the bare specifier.
- `scripts/dev.js` hardcoded `concurrently/dist/bin/concurrently.js`;
  concurrently 10 renamed it to `index.js`. Now read from the package's own `bin`
  field, which survives a rename.

The `npm ci` that followed also re-triggered **gotcha 7** — OneDrive dehydrating
`node_modules` into reparse points, presenting as `errno -4094 UNKNOWN read` from
the ESM loader. The documented fix (`npm ci` in the affected package) cleared it.

### 82.5 Where it ended

```
backend 47 suites / 700 tests · frontend 20 / 339 · 23 mutations caught
audit:access clean · verify:claims 8/8 · e2e 110/110 · guide:pdf clean
verify:vision GROUND TRUTH REPRODUCED · npm audit: frontend 0, backend 2 moderate (§76)
```
