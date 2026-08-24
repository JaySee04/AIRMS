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
const auditRoutes = require('./routes/audit');
const { startScheduler, stopScheduler } = require('./utils/scheduler');
const screeningRoutes = require('./routes/screenings');
const screeningReportRoutes = require('./routes/screeningReports');
const isnRoutes = require('./routes/isn');

const app = express();

const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map((s) => s.trim());

// Security headers. crossOriginResourcePolicy is relaxed to cross-origin
// because the frontend (a different origin) fetches streamed PDF reports from
// this API; CORS still governs who may call the API. Other helmet defaults
// (HSTS, noSniff, frameguard, etc.) apply unchanged.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
// Expose Content-Disposition so the frontend PDF downloader can read the
// server-set report filename (the single source of truth for report naming).
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true, exposedHeaders: ['Content-Disposition'] }));
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

// GET /api/health — liveness, and a deliberate touch of the database.
//
// It touches the database on purpose. A health check that queries nothing
// answers 200 while the database is unreachable, which is the one moment it
// exists for.
//
// Unauthenticated, and returns nothing about anybody: an ok flag and whether the
// database answered. Its job is to be safe to call from outside.
//
// Aiven's free tier powers the database off when it sees no activity, which
// takes the site down and silently stops the monthly mail. A free uptime pinger
// calling this every 15 minutes counts as activity. See DEPLOY.md.
//
// SELECT 1 rather than a model query: it proves the pool can reach the server
// without depending on any table existing, so a schema problem reports itself
// elsewhere rather than as "unhealthy" here.
app.get('/api/health', async (_req, res) => {
  try {
    await sequelize.query('SELECT 1');
    res.json({ ok: true, db: 'up' });
  } catch (err) {
    // 503, not 500: the app is fine, its dependency is not — and an uptime
    // monitor should read this as "down" so a sleeping database is visible
    // rather than being reported as a healthy service.
    res.status(503).json({ ok: false, db: 'down', detail: err.message });
  }
});

// GET / — a service descriptor, because the API's root is a URL people land on.
//
// Everything here mounts under /api, so `/` had no handler and Express answered
// its default HTML 404. That is correct, and it reads as an outage: it is what
// Vercel screenshots for the deployment tile, and what a supervisor or the
// stakeholder sees if they click the API link rather than the web app. "Cannot
// GET /" was twice mistaken for a broken deployment during setup.
//
// Says what the service is and where to check it, and deliberately nothing else
// — no version, no environment, no dependency state. It is unauthenticated, so
// it gets the same treatment as /api/health: enough to identify the service,
// nothing that helps anyone attack it. The liveness answer stays at /api/health,
// which actually touches the database; this one must never imply health it has
// not checked.
app.get('/', (_req, res) => {
  res.json({
    service: 'AIRMS API',
    description: 'Athlete Injury Risk Management System — Institut Sukan Negara',
    health: '/api/health',
    app: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',')[0] : undefined,
  });
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
app.use('/api/isn', isnRoutes);
app.use('/api/audit', auditRoutes);

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

// Serverless (Vercel) imports this module for its Express app and never listens
// on a port: the platform owns the socket and hands each request to the exported
// handler. Listening there would bind nothing and start a scheduler interval
// inside a function that is frozen between invocations.
//
// Same shape as utils/seeder.js, which has guarded on require.main since
// 2026-08-19 for the same reason — importing a module should not start work.
module.exports = app;

async function start() {
  await connectDB();
  if (process.env.SQL_SYNC === '1') {
    await sequelize.sync();
    console.log('Sequelize sync complete (tables created if missing).');
  }

  const server = app.listen(PORT, () => console.log(`AIRMS backend running on port ${PORT}`));

  // Monthly digest (§16). Hourly tick against a persisted month marker rather
  // than a cron instant, so a process that was down when the report came due
  // sends it late instead of never. See utils/scheduler.js.
  startScheduler();

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
    stopScheduler();
    setTimeout(() => { console.error('Draining timed out; forcing exit.'); process.exit(1); }, 10000).unref();
    server.close(async () => {
      try { await sequelize.close(); } catch { /* pool may already be closed */ }
      console.log('AIRMS backend stopped cleanly.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Only when this file IS the program. `require`d — by the Vercel handler, or by
// a test — it just hands back the app.
if (require.main === module) start();
