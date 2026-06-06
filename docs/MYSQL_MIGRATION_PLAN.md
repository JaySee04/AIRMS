# AIRMS — MySQL Migration Plan

> **Status: EXECUTED (2026-06-05).** AIRMS now runs MySQL-only — see [DESIGN_DECISIONS.md §5](DESIGN_DECISIONS.md#5-mysql-with-sequelize-single-persistence-layer). The MongoDB stack has been removed; recovery procedure is in [MONGO_RECOVERY.md](MONGO_RECOVERY.md).
>
> This document is kept as the historical migration design record — it explains *why* the MySQL schema looks the way it does (column choices, the `muscle_flags` discriminator pattern, the serialiser shim). Useful for anyone asking how the relational schema maps to the original document layout.

---

## 1. Decision context

- ISN's production environment uses MySQL — Dr Thung confirmed verbally (2026-06).
- Panel feedback on the FYP I draft flagged MongoDB as a "highly questionable architectural choice" citing ACID and FK concerns.
- Decision (2026-06-05): execute the migration now rather than after FYP I, so the demonstrated system matches the deployment target and the panel's concerns are answered structurally rather than rhetorically.

## 2. Tooling choices

| Choice | Selected | Rejected | Reason |
|---|---|---|---|
| ORM | **Sequelize** | Prisma, raw `mysql2` | Mongoose-like model + hooks API; lowest-friction port from existing code. Prisma would force a schema-first rewrite mid-FYP. |
| Driver | **mysql2** | mysql (deprecated) | Promise-native, used by Sequelize internally. |
| Local engine | **MySQL Community Server 8.x** | MariaDB, Docker-only | Matches ISN's likely production target; native Windows installer. |
| Hosting (FYP II) | TBD — **Railway / PlanetScale / ISN local** | — | Decide once ISN confirms production infra. |
| Migrations | **sequelize-cli** | Hand-rolled SQL | Tracks schema drift, supports rollback. |

## 3. Relational schema mapping

The non-trivial design call is how to relationalise the `myodynamia[]` and `tension[]` sub-document arrays on `Athlete`. Below is the proposed mapping.

### 3.1 Tables

```sql
users (
  id            INT PK AUTO_INCREMENT,
  email         VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('athlete','medical','admin') NOT NULL,
  name          VARCHAR(120) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

athletes (
  id            INT PK AUTO_INCREMENT,
  athlete_id    VARCHAR(16) UNIQUE NOT NULL,         -- "ATH0001" canonical FK
  user_id       INT NULL FK → users(id),
  name          VARCHAR(120) NOT NULL,
  age           INT,
  sex           ENUM('Male','Female'),
  gender        VARCHAR(32),
  weight_kg     DECIMAL(5,2),
  height_cm     DECIMAL(5,2),
  sport         VARCHAR(64),
  programme     VARCHAR(64),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

athlete_screenings (
  id                    INT PK AUTO_INCREMENT,
  athlete_id            VARCHAR(16) NOT NULL FK → athletes(athlete_id),
  overall_activity      DECIMAL(5,2),
  mobility              DECIMAL(5,2),
  stability             DECIMAL(5,2),
  symmetry              DECIMAL(5,2),
  injury_risk_index     DECIMAL(5,2),
  neck_risk             DECIMAL(5,2),
  shoulder_risk         DECIMAL(5,2),
  scoliosis             DECIMAL(5,2),
  disc_herniation       DECIMAL(5,2),
  lumbar_pelvis_risk    DECIMAL(5,2),
  joint_pain            DECIMAL(5,2),
  knee_risk             DECIMAL(5,2),
  ankle_risk            DECIMAL(5,2),
  recorded_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_athlete_recorded (athlete_id, recorded_at)
);

muscle_flags (
  id           INT PK AUTO_INCREMENT,
  athlete_id   VARCHAR(16) NOT NULL FK → athletes(athlete_id),
  flag_type    ENUM('myodynamia','tension') NOT NULL,
  muscle       VARCHAR(64) NOT NULL,
  side         ENUM('L','R','B') NOT NULL,
  recorded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_athlete_type (athlete_id, flag_type)
);

activities (
  id          INT PK AUTO_INCREMENT,
  athlete_id  VARCHAR(16) NOT NULL FK → athletes(athlete_id),
  date        DATE NOT NULL,
  type        ENUM('Strength','Endurance','Speed','Skill','Match','Recovery') NOT NULL,
  duration    INT NOT NULL,
  intensity   INT NOT NULL,
  load        INT NOT NULL,                          -- duration × intensity (set by hook)
  notes       TEXT,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_athlete_date (athlete_id, date)
);

injuries (
  id               INT PK AUTO_INCREMENT,
  athlete_id       VARCHAR(16) NOT NULL FK → athletes(athlete_id),
  body_part        ENUM('Neck','Shoulder','Spine','Lumbar/Pelvis','Knee','Ankle','Hip','Elbow','Wrist','Other') NOT NULL,
  injury_type      ENUM('Sprain','Strain','Tendinitis','Bursitis','Fracture','Contusion','Dislocation','Other') NOT NULL,
  side             ENUM('Left','Right','Both','N/A') NOT NULL,
  mechanism        ENUM('Contact','Non-contact','Overuse','Recurrent') NOT NULL,
  severity         ENUM('Minor','Moderate','Severe') NOT NULL,
  onset_date       DATE NOT NULL,
  recovery_status  ENUM('Recovering','Recovered','Chronic') NOT NULL,
  recovery_date    DATE NULL,
  clinical_notes   TEXT,
  created_by       INT NULL FK → users(id),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_athlete_onset (athlete_id, onset_date),
  INDEX idx_body_part (body_part),
  INDEX idx_injury_type (injury_type)
);

self_reports (
  id               INT PK AUTO_INCREMENT,
  athlete_id       VARCHAR(16) NOT NULL FK → athletes(athlete_id),
  body_part        ENUM(...) NOT NULL,                  -- same enum as injuries
  injury_type      ENUM(...) NOT NULL,
  side             ENUM('Left','Right','Both','N/A') NOT NULL,
  mechanism        ENUM('Contact','Non-contact','Overuse','Recurrent') NOT NULL,
  severity         ENUM('Minor','Moderate','Severe') NOT NULL,
  onset_date       DATE NOT NULL,
  description      TEXT,
  status           ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  reviewer_notes   TEXT,
  reviewed_by      INT NULL FK → users(id),
  reviewed_at      DATETIME NULL,
  promoted_injury_id INT NULL FK → injuries(id),        -- traceability after promotion
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status)
);
```

### 3.2 Schema notes for the viva

- **Foreign keys** are enforced at the engine level (`InnoDB`), satisfying the panel's "FK constraint" objection.
- **`athlete_id` (VARCHAR) is kept as the FK** to preserve the `ATH0001` canonical identifier used across the system and seeded data. The internal `INT id` exists for join efficiency only.
- **`muscle_flags` collapses myodynamia + tension into one table** discriminated by `flag_type`. Cleaner than two parallel tables; the current Mongoose model treats them as parallel arrays of the same `{muscle, side}` shape.
- **`athlete_screenings` is history-capable** — each upload appends a new row. This is the relational upgrade path for the "screening history" item Dr Thung mentioned for re-upload semantics ([MODULES_STATUS.md §4](MODULES_STATUS.md)).
- **`Activity.load` is computed in a Sequelize `beforeValidate` hook**, replacing the Mongoose pre-save hook one-for-one.

## 4. Phased migration plan

Total estimate: **7–10 working days** focused effort, 14 days realistic.

### Phase 0 — Setup (0.5 day)
- Install MySQL 8 + MySQL Workbench on dev box
- `npm install sequelize mysql2 sequelize-cli` in `backend/`
- Add `DATABASE_URL` to `backend/.env`
- Create local DB + user

### Phase 1 — Schema + models (1.5 days)
- Initialise sequelize-cli: `npx sequelize-cli init` in `backend/`
- Write the seven models in `backend/src/models/` mirroring the Mongoose structure (User, Athlete, AthleteScreening, MuscleFlag, Activity, Injury, SelfReport)
- Define associations (`hasMany`, `belongsTo`)
- Port the `Activity.load` pre-save hook to Sequelize `beforeValidate`
- Generate first migration

### Phase 2 — Seeder (1 day)
- Rewrite `backend/src/utils/seeder.js` to use Sequelize
- Cross-table seeding requires explicit ordering: users → athletes → athlete_screenings → muscle_flags → activities → injuries → self_reports
- Wrap seed in a transaction so partial failures roll back
- Verify deterministic output matches current MongoDB seed (same athlete count, same screening profile for ATH0001)

### Phase 3 — Routes (3–4 days)
Port in this order, smallest risk first:
1. **Auth + users** (0.25 day) — minimal change
2. **Athletes routes** (0.5 day) — fetch with screening + flags requires eager `include`
3. **Activities routes + ACWR** (0.5 day) — ACWR aggregation is straightforward `GROUP BY week`
4. **Self-reports + cross-table promotion** (0.5 day) — wrap promotion in a transaction
5. **Injuries + analytics summary** (1.5 days) — **highest risk**, the 8-filter aggregation needs careful porting
6. **Reports PDF** (0.25 day) — only the data fetch changes
7. **Screening upload (preview + commit)** (1 day) — upsert becomes `findOrCreate` + sub-table replacement inside a transaction

### Phase 4 — Frontend reconciliation (0.5–1 day)
- API responses no longer have `_id` — change to `id` (or have backend serialiser return `_id` for transitional compat)
- Verify [risk.ts](../frontend/src/lib/risk.ts) still receives the expected athlete shape after the join unfolds — if `myodynamia` / `tension` arrays are flattened from the join, may need response-shape touch-ups
- Verify body map flag rendering still works
- Verify [admin/dashboard](../frontend/src/app/admin/dashboard/page.tsx) analytics filters still produce the same KPI numbers

### Phase 5 — Manual QA (1–2 days)
Click through every flow across all three roles. Critical regression surfaces:
- Modules 1 + 2 (audit-fixed showcases — must be byte-identical in behaviour)
- Composite risk model (`classifyCompositeRisk()` output unchanged)
- Analytics 8-filter combinations
- Self-report → injury promotion
- Screening upload preview vs commit parity

## 5. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Composite risk model output drifts due to athlete response-shape change | Medium | **High** — this is the FYP differentiator | Lock the API response shape before porting; snapshot-test the `classifyCompositeRisk()` output for ATH0001 pre/post |
| Analytics aggregation regression (KPI counts wrong after port) | Medium | High | Side-by-side compare KPI counts MongoDB vs MySQL with same seed |
| Modules 1 + 2 break | Low | **Critical** — audit-fixed, viva-showcase | Don't touch frontend logic, only response-shape adapters |
| sequelize-cli migration drift between dev / submission machine | Medium | Medium | Commit `migrations/` directory; document `npx sequelize-cli db:migrate` in setup |
| Loss of seeded demo data continuity | Low | Medium | Re-run seeder before every demo; same seed=42 PRNG |
| Encoding issues with MySQL `utf8` vs `utf8mb4` | Low | Low | Set DB charset to `utf8mb4` from the start |

## 6. Rollback plan

If the migration breaks Modules 1+2 or the composite risk model close to viva:
- Migration is on a branch (`feat/mysql-migration`) — never on `main`
- `main` retains the working MongoDB build until the MySQL branch passes manual QA
- Worst case: revert by switching git branch + restoring `backend/.env` MongoDB connection string

## 7. What stays the same

- All frontend pages, components, styling, body map asset, charts
- Auth flow + JWT
- PDF generation library (`pdfkit`)
- CSV upload parsing logic (only the persistence call changes)
- Composite risk model logic in `risk.ts` (assuming response shape preserved)
- All 6 module URL paths and user-visible behaviours

## 8. What changes for FYP defensibility

After migration, update:
- [DESIGN_DECISIONS.md §5](DESIGN_DECISIONS.md) — rewrite as "MySQL chosen for ISN production alignment + relational integrity"
- [MASTER_CLARIFICATIONS.md §2](MASTER_CLARIFICATIONS.md) — update locked tech stack table
- FYP report Chapter 5 — replace MongoDB section
- Viva talking point: *"Relational integrity at the engine level. FK constraints between athletes, activities, injuries, and screenings. ACID transactions on the self-report-to-injury promotion. Aligns with ISN's production MySQL deployment."*

---

*Created: 2026-06-04. Not yet executed. Trigger only after explicit decision by JC + Dr Hoo.*
