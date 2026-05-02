const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const config = require('./config');
const { runMigrations } = require('./db/migrations');
const { isAvailable, waitForDb } = require('./db');
const { setupSocket } = require('./socket');
const bybitWS = require('./services/bybitWebSocket');
const alertEngine = require('./services/alertEngine');

// Route imports
const candlesRouter = require('./routes/candles');
const indicatorsRouter = require('./routes/indicators');
const alertsRouter = require('./routes/alerts');
const backtestRouter = require('./routes/backtest');
const strategiesRouter = require('./routes/strategies');
const webhookRouter = require('./routes/webhook');
const marketRouter = require('./routes/market');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: isAvailable() ? 'connected' : 'unavailable',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/candles', candlesRouter);
app.use('/api/indicators', indicatorsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/alert-logs', alertsRouter);
app.use('/api/backtest', backtestRouter);
app.use('/api/strategies', strategiesRouter);
app.use('/api/webhook', webhookRouter);
app.use('/api/market', marketRouter);

// Serve frontend in production
if (config.nodeEnv === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Socket.io setup
setupSocket(io);

// Start server
async function start() {
  try {
    // Wait for database connection test to complete
    await waitForDb();

    // Try migrations, don't fail if DB not available
    try {
      await runMigrations();
    } catch (err) {
      console.warn('Migrations skipped:', err.message);
    }

    // Start Bybit WebSocket connection
    bybitWS.connect();

    // Subscribe to default ticker
    bybitWS.subscribeTicker('BTCUSDT');

    // Try loading alerts (works only if DB available)
    try {
      await alertEngine.loadAlerts();
      alertEngine.start();
    } catch (err) {
      console.warn('Alert engine skipped:', err.message);
    }

    server.listen(config.port, () => {
      console.log(`TKTRADE backend running on port ${config.port} (${config.nodeEnv})`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    // Don't crash on startup - let the health check report issues
    server.listen(config.port, () => {
      console.log(`TKTRADE backend running on port ${config.port} (degraded mode)`);
    });
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  bybitWS.disconnect();
  alertEngine.stop();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  bybitWS.disconnect();
  alertEngine.stop();
  server.close(() => process.exit(0));
});

start();
