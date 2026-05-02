const { query } = require('./index');

const MIGRATIONS = [
  // Candles/storage for historical data
  `CREATE TABLE IF NOT EXISTS candles (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    interval VARCHAR(5) NOT NULL,
    open_time BIGINT NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume DOUBLE PRECISION NOT NULL,
    turnover DOUBLE PRECISION DEFAULT 0,
    UNIQUE(symbol, interval, open_time)
  )`,
  // Alerts
  `CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    symbol VARCHAR(20) NOT NULL DEFAULT 'BTCUSDT',
    condition_type VARCHAR(50) NOT NULL,
    condition_config JSONB NOT NULL DEFAULT '{}',
    options JSONB NOT NULL DEFAULT '{}',
    webhook_url TEXT,
    webhook_message TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`,
  // Backtest results
  `CREATE TABLE IF NOT EXISTS backtest_results (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    interval VARCHAR(5) NOT NULL,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    strategy_type VARCHAR(50) NOT NULL,
    strategy_config JSONB DEFAULT '{}',
    total_trades INTEGER DEFAULT 0,
    win_rate DOUBLE PRECISION DEFAULT 0,
    total_pnl DOUBLE PRECISION DEFAULT 0,
    total_pnl_percent DOUBLE PRECISION DEFAULT 0,
    max_drawdown DOUBLE PRECISION DEFAULT 0,
    sharpe_ratio DOUBLE PRECISION DEFAULT 0,
    trades JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  // User strategies
  `CREATE TABLE IF NOT EXISTS strategies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'custom',
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  // Triggered alerts log
  `CREATE TABLE IF NOT EXISTS alert_log (
    id SERIAL PRIMARY KEY,
    alert_id UUID REFERENCES alerts(id) ON DELETE CASCADE,
    symbol VARCHAR(20),
    condition_type VARCHAR(50),
    trigger_value DOUBLE PRECISION,
    message_sent TEXT,
    status VARCHAR(20) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT NOW()
  )`,
  // Create indexes
  `CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(symbol, interval, open_time DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)`,
  `CREATE INDEX IF NOT EXISTS idx_alert_log_alert_id ON alert_log(alert_id)`,
];

async function runMigrations() {
  console.log('Running database migrations...');
  for (const sql of MIGRATIONS) {
    try {
      await query(sql);
    } catch (err) {
      console.error('Migration error:', err.message);
    }
  }
  console.log('Migrations complete.');
}

module.exports = { runMigrations };
