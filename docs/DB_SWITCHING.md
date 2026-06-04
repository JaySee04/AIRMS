# Switching between MongoDB and MySQL

> Both persistence layers are wired and runnable from the `feat/mysql-migration` branch. This doc is the quick-reference for flipping between them.
>
> The Mongo path is the canonical one on `main`. The MySQL path was built as a parallel stack with the goal of being a drop-in replacement (frontend untouched — a serialiser layer aliases `id → _id` and reassembles Athlete's nested shape).

---

## TL;DR — the swap

| Driver | Backend script | Backend port | `frontend/.env.local` |
|---|---|---|---|
| **MongoDB** (default) | `npm run dev` (from `backend/`) | `5000` | `NEXT_PUBLIC_API_URL=http://localhost:5000/api` |
| **MySQL** | `npm run dev:sql` (from `backend/`) | `5001` | `NEXT_PUBLIC_API_URL=http://localhost:5001/api` |

Restart the **frontend** after editing `.env.local` — Next.js bakes env vars at boot.

---

## Full swap procedure

### → Switch to MySQL

```powershell
# 1. Stop the Mongo backend if it's running (Ctrl+C in its terminal).

# 2. Point the frontend at the SQL backend
# Edit frontend/.env.local — change the port to 5001:
NEXT_PUBLIC_API_URL=http://localhost:5001/api

# 3. (Re)seed MySQL if you've never run it or want fresh data
cd backend
npm run seed:sql

# 4. Start the SQL backend
npm run dev:sql
# Expect: "MySQL connected: localhost:3306/airms"
#         "AIRMS backend (SQL) running on port 5001"

# 5. In a separate terminal, restart the frontend
cd frontend
npm run dev
```

### → Switch back to MongoDB

```powershell
# 1. Stop the SQL backend (Ctrl+C).

# 2. Edit frontend/.env.local — change the port to 5000:
NEXT_PUBLIC_API_URL=http://localhost:5000/api

# 3. Start the Mongo backend
cd backend
npm run dev
# Expect: "MongoDB connected: <atlas-host>"

# 4. Restart the frontend
cd frontend
npm run dev
```

### → "I want them both running side-by-side"

The backends are on different ports (5000 vs 5001) so they coexist. But the frontend can only talk to one — whichever is in `.env.local` wins. Use this when you want to curl both backends to compare responses while the frontend remains stable on one.

---

## Where each driver's data lives

| Aspect | MongoDB | MySQL |
|---|---|---|
| Host | MongoDB Atlas cloud cluster | Local MySQL 8.x (`localhost:3306`) |
| Connection string | `MONGO_URI` in `backend/.env` | `MYSQL_*` vars in `backend/.env` |
| GUI inspector | MongoDB Compass (not installed) | MySQL Workbench |
| Data shape | Documents with `_id` ObjectIds, embedded arrays | Normalised tables, integer `id` PKs, `muscle_flags` join table |
| Re-seed command | `npm run seed` | `npm run seed:sql` |

Both seeders use the **same deterministic PRNG (seed=42)** so the demo data is structurally identical — ATH0001 is John Doe with the same scores, the same curated training window, the same 3 injuries.

---

## Frontend code is identical between drivers

The SQL backend's `utils/serialize.js` does the compat work:

- Sequelize's numeric `id` is aliased to `_id` (stringified) on every response, so React keys and existing `_id` references in the frontend don't change.
- `Athlete`'s flat `neck_injury_risk`, `shoulder_injury_risk`, etc. columns are reassembled into the nested `risks: { ... }` object the Mongoose model exposed.
- `muscle_flags` rows are split by `flag_type` back into `myodynamia[]` and `tension[]` arrays.
- `DECIMAL` columns come back as JS numbers (via `dialectOptions.decimalNumbers: true` in `db-sql.js`) so `risk.ts` numeric comparisons don't silently break.

Net effect: **the frontend never knows which backend it's talking to.** Same `/api/...` URLs, same response shapes, same JWT auth.

---

## Branch hygiene

- `main` — Mongo-only state. Safe to check out at any time to "go back to the baseline." Does NOT contain `models-sql/`, `routes-sql/`, `seeder-sql.js`, etc.
- `feat/mysql-migration` — superset of main. Contains both stacks side-by-side. Mongo code on this branch is byte-identical to `main`.

To go back to a Mongo-only world: `git checkout main`. Nothing else needed.

To resume MySQL work: `git checkout feat/mysql-migration`.

---

## Common gotchas

### 1. `Access denied for user 'root'@'localhost' (using password: YES)`
Your `MYSQL_PASSWORD` in `backend/.env` has a `#`, `$`, or other special character that `dotenv` is interpreting. Wrap the value in single quotes:

```
MYSQL_PASSWORD='ISN123456!@#$%^'
```

### 2. `Frontend still calls localhost:5000` after editing `.env.local`
Next.js bakes `NEXT_PUBLIC_*` vars at process start. You must **stop and restart `npm run dev`** in `frontend/` — HMR doesn't pick up env changes.

### 3. `ERR_CONNECTION_REFUSED` on `/api/...`
The backend you point at isn't running. Check:
- `curl http://localhost:5001/api/health` (SQL) or `curl http://localhost:5000/api/health` (Mongo)
- Look for the "running on port…" log line in the backend terminal

### 4. Port already in use after killing a process
If `npm run dev:sql` says "EADDRINUSE: address already in use :::5001", another node process holds the port:

```powershell
Get-NetTCPConnection -LocalPort 5001 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### 5. Mongo Atlas TLS handshake error in VS Code
The integrated terminal can leak `ELECTRON_RUN_AS_NODE=1` to child processes which breaks TLS. The root-level `npm run dev` already strips this via `scripts/dev.js`. If you bypass that wrapper, run `Remove-Item env:ELECTRON_RUN_AS_NODE` first.

### 6. MySQL re-seed clears UI-created data
`npm run seed:sql` does `sequelize.sync({ force: true })` which drops all tables. Anything you added through the UI is gone. Same applies to `npm run seed` for Mongo (it calls `deleteMany({})`).

---

## When does the switch matter for FYP defence?

- **For FYP I viva (current):** Mongo is the demo. The MySQL stack exists as evidence that the database choice was deliberate (not "vague") and that the migration is planned for ISN's production deployment.
- **For FYP II:** If ISN confirms MySQL as the production target, this branch becomes `main` and the Mongo code is retired.

See [`MYSQL_MIGRATION_PLAN.md`](MYSQL_MIGRATION_PLAN.md) for the full migration design rationale and [`DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) §5 for the panel-feedback defence framing.

---

*Created 2026-06-04. Update whenever a new persistence-level decision is made.*
