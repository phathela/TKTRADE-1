const { Pool } = require('pg');
const config = require('../config');

let pool = null;
let dbAvailable = false;
let dbReadyPromise = null;
let dbReadyResolve = null;
let dbReadyReject = null;

// Reconnection state
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
let reconnectTimer = null;
let reconnectAttempts = 0;

/**
 * Attempt to verify the pool can reach Postgres. On success, marks the
 * database as available and resets the backoff counter. On failure,
 * schedules the next attempt using exponential backoff (1 s → 30 s).
 */
function attemptReconnect() {
  if (!pool) return;

  pool.query('SELECT 1')
    .then(() => {
      reconnectAttempts = 0;
      reconnectTimer = null;
      if (!dbAvailable) {
        dbAvailable = true;
        console.log('Database reconnected successfully');
      }
    })
    .catch((err) => {
      reconnectAttempts += 1;
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * Math.pow(2, reconnectAttempts - 1),
        RECONNECT_MAX_DELAY_MS,
      );
      console.warn(
        `Database reconnect attempt ${reconnectAttempts} failed: ${err.message}. ` +
        `Retrying in ${delay / 1000}s…`,
      );
      reconnectTimer = setTimeout(attemptReconnect, delay);
    });
}

/**
 * Called when the pool emits an error (e.g. a client is terminated
 * unexpectedly). Marks the database unavailable and kicks off the
 * reconnection loop if one is not already running.
 */
function handlePoolError(err) {
  console.error('PostgreSQL pool error:', err.message);
  dbAvailable = false;
  if (!reconnectTimer) {
    reconnectAttempts = 0;
    reconnectTimer = setTimeout(attemptReconnect, RECONNECT_BASE_DELAY_MS);
  }
}

if (config.databaseUrl) {
  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', handlePoolError);

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
      // Begin reconnection loop so the app recovers once Postgres is ready
      if (!reconnectTimer) {
        reconnectAttempts = 0;
        reconnectTimer = setTimeout(attemptReconnect, RECONNECT_BASE_DELAY_MS);
      }
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
