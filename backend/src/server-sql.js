// Parallel entry point for the MySQL stack. Runs alongside src/server.js
// (the Mongo entry) on the feat/mysql-migration branch so both persistence
// layers can be developed and demoed side-by-side until the switch decision.
//
//   npm run dev:sql  → start this with nodemon
//   npm run seed:sql → run the SQL seeder (separate file)
//
// Frontend stays unmodified: every response goes through utils/serialize.js
// which aliases id → _id and re-assembles Athlete's nested risks/myodynamia/
// tension shape.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectSqlDB, sequelize } = require('./config/db-sql');
require('./models-sql'); // register models + associations

const authRoutes = require('./routes-sql/auth');
const athleteRoutes = require('./routes-sql/athletes');
const injuryRoutes = require('./routes-sql/injuries');
const activityRoutes = require('./routes-sql/activities');
const selfReportRoutes = require('./routes-sql/selfReports');
const uploadRoutes = require('./routes-sql/upload');
const reportRoutes = require('./routes-sql/reports');

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim());

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/athletes', athleteRoutes);
app.use('/api/injuries', injuryRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/self-reports', selfReportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  driver: 'mysql',
  timestamp: new Date(),
}));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT_SQL || 5001;

(async () => {
  await connectSqlDB();
  if (process.env.SQL_SYNC === '1') {
    await sequelize.sync();
    console.log('Sequelize sync complete (tables created if missing).');
  }
  app.listen(PORT, () => console.log(`AIRMS backend (SQL) running on port ${PORT}`));
})();
