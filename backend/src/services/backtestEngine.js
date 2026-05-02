const { query } = require('../db');
const indicatorEngine = require('./indicatorEngine');
const strategyParser = require('./strategyParser');

class BacktestEngine {
  async run(params) {
    const { symbol, interval, startTime, endTime, strategyType, strategyConfig } = params;

    // Fetch historical candles
    const rows = await query(
      `SELECT * FROM candles WHERE symbol=$1 AND interval=$2 AND open_time>=$3 AND open_time<=$4 ORDER BY open_time ASC`,
      [symbol, interval, startTime, endTime]
    );
    const ohlc = indicatorEngine.toOHLC(rows.rows);

    if (ohlc.length < 50) {
      throw new Error(`Not enough data (${ohlc.length} candles). Need at least 50.`);
    }

    let trades, equity;

    if (strategyType === 'custom' && strategyConfig.code) {
      // Parse and execute custom strategy
      const strategyFn = strategyParser.parse(strategyConfig.code);
      ({ trades, equity } = this._executeStrategy(ohlc, strategyFn, strategyConfig));
    } else {
      // Use built-in strategy based on indicators
      ({ trades, equity } = this._executeBuiltinStrategy(ohlc, strategyType, strategyConfig));
    }

    const metrics = this._calculateMetrics(ohlc, trades, equity);

    // Save results
    const result = await query(
      `INSERT INTO backtest_results (symbol, interval, start_time, end_time, strategy_type, strategy_config,
        total_trades, win_rate, total_pnl, total_pnl_percent, max_drawdown, sharpe_ratio, trades)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
      [symbol, interval, startTime, endTime, strategyType, JSON.stringify(strategyConfig || {}),
       metrics.totalTrades, metrics.winRate, metrics.totalPnl, metrics.totalPnlPercent,
       metrics.maxDrawdown, metrics.sharpeRatio, JSON.stringify(trades)]
    );

    return { ...metrics, trades, id: result.rows[0].id };
  }

  _executeStrategy(ohlc, strategyFn, config) {
    const trades = [];
    let position = null;
    const equity = [{ time: ohlc[0].time, value: config.initialCapital || 10000 }];
    let capital = config.initialCapital || 10000;

    for (let i = 50; i < ohlc.length; i++) {
      const slice = ohlc.slice(0, i + 1);
      let signal;
      try {
        signal = strategyFn(slice);
      } catch (e) {
        continue;
      }

      if (signal === 'buy' && !position) {
        position = { entryTime: ohlc[i].time, entryPrice: ohlc[i].close, size: capital / ohlc[i].close };
      } else if (signal === 'sell' && position) {
        const exitValue = position.size * ohlc[i].close;
        const entryValue = position.size * position.entryPrice;
        const pnl = exitValue - entryValue;
        trades.push({
          entryTime: position.entryTime,
          exitTime: ohlc[i].time,
          entryPrice: position.entryPrice,
          exitPrice: ohlc[i].close,
          size: position.size,
          pnl,
          pnlPercent: (pnl / entryValue) * 100,
          type: 'long',
        });
        capital += pnl;
        position = null;
        equity.push({ time: ohlc[i].time, value: capital });
      }
    }

    // Close any open position
    if (position) {
      const exitPrice = ohlc[ohlc.length - 1].close;
      const exitValue = position.size * exitPrice;
      const entryValue = position.size * position.entryPrice;
      const pnl = exitValue - entryValue;
      trades.push({
        entryTime: position.entryTime,
        exitTime: ohlc[ohlc.length - 1].time,
        entryPrice: position.entryPrice,
        exitPrice,
        size: position.size,
        pnl,
        pnlPercent: (pnl / entryValue) * 100,
        type: 'long',
      });
      capital += pnl;
      equity.push({ time: ohlc[ohlc.length - 1].time, value: capital });
    }

    return { trades, equity };
  }

  _executeBuiltinStrategy(ohlc, strategyType, config) {
    const close = ohlc.map(c => c.close);
    const trades = [];
    let position = null;
    const capital = config.initialCapital || 10000;
    const equity = [{ time: ohlc[0].time, value: capital }];
    let currentCapital = capital;

    // SMA crossover strategy
    if (strategyType === 'sma_crossover') {
      const fast = indicatorEngine.SMA(close, config.fastPeriod || 10);
      const slow = indicatorEngine.SMA(close, config.slowPeriod || 30);

      for (let i = 1; i < ohlc.length; i++) {
        if (fast[i] === null || slow[i] === null) continue;
        const prevFast = fast[i - 1], prevSlow = slow[i - 1];
        if (prevFast <= prevSlow && fast[i] > slow[i] && !position) {
          position = { entryTime: ohlc[i].time, entryPrice: ohlc[i].close, size: currentCapital / ohlc[i].close };
        } else if (prevFast >= prevSlow && fast[i] < slow[i] && position) {
          const exitValue = position.size * ohlc[i].close;
          const entryValue = position.size * position.entryPrice;
          const pnl = exitValue - entryValue;
          trades.push({
            entryTime: position.entryTime, exitTime: ohlc[i].time,
            entryPrice: position.entryPrice, exitPrice: ohlc[i].close,
            size: position.size, pnl, pnlPercent: (pnl / entryValue) * 100, type: 'long',
          });
          currentCapital += pnl;
          position = null;
          equity.push({ time: ohlc[i].time, value: currentCapital });
        }
      }
    }

    // RSI strategy
    if (strategyType === 'rsi_reversal') {
      const rsi = indicatorEngine.RSI(close, config.period || 14);
      const overbought = config.overbought || 70;
      const oversold = config.oversold || 30;

      for (let i = 1; i < ohlc.length; i++) {
        if (rsi[i] === null || rsi[i - 1] === null) continue;
        if (rsi[i - 1] <= oversold && rsi[i] > oversold && !position) {
          position = { entryTime: ohlc[i].time, entryPrice: ohlc[i].close, size: currentCapital / ohlc[i].close };
        } else if (rsi[i - 1] >= overbought && rsi[i] < overbought && position) {
          const exitValue = position.size * ohlc[i].close;
          const entryValue = position.size * position.entryPrice;
          const pnl = exitValue - entryValue;
          trades.push({
            entryTime: position.entryTime, exitTime: ohlc[i].time,
            entryPrice: position.entryPrice, exitPrice: ohlc[i].close,
            size: position.size, pnl, pnlPercent: (pnl / entryValue) * 100, type: 'long',
          });
          currentCapital += pnl;
          position = null;
          equity.push({ time: ohlc[i].time, value: currentCapital });
        }
      }
    }

    // MACD strategy
    if (strategyType === 'macd_crossover') {
      const macd = indicatorEngine.MACD(close, config.fastPeriod || 12, config.slowPeriod || 26, config.signalPeriod || 9);
      for (let i = 2; i < ohlc.length; i++) {
        if (macd.macdLine[i] === null || macd.signalLine[i] === null ||
            macd.macdLine[i - 1] === null || macd.signalLine[i - 1] === null) continue;
        if (macd.macdLine[i - 1] <= macd.signalLine[i - 1] && macd.macdLine[i] > macd.signalLine[i] && !position) {
          position = { entryTime: ohlc[i].time, entryPrice: ohlc[i].close, size: currentCapital / ohlc[i].close };
        } else if (macd.macdLine[i - 1] >= macd.signalLine[i - 1] && macd.macdLine[i] < macd.signalLine[i] && position) {
          const exitValue = position.size * ohlc[i].close;
          const entryValue = position.size * position.entryPrice;
          const pnl = exitValue - entryValue;
          trades.push({
            entryTime: position.entryTime, exitTime: ohlc[i].time,
            entryPrice: position.entryPrice, exitPrice: ohlc[i].close,
            size: position.size, pnl, pnlPercent: (pnl / entryValue) * 100, type: 'long',
          });
          currentCapital += pnl;
          position = null;
          equity.push({ time: ohlc[i].time, value: currentCapital });
        }
      }
    }

    // Close open position
    if (position) {
      const exitPrice = ohlc[ohlc.length - 1].close;
      const exitValue = position.size * exitPrice;
      const entryValue = position.size * position.entryPrice;
      const pnl = exitValue - entryValue;
      trades.push({
        entryTime: position.entryTime, exitTime: ohlc[ohlc.length - 1].time,
        entryPrice: position.entryPrice, exitPrice,
        size: position.size, pnl, pnlPercent: (pnl / entryValue) * 100, type: 'long',
      });
      currentCapital += pnl;
      equity.push({ time: ohlc[ohlc.length - 1].time, value: currentCapital });
    }

    return { trades, equity };
  }

  _calculateMetrics(ohlc, trades, equity) {
    const totalTrades = trades.length;
    if (totalTrades === 0) {
      return { totalTrades: 0, winRate: 0, totalPnl: 0, totalPnlPercent: 0, maxDrawdown: 0, sharpeRatio: 0, equity };
    }

    const winningTrades = trades.filter(t => t.pnl > 0).length;
    const winRate = (winningTrades / totalTrades) * 100;
    const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
    const startCapital = equity[0]?.value || 10000;
    const totalPnlPercent = (totalPnl / startCapital) * 100;

    // Max drawdown
    let peak = equity[0]?.value || startCapital;
    let maxDrawdown = 0;
    for (const e of equity) {
      if (e.value > peak) peak = e.value;
      const dd = ((peak - e.value) / peak) * 100;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    // Sharpe ratio (using daily returns from equity curve)
    const returns = [];
    for (let i = 1; i < equity.length; i++) {
      returns.push((equity[i].value - equity[i - 1].value) / equity[i - 1].value);
    }
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const stdReturn = returns.length > 1
      ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1))
      : 0.001;
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(365) : 0;

    return { totalTrades, winRate, totalPnl, totalPnlPercent, maxDrawdown, sharpeRatio, equity };
  }

  async getHistory() {
    const result = await query('SELECT * FROM backtest_results ORDER BY created_at DESC LIMIT 20');
    return result.rows;
  }
}

module.exports = new BacktestEngine();
