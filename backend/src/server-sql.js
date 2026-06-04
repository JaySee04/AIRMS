// Parallel entry point for the MySQL stack. Runs alongside src/server.js
// (the Mongo entry) on the feat/mysql-migration branch so both persistence
// layers can be developed and demoed side-by-side until the switch decision.
//
// npm run dev:sql  → start this with nodemon
// npm run seed:sql → run the SQL seeder (separate file)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectSqlDB, sequelize } = require('./config/db-sql');
require('./models-sql'); // register models + associations

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim());

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes will be ported one-by-one into backend/src/routes-sql/ and mounted
// here. For now only /api/health is exposed so we can verify the MySQL
// connection end-to-end before porting any business logic.
app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  driver: 'mysql',
  timestamp: new Date(),
}));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT_SQL || process.env.PORT || 5001;

(async () => {
  await connectSqlDB();
  // `sync` creates tables that don't exist; safe for dev. In production we'd
  // run migrations explicitly. `alter: true` would adjust existing columns
  // but is risky — left off intentionally.
  if (process.env.SQL_SYNC === '1') {
    await sequelize.sync();
    console.log('Sequelize sync complete (tables created if missing).');
  }
  app.listen(PORT, () => console.log(`AIRMS backend (SQL) running on port ${PORT}`));
})();
