const { Sequelize } = require('sequelize');
// Sequelize resolves its dialect driver with a DYNAMIC require, which a
// bundler's static analysis cannot see. On Vercel that means mysql2 is traced
// out of the function and every cold start dies with "Please install mysql2
// package manually" — at module scope, so before any route runs.
//
// Requiring it here makes the dependency visible to the tracer, and passing it
// as `dialectModule` means Sequelize uses this instance rather than trying to
// resolve its own. Harmless locally, load-bearing when deployed.
const mysql2 = require('mysql2');

// Managed MySQL (Aiven, TiDB Cloud, Railway, RDS) requires TLS; a local dev
// server does not have it. Off unless asked for, so nothing changes for the
// laptop setup.
//
// MYSQL_SSL_CA takes the provider's CA certificate as inline PEM rather than a
// file path, because that is the only shape a platform environment variable can
// carry — there is no filesystem to put a .pem on in a serverless deployment.
// Without the CA, verification is left ON against the system trust store; a
// provider using its own CA will fail loudly there rather than quietly
// downgrading to an unverified connection.
function sslOptions() {
  if (process.env.MYSQL_SSL !== '1' && process.env.MYSQL_SSL !== 'true') return {};
  const ca = process.env.MYSQL_SSL_CA;
  return {
    ssl: {
      // Escape hatch for a provider whose chain cannot be verified. Deliberately
      // separate and deliberately named: turning verification off should look
      // like a decision in the environment, not a default.
      rejectUnauthorized: process.env.MYSQL_SSL_INSECURE !== '1',
      ...(ca ? { ca: ca.replace(/\\n/g, '\n') } : {}),
    },
  };
}

// Serverless runs many short-lived instances, each with its OWN pool, against a
// single connection ceiling — Aiven's free MySQL allows 76. Five per instance
// exhausts that at fifteen concurrent instances, which a demo can reach. Two
// keeps the same ceiling ~38 instances away while still allowing a little
// concurrency inside one request.
const POOL_MAX = Number(process.env.MYSQL_POOL_MAX)
  || (process.env.VERCEL ? 2 : 5);

// MySQL connection for AIRMS. ISN's production environment standardises on
// MySQL, so this is the only persistence layer the system supports.
const sequelize = new Sequelize(
  process.env.MYSQL_DATABASE || 'airms',
  process.env.MYSQL_USER || 'root',
  process.env.MYSQL_PASSWORD || '',
  {
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    dialect: 'mysql',
    dialectModule: mysql2,
    logging: process.env.SQL_LOG === '1' ? console.log : false,
    // mysql2 returns DECIMAL as strings by default. The composite risk model
    // in frontend/src/lib/risk.ts compares these as numbers and would break
    // (e.g. "10.4" > 15 is falsy). decimalNumbers: true tells mysql2 to
    // return DECIMAL columns as JS numbers.
    dialectOptions: {
      ...sslOptions(),
      decimalNumbers: true,
      // Keep pooled sockets alive so MySQL's idle timeout doesn't silently drop a
      // connection the pool later hands out dead — the likely cause of "the app
      // stops working after sitting idle". mysql2 passes these to the socket.
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    },
    // Evict idle connections before MySQL's wait_timeout can kill them, and cap
    // how long a connection may sit unused.
    pool: {
      max: POOL_MAX,
      min: 0,
      acquire: 30000,
      idle: 10000,
      evict: 15000,
    },
    // Transparently retry a query if the connection was reset/lost while idle,
    // instead of surfacing a hard error on the first request after a quiet spell.
    retry: {
      max: 3,
      match: [
        /ETIMEDOUT/, /ECONNRESET/, /PROTOCOL_CONNECTION_LOST/,
        /Connection lost/i, /read ECONNRESET/, / EPIPE/,
      ],
    },
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  }
);

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`MySQL connected: ${sequelize.config.host}:${sequelize.config.port}/${sequelize.config.database}`);
  } catch (err) {
    console.error(`MySQL connection error: ${err.message}`);
    // Exiting is right for a long-running process: fail loudly at boot rather
    // than serve a broken API. It is wrong on serverless, where the "process"
    // is one request — killing it turns a transient database blip into an
    // opaque platform error, and there is no supervisor to restart into a
    // healthy state. Throwing lets the request 500 and the next invocation try
    // again with a fresh connection.
    if (process.env.VERCEL) throw err;
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
