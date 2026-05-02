require('dotenv').config();

// Build DATABASE_URL from Railway's individual PG* variables as fallback
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    return `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD || '')}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`;
  }
  return null;
}

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: resolveDatabaseUrl(),
  bybit: {
    apiKey: process.env.BYBIT_API_KEY || '',
    apiSecret: process.env.BYBIT_API_SECRET || '',
    wsUrl: 'wss://stream.bybit.com/v5/public/linear',
    restUrl: 'https://api.bybit.com',
  },
  jwtSecret: process.env.JWT_SECRET || 'tktrade-dev-secret',
};
