require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  bybit: {
    apiKey: process.env.BYBIT_API_KEY || '',
    apiSecret: process.env.BYBIT_API_SECRET || '',
    wsUrl: 'wss://stream.bybit.com/v5/public/linear',
    restUrl: 'https://api.bybit.com',
  },
  jwtSecret: process.env.JWT_SECRET || 'tktrade-dev-secret',
};
