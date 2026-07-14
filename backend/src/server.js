// AIRMS backend entry point. Express + Sequelize against MySQL.
//
//   npm run dev   → start with nodemon
//   npm run seed  → drop and reseed all tables
//
// Every response goes through utils/serialize.js, which aliases Sequelize's
// numeric `id` to a string `_id` for frontend consumers and reassembles the
// Athlete nested risks/myodynamia/tension shape.
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connectDB, sequelize } = require('./config/db');
require('./models'); // register models + associations

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const athleteRoutes = require('./routes/athletes');
const injuryRoutes = require('./routes/injuries');
const activityRoutes = require('./routes/activities');
const selfReportRoutes = require('./routes/selfReports');
const uploadRoutes = require('./routes/upload');
const reportRoutes = require('./routes/reports');
const exportRoutes = require('./routes/export');
const recoveryBaselineRoutes = require('./routes/recoveryBaselines');
const coachRoutes = require('./routes/coach');
const cohortRoutes = require('./routes/cohorts');
const screeningRoutes = require('./routes/screenings');

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim());

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/athletes', athleteRoutes);
app.use('/api/injuries', injuryRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/self-reports', selfReportRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/recovery-baselines', recoveryBaselineRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/cohorts', cohortRoutes);
app.use('/api/screenings', screeningRoutes);

app.get('/api/health', (_req, res) => res.json({
  status: 'ok',
  driver: 'mysql',
  timestamp: new Date(),
}));

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

(async () => {
  await connectDB();
  if (process.env.SQL_SYNC === '1') {
    await sequelize.sync();
    console.log('Sequelize sync complete (tables created if missing).');
  }
  app.listen(PORT, () => console.log(`AIRMS backend running on port ${PORT}`));
})();
