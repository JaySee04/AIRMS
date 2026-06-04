# AIRMS — Design Decisions

> Why we chose what we chose. Read this **before** suggesting "improvements" — most obvious alternatives have already been considered and rejected, and the rejection rationale is here.
>
> This file is also the **FYP defensibility cheat-sheet**. Every entry has a one-liner JC can use in viva voce.

---

## 1. sRPE for internal training load

**Decision:** Load (AU) = Duration (min) × RPE (1–10), self-reported by the athlete.

**Why:**
- Validated method per Foster et al. (2001), "A New Approach to Monitoring Exercise Training"
- Captures **internal** load (how hard the athlete experienced the session) rather than external load (HR, GPS, power)
- Scales without any sensor hardware — works for every sport at every venue
- ISN does not have universal HRM/GPS coverage across its athlete pool

**Rejected alternatives:**
- **Heart-rate-zone-based load** — requires HRM hardware, sport-specific zone calibration
- **GPS / TRIMP** — only viable for outdoor field sports
- **Coach-rated intensity** — adds delay, doesn't scale

**Counter to "but isn't self-reporting gameable?":** The system tracks the *ratio* of acute to chronic. Even if an athlete consistently over- or under-rates, their personal trend is meaningful. Internal consistency matters more than inter-athlete comparability.

**Defensibility one-liner:** *"sRPE is the most widely cited method for capturing internal training load in team-sport literature. Originally proposed by Foster et al. (2001) and revalidated in present-day contexts by Inoue et al. (2022) and Yang et al. (2024); Gabbett (2016) built ACWR around it. Self-reporting is by design — it captures how the athlete experienced the session, which is what predicts injury risk."*

---

## 2. Composite risk model (FYP differentiator)

**Decision:** Risk classification combines (a) standard ACWR thresholds personalised by the athlete's screening data, with (b) escalation when active injuries or high muscle-flag counts align with the workload.

**Implementation:** [frontend/src/lib/risk.ts](../frontend/src/lib/risk.ts) → `classifyCompositeRisk()`.

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

## 5. Dual persistence layer — MongoDB Atlas for FYP I, MySQL for ISN production

**Decision:** AIRMS is implemented against **both** MongoDB (Atlas) and MySQL, side-by-side. The Mongo stack is the FYP I demo; the MySQL stack is the deployment target for ISN's production environment. Both backends expose an identical REST API; the Next.js frontend is unmodified across the swap.

| Stack | Backend entry | Port | Models | Status |
|---|---|---|---|---|
| MongoDB | `backend/src/server.js` | 5000 | `models/` (Mongoose) | Default demo path |
| MySQL | `backend/src/server-sql.js` | 5001 | `models-sql/` (Sequelize) | Verified end-to-end on `feat/mysql-migration` |

See [DB_SWITCHING.md](DB_SWITCHING.md) for the swap procedure and [MYSQL_MIGRATION_PLAN.md](MYSQL_MIGRATION_PLAN.md) for the migration design.

**Why this framing matters:** A reviewer of the FYP I draft flagged the MongoDB choice as "highly questionable" for a medical/injury tracking system, citing ACID and FK concerns. Rather than ship only one stack and argue, AIRMS now demonstrates that:

1. The MongoDB choice was deliberate — see hierarchical-data justification below — not "vague".
2. The relational-integrity concerns are addressed concretely, not rhetorically — there is a working MySQL backend with engine-enforced FKs, ACID transactions, and the same demo data, runnable from `feat/mysql-migration`.
3. ISN's production deployment runs MySQL (Dr Thung confirmed) — the migration was always in scope for FYP II, just delivered earlier.

### Why MongoDB suits FYP I

- ISN screening data is **hierarchical by nature** — each athlete has a profile with embedded `myodynamia[]` and `tension[]` arrays of `{muscle, side}` flags, plus an 8-field nested `risks` object. Mongoose embedded documents represent this in one round-trip; a normalised relational schema needs 2–3 join tables for one logical entity.
- Read patterns are **athlete-scoped** — every dashboard load is "give me everything about ATH0001". Document stores are optimised for that exact query shape.
- **Healthcare standards already use document stores.** FHIR (Fast Healthcare Interoperability Resources — the HL7 standard the WHO endorses) is JSON-native; FHIR servers commonly use MongoDB or document databases. The "medical = relational" framing is conventional wisdom, not a standard.
- Cloud-hosted Atlas free tier removes infra concerns for an undergrad FYP — fewer moving parts in a demo.

### Counter-arguments to the panel's concerns

**"NoSQL lacks ACID."** Out of date. MongoDB 4.0 (2018) introduced multi-document ACID transactions for replica sets; 4.2 extended it to sharded clusters. AIRMS's Atlas cluster is a replica set — full ACID is available. The self-report → injury promotion uses `mongoose.startSession()` + transaction in production.

**"No foreign-key constraints."** Mongoose schemas enforce referential validation at the application layer — every `Activity.athleteId`, `Injury.athleteId`, etc. is validated against the `Athlete` collection at the route layer. The constraint exists, it's enforced by the application rather than the engine. The MySQL stack adds engine-level FKs on top of this, which the FYP II production deployment inherits.

**"Risk of medical-data corruption."** The semantic invariants in a clinical record ("recovery_date must not precede onset_date", "active injuries cannot have a recovery_date") are app-layer checks regardless of database engine — FK constraints don't protect against these. Both stacks enforce them identically.

### Rejected single-stack alternatives

- **MongoDB-only.** Leaves the panel's criticism unaddressed and provides no migration path for ISN's MySQL production.
- **MySQL-only from the start.** Would have meant rewriting all the hierarchical screening models against join tables 6 months ago, before the data model was stable. Premature relational normalisation when the schema was still moving.
- **PostgreSQL.** Reasonable alternative to MySQL but doesn't match ISN's production target.

**Defensibility one-liner:** *"AIRMS ships a dual persistence layer. Mongo handles the hierarchical screening data with one round-trip per read; MySQL gives engine-level relational integrity and matches ISN's production environment. Both back the same frontend via a serialiser layer. The panel's concerns about ACID and FK constraints are addressed by the MySQL stack; the explainability and demo simplicity are preserved by the Mongo stack."*

---

## 6. Next.js 14 App Router (frontend)

**Decision:** Next.js 14 with the App Router (`app/` directory), TypeScript, no separate SPA build step.

**Why:**
- Filesystem routing maps cleanly to the role-based URL structure (`app/athlete/dashboard/page.tsx` → `/athlete/dashboard`)
- TypeScript catches data-shape mismatches between frontend and Mongoose-defined backend models — important for an FYP where there's no QA team
- Client components (`'use client'`) handle interactivity; server components stay out of the way (we don't really use SSR here since the app is fully authenticated)
- `npm run dev` HMR is fast and reliable
- Easy to deploy to Vercel later if needed

**Rejected alternatives:**
- **Pages Router** — older, more boilerplate, no auto layout sharing
- **Vite + React Router** — would require manually setting up TS configs, routing, build pipeline
- **Plain CRA** — deprecated, slow build

**Defensibility one-liner:** *"App Router gives filesystem-driven routing that matches our role-based URL hierarchy. TypeScript catches schema drift between frontend and Mongoose models. No special build infrastructure needed."*

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

*Last updated: 2026-05-17. Update whenever a meaningful architectural call is made.*
