const { Pool } = require('pg');
const config = require('../config');

let pool = null;
let dbAvailable = false;
let dbReadyPromise = null;
let dbReadyResolve = null;
let dbReadyReject = null;

if (config.databaseUrl) {
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
    dbAvailable = false;
  });

  // Test connection — store promise so server can await it on startup
  dbReadyPromise = new Promise((resolve, reject) => {
    dbReadyResolve = resolve;
    dbReadyReject = reject;
  });

  pool.query('SELECT 1')
    .then(() => {
      dbAvailable = true;
      console.log('Database connected');
      dbReadyResolve();
    })
    .catch((err) => {
      console.warn('Database unavailable:', err.message);
      console.warn('App will run without persistence (charting works, alerts/backtest will not save)');
      dbAvailable = false;
      dbReadyResolve(); // resolve anyway so server starts in degraded mode
    });
} else {
  console.warn('No DATABASE_URL configured. Database features disabled.');
  console.warn('Set DATABASE_URL or PGHOST/PGUSER/PGDATABASE env vars to enable persistence.');
  // No DB is fine — resolve immediately
  dbReadyPromise = Promise.resolve();
}

/**
 * Wait for the database connection test to complete.
 * Resolves even if the DB is unavailable (degraded mode).
 */
async function waitForDb() {
  await dbReadyPromise;
}

async function query(text, params) {
  if (!pool || !dbAvailable) {
    throw new Error('Database not available');
  }
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (config.nodeEnv === 'development' && duration > 100) {
    console.log('Slow query:', { text: text.substring(0, 80), duration });
  }
  return result;
}

function isAvailable() {
  return dbAvailable;
}

module.exports = { pool, query, isAvailable, waitForDb };
