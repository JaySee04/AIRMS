const { Sequelize } = require('sequelize');

// MySQL connection for the parallel SQL stack.
// Mongo path remains the source of truth on `main`; this exists so the
// MySQL migration can be developed and demoed side-by-side until the
// switchover decision is made before viva.
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
    // return DECIMAL columns as JS numbers, matching Mongoose's behaviour.
    dialectOptions: {
      decimalNumbers: true,
    },
    define: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
    },
  }
);

const connectSqlDB = async () => {
  try {
    await sequelize.authenticate();
    console.log(`MySQL connected: ${sequelize.config.host}:${sequelize.config.port}/${sequelize.config.database}`);
  } catch (err) {
    console.error(`MySQL connection error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = { sequelize, connectSqlDB };
