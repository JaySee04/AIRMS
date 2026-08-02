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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { connectDB, sequelize } = require('./config/db');
require('./models'); // register models + associations

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const athleteRoutes = require('./routes/athletes');
const uploadRoutes = require('./routes/upload');
const exportRoutes = require('./routes/export');
const coachRoutes = require('./routes/coach');
const cohortRoutes = require('./routes/cohorts');
const screeningRoutes = require('./routes/screenings');
const screeningReportRoutes = require('./routes/screeningReports');

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim());

// Security headers. crossOriginResourcePolicy is relaxed to cross-origin
// because the frontend (a different origin) fetches streamed PDF reports from
// this API; CORS still governs who may call the API. Other helmet defaults
// (HSTS, noSniff, frameguard, etc.) apply unchanged.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Throttle the auth surface (login / password-reset / OTP) to blunt brute-force
// and credential-stuffing — the one set of endpoints an unauthenticated caller
// can hit repeatedly.
//
// skipSuccessfulRequests: only FAILED responses (>= 400) count toward the
// limit. This is the important bit for how AIRMS is actually used — a demo runs
// off one laptop (one IP) and logs in and out across four roles many times, all
// SUCCESSFULLY; those must never be throttled. Brute-force / credential-stuffing
// is a stream of FAILURES, which is exactly what we cap. 30 failed attempts /
// 15 min / IP leaves room for the odd fat-fingered password while still
// stopping automated guessing. Trust the proxy hop count via app config if this
// ever sits behind one (none in the current single-host setup).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many failed attempts. Please wait a few minutes and try again.' },
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/athletes', athleteRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/cohorts', cohortRoutes);
app.use('/api/screenings', screeningRoutes);
app.use('/api/screening-reports', screeningReportRoutes);

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

  const server = app.listen(PORT, () => console.log(`AIRMS backend running on port ${PORT}`));

  // Turn a port clash (a previous instance still holding the port, a deploy
  // overlap, or something else already on PORT) into a clear message + clean
  // exit, instead of an unhandled 'error' event that crashes cryptically. That
  // unhandled error is what made restarts "sticky" — a transient conflict
  // became a hard crash that only a code change could recover from.
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use — another AIRMS instance is probably still running. Stop it (or set a different PORT) and restart.`);
    } else {
      console.error('HTTP server error:', err.message);
    }
    process.exit(1);
  });

  // Graceful shutdown: stop accepting new connections, close the DB pool, then
  // exit — so restarts and deploys drain in-flight requests and release the
  // port promptly. Orchestrators (Docker/PM2/systemd/K8s) send SIGTERM on stop;
  // without this the process is killed mid-request and the port can linger,
  // which is exactly what causes the next start to collide.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received — shutting down gracefully…`);
    setTimeout(() => { console.error('Draining timed out; forcing exit.'); process.exit(1); }, 10000).unref();
    server.close(async () => {
      try { await sequelize.close(); } catch { /* pool may already be closed */ }
      console.log('AIRMS backend stopped cleanly.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
