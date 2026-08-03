const { Sequelize } = require('sequelize');

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
    logging: process.env.SQL_LOG === '1' ? console.log : false,
    // mysql2 returns DECIMAL as strings by default. The composite risk model
    // in frontend/src/lib/risk.ts compares these as numbers and would break
    // (e.g. "10.4" > 15 is falsy). decimalNumbers: true tells mysql2 to
    // return DECIMAL columns as JS numbers.
    dialectOptions: {
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
      max: 5,
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
    process.exit(1);
  }
};

module.exports = { sequelize, connectDB };
