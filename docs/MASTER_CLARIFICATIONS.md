# AIRMS — MASTER CLARIFICATIONS

> **Read this FIRST, before any other document except README_FOR_CLAUDE_CODE.md.**
>
> This file is the architectural truth of AIRMS. Locked decisions live here. If a different document or memory entry contradicts this file, **this file wins**.

---

## 1. What AIRMS is (one paragraph)

AIRMS is a web app that helps **Institut Sukan Negara (ISN)** manage and predict injury risk for national-level Malaysian athletes. Athletes log their training; medical staff log injuries and review screenings; admins oversee analytics and data uploads. Built on Next.js / Node.js / MongoDB. Submitted as **JC's Final Year Project** with **Dr Thung** (ISN) as stakeholder and **Dr Hoo Wai Lam** as academic supervisor.

The project is an iteration on a previous HTML prototype (`airms-prototype/`) inherited from prior students Shewin and Keying. AIRMS rebuilds the prototype on a real fullstack codebase and adds new analytical capabilities — most importantly the **composite risk model** (see §6).

---

## 2. The locked tech stack

| Layer | Choice |
|---|---|
| Frontend framework | **Next.js 14 (App Router)** with TypeScript |
| Backend framework | **Node.js + Express** |
| Database | **MongoDB Atlas** (cloud cluster) via **Mongoose** |
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
| **athlete** | `john.doe@isn.gov.my` | `/athlete/dashboard` | Self only — sees own activity, injuries, risk |
| **medical** | `dr.lim@isn.gov.my` | `/medical/dashboard` | All athletes — can log injuries, review self-reports |
| **admin** | `admin@isn.gov.my` | `/admin/dashboard` | Full system — analytics, data uploads, PDF reports |

Seeded demo password is the same for all three (check `backend/src/utils/seeder.js`).

Role gating is done client-side in `frontend/src/components/layout/DashboardLayout.tsx` via the `allowedRoles` prop. Backend enforces RBAC at every protected route via `apps/middleware/rbac.js`.

---

## 4. The 6 FDD modules (authoritative scope)

Per JC's FDD, AIRMS has **exactly 6 modules**. Don't propose new ones.

| # | Module | Primary role | Status |
|---|---|---|---|
| 1 | Activity Tracking & Logging | athlete | ✅ fully complete |
| 2 | Athlete Dashboard / Workload | athlete | ✅ fully complete |
| 3 | Injury & Recovery Logging | medical | 🟢 functional, recovery milestones deferred |
| 4 | Data Management (CSV upload) | admin | 🟡 infrastructure complete, ISN muscle-flag column lock pending |
| 5 | Injury Analytics | admin | ✅ fully complete (live PDF generation via pdfkit) |
| 6 | Medical Dashboard | medical | 🟢 functional, watchlist deferred |

Detailed status and per-module specs: [MODULES_STATUS.md](MODULES_STATUS.md).

JC needs **more than 2 fully working core modules** to score full marks on the Technical Implementation rubric. All six modules are now usable end-to-end. Modules 1+2 are the FYP showcases with no known gaps. Modules 3–6 have explicit deferred items, each tied to either an external dependency (Module 4 → ISN canonical schema) or a polish item that doesn't block system usage.

---

## 5. The ACWR formula (textbook layer)

Acute:Chronic Workload Ratio per Gabbett (2016):

```
session_load (AU) = duration_minutes × RPE (1–10)            [Foster et al., 2001]
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

1. Computes a **vulnerability score** from the athlete's screening data (exercise risk score, mobility, stability, symmetry)
2. **Personalises** the ACWR thresholds based on vulnerability (±~15% swing around the literature baseline)
3. **Escalates** the risk band if active injuries or muscle flags align with the current workload

Lives in [frontend/src/lib/risk.ts](../frontend/src/lib/risk.ts) → `classifyCompositeRisk()`.

**Why this matters:** A textbook ACWR pipeline ignores the screening data AIRMS already stores. The composite model integrates **workload + biomechanical profile + injury history** into a single judgement. **This is the FYP innovation.** It is what makes AIRMS more than "a reimplementation of Gabbett's formula in JavaScript."

**Citations to keep:**
- Foster et al. (2001). *A New Approach to Monitoring Exercise Training.* J Strength Cond Res, 15(1), 109–115.
- Gabbett (2016). *The training-injury prevention paradox.* Br J Sports Med, 50(5), 273–280.

Memory entry tracks this: see [`memory/project_risk_model.md`](../.claude/projects/.../memory/project_risk_model.md).

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
- **Right panel**: heading + subtext + role selector (athlete/medical/admin tabs) + email/password form + "Forgot password" link
- Role tabs are **visual only** — they don't pre-fill credentials. Selecting a role just affects which sidebar/landing page the user sees post-login

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
--risk-undertrained: blue    — Low Workload (<0.8)
```

---

## 9. Locked data shapes (do NOT change without migrating data)

### `Activity` (MongoDB)
```typescript
{
  athleteId: string;          // "ATH0001" format
  date: Date;
  type: 'Strength' | 'Endurance' | 'Speed' | 'Skill' | 'Match' | 'Recovery';
  duration: number;           // minutes, 1–240
  intensity: number;          // RPE 1–10
  load: number;               // auto-computed: duration × intensity
  notes?: string;
}
```

### `Athlete` (MongoDB)
- `athleteId` (e.g. `ATH0001`) is the canonical foreign key — **not** Mongo `_id`
- `myodynamia` and `tension` are arrays of `{ muscle, side }` sub-documents (NOT a flat object)
- See [backend/src/models/Athlete.js](../backend/src/models/Athlete.js)

### `Injury` (MongoDB)
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
2. **MongoDB password has special characters** → must be URL-encoded in `MONGO_URI`. `ISN123456!@#$%^` → `ISN123456%21%40%23%24%25%5E`.
3. **Seeder validation errors** if enum values don't match the model. Most common: `'Overuse'` is a `mechanism`, not an `injuryType`. Use `'Other'` for `injuryType` and `BODY_PARTS`.
4. **`npm install` at the root** is required once for `concurrently`. After that, `npm run dev` works from root.

---

## 12. Things that must NOT change without discussion

- The 3-role model (athlete / medical / admin)
- The composite risk model formula (`computeVulnerability`, `personalisedThresholds`, escalation logic)
- The sRPE method for load calculation (`load = duration × intensity`)
- The body map asset source and MIT attribution
- The aggregation policy (figure shows regions, cards show specific muscles)
- The Figma-derived UI design (split login card, sidebar branding, topbar dropdown)
- The MongoDB schema for `Activity`, `Athlete`, `Injury`
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

*Last updated: 2026-05-17 · All 6 modules functional. Modules 1+2 fully complete; 3–6 have explicit deferred items (ISN schema, PDF renderer, watchlist). Composite risk model + react-muscle-highlighter body map locked. Audit-driven fixes applied to Modules 1+2 (week-bucket year-boundary fix, threshold inversion clamp, defensive date parsing, deletingId guard, toast timer leak).*
