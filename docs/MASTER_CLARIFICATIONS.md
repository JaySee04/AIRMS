# AIRMS — MASTER CLARIFICATIONS

> **Read this FIRST, before any other document except README_FOR_CLAUDE_CODE.md.**
>
> This file is the architectural truth of AIRMS. Locked decisions live here. If a different document or memory entry contradicts this file, **this file wins**.

---

## 1. What AIRMS is (one paragraph)

AIRMS is a web app that helps **Institut Sukan Negara (ISN)** manage and predict injury risk for national-level Malaysian athletes. Athletes log their training; medical staff log injuries and review screenings; admins oversee analytics and data uploads. Built on Next.js / Node.js / MySQL. Submitted as **JC's Final Year Project** with **Dr Thung** (ISN) as stakeholder and **Dr Hoo Wai Lam** as academic supervisor.

The project is an iteration on a previous HTML prototype (`airms-prototype/`) inherited from prior students Shewin and Keying. AIRMS rebuilds the prototype on a real fullstack codebase and adds new analytical capabilities — most importantly the **composite risk model** (see §6).

---

## 2. The locked tech stack

| Layer | Choice |
|---|---|
| Frontend framework | **Next.js 14 (App Router)** with TypeScript |
| Backend framework | **Node.js + Express** |
| Database | **MySQL 8.x** via **Sequelize**. See [DESIGN_DECISIONS.md §5](DESIGN_DECISIONS.md#5-mysql-with-sequelize-single-persistence-layer); the prior MongoDB stack is preserved on the `main` branch and documented in [MONGO_RECOVERY.md](MONGO_RECOVERY.md). |
| Authentication | **JWT** stored in `localStorage` |
| Charts | **Chart.js** + **react-chartjs-2** |
| Body map asset | **react-muscle-highlighter** (MIT) — path data copied into project, NOT installed as dependency |
| Styling | Plain CSS in `frontend/src/styles/globals.css` (CSS variables + class-based) |
| Dev orchestration | `concurrently` at root, single `npm run dev` starts both servers |

**Why these:** see [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md). Do not propose swapping any of these without explicit user approval.

---

## 3. The 3 user roles

| Role | Demo email | Landing page | Scope |
|---|---|---|---|
| **athlete** | `athlete@isn.gov.my` / `athlete123` | `/athlete/dashboard` | Self only — sees own activity, injuries, risk |
| **medical** | `medical@isn.gov.my` / `medical123` | `/medical/dashboard` | All athletes — can log injuries, review self-reports |
| **admin** | `admin@isn.gov.my` / `admin123` | `/admin/dashboard` | Full system — analytics, data uploads, PDF reports |
| **admin** (SMTP demo) | `poseidonapollo11@gmail.com` / `admin123` | `/admin/dashboard` | Identical privileges; created so the email-reset flow can demo against a real Gmail inbox |

Each role's seeded password is `<role>123` (e.g. `admin123`). Confirmed in `backend/src/utils/seeder.js`. The seeded passwords do **not** satisfy the 10-char + complexity policy — that's intentional (the policy gates user-driven password setting, not seeded fixtures). If you ever reset a seeded user's password via the live UI, pick something that satisfies the policy (e.g. `ISN#admin2026`).

Role gating is done client-side in `frontend/src/components/layout/DashboardLayout.tsx` via the `allowedRoles` prop. Backend enforces RBAC at every protected route via `backend/src/middleware/rbac.js`.

Auth routes live in `backend/src/routes/auth.js`:
- `POST /api/auth/login` — issues JWT, updates `lastLoginAt`. Error response is deliberately generic to avoid account enumeration.
- `POST /api/auth/forgot-password` — issues a 6-digit OTP (SHA-256 hashed, 10-min TTL), emails it, resets the per-user attempt counter. Returns the same response regardless of whether the email matched an account.
- `POST /api/auth/verify-otp` — verifies the OTP, invalidates it after 5 wrong attempts, and on success swaps in a 32-byte verification token (SHA-256 hashed, 5-min TTL) that the client holds in `sessionStorage` for step 3.
- `POST /api/auth/reset-password` — takes email + verification token + new password; the OTP itself never travels in the reset payload.
- `POST /api/auth/change-password` — in-place rotation for authenticated users
- `GET /api/auth/me` — returns the current user including `createdAt` + `lastLoginAt`

The forgot-password flow is a 3-page sequence in the frontend (`/forgot-password` → `/verify-otp` → `/reset-password`), all running in one browser tab. Each page is single-purpose; direct navigation to a later page without going through the earlier ones bounces back to `/forgot-password`.

Password policy is enforced server-side at `backend/src/utils/passwordPolicy.js` and mirrored at `frontend/src/lib/passwordPolicy.ts`: ≥10 characters, uppercase + lowercase + digit + symbol.

---

## 4. The 6 FDD modules (authoritative scope)

Per JC's FDD, AIRMS has **exactly 6 modules**. Don't propose new ones.

| # | Module | Primary role | Status |
|---|---|---|---|
| 1 | Activity Tracking & Logging | athlete | ✅ fully complete |
| 2 | Athlete Dashboard / Workload | athlete | ✅ fully complete |
| 3 | Injury & Recovery Logging | medical | 🟢 functional, recovery milestones deferred |
| 4 | Data Management (Excel + HoloMotion PDF) | admin | 🟢 functional — Excel upload + vision-AI PDF ingestion + Excel data backup |
| 5 | Injury Analytics | admin | ✅ fully complete (live PDF generation via pdfkit) |
| 6 | Medical Dashboard | medical | 🟢 functional, watchlist deferred |

Detailed status and per-module specs: [MODULES_STATUS.md](MODULES_STATUS.md).

JC needs **more than 2 fully working core modules** to score full marks on the Technical Implementation rubric. All six modules are now usable end-to-end. Modules 1+2 are the FYP showcases with no known gaps. Modules 3–6 have explicit deferred items, each tied to either an external dependency (Module 4 → ISN canonical schema) or a polish item that doesn't block system usage.

---

## 5. The ACWR formula (textbook layer)

Acute:Chronic Workload Ratio per Gabbett (2016):

```
session_load (AU) = duration_minutes × RPE (1–10)
acute_load        = sum of session_load over the last 7 days
chronic_load      = average of weekly load over the last 4 weeks
ACWR              = acute_load / chronic_load
```

Standard literature bands:
- **< 0.8** → Low workload / undertrained
- **0.8 – 1.3** → Optimal (the "sweet spot")
- **1.3 – 1.5** → Elevated
- **> 1.5** → High risk

Backend endpoint that returns this: `GET /api/activities/athlete/:id/acwr` ([backend/src/routes/activities.js](../backend/src/routes/activities.js)).

Frontend recomputes ACWR locally in the dashboard for finer-grained per-week breakdown — see `computed` block in [athlete/dashboard/page.tsx](../frontend/src/app/athlete/dashboard/page.tsx).

---

## 6. The composite risk model (the FYP differentiator — DO NOT WEAKEN)

AIRMS does **not** apply textbook ACWR bands directly to every athlete. Instead, it:

1. Computes a **vulnerability score** from the athlete's screening data (injury risk index, overall activity score, mobility, stability, symmetry)
2. **Personalises** the ACWR thresholds based on vulnerability (±~15% swing around the literature baseline)
3. **Escalates** the risk band if active injuries or muscle flags align with the current workload

Lives in [frontend/src/lib/risk.ts](../frontend/src/lib/risk.ts) → `classifyCompositeRisk()`.

**Why this matters:** A textbook ACWR pipeline ignores the screening data AIRMS already stores. The composite model integrates **workload + biomechanical profile + injury history** into a single judgement. **This is the FYP innovation.** It is what makes AIRMS more than "a reimplementation of Gabbett's formula in JavaScript."

**Citations to keep:**
- Gabbett (2016). *The training-injury prevention paradox.* Br J Sports Med, 50(5), 273–280.

---

## 7. The body map (locked decisions)

The athlete dashboard renders a front + back muscular silhouette. Implementation in [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx).

**Locked:**
- Path data **adapted from `react-muscle-highlighter` (MIT)** by Sorooj Shehryar. Lives in [frontend/src/components/dashboard/bodymap-data/](../frontend/src/components/dashboard/bodymap-data/). MIT attribution preserved at the top of every file. **This must stay in the FYP references section.**
- **Granularity is aggregated.** The ISN spreadsheet tracks ~26 specific muscles (Vastus Lateralis, Sartorius, Piriformis, etc.). The library renders coarser regions (`quadriceps`, `gluteal`, etc.). AIRMS aggregates AIRMS muscles → library slugs via `AIRMS_TO_SLUG` in [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx). The **flag cards below the figure preserve full granularity** with specific muscle names + sides.
- **Only scoped regions are interactive.** Anything not in the ISN spreadsheet (head, hair, hands, feet, knees, ankles, calves, tibialis, forearm, triceps, lower-back) renders as inert silhouette — no hover, no tooltip, no cursor change. See `SCOPED_SLUGS` in [BodyMap.tsx](../frontend/src/components/dashboard/BodyMap.tsx).
- **Group hover, not per-path hover.** Each region is wrapped in an `<g>` so hovering any segment lights up the whole region.

**Do not** redraw the silhouette by hand or swap to a different asset library without discussion. The current solution was the result of multiple iterations and explicit user approval.

---

## 8. UI design rules (from JC's Figma)

These rules came from JC's Figma mockups and explicit feedback. **Do not deviate without checking with him.**

### Login page

- Split card on cream gradient background (`--brand-navy` left panel, white right panel)
- Card width 760px, min-height 480px, border-radius 14px, drop shadow
- **Left panel**: full logo (`logofull.png`, 210×72), AIRMS heading, ISN address, version footer
- **Right panel**: "Sign in" heading + subtext + email/password form (with show/hide toggle) + "Forgot password" link
- **No role tabs.** The early Figma had an athlete/medical/admin tab strip; the shipped login is a plain email + password form. Role is read from the JWT after login and drives the landing-page redirect (`ROLE_REDIRECTS` in [`app/page.tsx`](../frontend/src/app/page.tsx)). There is nothing for a role tab to do, so it was dropped.

### Sidebar (when logged in)

- Width 256px, navy background (`--brand-navy`)
- **Branding block at top**: `logo1.png` (50×56 sized for clarity) + "AIRMS" title + "SPORTS HEALTH" subtitle in gold
- **Active link state**: solid gold background (`--brand-gold`), navy text, font-weight 600. **Not** semi-transparent gold — solid
- Per-role nav items (do NOT include "My Profile" in sidebar nav — it lives in the topbar dropdown):
  - **athlete**: My Dashboard, Activity Tracking, Injury Reporting
  - **medical**: Athlete Dashboard, Injury Logging, Self-Report Review, Data Uploading
  - **admin**: Injury Analytics, PDF Reports, Data Uploading
- Footer at bottom: "AIRMS Prototype v0.2" in muted small text

### Topbar

- Height 60px, white background, sticky, border-bottom
- **Left**: page title (`<h1 className="topbar-title">`)
- **Right**: stacked "Signed in as / **{Role}**" info, theme toggle button, initials avatar
- **Theme button** is a **rounded rectangle** (8px border-radius, 34×34), NOT a circle
- **Initials avatar** is a 34×34 navy circle with white initials (e.g. "JD" for John Doe, honorifics like "Dr." filtered out via `getInitials()`)
- Click avatar → dropdown with name+role header, "My Profile" link, "Sign out" button. Click outside closes dropdown.

### Color tokens (defined in `globals.css`)

```
--brand-navy:        #0f2c4a   (sidebar bg, primary brand)
--brand-navy-mid:    #1a3f66
--brand-gold:        #f5c518   (active states, accent)
--brand-gold-light:  #ffd86b

--risk-low:          green   — Optimal ACWR band (0.8–1.3)
--risk-moderate:     amber   — Elevated (1.3–1.5)
--risk-high:         red     — High Risk (>1.5)
--risk-undertrained: blue    — Detraining Risk (<0.8)
```

---

## 9. Locked data shapes (do NOT change without migrating data)

### `Activity` (MySQL `activities` table)
```typescript
{
  athleteId: string;          // "ATH0001" format
  date: Date;
  type: 'Strength' | 'Endurance' | 'Speed' | 'Skill' | 'Match' | 'Recovery';
  duration: number;           // minutes, 10–240
  intensity: number;          // RPE 1–10
  load: number;               // auto-computed: duration × intensity (Sequelize hook)
  notes?: string;
}
```

### `Athlete` (MySQL `athletes` table)
- `athleteId` (e.g. `ATH0001`) is the primary key and the cross-table foreign key
- The 8 injury-risk indicators are stored as flat columns and reassembled into a nested `risks` object by the response serialiser
- `myodynamia` and `tension` flags live in the normalised `muscle_flags` table, discriminated by `flag_type`; the serialiser splits them back into two arrays for the frontend
- See [backend/src/models/Athlete.js](../backend/src/models/Athlete.js) and [backend/src/models/MuscleFlag.js](../backend/src/models/MuscleFlag.js)

### `Injury` (MySQL `injuries` table)
- `bodyPart` enum: `Neck`, `Shoulder`, `Spine`, `Lumbar/Pelvis`, `Knee`, `Ankle`, `Hip`, `Elbow`, `Wrist`, `Other`
- `injuryType` enum: `Sprain`, `Strain`, `Tendinitis`, `Bursitis`, `Fracture`, `Contusion`, `Dislocation`, `Other`
- `mechanism` enum: `Contact`, `Non-contact`, `Overuse`, `Recurrent` — **note `Overuse` is a mechanism, not an injuryType**

---

## 10. CORS, ports, and dev orchestration

- Backend always on **port 5000**
- Frontend always on **port 3000** (auto-bumps to 3001 if 3000 is taken — see §11)
- Backend CORS allows both `http://localhost:3000` AND `http://localhost:3001` as a safety net for the auto-bump scenario. Override via `FRONTEND_URL` env var (comma-separated)
- Run both via `npm run dev` from project root (uses `concurrently`)
- Frontend talks to backend via `NEXT_PUBLIC_API_URL` env var (default `http://localhost:5000/api`)

---

## 11. Known dev-environment gotchas

1. **Stale Next.js process holds port 3000** → new instance bumps to 3001 → CORS blocks API calls. Fix: kill stale node processes via PowerShell `Stop-Process -Id <pid> -Force` then restart `npm run dev`.
2. **MySQL password has special characters** (`#`, `$`, `%`, `^`) → wrap the whole value in single quotes in `backend/.env` so `dotenv` doesn't interpret them. e.g. `MYSQL_PASSWORD='ISN123456!@#$%^'`.
3. **Seeder validation errors** if enum values don't match the model. Most common: `'Overuse'` is a `mechanism`, not an `injuryType`. Use `'Other'` for `injuryType` and `BODY_PARTS`.
4. **`npm install` at the root** is required once for `concurrently`. After that, `npm run dev` works from root.
5. **SMTP env not loading** — when you change `SMTP_*` values in `backend/.env`, the running backend keeps using the previously-built mailer transport (cached on first use). Always restart the backend after editing SMTP env vars. If `SMTP_HOST` is empty, the mailer falls back to a console transport that prints the email body to the backend terminal — useful for dev without credentials.
6. **Gmail app password format** — paste it as 16 contiguous characters (the spaces Google shows are visual only). Wrong format manifests as a 535 auth error from Gmail.
7. **HoloMotion PDF ingestion needs a vision provider** — set `VISION_API_KEY` + `VISION_MODEL` (and optionally `VISION_PROVIDER` / `VISION_BASE_URL`) in `backend/.env`. If unset, the PDF uploader self-disables with a config message; the Excel path still works. Provider-agnostic — OpenAI / Qwen / OpenRouter / Ollama (OpenAI-compatible) or Anthropic. See [DESIGN_DECISIONS.md §13](DESIGN_DECISIONS.md#13-excelholomotion-pdf-ingestion-vision-ai).
8. **Do NOT `npm install canvas` (node-canvas)** — it needs a native compiler and fails on this Windows/Node setup. `pdfjs` rendering instead uses an npm alias `canvas` → `@napi-rs/canvas` (a prebuilt binary) declared in `backend/package.json`. Keep the alias; don't replace it with real node-canvas.

---

## 12. Things that must NOT change without discussion

- The 3-role model (athlete / medical / admin)
- The composite risk model formula (`computeVulnerability`, `personalisedThresholds`, escalation logic)
- The sRPE method for load calculation (`load = duration × intensity`)
- The body map asset source and MIT attribution
- The aggregation policy (figure shows regions, cards show specific muscles)
- The Figma-derived UI design (split login card, sidebar branding, topbar dropdown)
- The MySQL schema for `Activity`, `Athlete`, `Injury`, `MuscleFlag`, `SelfReport` (see [backend/src/models/](../backend/src/models/))
- The single-database direction: AIRMS persists to MySQL. The historical MongoDB stack is documented in [MONGO_RECOVERY.md](MONGO_RECOVERY.md) as an emergency restoration path, not a supported alternative
- The ACWR thresholds 0.8 / 1.3 / 1.5 as the baseline (personalised modifiers are ±15% around these)

If JC ever says "redesign the body map" or "let me self-report intensity differently" or "switch to PostgreSQL," ask one clarifying question before acting — these touch FYP-defensibility.

---

## 13. Update protocol

When any of these happens, update this file FIRST, then update code:

- A new role is added or removed
- A new locked decision is made (e.g. choosing a new charting library)
- A cross-feature integration is added
- A module ships or its status changes
- A major conflict between docs is resolved

Do not let this file drift from reality. When code and this doc disagree, fix whichever is wrong — usually the code is correct and this file needs to catch up.

---

*Last updated: 2026-06-11 · All 6 modules functional. Modules 1+2 fully complete; 3–6 have explicit deferred items. Composite risk model + body map locked. Intentional snapshot denormalisation in injuries/self_reports documented in DESIGN_DECISIONS.md §5.*
