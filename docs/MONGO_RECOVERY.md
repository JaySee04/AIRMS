> **Last-resort document.** Created at the moment AIRMS dropped MongoDB as a persistence option. The MySQL stack is now the only stack on the working tree. **You should not need this file.** It exists so that, if ISN ever reverses direction or an FYP II reviewer asks "could you have stayed on Mongo?", the answer is "yes, here is exactly how."

# Restoring the MongoDB stack — emergency procedure

## TL;DR

1. The complete MongoDB stack is preserved on the `main` branch and at commit **`917ab35`** on `feat/mysql-migration` (the last commit where both stacks lived side-by-side).
2. To get a working Mongo-only AIRMS in five minutes, `git checkout main`. Nothing else needed.
3. To cherry-pick just the Mongo files back onto the current tree, see [§ Cherry-pick restore](#cherry-pick-restore) below.

---

## Why MySQL won

Recorded so a future reader doesn't re-litigate the decision:

- **ISN's production environment standardises on MySQL.** Deploying to ISN's infrastructure requires the relational stack regardless.
- **FYP I review panel feedback** flagged document storage as "highly questionable" for a clinical-record system, citing ACID and foreign-key concerns. The MySQL stack addresses these at the engine level.
- **The dual-stack maintenance cost was real.** Two seeders, two route trees, two model trees, two test surfaces — and only one of them was going to be deployed.
- **The serialisation shim in [`backend/src/utils/serialize.js`](../backend/src/utils/serialize.js)** demonstrates that the frontend never needed to know which database it was talking to. Once that was true, keeping both backends in the tree had no remaining technical justification.

The original document-store rationale (hierarchical screening data, athlete-scoped reads, FHIR precedent) was not wrong — it was simply outweighed by the deployment target.

---

## What was removed in the cutover

| Path | What it was | Replaced by |
|---|---|---|
| `backend/src/server.js` (old) | Express entry that bootstrapped Mongoose | `backend/src/server.js` (now the MySQL entry, renamed from `server-sql.js`) |
| `backend/src/config/db.js` (old) | Mongoose `mongoose.connect()` wrapper | `backend/src/config/db.js` (now Sequelize, renamed from `db-sql.js`) |
| `backend/src/models/` (old) | 5 Mongoose schemas: `Activity`, `Athlete`, `Injury`, `SelfReport`, `User` | `backend/src/models/` (now Sequelize models, renamed from `models-sql/`) |
| `backend/src/routes/` (old) | 7 Mongo-backed route files | `backend/src/routes/` (now MySQL-backed, renamed from `routes-sql/`) |
| `backend/src/middleware/auth.js` (old) | JWT verify + `User.findById()` (Mongoose) | `backend/src/middleware/auth.js` (now `User.findByPk()`, renamed from `auth-sql.js`) |
| `backend/src/utils/seeder.js` (old) | Mongo seeder with deterministic PRNG (seed=42) | `backend/src/utils/seeder.js` (now Sequelize seeder, renamed from `seeder-sql.js`) |
| `backend/scripts/populate-demo-activities.js` | Mongo-only demo-data helper | Deleted; SQL seeder produces equivalent data |
| `mongoose` npm dependency | ODM | Removed from `backend/package.json` |
| `mongodb` npm dependency (root) | Driver leftover | Removed from root `package.json` |
| `MONGO_URI` env var | Atlas connection string | Removed from `backend/.env` and `.env.example`; replaced by `MYSQL_*` vars |
| `npm run dev:sql`, `npm run seed:sql`, `npm run start:sql` | Parallel scripts during dual-stack period | Renamed to `npm run dev`, `npm run seed`, `npm run start` |
| `docs/DB_SWITCHING.md` | Mongo ↔ MySQL swap procedure | Replaced by this file |
| `PORT_SQL=5001` env var | SQL backend's separate port | Consolidated; backend listens on `PORT=5000` |

The serialiser shim ([`backend/src/utils/serialize.js`](../backend/src/utils/serialize.js)) was **kept**: it still aliases Sequelize's numeric `id` to a string `_id` field so that frontend components built against the original Mongoose shape continue to work without edits. The `_id` field name is the only remaining Mongo idiom on the wire; it is a stable string identifier from the frontend's point of view, with no engine semantics behind it.

---

## Restore option A — switch the whole branch (recommended)

```powershell
git checkout main
cd backend
# main still has Mongoose in package.json; reinstall:
npm install
# populate MONGO_URI in backend/.env
npm run seed
npm run dev   # serves Mongo backend on :5000

# In another terminal:
cd frontend
# point .env.local back at port 5000:
#   NEXT_PUBLIC_API_URL=http://localhost:5000/api
npm run dev
```

This gets you the byte-identical Mongo stack as of the last `main` commit. No surgery required.

## Restore option B — cherry-pick the Mongo files onto a MySQL-current tree {#cherry-pick-restore}

Use this if you want **both** stacks again (e.g. to re-run a comparison during FYP II viva prep):

```powershell
# Source-of-truth commit for the dual stack:
git checkout 917ab35 -- backend/src/server.js \
                         backend/src/config/db.js \
                         backend/src/models/ \
                         backend/src/routes/ \
                         backend/src/middleware/auth.js \
                         backend/src/utils/seeder.js \
                         backend/scripts/populate-demo-activities.js \
                         docs/DB_SWITCHING.md
```

After checkout, you will have naming collisions with the current MySQL stack (e.g. two `backend/src/server.js`). The dual-stack convention was:

- Mongo entry: `backend/src/server.js` on port 5000
- MySQL entry: `backend/src/server-sql.js` on port 5001 (and `routes-sql/`, `models-sql/`, etc.)

To re-create that layout from the current MySQL-only tree, you'd need to rename today's `server.js → server-sql.js`, `routes/ → routes-sql/`, `models/ → models-sql/`, `config/db.js → config/db-sql.js`, `middleware/auth.js → middleware/auth-sql.js`, `utils/seeder.js → utils/seeder-sql.js`, and update every `require()` path inside those files to match. Then drop the restored Mongo files into the now-vacant canonical names.

This is doable but tedious. **Restore option A is almost always the right answer.** Cherry-picking is only worth it if you've made substantial MySQL-only changes since the cutover that you don't want to lose.

---

## Restoring `mongoose` to `package.json`

If you go with restore option B, you also need to bring back the runtime dependency:

```jsonc
// backend/package.json — dependencies
"mongoose": "^8.4.0"
```

Then:

```powershell
cd backend
npm install
```

The MongoDB driver listed at the root `package.json` (`"mongodb": "^7.2.0"`) was never actually imported anywhere — it can be safely ignored.

---

## Where the historical context lives

- [`docs/MYSQL_MIGRATION_PLAN.md`](MYSQL_MIGRATION_PLAN.md) — the migration design document. Captures the column-by-column mapping from Mongoose embedded documents to normalised MySQL tables. Still useful if you ever need to understand *why* the SQL schema looks the way it does.
- [`docs/DESIGN_DECISIONS.md`](DESIGN_DECISIONS.md) § 5 — the panel-feedback defence framing. Now rewritten as MySQL-only, but the rejected-alternatives section preserves the Mongo rationale for viva voce.
- [`docs/fyp/`](fyp/) — FYP I report and slides. These were written against the Mongo stack and are historical artefacts; do not retroactively edit them.

---

## Cutover provenance

- Cutover happened: **2026-06-05**
- Last commit with the dual stack: **`917ab35`** (`docs: sync to reality — dual persistence story`)
- First commit of the MySQL-only era: the commit that removed `backend/src/models/`, `backend/src/routes/`, `backend/src/config/db.js`, and `mongoose` from `backend/package.json`. Find it with:

  ```powershell
  git log --all --diff-filter=D --name-only -- backend/src/models/Athlete.js
  ```

If you are reading this file and the Mongo stack is *still* not findable in `git log`, something has gone very wrong — the project's git history has been rewritten or pruned. In that case the [`main` branch](https://github.com/JaySee11/AIRMS) on GitHub is the authoritative remote copy.
