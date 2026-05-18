# AIRMS — Athlete Injury Risk Management System

A web application for **Institut Sukan Negara (ISN)** Malaysia to predict and manage injury risk among national-level athletes. Final-year project by **JC** with **Dr Thung** (ISN) as stakeholder and **Dr Hoo Wai Lam** as academic supervisor.

> **Looking for context, design decisions, or technical details?** Everything is in [`docs/`](docs/). Start with [`docs/README_FOR_CLAUDE_CODE.md`](docs/README_FOR_CLAUDE_CODE.md) if you're a new Claude Code session, or [`docs/MASTER_CLARIFICATIONS.md`](docs/MASTER_CLARIFICATIONS.md) for the architectural truth.

---

## Quick start

```powershell
# First time only
npm install            # installs concurrently at root
npm run install:all    # installs deps in root + backend + frontend
npm run seed           # seeds MongoDB Atlas with sample data

# Daily use
npm run dev            # starts backend (:5000) + frontend (:3000) in one terminal
```

Then open <http://localhost:3000>.

### Demo credentials

| Role | Email | Password |
|---|---|---|
| Athlete | `john.doe@isn.gov.my` | `password123` |
| Medical | `dr.lim@isn.gov.my` | `password123` |
| Admin | `admin@isn.gov.my` | `password123` |

---

## Stack

- **Frontend:** Next.js 14 (App Router) · TypeScript · Chart.js · plain CSS with variables
- **Backend:** Node.js · Express · Mongoose · JWT auth
- **Database:** MongoDB Atlas (cloud)
- **Body map:** path data from [`react-muscle-highlighter`](https://github.com/soroojshehryar/react-muscle-highlighter) (MIT, by Sorooj Shehryar), aggregated to ISN regions

---

## Module status (as of 2026-05-17)

| # | Module | Status |
|---|---|---|
| 1 | Activity Tracking & Logging | ✅ fully complete |
| 2 | Athlete Dashboard / Workload | ✅ fully complete |
| 3 | Injury & Recovery Logging | 🟢 functional (recovery milestones deferred) |
| 4 | Data Management | 🟡 infrastructure complete (ISN muscle-flag column lock pending) |
| 5 | Injury Analytics | ✅ fully complete (live PDF generation) |
| 6 | Medical Dashboard | 🟢 functional (watchlist deferred) |

All six modules are usable end-to-end. Full per-module specs and deferred items: [`docs/MODULES_STATUS.md`](docs/MODULES_STATUS.md).

---

## The FYP differentiator (composite risk model)

AIRMS does not apply textbook Gabbett ACWR bands to every athlete. The risk model **personalises** ACWR thresholds based on the athlete's screening data (exercise risk score, mobility, stability, symmetry) and **escalates** the risk band when active injuries or muscle flags align with the current workload.

Citations:
- Foster et al. (2001). *A New Approach to Monitoring Exercise Training.* J Strength Cond Res, 15(1).
- Gabbett (2016). *The training-injury prevention paradox.* Br J Sports Med, 50(5).

Implementation: [`frontend/src/lib/risk.ts`](frontend/src/lib/risk.ts).
Why this matters: [`docs/DESIGN_DECISIONS.md §2`](docs/DESIGN_DECISIONS.md#2-composite-risk-model-fyp-differentiator).

---

## Folder tour

```
.
├── airms-prototype/          Original HTML prototype (reference only)
├── assets/                   Original source logos
├── backend/                  Node + Express + Mongoose API
├── docs/                     Project documentation (start here)
│   ├── stakeholder/          Meeting transcripts
│   └── data-samples/         ISN data samples
├── frontend/                 Next.js 14 app (TypeScript)
├── reports/                  FYP I report + future submissions
└── README.md                 You are here
```

---

## Acknowledgements

- **Dr Thung** (ISN) — stakeholder requirements
- **Dr Hoo Wai Lam** — academic supervisor
- **Shewin** and **Keying** — prior student work that this project iterates on
- **Sorooj Shehryar** — `react-muscle-highlighter` body map paths (MIT)
